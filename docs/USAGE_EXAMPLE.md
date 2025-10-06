# 🚀 Esempio Uso Sistema Offline-First con Immagini

## 📱 Panoramica
Ecco come utilizzare il sistema completo con gestione delle immagini, thumbnail e sincronizzazione.

---

## 🔧 Setup Iniziale

### 1. App.tsx - Inizializzazione
```tsx
// App.tsx
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { useAppInitialization } from './services/appInitializer';
import { SyncStatusIndicator } from './components/SyncStatusIndicator';

const Stack = createStackNavigator();

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
        <Stack.Screen name="ExpenseList" component={ExpenseListScreen} />
        <Stack.Screen name="ExpenseDetail" component={ExpenseDetailScreen} />
        <Stack.Screen name="Camera" component={CameraScreen} />
      </Stack.Navigator>
      
      {/* Status sincronizzazione globale */}
      <SyncStatusIndicator 
        style={{ position: 'absolute', top: 50, left: 10, right: 10 }} 
      />
    </NavigationContainer>
  );
}
```

---

## 📷 Flusso Fotografia e OCR

### 2. CameraScreen.tsx
```tsx
import { useOCRFlow } from '../hooks/useOCRFlow';
import { ReceiptImage } from '../components/ReceiptImage';

export function CameraScreen({ route, navigation }) {
  const { expenseReportId } = route.params;
  const { state, processImage, updateExpense } = useOCRFlow();

  const handleImageCapture = async (imageUri: string) => {
    try {
      // Processa immagine localmente e salva nel database
      await processImage(imageUri, expenseReportId);
      
      // L'immagine viene:
      // ✅ Salvata localmente
      // ✅ Processata con OCR
      // ✅ Spesa creata nel database locale
      // ✅ Sincronizzazione avviata in background
      
      console.log('✅ Spesa creata:', state.localExpenseId);
      
      // Naviga ai dettagli per vedere il risultato
      navigation.navigate('ExpenseDetail', { 
        expenseId: state.localExpenseId 
      });
      
    } catch (error) {
      Alert.alert('Errore', 'Impossibile processare l\'immagine');
    }
  };

  return (
    <View>
      <CameraView onCapture={handleImageCapture} />
      
      {state.isProcessing && (
        <LoadingOverlay text="Processando immagine..." />
      )}
      
      {state.result && (
        <OCRResultsPreview 
          result={state.result}
          onEdit={(updates) => updateExpense(state.localExpenseId!, updates)}
        />
      )}
    </View>
  );
}
```

---

## 📋 Lista Spese con Thumbnail

### 3. ExpenseListScreen.tsx
```tsx
import { ReceiptImage } from '../components/ReceiptImage';

export function ExpenseListScreen() {
  const renderExpenseCard = ({ item }: { item: Expense }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => navigation.navigate('ExpenseDetail', { expenseId: item.id })}
    >
      <View style={styles.cardHeader}>
        <View style={styles.expenseInfo}>
          <Text style={styles.merchantName}>
            {item.merchant_name || 'Commerciante sconosciuto'}
          </Text>
          <Text style={styles.amount}>
            {item.amount.toFixed(2)} {item.currency}
          </Text>
          <Text style={styles.date}>
            {item.receipt_date}
          </Text>
        </View>
        
        {/* Thumbnail della ricevuta */}
        <ReceiptImage 
          expense={item}
          thumbnailHeight={80}
          showFullscreenButton={false} // Solo anteprima nella lista
          style={styles.thumbnail}
        />
      </View>
      
      {/* Indicatore stato sincronizzazione */}
      <View style={styles.syncStatus}>
        <SyncStatusMini />
        <Text style={styles.syncText}>
          {item.sync_status === 'synced' ? 'Sincronizzato' : 'In attesa'}
        </Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <FlatList
      data={expenses}
      renderItem={renderExpenseCard}
      keyExtractor={item => item.id}
    />
  );
}
```

---

## 🔍 Dettaglio Spesa con Immagine Full

### 4. ExpenseDetailScreen.tsx
```tsx
import { ReceiptImage } from '../components/ReceiptImage';

export function ExpenseDetailScreen({ route }) {
  const { expenseId } = route.params;
  const [expense, setExpense] = useState<Expense | null>(null);

  return (
    <ScrollView>
      {/* Informazioni spesa */}
      <Card>
        <Text style={styles.amount}>
          {expense.amount.toFixed(2)} {expense.currency}
        </Text>
        <Text>{expense.merchant_name}</Text>
        <Text>{expense.merchant_address}</Text>
      </Card>

      {/* Immagine ricevuta con funzionalità complete */}
      <Card>
        <Text style={styles.cardTitle}>Scontrino</Text>
        <ReceiptImage 
          expense={expense}
          thumbnailHeight={200}
          showFullscreenButton={true} // Permette vista full screen
        />
        
        {/* Informazioni immagine */}
        <View style={styles.imageInfo}>
          <Text>
            Stato: {expense.receipt_image_url ? '🌐 Online' : '📱 Solo locale'}
          </Text>
          {expense.receipt_thumbnail_url && (
            <Text>✅ Thumbnail disponibile</Text>
          )}
        </View>
      </Card>
    </ScrollView>
  );
}
```

---

## 🔄 Gestione Sincronizzazione

### 5. Sync Status Monitor
```tsx
import { useSyncStats } from '../services/syncManager';

export function SyncMonitor() {
  const syncStats = useSyncStats();
  
  return (
    <View style={styles.syncMonitor}>
      <Text>📊 Stato Sincronizzazione:</Text>
      
      <View style={styles.stat}>
        <Text>In attesa: {syncStats.pendingSync}</Text>
      </View>
      
      <View style={styles.stat}>
        <Text>
          Stato: {syncStats.isRunning ? '🔄 In corso' : '⏸️ Fermo'}
        </Text>
      </View>
      
      {syncStats.errors > 0 && (
        <View style={[styles.stat, styles.error]}>
          <Text>❌ Errori: {syncStats.errors}</Text>
        </View>
      )}
      
      {syncStats.lastSync && (
        <View style={styles.stat}>
          <Text>
            Ultima sync: {new Date(syncStats.lastSync).toLocaleTimeString()}
          </Text>
        </View>
      )}
    </View>
  );
}
```

---

## 🌐 Gestione Stati Offline/Online

### 6. Network Status Handler
```tsx
import { useNetworkState } from '../hooks/useNetworkState';

export function NetworkBanner() {
  const network = useNetworkState();
  
  if (!network.isConnected) {
    return (
      <View style={styles.offlineBanner}>
        <Text style={styles.offlineText}>
          📴 Offline - Le modifiche saranno sincronizzate quando torni online
        </Text>
      </View>
    );
  }
  
  if (!network.isInternetReachable) {
    return (
      <View style={styles.noInternetBanner}>
        <Text style={styles.noInternetText}>
          🌐 Nessun accesso a Internet - Modalità offline attiva
        </Text>
      </View>
    );
  }
  
  return null; // Online, nessun banner necessario
}
```

---

## 📊 Flusso Completo Esempio

### Scenario: Utente fotografa uno scontrino offline

1. **📷 Cattura Immagine**
   ```tsx
   // L'utente tocca il pulsante camera
   const handleCameraPress = async () => {
     const imageUri = await captureImage();
     await ocrFlow.processImage(imageUri, expenseReportId);
     // ✅ Immagine salvata: /Documents/receipt_1234567890.jpg
     // ✅ OCR eseguito localmente
     // ✅ Spesa creata nel database locale
     // ✅ Stato: 'pending' per sincronizzazione
   };
   ```

2. **💾 Salvataggio Locale**
   ```sql
   -- Database locale
   INSERT INTO expenses (
     id, expense_report_id, amount, currency,
     receipt_image_path, -- Path locale
     receipt_image_url, -- null (verrà impostato dopo sync)
     receipt_thumbnail_url, -- null (verrà impostato dopo sync)
     sync_status -- 'pending'
   )
   ```

3. **🔄 Sync in Background** (quando torna online)
   ```tsx
   // SyncManager rileva connessione
   networkManager.addListener((networkState) => {
     if (networkState.isConnected) {
       // Avvia sincronizzazione automatica
       syncManager.startPeriodicSync();
     }
   });
   
   // Upload immagine al server
   const imageResult = await receiptService.uploadReceiptImage(
     expense.receipt_image_path
   );
   
   // Server risponde con:
   // {
   //   url: "https://server.com/images/receipt_123.jpg",
   //   thumbnailUrl: "https://server.com/thumbnails/receipt_123_thumb.jpg"
   // }
   
   // Aggiorna database locale
   await databaseManager.updateExpense(expense.id, {
     receipt_image_url: imageResult.data.url,
     receipt_thumbnail_url: imageResult.data.thumbnailUrl,
     sync_status: 'synced'
   });
   ```

4. **🖼️ Visualizzazione UI**
   ```tsx
   // ReceiptImage component gestisce automaticamente:
   const getThumbnailSource = () => {
     // 1. Preferisce il thumbnail se disponibile
     if (expense.receipt_thumbnail_url) {
       return { uri: expense.receipt_thumbnail_url }; // 🌐 Da server
     }
     
     // 2. Fallback all'immagine completa
     if (expense.receipt_image_url) {
       return { uri: expense.receipt_image_url };
     }
     
     // 3. Fallback all'immagine locale
     if (expense.receipt_image_path) {
       return { uri: expense.receipt_image_path }; // 📱 Locale
     }
     
     return null;
   };
   
   const getFullImageSource = () => {
     // Per fullscreen, sempre immagine originale se disponibile
     return expense.receipt_image_url || 
            expense.receipt_thumbnail_url || 
            expense.receipt_image_path;
   };
   ```

---

## 🎯 Benefici del Sistema

### ✅ **Funzionamento Offline Completo**
- Fotografie salvate localmente
- OCR funziona senza internet
- Tutte le operazioni CRUD disponibili offline
- UI sempre responsiva

### ⚡ **Performance Ottimizzate**
- Thumbnail per liste (caricamento veloce)
- Immagine full solo quando richiesta
- Caching automatico delle immagini
- Database SQLite locale veloce

### 🔄 **Sincronizzazione Intelligente**
- Upload automatico quando online
- Retry automatici in caso di errori
- Status visibili all'utente
- Background sync trasparente

### 🎨 **Esperienza Utente Fluida**
- Indicatori di caricamento
- Stati di sincronizzazione chiari
- Vista fullscreen per le immagini
- Fallback graceful tra online/offline

---

## 🐛 Debug e Troubleshooting

```tsx
// Console logs automatici del sistema
console.log('📊 Loaded expense:', expense);
console.log('🔄 Sync process started');
console.log('📤 Uploading image:', imagePath);
console.log('✅ Image upload successful:', response);
console.log('🗑️ Expense deleted from local database');
```

**Comandi utili per debug:**
```tsx
// Controlla stato coda sync
const queue = await databaseManager.getSyncQueue();
console.log('Sync queue:', queue.length, 'items');

// Forza sync immediata
await syncManager.forceSyncNow();

// Statistiche database
const stats = await databaseManager.getStats();
console.log('Database stats:', stats);
```

---

**💡 Il sistema è progettato per essere completamente autonomo e gestire ogni scenario offline/online in modo trasparente per l'utente!**
