import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View, StyleSheet, Text } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

// Importa il nuovo sistema offline-first
import { useAppInitialization } from './services/appInitializer';
import { SyncStatusIndicator } from './components/SyncStatusIndicator';
import { useNetworkState } from './hooks/useNetworkState';

// Importa i servizi per l'inizializzazione
import { AuthProvider } from './contexts/AuthContext';
import { AuthNavigator } from './navigation/AuthNavigator';
import { MainNavigator } from './navigation/MainNavigator';
import { useAuth } from './contexts/AuthContext';

const Stack = createStackNavigator();

// Schermata di loading per l'inizializzazione
function AppInitializationScreen() {
  return (
    <View style={styles.loadingContainer}>
      <ActivityIndicator size="large" color="#007AFF" />
      <Text style={styles.loadingText}>🚀 Inizializzazione app...</Text>
      <Text style={styles.loadingSubtext}>
        Configurazione database e servizi offline
      </Text>
    </View>
  );
}

// Schermata di errore per l'inizializzazione
function AppErrorScreen({ error }: { error: string }) {
  return (
    <View style={styles.errorContainer}>
      <Text style={styles.errorText}>❌ Errore inizializzazione</Text>
      <Text style={styles.errorDetail}>{error}</Text>
      <Text style={styles.errorHint}>
        Riavvia l'app per riprovare
      </Text>
    </View>
  );
}

function AppContent() {
  const { user, loading: authLoading } = useAuth();
  const appInit = useAppInitialization();
  const networkState = useNetworkState();

  // Prima controlla se l'app è inizializzata
  if (appInit.isInitializing) {
    return <AppInitializationScreen />;
  }

  if (appInit.error) {
    return <AppErrorScreen error={appInit.error} />;
  }

  // Poi controlla l'autenticazione
  if (authLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Caricamento...</Text>
      </View>
    );
  }

  return (
    <NavigationContainer>
      {user ? <MainNavigator /> : <AuthNavigator />}
      
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <StatusBar style="auto" />
        <AppContent />
      </AuthProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 20
  },
  loadingText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#007AFF',
    marginTop: 16,
    textAlign: 'center'
  },
  loadingSubtext: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
    textAlign: 'center'
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 20
  },
  errorText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#dc3545',
    marginBottom: 12,
    textAlign: 'center'
  },
  errorDetail: {
    fontSize: 16,
    color: '#666',
    marginBottom: 16,
    textAlign: 'center',
    lineHeight: 22
  },
  errorHint: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    fontStyle: 'italic'
  },
  syncIndicator: {
    position: 'absolute',
    top: 50,
    left: 10,
    right: 10,
    zIndex: 1000
  }
});
