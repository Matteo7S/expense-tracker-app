/**
 * Schermata lista spese con integrazione offline-first
 * 
 * Esempio di come utilizzare il sistema di sincronizzazione
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Alert,
  StatusBar
} from 'react-native';
import { databaseManager, Expense } from '../services/database';
import { SyncStatusIndicator, SyncStatusMini } from '../components/SyncStatusIndicator';
import { useAppInitialization } from '../services/appInitializer';
import { useNetworkState } from '../hooks/useNetworkState';
import { syncManager } from '../services/syncManager';
import { useExpenseRefresh, useExpenseCRUD } from '../hooks/useExpenseRefresh';

interface ExpenseListScreenProps {
  expenseReportId: string;
  navigation: any;
}

export const ExpenseListScreen: React.FC<ExpenseListScreenProps> = ({
  expenseReportId,
  navigation
}) => {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const appInit = useAppInitialization();
  const networkState = useNetworkState();
  const { updateExpense, deleteExpense: crudDeleteExpense } = useExpenseCRUD();

  // Auto-refresh when expenses are modified in other screens
  useExpenseRefresh(loadExpenses);

  // Carica le spese al mount e quando l'app è inizializzata
  useEffect(() => {
    if (appInit.isInitialized) {
      loadExpenses();
    }
  }, [appInit.isInitialized, expenseReportId, showArchived]);

  /**
   * Carica le spese dal database locale
   */
  const loadExpenses = async () => {
    try {
      setIsLoading(true);
      
      const loadedExpenses = await databaseManager.getExpensesByReportId(
        expenseReportId,
        showArchived
      );
      
      setExpenses(loadedExpenses);
      console.log(`📊 Loaded ${loadedExpenses.length} expenses`);
      
    } catch (error) {
      console.error('❌ Failed to load expenses:', error);
      Alert.alert('Errore', 'Impossibile caricare le spese');
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Refresh manuale con sincronizzazione
   */
  const onRefresh = async () => {
    setIsRefreshing(true);
    
    try {
      // Prima ricarica dati locali
      await loadExpenses();
      
      // Poi tenta sincronizzazione se online
      if (networkState.isConnected && networkState.isInternetReachable) {
        await syncManager.forceSyncNow();
        // Ricarica ancora per vedere eventuali aggiornamenti
        await loadExpenses();
      }
      
    } catch (error) {
      console.error('❌ Refresh failed:', error);
      Alert.alert('Errore', 'Errore durante l\'aggiornamento');
    } finally {
      setIsRefreshing(false);
    }
  };

  /**
   * Archivia/ripristina una spesa
   */
  const toggleArchiveExpense = async (expense: Expense) => {
    try {
      const newArchivedStatus = !expense.is_archived;
      
      await databaseManager.updateExpense(expense.id, {
        is_archived: newArchivedStatus,
        sync_status: 'pending',
        updated_at: new Date().toISOString()
      });
      
      console.log(`📝 Expense ${expense.id} ${newArchivedStatus ? 'archived' : 'restored'}`);
      
      // Ricarica la lista
      await loadExpenses();
      
      // Avvia sync in background
      syncManager.syncAll().catch(console.error);
      
    } catch (error) {
      console.error('❌ Failed to toggle archive:', error);
      Alert.alert('Errore', 'Impossibile modificare la spesa');
    }
  };

  /**
   * Elimina definitivamente una spesa
   */
  const deleteExpense = async (expense: Expense) => {
    Alert.alert(
      'Conferma eliminazione',
      `Eliminare definitivamente la spesa di ${expense.amount}€?`,
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Elimina',
          style: 'destructive',
          onPress: async () => {
            try {
              await databaseManager.deleteExpense(expense.id);
              console.log(`🗑️ Expense ${expense.id} deleted`);
              
              // Ricarica la lista
              await loadExpenses();
              
              // Avvia sync in background
              syncManager.syncAll().catch(console.error);
              
            } catch (error) {
              console.error('❌ Failed to delete expense:', error);
              Alert.alert('Errore', 'Impossibile eliminare la spesa');
            }
          }
        }
      ]
    );
  };

  /**
   * Formatta il display della spesa
   */
  const renderExpense = ({ item }: { item: Expense }) => {
    const getSyncStatusColor = () => {
      switch (item.sync_status) {
        case 'synced': return '#28a745';
        case 'pending': return '#f0ad4e';
        case 'error': return '#dc3545';
        default: return '#6c757d';
      }
    };

    return (
      <TouchableOpacity
        style={[
          styles.expenseCard,
          item.is_archived && styles.archivedCard
        ]}
        onPress={() => navigation.navigate('ExpenseDetail', { expenseId: item.id })}
      >
        <View style={styles.expenseHeader}>
          <Text style={styles.merchantName}>
            {item.merchant_name || 'Commerciante sconosciuto'}
          </Text>
          <View style={styles.amountContainer}>
            <Text style={styles.amount}>
              {item.amount.toFixed(2)} {item.currency}
            </Text>
            <View 
              style={[
                styles.syncIndicator, 
                { backgroundColor: getSyncStatusColor() }
              ]} 
            />
          </View>
        </View>

        <Text style={styles.expenseDate}>
          {item.receipt_date} {item.receipt_time}
        </Text>

        {item.merchant_address && (
          <Text style={styles.merchantAddress}>
            📍 {item.merchant_address}
          </Text>
        )}

        <View style={styles.expenseFooter}>
          <Text style={styles.category}>{item.category}</Text>
          <View style={styles.actions}>
            <TouchableOpacity
              onPress={() => toggleArchiveExpense(item)}
              style={styles.actionButton}
            >
              <Text style={styles.actionText}>
                {item.is_archived ? '📤' : '📥'}
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              onPress={() => deleteExpense(item)}
              style={styles.actionButton}
            >
              <Text style={styles.actionText}>🗑️</Text>
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  // Loading screen mentre l'app si inizializza
  if (appInit.isInitializing) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.loadingText}>🚀 Inizializzazione app...</Text>
      </View>
    );
  }

  // Error screen se l'inizializzazione fallisce
  if (appInit.error) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>❌ Errore inizializzazione</Text>
        <Text style={styles.errorDetail}>{appInit.error}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#f8f9fa" />
      
      {/* Header con status di sincronizzazione */}
      <View style={styles.header}>
        <Text style={styles.title}>Spese</Text>
        <SyncStatusMini style={styles.syncMini} />
      </View>

      {/* Status di sincronizzazione dettagliato */}
      <SyncStatusIndicator style={styles.syncStatus} />

      {/* Toggle archiviate */}
      <View style={styles.controls}>
        <TouchableOpacity
          style={[
            styles.toggleButton,
            showArchived && styles.toggleButtonActive
          ]}
          onPress={() => setShowArchived(!showArchived)}
        >
          <Text style={[
            styles.toggleText,
            showArchived && styles.toggleTextActive
          ]}>
            {showArchived ? '📤 Archiviate' : '📥 Attive'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Lista spese */}
      <FlatList
        data={expenses}
        keyExtractor={(item) => item.id}
        renderItem={renderExpense}
        contentContainerStyle={styles.listContainer}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            title="Aggiorna dati"
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>
              {showArchived ? '📥 Nessuna spesa archiviata' : '📝 Nessuna spesa attiva'}
            </Text>
            <Text style={styles.emptySubtext}>
              {!showArchived && 'Aggiungi la prima spesa con una foto dello scontrino'}
            </Text>
          </View>
        }
      />

      {/* Pulsante aggiungi (sempre visible) */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('Camera')}
      >
        <Text style={styles.fabText}>📷</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa'
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef'
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#212529'
  },
  syncMini: {
    // Stili per mini sync indicator
  },
  syncStatus: {
    margin: 12
  },
  controls: {
    paddingHorizontal: 16,
    paddingBottom: 8
  },
  toggleButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#e9ecef',
    alignSelf: 'flex-start'
  },
  toggleButtonActive: {
    backgroundColor: '#007bff'
  },
  toggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#495057'
  },
  toggleTextActive: {
    color: '#fff'
  },
  listContainer: {
    flexGrow: 1,
    padding: 16
  },
  expenseCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e9ecef',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2
  },
  archivedCard: {
    opacity: 0.7,
    borderColor: '#ffc107'
  },
  expenseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8
  },
  merchantName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212529',
    flex: 1
  },
  amountContainer: {
    alignItems: 'flex-end'
  },
  amount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#28a745'
  },
  syncIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 4
  },
  expenseDate: {
    fontSize: 14,
    color: '#6c757d',
    marginBottom: 4
  },
  merchantAddress: {
    fontSize: 12,
    color: '#868e96',
    marginBottom: 8
  },
  expenseFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  category: {
    fontSize: 12,
    color: '#007bff',
    fontWeight: '600'
  },
  actions: {
    flexDirection: 'row'
  },
  actionButton: {
    padding: 8,
    marginLeft: 8
  },
  actionText: {
    fontSize: 16
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40
  },
  emptyText: {
    fontSize: 16,
    color: '#6c757d',
    textAlign: 'center',
    marginBottom: 8
  },
  emptySubtext: {
    fontSize: 14,
    color: '#868e96',
    textAlign: 'center'
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#007bff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 8
  },
  fabText: {
    fontSize: 24
  },
  loadingText: {
    fontSize: 18,
    color: '#007bff',
    textAlign: 'center'
  },
  errorText: {
    fontSize: 18,
    color: '#dc3545',
    textAlign: 'center',
    marginBottom: 8
  },
  errorDetail: {
    fontSize: 14,
    color: '#6c757d',
    textAlign: 'center'
  }
});
