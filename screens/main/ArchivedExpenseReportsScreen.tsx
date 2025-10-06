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
  ActivityIndicator,
  ScrollView,
  Modal,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { MaterialIcons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { ExpenseReport } from '../../types';
import { databaseManager } from '../../services/database';
import { expenseReportService } from '../../services/expenseReportService';
import { MainStackParamList } from '../../navigation/MainNavigator';

type ArchivedExpenseReportsScreenNavigationProp = StackNavigationProp<MainStackParamList, 'ArchivedExpenseReports'>;

export function ArchivedExpenseReportsScreen() {
  const navigation = useNavigation<ArchivedExpenseReportsScreenNavigationProp>();

  const [reports, setReports] = useState<ExpenseReport[]>([]);
  const [allReports, setAllReports] = useState<ExpenseReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedReports, setSelectedReports] = useState<Set<string>>(new Set());
  
  // Filter states
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const [customDateFrom, setCustomDateFrom] = useState<Date | null>(null);
  const [customDateTo, setCustomDateTo] = useState<Date | null>(null);
  const [showDateFromPicker, setShowDateFromPicker] = useState(false);
  const [showDateToPicker, setShowDateToPicker] = useState(false);

  const loadArchivedReports = async () => {
    try {
      console.log('📋 Loading archived expense reports...');
      
      // Carica le note spese archiviate dal database
      const archivedReports = await databaseManager.getExpenseReports(true); // include archived
      const onlyArchived = archivedReports.filter(report => report.is_archived);
      
      // Converti al formato API e calcola i totali
      const apiFormatReports = await Promise.all(
        onlyArchived.map(async (report) => {
          // Ottieni le spese associate (incluse quelle archiviate)
          const expenses = await databaseManager.getExpensesByReportId(report.id, true);
          const totalAmount = expenses.reduce((sum, expense) => sum + expense.amount, 0);
          
          return {
            id: report.id,
            name: report.title,
            description: report.description || '',
            startDate: report.created_at,
            endDate: report.updated_at,
            totalAmount,
            createdAt: report.created_at,
            updatedAt: report.updated_at,
            userId: 'local',
          };
        })
      );
      
      console.log(`📋 Found ${apiFormatReports.length} archived expense reports`);
      setAllReports(apiFormatReports);
      setReports(apiFormatReports); // Initially show all archived reports
    } catch (error: any) {
      Alert.alert('Errore', 'Impossibile caricare le note spese archiviate');
      console.error('Error loading archived expense reports:', error);
    } finally {
      setLoading(false);
    }
  };

  // Filter functions (same as ArchivedExpensesScreen)
  const getDateRange = (filter: string): { from: Date; to: Date } | null => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    switch (filter) {
      case 'current_month': {
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
        const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
        return { from: firstDay, to: lastDay };
      }
      case 'previous_month': {
        const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lastDay = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
        return { from: firstDay, to: lastDay };
      }
      case 'current_week': {
        const firstDay = new Date(today);
        firstDay.setDate(today.getDate() - today.getDay() + 1); // Monday
        const lastDay = new Date(firstDay);
        lastDay.setDate(firstDay.getDate() + 6); // Sunday
        lastDay.setHours(23, 59, 59);
        return { from: firstDay, to: lastDay };
      }
      case 'previous_week': {
        const firstDay = new Date(today);
        firstDay.setDate(today.getDate() - today.getDay() - 6); // Previous Monday
        const lastDay = new Date(firstDay);
        lastDay.setDate(firstDay.getDate() + 6); // Previous Sunday
        lastDay.setHours(23, 59, 59);
        return { from: firstDay, to: lastDay };
      }
      case 'custom': {
        if (customDateFrom && customDateTo) {
          const from = new Date(customDateFrom);
          const to = new Date(customDateTo);
          to.setHours(23, 59, 59); // Include the entire end date
          return { from, to };
        }
        return null;
      }
      default:
        return null;
    }
  };

  const applyFilter = (filterType: string) => {
    if (filterType === 'all') {
      setReports(allReports);
      setActiveFilter('all');
      return;
    }

    const dateRange = getDateRange(filterType);
    if (!dateRange) {
      if (filterType === 'custom') {
        Alert.alert('Attenzione', 'Seleziona entrambe le date per il filtro personalizzato');
      }
      return;
    }

    // Filter reports based on creation date
    const filteredReports = allReports.filter(report => {
      const reportDate = new Date(report.createdAt);
      return reportDate >= dateRange.from && reportDate <= dateRange.to;
    });

    setReports(filteredReports);
    setActiveFilter(filterType);
    setShowFilterModal(false);
  };

  const handleFilterPress = () => {
    if (activeFilter !== 'all') {
      clearFilter();
    } else {
      setShowFilterModal(true);
    }
  };

  const clearFilter = () => {
    applyFilter('all');
    setCustomDateFrom(null);
    setCustomDateTo(null);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadArchivedReports();
    setRefreshing(false);
  };

  const handleReportPress = (reportId: string) => {
    navigation.navigate('ExpenseReportDetail', { reportId });
  };

  // Selection mode functions
  const handleToggleSelectionMode = () => {
    setSelectionMode(!selectionMode);
    if (selectionMode) {
      setSelectedReports(new Set());
    }
  };

  const handleSelectReport = (reportId: string) => {
    const newSelection = new Set(selectedReports);
    if (newSelection.has(reportId)) {
      newSelection.delete(reportId);
    } else {
      newSelection.add(reportId);
    }
    setSelectedReports(newSelection);
  };

  const handleSelectAll = () => {
    if (selectedReports.size === reports.length) {
      setSelectedReports(new Set());
    } else {
      setSelectedReports(new Set(reports.map(r => r.id)));
    }
  };

  const handleRestoreReports = async () => {
    if (selectedReports.size === 0) {
      Alert.alert('Attenzione', 'Seleziona almeno una nota spese da ripristinare');
      return;
    }

    Alert.alert(
      'Conferma Ripristino',
      `Ripristinare ${selectedReports.size} note spese selezionate? Tutte le spese associate verranno ripristinate.`,
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Ripristina',
          onPress: async () => {
            try {
              const selectedIds = Array.from(selectedReports);
              
              // Restore all selected reports and their expenses
              for (const reportId of selectedIds) {
                // Ripristina la nota spese
                await databaseManager.updateExpenseReport(reportId, {
                  is_archived: false,
                  sync_status: 'pending'
                });
                
                // Ripristina tutte le spese associate
                const expenses = await databaseManager.getExpensesByReportId(reportId, true); // include archived
                for (const expense of expenses.filter(e => e.is_archived)) {
                  await databaseManager.updateExpenseArchiveStatus(expense.id, false);
                }
              }
              
              setSelectedReports(new Set());
              setSelectionMode(false);
              await loadArchivedReports(); // Reload the list
              
              Alert.alert('Successo', `${selectedIds.length} nota spese ripristinate con successo`);
            } catch (error: any) {
              console.error('Error restoring reports:', error);
              Alert.alert('Errore', 'Impossibile ripristinare le note spese');
            }
          }
        }
      ]
    );
  };

  useFocusEffect(
    useCallback(() => {
      console.log('📋 ArchivedExpenseReportsScreen focused, loading reports...');
      loadArchivedReports();
    }, [])
  );

  const renderFilterModal = () => (
    <Modal
      visible={showFilterModal}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => setShowFilterModal(false)}
    >
      <SafeAreaView style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <TouchableOpacity
            onPress={() => setShowFilterModal(false)}
            style={styles.modalCloseButton}
          >
            <Text style={styles.modalCloseText}>Annulla</Text>
          </TouchableOpacity>
          <Text style={styles.modalTitle}>Filtra Note Spese</Text>
          <TouchableOpacity
            onPress={() => {
              setShowFilterModal(false);
              clearFilter();
            }}
            style={styles.modalClearButton}
          >
            <Text style={styles.modalClearText}>Cancella</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.modalContent}>
          {[
            { key: 'current_month', label: 'Mese corrente' },
            { key: 'previous_month', label: 'Mese precedente' },
            { key: 'current_week', label: 'Settimana corrente' },
            { key: 'previous_week', label: 'Settimana precedente' },
            { key: 'custom', label: 'Personalizzato' },
          ].map((filter) => (
            <TouchableOpacity
              key={filter.key}
              style={[
                styles.filterOption,
                activeFilter === filter.key && styles.filterOptionActive
              ]}
              onPress={() => applyFilter(filter.key)}
            >
              <Text style={[
                styles.filterOptionText,
                activeFilter === filter.key && styles.filterOptionTextActive
              ]}>
                {filter.label}
              </Text>
            </TouchableOpacity>
          ))}

          {/* Custom date range picker */}
          <View style={styles.customDateSection}>
            <Text style={styles.customDateTitle}>Date personalizzate</Text>
            
            <View style={styles.datePickerRow}>
              <Text style={styles.dateLabel}>Da:</Text>
              <TouchableOpacity
                style={styles.datePicker}
                onPress={() => setShowDateFromPicker(true)}
              >
                <Text style={styles.dateText}>
                  {customDateFrom ? customDateFrom.toLocaleDateString('it-IT') : 'Seleziona data'}
                </Text>
                <MaterialIcons name="calendar-today" size={20} color="#007AFF" />
              </TouchableOpacity>
            </View>

            <View style={styles.datePickerRow}>
              <Text style={styles.dateLabel}>A:</Text>
              <TouchableOpacity
                style={styles.datePicker}
                onPress={() => setShowDateToPicker(true)}
              >
                <Text style={styles.dateText}>
                  {customDateTo ? customDateTo.toLocaleDateString('it-IT') : 'Seleziona data'}
                </Text>
                <MaterialIcons name="calendar-today" size={20} color="#007AFF" />
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>

        {/* Date pickers */}
        {showDateFromPicker && (
          <DateTimePicker
            value={customDateFrom || new Date()}
            mode="date"
            display="default"
            onChange={(event, selectedDate) => {
              setShowDateFromPicker(false);
              if (selectedDate) {
                setCustomDateFrom(selectedDate);
              }
            }}
          />
        )}

        {showDateToPicker && (
          <DateTimePicker
            value={customDateTo || new Date()}
            mode="date"
            display="default"
            onChange={(event, selectedDate) => {
              setShowDateToPicker(false);
              if (selectedDate) {
                setCustomDateTo(selectedDate);
              }
            }}
          />
        )}
      </SafeAreaView>
    </Modal>
  );

  const renderReportItem = ({ item }: { item: ExpenseReport }) => (
    <TouchableOpacity
      style={[
        styles.reportItem,
        selectionMode && selectedReports.has(item.id) && styles.reportItemSelected
      ]}
      onPress={() => {
        if (selectionMode) {
          handleSelectReport(item.id);
        } else {
          handleReportPress(item.id);
        }
      }}
    >
      {selectionMode && (
        <View style={styles.checkboxContainer}>
          <MaterialIcons
            name={selectedReports.has(item.id) ? 'check-box' : 'check-box-outline-blank'}
            size={24}
            color="#007AFF"
          />
        </View>
      )}
      
      <View style={styles.reportInfo}>
        <View style={styles.reportHeader}>
          <MaterialIcons name="folder" size={20} color="#FF6B35" />
          <Text style={styles.reportName} numberOfLines={1}>
            {item.name}
          </Text>
        </View>
        
        {item.description && (
          <Text style={styles.reportDescription} numberOfLines={2}>
            {item.description}
          </Text>
        )}
        
        <View style={styles.reportFooter}>
          <Text style={styles.reportDate}>
            Creata: {new Date(item.createdAt).toLocaleDateString('it-IT')}
          </Text>
          <Text style={styles.reportAmount}>
            €{item.totalAmount.toFixed(2)}
          </Text>
        </View>
      </View>
      
      {!selectionMode && (
        <MaterialIcons name="chevron-right" size={24} color="#ccc" />
      )}
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Caricamento note spese archiviate...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <MaterialIcons name="arrow-back" size={24} color="#007AFF" />
        </TouchableOpacity>
        
        <Text style={styles.title}>Archivio Note Spese</Text>
        
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.filterButton}
            onPress={handleFilterPress}
          >
            <MaterialIcons
              name={activeFilter !== 'all' ? 'filter-list-off' : 'filter-list'}
              size={24}
              color={activeFilter !== 'all' ? '#FF6B35' : '#007AFF'}
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* Selection mode header */}
      {selectionMode && (
        <View style={styles.selectionHeader}>
          <Text style={styles.selectionText}>
            {selectedReports.size} selezionate
          </Text>
          <View style={styles.selectionActions}>
            <TouchableOpacity
              style={styles.selectAllButton}
              onPress={handleSelectAll}
            >
              <Text style={styles.selectAllText}>
                {selectedReports.size === reports.length ? 'Deseleziona' : 'Seleziona tutto'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.restoreButton,
                selectedReports.size === 0 && styles.restoreButtonDisabled
              ]}
              onPress={handleRestoreReports}
              disabled={selectedReports.size === 0}
            >
              <MaterialIcons name="unarchive" size={16} color="white" />
              <Text style={styles.restoreButtonText}>Ripristina</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

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
            <MaterialIcons name="folder-off" size={64} color="#ccc" />
            <Text style={styles.emptyText}>Nessuna nota spese archiviata</Text>
            <Text style={styles.emptySubtext}>
              Le note spese archiviate appariranno qui
            </Text>
          </View>
        }
      />

      {/* Floating action button for selection mode */}
      <TouchableOpacity
        style={[
          styles.fab,
          selectionMode && styles.fabActive
        ]}
        onPress={handleToggleSelectionMode}
      >
        <MaterialIcons
          name={selectionMode ? 'close' : 'checklist'}
          size={24}
          color="white"
        />
      </TouchableOpacity>

      {renderFilterModal()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  backButton: {
    padding: 8,
    marginLeft: -8,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 16,
  },
  headerActions: {
    flexDirection: 'row',
  },
  filterButton: {
    padding: 8,
    marginRight: -8,
  },
  selectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#E3F2FD',
    borderBottomWidth: 1,
    borderBottomColor: '#BBDEFB',
  },
  selectionText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1976D2',
  },
  selectionActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  selectAllButton: {
    marginRight: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  selectAllText: {
    color: '#1976D2',
    fontSize: 14,
    fontWeight: '500',
  },
  restoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4CAF50',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  restoreButtonDisabled: {
    backgroundColor: '#ccc',
  },
  restoreButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '500',
    marginLeft: 4,
  },
  listContainer: {
    padding: 16,
    paddingBottom: 80, // Space for FAB
  },
  reportItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    padding: 16,
    marginBottom: 8,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  reportItemSelected: {
    backgroundColor: '#E3F2FD',
    borderColor: '#007AFF',
    borderWidth: 2,
  },
  checkboxContainer: {
    marginRight: 12,
  },
  reportInfo: {
    flex: 1,
  },
  reportHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  reportName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginLeft: 8,
    flex: 1,
  },
  reportDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  reportFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  reportDate: {
    fontSize: 12,
    color: '#999',
  },
  reportAmount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FF6B35',
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
  },
  fab: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  fabActive: {
    backgroundColor: '#FF6B35',
  },
  // Modal styles (same as ArchivedExpensesScreen)
  modalContainer: {
    flex: 1,
    backgroundColor: 'white',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  modalCloseButton: {
    padding: 8,
  },
  modalCloseText: {
    color: '#007AFF',
    fontSize: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  modalClearButton: {
    padding: 8,
  },
  modalClearText: {
    color: '#FF6B35',
    fontSize: 16,
  },
  modalContent: {
    flex: 1,
    padding: 16,
  },
  filterOption: {
    padding: 16,
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: '#f8f8f8',
  },
  filterOptionActive: {
    backgroundColor: '#E3F2FD',
    borderColor: '#007AFF',
    borderWidth: 1,
  },
  filterOptionText: {
    fontSize: 16,
    color: '#333',
  },
  filterOptionTextActive: {
    color: '#007AFF',
    fontWeight: '500',
  },
  customDateSection: {
    marginTop: 20,
    padding: 16,
    backgroundColor: '#f8f8f8',
    borderRadius: 8,
  },
  customDateTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  datePickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  dateLabel: {
    fontSize: 14,
    color: '#666',
    width: 40,
  },
  datePicker: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    backgroundColor: 'white',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    marginLeft: 8,
  },
  dateText: {
    fontSize: 14,
    color: '#333',
  },
});
