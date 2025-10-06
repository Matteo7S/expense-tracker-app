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
import { Expense, ExpenseCategory } from '../../types';
import { expenseService } from '../../services/expenseService';
import { databaseManager } from '../../services/database';
import { MainStackParamList } from '../../navigation/MainNavigator';
import { SwipeableExpenseItem } from '../../components/SwipeableExpenseItem.fallback';

type ArchivedExpensesScreenNavigationProp = StackNavigationProp<MainStackParamList, 'ArchivedExpenses'>;

export function ArchivedExpensesScreen() {
  const navigation = useNavigation<ArchivedExpensesScreenNavigationProp>();

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [allExpenses, setAllExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedExpenses, setSelectedExpenses] = useState<Set<string>>(new Set());
  
  // Filter states
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const [customDateFrom, setCustomDateFrom] = useState<Date | null>(null);
  const [customDateTo, setCustomDateTo] = useState<Date | null>(null);
  const [showDateFromPicker, setShowDateFromPicker] = useState(false);
  const [showDateToPicker, setShowDateToPicker] = useState(false);
  
  // Intelligent restore modal state
  const [showRestoreChoiceModal, setShowRestoreChoiceModal] = useState(false);
  const [pendingRestoreExpenseId, setPendingRestoreExpenseId] = useState<string | null>(null);
  const [pendingRestoreExpense, setPendingRestoreExpense] = useState<Expense | null>(null);
  const [pendingRestoreReportName, setPendingRestoreReportName] = useState<string | null>(null);

  const loadArchivedExpenses = async () => {
    try {
      console.log('📦 [ARCHIVED] Loading archived expenses from database...');
      
      // Carica direttamente dal database locale per debug
      const localArchivedExpenses = await databaseManager.getAllArchivedExpenses();
      console.log(`📦 [ARCHIVED] Found ${localArchivedExpenses.length} archived expenses in LOCAL database`);
      localArchivedExpenses.forEach((expense, index) => {
        console.log(`  ${index + 1}. ID: ${expense.id}, Amount: ${expense.amount}, Archived: ${expense.is_archived}, Merchant: ${expense.merchant_name}`);
      });
      
      const archivedExpenses = await expenseService.getArchivedExpenses();
      console.log(`📦 [ARCHIVED] Converted ${archivedExpenses.length} expenses to API format`);
      
      setAllExpenses(archivedExpenses);
      setExpenses(archivedExpenses); // Initially show all archived expenses
    } catch (error: any) {
      Alert.alert('Errore', 'Impossibile caricare le spese archiviate');
      console.error('Error loading archived expenses:', error);
    } finally {
      setLoading(false);
    }
  };

  // Filter functions (same as ExpenseReportDetailScreen)
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
      setExpenses(allExpenses);
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

    // Filter expenses based on receipt date
    const filteredExpenses = allExpenses.filter(expense => {
      const expenseDate = expense.date ? new Date(expense.date) : new Date(expense.createdAt);
      return expenseDate >= dateRange.from && expenseDate <= dateRange.to;
    });

    setExpenses(filteredExpenses);
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
    await loadArchivedExpenses();
    setRefreshing(false);
  };

  const handleExpensePress = (expenseId: string) => {
    navigation.navigate('ExpenseDetail', { expenseId });
  };

  // Selection mode functions
  const handleToggleSelectionMode = () => {
    setSelectionMode(!selectionMode);
    if (selectionMode) {
      setSelectedExpenses(new Set());
    }
  };

  const handleSelectExpense = (expenseId: string) => {
    const newSelection = new Set(selectedExpenses);
    if (newSelection.has(expenseId)) {
      newSelection.delete(expenseId);
    } else {
      newSelection.add(expenseId);
    }
    setSelectedExpenses(newSelection);
  };

  const handleSelectAll = () => {
    if (selectedExpenses.size === expenses.length) {
      setSelectedExpenses(new Set());
    } else {
      setSelectedExpenses(new Set(expenses.map(e => e.id)));
    }
  };

  const handleRestoreExpenses = async () => {
    if (selectedExpenses.size === 0) {
      Alert.alert('Attenzione', 'Seleziona almeno una spesa da ripristinare');
      return;
    }

    Alert.alert(
      'Conferma Ripristino',
      `Ripristinare ${selectedExpenses.size} spese selezionate?`,
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Ripristina',
          onPress: async () => {
            try {
              const selectedIds = Array.from(selectedExpenses);
              
              // Restore all selected expenses
              for (const expenseId of selectedIds) {
                await expenseService.updateExpense(expenseId, {
                  isArchived: false
                });
              }
              
              console.log(`✅ Restored ${selectedIds.length} expenses`);
              
              // Reset selection and reload data
              setSelectionMode(false);
              setSelectedExpenses(new Set());
              await loadArchivedExpenses();
              
            } catch (error) {
              console.error('❌ Failed to restore expenses:', error);
              Alert.alert('Errore', 'Impossibile ripristinare le spese selezionate');
            }
          }
        }
      ]
    );
  };

  // Swipe actions
  const handleEditExpense = (expenseId: string) => {
    navigation.navigate('EditExpense', { expenseId });
  };

  const handleDeleteExpense = async (expenseId: string) => {
    try {
      await expenseService.deleteExpense(expenseId);
      setExpenses(prev => prev.filter(expense => expense.id !== expenseId));
      await loadArchivedExpenses();
      console.log('✅ Expense deleted successfully');
    } catch (error) {
      console.error('❌ Failed to delete expense:', error);
      Alert.alert('Errore', 'Impossibile eliminare la spesa');
    }
  };

  // INTELLIGENT RESTORE LOGIC
  const handleRestoreExpense = async (expenseId: string) => {
    try {
      console.log('🧿 Intelligent restore: analyzing expense', expenseId);
      
      // Find the expense in our current list
      const expense = allExpenses.find(e => e.id === expenseId);
      if (!expense) {
        console.error('❌ Expense not found in allExpenses list');
        Alert.alert('Errore', 'Spesa non trovata');
        return;
      }
      
      console.log('🔍 Found expense:', {
        id: expense.id,
        reportId: expense.reportId,
        expenseReportId: expense.expenseReportId,
        description: expense.description,
        amount: expense.amount
      });
      
      // Get the original expense report from database to check if it's archived
      const reportId = expense.expenseReportId || expense.reportId;
      console.log('🔍 Looking for original report with ID:', reportId);
      
      if (!reportId) {
        console.log('⚠️ No report ID found, restoring to generic');
        await restoreExpenseToGeneric(expenseId);
        return;
      }
      
      const originalReport = await databaseManager.getExpenseReportById(reportId);
      console.log('🔍 Original report lookup result:', originalReport ? {
        id: originalReport.id,
        title: originalReport.title,
        is_archived: originalReport.is_archived
      } : 'NOT FOUND');
      
      if (!originalReport) {
        console.log('⚠️ Original report not found, restoring to generic');
        await restoreExpenseToGeneric(expenseId);
        return;
      }
      
      if (originalReport.is_archived) {
        // Report is archived, show choice modal
        console.log('🧿 Original report is archived, showing choice modal');
        setPendingRestoreExpenseId(expenseId);
        setPendingRestoreExpense(expense);
        setPendingRestoreReportName(originalReport.title);
        setShowRestoreChoiceModal(true);
      } else {
        // Report is active, restore expense directly
        console.log('✅ Original report is active, restoring expense directly');
        await restoreExpenseOnly(expenseId);
      }
      
    } catch (error) {
      console.error('❌ Failed to analyze expense for restore:', error);
      console.error('❌ Error details:', error instanceof Error ? error.message : error);
      Alert.alert('Errore', `Impossibile analizzare la spesa per il ripristino: ${error instanceof Error ? error.message : 'Errore sconosciuto'}`);
    }
  };
  
  // Restore expense and its original report
  const restoreExpenseWithReport = async (expenseId: string) => {
    try {
      console.log('🔁 Restoring expense with original report:', expenseId);
      
      const expense = allExpenses.find(e => e.id === expenseId);
      if (!expense) return;
      
      // Restore the original report first
      const reportId = expense.expenseReportId || expense.reportId;
      await databaseManager.updateExpenseReport(reportId, {
        is_archived: false,
        sync_status: 'pending'
      });
      
      // Then restore the expense
      await databaseManager.updateExpenseArchiveStatus(expenseId, false);
      
      console.log('✅ Expense and report restored successfully');
      setShowRestoreChoiceModal(false);
      setPendingRestoreExpenseId(null);
      setPendingRestoreExpense(null);
      setPendingRestoreReportName(null);
      
      // Remove from current list and reload
      setExpenses(prev => prev.filter(expense => expense.id !== expenseId));
      await loadArchivedExpenses();
      
      Alert.alert('Successo', 'Spesa e nota spese originale ripristinate con successo');
      
    } catch (error) {
      console.error('❌ Failed to restore expense with report:', error);
      Alert.alert('Errore', 'Impossibile ripristinare la spesa con la nota spese originale');
    }
  };
  
  // Restore expense to generic report
  const restoreExpenseToGeneric = async (expenseId: string) => {
    try {
      console.log('📁 Restoring expense to generic report:', expenseId);
      
      // Get or create the generic expense report
      const genericReportId = await databaseManager.getOrCreateGenericExpenseReport();
      
      // Move the expense to the generic report and unarchive it using local update (no sync queue)
      await databaseManager.updateExpenseLocal(expenseId, {
        expense_report_id: genericReportId,
        is_archived: false
      });
      
      console.log('✅ Expense restored to generic report successfully');
      setShowRestoreChoiceModal(false);
      setPendingRestoreExpenseId(null);
      setPendingRestoreExpense(null);
      setPendingRestoreReportName(null);
      
      // Remove from current list and reload
      setExpenses(prev => prev.filter(expense => expense.id !== expenseId));
      await loadArchivedExpenses();
      
      Alert.alert('Successo', 'Spesa ripristinata in "Note Spese Generiche"');
      
    } catch (error) {
      console.error('❌ Failed to restore expense to generic:', error);
      Alert.alert('Errore', 'Impossibile ripristinare la spesa nelle Note Spese Generiche');
    }
  };
  
  // Restore expense only (when original report is already active)
  const restoreExpenseOnly = async (expenseId: string) => {
    try {
      console.log('🔁 Restoring expense only:', expenseId);
      
      // Use local update to avoid sync queue issues
      await databaseManager.updateExpenseLocal(expenseId, {
        is_archived: false
      });
      
      console.log('✅ Expense restored successfully');
      
      // Remove from current list and reload
      setExpenses(prev => prev.filter(expense => expense.id !== expenseId));
      await loadArchivedExpenses();
      
      Alert.alert('Successo', 'Spesa ripristinata con successo');
      
    } catch (error) {
      console.error('❌ Failed to restore expense:', error);
      Alert.alert('Errore', 'Impossibile ripristinare la spesa');
    }
  };
  
  // Cancel restore choice modal
  const cancelRestoreChoice = () => {
    setShowRestoreChoiceModal(false);
    setPendingRestoreExpenseId(null);
    setPendingRestoreExpense(null);
    setPendingRestoreReportName(null);
  };

  useFocusEffect(
    useCallback(() => {
      loadArchivedExpenses();
    }, [])
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Caricamento...</Text>
      </View>
    );
  }

  const renderExpenseItem = ({ item }: { item: Expense }) => (
    <SwipeableExpenseItem
      expense={item}
      onPress={() => handleExpensePress(item.id)}
      onEdit={() => handleEditExpense(item.id)}
      onDelete={() => handleDeleteExpense(item.id)}
      onMove={() => handleRestoreExpense(item.id)} // Use move as restore
      isSelected={selectedExpenses.has(item.id)}
      onSelect={() => handleSelectExpense(item.id)}
      selectionMode={selectionMode}
      moveLabel="Ripristina" // Custom label for the move action
    />
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity 
            style={styles.backButton} 
            onPress={() => navigation.goBack()}
          >
            <MaterialIcons name="arrow-back" size={24} color="#007AFF" />
          </TouchableOpacity>
          <Text style={styles.title}>Archivio Spese</Text>
          <View style={styles.placeholder} />
        </View>

        {/* Expenses list */}
        <View style={styles.expensesSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>
              Spese Archiviate ({expenses.length})
            </Text>
            {(expenses.length > 0 || activeFilter !== 'all') && (
              <View style={styles.headerButtons}>
                <TouchableOpacity
                  style={[styles.filterButton, activeFilter !== 'all' && styles.filterButtonActive]}
                  onPress={handleFilterPress}
                >
                  <MaterialIcons 
                    name="filter-list" 
                    size={20} 
                    color={activeFilter !== 'all' ? "#FF9500" : "#007AFF"} 
                  />
                  <Text style={[styles.filterButtonText, activeFilter !== 'all' && styles.filterButtonTextActive]}>
                    Filtra
                  </Text>
                </TouchableOpacity>
                {expenses.length > 0 && (
                  <TouchableOpacity
                    style={styles.selectionButton}
                    onPress={handleToggleSelectionMode}
                  >
                    <MaterialIcons 
                      name={selectionMode ? "close" : "checklist"} 
                      size={20} 
                      color="#007AFF" 
                    />
                    <Text style={styles.selectionButtonText}>
                      {selectionMode ? 'Annulla' : 'Seleziona'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>

          {/* Selection controls */}
          {selectionMode && (
            <View style={styles.selectionControls}>
              <View style={styles.selectionInfo}>
                <TouchableOpacity
                  style={styles.selectAllButton}
                  onPress={handleSelectAll}
                >
                  <MaterialIcons 
                    name={selectedExpenses.size === expenses.length ? "check-box" : "check-box-outline-blank"} 
                    size={20} 
                    color="#007AFF" 
                  />
                  <Text style={styles.selectAllText}>
                    {selectedExpenses.size === expenses.length ? 'Deseleziona tutto' : 'Seleziona tutto'}
                  </Text>
                </TouchableOpacity>
                
                <Text style={styles.selectedCountText}>
                  {selectedExpenses.size} di {expenses.length} selezionate
                </Text>
              </View>
              
              {selectedExpenses.size > 0 && (
                <TouchableOpacity
                  style={styles.restoreButton}
                  onPress={handleRestoreExpenses}
                >
                  <MaterialIcons name="restore" size={20} color="white" />
                  <Text style={styles.restoreButtonText}>Ripristina</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {expenses.length === 0 ? (
            <View style={styles.emptyContainer}>
              <MaterialIcons name="archive" size={48} color="#ccc" />
              <Text style={styles.emptyText}>Nessuna spesa archiviata</Text>
              <Text style={styles.emptySubtext}>
                Le spese archiviate appariranno qui
              </Text>
            </View>
          ) : (
            <FlatList
              data={expenses}
              renderItem={renderExpenseItem}
              keyExtractor={(item) => item.id}
              scrollEnabled={false}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
            />
          )}
        </View>
      </ScrollView>

      {/* Filter Modal - Same as ExpenseReportDetailScreen */}
      <Modal
        visible={showFilterModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowFilterModal(false)}
      >
        <SafeAreaView style={styles.filterModalContainer}>
          <View style={styles.filterModalHeader}>
            <Text style={styles.filterModalTitle}>Filtra Spese Archiviate</Text>
            <TouchableOpacity
              onPress={() => setShowFilterModal(false)}
              style={styles.filterModalCloseButton}
            >
              <MaterialIcons name="close" size={24} color="#007AFF" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.filterModalContent}>
            {/* Predefined filters */}
            <View style={styles.filterGroup}>
              <Text style={styles.filterGroupTitle}>Filtri Rapidi</Text>
              
              <TouchableOpacity
                style={[styles.filterOption, activeFilter === 'current_month' && styles.filterOptionActive]}
                onPress={() => applyFilter('current_month')}
              >
                <MaterialIcons name="calendar-today" size={20} color={activeFilter === 'current_month' ? "#FF9500" : "#666"} />
                <Text style={[styles.filterOptionText, activeFilter === 'current_month' && styles.filterOptionTextActive]}>
                  Mese Corrente
                </Text>
                {activeFilter === 'current_month' && (
                  <MaterialIcons name="check" size={20} color="#FF9500" />
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.filterOption, activeFilter === 'previous_month' && styles.filterOptionActive]}
                onPress={() => applyFilter('previous_month')}
              >
                <MaterialIcons name="calendar-today" size={20} color={activeFilter === 'previous_month' ? "#FF9500" : "#666"} />
                <Text style={[styles.filterOptionText, activeFilter === 'previous_month' && styles.filterOptionTextActive]}>
                  Mese Precedente
                </Text>
                {activeFilter === 'previous_month' && (
                  <MaterialIcons name="check" size={20} color="#FF9500" />
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.filterOption, activeFilter === 'current_week' && styles.filterOptionActive]}
                onPress={() => applyFilter('current_week')}
              >
                <MaterialIcons name="date-range" size={20} color={activeFilter === 'current_week' ? "#FF9500" : "#666"} />
                <Text style={[styles.filterOptionText, activeFilter === 'current_week' && styles.filterOptionTextActive]}>
                  Settimana Corrente
                </Text>
                {activeFilter === 'current_week' && (
                  <MaterialIcons name="check" size={20} color="#FF9500" />
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.filterOption, activeFilter === 'previous_week' && styles.filterOptionActive]}
                onPress={() => applyFilter('previous_week')}
              >
                <MaterialIcons name="date-range" size={20} color={activeFilter === 'previous_week' ? "#FF9500" : "#666"} />
                <Text style={[styles.filterOptionText, activeFilter === 'previous_week' && styles.filterOptionTextActive]}>
                  Settimana Precedente
                </Text>
                {activeFilter === 'previous_week' && (
                  <MaterialIcons name="check" size={20} color="#FF9500" />
                )}
              </TouchableOpacity>
            </View>

            {/* Custom date range */}
            <View style={styles.filterGroup}>
              <Text style={styles.filterGroupTitle}>Periodo Personalizzato</Text>
              
              <View style={styles.customDateRow}>
                <Text style={styles.customDateLabel}>Da:</Text>
                <TouchableOpacity
                  style={styles.datePickerButton}
                  onPress={() => setShowDateFromPicker(true)}
                >
                  <Text style={styles.datePickerButtonText}>
                    {customDateFrom ? customDateFrom.toLocaleDateString('it-IT') : 'Seleziona data'}
                  </Text>
                  <MaterialIcons name="calendar-today" size={20} color="#007AFF" />
                </TouchableOpacity>
              </View>

              <View style={styles.customDateRow}>
                <Text style={styles.customDateLabel}>A:</Text>
                <TouchableOpacity
                  style={styles.datePickerButton}
                  onPress={() => setShowDateToPicker(true)}
                >
                  <Text style={styles.datePickerButtonText}>
                    {customDateTo ? customDateTo.toLocaleDateString('it-IT') : 'Seleziona data'}
                  </Text>
                  <MaterialIcons name="calendar-today" size={20} color="#007AFF" />
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={[
                  styles.applyCustomFilterButton,
                  (!customDateFrom || !customDateTo) && styles.applyCustomFilterButtonDisabled
                ]}
                onPress={() => applyFilter('custom')}
                disabled={!customDateFrom || !customDateTo}
              >
                <Text style={[
                  styles.applyCustomFilterButtonText,
                  (!customDateFrom || !customDateTo) && styles.applyCustomFilterButtonTextDisabled
                ]}>
                  Applica Filtro Personalizzato
                </Text>
              </TouchableOpacity>
            </View>

            {/* Clear filter */}
            {activeFilter !== 'all' && (
              <TouchableOpacity
                style={styles.clearAllFiltersButton}
                onPress={() => {
                  clearFilter();
                  setShowFilterModal(false);
                }}
              >
                <MaterialIcons name="clear-all" size={20} color="#dc3545" />
                <Text style={styles.clearAllFiltersButtonText}>Rimuovi Tutti i Filtri</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Date Pickers */}
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
      
      {/* Intelligent Restore Choice Modal */}
      <Modal
        visible={showRestoreChoiceModal}
        animationType="fade"
        transparent={true}
        onRequestClose={cancelRestoreChoice}
      >
        <View style={styles.restoreModalOverlay}>
          <View style={styles.restoreModalContainer}>
            <View style={styles.restoreModalHeader}>
              <MaterialIcons name="restore" size={24} color="#007AFF" />
              <Text style={styles.restoreModalTitle}>Opzioni di Ripristino</Text>
            </View>
            
            <View style={styles.restoreModalContent}>
              <Text style={styles.restoreModalText}>
                La nota spese originale "{pendingRestoreReportName}" è archiviata.
                Come vuoi ripristinare questa spesa?
              </Text>
              
              <View style={styles.restoreOptionsContainer}>
                <TouchableOpacity
                  style={styles.restoreOptionButton}
                  onPress={() => pendingRestoreExpenseId && restoreExpenseWithReport(pendingRestoreExpenseId)}
                >
                  <MaterialIcons name="unarchive" size={20} color="#4CAF50" />
                  <View style={styles.restoreOptionTextContainer}>
                    <Text style={styles.restoreOptionTitle}>Ripristina con Nota Spese Originale</Text>
                    <Text style={styles.restoreOptionDescription}>
                      Ripristina sia la spesa che la nota spese "{pendingRestoreReportName}"
                    </Text>
                  </View>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={styles.restoreOptionButton}
                  onPress={() => pendingRestoreExpenseId && restoreExpenseToGeneric(pendingRestoreExpenseId)}
                >
                  <MaterialIcons name="folder" size={20} color="#FF6B35" />
                  <View style={styles.restoreOptionTextContainer}>
                    <Text style={styles.restoreOptionTitle}>Ripristina in Note Spese Generiche</Text>
                    <Text style={styles.restoreOptionDescription}>
                      Sposta la spesa nelle "Note Spese Generiche"
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>
            </View>
            
            <View style={styles.restoreModalActions}>
              <TouchableOpacity
                style={styles.restoreModalCancelButton}
                onPress={cancelRestoreChoice}
              >
                <Text style={styles.restoreModalCancelText}>Annulla</Text>
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
  scrollView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
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
    padding: 20,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  backButton: {
    padding: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  placeholder: {
    width: 32,
  },
  expensesSection: {
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#e3f2fd',
    borderRadius: 16,
    marginRight: 8,
  },
  filterButtonActive: {
    backgroundColor: '#fff3e0',
  },
  filterButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#007AFF',
    marginLeft: 4,
  },
  filterButtonTextActive: {
    color: '#FF9500',
  },
  selectionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#e3f2fd',
    borderRadius: 16,
  },
  selectionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#007AFF',
    marginLeft: 4,
  },
  selectionControls: {
    backgroundColor: '#f0f8ff',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  selectionInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  selectAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  selectAllText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#007AFF',
    marginLeft: 6,
  },
  selectedCountText: {
    fontSize: 12,
    color: '#666',
  },
  restoreButton: {
    backgroundColor: '#28a745',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  restoreButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 6,
  },
  separator: {
    height: 12,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ccc',
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#ccc',
    marginTop: 4,
  },
  // Filter Modal styles (copied from ExpenseReportDetailScreen)
  filterModalContainer: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  filterModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  filterModalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
  },
  filterModalCloseButton: {
    padding: 4,
  },
  filterModalContent: {
    flex: 1,
    paddingHorizontal: 20,
  },
  filterGroup: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginTop: 20,
    marginBottom: 8,
  },
  filterGroupTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
  },
  filterOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: '#f8f9fa',
  },
  filterOptionActive: {
    backgroundColor: '#fff3e0',
    borderWidth: 1,
    borderColor: '#FF9500',
  },
  filterOptionText: {
    flex: 1,
    fontSize: 16,
    color: '#333',
    marginLeft: 12,
  },
  filterOptionTextActive: {
    color: '#FF9500',
    fontWeight: '600',
  },
  // Custom date picker styles
  customDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  customDateLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    width: 30,
    marginRight: 12,
  },
  datePickerButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  datePickerButtonText: {
    fontSize: 16,
    color: '#333',
  },
  applyCustomFilterButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 16,
  },
  applyCustomFilterButtonDisabled: {
    backgroundColor: '#ccc',
  },
  applyCustomFilterButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  applyCustomFilterButtonTextDisabled: {
    color: '#999',
  },
  clearAllFiltersButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'white',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#dc3545',
    marginTop: 20,
    marginBottom: 20,
  },
  clearAllFiltersButtonText: {
    color: '#dc3545',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  // Intelligent Restore Modal styles
  restoreModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  restoreModalContainer: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  restoreModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  restoreModalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginLeft: 8,
  },
  restoreModalContent: {
    marginBottom: 20,
  },
  restoreModalText: {
    fontSize: 16,
    color: '#666',
    lineHeight: 22,
    marginBottom: 20,
  },
  restoreOptionsContainer: {
    gap: 12,
  },
  restoreOptionButton: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  restoreOptionTextContainer: {
    flex: 1,
    marginLeft: 12,
  },
  restoreOptionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  restoreOptionDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 18,
  },
  restoreModalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  restoreModalCancelButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  restoreModalCancelText: {
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '500',
  },
});
