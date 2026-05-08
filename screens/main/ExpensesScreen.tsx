import React, { useState, useCallback, useRef, useEffect } from 'react';
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
import { MainStackParamList } from '../../navigation/MainNavigator';
import { CustomAlert } from '../../components/CustomAlert';
import { SwipeableExpenseItem } from '../../components/SwipeableExpenseItem.fallback';
import { databaseManager } from '../../services/database';
import { useExpenseRefresh } from '../../hooks/useExpenseRefresh';
import { useI18n } from '../../i18n';

type ExpensesScreenNavigationProp = StackNavigationProp<MainStackParamList, 'ExpenseReportsTabs'>;

function ExpenseItem({ expense, onPress, onDelete }: { expense: Expense; onPress: () => void; onDelete: () => void }) {
  const { formatCurrency, formatDate } = useI18n();

  const getCategoryIcon = (category: ExpenseCategory) => {
    switch (category) {
      case ExpenseCategory.FOOD: return 'restaurant';
      case ExpenseCategory.TRANSPORT: return 'directions-car';
      case ExpenseCategory.ACCOMMODATION: return 'hotel';
      case ExpenseCategory.ENTERTAINMENT: return 'movie';
      case ExpenseCategory.SHOPPING: return 'shopping-bag';
      case ExpenseCategory.HEALTH: return 'local-hospital';
      case ExpenseCategory.BUSINESS: return 'business';
      default: return 'receipt';
    }
  };

  const getCategoryColor = (category: ExpenseCategory) => {
    switch (category) {
      case ExpenseCategory.FOOD: return '#FF6B6B';
      case ExpenseCategory.TRANSPORT: return '#4ECDC4';
      case ExpenseCategory.ACCOMMODATION: return '#45B7D1';
      case ExpenseCategory.ENTERTAINMENT: return '#96CEB4';
      case ExpenseCategory.SHOPPING: return '#FFEAA7';
      case ExpenseCategory.HEALTH: return '#DDA0DD';
      case ExpenseCategory.BUSINESS: return '#98D8C8';
      default: return '#BDC3C7';
    }
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
          <Text style={styles.expenseDate}>
            {formatDate(expense.date || expense.createdAt)}
          </Text>
        </View>
        <Text style={styles.expenseAmount}>
          {formatCurrency(expense.amount, expense.currency || 'EUR')}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.deleteExpenseButton} onPress={(e) => { (e as any).stopPropagation?.(); onDelete(); }}>
        <MaterialIcons name="delete" size={20} color="#ff4444" />
      </TouchableOpacity>
    </View>
  );
}

export function ExpensesScreen() {
  const navigation = useNavigation<ExpensesScreenNavigationProp>();
  const { formatCurrency, formatDate, locale, t } = useI18n();
  const [defaultReportId, setDefaultReportId] = useState<string | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [allExpenses, setAllExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [deleteExpenseAlert, setDeleteExpenseAlert] = useState<{ visible: boolean; expenseId: string | null }>({ visible: false, expenseId: null });
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedExpenses, setSelectedExpenses] = useState<Set<string>>(new Set());

  // Filter states
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [activeFilter, setActiveFilter] = useState<string>('previous_month');
  const [customDateFrom, setCustomDateFrom] = useState<Date | null>(null);
  const [customDateTo, setCustomDateTo] = useState<Date | null>(null);
  const [showDateFromPicker, setShowDateFromPicker] = useState(false);
  const [showDateToPicker, setShowDateToPicker] = useState(false);
  const [tempCustomDateFrom, setTempCustomDateFrom] = useState<Date | null>(null);
  const [tempCustomDateTo, setTempCustomDateTo] = useState<Date | null>(null);
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [selectedExpenseIdForArchive, setSelectedExpenseIdForArchive] = useState<string | null>(null);

  // Category filter: set of excluded categories (empty = show all)
  const [excludedCategories, setExcludedCategories] = useState<Set<string>>(new Set());

  // Refs to survive stale closures in useFocusEffect
  const activeFilterRef = useRef(activeFilter);
  const customDateFromRef = useRef(customDateFrom);
  const customDateToRef = useRef(customDateTo);
  const excludedCategoriesRef = useRef(excludedCategories);

  useEffect(() => { activeFilterRef.current = activeFilter; }, [activeFilter]);
  useEffect(() => { customDateFromRef.current = customDateFrom; }, [customDateFrom]);
  useEffect(() => { customDateToRef.current = customDateTo; }, [customDateTo]);
  useEffect(() => { excludedCategoriesRef.current = excludedCategories; }, [excludedCategories]);

  useExpenseRefresh(() => {
    if (defaultReportId) loadExpenses(defaultReportId);
  });

  const getDateRange = (filter: string, overrideCustomFrom?: Date | null, overrideCustomTo?: Date | null): { from: Date; to: Date } | null => {
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
        const dow = today.getDay() || 7;
        const firstDay = new Date(today);
        firstDay.setDate(today.getDate() - dow + 1);
        const lastDay = new Date(firstDay);
        lastDay.setDate(firstDay.getDate() + 6);
        lastDay.setHours(23, 59, 59);
        return { from: firstDay, to: lastDay };
      }
      case 'previous_week': {
        const dow = today.getDay() || 7;
        const firstDay = new Date(today);
        firstDay.setDate(today.getDate() - dow - 6);
        const lastDay = new Date(firstDay);
        lastDay.setDate(firstDay.getDate() + 6);
        lastDay.setHours(23, 59, 59);
        return { from: firstDay, to: lastDay };
      }
      case 'custom': {
        const cfrom = overrideCustomFrom !== undefined ? overrideCustomFrom : customDateFrom;
        const cto = overrideCustomTo !== undefined ? overrideCustomTo : customDateTo;
        if (cfrom && cto) {
          const from = new Date(cfrom);
          from.setHours(0, 0, 0, 0);
          const to = new Date(cto);
          to.setHours(23, 59, 59);
          return { from, to };
        }
        return null;
      }
      default:
        return null;
    }
  };

  const filterExpenses = (data: Expense[], dateRange: { from: Date; to: Date } | null, excluded: Set<string>): Expense[] => {
    return data.filter(expense => {
      if (dateRange) {
        const d = expense.date ? new Date(expense.date) : new Date(expense.createdAt);
        if (d < dateRange.from || d > dateRange.to) return false;
      }
      if (excluded.size > 0 && excluded.has(expense.category)) return false;
      return true;
    });
  };

  const loadExpenses = async (reportId: string, filterOverride?: string) => {
    try {
      const expensesData = await expenseService.getExpenses(reportId, false);
      setAllExpenses(expensesData);
      const currentFilter = filterOverride ?? activeFilterRef.current;
      const dateRange = getDateRange(currentFilter, customDateFromRef.current, customDateToRef.current);
      setExpenses(filterExpenses(expensesData, dateRange, excludedCategoriesRef.current));

    } catch (error) {
      Alert.alert(t('common.error'), t('expenses.loadError'));
    } finally {
      setLoading(false);
    }
  };

  const initAndLoad = async () => {
    try {
      const reportId = await databaseManager.getDefaultReportId();
      setDefaultReportId(reportId);
      await loadExpenses(reportId);
    } catch (error) {
      console.error('Error initializing expenses screen:', error);
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => {
    setLoading(true);
    initAndLoad();
  }, []));

  const handleRefresh = async () => {
    setRefreshing(true);
    await initAndLoad();
    setRefreshing(false);
  };

  const applyFilter = (filterType: string) => {
    if (filterType === 'all') {
      setExpenses(filterExpenses(allExpenses, null, excludedCategories));
      setActiveFilter('all');
      return;
    }
    const dateRange = getDateRange(filterType);
    if (!dateRange) {
      if (filterType === 'custom') Alert.alert(t('common.warning'), t('expenses.customDatesMissing'));
      return;
    }
    setExpenses(filterExpenses(allExpenses, dateRange, excludedCategories));
    setActiveFilter(filterType);
    setShowFilterModal(false);
  };

  const clearFilter = () => {
    setExcludedCategories(new Set());
    setExpenses(allExpenses);
    setActiveFilter('all');
    setCustomDateFrom(null);
    setCustomDateTo(null);
    setTempCustomDateFrom(null);
    setTempCustomDateTo(null);
  };

  const applyCustomFilter = () => {
    if (!tempCustomDateFrom || !tempCustomDateTo) {
      Alert.alert(t('common.warning'), t('expenses.customDatesMissing'));
      return;
    }
    setCustomDateFrom(tempCustomDateFrom);
    setCustomDateTo(tempCustomDateTo);
    const dateRange = { from: new Date(tempCustomDateFrom), to: new Date(tempCustomDateTo) };
    dateRange.from.setHours(0, 0, 0, 0);
    dateRange.to.setHours(23, 59, 59);
    setExpenses(filterExpenses(allExpenses, dateRange, excludedCategories));
    setActiveFilter('custom');
    setShowFilterModal(false);
  };

  const toggleCategory = (cat: string) => {
    const next = new Set(excludedCategories);
    if (next.has(cat)) {
      next.delete(cat);
    } else {
      next.add(cat);
    }
    setExcludedCategories(next);
    const dateRange = activeFilter !== 'all' ? getDateRange(activeFilter) : null;
    setExpenses(filterExpenses(allExpenses, dateRange, next));
  };

  const toggleAllCategories = () => {
    const allCats = ['food', 'transport', 'accommodation', 'entertainment', 'shopping', 'health', 'fuel', 'business', 'other'];
    const next = excludedCategories.size === 0 ? new Set(allCats) : new Set<string>();
    setExcludedCategories(next);
    const dateRange = activeFilter !== 'all' ? getDateRange(activeFilter) : null;
    setExpenses(filterExpenses(allExpenses, dateRange, next));
  };


  const handleCameraPress = () => navigation.navigate('GenericLiveOCRCamera');

  const handleExpensePress = (expenseId: string) => navigation.navigate('ExpenseDetail', { expenseId });

  const handleDeleteExpense = (expenseId: string) => {
    setDeleteExpenseAlert({ visible: true, expenseId });
  };

  const handleDeleteExpenseConfirm = async () => {
    if (!deleteExpenseAlert.expenseId) return;
    try {
      await expenseService.updateExpense(deleteExpenseAlert.expenseId, { isArchived: true });
      if (defaultReportId) await loadExpenses(defaultReportId);
    } catch (error) {
      Alert.alert(t('common.error'), t('expenseDetail.archiveError'));
    } finally {
      setDeleteExpenseAlert({ visible: false, expenseId: null });
    }
  };

  const handleEditExpense = (expenseId: string) => navigation.navigate('EditExpense', { expenseId });

  const handleShowArchiveModal = (expenseId: string) => {
    setSelectedExpenseIdForArchive(expenseId);
    setShowArchiveModal(true);
  };

  const handleArchiveExpenseConfirm = async () => {
    if (!selectedExpenseIdForArchive) return;
    try {
      await expenseService.updateExpense(selectedExpenseIdForArchive, { isArchived: true });
      if (defaultReportId) await loadExpenses(defaultReportId);
    } catch (error) {
      Alert.alert(t('common.error'), t('expenseDetail.archiveError'));
    } finally {
      setShowArchiveModal(false);
      setSelectedExpenseIdForArchive(null);
    }
  };

  const handleToggleSelectionMode = () => {
    setSelectionMode(!selectionMode);
    if (selectionMode) setSelectedExpenses(new Set());
  };

  const handleSelectExpense = (expenseId: string) => {
    const s = new Set(selectedExpenses);
    s.has(expenseId) ? s.delete(expenseId) : s.add(expenseId);
    setSelectedExpenses(s);
  };

  const handleSelectAll = () => {
    setSelectedExpenses(selectedExpenses.size === expenses.length ? new Set() : new Set(expenses.map(e => e.id)));
  };

  const handleArchiveSelected = async () => {
    if (selectedExpenses.size === 0) {
      Alert.alert(t('common.warning'), t('expenses.archiveSelectedMissing'));
      return;
    }
    Alert.alert(t('expenses.archiveConfirmTitle'), t('expenses.archiveSelectedConfirm', { count: selectedExpenses.size }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('expenses.archive'),
        onPress: async () => {
          try {
            for (const id of Array.from(selectedExpenses)) {
              await expenseService.updateExpense(id, { isArchived: true });
            }
            setSelectionMode(false);
            setSelectedExpenses(new Set());
            if (defaultReportId) await loadExpenses(defaultReportId);
          } catch (error) {
            Alert.alert(t('common.error'), t('expenses.archiveSelectedError'));
          }
        }
      }
    ]);
  };

  const getMonthName = (offset = 0) => {
    const d = new Date();
    d.setMonth(d.getMonth() + offset);
    return formatDate(d, { month: 'long' });
  };

  const formatGroupedTotals = (expenseList: Expense[]) => {
    const totalsByCurrency = expenseList.reduce<Record<string, number>>((acc, expense) => {
      const currency = expense.currency || 'EUR';
      acc[currency] = (acc[currency] || 0) + expense.amount;
      return acc;
    }, {});

    const orderedCurrencies = Object.keys(totalsByCurrency).sort((a, b) => {
      if (a === 'EUR') return -1;
      if (b === 'EUR') return 1;
      return a.localeCompare(b);
    });

    return orderedCurrencies
      .map((currency) => formatCurrency(totalsByCurrency[currency], currency))
      .join(' • ');
  };

  const getMonthExpenses = (offset = 0) => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0, 23, 59, 59);
    return allExpenses
      .filter(e => { const d = e.date ? new Date(e.date) : new Date(e.createdAt); return d >= firstDay && d <= lastDay; });
  };

  const currentMonthExpenses = getMonthExpenses(0);
  const previousMonthExpenses = getMonthExpenses(-1);
  const filteredTotal = formatGroupedTotals(expenses);
  const currentMonthTotal = formatGroupedTotals(currentMonthExpenses);
  const previousMonthTotal = formatGroupedTotals(previousMonthExpenses);
  const currentMonthName = getMonthName(0).charAt(0).toUpperCase() + getMonthName(0).slice(1);
  const previousMonthName = getMonthName(-1).charAt(0).toUpperCase() + getMonthName(-1).slice(1);

  const renderExpenseItem = ({ item }: { item: Expense }) => (
    <SwipeableExpenseItem
      expense={item}
      onPress={() => handleExpensePress(item.id)}
      onEdit={() => handleEditExpense(item.id)}
      onDelete={() => handleShowArchiveModal(item.id)}
      onArchiveConfirm={() => handleShowArchiveModal(item.id)}
      isSelected={selectedExpenses.has(item.id)}
      onSelect={() => handleSelectExpense(item.id)}
      selectionMode={selectionMode}
      useArchiveInsteadOfDelete={true}
    />
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>{t('common.loading')}</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        {/* Totals summary */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryMonth}>
            {currentMonthName}: <Text style={styles.summaryAmount}>{currentMonthTotal || formatCurrency(0, 'EUR')}</Text>
          </Text>
          <Text style={styles.summaryMonth}>
            {previousMonthName}: <Text style={styles.summaryAmount}>{previousMonthTotal || formatCurrency(0, 'EUR')}</Text>
          </Text>
          {activeFilter !== 'all' && (
            <Text style={styles.summaryFiltered}>
              {t('expenses.filteredTotal')}: <Text style={styles.summaryAmount}>{filteredTotal || formatCurrency(0, 'EUR')}</Text>
            </Text>
          )}
        </View>

        {/* Action buttons */}
        <View style={styles.actionButtons}>
          <TouchableOpacity style={styles.actionButton} onPress={handleCameraPress}>
            <MaterialIcons name="camera-alt" size={24} color="white" />
            <Text style={styles.actionButtonText}>{t('expenses.scan')}</Text>
          </TouchableOpacity>
        </View>

        {/* Expenses list */}
        <View style={styles.expensesSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('expenses.titleWithCount', { count: expenses.length })}</Text>
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
                  onPress={() => { setTempCustomDateFrom(customDateFrom); setTempCustomDateTo(customDateTo); setShowFilterModal(true); }}
                >
                  <MaterialIcons name="filter-list" size={18} color={activeFilter === 'custom' ? '#FF9500' : '#007AFF'} />
                  <Text style={[styles.quickFilterButtonText, activeFilter === 'custom' && styles.quickFilterButtonTextActive]}>
                    {t('expenses.filter')}
                  </Text>
                </TouchableOpacity>
                {expenses.length > 0 && (
                  <TouchableOpacity style={styles.selectionButton} onPress={handleToggleSelectionMode}>
                    <MaterialIcons name={selectionMode ? 'close' : 'checklist'} size={20} color="#007AFF" />
                    <Text style={styles.selectionButtonText}>{selectionMode ? t('common.cancel') : t('expenses.select')}</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>

          {/* Selection controls */}
          {selectionMode && (
            <View style={styles.selectionControls}>
              <View style={styles.selectionInfo}>
                <TouchableOpacity style={styles.selectAllButton} onPress={handleSelectAll}>
                  <MaterialIcons
                    name={selectedExpenses.size === expenses.length ? 'check-box' : 'check-box-outline-blank'}
                    size={20} color="#007AFF"
                  />
                  <Text style={styles.selectAllText}>
                    {selectedExpenses.size === expenses.length ? t('common.deselectAll') : t('common.selectAll')}
                  </Text>
                </TouchableOpacity>
                <Text style={styles.selectedCountText}>{t('expenses.selectedCount', { selected: selectedExpenses.size, total: expenses.length })}</Text>
              </View>
              {selectedExpenses.size > 0 && (
                <View style={styles.actionButtonsRow}>
                  <TouchableOpacity style={styles.archiveButton} onPress={handleArchiveSelected}>
                    <MaterialIcons name="archive" size={20} color="white" />
                    <Text style={styles.archiveButtonText}>{t('expenses.archive')}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          {expenses.length === 0 ? (
            <View style={styles.emptyContainer}>
              <MaterialIcons name="receipt" size={48} color="#ccc" />
              <Text style={styles.emptyText}>{t('expenses.none')}</Text>
              <Text style={styles.emptySubtext}>{t('expenses.emptyHint')}</Text>
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
        title={t('expenses.archiveExpenseTitle')}
        message={t('expenses.archiveExpenseMessage')}
        buttons={[
          { text: t('common.cancel'), style: 'cancel', onPress: () => setDeleteExpenseAlert({ visible: false, expenseId: null }) },
          { text: t('expenses.archive'), style: 'destructive', onPress: handleDeleteExpenseConfirm },
        ]}
        onDismiss={() => setDeleteExpenseAlert({ visible: false, expenseId: null })}
      />

      {/* Filter Modal */}
      <Modal visible={showFilterModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowFilterModal(false)}>
        <SafeAreaView style={styles.filterModalContainer}>
          <View style={styles.filterModalHeader}>
            <Text style={styles.filterModalTitle}>{t('expenses.filterExpenses')}</Text>
            <TouchableOpacity onPress={() => setShowFilterModal(false)} style={styles.filterModalCloseButton}>
              <MaterialIcons name="close" size={24} color="#007AFF" />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.filterModalContent}>
            <View style={styles.filterGroup}>
              <Text style={styles.filterGroupTitle}>{t('expenses.quickFilters')}</Text>
              {[
                { key: 'current_month', label: t('expenses.currentMonth'), icon: 'calendar-today' as const },
                { key: 'previous_month', label: t('expenses.previousMonth'), icon: 'calendar-today' as const },
                { key: 'current_week', label: t('expenses.currentWeek'), icon: 'date-range' as const },
                { key: 'previous_week', label: t('expenses.previousWeek'), icon: 'date-range' as const },
              ].map(({ key, label, icon }) => (
                <TouchableOpacity
                  key={key}
                  style={[styles.filterOption, activeFilter === key && styles.filterOptionActive]}
                  onPress={() => applyFilter(key)}
                >
                  <MaterialIcons name={icon} size={20} color={activeFilter === key ? '#FF9500' : '#666'} />
                  <Text style={[styles.filterOptionText, activeFilter === key && styles.filterOptionTextActive]}>{label}</Text>
                  {activeFilter === key && <MaterialIcons name="check" size={20} color="#FF9500" />}
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.filterGroup}>
              <Text style={styles.filterGroupTitle}>{t('expenses.customPeriod')}</Text>
              <View style={styles.customDateRow}>
                <Text style={styles.customDateLabel}>{t('expenses.from')}</Text>
                <TouchableOpacity style={styles.datePickerButton} onPress={() => setShowDateFromPicker(!showDateFromPicker)}>
                  <Text style={styles.datePickerButtonText}>{tempCustomDateFrom ? formatDate(tempCustomDateFrom) : t('expenses.selectDate')}</Text>
                  <MaterialIcons name="calendar-today" size={20} color="#007AFF" />
                </TouchableOpacity>
              </View>
              {showDateFromPicker && (
                <View style={styles.datePickerSpinnerContainer}>
                  <DateTimePicker
                    value={tempCustomDateFrom || new Date()} mode="date" display="compact"
                    onChange={(_, d) => { if (d) setTempCustomDateFrom(d); }}
                    locale={locale} textColor="#000000" accentColor="#007AFF"
                  />
                  <TouchableOpacity style={styles.datePickerConfirmButton} onPress={() => setShowDateFromPicker(false)}>
                    <Text style={styles.datePickerConfirmButtonText}>{t('common.confirm')}</Text>
                  </TouchableOpacity>
                </View>
              )}
              <View style={styles.customDateRow}>
                <Text style={styles.customDateLabel}>{t('expenses.to')}</Text>
                <TouchableOpacity style={styles.datePickerButton} onPress={() => setShowDateToPicker(!showDateToPicker)}>
                  <Text style={styles.datePickerButtonText}>{tempCustomDateTo ? formatDate(tempCustomDateTo) : t('expenses.selectDate')}</Text>
                  <MaterialIcons name="calendar-today" size={20} color="#007AFF" />
                </TouchableOpacity>
              </View>
              {showDateToPicker && (
                <View style={styles.datePickerSpinnerContainer}>
                  <DateTimePicker
                    value={tempCustomDateTo || new Date()} mode="date" display="compact"
                    onChange={(_, d) => { if (d) setTempCustomDateTo(d); }}
                    locale={locale} textColor="#000000" accentColor="#007AFF"
                  />
                  <TouchableOpacity style={styles.datePickerConfirmButton} onPress={() => setShowDateToPicker(false)}>
                    <Text style={styles.datePickerConfirmButtonText}>{t('common.confirm')}</Text>
                  </TouchableOpacity>
                </View>
              )}
              <TouchableOpacity
                style={[styles.applyCustomFilterButton, (!tempCustomDateFrom || !tempCustomDateTo) && styles.applyCustomFilterButtonDisabled]}
                onPress={applyCustomFilter}
                disabled={!tempCustomDateFrom || !tempCustomDateTo}
              >
                <Text style={[styles.applyCustomFilterButtonText, (!tempCustomDateFrom || !tempCustomDateTo) && styles.applyCustomFilterButtonTextDisabled]}>
                  {t('expenses.applyCustomFilter')}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.filterGroup}>
              <View style={styles.categoryFilterHeader}>
                <Text style={styles.filterGroupTitle}>{t('expenses.categories')}</Text>
                <TouchableOpacity onPress={toggleAllCategories}>
                  <Text style={styles.categoryToggleAllText}>
                    {excludedCategories.size === 0 ? t('common.deselectAll') : t('common.selectAll')}
                  </Text>
                </TouchableOpacity>
              </View>
              <View style={styles.categoryChipsContainer}>
                {([
                  { key: 'food', label: t('categories.food'), icon: 'restaurant' },
                  { key: 'transport', label: t('categories.transport'), icon: 'directions-car' },
                  { key: 'accommodation', label: t('categories.accommodation'), icon: 'hotel' },
                  { key: 'entertainment', label: t('categories.entertainment'), icon: 'movie' },
                  { key: 'shopping', label: t('categories.shopping'), icon: 'shopping-bag' },
                  { key: 'health', label: t('categories.health'), icon: 'local-hospital' },
                  { key: 'fuel', label: t('categories.fuel'), icon: 'local-gas-station' },
                  { key: 'business', label: t('categories.business'), icon: 'business' },
                  { key: 'other', label: t('categories.other'), icon: 'more-horiz' },
                ] as const).map(({ key, label, icon }) => {
                  const active = !excludedCategories.has(key);
                  return (
                    <TouchableOpacity
                      key={key}
                      style={[styles.categoryChip, active && styles.categoryChipActive]}
                      onPress={() => toggleCategory(key)}
                    >
                      <MaterialIcons name={icon} size={16} color={active ? '#fff' : '#666'} />
                      <Text style={[styles.categoryChipText, active && styles.categoryChipTextActive]}>{label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {(activeFilter !== 'all' || excludedCategories.size > 0) && (
              <TouchableOpacity style={styles.clearAllFiltersButton} onPress={() => { clearFilter(); setShowFilterModal(false); }}>
                <MaterialIcons name="clear-all" size={20} color="#dc3545" />
                <Text style={styles.clearAllFiltersButtonText}>{t('expenses.clearAllFilters')}</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      <CustomAlert
        visible={showArchiveModal}
        title={t('expenses.archiveConfirmTitle')}
        message={t('expenses.archiveConfirmMessage')}
        buttons={[
          { text: t('common.cancel'), style: 'cancel', onPress: () => { setShowArchiveModal(false); setSelectedExpenseIdForArchive(null); } },
          { text: t('expenses.archive'), style: 'destructive', onPress: handleArchiveExpenseConfirm },
        ]}
        onDismiss={() => { setShowArchiveModal(false); setSelectedExpenseIdForArchive(null); }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  scrollView: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f5f5' },
  loadingText: { marginTop: 16, fontSize: 16, color: '#666' },
  summaryCard: {
    backgroundColor: 'white', margin: 16, padding: 16, borderRadius: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 3.84, elevation: 5,
  },
  summaryMonth: { fontSize: 14, color: '#666', marginBottom: 4 },
  summaryFiltered: { fontSize: 14, color: '#666', marginTop: 4, borderTopWidth: 1, borderTopColor: '#eee', paddingTop: 8 },
  summaryAmount: { fontWeight: '700', color: '#007AFF' },
  actionButtons: { flexDirection: 'row', paddingHorizontal: 16, marginBottom: 16 },
  actionButton: {
    flex: 1, backgroundColor: '#007AFF', flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', padding: 12, borderRadius: 8, marginHorizontal: 4,
  },
  actionButtonText: { color: 'white', fontWeight: '600', marginLeft: 8 },
  expensesSection: { paddingHorizontal: 16, paddingBottom: 20 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '600', color: '#333' },
  headerButtons: { flexDirection: 'row', alignItems: 'center' },
  quickFilterButton: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6,
    backgroundColor: '#e3f2fd', borderRadius: 16, marginRight: 6,
  },
  quickFilterButtonActive: { backgroundColor: '#FF9500' },
  quickFilterButtonText: { fontSize: 13, fontWeight: '600', color: '#007AFF', marginLeft: 2 },
  quickFilterButtonTextActive: { color: '#fff' },
  selectionButton: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6,
    backgroundColor: '#e3f2fd', borderRadius: 16,
  },
  selectionButtonText: { fontSize: 14, fontWeight: '600', color: '#007AFF', marginLeft: 4 },
  selectionControls: { backgroundColor: '#f0f8ff', padding: 12, borderRadius: 8, marginBottom: 16 },
  selectionInfo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  selectAllButton: { flexDirection: 'row', alignItems: 'center' },
  selectAllText: { fontSize: 14, fontWeight: '600', color: '#007AFF', marginLeft: 6 },
  selectedCountText: { fontSize: 12, color: '#666' },
  actionButtonsRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8 },
  archiveButton: {
    backgroundColor: '#6c757d', flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8,
  },
  archiveButtonText: { color: 'white', fontSize: 14, fontWeight: '600', marginLeft: 6 },
  expenseItem: { backgroundColor: 'white', padding: 16, borderRadius: 12, flexDirection: 'row', alignItems: 'center' },
  expenseMain: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  categoryIcon: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  expenseInfo: { flex: 1 },
  expenseDescription: { fontSize: 16, fontWeight: '600', color: '#333', marginBottom: 4 },
  expenseCategory: { fontSize: 14, color: '#666', marginBottom: 2, textTransform: 'capitalize' },
  expenseDate: { fontSize: 12, color: '#999' },
  expenseAmount: { fontSize: 16, fontWeight: '600', color: '#007AFF', marginBottom: 8 },
  deleteExpenseButton: { padding: 4 },
  separator: { height: 12 },
  emptyContainer: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { fontSize: 16, fontWeight: '600', color: '#ccc', marginTop: 12 },
  emptySubtext: { fontSize: 14, color: '#ccc', marginTop: 4 },
  // Filter Modal
  filterModalContainer: { flex: 1, backgroundColor: '#f5f5f5' },
  filterModalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 16, backgroundColor: 'white',
    borderBottomWidth: 1, borderBottomColor: '#e0e0e0',
  },
  filterModalTitle: { fontSize: 20, fontWeight: '600', color: '#333' },
  filterModalCloseButton: { padding: 4 },
  filterModalContent: { flex: 1, paddingHorizontal: 20 },
  filterGroup: { backgroundColor: 'white', borderRadius: 12, padding: 16, marginTop: 20, marginBottom: 8 },
  filterGroupTitle: { fontSize: 18, fontWeight: '600', color: '#333', marginBottom: 16 },
  filterOption: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 12,
    borderRadius: 8, marginBottom: 8, backgroundColor: '#f8f9fa',
  },
  filterOptionActive: { backgroundColor: '#fff3e0', borderWidth: 1, borderColor: '#FF9500' },
  filterOptionText: { flex: 1, fontSize: 16, color: '#333', marginLeft: 12 },
  filterOptionTextActive: { color: '#FF9500', fontWeight: '600' },
  customDateRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  customDateLabel: { fontSize: 16, fontWeight: '600', color: '#333', width: 30, marginRight: 12 },
  datePickerButton: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 12, backgroundColor: '#f8f9fa', borderRadius: 8,
    borderWidth: 1, borderColor: '#e0e0e0',
  },
  datePickerButtonText: { fontSize: 16, color: '#333' },
  datePickerSpinnerContainer: {
    backgroundColor: '#fff', borderRadius: 12, padding: 16, marginVertical: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3,
  },
  datePickerConfirmButton: {
    backgroundColor: '#007AFF', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 8,
    alignItems: 'center', marginTop: 12,
  },
  datePickerConfirmButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  applyCustomFilterButton: {
    backgroundColor: '#007AFF', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 8,
    alignItems: 'center', marginTop: 16,
  },
  applyCustomFilterButtonDisabled: { backgroundColor: '#ccc' },
  applyCustomFilterButtonText: { color: 'white', fontSize: 16, fontWeight: '600' },
  applyCustomFilterButtonTextDisabled: { color: '#999' },
  categoryFilterHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16,
  },
  categoryToggleAllText: { fontSize: 14, fontWeight: '600', color: '#007AFF' },
  categoryChipsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  categoryChip: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 20, backgroundColor: '#f0f0f0',
  },
  categoryChipActive: { backgroundColor: '#007AFF' },
  categoryChipText: { fontSize: 13, fontWeight: '600', color: '#666', marginLeft: 6 },
  categoryChipTextActive: { color: '#fff' },
  clearAllFiltersButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: 'white',
    paddingVertical: 12, paddingHorizontal: 16, borderRadius: 8, borderWidth: 1, borderColor: '#dc3545',
    marginTop: 20, marginBottom: 20,
  },
  clearAllFiltersButtonText: { color: '#dc3545', fontSize: 16, fontWeight: '600', marginLeft: 8 },
});
