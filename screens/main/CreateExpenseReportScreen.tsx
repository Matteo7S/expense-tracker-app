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
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { MaterialIcons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { ExpenseReport, CreateExpenseReportData } from '../../types';
import { databaseManager } from '../../services/database';
import { syncManager } from '../../services/syncManager';
import { MainStackParamList } from '../../navigation/MainNavigator';
import { triggerExpenseRefresh } from '../../hooks/useExpenseRefresh';

type CreateExpenseReportScreenNavigationProp = StackNavigationProp<MainStackParamList, 'CreateExpenseReport'>;
type CreateExpenseReportScreenRouteProp = RouteProp<MainStackParamList, 'CreateExpenseReport'> | RouteProp<MainStackParamList, 'EditExpenseReport'>;

export function CreateExpenseReportScreen() {
  const navigation = useNavigation<CreateExpenseReportScreenNavigationProp>();
  const route = useRoute<CreateExpenseReportScreenRouteProp>();
  
  const isEdit = route.name === 'EditExpenseReport';
  const reportToEdit = isEdit && 'report' in route.params ? route.params.report : null;

  const [formData, setFormData] = useState<CreateExpenseReportData>({
    name: reportToEdit?.name || '',
    description: reportToEdit?.description || '',
    startDate: reportToEdit ? new Date(reportToEdit.startDate) : new Date(),
    endDate: reportToEdit ? new Date(reportToEdit.endDate) : new Date(),
  });

  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{[key: string]: string}>({});

  const validateForm = (): boolean => {
    const newErrors: {[key: string]: string} = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Il nome è obbligatorio';
    }

    if (formData.endDate && formData.startDate > formData.endDate) {
      newErrors.endDate = 'La data di fine deve essere successiva alla data di inizio';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) {
      return;
    }

    try {
      setLoading(true);
      
      if (isEdit && reportToEdit) {
        // Aggiorna la nota spese nel database locale
        console.log('💾 Updating expense report locally...', reportToEdit.id);
        await databaseManager.updateExpenseReport(reportToEdit.id, {
          title: formData.name.trim(),
          description: formData.description?.trim() || null,
          start_date: formData.startDate.toISOString(),
          end_date: formData.endDate.toISOString(),
          sync_status: 'pending' // Marca per sincronizzazione
        });
        
        console.log('✅ Expense report updated locally');
        
        // Trigger la sincronizzazione in background
        console.log('🔄 Triggering background sync...');
        syncManager.syncAll().catch(error => {
          console.error('⚠️ Background sync failed:', error);
          // Non mostrare errore all'utente - la sincronizzazione riproverà automaticamente
        });
        
        // Trigger refresh in all listening screens
        triggerExpenseRefresh();
        Alert.alert('Successo', 'Nota spese aggiornata con successo');
      } else {
        // Crea una nuova nota spese nel database locale
        console.log('💾 Creating expense report locally...');
        const currentUserId = databaseManager.getCurrentUserId();
        console.log('👤 Current user ID:', currentUserId);
        
        const reportId = await databaseManager.createExpenseReport({
          title: formData.name.trim(),
          description: formData.description?.trim() || null,
          start_date: formData.startDate.toISOString(),
          end_date: formData.endDate.toISOString(),
          user_id: currentUserId || undefined,
          is_archived: false,
          sync_status: 'pending' // Marca per sincronizzazione
        });
        
        console.log('✅ Expense report created locally:', reportId);
        
        // Trigger la sincronizzazione in background
        console.log('🔄 Triggering background sync...');
        syncManager.syncAll().catch(error => {
          console.error('⚠️ Background sync failed:', error);
          // Non mostrare errore all'utente - la sincronizzazione riproverà automaticamente
        });
        
        // Trigger refresh in all listening screens
        triggerExpenseRefresh();
        Alert.alert('Successo', 'Nota spese creata con successo');
      }
      
      navigation.goBack();
    } catch (error: any) {
      const errorMessage = isEdit 
        ? 'Impossibile aggiornare la nota spese' 
        : 'Impossibile creare la nota spese';
      Alert.alert('Errore', `${errorMessage}. I dati saranno salvati localmente e sincronizzati quando possibile.`);
      console.error('Error saving report:', error);
    } finally {
      setLoading(false);
    }
  };

  const onStartDateChange = (event: any, selectedDate?: Date) => {
    setShowStartDatePicker(false);
    if (selectedDate) {
      setFormData(prev => ({ ...prev, startDate: selectedDate }));
      setErrors(prev => ({ ...prev, endDate: '' }));
    }
  };

  const onEndDateChange = (event: any, selectedDate?: Date) => {
    setShowEndDatePicker(false);
    if (selectedDate) {
      setFormData(prev => ({ ...prev, endDate: selectedDate }));
      setErrors(prev => ({ ...prev, endDate: '' }));
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} keyboardShouldPersistTaps="handled">
        <View style={styles.form}>
          {/* Nome */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Nome *</Text>
            <TextInput
              style={[styles.input, errors.name && styles.inputError]}
              value={formData.name}
              onChangeText={(text) => {
                setFormData(prev => ({ ...prev, name: text }));
                setErrors(prev => ({ ...prev, name: '' }));
              }}
              placeholder="Nome della nota spese"
              placeholderTextColor="#999"
            />
            {errors.name && <Text style={styles.errorText}>{errors.name}</Text>}
          </View>

          {/* Descrizione */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Descrizione</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={formData.description}
              onChangeText={(text) => setFormData(prev => ({ ...prev, description: text }))}
              placeholder="Descrizione opzionale"
              placeholderTextColor="#999"
              multiline
              numberOfLines={3}
            />
          </View>

          {/* Data Inizio */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Data Inizio *</Text>
            <TouchableOpacity
              style={styles.dateButton}
              onPress={() => setShowStartDatePicker(true)}
            >
              <Text style={styles.dateButtonText}>
                {formData.startDate.toLocaleDateString('it-IT')}
              </Text>
              <MaterialIcons name="calendar-today" size={20} color="#666" />
            </TouchableOpacity>
            {showStartDatePicker && (
              <DateTimePicker
                value={formData.startDate}
                mode="date"
                display="default"
                onChange={onStartDateChange}
              />
            )}
          </View>

          {/* Data Fine */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Data Fine</Text>
            <TouchableOpacity
              style={[styles.dateButton, errors.endDate && styles.inputError]}
              onPress={() => setShowEndDatePicker(true)}
            >
              <Text style={styles.dateButtonText}>
                {formData.endDate.toLocaleDateString('it-IT')}
              </Text>
              <MaterialIcons name="calendar-today" size={20} color="#666" />
            </TouchableOpacity>
            {showEndDatePicker && (
              <DateTimePicker
                value={formData.endDate}
                mode="date"
                display="default"
                onChange={onEndDateChange}
                minimumDate={formData.startDate}
              />
            )}
            {errors.endDate && <Text style={styles.errorText}>{errors.endDate}</Text>}
          </View>

          {/* Buttons */}
          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => navigation.goBack()}
              disabled={loading}
            >
              <Text style={styles.cancelButtonText}>Annulla</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.saveButton, loading && styles.saveButtonDisabled]}
              onPress={handleSave}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <Text style={styles.saveButtonText}>
                  {isEdit ? 'Aggiorna' : 'Crea'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
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
  form: {
    padding: 20,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#333',
  },
  inputError: {
    borderColor: '#ff4444',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  dateButton: {
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dateButtonText: {
    fontSize: 16,
    color: '#333',
  },
  errorText: {
    color: '#ff4444',
    fontSize: 14,
    marginTop: 5,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 30,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginRight: 10,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  saveButton: {
    flex: 1,
    backgroundColor: '#007AFF',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginLeft: 10,
  },
  saveButtonDisabled: {
    backgroundColor: '#ccc',
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
});
