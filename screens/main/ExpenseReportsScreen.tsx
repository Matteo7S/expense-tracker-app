import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  RefreshControl,
  SafeAreaView,
  Modal,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { MaterialIcons } from '@expo/vector-icons';
import { ExpenseReport, FilterOptions, SortOptions } from '../../types';
import { expenseReportService } from '../../services/expenseReportService';
import { databaseManager } from '../../services/database';
import { MainStackParamList } from '../../navigation/MainNavigator';
import { SwipeableExpenseReportItem } from '../../components/SwipeableExpenseReportItem.fallback';
import { useExpenseRefresh } from '../../hooks/useExpenseRefresh';

type ExpenseReportsScreenNavigationProp = StackNavigationProp<MainStackParamList, 'ExpenseReportsTabs'>;

export function ExpenseReportsScreen() {
  const navigation = useNavigation<ExpenseReportsScreenNavigationProp>();
  const [reports, setReports] = useState<ExpenseReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const loadReports = async () => {
    try {
      setLoading(true);
      const response = await expenseReportService.getExpenseReports();
      setReports(response.data);
    } catch (error: any) {
      Alert.alert('Errore', 'Impossibile caricare le note spese');
      console.error('Error loading reports:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadReports();
    setRefreshing(false);
  };

  const handleReportPress = (reportId: string) => {
    navigation.navigate('ExpenseReportDetail', { reportId });
  };

  const handleShowArchiveModal = (reportId: string) => {
    setSelectedReportId(reportId);
    setShowArchiveModal(true);
  };

  const handleArchiveReport = async () => {
    if (!selectedReportId) return;
    
    try {
      console.log('🗺️ Archiving expense report...', selectedReportId);
      await expenseReportService.deleteExpenseReport(selectedReportId);
      console.log('✅ Expense report archived successfully');
      // Ricarica la lista per riflettere le modifiche
      await loadReports();
    } catch (error: any) {
      console.error('❌ Error archiving expense report:', error);
      Alert.alert('Errore', 'Impossibile archiviare la nota spese');
    } finally {
      setShowArchiveModal(false);
      setSelectedReportId(null);
    }
  };

  const handleCancelArchive = () => {
    setShowArchiveModal(false);
    setSelectedReportId(null);
  };

  const navigateToCreateReport = () => {
    navigation.navigate('CreateExpenseReport');
  };

  // Auto-refresh when expenses are modified in other screens
  useExpenseRefresh(loadReports);

  useFocusEffect(
    useCallback(() => {
      console.log('📋 ExpenseReportsScreen focused, reloading reports...');
      loadReports();
    }, [])
  );

  const renderReportItem = ({ item }: { item: ExpenseReport }) => (
    <SwipeableExpenseReportItem
      report={item}
      onPress={() => handleReportPress(item.id)}
      onDelete={() => handleArchiveReport()}
      onArchiveComplete={loadReports}
      onArchiveConfirm={() => handleShowArchiveModal(item.id)}
    />
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Note Spese</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={navigateToCreateReport}
        >
          <MaterialIcons name="add" size={24} color="white" />
        </TouchableOpacity>
      </View>

      <FlatList
        data={reports}
        renderItem={renderReportItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <MaterialIcons name="receipt-long" size={64} color="#ccc" />
            <Text style={styles.emptyText}>Nessuna nota spese</Text>
            <Text style={styles.emptySubtext}>
              Tocca il pulsante + per creare la tua prima nota spese
            </Text>
          </View>
        }
      />
      
      {/* Archive Confirmation Modal */}
      <Modal
        visible={showArchiveModal}
        transparent={true}
        animationType="fade"
        onRequestClose={handleCancelArchive}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Conferma Archiviazione</Text>
            </View>
            
            <View style={styles.modalBody}>
              <Text style={styles.modalMessage}>
                Sei sicuro di voler archiviare questa nota spese? Potrà essere ripristinata dall'archivio.
              </Text>
            </View>
            
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={handleCancelArchive}
              >
                <Text style={styles.cancelButtonText}>Annulla</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.confirmButton}
                onPress={handleArchiveReport}
              >
                <Text style={styles.confirmButtonText}>Archivia</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  addButton: {
    backgroundColor: '#007AFF',
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContainer: {
    padding: 20,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 100,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ccc',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#ccc',
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    backgroundColor: 'white',
    borderRadius: 12,
    marginHorizontal: 20,
    overflow: 'hidden',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  modalHeader: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 15,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
  },
  modalBody: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  modalMessage: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
  },
  modalButtons: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 15,
    justifyContent: 'center',
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: '#e0e0e0',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#007AFF',
  },
  confirmButton: {
    flex: 1,
    paddingVertical: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FF9500',
  },
});
