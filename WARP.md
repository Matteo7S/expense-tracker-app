# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Common Development Commands

### Project Management
- `npm start` - Start the Expo development server
- `npm run android` - Run on Android device/emulator  
- `npm run ios` - Run on iOS device/simulator
- `npm run web` - Run in web browser
- `npm run lint` - Run ESLint code linting

### Development Workflow
- `npx expo prebuild --clean` - Clean rebuild native modules (required for OCR)
- `cd ios && pod install` - Install iOS dependencies after native module changes
- `npx expo run:ios --device` - Build and run on physical iOS device
- `npx expo start --web` - Quick web testing (uses OCR mock mode)
- `npx expo install <package>` - Install Expo-compatible packages

### OCR Development (iOS)
- **Full Setup**: `npx expo prebuild --clean && cd ios && pod install && npx expo run:ios`
- **Mock Testing**: `npx expo start --ios` (automatically uses mock OCR for simulators)
- Vision OCR requires Xcode and physical iOS device for full functionality

## High-Level Architecture

### Offline-First Architecture
The app is built with an **offline-first** approach using SQLite as the primary data store:
- **Data Flow**: UI → Database (local) → Sync Queue → Server API  
- **Always Local**: All operations save to local SQLite first, then sync in background
- **Smart Sync**: Automatic synchronization when network is available
- **Conflict Resolution**: Server data overwrites local on sync conflicts

### Core Services Layer
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   UI Layer      │    │  Business Logic │    │   Data Layer    │
├─────────────────┤    ├─────────────────┤    ├─────────────────┤
│ Screens/        │◄──►│ hooks/          │◄──►│ services/       │
│ Components      │    │ useOCRFlow      │    │ database.ts     │
│ Navigation      │    │ useNetworkState │    │ syncManager.ts  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

**Key Services:**
- `database.ts` - SQLite operations and schema management
- `syncManager.ts` - Background sync with retry logic and queue management
- `networkManager.ts` - Network state monitoring and connectivity handling
- `visionOCRService.ts` - Apple Vision OCR integration with mock fallback
- `authService.ts` - Authentication with secure token storage

### Navigation Structure
- **Auth Flow**: Login/Register screens with context-based routing
- **Main Flow**: Expense reports → Individual expenses → OCR camera workflows
- **Screen Types**: List screens (with offline indicators), Detail/Edit screens, Camera/OCR screens

### OCR Integration
The app features advanced OCR capabilities:
- **Live OCR**: Real-time text extraction during camera preview (iOS only)
- **Mock Mode**: Automatic fallback for development/web testing
- **Custom Module**: `expo-vision-ocr` - native iOS Vision framework integration
- **Smart Processing**: Debounced OCR calls with confidence thresholds

### State Management Patterns
- **React Context**: Authentication state across app
- **Custom Hooks**: `useOCRFlow`, `useNetworkState`, `useAppInitialization`
- **Local State**: Screen-level state with optimistic updates
- **Persistent State**: SQLite with automatic sync queue management

### File Organization
```
├── services/           # Core business logic and API integration
├── hooks/              # Reusable React hooks for state management  
├── contexts/           # React contexts (Auth)
├── navigation/         # Screen navigation configuration
├── screens/            # UI screens organized by feature
│   ├── auth/          # Authentication screens
│   ├── main/          # Main app screens
│   └── debug/         # Development/testing screens
├── components/         # Reusable UI components
├── modules/            # Custom native modules (OCR)
└── config/            # API endpoints and app configuration
```

## Development Notes

### Database Schema
The app uses SQLite with three main tables:
- `expense_reports` - Top-level expense collections
- `expenses` - Individual receipt/expense records with OCR data
- `sync_queue` - Background synchronization queue with retry logic

All records have `sync_status` field (`pending`, `synced`, `error`) for offline-first behavior.

### Network & Sync Behavior
- **Auto-sync**: Every 30 seconds when online and queue has items
- **Manual sync**: Pull-to-refresh in list screens triggers immediate sync
- **Retry Logic**: Failed syncs retry up to 5 times before being dropped
- **Visual Indicators**: Sync status shown in UI with color-coded dots

### OCR Development Workflow
1. **Quick Testing**: Use `npm run web` or iOS simulator - automatically uses mock OCR
2. **Full Testing**: Requires Xcode setup with `npx expo run:ios --device`
3. **Mock Data**: Realistic receipt data generated for UI/UX testing
4. **Production OCR**: Apple Vision framework integration for accurate text extraction

### Environment Configuration
- `EXPO_PUBLIC_AUTH_API_URL` - Authentication service endpoint
- `EXPO_PUBLIC_MAIN_API_URL` - Main application API endpoint
- Default fallbacks: `http://localhost:3101/` (auth), `http://localhost:3100/` (main)

### Testing Strategy
- **Mock Services**: OCR and network services have mock implementations
- **Offline Testing**: Disable network to test offline-first behavior
- **Sync Testing**: Monitor sync queue in development logs
- **Cross-platform**: Web for quick iteration, iOS for full OCR testing
