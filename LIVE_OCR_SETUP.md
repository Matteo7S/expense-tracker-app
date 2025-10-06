# Live OCR Setup Guide

## 🔍 Panoramica

Il sistema Live OCR fornisce feedback in tempo reale del testo dello scontrino durante l'inquadratura, utilizzando il framework Apple Vision per iOS.

## ✨ Funzionalità

- **Feedback live del testo** rilevato durante l'inquadratura
- **Overlay semitrasparente** che mostra il testo estratto
- **Switch per attivare/disattivare** il live OCR
- **Debouncing automatico** per ottimizzare performance e batteria
- **Modalità mock** per sviluppo e test

## 🛠️ Setup per iOS (Produzione)

### Prerequisiti
- **Xcode 14.0+** installato
- **iOS 13.0+** target device
- **Apple Developer Account** per test su dispositivo fisico

### Installazione

1. **Installa Xcode completo** (non solo Command Line Tools):
   ```bash
   # Scarica da App Store o Apple Developer
   # Poi configura il developer directory:
   sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
   ```

2. **Configura il progetto iOS**:
   ```bash
   cd expense-tracker-mobile
   npx expo prebuild --clean
   cd ios
   pod install
   ```

3. **Compila e avvia l'app**:
   ```bash
   npx expo run:ios
   ```

### Verifica dell'installazione

1. Apri l'app su iOS
2. Vai su una nota spese → "Scansiona" → "Live OCR Scanner"
3. Se vedi "🔍 Vision OCR available: true" nei log, il setup è completo

## 🎨 Modalità Mock (Sviluppo)

Per sviluppo e test senza Xcode, è abilitata automaticamente la **modalità mock**:

- ✅ **Funziona su web e simulatori**
- ✅ **Genera testo di esempio realistico**
- ✅ **Simula timing e confidenza**
- ✅ **Permette di testare UI e UX**

### Test modalità mock:
```bash
npx expo start --web  # o --ios per simulatore
```

Vai a Live OCR Scanner e vedrai:
- ✅ Overlay funzionante
- ✅ Testo mock che cambia ogni 2 secondi
- ✅ Controlli UI completi

## 📱 Componenti Creati

### 1. `LiveOCRCameraScreen.tsx`
Scanner principale con Live OCR per note spese specifiche:
- Path: `screens/main/LiveOCRCameraScreen.tsx`
- Navigation: `navigation.navigate('LiveOCRCamera', { reportId })`

### 2. `GenericLiveOCRScreen.tsx`
Scanner Live OCR per scansioni generiche:
- Path: `screens/main/GenericLiveOCRScreen.tsx`
- Per nota spese generica "Spese Varie"

### 3. Menu di selezione
- Aggiornato `ExpenseReportDetailScreen` con menu scanner
- Aggiornato `GenericScanScreen` con selezione tipo scanner

## ⚙️ Configurazione

### Parametri di performance (in `LiveOCRCameraScreen.tsx`):
```typescript
const OCR_DEBOUNCE_DELAY = 2000; // 2 secondi tra chiamate OCR
const OCR_MIN_INTERVAL = 1500;   // Intervallo minimo tra chiamate
```

### Soglie qualità (in `visionOCRService.ts`):
```typescript
// Testo deve essere > 10 caratteri
// Confidenza deve essere > 0.3 (30%)
if (result.text.trim().length > 10 && result.confidence > 0.3) {
  // Mostra il testo
}
```

## 🚀 Come Testare

### Test immediato (Mock Mode):
1. `npx expo start --ios`
2. Apri nell'app Expo Go o simulatore
3. Vai su una nota spese → Scansiona → Live OCR Scanner
4. Vedrai il testo mock apparire nell'overlay

### Test produzione (iOS Device):
1. Completa il setup iOS sopra
2. Compila con `npx expo run:ios --device`
3. Testa con veri scontrini

## 🔧 Troubleshooting

### Errore "Cannot find native module 'ExpoVisionOCR'"
- **Soluzione**: Segui il setup iOS completo
- **Workaround temporaneo**: La modalità mock è automaticamente abilitata

### Performance lente
- Modifica `OCR_DEBOUNCE_DELAY` per aumentare l'intervallo
- Disabilita Live OCR con lo switch nell'interfaccia

### Modulo non si compila
```bash
# Reset completo del progetto
rm -rf ios android
npx expo prebuild --clean
cd ios && pod install
npx expo run:ios
```

## 📋 Status Implementation

- ✅ UI e UX Live OCR completa
- ✅ Debouncing e performance optimization
- ✅ Modalità mock per sviluppo
- ✅ Integrazione con navigation
- ✅ Controlli utente (switch on/off)
- ⏳ Setup iOS nativo in corso (richiede Xcode)

## 🎯 Prossimi Passi

1. **Installa Xcode completo** per test su device iOS
2. **Testa con scontrini reali** per verificare accuratezza
3. **Ottimizza parametri** di debouncing basati su feedback utente
4. **Aggiungi metriche** per monitorare performance

---

*La funzionalità Live OCR è pronta e testabile in modalità mock. Per l'utilizzo completo su dispositivi iOS, completa il setup nativo con Xcode.*
