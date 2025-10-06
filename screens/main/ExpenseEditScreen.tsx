/**
 * Schermata per modificare una spesa esistente con DatePicker e TimePicker
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  SafeAreaView,
  ActivityIndicator,
  Platform,
  Modal,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { MaterialIcons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { databaseManager, Expense } from '../../services/database';
import { syncManager } from '../../services/syncManager';
import { MainStackParamList } from '../../navigation/MainNavigator';
import { triggerExpenseRefresh } from '../../hooks/useExpenseRefresh';

type ExpenseEditScreenNavigationProp = StackNavigationProp<MainStackParamList, 'ExpenseEdit'>;
type ExpenseEditScreenRouteProp = RouteProp<MainStackParamList, 'ExpenseEdit'>;

interface ExpenseEditScreenProps {
  route: {
    params: {
      expenseId: string;
    };
  };
  navigation: any;
}

export const ExpenseEditScreen: React.FC<ExpenseEditScreenProps> = ({
  route,
  navigation
}) => {
  const { expenseId } = route.params;
  
  // Form data
  const [expense, setExpense] = useState<Expense | null>(null);
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('EUR');
  const [merchantName, setMerchantName] = useState('');
  const [merchantAddress, setMerchantAddress] = useState('');
  const [category, setCategory] = useState('');
  const [notes, setNotes] = useState('');
  
  // Date/Time states
  const [receiptDate, setReceiptDate] = useState(new Date());
  const [receiptTime, setReceiptTime] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  
  // Category picker
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  
  // Loading states
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  
  // Form validation
  const [errors, setErrors] = useState<{[key: string]: string}>({});
  
  // Categorie disponibili (server API format)
  const categories = [
    { value: 'food', label: 'Cibo e Bevande', icon: 'restaurant' },
    { value: 'transport', label: 'Trasporti', icon: 'directions-car' },
    { value: 'accommodation', label: 'Alloggio', icon: 'hotel' },
    { value: 'entertainment', label: 'Intrattenimento', icon: 'movie' },
    { value: 'shopping', label: 'Shopping', icon: 'shopping-bag' },
    { value: 'health', label: 'Salute', icon: 'local-hospital' },
    { value: 'business', label: 'Business', icon: 'business' },
    { value: 'other', label: 'Altro', icon: 'more-horiz' },
  ];

  useEffect(() => {
    loadExpense();
  }, [expenseId]);

  const loadExpense = async () => {
    try {
      setIsLoading(true);
      const loadedExpense = await databaseManager.getExpenseById(expenseId);
      
      if (!loadedExpense) {
        Alert.alert('Errore', 'Spesa non trovata');
        navigation.goBack();
        return;
      }
      
      setExpense(loadedExpense);
      
      // Debug log per vedere i dati della spesa
      console.log('📊 ExpenseEditScreen - Loaded expense data:');
      console.log('  - merchant_name:', loadedExpense.merchant_name);
      console.log('  - notes:', loadedExpense.notes);
      console.log('  - description:', loadedExpense.description);
      
      // Populate form fields
      setAmount(loadedExpense.amount.toString());
      setCurrency(loadedExpense.currency);
      setMerchantName(loadedExpense.merchant_name || '');
      setMerchantAddress(loadedExpense.merchant_address || '');
      setCategory(loadedExpense.category || '');
      setNotes(loadedExpense.notes || '');
      
      // Parse date and time
      const dateStr = loadedExpense.receipt_date;
      const timeStr = loadedExpense.receipt_time;
      
      if (dateStr) {
        const date = new Date(dateStr);
        setReceiptDate(date);
      }
      
      if (timeStr && dateStr) {
        // Combine date and time
        const [hours, minutes, seconds] = timeStr.split(':');
        const dateTime = new Date(dateStr);
        dateTime.setHours(parseInt(hours, 10));
        dateTime.setMinutes(parseInt(minutes, 10));
        dateTime.setSeconds(parseInt(seconds || '0', 10));
        setReceiptTime(dateTime);
      }
      
      console.log('📊 Loaded expense for editing:', loadedExpense);
    } catch (error) {
      console.error('❌ Failed to load expense:', error);
      Alert.alert('Errore', 'Impossibile caricare la spesa');
    } finally {
      setIsLoading(false);
    }
  };

  const validateForm = (): boolean => {
    const newErrors: {[key: string]: string} = {};

    if (!merchantName.trim()) {
      newErrors.merchantName = 'Il nome dell\'esercente è obbligatorio';
    }

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      newErrors.amount = 'Inserisci un importo valido';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) {
      return;
    }

    try {
      setIsSaving(true);

      const updates = {
        amount: parseFloat(amount),
        currency,
        merchant_name: merchantName,
        merchant_address: merchantAddress,
        category,
        receipt_date: receiptDate.toISOString().split('T')[0], // YYYY-MM-DD
        receipt_time: receiptTime.toTimeString().split(' ')[0], // HH:MM:SS
        notes,
        sync_status: 'pending' as const,
        updated_at: new Date().toISOString()
      };

      await databaseManager.updateExpense(expenseId, updates);
      console.log('✅ Expense updated successfully');
      
      // Trigger refresh in all listening screens
      triggerExpenseRefresh();
      
      // Start sync in background
      syncManager.syncAll().catch(console.error);
      
      Alert.alert(
        'Successo',
        'Spesa aggiornata con successo!',
        [
          {
            text: 'OK',
            onPress: () => navigation.goBack()
          }
        ]
      );
      
    } catch (error) {
      console.error('❌ Failed to update expense:', error);
      Alert.alert('Errore', 'Impossibile aggiornare la spesa');
    } finally {
      setIsSaving(false);
    }
  };

  const onDateChange = (event: any, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
    }
    
    if (selectedDate) {
      setReceiptDate(selectedDate);
      setErrors(prev => ({ ...prev, receiptDate: '' }));
    }
  };

  const onTimeChange = (event: any, selectedTime?: Date) => {
    if (Platform.OS === 'android') {
      setShowTimePicker(false);
    }
    
    if (selectedTime) {
      setReceiptTime(selectedTime);
      setErrors(prev => ({ ...prev, receiptTime: '' }));
    }
  };

  const formatDate = (date: Date): string => {
    return date.toLocaleDateString('it-IT', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const formatTime = (date: Date): string => {
    return date.toLocaleTimeString('it-IT', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Caricamento spesa...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollContainer} keyboardShouldPersistTaps="handled">
        <View style={styles.form}>
          {/* Amount */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Importo *</Text>
            <View style={styles.amountContainer}>
              <TextInput
                style={[styles.amountInput, errors.amount && styles.inputError]}
                value={amount}
                onChangeText={(text) => {
                  setAmount(text);
                  setErrors(prev => ({ ...prev, amount: '' }));
                }}
                placeholder="0,00"
                keyboardType="numeric"
                placeholderTextColor="#999"
              />
              <Text style={styles.currencyLabel}>€</Text>
            </View>
            {errors.amount && <Text style={styles.errorText}>{errors.amount}</Text>}
          </View>

          {/* Merchant Name */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Esercente *</Text>
            <TextInput
              style={[styles.input, errors.merchantName && styles.inputError]}
              value={merchantName}
              onChangeText={(text) => {
                setMerchantName(text);
                setErrors(prev => ({ ...prev, merchantName: '' }));
              }}
              placeholder="Nome dell'esercente"
              placeholderTextColor="#999"
            />
            {errors.merchantName && <Text style={styles.errorText}>{errors.merchantName}</Text>}
          </View>

          {/* Merchant Address */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Indirizzo</Text>
            <TextInput
              style={styles.input}
              value={merchantAddress}
              onChangeText={setMerchantAddress}
              placeholder="Indirizzo dell'esercente"
              placeholderTextColor="#999"
              multiline
            />
          </View>

          {/* Category */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Categoria</Text>
            <TouchableOpacity
              style={styles.dateTimeButton}
              onPress={() => setShowCategoryPicker(true)}
            >
              <MaterialIcons 
                name={categories.find(c => c.value === category)?.icon || 'category'} 
                size={20} 
                color="#007AFF" 
              />
              <Text style={styles.dateTimeText}>
                {categories.find(c => c.value === category)?.label || 'Seleziona categoria'}
              </Text>
              <MaterialIcons name="keyboard-arrow-down" size={20} color="#666" />
            </TouchableOpacity>
          </View>

          {/* Date Picker */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Data Scontrino *</Text>
            <TouchableOpacity
              style={styles.dateTimeButton}
              onPress={() => setShowDatePicker(true)}
            >
              <MaterialIcons name="calendar-today" size={20} color="#007AFF" />
              <Text style={styles.dateTimeText}>
                {formatDate(receiptDate)}
              </Text>
              <MaterialIcons name="keyboard-arrow-down" size={20} color="#666" />
            </TouchableOpacity>
          </View>

          {/* Time Picker */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Orario Scontrino *</Text>
            <TouchableOpacity
              style={styles.dateTimeButton}
              onPress={() => setShowTimePicker(true)}
            >
              <MaterialIcons name="access-time" size={20} color="#007AFF" />
              <Text style={styles.dateTimeText}>
                {formatTime(receiptTime)}
              </Text>
              <MaterialIcons name="keyboard-arrow-down" size={20} color="#666" />
            </TouchableOpacity>
          </View>

          {/* Notes */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Note</Text>
            <TextInput
              style={[styles.input, styles.notesInput]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Note aggiuntive..."
              placeholderTextColor="#999"
              multiline
              numberOfLines={4}
            />
          </View>

          {/* Sync Status Indicator */}
          {expense && (
            <View style={styles.syncStatusContainer}>
              <View style={[
                styles.syncDot,
                { backgroundColor: expense.sync_status === 'synced' ? '#4CAF50' : expense.sync_status === 'pending' ? '#FF9800' : '#F44336' }
              ]} />
              <Text style={styles.syncStatusText}>
                {expense.sync_status === 'synced' ? 'Sincronizzato' : expense.sync_status === 'pending' ? 'In attesa di sincronizzazione' : 'Errore di sincronizzazione'}
              </Text>
            </View>
          )}

          {/* Save Button */}
          <TouchableOpacity
            style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={isSaving}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <>
                <MaterialIcons name="save" size={20} color="white" />
                <Text style={styles.saveButtonText}>Salva Modifiche</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Date Picker Modal */}
      {showDatePicker && (
        <Modal
          transparent={true}
          animationType="slide"
          visible={showDatePicker}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.datePickerContainer}>
              <View style={styles.datePickerHeader}>
                <Text style={styles.datePickerTitle}>Seleziona Data</Text>
                <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                  <MaterialIcons name="close" size={24} color="#666" />
                </TouchableOpacity>
              </View>
              <View style={styles.pickerWrapper}>
                <DateTimePicker
                  value={receiptDate}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={onDateChange}
                  maximumDate={new Date()}
                  locale="it-IT"
                  textColor="#000000"
                  themeVariant="light"
                  style={styles.datePicker}
                />
              </View>
              {Platform.OS === 'ios' && (
                <TouchableOpacity
                  style={styles.confirmButton}
                  onPress={() => setShowDatePicker(false)}
                >
                  <Text style={styles.confirmButtonText}>Conferma</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </Modal>
      )}

      {/* Time Picker Modal */}
      {showTimePicker && (
        <Modal
          transparent={true}
          animationType="slide"
          visible={showTimePicker}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.datePickerContainer}>
              <View style={styles.datePickerHeader}>
                <Text style={styles.datePickerTitle}>Seleziona Orario</Text>
                <TouchableOpacity onPress={() => setShowTimePicker(false)}>
                  <MaterialIcons name="close" size={24} color="#666" />
                </TouchableOpacity>
              </View>
              <View style={styles.pickerWrapper}>
                <DateTimePicker
                  value={receiptTime}
                  mode="time"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={onTimeChange}
                  locale="it-IT"
                  is24Hour={true}
                  textColor="#000000"
                  themeVariant="light"
                  style={styles.datePicker}
                />
              </View>
              {Platform.OS === 'ios' && (
                <TouchableOpacity
                  style={styles.confirmButton}
                  onPress={() => setShowTimePicker(false)}
                >
                  <Text style={styles.confirmButtonText}>Conferma</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </Modal>
      )}
      
      {/* Category Picker Modal */}
      {showCategoryPicker && (
        <Modal
          transparent={true}
          animationType="slide"
          visible={showCategoryPicker}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.categoryPickerContainer}>
              <View style={styles.datePickerHeader}>
                <Text style={styles.datePickerTitle}>Seleziona Categoria</Text>
                <TouchableOpacity onPress={() => setShowCategoryPicker(false)}>
                  <MaterialIcons name="close" size={24} color="#666" />
                </TouchableOpacity>
              </View>
              <ScrollView style={styles.categoryList}>
                {categories.map((cat) => (
                  <TouchableOpacity
                    key={cat.value}
                    style={[
                      styles.categoryItem,
                      category === cat.value && styles.categoryItemSelected
                    ]}
                    onPress={() => {
                      setCategory(cat.value);
                      setShowCategoryPicker(false);
                    }}
                  >
                    <MaterialIcons 
                      name={cat.icon as any} 
                      size={24} 
                      color={category === cat.value ? '#007AFF' : '#666'} 
                    />
                    <Text style={[
                      styles.categoryItemText,
                      category === cat.value && styles.categoryItemTextSelected
                    ]}>
                      {cat.label}
                    </Text>
                    {category === cat.value && (
                      <MaterialIcons name="check" size={24} color="#007AFF" />
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  scrollContainer: {
    flex: 1,
  },
  form: {
    padding: 20,
  },
  inputGroup: {
    marginBottom: 24,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212529',
    marginBottom: 8,
  },
  input: {
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#e9ecef',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#212529',
  },
  inputError: {
    borderColor: '#dc3545',
  },
  errorText: {
    color: '#dc3545',
    fontSize: 14,
    marginTop: 6,
  },
  amountContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#e9ecef',
    borderRadius: 12,
    paddingRight: 16,
  },
  amountInput: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 18,
    fontWeight: '600',
    color: '#212529',
  },
  currencyLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#28a745',
  },
  dateTimeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#e9ecef',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  dateTimeText: {
    flex: 1,
    fontSize: 16,
    color: '#212529',
    marginLeft: 12,
  },
  notesInput: {
    height: 100,
    textAlignVertical: 'top',
  },
  syncStatusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    padding: 12,
    backgroundColor: 'white',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  syncDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  syncStatusText: {
    fontSize: 14,
    color: '#666',
  },
  saveButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#007AFF',
    paddingVertical: 16,
    borderRadius: 12,
    marginTop: 20,
  },
  saveButtonDisabled: {
    backgroundColor: '#ccc',
  },
  saveButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  datePickerContainer: {
    backgroundColor: 'white',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 20,
  },
  datePickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  datePickerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#212529',
  },
  pickerWrapper: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  datePicker: {
    height: 180,
    width: '100%',
  },
  confirmButton: {
    backgroundColor: '#007AFF',
    marginHorizontal: 20,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  confirmButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  categoryPickerContainer: {
    backgroundColor: 'white',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
  },
  categoryList: {
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  categoryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginVertical: 4,
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  categoryItemSelected: {
    backgroundColor: '#E3F2FD',
    borderColor: '#007AFF',
  },
  categoryItemText: {
    flex: 1,
    fontSize: 16,
    color: '#212529',
    marginLeft: 12,
  },
  categoryItemTextSelected: {
    color: '#007AFF',
    fontWeight: '600',
  },
});
