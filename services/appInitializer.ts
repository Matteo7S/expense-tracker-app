/**
 * App Initializer
 * 
 * Coordina l'inizializzazione di tutti i servizi offline-first
 */

import { databaseManager } from './database';
import { networkManager } from './networkManager';
import { syncManager } from './syncManager';

class AppInitializer {
  private isInitialized = false;
  
  /**
   * Inizializza tutti i servizi in ordine corretto
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.log('⚠️ App already initialized');
      return;
    }

    console.log('🚀 Initializing Expense Tracker App...');

    try {
      // 1. Inizializza il database locale
      console.log('📊 Initializing database...');
      await databaseManager.initDatabase();
      
      // 2. Inizializza il monitor di rete
      console.log('🌐 Initializing network manager...');
      await networkManager.initialize();
      
      // 3. Inizializza il sync manager che dipende dai precedenti
      console.log('🔄 Initializing sync manager...');
      await syncManager.initialize();
      
      this.isInitialized = true;
      console.log('✅ App initialization completed successfully');
      
      // Log stato iniziale
      this.logInitialState();

    } catch (error) {
      console.error('❌ App initialization failed:', error);
      throw error;
    }
  }

  /**
   * Log dello stato iniziale per debugging
   */
  private async logInitialState(): Promise<void> {
    try {
      const networkState = networkManager.getCurrentState();
      const syncStats = syncManager.getStats();
      
      console.log('📊 Initial app state:', {
        network: {
          isConnected: networkState.isConnected,
          isInternetReachable: networkState.isInternetReachable,
          type: networkState.type
        },
        sync: {
          pendingSync: syncStats.pendingSync,
          isRunning: syncStats.isRunning,
          errors: syncStats.errors,
          lastSync: syncStats.lastSync
        }
      });

      // Conta gli elementi nel database
      const expenseReports = await databaseManager.getExpenseReports();
      const allExpenses = await databaseManager.getExpensesByDateRange();
      
      console.log('📊 Local database state:', {
        expenseReports: expenseReports.length,
        expenses: allExpenses.length
      });
      
    } catch (error) {
      console.error('⚠️ Failed to log initial state:', error);
    }
  }

  /**
   * Cleanup di tutti i servizi
   */
  async cleanup(): Promise<void> {
    if (!this.isInitialized) {
      return;
    }

    console.log('🧹 Cleaning up app services...');

    try {
      syncManager.dispose();
      networkManager.dispose();
      // Il database non ha bisogno di cleanup specifico
      
      this.isInitialized = false;
      console.log('✅ App cleanup completed');
      
    } catch (error) {
      console.error('❌ App cleanup failed:', error);
    }
  }

  /**
   * Controlla se l'app è inizializzata
   */
  get initialized(): boolean {
    return this.isInitialized;
  }
}

export const appInitializer = new AppInitializer();

/**
 * Hook React per l'inizializzazione dell'app
 */
import { useEffect, useState } from 'react';

export interface AppInitState {
  isInitializing: boolean;
  isInitialized: boolean;
  error?: string;
}

export function useAppInitialization(): AppInitState {
  const [state, setState] = useState<AppInitState>({
    isInitializing: false,
    isInitialized: false
  });

  useEffect(() => {
    let isMounted = true;

    const initialize = async () => {
      if (appInitializer.initialized) {
        setState({ isInitializing: false, isInitialized: true });
        return;
      }

      setState({ isInitializing: true, isInitialized: false });

      try {
        await appInitializer.initialize();
        
        if (isMounted) {
          setState({ isInitializing: false, isInitialized: true });
        }
      } catch (error) {
        console.error('App initialization failed:', error);
        
        if (isMounted) {
          setState({
            isInitializing: false,
            isInitialized: false,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
    };

    initialize();

    // Cleanup al unmount
    return () => {
      isMounted = false;
      appInitializer.cleanup();
    };
  }, []);

  return state;
}
