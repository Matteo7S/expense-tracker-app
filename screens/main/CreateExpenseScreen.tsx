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
  FlatList,
  Modal,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { MaterialIcons } from '@expo/vector-icons';
import { Expense, CreateExpenseData, ExpenseCategory } from '../../types';
import { expenseService } from '../../services/expenseService';
import { MainStackParamList } from '../../navigation/MainNavigator';

type CreateExpenseScreenNavigationProp = StackNavigationProp<MainStackParamList, 'CreateExpense'>;
type CreateExpenseScreenRouteProp = RouteProp<MainStackParamList, 'CreateExpense'> | RouteProp<MainStackParamList, 'EditExpense'>;

interface CategoryOption {
  value: ExpenseCategory;
  label: string;
  icon: string;
  color: string;
}

const CATEGORIES: CategoryOption[] = [
  {
    value: ExpenseCategory.FOOD,
    label: 'Cibo e Bevande',
    icon: 'restaurant',
    color: '#FF6B6B',
  },
  {
    value: ExpenseCategory.TRANSPORT,
    label: 'Trasporti',
    icon: 'directions-car',
    color: '#4ECDC4',
  },
  {
    value: ExpenseCategory.ACCOMMODATION,
    label: 'Alloggio',
    icon: 'hotel',
    color: '#45B7D1',
  },
  {
    value: ExpenseCategory.ENTERTAINMENT,
    label: 'Intrattenimento',
    icon: 'movie',
    color: '#96CEB4',
  },
  {
    value: ExpenseCategory.SHOPPING,
    label: 'Shopping',
    icon: 'shopping-bag',
    color: '#FFEAA7',
  },
  {
    value: ExpenseCategory.HEALTH,
    label: 'Salute',
    icon: 'local-hospital',
    color: '#DDA0DD',
  },
  {
    value: ExpenseCategory.BUSINESS,
    label: 'Business',
    icon: 'business',
    color: '#98D8C8',
  },
  {
    value: ExpenseCategory.OTHER,
    label: 'Altro',
    icon: 'more-horiz',
    color: '#BDC3C7',
  },
];

export function CreateExpenseScreen() {
  const navigation = useNavigation<CreateExpenseScreenNavigationProp>();
  const route = useRoute<CreateExpenseScreenRouteProp>();
  
  const isEdit = route.name === 'EditExpense';
  const reportId = 'reportId' in route.params ? route.params.reportId : '';
  const expenseId = 'expenseId' in route.params ? route.params.expenseId : '';

  const [formData, setFormData] = useState<CreateExpenseData>({
    reportId: reportId,
    description: '',
    amount: 0,
    category: ExpenseCategory.OTHER,
    subcategory: '',
    numberOfPeople: 1,
    receiptImages: [],
  });

  const [amountText, setAmountText] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingExpense, setLoadingExpense] = useState(false);
  const [errors, setErrors] = useState<{[key: string]: string}>({});
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [subcategories, setSubcategories] = useState<string[]>([]);
  const [showSubcategoryModal, setShowSubcategoryModal] = useState(false);

  useEffect(() => {
    if (isEdit && expenseId) {
      loadExpense();
    }
  }, [isEdit, expenseId]);

  useEffect(() => {
    // Aggiorna le sottocategorie quando cambia la categoria
    const newSubcategories = expenseService.getSubcategoriesForCategory(formData.category);
    setSubcategories(newSubcategories);
    
    // Reset subcategory se non è valida per la nuova categoria
    if (formData.subcategory && !newSubcategories.includes(formData.subcategory)) {
      setFormData(prev => ({ ...prev, subcategory: '' }));
    }
  }, [formData.category]);

  const loadExpense = async () => {
    try {
      setLoadingExpense(true);
      const expense = await expenseService.getExpense(expenseId);
      setFormData({
        reportId: expense.reportId,
        description: expense.description,
        amount: expense.amount,
        category: expense.category,
        subcategory: expense.subcategory || '',
        numberOfPeople: expense.numberOfPeople || 1,
        receiptImages: expense.receiptImages || [],
      });
      setAmountText(expense.amount.toString());
    } catch (error: any) {
      Alert.alert('Errore', 'Impossibile caricare la spesa');
      navigation.goBack();
    } finally {
      setLoadingExpense(false);
    }
  };

  const validateForm = (): boolean => {
    const newErrors: {[key: string]: string} = {};

    if (!formData.description.trim()) {
      newErrors.description = 'Il nome dell\'esercente è obbligatorio';
    }

    if (formData.amount <= 0) {
      newErrors.amount = 'L\'importo deve essere maggiore di zero';
    }

    if (formData.numberOfPeople && formData.numberOfPeople <= 0) {
      newErrors.numberOfPeople = 'Il numero di persone deve essere maggiore di zero';
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
      
      if (isEdit && expenseId) {
        await expenseService.updateExpense(expenseId, formData);
        Alert.alert('Successo', 'Spesa aggiornata con successo');
      } else {
        await expenseService.createExpense(formData);
        Alert.alert('Successo', 'Spesa creata con successo');
      }
      
      navigation.goBack();
    } catch (error: any) {
      const errorMessage = isEdit 
        ? 'Impossibile aggiornare la spesa' 
        : 'Impossibile creare la spesa';
      Alert.alert('Errore', errorMessage);
      console.error('Error saving expense:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAmountChange = (text: string) => {
    setAmountText(text);
    const amount = parseFloat(text) || 0;
    setFormData(prev => ({ ...prev, amount }));
    setErrors(prev => ({ ...prev, amount: '' }));
  };

  const handleCategorySelect = (category: ExpenseCategory) => {
    setFormData(prev => ({ ...prev, category }));
    setShowCategoryModal(false);
  };

  const handleSubcategorySelect = (subcategory: string) => {
    setFormData(prev => ({ ...prev, subcategory }));
    setShowSubcategoryModal(false);
  };

  const getSelectedCategory = () => {
    return CATEGORIES.find(cat => cat.value === formData.category) || CATEGORIES[CATEGORIES.length - 1];
  };

  const renderCategoryItem = ({ item }: { item: CategoryOption }) => (
    <TouchableOpacity
      style={[styles.categoryItem, { borderColor: item.color }]}
      onPress={() => handleCategorySelect(item.value)}
    >
      <View style={[styles.categoryIcon, { backgroundColor: item.color }]}>
        <MaterialIcons name={item.icon as any} size={24} color="white" />
      </View>
      <Text style={styles.categoryLabel}>{item.label}</Text>
      {formData.category === item.value && (
        <MaterialIcons name="check" size={24} color={item.color} />
      )}
    </TouchableOpacity>
  );

  const renderSubcategoryItem = ({ item }: { item: string }) => (
    <TouchableOpacity
      style={[styles.subcategoryItem, formData.subcategory === item && styles.subcategoryItemSelected]}
      onPress={() => handleSubcategorySelect(item)}
    >
      <Text style={[styles.subcategoryLabel, formData.subcategory === item && styles.subcategoryLabelSelected]}>
        {item.charAt(0).toUpperCase() + item.slice(1)}
      </Text>
      {formData.subcategory === item && (
        <MaterialIcons name="check" size={20} color="#007AFF" />
      )}
    </TouchableOpacity>
  );

  if (loadingExpense) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Caricamento...</Text>
      </View>
    );
  }

  const selectedCategory = getSelectedCategory();

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} keyboardShouldPersistTaps="handled">
        <View style={styles.form}>
          {/* Esercente */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Esercente *</Text>
            <TextInput
              style={[styles.input, errors.description && styles.inputError]}
              value={formData.description}
              onChangeText={(text) => {
                setFormData(prev => ({ ...prev, description: text }));
                setErrors(prev => ({ ...prev, description: '' }));
              }}
              placeholder="Nome dell'esercente"
              placeholderTextColor="#999"
            />
            {errors.description && <Text style={styles.errorText}>{errors.description}</Text>}
          </View>

          {/* Importo */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Importo (€) *</Text>
            <TextInput
              style={[styles.input, errors.amount && styles.inputError]}
              value={amountText}
              onChangeText={handleAmountChange}
              placeholder="0.00"
              placeholderTextColor="#999"
              keyboardType="numeric"
            />
            {errors.amount && <Text style={styles.errorText}>{errors.amount}</Text>}
          </View>

          {/* Categoria */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Categoria *</Text>
            <TouchableOpacity
              style={styles.categorySelector}
              onPress={() => setShowCategoryModal(true)}
            >
              <View style={styles.categorySelectorContent}>
                <View style={[styles.categoryIcon, { backgroundColor: selectedCategory.color }]}>
                  <MaterialIcons name={selectedCategory.icon as any} size={20} color="white" />
                </View>
                <Text style={styles.categorySelectorText}>{selectedCategory.label}</Text>
              </View>
              <MaterialIcons name="keyboard-arrow-down" size={24} color="#666" />
            </TouchableOpacity>
          </View>

          {/* Sottocategoria */}
          {subcategories.length > 0 && (
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Sottocategoria</Text>
              <TouchableOpacity
                style={styles.subcategorySelector}
                onPress={() => setShowSubcategoryModal(true)}
              >
                <Text style={[styles.subcategorySelectorText, !formData.subcategory && styles.placeholderText]}>
                  {formData.subcategory 
                    ? formData.subcategory.charAt(0).toUpperCase() + formData.subcategory.slice(1)
                    : 'Seleziona sottocategoria'
                  }
                </Text>
                <MaterialIcons name="keyboard-arrow-down" size={24} color="#666" />
              </TouchableOpacity>
            </View>
          )}

          {/* Numero di persone */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Numero di persone</Text>
            <TextInput
              style={[styles.input, errors.numberOfPeople && styles.inputError]}
              value={formData.numberOfPeople?.toString() || '1'}
              onChangeText={(text) => {
                const numberOfPeople = parseInt(text) || 1;
                setFormData(prev => ({ ...prev, numberOfPeople }));
                setErrors(prev => ({ ...prev, numberOfPeople: '' }));
              }}
              placeholder="1"
              placeholderTextColor="#999"
              keyboardType="numeric"
            />
            {errors.numberOfPeople && <Text style={styles.errorText}>{errors.numberOfPeople}</Text>}
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

      {/* Category Modal */}
      <Modal
        visible={showCategoryModal}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Seleziona Categoria</Text>
            <TouchableOpacity onPress={() => setShowCategoryModal(false)}>
              <MaterialIcons name="close" size={24} color="#666" />
            </TouchableOpacity>
          </View>
          <FlatList
            data={CATEGORIES}
            renderItem={renderCategoryItem}
            keyExtractor={(item) => item.value}
            contentContainerStyle={styles.categoryList}
          />
        </SafeAreaView>
      </Modal>

      {/* Subcategory Modal */}
      <Modal
        visible={showSubcategoryModal}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Seleziona Sottocategoria</Text>
            <TouchableOpacity onPress={() => setShowSubcategoryModal(false)}>
              <MaterialIcons name="close" size={24} color="#666" />
            </TouchableOpacity>
          </View>
          <FlatList
            data={['', ...subcategories]}
            renderItem={({ item }) => {
              if (item === '') {
                return (
                  <TouchableOpacity
                    style={[styles.subcategoryItem, formData.subcategory === '' && styles.subcategoryItemSelected]}
                    onPress={() => handleSubcategorySelect('')}
                  >
                    <Text style={[styles.subcategoryLabel, formData.subcategory === '' && styles.subcategoryLabelSelected]}>
                      Nessuna sottocategoria
                    </Text>
                    {formData.subcategory === '' && (
                      <MaterialIcons name="check" size={20} color="#007AFF" />
                    )}
                  </TouchableOpacity>
                );
              }
              return renderSubcategoryItem({ item });
            }}
            keyExtractor={(item, index) => `${item}-${index}`}
            contentContainerStyle={styles.subcategoryList}
          />
        </SafeAreaView>
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
  errorText: {
    color: '#ff4444',
    fontSize: 14,
    marginTop: 5,
  },
  categorySelector: {
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  categorySelectorContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  categorySelectorText: {
    fontSize: 16,
    color: '#333',
    marginLeft: 12,
  },
  subcategorySelector: {
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  subcategorySelectorText: {
    fontSize: 16,
    color: '#333',
  },
  placeholderText: {
    color: '#999',
  },
  categoryIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
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
  modalContainer: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  categoryList: {
    padding: 20,
  },
  categoryItem: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  categoryLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    marginLeft: 12,
    flex: 1,
  },
  subcategoryList: {
    padding: 20,
  },
  subcategoryItem: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 8,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  subcategoryItemSelected: {
    backgroundColor: '#007AFF20',
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  subcategoryLabel: {
    fontSize: 16,
    color: '#333',
  },
  subcategoryLabelSelected: {
    color: '#007AFF',
    fontWeight: '600',
  },
});
