# 📱 Sistema Offline-First per Expense Tracker

## 🎯 Panoramica

Questo sistema implementa un'architettura offline-first per l'app Expense Tracker che garantisce:

- ✅ **Funzionamento completo offline** - L'app funziona senza connessione internet
- 🔄 **Sincronizzazione automatica** - I dati vengono sincronizzati quando torna la connessione  
- 💾 **Database locale** - SQLite per persistenza locale dei dati
- 🌐 **Gestione intelligente della rete** - Monitora lo stato di connessione
- ⚡ **Background sync** - Sincronizzazione trasparente in background
- 🔒 **Data integrity** - Gestione dei conflitti e retry automatici

---

## 🏗️ Architettura

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   UI Layer      │    │  Business Logic │    │   Data Layer    │
├─────────────────┤    ├─────────────────┤    ├─────────────────┤
│ Screens/        │    │ hooks/          │    │ services/       │
│ Components      │◄──►│ useOCRFlow      │◄──►│ database.ts     │
│ SyncStatusUI    │    │ useNetworkState │    │ networkManager  │
│                 │    │ useAppInit      │    │ syncManager     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                                       │
                                                       ▼
                                               ┌─────────────────┐
                                               │ SQLite Database │
                                               │ + Sync Queue    │
                                               └─────────────────┘
```

---

## 🚀 Quick Start

### 1. Inizializzazione App

```tsx
// App.tsx
import React from 'react';
import { useAppInitialization } from './services/appInitializer';
import { SyncStatusIndicator } from './components/SyncStatusIndicator';

export default function App() {
  const appInit = useAppInitialization();

  if (appInit.isInitializing) {
    return <LoadingScreen />;
  }

  if (appInit.error) {
    return <ErrorScreen error={appInit.error} />;
  }

  return (
    <NavigationContainer>
      <Stack.Navigator>
        {/* I tuoi screen */}
      </Stack.Navigator>
      
      {/* Status di sincronizzazione sempre visibile */}
      <SyncStatusIndicator style={{ position: 'absolute', top: 50 }} />
    </NavigationContainer>
  );
}
```

### 2. Flusso OCR Offline-First

```tsx
// CameraScreen.tsx
import { useOCRFlow } from '../hooks/useOCRFlow';

export function CameraScreen({ expenseReportId }) {
  const { state, processImage, updateExpense } = useOCRFlow();

  const handleImageCapture = async (imagePath: string) => {
    // Processa immagine e salva localmente
    await processImage(imagePath, expenseReportId);
    // -> L'immagine viene salvata localmente
    // -> OCR viene eseguito
    // -> Spesa creata nel database locale
    // -> Sync automatico in background se online
  };

  const handleDataEdit = async (updates: any) => {
    if (state.localExpenseId) {
      // Aggiorna dati localmente
      await updateExpense(state.localExpenseId, updates);
      // -> Modifiche salvate immediatamente nel database locale
      // -> Marcato per sincronizzazione
      // -> Sync in background se online
    }
  };

  return (
    <View>
      {/* UI della camera */}
      {state.isProcessing && <LoadingIndicator />}
      {state.result && (
        <ExpenseForm 
          data={state.result}
          onSave={handleDataEdit}
        />
      )}
    </View>
  );
}
```

### 3. Lista Spese con Sync

```tsx
// ExpenseListScreen.tsx
import { databaseManager } from '../services/database';
import { syncManager } from '../services/syncManager';

export function ExpenseListScreen() {
  const [expenses, setExpenses] = useState([]);
  
  // Carica sempre dal database locale
  const loadExpenses = async () => {
    const localExpenses = await databaseManager.getExpensesByDateRange();
    setExpenses(localExpenses);
  };

  // Refresh con sync
  const onRefresh = async () => {
    await loadExpenses(); // Prima carica dati locali
    await syncManager.forceSyncNow(); // Poi sincronizza
    await loadExpenses(); // E ricarica per vedere aggiornamenti
  };

  return (
    <FlatList
      data={expenses}
      onRefresh={onRefresh}
      renderItem={({ item }) => (
        <ExpenseCard 
          expense={item}
          syncStatus={item.sync_status} // 'pending', 'synced', 'error'
        />
      )}
    />
  );
}
```

---

## 📊 Database Schema

### Tabelle Principali

```sql
-- Note spese
CREATE TABLE expense_reports (
  id TEXT PRIMARY KEY,
  server_id TEXT,              -- ID sul server remoto
  title TEXT NOT NULL,
  description TEXT,
  is_archived BOOLEAN DEFAULT 0,
  sync_status TEXT DEFAULT 'pending', -- pending, synced, error
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  last_sync TEXT
);

-- Spese individuali  
CREATE TABLE expenses (
  id TEXT PRIMARY KEY,
  server_id TEXT,
  expense_report_id TEXT NOT NULL,
  amount REAL NOT NULL DEFAULT 0,
  currency TEXT DEFAULT 'EUR',
  merchant_name TEXT,
  merchant_address TEXT,
  merchant_vat TEXT,
  category TEXT DEFAULT 'Other',
  receipt_date TEXT,
  receipt_time TEXT,
  receipt_image_path TEXT,     -- Path locale dell'immagine
  receipt_image_url TEXT,      -- URL remoto dopo upload
  extracted_data TEXT,         -- JSON con dati OCR
  notes TEXT,
  is_archived BOOLEAN DEFAULT 0,
  sync_status TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  last_sync TEXT,
  FOREIGN KEY (expense_report_id) REFERENCES expense_reports(id)
);

-- Coda di sincronizzazione
CREATE TABLE sync_queue (
  id TEXT PRIMARY KEY,
  table_name TEXT NOT NULL,
  record_id TEXT NOT NULL,
  action TEXT NOT NULL,        -- create, update, delete
  data TEXT NOT NULL,          -- JSON del record
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  attempts INTEGER DEFAULT 0,
  last_error TEXT
);
```

---

## 🔄 Gestione della Sincronizzazione

### Stati di Sync

- **`pending`** - In attesa di sincronizzazione
- **`synced`** - Sincronizzato con il server  
- **`error`** - Errore durante la sincronizzazione

### Flusso di Sincronizzazione

1. **Modifica locale** → Salvata immediatamente nel database locale
2. **Queue entry** → Aggiunta alla coda di sincronizzazione  
3. **Background sync** → SyncManager processa la coda quando online
4. **Server call** → API call al server remoto
5. **Success/Error** → Aggiorna lo stato locale

### Monitoring della Sincronizzazione

```tsx
import { useSyncStats } from '../services/syncManager';

function SyncMonitor() {
  const stats = useSyncStats();
  
  return (
    <View>
      <Text>In attesa: {stats.pendingSync}</Text>
      <Text>In esecuzione: {stats.isRunning ? 'Sì' : 'No'}</Text>
      <Text>Errori: {stats.errors}</Text>
      {stats.lastSync && (
        <Text>Ultima sync: {stats.lastSync}</Text>
      )}
    </View>
  );
}
```

---

## 🌐 Gestione della Rete

### Network State Monitoring

```tsx
import { useNetworkState } from '../hooks/useNetworkState';

function NetworkStatus() {
  const network = useNetworkState();
  
  if (!network.isConnected) {
    return <OfflineBanner />;
  }
  
  if (!network.isInternetReachable) {
    return <NoInternetBanner />;
  }
  
  return <OnlineIndicator />;
}
```

### Sincronizzazione Automatica

Il SyncManager:
- ⏱️ Sincronizza ogni 30 secondi quando online
- 🔄 Si avvia automaticamente quando torna la connessione
- ⏸️ Si ferma quando va offline
- 🔁 Riprova automaticamente in caso di errori (max 5 tentativi)

---

## 🎨 Componenti UI

### SyncStatusIndicator

```tsx
// Indicatore completo con dettagli
<SyncStatusIndicator 
  showDetails={true}
  onPress={() => console.log('Sync status pressed')}
/>

// Versione mini per header/toolbar
<SyncStatusMini />
```

### Expense Card con Sync Status

```tsx
function ExpenseCard({ expense }) {
  const getSyncColor = () => {
    switch (expense.sync_status) {
      case 'synced': return 'green';
      case 'pending': return 'orange';
      case 'error': return 'red';
    }
  };
  
  return (
    <View style={styles.card}>
      <Text>{expense.merchant_name}</Text>
      <View style={[styles.syncDot, { backgroundColor: getSyncColor() }]} />
    </View>
  );
}
```

---

## 🔧 Configurazione e Personalizzazione

### Intervalli di Sync

```tsx
// syncManager.ts - Modifica l'intervallo
this.syncIntervalId = setInterval(() => {
  this.syncAll();
}, 30000); // 30 secondi (personalizzabile)
```

### Retry Policy

```tsx
// Modifica il numero massimo di tentativi
if (newAttempts >= 5) { // Cambia qui
  console.log(`❌ Removing item after ${newAttempts} failed attempts`);
  await databaseManager.removeSyncQueueItem(item.id);
}
```

### Filtri Temporali

```tsx
// Ultimi 30 giorni
const thirtyDaysAgo = new Date();
thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

const recentExpenses = await databaseManager.getExpensesByDateRange(
  thirtyDaysAgo.toISOString().split('T')[0],
  new Date().toISOString().split('T')[0]
);
```

---

## 🐛 Debug e Troubleshooting

### Log di Debug

Il sistema logga automaticamente:
- 🚀 Inizializzazione servizi
- 📊 Stato del database
- 🌐 Cambiamenti di rete  
- 🔄 Operazioni di sync
- ❌ Errori e retry

### Comandi utili per debug

```tsx
// Forza sincronizzazione immediata
await syncManager.forceSyncNow();

// Controlla la coda di sync
const queue = await databaseManager.getSyncQueue();
console.log('Sync queue:', queue);

// Pulisci coda di sync (solo per debug!)
await databaseManager.clearSyncQueue();

// Stato della rete
console.log('Network:', networkManager.getState());
```

### Problemi Comuni

**❌ "Sync non funziona"**
- Controlla connessione di rete
- Verifica la coda di sincronizzazione
- Controlla i log per errori API

**❌ "Dati duplicati"**
- Probabilmente un problema di gestione degli ID server
- Controlla la logica di mapping locale/remoto

**❌ "App lenta"**
- Database locale troppo grande? Implementa archivio/cleanup
- Troppi elementi in coda? Ottimizza la frequenza di sync

---

## 🚧 Prossimi Sviluppi

- [ ] **Risoluzione conflitti** - Gestione automatica dei conflitti di dati
- [ ] **Sync delta** - Sincronizzazione solo delle modifiche
- [ ] **Background tasks** - Sync in background anche con app chiusa
- [ ] **Compression** - Compressione immagini prima dell'upload
- [ ] **Encryption** - Crittografia del database locale
- [ ] **Analytics** - Metriche di utilizzo e performance

---

## 📚 Risorse Aggiuntive

- [SQLite React Native](https://github.com/andpor/react-native-sqlite-storage)
- [React Native NetInfo](https://github.com/react-native-netinfo/react-native-netinfo)  
- [React Native FS](https://github.com/itinance/react-native-fs)
- [Offline-First Architecture](https://offlinefirst.org/)

---

**💡 Suggerimento**: Testa sempre il comportamento offline della tua app durante lo sviluppo!
