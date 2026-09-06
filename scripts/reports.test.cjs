const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

test('destination search sorts by recency, ignores accents and keeps the input unchanged', () => {
  const { filterReportOptions } = load('utils/reportSelection.ts', {});
  const rows = [
    { id: 'old', name: 'Viaggio Berlino', updatedAt: '2026-04-01' },
    { id: 'new', name: 'Viaggio Forlì', updatedAt: '2026-05-01' },
  ];
  assert.deepEqual(filterReportOptions(rows, '', '', '').map(row => row.id), ['new', 'old']);
  assert.deepEqual(filterReportOptions(rows, 'FORLI', '', '').map(row => row.id), ['new']);
  assert.equal(rows[0].id, 'old');
});

test('destination period filtering uses inclusive overlap and excludes undated reports', () => {
  const { filterReportOptions } = load('utils/reportSelection.ts', {});
  const rows = [
    { id: 'a', name: 'A', startDate: '2026-04-01', endDate: '2026-04-10' },
    { id: 'b', name: 'B', startDate: '2026-04-10', endDate: '2026-04-20' },
    { id: 'c', name: 'C' },
  ];
  assert.equal(filterReportOptions(rows, '', '', '').length, 3);
  assert.deepEqual(filterReportOptions(rows, '', '2026-04-10', '2026-04-10').map(row => row.id), ['a', 'b']);
  assert.deepEqual(filterReportOptions(rows, '', '2026-04-11', '').map(row => row.id), ['b']);
  assert.equal(filterReportOptions(rows, '', '2026-05-01', '2026-04-01').length, 0);
});

test('destination dates preserve local calendar days and tolerate missing dates', () => {
  const { reportDateKey, filterReportOptions } = load('utils/reportSelection.ts', {});
  assert.equal(reportDateKey(new Date(2026, 3, 10)), '2026-04-10');
  assert.equal(reportDateKey('2026-04-10T00:00:00.000Z'), '2026-04-10');
  assert.equal(reportDateKey('invalid'), '');
  assert.equal(reportDateKey(null), '');
  assert.equal(filterReportOptions([{ id: 'a', name: 'A', endDate: '2026-04-10' }], '', '2026-04-10', '').length, 1);
});

function load(relative, mocks) {
  const file = path.join(__dirname, '..', relative);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', 'console', code)(
    name => { if (name in mocks) return mocks[name]; throw new Error(`Unexpected dependency: ${name}`); },
    module, module.exports, { log() {}, warn() {}, error() {} },
  );
  return module.exports;
}

async function fixture(t) {
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  const args = values => values.length === 1 && Array.isArray(values[0]) ? values[0] : values;
  const adapter = {
    execAsync: async sql => sqlite.exec(sql),
    runAsync: async (sql, ...values) => sqlite.prepare(sql).run(...args(values)),
    getFirstAsync: async (sql, ...values) => sqlite.prepare(sql).get(...args(values)) || null,
    getAllAsync: async (sql, ...values) => sqlite.prepare(sql).all(...args(values)),
    withExclusiveTransactionAsync: async task => {
      sqlite.exec('BEGIN');
      try { await task(adapter); sqlite.exec('COMMIT'); }
      catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  };
  const db = load('services/database.ts', { 'expo-sqlite': {} }).databaseManager;
  db.db = adapter;
  db.setCurrentUserId('user-1');
  await db.createTables();
  await db.runMigrations();
  const from = await db.createExpenseReport({ title: 'A', is_archived: false, sync_status: 'synced', server_id: 'server-a' });
  const to = await db.createExpenseReport({ title: 'B', is_archived: false, sync_status: 'pending' });
  const id = await db.createExpense({ expense_report_id: from, amount: 12, currency: 'GBP', receipt_date: '2026-09-01',
    merchant_name: 'Cafe', merchant_address: 'Address', receipt_image_path: 'receipt.jpg', is_archived: false, sync_status: 'pending' });
  return { db, sqlite, adapter, from, to, id };
}

test('moving offline changes the only expense row and queues its latest destination', async t => {
  const { db, sqlite, from, to, id } = await fixture(t);
  await db.moveExpense(id, to);
  assert.equal((await db.getExpensesByReportId(from, true)).length, 0);
  const rows = await db.getExpensesByReportId(to, true);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, id);
  assert.equal(rows[0].amount, 12);
  assert.equal(rows[0].receipt_image_path, 'receipt.jpg');
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM expenses').get().n, 1);
  const queue = (await db.getSyncQueue()).filter(item => item.record_id === id);
  assert.equal(JSON.parse(queue.at(-1).data).expense_report_id, to);
});

test('pending move survives a pull from the old server report', async t => {
  const { db, from, to, id } = await fixture(t);
  await db.attachExpenseServerId(id, 'server-expense');
  await db.moveExpense(id, to);
  await db.upsertExpenseFromServer({ id: 'server-expense', amount: 99, receipt_date: '2026-09-01' }, from);
  const row = await db.getExpenseById(id);
  assert.equal(row.expense_report_id, to);
  assert.equal(row.amount, 12);
  assert.equal(row.sync_status, 'pending');
});

test('a failed queue write rolls back the offline move', async t => {
  const { db, adapter, from, to, id } = await fixture(t);
  const run = adapter.runAsync;
  adapter.runAsync = async (sql, ...args) => {
    if (sql.includes('INSERT INTO sync_queue')) throw new Error('disk full');
    return run(sql, ...args);
  };
  await assert.rejects(db.moveExpense(id, to), /disk full/);
  assert.equal((await db.getExpenseById(id)).expense_report_id, from);
});

test('a server move updates the existing local row without duplicating it', async t => {
  const { db, sqlite, to, id } = await fixture(t);
  const old = await db.getExpenseById(id);
  await db.acknowledgeSync('expenses', id, old.updated_at, 'server-expense');
  await db.upsertExpenseFromServer({ id: 'server-expense', amount: 12, receipt_date: '2026-09-01' }, to);
  assert.equal((await db.getExpenseById(id)).expense_report_id, to);
  assert.equal((await db.getExpenseById(id)).receipt_image_path, 'receipt.jpg');
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM expenses').get().n, 1);
});

test('pull after a lost create response links the original local expense', async t => {
  const { db, sqlite, from, id } = await fixture(t);
  await db.upsertExpenseFromServer({ id: 'server-expense', local_id: id, amount: 12 }, from);
  assert.equal((await db.getExpenseById(id)).server_id, 'server-expense');
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM expenses').get().n, 1);
});

test('pull reuses the pending default report instead of creating a second default', async t => {
  const { db, sqlite } = await fixture(t);
  const id = await db.getDefaultReportId();
  const linked = await db.upsertExpenseReportFromServer({ id: 'server-default', title: 'Nota Spesa Generica', user_id: 'user-1' });
  assert.equal(linked, id);
  assert.equal((await db.getExpenseReportById(id)).server_id, 'server-default');
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM expense_reports WHERE title = 'Nota Spesa Generica'").get().n, 1);
});

test('acknowledging an old upload preserves a newer local move and queues an update', async t => {
  const { db, sqlite, to, id } = await fixture(t);
  const sent = await db.getExpenseById(id);
  await db.moveExpense(id, to);
  sqlite.prepare('UPDATE expenses SET updated_at = ? WHERE id = ?').run('2099-01-01', id);
  await db.acknowledgeSync('expenses', id, sent.updated_at, 'server-expense');
  const row = await db.getExpenseById(id);
  assert.equal(row.server_id, 'server-expense');
  assert.equal(row.expense_report_id, to);
  assert.equal(row.sync_status, 'pending');
  assert((await db.getSyncQueue()).some(item => item.record_id === id && item.action === 'update'));
});

test('archived destinations and other users are rejected without changing the expense', async t => {
  const { db, sqlite, from, to, id } = await fixture(t);
  sqlite.prepare('UPDATE expense_reports SET is_archived = 1 WHERE id = ?').run(to);
  await assert.rejects(db.moveExpense(id, to));
  sqlite.prepare('UPDATE expense_reports SET is_archived = 0, user_id = ? WHERE id = ?').run('other-user', to);
  await assert.rejects(db.moveExpense(id, to));
  assert.equal((await db.getExpenseById(id)).expense_report_id, from);
});

test('sync reads the latest database row instead of an obsolete queued snapshot', async t => {
  const { db, to, id } = await fixture(t);
  const original = (await db.getSyncQueue()).find(item => item.record_id === id);
  await db.moveExpense(id, to);
  await db.attachExpenseServerId(id, 'server-expense');
  const manager = load('services/syncManager.ts', {
    './database': { databaseManager: db }, './networkManager': {}, './receiptService': {}, './api': {},
    react: {}, 'expo-file-system/legacy': {}, 'expo-image-manipulator': {}, '../utils/receiptPath': {},
  }).syncManager;
  let sent;
  manager.syncExpense = async (item, expense) => { sent = { item, expense }; };
  await manager.syncItem(original);
  assert.equal(sent.item.action, 'update');
  assert.equal(sent.expense.expense_report_id, to);
  assert.equal(sent.expense.server_id, 'server-expense');
});

test('report pull traverses every page', async () => {
  const saved = [];
  const service = load('services/serverPullSyncService.ts', {
    './api': { apiClient: { get: async (_url, { page }) => ({ success: true,
      data: { data: [{ id: `report-${page}` }], pagination: { page, totalPages: 3 } } }) } },
    './database': { databaseManager: { upsertExpenseReportFromServer: async report => saved.push(report.id) } },
    '../hooks/useExpenseRefresh': { triggerExpenseRefresh() {} },
  }).serverPullSyncService;
  await service.pullReports();
  assert.deepEqual(saved, ['report-1', 'report-2', 'report-3']);
});
