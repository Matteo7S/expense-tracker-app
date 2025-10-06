# Guida ai Log Dettagliati - Sincronizzazione Spese

## Panoramica

L'app ora include log dettagliati per tracciare l'intero flusso di creazione e sincronizzazione delle spese con il server.

## Componenti Monitorati

### 1. API Client (`services/api.ts`)

#### Request Interceptor
Logga **ogni richiesta HTTP** prima che venga inviata:

```
🔐 API Request: {
  method: "POST",
  url: "http://localhost:3100/api/expense-reports",
  hasToken: true,
  tokenPreview: "eyJhbGciOi...IkpXVCJ9",
  hasData: true,
  dataSize: 123
}
📦 Request payload: {
  "title": "Nota Spesa Generica",
  "description": "..."
}
```

**Cosa traccia:**
- Metodo HTTP (GET, POST, PUT, DELETE)
- URL completo dell'endpoint
- Presenza del token di autenticazione
- Preview del token (primi/ultimi 10 caratteri)
- Dimensione del payload
- Contenuto completo del payload per POST/PUT

#### Response Interceptor
Logga **ogni risposta dal server**:

```
✅ API Response: {
  status: 201,
  url: "/expense-reports",
  dataSize: 456
}
```

#### Error Interceptor
Logga **errori HTTP dettagliati**:

```
❌ API Error: {
  status: 401,
  url: "/expense-reports",
  message: "Unauthorized",
  data: { error: "Token expired" }
}
🚫 Unauthorized - Token invalid or expired
```

---

### 2. Creazione Expense Reports (`services/receiptService.ts`)

#### `createExpenseReport()`
Traccia la creazione di una nota spese sul server:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📝 [CREATE EXPENSE REPORT] Starting...
📋 [CREATE EXPENSE REPORT] Input data: {
  title: "Nota Spesa Generica",
  description: "...",
  start_date: undefined,
  end_date: undefined
}
📦 [CREATE EXPENSE REPORT] Prepared payload: {...}
🌐 [CREATE EXPENSE REPORT] Sending POST to /expense-reports
🔐 [CREATE EXPENSE REPORT] Auth token will be added by API client interceptor
✅ [CREATE EXPENSE REPORT] Server response received
📋 [CREATE EXPENSE REPORT] Response data: {...}
🆔 [CREATE EXPENSE REPORT] Server-generated ID: "abc123"
✅ [CREATE EXPENSE REPORT] Expense report created successfully
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**In caso di errore:**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
❌ [CREATE EXPENSE REPORT] Error occurred!
❌ [CREATE EXPENSE REPORT] Error type: AxiosError
❌ [CREATE EXPENSE REPORT] Error message: Request failed with status code 401
📋 [CREATE EXPENSE REPORT] API Error Details: {
  status: 401,
  statusText: "Unauthorized",
  data: { error: "..." },
  headers: {...}
}
🚫 [CREATE EXPENSE REPORT] Authentication failed - token may be invalid
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

### 3. Creazione Spese (`services/receiptService.ts`)

#### `createExpenseWithImage()`
Traccia la creazione di una spesa con immagine:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📝 [CREATE EXPENSE] Starting...
📊 [CREATE EXPENSE] Report ID: "abc123"
📋 [CREATE EXPENSE] Expense data: {
  amount: 50.00,
  currency: "EUR",
  merchantName: "Supermercato",
  category: "Alimentari",
  receiptDate: "2025-01-04",
  receiptTime: "14:30",
  hasExtractedData: true,
  hasNotes: false
}
📷 [CREATE EXPENSE] Image URI: file:///path/to/image.jpg
📦 [CREATE EXPENSE] Building FormData...
📷 [CREATE EXPENSE] Adding image to FormData: receipt_1735987654321.jpg
🌐 [CREATE EXPENSE] Endpoint: /expense-reports/abc123/expenses/with-image
🔐 [CREATE EXPENSE] Auth token will be added by API client interceptor
📤 [CREATE EXPENSE] Sending multipart/form-data request...
✅ [CREATE EXPENSE] Server response received
📋 [CREATE EXPENSE] Response: {...}
🆔 [CREATE EXPENSE] Expense ID: "xyz789"
🖼️ [CREATE EXPENSE] Image URL: https://...
🖼️ [CREATE EXPENSE] Thumbnail URL: https://...
✅ [CREATE EXPENSE] Expense created successfully
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Errori specifici:**
- `401` → `🚫 Authentication failed - token may be invalid`
- `400` → `⚠️ Bad request - check data format`
- `404` → `🔍 Expense report not found on server`
- `500` → `💥 Server error`

---

### 4. Database Locale (`services/database.ts`)

#### `createExpense()`
Traccia il salvataggio locale nel database SQLite:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📦 [DB] Creating expense in local database...
🆔 [DB] Generated local ID: local_123456789
📋 [DB] Expense details: {
  id: "local_123456789",
  expense_report_id: "local_abc123",
  amount: 50.00,
  currency: "EUR",
  merchant_name: "Supermercato",
  category: "Alimentari",
  receipt_date: "2025-01-04",
  sync_status: "pending",
  hasImage: true
}
💾 [DB] Inserting expense into SQLite...
✅ [DB] Expense inserted successfully into SQLite
🔄 [DB] Adding expense to sync queue...
✅ [DB] Expense added to sync queue
🆔 [DB] Final local expense ID: local_123456789
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

### 5. Sync Manager (`services/syncManager.ts`)

#### Sincronizzazione Expense Reports
```
🔄 Syncing expense report: {
  action: "create",
  localId: "local_abc123",
  serverId: null,
  title: "Nota Spesa Generica"
}
🆕 Creating expense report on server: {
  title: "Nota Spesa Generica",
  description: "...",
  start_date: undefined,
  end_date: undefined
}
✅ Expense report created on server: {
  localId: "local_abc123",
  serverId: "server_xyz789"
}
```

#### Sincronizzazione Spese
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔄 [SYNC EXPENSE] Starting expense sync
📋 [SYNC EXPENSE] Expense ID: local_123456789
📋 [SYNC EXPENSE] Parent Report ID (local): local_abc123
📋 [SYNC EXPENSE] Amount: 50.00
📋 [SYNC EXPENSE] Category: Alimentari
📋 [SYNC EXPENSE] Sync action: create
📋 [SYNC EXPENSE] Attempts: 0
👨‍👧 [SYNC EXPENSE] Checking parent report...
👨‍👧 [SYNC EXPENSE] Parent report details: {
  found: true,
  id: "local_abc123",
  server_id: "server_xyz789",
  title: "Nota Spesa Generica",
  sync_status: "synced"
}
✅ [SYNC EXPENSE] Parent report is synced with server_id: server_xyz789
➕ [SYNC EXPENSE] Action: CREATE
📤 [SYNC EXPENSE] Preparing data for server...
📤 [SYNC EXPENSE] Data to send: {...}
📤 [SYNC EXPENSE] Using parent server_id: server_xyz789
📷 [SYNC EXPENSE] Receipt image path: file:///...
🌐 [SYNC EXPENSE] Calling receiptService.createExpenseWithImage...
🌐 [SYNC EXPENSE] Server response: {...}
✅ [SYNC EXPENSE] Expense created on server successfully
📝 [SYNC EXPENSE] Server expense ID: server_exp_123
💾 [SYNC EXPENSE] Updating local expense with server data...
✅ [SYNC EXPENSE] Local expense updated with server_id
✅ [SYNC EXPENSE] CREATE action completed successfully
```

---

## Flusso Completo

### Esempio: Scansione di uno scontrino

1. **Salvataggio locale** (`database.ts`)
   - Genera ID locale
   - Inserisce nel database SQLite
   - Aggiunge alla coda di sincronizzazione

2. **Sync Manager inizia** (`syncManager.ts`)
   - Controlla se parent report è sincronizzato
   - Prepara dati per il server

3. **Chiamata API** (`receiptService.ts` + `api.ts`)
   - Costruisce FormData con immagine
   - Interceptor aggiunge token
   - Invia richiesta POST

4. **Risposta Server**
   - Riceve ID server
   - Aggiorna record locale
   - Marca come "synced"

---

## Token di Autenticazione

Il token JWT viene:
- ✅ **Recuperato** automaticamente da SecureStorage
- ✅ **Aggiunto** nell'header `Authorization: Bearer <token>`
- ✅ **Loggato** (solo preview sicura)
- ✅ **Validato** dal server

**Preview del token nei log:**
```
tokenPreview: "eyJhbGciOi...IkpXVCJ9"
```
(mostra primi 10 + ultimi 10 caratteri)

---

## Come Usare i Log

### 1. Durante lo sviluppo
- Apri Metro bundler console
- Filtra per prefissi: `[CREATE EXPENSE]`, `[SYNC EXPENSE]`, `[DB]`

### 2. Per debug di problemi di autenticazione
Cerca:
```
⚠️ API Request without token
🚫 Unauthorized - Token invalid or expired
```

### 3. Per tracciare una spesa specifica
Segui l'ID locale attraverso i vari componenti:
```
🆔 [DB] Generated local ID: local_123456789
→ 📋 [SYNC EXPENSE] Expense ID: local_123456789
→ 🆔 [CREATE EXPENSE] Expense ID: server_exp_123
→ ✅ [DB] Local expense updated with server_id
```

---

## Struttura Emoji

- 🔐 Autenticazione/Token
- 📦 Payload/Dati
- 🌐 Network/API
- 💾 Database
- 🔄 Sincronizzazione
- ✅ Successo
- ❌ Errore
- ⚠️ Warning
- 🆔 ID/Identificatori
- 📋 Dettagli
- 📊 Report
- 📷 Immagini
- 🖼️ URL Immagini

---

## Note Importanti

### Sicurezza
- ❌ **Non viene mai loggato il token completo**
- ✅ Solo preview sicura (primi/ultimi 10 caratteri)
- ❌ Dati sensibili non vengono mai stampati in chiaro

### Performance
- I log sono solo in development
- In produzione andrebbero rimossi o filtrati
- Considerare l'uso di un logger configurabile (es. `react-native-logs`)

### Privacy
- Non loggare dati personali degli utenti
- Sanitizzare sempre i payload prima del log
- Rispettare GDPR/normative locali
