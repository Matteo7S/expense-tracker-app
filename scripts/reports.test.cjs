const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

test('online receipt analysis skips network when offline, cancelled, or not opted in', async () => {
  let calls = 0;
  let online = false;
  let enabled = true;
  const { analyzeReceiptOnline } = load('services/onlineReceiptAnalysis.ts', {
    './api': { apiClient: { uploadFile: async () => { calls++; } } },
    './networkManager': { networkManager: { isOnline: () => online } },
    './ocrPreferences': { getQwenEnabled: async userId => Boolean(userId) && enabled },
  });
  const controller = new AbortController();
  assert.equal(await analyzeReceiptOnline('receipt.jpg', controller.signal, 'user'), null);
  online = true;
  assert.equal(await analyzeReceiptOnline('receipt.jpg', controller.signal), null);
  enabled = false;
  assert.equal(await analyzeReceiptOnline('receipt.jpg', controller.signal, 'user'), null);
  enabled = true; controller.abort();
  assert.equal(await analyzeReceiptOnline('receipt.jpg', controller.signal, 'user'), null);
  assert.equal(calls, 0);
});

test('online receipt analysis uses authenticated upload, a timeout and cancellation; failures fall back', async () => {
  let response = { success: true, data: { provider: 'qwen', text: '', fields: { amount: 12, currency: 'GBP' } } };
  let fail = false;
  let lastOptions;
  const { analyzeReceiptOnline } = load('services/onlineReceiptAnalysis.ts', {
    './api': { apiClient: { uploadFile: async (url, form, _headers, options) => {
      assert.equal(url, '/expenses/analyze-receipt');
      assert.equal(form.get('provider'), 'qwen');
      lastOptions = options;
      if (fail) throw new Error('unavailable');
      return response;
    } } },
    './networkManager': { networkManager: { isOnline: () => true } },
    './ocrPreferences': { getQwenEnabled: async () => true },
  });
  const controller = new AbortController();
  assert.equal((await analyzeReceiptOnline('receipt.jpg', controller.signal)).fields.currency, 'GBP');
  assert.equal(lastOptions.timeout, 45000);
  assert.equal(lastOptions.signal, controller.signal);
  fail = true;
  assert.equal(await analyzeReceiptOnline('receipt.jpg', controller.signal), null);
  fail = false; response = { success: true, data: { provider: 'azure', fields: { amount: 12 } } };
  assert.equal(await analyzeReceiptOnline('receipt.jpg', controller.signal), null);
  response = { success: true, data: { provider: 'qwen', fields: {} } };
  assert.equal(await analyzeReceiptOnline('receipt.jpg', controller.signal), null);
  response = { success: false };
  assert.equal(await analyzeReceiptOnline('receipt.jpg', controller.signal), null);
  controller.abort();
  assert.equal(await analyzeReceiptOnline('receipt.jpg', controller.signal), null);
});

test('preferences persist per account, default off and fail closed on storage errors', async () => {
  const store = new Map();
  const storage = { getItem: async key => store.get(key) ?? null,
    setItem: async (key, value) => { store.set(key, value); } };
  const prefs = () => load('services/ocrPreferences.ts', {
    '@react-native-async-storage/async-storage': storage,
  });
  assert.equal(await prefs().getQwenEnabled(), false);
  assert.equal(await prefs().getQwenEnabled('a'), false);
  await prefs().setQwenEnabled('a', true);
  assert.equal(await prefs().getQwenEnabled('a'), true);
  assert.equal(await prefs().getQwenEnabled('b'), false);
  await prefs().setQwenEnabled('a', false);
  assert.equal(await prefs().getQwenEnabled('a'), false);
  storage.getItem = async () => { throw new Error('storage unavailable'); };
  assert.equal(await prefs().getQwenEnabled('a'), false);
  storage.setItem = async () => { throw new Error('storage unavailable'); };
  await assert.rejects(prefs().setQwenEnabled('a', true));
});

test('OCR settings and progress messages are translated in all supported languages', () => {
  const { translations, supportedLanguages } = load('i18n/translations.ts', {});
  for (const language of supportedLanguages) {
    const t = translations[language];
    for (const key of ['qwenTitle', 'qwenDescription', 'qwenSaveError']) assert(t.profile[key]?.length > 0);
    for (const key of ['localAnalysis', 'onlineAnalysis', 'onlineAnalysisComplete']) {
      assert(t.scanner[key]?.length > 0);
      assert(!t.scanner[key].includes('Azure'));
    }
    assert(t.verification.review?.length > 0);
  }
});

test('preference loading rechecks cancellation and connection before upload', async () => {
  for (const reason of ['cancel', 'offline']) {
    const controller = new AbortController();
    let online = true;
    const { analyzeReceiptOnline } = load('services/onlineReceiptAnalysis.ts', {
      './api': { apiClient: { uploadFile: async () => assert.fail('No image should be uploaded') } },
      './networkManager': { networkManager: { isOnline: () => online } },
      './ocrPreferences': { getQwenEnabled: async () => {
        if (reason === 'cancel') controller.abort(); else online = false;
        return true;
      } },
    });
    assert.equal(await analyzeReceiptOnline('receipt.jpg', controller.signal, 'a'), null);
  }
});

test('late cloud results after cancellation are discarded and never shown', async () => {
  const controller = new AbortController();
  let startCalls = 0;
  const { analyzeReceiptOnline } = load('services/onlineReceiptAnalysis.ts', {
    './api': { apiClient: { uploadFile: async () => {
      controller.abort();
      return { success: true, data: { provider: 'qwen', fields: { amount: 12 } } };
    } } },
    './networkManager': { networkManager: { isOnline: () => true } },
    './ocrPreferences': { getQwenEnabled: async () => true },
  });
  assert.equal(await analyzeReceiptOnline('receipt.jpg', controller.signal, 'a', () => startCalls++), null);
  assert.equal(startCalls, 1);
});

test('online fields override heuristics, preserve zero and leave location and missing fields alone', () => {
  const { mergeReceiptAnalysis } = load('utils/mergeReceiptAnalysis.ts', {});
  const local = { amount: 100, currency: 'EUR', merchantName: 'Local', date: '2026-04-22', merchantLocation: 'Mantova', confidence: { amount: 0.9, merchant: 0.5 } };
  const merged = mergeReceiptAnalysis(local, { amount: 0, currency: 'GBP', merchantName: '', confidence: { amount: 0.7 } });
  assert.equal(merged.amount, 0);
  assert.equal(merged.currency, 'GBP');
  assert.equal(merged.merchantName, 'Local');
  assert.equal(merged.date, local.date);
  assert.equal(merged.merchantLocation, 'Mantova');
  assert.equal(merged.confidence.amount, 0.7);
  assert.equal(local.amount, 100);
  assert.equal(local.confidence.amount, 0.9);
  assert.equal(mergeReceiptAnalysis(local, { amount: 25 }).confidence.amount, undefined);
  const qwen = mergeReceiptAnalysis(local, { analysisProvider: 'qwen', amount: 61, category: 'fuel', fuelLiters: 31.3 });
  assert.equal(qwen.category, 'fuel');
  assert.equal(qwen.fuelLiters, 31.3);
  assert.equal(qwen.merchantLocation, 'Mantova');
  assert.equal(qwen.confidence.merchant, undefined);
  assert.equal(qwen.analysisProvider, 'qwen');
});

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

test('the default stays first after appending a new report and after a server reload', () => {
  const { filterReportOptions } = load('utils/reportSelection.ts', {});
  const rows = [
    { id: 'old', name: 'Old', createdAt: '2026-04-01', updatedAt: '2026-09-08' },
    { id: 'default', name: 'Nota Spesa', isDefault: true, createdAt: '2026-01-01' },
    { id: 'recent', name: 'Recent', createdAt: '2026-08-01', updatedAt: '2026-08-01' },
  ];
  const ids = rows => filterReportOptions(rows, '', '', '').map(row => row.id);
  assert.deepEqual(ids(rows), ['default', 'recent', 'old']);
  const created = [...rows, { id: 'new', name: 'New', createdAt: '2026-09-08' }];
  assert.deepEqual(ids(created), ['default', 'new', 'recent', 'old']);
  assert.deepEqual(ids([...created].reverse()), ['default', 'new', 'recent', 'old']);
  assert.deepEqual(created.map(row => row.id), ['old', 'default', 'recent', 'new']);
});

test('default pinning respects search and date filters and the absence of a default', () => {
  const { filterReportOptions } = load('utils/reportSelection.ts', {});
  const rows = [
    { id: 'new', name: 'Trip new', createdAt: '2026-09-08', startDate: '2026-09-01', endDate: '2026-09-08' },
    { id: 'default', name: 'Nota Spesa', isDefault: true, createdAt: '2026-01-01' },
    { id: 'old', name: 'Trip old', createdAt: '2026-04-01', startDate: '2026-04-01', endDate: '2026-04-10' },
  ];
  assert.deepEqual(filterReportOptions(rows, 'Trip', '', '').map(row => row.id), ['new', 'old']);
  assert.deepEqual(filterReportOptions(rows, '', '2026-09-01', '').map(row => row.id), ['new']);
  assert.deepEqual(filterReportOptions(rows.filter(row => !row.isDefault), '', '', '').map(row => row.id), ['new', 'old']);
});

test('creation date takes priority over edits, with stable ordering for missing or equal dates', () => {
  const { filterReportOptions } = load('utils/reportSelection.ts', {});
  const rows = [
    { id: 'missing', name: 'Missing', createdAt: 'invalid' },
    { id: 'old', name: 'Old', createdAt: '2026-01-01', updatedAt: '2026-12-01' },
    { id: 'b', name: 'B', createdAt: new Date('2026-09-01') },
    { id: 'a', name: 'A', createdAt: '2026-09-01' },
    { id: 'legacy', name: 'Legacy', updatedAt: '2026-08-01' },
  ];
  assert.deepEqual(filterReportOptions(rows, '', '', '').map(row => row.id), ['a', 'b', 'legacy', 'old', 'missing']);
});

test('default identification uses the internal title independently of the displayed label', () => {
  const { isGenericExpenseReportTitle, getExpenseReportDisplayTitle } = load('utils/expenseReportDisplay.ts', {});
  const { filterReportOptions } = load('utils/reportSelection.ts', {});
  const reports = [
    { id: 'new', title: 'Trip', createdAt: '2026-09-08' },
    { id: 'default', title: '  NOTA SPESA GENERICA  ', createdAt: '2026-01-01' },
  ];
  const rows = reports.map(report => ({ ...report,
    name: getExpenseReportDisplayTitle(report.title), isDefault: isGenericExpenseReportTitle(report.title) }));
  assert.equal(rows[1].name, 'Nota Spesa');
  assert.deepEqual(filterReportOptions(rows, '', '', '').map(row => row.id), ['default', 'new']);
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

function currencies() {
  return load('utils/currencies.ts', { './currencies.json': require('../utils/currencies.json') });
}

test('offline ISO currency catalogue has unique codes and names in every app language', () => {
  const { getCurrencyOptions } = currencies();
  for (const locale of ['it-IT', 'en-GB', 'de-DE']) {
    const rows = getCurrencyOptions(locale);
    assert.equal(rows.length, 176);
    assert.equal(new Set(rows.map(row => row.code)).size, rows.length);
    assert(rows.every(row => /^[A-Z]{3}$/.test(row.code) && row.name && row.symbol));
    for (const code of ['EUR', 'USD', 'GBP', 'CHF', 'SEK', 'NOK', 'DKK', 'JPY', 'CNY', 'INR', 'KWD', 'XCG', 'ZWG']) {
      assert(rows.some(row => row.code === code), code);
    }
    assert(!rows.some(row => ['XXX', 'XTS'].includes(row.code)));
  }
});

test('currency search accepts codes, multilingual names, accents and several words', () => {
  const { getCurrencyOptions, searchCurrencies } = currencies();
  const options = getCurrencyOptions('it-IT');
  const codes = query => searchCurrencies(options, query).map(row => row.code);
  assert.deepEqual(codes('  sEk '), ['SEK']);
  assert(codes('corona svedese').includes('SEK'));
  assert(codes('swedish krona').includes('SEK'));
  assert(codes('schwedische krone').includes('SEK'));
  assert(codes('dóllar').includes('USD'));
  assert(codes('$').includes('USD'));
  assert.equal(codes('not-a-currency').length, 0);
  assert.equal(codes('   ').length, options.length);
  assert.equal(options.length, 176);
});

test('saved historical currency codes stay selectable without allowing invalid codes', () => {
  const { getCurrencyOptions, searchCurrencies } = currencies();
  const options = getCurrencyOptions('it-IT', 'bgn');
  assert.equal(options.length, 177);
  assert.equal(searchCurrencies(options, 'bgn')[0].code, 'BGN');
  assert.equal(getCurrencyOptions('it-IT', 'eur').length, 176);
  assert.equal(getCurrencyOptions('it-IT', 'BAD_CODE').length, 176);
  assert(getCurrencyOptions('fr-FR').every(row => row.name));
});

test('all selectable currency codes survive local save, queueing and server pull', async t => {
  const { db, from } = await fixture(t);
  for (const { code } of currencies().getCurrencyOptions('it-IT')) {
    const id = await db.createExpense({ expense_report_id: from, amount: 12, currency: code,
      receipt_date: '2026-09-15', merchant_name: code, is_archived: false, sync_status: 'pending' });
    const local = await db.getExpenseById(id);
    assert.equal(local.currency, code);
    const queue = (await db.getSyncQueue()).find(item => item.record_id === id);
    assert.equal(JSON.parse(queue.data).currency, code);
    await db.acknowledgeSync('expenses', id, local.updated_at, `remote-${code}`);
    await db.upsertExpenseFromServer({ id: `remote-${code}`, amount: 12, currency: code, receipt_date: '2026-09-15' }, from);
    assert.equal((await db.getExpenseById(id)).currency, code);
  }
});

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
    './database': { databaseManager: {
      getCurrentUserId: () => null,
      upsertExpenseReportFromServer: async report => saved.push(report.id),
    } },
    '../hooks/useExpenseRefresh': { triggerExpenseRefresh() {} },
  }).serverPullSyncService;
  await service.pullReports();
  assert.deepEqual(saved, ['report-1', 'report-2', 'report-3']);
});

test('empty aliases of the same server report disappear without touching expenses or queuing deletion', async t => {
  const { db, from, id } = await fixture(t);
  const alias = await db.createExpenseReport({ title: 'A', server_id: 'server-a', sync_status: 'synced', is_archived: false });
  await db.getExpenseReports();
  assert.equal(await db.getExpenseReportById(alias), null);
  assert.equal((await db.getExpenseReportById(from)).server_id, 'server-a');
  const expense = await db.getExpenseById(id);
  assert.equal(expense.expense_report_id, from);
  assert.equal(expense.receipt_image_path, 'receipt.jpg');
  assert(!(await db.getSyncQueue()).some(item => item.record_id === alias || item.action === 'delete'));
});

test('an empty default alias lends its server ID to the populated offline default', async t => {
  const { db, sqlite, from, id } = await fixture(t);
  sqlite.prepare("UPDATE expense_reports SET title = 'Nota Spesa Generica', server_id = NULL, sync_status = 'pending' WHERE id = ?").run(from);
  const alias = await db.createExpenseReport({ title: 'Nota Spesa Generica', server_id: 'server-default', sync_status: 'synced', is_archived: false });
  assert.equal(await db.getDefaultReportId(), from);
  assert.equal(await db.getExpenseReportById(alias), null);
  const row = await db.getExpenseReportById(from);
  assert.equal(row.server_id, 'server-default');
  assert.equal(row.sync_status, 'pending');
  assert.equal((await db.getExpenseById(id)).expense_report_id, from);
  assert((await db.getSyncQueue()).some(item => item.record_id === from));
});

test('simultaneous default lookups and imports create only one default', async t => {
  const { db, sqlite } = await fixture(t);
  const remote = { id: 'server-default', title: 'Nota Spesa Generica', user_id: 'user-1' };
  const ids = await Promise.all([
    db.getDefaultReportId(), db.upsertExpenseReportFromServer(remote),
    db.getDefaultReportId(), db.upsertExpenseReportFromServer(remote), db.getDefaultReportId(),
  ]);
  assert.equal(new Set(ids).size, 1);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM expense_reports WHERE title = 'Nota Spesa Generica'").get().n, 1);
});

test('simultaneous imports of a custom report create only one row', async t => {
  const { db } = await fixture(t);
  const report = { id: 'server-custom', title: 'Trip', user_id: 'user-1' };
  assert.equal(new Set(await Promise.all(Array.from({ length: 8 }, () => db.upsertExpenseReportFromServer(report)))).size, 1);
});

test('a synced report matched by local ID receives its server ID', async t => {
  const { db, sqlite, from } = await fixture(t);
  sqlite.prepare('UPDATE expense_reports SET server_id = NULL WHERE id = ?').run(from);
  assert.equal(await db.upsertExpenseReportFromServer({ id: 'remote-a', local_id: from, title: 'A' }), from);
  assert.equal((await db.getExpenseReportById(from)).server_id, 'remote-a');
});

test('matching names are not enough to merge custom reports or distinct server defaults', async t => {
  const { db, sqlite, from } = await fixture(t);
  const custom = await db.createExpenseReport({ title: 'A', server_id: 'another-server', sync_status: 'synced', is_archived: false });
  await db.reconcileEmptyReportDuplicates();
  assert(await db.getExpenseReportById(custom));
  sqlite.prepare("UPDATE expense_reports SET title = 'Nota Spesa Generica' WHERE id IN (?, ?)").run(from, custom);
  await db.reconcileEmptyReportDuplicates();
  assert(await db.getExpenseReportById(from));
  assert(await db.getExpenseReportById(custom));
});

test('archived expenses, pending report edits and other accounts are preserved', async t => {
  const { db, sqlite, id } = await fixture(t);
  const archived = await db.createExpenseReport({ title: 'A', server_id: 'server-a', sync_status: 'synced', is_archived: false });
  await db.createExpense({ expense_report_id: archived, amount: 1, currency: 'EUR', receipt_date: '2026-09-01', is_archived: true, sync_status: 'synced' });
  const edited = await db.createExpenseReport({ title: 'A', server_id: 'server-a', sync_status: 'synced', is_archived: false });
  await db.updateExpenseReport(edited, { description: 'Unsynced change' });
  const other = await db.createExpenseReport({ title: 'A', user_id: 'other-user', server_id: 'server-a', sync_status: 'synced', is_archived: false });
  await db.reconcileEmptyReportDuplicates();
  for (const reportId of [archived, edited, other]) assert(await db.getExpenseReportById(reportId));
  assert(await db.getExpenseById(id));
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM expenses').get().n, 2);
});

test('duplicate repair rolls back if deleting its queue fails', async t => {
  const { db, adapter, from } = await fixture(t);
  const alias = await db.createExpenseReport({ title: 'A', server_id: 'server-a', sync_status: 'synced', is_archived: false });
  const run = adapter.runAsync;
  adapter.runAsync = async (sql, ...args) => {
    if (sql.includes('DELETE FROM sync_queue')) throw new Error('disk error');
    return run(sql, ...args);
  };
  await assert.rejects(db.reconcileEmptyReportDuplicates(), /disk error/);
  assert(await db.getExpenseReportById(alias));
  assert(await db.getExpenseReportById(from));
  adapter.runAsync = run;
  await db.reconcileEmptyReportDuplicates();
  assert.equal(await db.getExpenseReportById(alias), null);
});

test('server import selects the populated alias, even when local_id points to the empty alias', async t => {
  const { db, from } = await fixture(t);
  const alias = await db.createExpenseReport({ title: 'A', server_id: 'server-a', sync_status: 'synced', is_archived: false });
  assert.equal(await db.upsertExpenseReportFromServer({ id: 'server-a', local_id: alias, title: 'A' }), from);
});

function pullService(db, get) {
  return load('services/serverPullSyncService.ts', {
    './api': { apiClient: { get } }, './database': { databaseManager: db },
    '../hooks/useExpenseRefresh': { triggerExpenseRefresh() {} },
  }).serverPullSyncService;
}

async function staleReport(db, sqlite) {
  const id = await db.createExpenseReport({ title: 'Nota Spesa Generica', server_id: 'deleted-default', sync_status: 'synced', is_archived: false });
  sqlite.prepare("DELETE FROM sync_queue WHERE record_id = ?").run(id);
  return id;
}

test('a stale empty synced report is removed only after its individual endpoint returns 404', async t => {
  const { db, sqlite, from } = await fixture(t);
  const stale = await staleReport(db, sqlite);
  const requests = [];
  await pullService(db, async url => {
    requests.push(url);
    if (url === '/expense-reports') return { success: true, data: [{ id: 'server-a', title: 'A', user_id: 'user-1' }] };
    throw { response: { status: 404 } };
  }).pullReports();
  assert.deepEqual(requests, ['/expense-reports', '/expense-reports/deleted-default']);
  assert.equal(await db.getExpenseReportById(stale), null);
  assert(await db.getExpenseReportById(from));
});

test('network failures, auth errors and server errors never delete an absent report', async t => {
  const { db, sqlite } = await fixture(t);
  const stale = await staleReport(db, sqlite);
  for (const status of [undefined, 401, 403, 500]) {
    await pullService(db, async url => {
      if (url === '/expense-reports') return { success: true, data: [] };
      throw { response: { status } };
    }).pullReports();
    assert(await db.getExpenseReportById(stale));
  }
});

test('a failed list never starts stale-report cleanup', async t => {
  const { db, sqlite } = await fixture(t);
  const stale = await staleReport(db, sqlite);
  await assert.rejects(pullService(db, async () => ({ success: false, error: 'Unavailable' })).pullReports(), /Unavailable/);
  assert(await db.getExpenseReportById(stale));
});

test('a report excluded from the list but still on the server is preserved and updated', async t => {
  const { db, sqlite } = await fixture(t);
  const stale = await staleReport(db, sqlite);
  await pullService(db, async url => url === '/expense-reports'
    ? { success: true, data: [] }
    : { success: true, data: { id: 'deleted-default', title: 'Old report', is_archived: true, user_id: 'user-1' } }
  ).pullReports();
  assert.equal((await db.getExpenseReportById(stale)).title, 'Old report');
  assert.equal((await db.getExpenseReportById(stale)).is_archived, true);
});

test('404 cleanup rechecks expenses, queued edits and account changes after the request', async t => {
  const { db, sqlite } = await fixture(t);
  for (const mutation of ['expense', 'edit', 'account']) {
    db.setCurrentUserId('user-1');
    const stale = await staleReport(db, sqlite);
    let changed = false;
    await pullService(db, async url => {
      if (url === '/expense-reports') return { success: true, data: [] };
      if (mutation === 'expense') await db.createExpense({ expense_report_id: stale, amount: 1, currency: 'EUR', receipt_date: '2026-09-01', is_archived: true, sync_status: 'pending' });
      if (mutation === 'edit') await db.updateExpenseReport(stale, { description: 'Offline edit' });
      if (mutation === 'account') db.setCurrentUserId('other-user');
      changed = true;
      throw { response: { status: 404 } };
    }).pullReports();
    assert(changed);
    assert(await db.getExpenseReportById(stale));
  }
});
