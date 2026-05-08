import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View, StyleSheet, Text } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

// Importa il nuovo sistema offline-first
import { useAppInitialization } from './services/appInitializer';

// Importa i servizi per l'inizializzazione
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { AuthNavigator } from './navigation/AuthNavigator';
import { MainNavigator } from './navigation/MainNavigator';
import { I18nProvider, useI18n } from './i18n';

// Schermata di loading per l'inizializzazione
function AppInitializationScreen() {
  const { t } = useI18n();

  return (
    <View style={styles.loadingContainer}>
      <ActivityIndicator size="large" color="#007AFF" />
      <Text style={styles.loadingText}>{t('app.initializationTitle')}</Text>
      <Text style={styles.loadingSubtext}>
        {t('app.initializationSubtitle')}
      </Text>
    </View>
  );
}

// Schermata di errore per l'inizializzazione
function AppErrorScreen({ error }: { error: string }) {
  const { t } = useI18n();

  return (
    <View style={styles.errorContainer}>
      <Text style={styles.errorText}>{t('app.initializationErrorTitle')}</Text>
      <Text style={styles.errorDetail}>{error}</Text>
      <Text style={styles.errorHint}>
        {t('app.initializationErrorHint')}
      </Text>
    </View>
  );
}

function AppContent() {
  const { user, loading: authLoading } = useAuth();
  const { t, isLanguageLoaded } = useI18n();
  const appInit = useAppInitialization();

  if (!isLanguageLoaded) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

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
        <Text style={styles.loadingText}>{t('common.loading')}</Text>
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
      <SafeAreaProvider>
        <I18nProvider>
          <AuthProvider>
            <StatusBar style="auto" />
            <AppContent />
          </AuthProvider>
        </I18nProvider>
      </SafeAreaProvider>
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
