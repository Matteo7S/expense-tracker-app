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
import { useNavigation, useRoute, RouteProp, useFocusEffect } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { MaterialIcons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { ExpenseReport, Expense, ExpenseCategory } from '../../types';
import { expenseReportService } from '../../services/expenseReportService';
import { expenseService } from '../../services/expenseService';
import { MainStackParamList } from '../../navigation/MainNavigator';
import { CustomAlert } from '../../components/CustomAlert';
import { SwipeableExpenseItem } from '../../components/SwipeableExpenseItem.fallback';
import { ExpenseTransferModal } from '../../components/ExpenseTransferModal';
import { databaseManager } from '../../services/database';

type ExpenseReportDetailScreenNavigationProp = StackNavigationProp<MainStackParamList, 'ExpenseReportDetail'>;
type ExpenseReportDetailScreenRouteProp = RouteProp<MainStackParamList, 'ExpenseReportDetail'>;

interface ExpenseItemProps {
  expense: Expense;
  onPress: () => void;
  onDelete: () => void;
}

function ExpenseItem({ expense, onPress, onDelete }: ExpenseItemProps) {
  const getCategoryIcon = (category: ExpenseCategory) => {
    switch (category) {
      case ExpenseCategory.FOOD:
        return 'restaurant';
      case ExpenseCategory.TRANSPORT:
        return 'directions-car';
      case ExpenseCategory.ACCOMMODATION:
        return 'hotel';
      case ExpenseCategory.ENTERTAINMENT:
        return 'movie';
      case ExpenseCategory.SHOPPING:
        return 'shopping-bag';
      case ExpenseCategory.HEALTH:
        return 'local-hospital';
      case ExpenseCategory.BUSINESS:
        return 'business';
      default:
        return 'receipt';
    }
  };

  const getCategoryColor = (category: ExpenseCategory) => {
    switch (category) {
      case ExpenseCategory.FOOD:
        return '#FF6B6B';
      case ExpenseCategory.TRANSPORT:
        return '#4ECDC4';
      case ExpenseCategory.ACCOMMODATION:
        return '#45B7D1';
      case ExpenseCategory.ENTERTAINMENT:
        return '#96CEB4';
      case ExpenseCategory.SHOPPING:
        return '#FFEAA7';
      case ExpenseCategory.HEALTH:
        return '#DDA0DD';
      case ExpenseCategory.BUSINESS:
        return '#98D8C8';
      default:
        return '#BDC3C7';
    }
  };

  const handleDeletePress = (e: any) => {
    e.stopPropagation();
    onDelete();
  };

  return (
    <View style={styles.expenseItem}>
      <TouchableOpacity style={styles.expenseMain} onPress={onPress}>
        <View style={[styles.categoryIcon, { backgroundColor: getCategoryColor(expense.category) }]}>
          <MaterialIcons name={getCategoryIcon(expense.category) as any} size={24} color="white" />
        </View>
        <View style={styles.expenseInfo}>
          <Text style={styles.expenseDescription}>{expense.description}</Text>
          <Text style={styles.expenseCategory}>
            {expense.category}
            {expense.subcategory && ` • ${expense.subcategory}`}
          </Text>
          {expense.numberOfPeople && expense.numberOfPeople > 1 && (
            <Text style={styles.expensePeople}>
              {expense.numberOfPeople} persone
            </Text>
          )}
          <Text style={styles.expenseDate}>
            {new Date(expense.createdAt).toLocaleDateString('it-IT')}
          </Text>
        </View>
        <Text style={styles.expenseAmount}>€{expense.amount.toFixed(2)}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.deleteExpenseButton} onPress={handleDeletePress}>
        <MaterialIcons name="delete" size={20} color="#ff4444" />
      </TouchableOpacity>
    </View>
  );
}

export function ExpenseReportDetailScreen() {
  const navigation = useNavigation<ExpenseReportDetailScreenNavigationProp>();
  const route = useRoute<ExpenseReportDetailScreenRouteProp>();
  const { reportId } = route.params;

  const [report, setReport] = useState<ExpenseReport | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [allExpenses, setAllExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [deleteExpenseAlert, setDeleteExpenseAlert] = useState<{
    visible: boolean;
    expenseId: string | null;
  }>({ visible: false, expenseId: null });
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedExpenses, setSelectedExpenses] = useState<Set<string>>(new Set());
  const [showTransferModal, setShowTransferModal] = useState(false);
  
  // Filter states
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [activeFilter, setActiveFilter] = useState<string>('previous_month');
  const [customDateFrom, setCustomDateFrom] = useState<Date | null>(null);
  const [customDateTo, setCustomDateTo] = useState<Date | null>(null);
  const [showDateFromPicker, setShowDateFromPicker] = useState(false);
  const [showDateToPicker, setShowDateToPicker] = useState(false);
  const [tempCustomDateFrom, setTempCustomDateFrom] = useState<Date | null>(null);
  const [tempCustomDateTo, setTempCustomDateTo] = useState<Date | null>(null);
  // Archive confirmation modal states
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [selectedExpenseIdForArchive, setSelectedExpenseIdForArchive] = useState<string | null>(null);

  // Filter functions
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

  const loadReportData = async () => {
    try {
      // Prima carica i dati della nota spese per vedere se è archiviata
      const reportData = await expenseReportService.getExpenseReport(reportId);
      
      // Controlla se la nota spese è archiviata dal database locale
      const localReport = await databaseManager.getExpenseReportById(reportId);
      const isReportArchived = localReport?.is_archived || false;
      
      console.log(`📋 Report ${reportId} archived status: ${isReportArchived}`);
      
      // Carica le spese appropriate (archiviate se la nota è archiviata, attive altrimenti)
      const expensesData = await expenseService.getExpenses(reportId, isReportArchived);
      
      setReport(reportData);
      setAllExpenses(expensesData);
      // Apply default filter (previous month)
      const dateRange = getDateRange('previous_month');
      if (dateRange) {
        const filteredExpenses = expensesData.filter(expense => {
          const expenseDate = expense.date ? new Date(expense.date) : new Date(expense.createdAt);
          return expenseDate >= dateRange.from && expenseDate <= dateRange.to;
        });
        setExpenses(filteredExpenses);
      } else {
        setExpenses(expensesData);
      }
    } catch (error: any) {
      Alert.alert('Errore', 'Impossibile caricare i dettagli della nota spese');
      console.error('Error loading report data:', error);
    } finally {
      setLoading(false);
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

    // Filter expenses based on receipt date (not creation date)
    const filteredExpenses = allExpenses.filter(expense => {
      // Use expense.date if available (receipt date), otherwise fall back to createdAt
      const expenseDate = expense.date ? new Date(expense.date) : new Date(expense.createdAt);
      return expenseDate >= dateRange.from && expenseDate <= dateRange.to;
    });

    setExpenses(filteredExpenses);
    setActiveFilter(filterType);
    setShowFilterModal(false);
  };

  const handleFilterPress = () => {
    // Initialize temp dates with current custom dates
    setTempCustomDateFrom(customDateFrom);
    setTempCustomDateTo(customDateTo);
    setShowFilterModal(true);
  };

  const getMonthName = (monthOffset: number = 0): string => {
    const date = new Date();
    date.setMonth(date.getMonth() + monthOffset);
    return date.toLocaleDateString('it-IT', { month: 'long' });
  };

  const clearFilter = () => {
    applyFilter('all');
    setCustomDateFrom(null);
    setCustomDateTo(null);
    setTempCustomDateFrom(null);
    setTempCustomDateTo(null);
  };

  const applyCustomFilter = () => {
    if (!tempCustomDateFrom || !tempCustomDateTo) {
      Alert.alert('Attenzione', 'Seleziona entrambe le date per il filtro personalizzato');
      return;
    }
    
    setCustomDateFrom(tempCustomDateFrom);
    setCustomDateTo(tempCustomDateTo);
    
    const dateRange = {
      from: new Date(tempCustomDateFrom),
      to: new Date(tempCustomDateTo)
    };
    dateRange.to.setHours(23, 59, 59);
    
    const filteredExpenses = allExpenses.filter(expense => {
      const expenseDate = expense.date ? new Date(expense.date) : new Date(expense.createdAt);
      return expenseDate >= dateRange.from && expenseDate <= dateRange.to;
    });
    
    setExpenses(filteredExpenses);
    setActiveFilter('custom');
    setShowFilterModal(false);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadReportData();
    setRefreshing(false);
  };

  const handleEditReport = () => {
    if (report) {
      navigation.navigate('EditExpenseReport', { report });
    }
  };

  const handleAddExpense = () => {
    navigation.navigate('CreateExpense', { reportId });
  };

  const handleExpensePress = (expenseId: string) => {
    navigation.navigate('ExpenseDetail', { expenseId });
  };

  const handleDeleteExpense = async (expenseId: string) => {
    console.log('🗑️ Archive expense pressed for ID:', expenseId);
    console.log('📱 Showing CustomAlert for expense archiving...');
    
    setDeleteExpenseAlert({
      visible: true,
      expenseId: expenseId,
    });
  };

  const handleDeleteExpenseConfirm = async () => {
    if (!deleteExpenseAlert.expenseId) return;

    try {
      console.log('🗑️ User confirmed expense archiving. Archiving expense...', deleteExpenseAlert.expenseId);
      
      // Verifica lo stato prima dell'archiviazione
      const expenseBefore = await databaseManager.getExpenseById(deleteExpenseAlert.expenseId);
      console.log('📊 [ARCHIVE] Expense before archiving:', {
        id: expenseBefore?.id,
        server_id: expenseBefore?.server_id,
        is_archived: expenseBefore?.is_archived,
        amount: expenseBefore?.amount
      });
      
      // Usa soft delete (archive) invece di hard delete
      await expenseService.updateExpense(deleteExpenseAlert.expenseId, {
        isArchived: true
      });
      
      // Verifica lo stato dopo l'archiviazione
      const expenseAfter = await databaseManager.getExpenseById(deleteExpenseAlert.expenseId);
      console.log('📊 [ARCHIVE] Expense after archiving:', {
        id: expenseAfter?.id,
        server_id: expenseAfter?.server_id,
        is_archived: expenseAfter?.is_archived,
        amount: expenseAfter?.amount,
        sync_status: expenseAfter?.sync_status
      });
      
      // Verifica se è nella sync queue
      const syncQueue = await databaseManager.getSyncQueue();
      const inQueue = syncQueue.find(item => 
        item.table_name === 'expenses' && 
        item.record_id === (expenseAfter?.id || deleteExpenseAlert.expenseId)
      );
      console.log('📊 [ARCHIVE] In sync queue:', inQueue ? `Yes - Action: ${inQueue.action}` : 'No');
      
      setExpenses(prev => prev.filter(expense => expense.id !== deleteExpenseAlert.expenseId));
      // Ricarica i dati del report per aggiornare il totale
      await loadReportData();
      console.log('✅ Expense archived successfully');
    } catch (error: any) {
      console.error('❌ Error archiving expense:', error);
      Alert.alert('Errore', 'Impossibile archiviare la spesa');
    } finally {
      setDeleteExpenseAlert({ visible: false, expenseId: null });
    }
  };

  const handleDeleteExpenseCancel = () => {
    console.log('🚫 User cancelled expense deletion');
    setDeleteExpenseAlert({ visible: false, expenseId: null });
  };

  const handleCameraPress = () => {
    // Navigate directly to Scanner AI (auto-select best available)
    console.log('🔍 Navigating directly to Scanner AI for report:', reportId);
    navigation.navigate('GenericLiveOCRCamera', { reportId });
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

  const handleTransferExpenses = () => {
    if (selectedExpenses.size === 0) {
      Alert.alert('Attenzione', 'Seleziona almeno una spesa da trasferire');
      return;
    }
    setShowTransferModal(true);
  };

  const handleTransferComplete = () => {
    setSelectionMode(false);
    setSelectedExpenses(new Set());
    loadReportData(); // Reload data after transfer
  };

  const handleArchiveExpenses = async () => {
    if (selectedExpenses.size === 0) {
      Alert.alert('Attenzione', 'Seleziona almeno una spesa da archiviare');
      return;
    }

    Alert.alert(
      'Conferma Archiviazione',
      `Archiviare ${selectedExpenses.size} spese selezionate?`,
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Archivia',
          onPress: async () => {
            try {
              const selectedIds = Array.from(selectedExpenses);
              
              // Archive all selected expenses
              for (const expenseId of selectedIds) {
                await expenseService.updateExpense(expenseId, {
                  isArchived: true
                });
              }
              
              console.log(`✅ Archived ${selectedIds.length} expenses`);
              
              // Reset selection and reload data
              setSelectionMode(false);
              setSelectedExpenses(new Set());
              await loadReportData();
              
            } catch (error) {
              console.error('❌ Failed to archive expenses:', error);
              Alert.alert('Errore', 'Impossibile archiviare le spese selezionate');
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

  const handleMoveExpense = (expenseId: string) => {
    setSelectedExpenses(new Set([expenseId]));
    setShowTransferModal(true);
  };

  const handleShowArchiveModal = (expenseId: string) => {
    setSelectedExpenseIdForArchive(expenseId);
    setShowArchiveModal(true);
  };

  const handleArchiveExpenseConfirm = async () => {
    if (!selectedExpenseIdForArchive) return;
    
    try {
      await expenseService.updateExpense(selectedExpenseIdForArchive, {
        isArchived: true
      });
      setExpenses(prev => prev.filter(expense => expense.id !== selectedExpenseIdForArchive));
      await loadReportData();
      console.log('✅ Expense archived successfully');
    } catch (error) {
      console.error('❌ Failed to archive expense:', error);
      Alert.alert('Errore', 'Impossibile archiviare la spesa');
    } finally {
      setShowArchiveModal(false);
      setSelectedExpenseIdForArchive(null);
    }
  };

  const handleCancelArchive = () => {
    setShowArchiveModal(false);
    setSelectedExpenseIdForArchive(null);
  };

  useFocusEffect(
    useCallback(() => {
      loadReportData();
    }, [reportId])
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Caricamento...</Text>
      </View>
    );
  }

  if (!report) {
    return (
      <View style={styles.errorContainer}>
        <MaterialIcons name="error" size={64} color="#ff4444" />
        <Text style={styles.errorText}>Nota spese non trovata</Text>
      </View>
    );
  }

  // Calcola il totale delle spese filtrate
  const filteredTotal = expenses.reduce((sum, expense) => sum + expense.amount, 0);

  // Calcola i totali per mese corrente e precedente
  const getCurrentMonthTotal = () => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    
    return allExpenses
      .filter(expense => {
        const expenseDate = expense.date ? new Date(expense.date) : new Date(expense.createdAt);
        return expenseDate >= firstDay && expenseDate <= lastDay;
      })
      .reduce((sum, expense) => sum + expense.amount, 0);
  };

  const getPreviousMonthTotal = () => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
    
    return allExpenses
      .filter(expense => {
        const expenseDate = expense.date ? new Date(expense.date) : new Date(expense.createdAt);
        return expenseDate >= firstDay && expenseDate <= lastDay;
      })
      .reduce((sum, expense) => sum + expense.amount, 0);
  };

  const currentMonthTotal = getCurrentMonthTotal();
  const previousMonthTotal = getPreviousMonthTotal();
  const currentMonthName = getMonthName(0).charAt(0).toUpperCase() + getMonthName(0).slice(1);
  const previousMonthName = getMonthName(-1).charAt(0).toUpperCase() + getMonthName(-1).slice(1);

  const renderExpenseItem = ({ item }: { item: Expense }) => (
    <SwipeableExpenseItem
      expense={item}
      onPress={() => handleExpensePress(item.id)}
      onEdit={() => handleEditExpense(item.id)}
      onDelete={() => handleShowArchiveModal(item.id)}
      onArchiveConfirm={() => handleShowArchiveModal(item.id)}
      onMove={() => handleMoveExpense(item.id)}
      isSelected={selectedExpenses.has(item.id)}
      onSelect={() => handleSelectExpense(item.id)}
      selectionMode={selectionMode}
      useArchiveInsteadOfDelete={true}
    />
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        {/* Header with report info */}
        <View style={styles.reportHeader}>
          <View style={styles.reportInfo}>
            <Text style={styles.reportName}>{report.name}</Text>
            {report.description && (
              <Text style={styles.reportDescription}>{report.description}</Text>
            )}
            <Text style={styles.reportDates}>
              {new Date(report.startDate).toLocaleDateString('it-IT')} -{' '}
              {new Date(report.endDate).toLocaleDateString('it-IT')}
            </Text>
            <Text style={styles.monthTotal}>
              Totale {currentMonthName}: €{currentMonthTotal.toFixed(2)}
            </Text>
            <Text style={styles.monthTotal}>
              Totale {previousMonthName}: €{previousMonthTotal.toFixed(2)}
            </Text>
            <Text style={styles.reportTotal}>
              Totale: €{filteredTotal.toFixed(2)}
            </Text>
          </View>
          <TouchableOpacity style={styles.editButton} onPress={handleEditReport}>
            <MaterialIcons name="edit" size={24} color="#007AFF" />
          </TouchableOpacity>
        </View>

        {/* Action buttons */}
        <View style={styles.actionButtons}>
          <TouchableOpacity style={styles.actionButton} onPress={handleAddExpense}>
            <MaterialIcons name="add" size={24} color="white" />
            <Text style={styles.actionButtonText}>Nuova Spesa</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={handleCameraPress}>
            <MaterialIcons name="camera-alt" size={24} color="white" />
            <Text style={styles.actionButtonText}>Scansiona</Text>
          </TouchableOpacity>
        </View>

        {/* Expenses list */}
        <View style={styles.expensesSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>
              Spese ({expenses.length})
            </Text>
            {(expenses.length > 0 || activeFilter !== 'all') && (
              <View style={styles.headerButtons}>
                <TouchableOpacity
                  style={[styles.quickFilterButton, activeFilter === 'current_month' && styles.quickFilterButtonActive]}
                  onPress={() => applyFilter('current_month')}
                >
                  <Text style={[styles.quickFilterButtonText, activeFilter === 'current_month' && styles.quickFilterButtonTextActive]}>
                    {getMonthName(0).charAt(0).toUpperCase() + getMonthName(0).slice(1)}
                  </Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={[styles.quickFilterButton, activeFilter === 'previous_month' && styles.quickFilterButtonActive]}
                  onPress={() => applyFilter('previous_month')}
                >
                  <Text style={[styles.quickFilterButtonText, activeFilter === 'previous_month' && styles.quickFilterButtonTextActive]}>
                    {getMonthName(-1).charAt(0).toUpperCase() + getMonthName(-1).slice(1)}
                  </Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={[styles.quickFilterButton, activeFilter === 'custom' && styles.quickFilterButtonActive]}
                  onPress={handleFilterPress}
                >
                  <MaterialIcons 
                    name="filter-list" 
                    size={18} 
                    color={activeFilter === 'custom' ? "#FF9500" : "#007AFF"} 
                  />
                  <Text style={[styles.quickFilterButtonText, activeFilter === 'custom' && styles.quickFilterButtonTextActive]}>
                    Filtro
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
                <View style={styles.actionButtonsRow}>
                  <TouchableOpacity
                    style={styles.transferButton}
                    onPress={handleTransferExpenses}
                  >
                    <MaterialIcons name="swap-horiz" size={20} color="white" />
                    <Text style={styles.transferButtonText}>Trasferisci</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.archiveButton}
                    onPress={handleArchiveExpenses}
                  >
                    <MaterialIcons name="archive" size={20} color="white" />
                    <Text style={styles.archiveButtonText}>Archivia</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}
          {expenses.length === 0 ? (
            <View style={styles.emptyContainer}>
              <MaterialIcons name="receipt" size={48} color="#ccc" />
              <Text style={styles.emptyText}>Nessuna spesa</Text>
              <Text style={styles.emptySubtext}>
                Aggiungi la tua prima spesa
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
      
      <CustomAlert
        visible={deleteExpenseAlert.visible}
        title="Archivia Spesa"
        message="Vuoi archiviare questa spesa? Potrai recuperarla dalla sezione Archivio."
        buttons={[
          {
            text: 'Annulla',
            style: 'cancel',
            onPress: handleDeleteExpenseCancel,
          },
          {
            text: 'Archivia',
            style: 'destructive',
            onPress: handleDeleteExpenseConfirm,
          },
        ]}
        onDismiss={() => setDeleteExpenseAlert({ visible: false, expenseId: null })}
      />

      <ExpenseTransferModal
        visible={showTransferModal}
        onClose={() => setShowTransferModal(false)}
        selectedExpenseIds={Array.from(selectedExpenses)}
        currentReportId={reportId}
        onTransferComplete={handleTransferComplete}
      />

      {/* Filter Modal */}
      <Modal
        visible={showFilterModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowFilterModal(false)}
      >
        <SafeAreaView style={styles.filterModalContainer}>
          <View style={styles.filterModalHeader}>
            <Text style={styles.filterModalTitle}>Filtra Spese</Text>
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
                  onPress={() => setShowDateFromPicker(!showDateFromPicker)}
                >
                  <Text style={styles.datePickerButtonText}>
                    {tempCustomDateFrom ? tempCustomDateFrom.toLocaleDateString('it-IT') : 'Seleziona data'}
                  </Text>
                  <MaterialIcons name="calendar-today" size={20} color="#007AFF" />
                </TouchableOpacity>
              </View>
              
              {showDateFromPicker && (
                <View style={styles.datePickerSpinnerContainer}>
                  <DateTimePicker
                    value={tempCustomDateFrom || new Date()}
                    mode="date"
                    display="compact"
                    onChange={(event, selectedDate) => {
                      if (selectedDate) {
                        setTempCustomDateFrom(selectedDate);
                      }
                    }}
                    locale="it-IT"
                    textColor="#000000"
                    accentColor="#007AFF"
                  />
                  <TouchableOpacity
                    style={styles.datePickerConfirmButton}
                    onPress={() => setShowDateFromPicker(false)}
                  >
                    <Text style={styles.datePickerConfirmButtonText}>Conferma</Text>
                  </TouchableOpacity>
                </View>
              )}

              <View style={styles.customDateRow}>
                <Text style={styles.customDateLabel}>A:</Text>
                <TouchableOpacity
                  style={styles.datePickerButton}
                  onPress={() => setShowDateToPicker(!showDateToPicker)}
                >
                  <Text style={styles.datePickerButtonText}>
                    {tempCustomDateTo ? tempCustomDateTo.toLocaleDateString('it-IT') : 'Seleziona data'}
                  </Text>
                  <MaterialIcons name="calendar-today" size={20} color="#007AFF" />
                </TouchableOpacity>
              </View>
              
              {showDateToPicker && (
                <View style={styles.datePickerSpinnerContainer}>
                  <DateTimePicker
                    value={tempCustomDateTo || new Date()}
                    mode="date"
                    display="compact"
                    onChange={(event, selectedDate) => {
                      if (selectedDate) {
                        setTempCustomDateTo(selectedDate);
                      }
                    }}
                    locale="it-IT"
                    textColor="#000000"
                    accentColor="#007AFF"
                  />
                  <TouchableOpacity
                    style={styles.datePickerConfirmButton}
                    onPress={() => setShowDateToPicker(false)}
                  >
                    <Text style={styles.datePickerConfirmButtonText}>Conferma</Text>
                  </TouchableOpacity>
                </View>
              )}

              <TouchableOpacity
                style={[
                  styles.applyCustomFilterButton,
                  (!tempCustomDateFrom || !tempCustomDateTo) && styles.applyCustomFilterButtonDisabled
                ]}
                onPress={applyCustomFilter}
                disabled={!tempCustomDateFrom || !tempCustomDateTo}
              >
                <Text style={[
                  styles.applyCustomFilterButtonText,
                  (!tempCustomDateFrom || !tempCustomDateTo) && styles.applyCustomFilterButtonTextDisabled
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

      {/* Archive confirmation modal */}
      <CustomAlert
        visible={showArchiveModal}
        title="Conferma Archiviazione"
        message="Sei sicuro di voler archiviare questa spesa? Potrai recuperarla dalle spese archiviate."
        buttons={[
          {
            text: 'Annulla',
            style: 'cancel',
            onPress: handleCancelArchive,
          },
          {
            text: 'Archivia',
            style: 'destructive',
            onPress: handleArchiveExpenseConfirm,
          },
        ]}
        onDismiss={handleCancelArchive}
      />
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  errorText: {
    marginTop: 16,
    fontSize: 18,
    color: '#ff4444',
  },
  reportHeader: {
    backgroundColor: 'white',
    margin: 16,
    padding: 20,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  reportInfo: {
    flex: 1,
  },
  reportName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  reportDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  reportDates: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  reportTotal: {
    fontSize: 18,
    fontWeight: '600',
    color: '#007AFF',
  },
  monthTotal: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  editButton: {
    padding: 8,
  },
  actionButtons: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  actionButton: {
    flex: 1,
    backgroundColor: '#007AFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 8,
    marginHorizontal: 4,
  },
  actionButtonText: {
    color: 'white',
    fontWeight: '600',
    marginLeft: 8,
  },
  expensesSection: {
    paddingHorizontal: 16,
    paddingBottom: 20,
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
  transferButton: {
    flex: 1,
    backgroundColor: '#FF9500',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    marginRight: 8,
  },
  transferButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 6,
  },
  expenseItem: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  expenseMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  categoryIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  expenseInfo: {
    flex: 1,
  },
  expenseDescription: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  expenseCategory: {
    fontSize: 14,
    color: '#666',
    marginBottom: 2,
    textTransform: 'capitalize',
  },
  expensePeople: {
    fontSize: 12,
    color: '#999',
    marginBottom: 2,
  },
  expenseDate: {
    fontSize: 12,
    color: '#999',
  },
  expenseActions: {
    alignItems: 'flex-end',
  },
  expenseAmount: {
    fontSize: 16,
    fontWeight: '600',
    color: '#007AFF',
    marginBottom: 8,
  },
  deleteExpenseButton: {
    padding: 4,
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
  // Filter styles
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
  quickFilterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#e3f2fd',
    borderRadius: 16,
    marginRight: 6,
  },
  quickFilterButtonActive: {
    backgroundColor: '#FF9500',
  },
  quickFilterButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#007AFF',
    marginLeft: 2,
  },
  quickFilterButtonTextActive: {
    color: '#fff',
  },
  clearFilterButton: {
    marginLeft: 4,
  },
  clearFilterText: {
    fontSize: 14,
    color: '#FF9500',
    textDecorationLine: 'underline',
  },
  datePickerSpinnerContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginVertical: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  datePickerConfirmButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 12,
  },
  datePickerConfirmButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  // Filter Modal styles
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
  // Action buttons row for selection mode
  actionButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  archiveButton: {
    flex: 1,
    backgroundColor: '#6c757d',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    marginLeft: 8,
  },
  archiveButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 6,
  },
});
