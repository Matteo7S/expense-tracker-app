/**
 * Modal per la verifica e modifica dei dati rilevati dalla scansione OCR
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  SafeAreaView,
  TextInput,
  Alert,
  ScrollView,
  Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { MaterialIcons } from '@expo/vector-icons';

export interface ExtractedData {
  amount?: number;
  currency?: string;
  date?: string; // ISO format
  time?: string; // HH:MM format
  merchantName?: string;
  category?: string; // Categoria identificata
  confidence?: {
    amount?: number;
    date?: number;
    time?: number;
    merchant?: number;
    category?: number;
  };
}

interface DataVerificationModalProps {
  visible: boolean;
  onClose: () => void;
  extractedData: ExtractedData;
  onConfirm: (data: ExtractedData) => void;
  onCancel: () => void;
  isLoading?: boolean;
  title?: string;
  subtitle?: string;
}

export const DataVerificationModal: React.FC<DataVerificationModalProps> = ({
  visible,
  onClose,
  extractedData,
  onConfirm,
  onCancel,
  isLoading = false,
  title = "Verifica Dati Scontrino",
  subtitle = "Controlla e modifica i dati rilevati prima di salvare"
}) => {
  const [amount, setAmount] = useState<string>('');
  const [currency, setCurrency] = useState<string>('EUR');
  const [merchantName, setMerchantName] = useState<string>('');
  const [category, setCategory] = useState<string>('other');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedTime, setSelectedTime] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);

  // Lista categorie disponibili
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

  // Inizializza i campi quando si apre la modal o cambiano i dati estratti
  useEffect(() => {
    if (visible && extractedData) {
      setAmount(extractedData.amount ? extractedData.amount.toString().replace('.', ',') : '');
      setCurrency(extractedData.currency || 'EUR');
      setMerchantName(extractedData.merchantName || '');
      setCategory(extractedData.category || 'other');
      
      // Imposta la data
      if (extractedData.date) {
        const date = new Date(extractedData.date);
        setSelectedDate(date);
        
        // Se c'è anche l'ora, la imposta
        if (extractedData.time) {
          const [hours, minutes] = extractedData.time.split(':');
          const timeDate = new Date(date);
          timeDate.setHours(parseInt(hours, 10), parseInt(minutes, 10));
          setSelectedTime(timeDate);
        } else {
          setSelectedTime(new Date());
        }
      } else {
        const now = new Date();
        setSelectedDate(now);
        setSelectedTime(now);
      }
    }
  }, [visible, extractedData]);

  const handleAmountChange = (text: string) => {
    // Permette solo numeri, virgola e punto
    const cleanText = text.replace(/[^0-9,\.]/g, '');
    setAmount(cleanText);
  };

  const handleDateChange = (event: any, date?: Date) => {
    setShowDatePicker(false);
    if (date) {
      setSelectedDate(date);
    }
  };

  const handleTimeChange = (event: any, time?: Date) => {
    setShowTimePicker(false);
    if (time) {
      setSelectedTime(time);
    }
  };

  const getConfidenceColor = (confidence?: number) => {
    if (!confidence) return '#f44336'; // Red for manual - attention grabbing
    if (confidence >= 0.8) return '#4caf50';
    if (confidence >= 0.6) return '#ff9800';
    return '#e91e63'; // Pink/magenta for low confidence
  };

  const getConfidenceText = (confidence?: number) => {
    if (!confidence) return 'Manuale';
    if (confidence >= 0.8) return 'Alta';
    if (confidence >= 0.6) return 'Media';
    return 'Bassa';
  };

  const getCategoryLabel = (category: string) => {
    const categoryLabels: Record<string, string> = {
      'food': 'Cibo e Bevande',
      'transport': 'Trasporti',
      'accommodation': 'Alloggio',
      'entertainment': 'Intrattenimento',
      'shopping': 'Shopping',
      'health': 'Salute',
      'business': 'Business',
      'other': 'Altro'
    };
    return categoryLabels[category] || category;
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('it-IT');
  };

  const formatTime = (time: Date) => {
    return time.toLocaleTimeString('it-IT', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  const handleConfirm = () => {
    // Valida l'importo
    if (!amount.trim()) {
      Alert.alert('Errore', 'L\'importo è obbligatorio');
      return;
    }

    const numericAmount = parseFloat(amount.replace(',', '.'));
    if (isNaN(numericAmount) || numericAmount <= 0) {
      Alert.alert('Errore', 'Inserisci un importo valido (es: 12,50)');
      return;
    }

    // Prepara i dati da restituire
    const confirmedData: ExtractedData = {
      amount: numericAmount,
      currency,
      date: selectedDate.toISOString().split('T')[0], // YYYY-MM-DD format
      time: formatTime(selectedTime), // HH:MM format
      merchantName: merchantName.trim() || undefined,
      category: category,
      confidence: {
        amount: amount !== (extractedData.amount?.toString().replace('.', ',') || '') ? 1.0 : extractedData.confidence?.amount,
        date: 1.0, // Manual selection gets 100% confidence
        time: 1.0,
        merchant: merchantName !== (extractedData.merchantName || '') ? 1.0 : extractedData.confidence?.merchant,
        category: category !== (extractedData.category || 'other') ? 1.0 : extractedData.confidence?.category,
      }
    };

    onConfirm(confirmedData);
  };

  const handleCancel = () => {
    onCancel();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleCancel} disabled={isLoading}>
            <MaterialIcons name="close" size={24} color="#007AFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{title}</Text>
          <TouchableOpacity onPress={handleConfirm} disabled={isLoading}>
            <Text style={[styles.confirmText, isLoading && styles.disabledText]}>
              {isLoading ? 'Salvando...' : 'Salva'}
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Subtitle */}
          <Text style={styles.subtitle}>{subtitle}</Text>

          {/* Importo */}
          <View style={styles.fieldContainer}>
            <View style={styles.fieldHeader}>
              <Text style={styles.fieldLabel}>Importo *</Text>
              <View style={styles.confidenceIndicator}>
                <View style={[
                  styles.confidenceDot, 
                  { backgroundColor: getConfidenceColor(extractedData.confidence?.amount) }
                ]} />
                <Text style={styles.confidenceText}>
                  {getConfidenceText(extractedData.confidence?.amount)}
                </Text>
              </View>
            </View>
            <View style={[
              styles.amountContainer,
              { 
                borderColor: getConfidenceColor(extractedData.confidence?.amount),
                borderWidth: 2
              }
            ]}>
              <TextInput
                style={styles.amountInput}
                value={amount}
                onChangeText={handleAmountChange}
                placeholder="0,00"
                keyboardType="decimal-pad"
                editable={!isLoading}
              />
              <Text style={styles.currencyText}>{currency}</Text>
            </View>
          </View>

          {/* Data */}
          <View style={styles.fieldContainer}>
            <View style={styles.fieldHeader}>
              <Text style={styles.fieldLabel}>Data</Text>
              <View style={styles.confidenceIndicator}>
                <View style={[
                  styles.confidenceDot, 
                  { backgroundColor: getConfidenceColor(extractedData.confidence?.date) }
                ]} />
                <Text style={styles.confidenceText}>
                  {getConfidenceText(extractedData.confidence?.date)}
                </Text>
              </View>
            </View>
            <TouchableOpacity 
              style={[
                styles.dateTimeButton,
                { 
                  borderColor: getConfidenceColor(extractedData.confidence?.date),
                  borderWidth: 2
                }
              ]}
              onPress={() => setShowDatePicker(true)}
              disabled={isLoading}
            >
              <MaterialIcons name="date-range" size={20} color="#666" />
              <Text style={styles.dateTimeText}>{formatDate(selectedDate)}</Text>
              <MaterialIcons name="arrow-drop-down" size={20} color="#666" />
            </TouchableOpacity>
          </View>

          {/* Ora */}
          <View style={styles.fieldContainer}>
            <View style={styles.fieldHeader}>
              <Text style={styles.fieldLabel}>Ora</Text>
              <View style={styles.confidenceIndicator}>
                <View style={[
                  styles.confidenceDot, 
                  { backgroundColor: getConfidenceColor(extractedData.confidence?.time) }
                ]} />
                <Text style={styles.confidenceText}>
                  {getConfidenceText(extractedData.confidence?.time)}
                </Text>
              </View>
            </View>
            <TouchableOpacity 
              style={[
                styles.dateTimeButton,
                { 
                  borderColor: getConfidenceColor(extractedData.confidence?.time),
                  borderWidth: 2
                }
              ]}
              onPress={() => setShowTimePicker(true)}
              disabled={isLoading}
            >
              <MaterialIcons name="access-time" size={20} color="#666" />
              <Text style={styles.dateTimeText}>{formatTime(selectedTime)}</Text>
              <MaterialIcons name="arrow-drop-down" size={20} color="#666" />
            </TouchableOpacity>
          </View>

          {/* Esercente */}
          <View style={styles.fieldContainer}>
            <View style={styles.fieldHeader}>
              <Text style={styles.fieldLabel}>Esercente</Text>
              <View style={styles.confidenceIndicator}>
                <View style={[
                  styles.confidenceDot, 
                  { backgroundColor: getConfidenceColor(extractedData.confidence?.merchant) }
                ]} />
                <Text style={styles.confidenceText}>
                  {getConfidenceText(extractedData.confidence?.merchant)}
                </Text>
              </View>
            </View>
            <TextInput
              style={[
                styles.textInput,
                { 
                  borderColor: getConfidenceColor(extractedData.confidence?.merchant),
                  borderWidth: 2
                }
              ]}
              value={merchantName}
              onChangeText={setMerchantName}
              placeholder="Nome dell'esercente (opzionale)"
              editable={!isLoading}
            />
          </View>

          {/* Categoria (modificabile) */}
          <View style={styles.fieldContainer}>
            <View style={styles.fieldHeader}>
              <Text style={styles.fieldLabel}>Categoria</Text>
              <View style={styles.confidenceIndicator}>
                <View style={[
                  styles.confidenceDot, 
                  { backgroundColor: getConfidenceColor(extractedData.confidence?.category) }
                ]} />
                <Text style={styles.confidenceText}>
                  {getConfidenceText(extractedData.confidence?.category)}
                </Text>
              </View>
            </View>
            <TouchableOpacity 
              style={[
                styles.dateTimeButton,
                { 
                  borderColor: getConfidenceColor(extractedData.confidence?.category),
                  borderWidth: 2
                }
              ]}
              onPress={() => setShowCategoryPicker(true)}
              disabled={isLoading}
            >
              <MaterialIcons 
                name={categories.find(c => c.value === category)?.icon as any || 'label'} 
                size={20} 
                color="#007AFF" 
              />
              <Text style={styles.dateTimeText}>
                {categories.find(c => c.value === category)?.label || 'Seleziona categoria'}
              </Text>
              <MaterialIcons name="arrow-drop-down" size={20} color="#666" />
            </TouchableOpacity>
          </View>

          {/* Info sui livelli di confidenza */}
          <View style={styles.infoContainer}>
            <Text style={styles.infoTitle}>🔍 Precisione Rilevamento</Text>
            <View style={styles.legendContainer}>
              <View style={styles.legendItem}>
                <View style={[styles.confidenceDot, { backgroundColor: '#4caf50' }]} />
                <Text style={styles.legendText}>Alta (80%+)</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.confidenceDot, { backgroundColor: '#ff9800' }]} />
                <Text style={styles.legendText}>Media (60-80%)</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.confidenceDot, { backgroundColor: '#e91e63' }]} />
                <Text style={styles.legendText}>Bassa (&lt;60%)</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.confidenceDot, { backgroundColor: '#f44336' }]} />
                <Text style={styles.legendText}>Richiede Attenzione</Text>
              </View>
            </View>
          </View>
        </ScrollView>

        {/* Date/Time Pickers */}
        {showDatePicker && (
          <View style={styles.pickerOverlay}>
            <View style={styles.pickerContainer}>
              <View style={styles.pickerHeader}>
                <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                  <Text style={styles.pickerCancelText}>Annulla</Text>
                </TouchableOpacity>
                <Text style={styles.pickerTitle}>Seleziona Data</Text>
                <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                  <Text style={styles.pickerConfirmText}>Conferma</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.pickerWrapper}>
                <DateTimePicker
                  value={selectedDate}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={handleDateChange}
                  style={styles.picker}
                  textColor={Platform.OS === 'ios' ? '#000' : undefined}
                />
              </View>
            </View>
          </View>
        )}

        {showTimePicker && (
          <View style={styles.pickerOverlay}>
            <View style={styles.pickerContainer}>
              <View style={styles.pickerHeader}>
                <TouchableOpacity onPress={() => setShowTimePicker(false)}>
                  <Text style={styles.pickerCancelText}>Annulla</Text>
                </TouchableOpacity>
                <Text style={styles.pickerTitle}>Seleziona Ora</Text>
                <TouchableOpacity onPress={() => setShowTimePicker(false)}>
                  <Text style={styles.pickerConfirmText}>Conferma</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.pickerWrapper}>
                <DateTimePicker
                  value={selectedTime}
                  mode="time"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={handleTimeChange}
                  style={styles.picker}
                  textColor={Platform.OS === 'ios' ? '#000' : undefined}
                />
              </View>
            </View>
          </View>
        )}

        {/* Category Picker */}
        {showCategoryPicker && (
          <View style={styles.pickerOverlay}>
            <View style={styles.pickerContainer}>
              <View style={styles.pickerHeader}>
                <TouchableOpacity onPress={() => setShowCategoryPicker(false)}>
                  <Text style={styles.pickerCancelText}>Annulla</Text>
                </TouchableOpacity>
                <Text style={styles.pickerTitle}>Seleziona Categoria</Text>
                <TouchableOpacity onPress={() => setShowCategoryPicker(false)}>
                  <Text style={styles.pickerConfirmText}>Conferma</Text>
                </TouchableOpacity>
              </View>
              <ScrollView style={styles.categoryPickerList}>
                {categories.map((cat) => (
                  <TouchableOpacity
                    key={cat.value}
                    style={[
                      styles.categoryPickerItem,
                      category === cat.value && styles.categoryPickerItemSelected,
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
                      styles.categoryPickerItemText,
                      category === cat.value && styles.categoryPickerItemTextSelected,
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
        )}
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#212529',
  },
  confirmText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#007AFF',
  },
  disabledText: {
    color: '#9e9e9e',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 30,
    lineHeight: 22,
  },
  fieldContainer: {
    marginBottom: 24,
  },
  fieldHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  fieldLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212529',
  },
  confidenceIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  confidenceDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  confidenceText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  amountContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  amountInput: {
    flex: 1,
    fontSize: 24,
    fontWeight: '600',
    color: '#212529',
    textAlign: 'right',
  },
  currencyText: {
    fontSize: 24,
    fontWeight: '600',
    color: '#007AFF',
    marginLeft: 8,
  },
  dateTimeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  dateTimeText: {
    flex: 1,
    fontSize: 16,
    color: '#212529',
    marginLeft: 12,
  },
  textInput: {
    backgroundColor: 'white',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#212529',
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  categoryDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f8ff',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  categoryText: {
    flex: 1,
    fontSize: 16,
    color: '#212529',
    fontWeight: '500',
    marginLeft: 12,
  },
  infoContainer: {
    backgroundColor: '#e8f4fd',
    borderRadius: 12,
    padding: 16,
    marginTop: 12,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1565c0',
    marginBottom: 12,
  },
  legendContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  legendText: {
    fontSize: 12,
    color: '#1565c0',
    marginLeft: 4,
  },
  // Stili per DateTimePicker overlay
  pickerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
    zIndex: 1000,
  },
  pickerContainer: {
    backgroundColor: 'white',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20, // Safe area per iOS
    minHeight: Platform.OS === 'ios' ? 300 : 'auto', // Altezza minima per iOS
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
    backgroundColor: 'white',
  },
  pickerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#212529',
  },
  pickerCancelText: {
    fontSize: 16,
    color: '#666',
  },
  pickerConfirmText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#007AFF',
  },
  picker: {
    backgroundColor: 'white',
    height: Platform.OS === 'ios' ? 216 : 'auto', // Altezza standard per iOS picker
    width: '100%',
  },
  pickerWrapper: {
    backgroundColor: 'white',
    paddingVertical: Platform.OS === 'ios' ? 10 : 0,
    paddingHorizontal: Platform.OS === 'ios' ? 20 : 0,
  },
  categoryPickerList: {
    maxHeight: 400,
    backgroundColor: 'white',
  },
  categoryPickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  categoryPickerItemSelected: {
    backgroundColor: '#f0f8ff',
  },
  categoryPickerItemText: {
    flex: 1,
    fontSize: 16,
    color: '#212529',
    marginLeft: 12,
  },
  categoryPickerItemTextSelected: {
    color: '#007AFF',
    fontWeight: '600',
  },
});
