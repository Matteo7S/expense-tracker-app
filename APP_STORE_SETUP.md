# Configurazione per App Store

Questo documento descrive la configurazione completa dell'app per la pubblicazione su App Store.

## ✅ Configurazioni Completate

### 1. Endpoint API (Produzione)
**File**: `.env`
- **Auth API**: `https://wel-fy.it/auth`
- **Main API**: `https://wel-fy.it/api`

### 2. App Configuration
**File**: `app.json`
- **Nome App**: Expense Tracker
- **Version**: 1.0.0
- **Bundle ID iOS**: `it.welfy.expensetracker`
- **Package Android**: `it.welfy.expensetracker`
- **Build Number iOS**: 1
- **Version Code Android**: 1

#### Permessi Configurati:
- ✅ Camera (iOS & Android) - Per scansione scontrini
- ✅ Photo Library (iOS) - Per salvare/caricare ricevute
- ✅ Media Images (Android) - Per accesso alle immagini

### 3. EAS Build Configuration
**File**: `eas.json`

#### Profilo Production:
- **Auto Increment**: Abilitato (build number automatico)
- **iOS Build Configuration**: Release
- **Variabili d'Ambiente**:
  - `EXPO_PUBLIC_AUTH_API_URL=https://wel-fy.it/auth`
  - `EXPO_PUBLIC_MAIN_API_URL=https://wel-fy.it/api`

#### Configurazione Submit (da completare):
```json
{
  "ios": {
    "appleId": "your-apple-id@example.com",
    "ascAppId": "your-asc-app-id",
    "appleTeamId": "your-team-id"
  }
}
```

### 4. Logging
**File**: `utils/logger.ts`
- ✅ Creato sistema di logging che disabilita automaticamente i log debug/info in produzione
- ✅ Solo gli errori vengono loggati in produzione
- ✅ Aggiornati i principali servizi per usare il logger:
  - `services/api.ts`
  - `services/smartReceiptAnalyzer.ts`

### 5. Assets
**Directory**: `assets/images/`
- ✅ `icon.png` - Icona app (1024x1024)
- ✅ `adaptive-icon.png` - Icona Android
- ✅ `splash-icon.png` - Splash screen
- ✅ `favicon.png` - Web favicon

## 🔧 Passi Necessari Prima della Build

### 1. Aggiorna Credenziali Apple Developer
Nel file `eas.json`, sezione `submit.production.ios`, aggiorna:
- `appleId`: Il tuo Apple ID
- `ascAppId`: L'ID dell'app su App Store Connect
- `appleTeamId`: Il tuo Team ID Apple Developer

### 2. Verifica Backend
Assicurati che i server backend siano attivi e raggiungibili:
- ✅ `https://wel-fy.it/auth` - Authentication API
- ✅ `https://wel-fy.it/api` - Main API

### 3. Certificati e Provisioning Profiles
Assicurati di avere configurato:
- Certificato di distribuzione iOS
- Provisioning Profile per App Store
- Push Notification certificate (se applicabile)

## 🚀 Comando per Build Produzione

### Build iOS per App Store
```bash
eas build --platform ios --profile production
```

### Build Android (se necessario)
```bash
eas build --platform android --profile production
```

### Submit all'App Store (dopo la build)
```bash
eas submit --platform ios --profile production
```

## 📝 Checklist Pre-Submission

### Informazioni App Store Connect
- [ ] Nome App: **Expense Tracker**
- [ ] Descrizione breve
- [ ] Descrizione completa
- [ ] Keywords per SEO
- [ ] Screenshot (required sizes):
  - iPhone 6.7" (iPhone 14 Pro Max)
  - iPhone 6.5" (iPhone 11 Pro Max)
  - iPhone 5.5" (iPhone 8 Plus)
  - iPad Pro 12.9" (opzionale)
- [ ] Privacy Policy URL
- [ ] Support URL
- [ ] Marketing URL (opzionale)

### Categorie
- [ ] Categoria Primaria: Business / Finance
- [ ] Categoria Secondaria (opzionale)

### Age Rating
- [ ] Completa il questionario età rating

### Pricing
- [ ] Gratis / A pagamento
- [ ] Disponibilità geografica

## 🔍 Test Pre-Release

### Test Consigliati:
1. ✅ Build funzionante su dispositivo fisico
2. ✅ Connessione API funzionante con backend produzione
3. ✅ Test completo flusso autenticazione
4. ✅ Test scansione scontrini e OCR
5. ✅ Test sincronizzazione dati
6. ✅ Test offline/online transitions
7. ✅ Verifica performance e stabilità

## 📱 Build Number & Versioning

- **Version**: 1.0.0 (incrementa per update sostanziali)
- **Build Number**: Auto-incrementato da EAS
- Per aggiornamenti minori: incrementa solo build number
- Per nuove features: incrementa version minor (1.1.0)
- Per breaking changes: incrementa version major (2.0.0)

## 🔐 Sicurezza

✅ **Completato**:
- Endpoint API configurati su HTTPS
- Logger configurato per non esporre dati sensibili in produzione
- Token salvati in Secure Storage

## 📄 Note Aggiuntive

### Descrizione App (Suggerita):
**Italiano**:
"Expense Tracker è l'app definitiva per la gestione delle note spese. Scansiona automaticamente gli scontrini, estrae le informazioni importanti e organizza le tue spese in modo semplice ed efficiente. Ideale per professionisti, freelance e aziende."

**Features**:
- 📸 Scansione automatica scontrini con OCR
- 🤖 Classificazione intelligente delle spese
- 📊 Report dettagliati
- ☁️ Sincronizzazione cloud
- 🔒 Sicurezza garantita

### Keywords (Suggerite):
note spese, scontrini, expense, tracker, OCR, scanner, gestione spese, business, contabilità, freelance

---

**Data Configurazione**: 2025-10-06
**Configurato da**: Setup automatico per wel-fy.it
