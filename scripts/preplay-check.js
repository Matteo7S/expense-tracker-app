#!/usr/bin/env node

const assert = require('assert');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const results = [];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function readJson(relativePath) {
  return JSON.parse(read(relativePath));
}

function check(name, fn) {
  try {
    fn();
    results.push({ name, ok: true });
    console.log(`[PASS] ${name}`);
  } catch (error) {
    results.push({ name, ok: false, error });
    console.error(`[FAIL] ${name}`);
    console.error(`       ${error.message}`);
  }
}

function run(command, args) {
  execFileSync(command, args, {
    cwd: root,
    stdio: 'inherit',
  });
}

function requireText(source, text, message) {
  assert(source.includes(text), message);
}

function requireRegex(source, regex, message) {
  assert(regex.test(source), message);
}

function countMatches(source, text) {
  return source.split(text).length - 1;
}

function getServerMerchantAddress(expense) {
  return expense.merchant_address || expense.merchantAddress || expense.location || '';
}

function getServerMerchantVat(expense) {
  return expense.merchant_vat || expense.merchantVat || expense.vat || '';
}

function buildExpenseFingerprint(expense) {
  return [
    Number(expense.amount || 0).toFixed(2),
    (expense.category || 'other').trim().toLowerCase(),
    (expense.date || '').trim().split('T')[0],
    (expense.merchant || '').trim().toLowerCase(),
    (expense.notes || '').trim().toLowerCase(),
  ].join('|');
}

console.log('Running Play Console preflight checks...');

check('Play build script requires preflight before EAS', () => {
  const pkg = readJson('package.json');
  const script = pkg.scripts && pkg.scripts['build:android:play'];
  const easHook = pkg.scripts && pkg.scripts['eas-build-post-install'];

  assert(script, 'Missing npm script: build:android:play');
  requireText(script, 'PREPLAY_REQUIRE_CLEAN=1', 'Play build must require a clean git tree.');
  requireText(script, 'npm run test:preplay', 'Play build must run preplay checks first.');
  requireText(script, 'eas build --platform android --profile production --non-interactive', 'Play build must use the production Android EAS profile.');
  assert.strictEqual(easHook, 'npm run test:preplay', 'EAS remote builds must also run the preplay checks.');
});

check('Git tree is clean when building for Play', () => {
  if (process.env.PREPLAY_REQUIRE_CLEAN !== '1') {
    console.log('       Skipped clean-tree enforcement outside build:android:play.');
    return;
  }

  const status = execFileSync('git', ['status', '--porcelain'], {
    cwd: root,
    encoding: 'utf8',
  }).trim();

  assert.strictEqual(status, '', 'Commit or stash local changes before creating a Play build.');
});

check('Production EAS config creates an Android App Bundle', () => {
  const eas = readJson('eas.json');
  const production = eas.build && eas.build.production;

  assert(production, 'Missing production EAS profile.');
  assert.strictEqual(eas.cli && eas.cli.appVersionSource, 'remote', 'EAS must use remote app version source.');
  assert.strictEqual(production.autoIncrement, true, 'Production build must auto-increment the versionCode.');
  assert.strictEqual(production.android && production.android.buildType, 'app-bundle', 'Production Android build must create an AAB.');
});

check('Production API endpoints point to Wel Fy server', () => {
  const env = readJson('eas.json').build.production.env || {};
  const expectedUrl = 'https://wel-fy.it/api/expense-tracker/';

  assert.strictEqual(env.EXPO_PUBLIC_AUTH_API_URL, expectedUrl, 'Auth API URL is not the production endpoint.');
  assert.strictEqual(env.EXPO_PUBLIC_MAIN_API_URL, expectedUrl, 'Main API URL is not the production endpoint.');
});

check('Android privacy-sensitive permissions are intentional', () => {
  const app = readJson('app.json').expo;
  const permissions = app.android.permissions || [];
  const blocked = app.android.blockedPermissions || [];
  const cameraPlugin = (app.plugins || []).find((plugin) => Array.isArray(plugin) && plugin[0] === 'expo-camera');

  assert(permissions.includes('android.permission.CAMERA'), 'Camera permission is required for receipt scanning.');
  assert(permissions.includes('android.permission.READ_MEDIA_IMAGES'), 'Image library permission is required for receipt import.');
  assert(blocked.includes('android.permission.RECORD_AUDIO'), 'Audio recording permission must stay blocked.');
  assert(cameraPlugin && cameraPlugin[1] && cameraPlugin[1].recordAudioAndroid === false, 'expo-camera must not request Android audio recording.');
  assert(app.ios.infoPlist.NSCameraUsageDescription, 'iOS camera usage description is required.');
  assert(app.ios.infoPlist.NSPhotoLibraryUsageDescription, 'iOS photo library usage description is required.');
});

check('Targeted lint passes for release-critical files', () => {
  const eslintBin = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'eslint.cmd' : 'eslint');
  const files = [
    'components/FilterDatePicker.tsx',
    'screens/main/ExpensesScreen.tsx',
    'screens/main/ArchivedExpensesScreen.tsx',
    'screens/auth/LoginScreen.tsx',
    'screens/main/ExpenseDetailScreen.tsx',
    'screens/main/ExpenseEditScreen.tsx',
    'screens/main/GenericLiveOCRScreen.tsx',
    'components/DataVerificationModal.tsx',
    'services/database.ts',
    'services/expenseService.ts',
    'services/receiptService.ts',
    'services/syncManager.ts',
  ];

  assert(fs.existsSync(eslintBin), 'ESLint binary not found. Run npm install first.');
  run(eslintBin, files);
});

check('Login remains admin-provisioned only', () => {
  const login = read('screens/auth/LoginScreen.tsx');
  const authNavigator = read('navigation/AuthNavigator.tsx');

  requireText(login, "t('auth.accountCreatedByAdmin')", 'Login must tell users that accounts are created by admins.');
  assert(!/navigate\(['"]Register['"]\)/.test(login), 'Login screen must not navigate to in-app registration.');
  requireText(authNavigator, '<Stack.Screen name="Login" component={LoginScreen} />', 'Auth navigator must expose Login.');
  assert(!authNavigator.includes('<Stack.Screen name="Register"'), 'Auth navigator must not expose Register.');
  requireText(login, "color: '#1c1c1e'", 'Password text must remain visible on the login screen.');
});

check('Expense list and detail render the stored currency', () => {
  const expenses = read('screens/main/ExpensesScreen.tsx');
  const detail = read('screens/main/ExpenseDetailScreen.tsx');
  const i18n = read('i18n/I18nContext.tsx');

  requireText(i18n, 'formatCurrency: (amount: number, currency?: string) => string;', 'I18n context must expose formatCurrency.');
  requireText(i18n, 'currency,', 'formatCurrency must pass through the currency argument.');
  requireText(expenses, "formatCurrency(expense.amount, expense.currency || 'EUR')", 'Expense list must use the expense currency.');
  requireText(detail, "formatCurrency(expense.amount, expense.currency || 'EUR')", 'Expense detail must use the expense currency.');
});

check('Expense detail/edit actions are localized and Android-safe', () => {
  const detail = read('screens/main/ExpenseDetailScreen.tsx');
  const edit = read('screens/main/ExpenseEditScreen.tsx');

  requireText(detail, "t('expenses.edit')", 'Expense detail edit button must use translated text.');
  requireText(detail, "t('expenses.delete')", 'Expense detail delete button must use translated text.');
  requireText(detail, 'useSafeAreaInsets', 'Expense detail must account for Android navigation bar.');
  requireText(detail, 'bottomSafePadding', 'Expense detail action buttons must use bottom safe padding.');
  requireText(edit, "t('expenseForm.saveChanges')", 'Expense edit save button must use translated text.');
  requireText(edit, 'useSafeAreaInsets', 'Expense edit must account for Android navigation bar.');
  requireText(edit, 'bottomSafePadding', 'Expense edit content must use bottom safe padding.');
});

check('OCR receipt flow resets hidden merchant fields between scans', () => {
  const scanner = read('screens/main/GenericLiveOCRScreen.tsx');

  requireText(scanner, 'const resetReceiptFlowState = () =>', 'Scanner must have a central reset function.');
  requireText(scanner, 'setOcrSilentFields({});', 'Scanner reset must clear hidden OCR fields.');
  requireText(scanner, 'merchant_address: ocrSilentFields.merchantAddress', 'Scanner must persist OCR merchant address locally.');
  requireText(scanner, 'merchant_vat: ocrSilentFields.merchantVat', 'Scanner must persist OCR merchant VAT locally.');
  assert(countMatches(scanner, 'resetReceiptFlowState();') >= 3, 'Scanner reset must be used after save, retry, and new image selection.');
});

check('Android OCR confidence uses ML Kit values', () => {
  const androidOcr = read('android/app/src/main/java/it/welfy/expensetracker/VisionOCRModule.kt');

  requireText(androidOcr, 'normalizeConfidence(line.confidence.toDouble())', 'Android OCR must use ML Kit line confidence.');
  requireText(androidOcr, 'lineConfidence * lineWeight', 'Android OCR confidence should be weighted by recognized text length.');
  assert(!androidOcr.includes('putDouble("confidence", 1.0)'), 'Android OCR confidence must not be hardcoded to 100%.');
});

check('Optional merchant location is suggested and manually clearable', () => {
  const scanner = read('screens/main/GenericLiveOCRScreen.tsx');
  const modal = read('components/DataVerificationModal.tsx');
  const database = read('services/database.ts');

  assert(!fs.existsSync(path.join(root, 'utils/receiptLocation.ts')), 'Merchant location must not be inferred from OCR.');
  assert(!scanner.includes('extractReceiptLocationCity'), 'Scanner must not OCR-detect merchant location.');
  requireText(scanner, 'getMostRecentMerchantLocation', 'Scanner must load the previous saved location as a suggestion.');
  requireText(scanner, 'previousMerchantLocation: recentLocation.location', 'Previous location must be passed as a suggestion, not auto-filled.');
  requireText(scanner, 'merchant_location: confirmedData.merchantLocation', 'Confirmed location must be saved locally.');
  requireText(database, 'merchant_location TEXT', 'SQLite schema must include merchant_location.');
  requireText(database, 'merchant_location_source TEXT', 'SQLite schema must include merchant_location_source.');
  requireText(database, 'ORDER BY e.created_at DESC', 'Recent-location fallback must use the last saved expense, not the newest receipt date.');
  requireText(modal, "t('verification.location')", 'Verification modal must show the optional location field.');
  requireText(modal, 'handleUsePreviousLocation', 'Verification modal must let users apply the previous location.');
  requireText(modal, 'handleAddManualLocation', 'Verification modal must let users manually enable location input with +.');
  requireText(modal, 'handleClearLocation', 'Verification modal must include a clear/delete action for location.');
  requireText(modal, "merchantLocationSource = trimmedLocation", 'Location source must be derived from the explicit user choice.');
});

check('Merchant address/VAT mapping accepts all server shapes', () => {
  assert.strictEqual(getServerMerchantAddress({ merchant_address: 'Via Roma 1' }), 'Via Roma 1');
  assert.strictEqual(getServerMerchantAddress({ merchantAddress: 'Main Street 2' }), 'Main Street 2');
  assert.strictEqual(getServerMerchantAddress({ location: 'Legacy Location' }), 'Legacy Location');
  assert.strictEqual(getServerMerchantVat({ merchant_vat: 'IT123' }), 'IT123');
  assert.strictEqual(getServerMerchantVat({ merchantVat: 'GB456' }), 'GB456');
  assert.strictEqual(getServerMerchantVat({ vat: 'DE789' }), 'DE789');
});

check('Server-to-local pull sync preserves merchant address and VAT', () => {
  const database = read('services/database.ts');
  const expenseService = read('services/expenseService.ts');

  requireText(database, 'const merchantAddress = expense.merchant_address || serverExpense.merchantAddress || expense.location || null;', 'Database pull sync must map merchant address from snake/camel/legacy fields.');
  requireText(database, 'const merchantVat = expense.merchant_vat || serverExpense.merchantVat || expense.vat || null;', 'Database pull sync must map merchant VAT from snake/camel/legacy fields.');
  requireText(database, 'server_id', 'Pulled expenses must retain their server_id.');
  requireText(expenseService, 'private getServerMerchantAddress', 'Expense service must normalize merchant address from server data.');
  requireText(expenseService, 'serverExpense.merchantAddress', 'Expense service must support camelCase merchantAddress.');
  requireText(expenseService, 'updates.merchant_address = serverMerchantAddress;', 'Existing local expenses must receive missing merchant addresses from server.');
});

check('Expense create/update sync sends merchant data and stores server id', () => {
  const sync = read('services/syncManager.ts');
  const receipt = read('services/receiptService.ts');

  assert(countMatches(sync, 'merchantAddress: expense.merchant_address') >= 2, 'Create and update sync must send merchant address.');
  assert(countMatches(sync, 'merchantVat: expense.merchant_vat') >= 2, 'Create and update sync must send merchant VAT.');
  assert(countMatches(sync, 'merchantLocation: expense.merchant_location') >= 2, 'Create and update sync must send merchant location.');
  assert(countMatches(sync, 'merchantLocationSource: expense.merchant_location_source') >= 2, 'Create and update sync must send merchant location source.');
  requireText(sync, 'server_id: createResult.data?.id', 'Create sync must save the returned server id locally.');
  requireText(sync, "sync_status: 'synced'", 'Successful sync must mark the local expense as synced.');
  requireText(sync, "throw new Error('Cannot update expense without server ID')", 'Server-backed updates must require server_id.');
  requireText(receipt, "formData.append('merchantAddress', expenseData.merchantAddress)", 'Multipart create must include merchant address.');
  requireText(receipt, "formData.append('merchantVat', expenseData.merchantVat)", 'Multipart create must include merchant VAT.');
  requireText(receipt, "formData.append('merchantLocation', expenseData.merchantLocation)", 'Multipart create must include merchant location.');
});

check('Duplicate expense fingerprint keeps basic sync dedupe stable', () => {
  const first = buildExpenseFingerprint({
    amount: 36.85,
    category: 'Food',
    date: '2026-04-22T14:51:00.000Z',
    merchant: ' Toca Do Coelho ',
    notes: 'Precisione OCR: 100%',
  });
  const duplicate = buildExpenseFingerprint({
    amount: '36.850',
    category: 'food',
    date: '2026-04-22',
    merchant: 'toca do coelho',
    notes: 'precisione ocr: 100%',
  });
  const differentAmount = buildExpenseFingerprint({
    amount: 38.85,
    category: 'food',
    date: '2026-04-22',
    merchant: 'toca do coelho',
    notes: 'precisione ocr: 100%',
  });

  assert.strictEqual(first, duplicate, 'Equivalent local/server expenses must share the same fingerprint.');
  assert.notStrictEqual(first, differentAmount, 'Different expenses must not collapse to the same fingerprint.');
});

check('Release artifacts stay out of git', () => {
  const gitignore = read('.gitignore');

  requireText(gitignore, '*.aab', 'Android App Bundles must be ignored.');
  requireText(gitignore, '*.apk', 'APK files must be ignored.');
});

const failed = results.filter((result) => !result.ok);

if (failed.length > 0) {
  console.error(`\nPreflight failed: ${failed.length}/${results.length} checks did not pass.`);
  process.exit(1);
}

console.log(`\nPreflight passed: ${results.length}/${results.length} checks passed.`);
