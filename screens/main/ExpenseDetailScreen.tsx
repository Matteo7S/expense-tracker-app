import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  SafeAreaView,
  ActivityIndicator,
  Image,
  Dimensions,
  Linking,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { MaterialIcons } from '@expo/vector-icons';
import { Expense, ExpenseCategory } from '../../types';
import { expenseService } from '../../services/expenseService';
import { MainStackParamList } from '../../navigation/MainNavigator';

type ExpenseDetailScreenNavigationProp = StackNavigationProp<MainStackParamList, 'ExpenseDetail'>;
type ExpenseDetailScreenRouteProp = RouteProp<MainStackParamList, 'ExpenseDetail'>;

const { width } = Dimensions.get('window');

export function ExpenseDetailScreen() {
  const navigation = useNavigation<ExpenseDetailScreenNavigationProp>();
  const route = useRoute<ExpenseDetailScreenRouteProp>();
  const { expenseId } = route.params;

  const [expense, setExpense] = useState<Expense | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadExpense();
  }, [expenseId]);

  const loadExpense = async () => {
    try {
      setLoading(true);
      const expenseData = await expenseService.getExpense(expenseId);
      setExpense(expenseData);
    } catch (error: any) {
      Alert.alert('Errore', 'Impossibile caricare i dettagli della spesa');
      console.error('Error loading expense:', error);
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = () => {
    navigation.navigate('EditExpense', { expenseId });
  };

  const handleDelete = () => {
    Alert.alert(
      'Archivia Spesa',
      'Vuoi archiviare questa spesa? Potrai recuperarla dalla sezione Archivio.',
      [
        {
          text: 'Annulla',
          style: 'cancel',
        },
        {
          text: 'Archivia',
          style: 'destructive',
          onPress: async () => {
            try {
              // Usa soft delete (archive) invece di hard delete
              await expenseService.updateExpense(expenseId, {
                isArchived: true
              });
              Alert.alert('Successo', 'Spesa archiviata con successo');
              navigation.goBack();
            } catch (error: any) {
              Alert.alert('Errore', 'Impossibile archiviare la spesa');
            }
          },
        },
      ]
    );
  };

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

  const getCategoryLabel = (category: ExpenseCategory) => {
    switch (category) {
      case ExpenseCategory.FOOD:
        return 'Cibo e Bevande';
      case ExpenseCategory.TRANSPORT:
        return 'Trasporti';
      case ExpenseCategory.ACCOMMODATION:
        return 'Alloggio';
      case ExpenseCategory.ENTERTAINMENT:
        return 'Intrattenimento';
      case ExpenseCategory.SHOPPING:
        return 'Shopping';
      case ExpenseCategory.HEALTH:
        return 'Salute';
      case ExpenseCategory.BUSINESS:
        return 'Business';
      default:
        return 'Altro';
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Caricamento...</Text>
      </View>
    );
  }

  if (!expense) {
    return (
      <View style={styles.errorContainer}>
        <MaterialIcons name="error" size={64} color="#ff4444" />
        <Text style={styles.errorText}>Spesa non trovata</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView}>
        {/* Header with expense info */}
        <View style={styles.expenseHeader}>
          <View style={[styles.categoryIcon, { backgroundColor: getCategoryColor(expense.category) }]}>
            <MaterialIcons name={getCategoryIcon(expense.category) as any} size={32} color="white" />
          </View>
          <View style={styles.expenseInfo}>
            <Text style={styles.expenseDescription}>{expense.merchant || expense.description}</Text>
            <Text style={styles.expenseAmount}>€{expense.amount.toFixed(2)}</Text>
          </View>
        </View>

        {/* Details */}
        <View style={styles.detailsContainer}>
          <View style={styles.detailItem}>
            <MaterialIcons name="category" size={20} color="#666" />
            <Text style={styles.detailLabel}>Categoria</Text>
            <Text style={styles.detailValue}>{getCategoryLabel(expense.category)}</Text>
          </View>

          {expense.subcategory && (
            <View style={styles.detailItem}>
              <MaterialIcons name="label" size={20} color="#666" />
              <Text style={styles.detailLabel}>Sottocategoria</Text>
              <Text style={styles.detailValue}>
                {expense.subcategory.charAt(0).toUpperCase() + expense.subcategory.slice(1)}
              </Text>
            </View>
          )}

          {/* Data prioritaria (AI o database) */}
          {expense.date && (
            <View style={styles.detailItem}>
              <MaterialIcons name="event" size={20} color="#666" />
              <Text style={styles.detailLabel}>Data</Text>
              <Text style={styles.detailValue}>
                {new Date(expense.date).toLocaleDateString('it-IT', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </Text>
            </View>
          )}

          {/* Confidenza AI subito dopo la data */}
          {expense.aiConfidence && (
            <View style={styles.detailItem}>
              <MaterialIcons name="psychology" size={20} color="#666" />
              <Text style={styles.detailLabel}>Confidenza AI</Text>
              <Text style={[styles.detailValue, { 
                color: expense.aiConfidence > 0.8 ? '#4CAF50' : expense.aiConfidence > 0.6 ? '#FF9800' : '#F44336' 
              }]}>
                {Math.round(expense.aiConfidence * 100)}%
              </Text>
            </View>
          )}

          {/* Merchant dall'AI */}
          {expense.merchant && (
            <View style={styles.detailItem}>
              <MaterialIcons name="store" size={20} color="#666" />
              <Text style={styles.detailLabel}>Esercente</Text>
              <Text style={styles.detailValue}>{expense.merchant}</Text>
            </View>
          )}

          {/* Location dall'AI */}
          {expense.location && (
            <View style={styles.detailItem}>
              <MaterialIcons name="location-on" size={20} color="#666" />
              <Text style={styles.detailLabel}>Indirizzo</Text>
              <Text style={styles.detailValue}>{expense.location}</Text>
            </View>
          )}

          {/* VAT/P.IVA dall'AI */}
          {expense.vat && (
            <View style={styles.detailItem}>
              <MaterialIcons name="receipt-long" size={20} color="#666" />
              <Text style={styles.detailLabel}>P.IVA</Text>
              <Text style={styles.detailValue}>{expense.vat}</Text>
            </View>
          )}

          {/* Currency dall'AI */}
          {expense.currency && expense.currency !== 'EUR' && (
            <View style={styles.detailItem}>
              <MaterialIcons name="monetization-on" size={20} color="#666" />
              <Text style={styles.detailLabel}>Valuta</Text>
              <Text style={styles.detailValue}>{expense.currency}</Text>
            </View>
          )}

          {expense.numberOfPeople && expense.numberOfPeople > 1 && (
            <View style={styles.detailItem}>
              <MaterialIcons name="people" size={20} color="#666" />
              <Text style={styles.detailLabel}>Numero di persone</Text>
              <Text style={styles.detailValue}>{expense.numberOfPeople}</Text>
            </View>
          )}

          {/* Rimossa sezione AI Confidence da qui perché spostata sotto la data */}

          <View style={styles.detailItem}>
            <MaterialIcons name="schedule" size={20} color="#666" />
            <Text style={styles.detailLabel}>Data creazione</Text>
            <Text style={styles.detailValue}>
              {new Date(expense.createdAt).toLocaleDateString('it-IT', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </Text>
          </View>

          {expense.updatedAt && expense.updatedAt !== expense.createdAt && (
            <View style={styles.detailItem}>
              <MaterialIcons name="update" size={20} color="#666" />
              <Text style={styles.detailLabel}>Ultima modifica</Text>
              <Text style={styles.detailValue}>
                {new Date(expense.updatedAt).toLocaleDateString('it-IT', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </Text>
            </View>
          )}
        </View>

        {/* Note dall'AI */}
        {expense.note && (
          <View style={styles.noteContainer}>
            <Text style={styles.sectionTitle}>Note AI</Text>
            <View style={styles.noteContent}>
              <MaterialIcons name="info" size={20} color="#666" style={styles.noteIcon} />
              <Text style={styles.noteText}>{expense.note}</Text>
            </View>
          </View>
        )}

        {/* Receipt images */}
        {(expense.receipts && expense.receipts.length > 0) || (expense.receiptImages && expense.receiptImages.length > 0) && (
          <View style={styles.receiptsContainer}>
            <Text style={styles.sectionTitle}>Scontrini</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {/* Usa receipts se disponibile (con metadata), altrimenti receiptImages */}
              {expense.receipts && expense.receipts.length > 0 ? (
                expense.receipts.map((receipt, index) => (
                  <View key={receipt.id} style={styles.receiptCard}>
                    <TouchableOpacity 
                      style={styles.receiptImageContainer}
                      onPress={() => Linking.openURL(receipt.imageUrl)}
                    >
                      <Image source={{ uri: receipt.imageUrl }} style={styles.receiptImage} />
                    </TouchableOpacity>
                    <View style={styles.receiptInfo}>
                      <Text style={styles.receiptFileName} numberOfLines={1}>
                        {receipt.fileName}
                      </Text>
                      <Text style={styles.receiptDate}>
                        {new Date(receipt.uploadedAt).toLocaleDateString('it-IT', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                        })}
                      </Text>
                      <TouchableOpacity 
                        style={styles.openLinkButton}
                        onPress={() => Linking.openURL(receipt.imageUrl)}
                      >
                        <MaterialIcons name="open-in-new" size={16} color="#007AFF" />
                        <Text style={styles.openLinkText}>Apri</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              ) : (
                expense.receiptImages?.map((imageUrl, index) => (
                  <TouchableOpacity 
                    key={index} 
                    style={styles.receiptImageContainer}
                    onPress={() => Linking.openURL(imageUrl)}
                  >
                    <Image source={{ uri: imageUrl }} style={styles.receiptImage} />
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>
        )}

        {/* Action buttons */}
        <View style={styles.actionButtons}>
          <TouchableOpacity style={styles.editButton} onPress={handleEdit}>
            <MaterialIcons name="edit" size={24} color="white" />
            <Text style={styles.editButtonText}>Modifica</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
            <MaterialIcons name="delete" size={24} color="white" />
            <Text style={styles.deleteButtonText}>Elimina</Text>
          </TouchableOpacity>
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
  expenseHeader: {
    backgroundColor: 'white',
    margin: 16,
    padding: 20,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  categoryIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  expenseInfo: {
    flex: 1,
  },
  expenseDescription: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  expenseAmount: {
    fontSize: 24,
    fontWeight: '600',
    color: '#007AFF',
  },
  detailsContainer: {
    backgroundColor: 'white',
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  detailLabel: {
    fontSize: 16,
    color: '#666',
    marginLeft: 12,
    flex: 1,
  },
  detailValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    textAlign: 'right',
  },
  receiptsContainer: {
    marginHorizontal: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  receiptImageContainer: {
    marginRight: 12,
    borderRadius: 8,
    overflow: 'hidden',
  },
  receiptImage: {
    width: width * 0.4,
    height: width * 0.5,
    backgroundColor: '#f0f0f0',
  },
  actionButtons: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  editButton: {
    flex: 1,
    backgroundColor: '#007AFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 8,
    marginRight: 8,
  },
  editButtonText: {
    color: 'white',
    fontWeight: '600',
    marginLeft: 8,
    fontSize: 16,
  },
  deleteButton: {
    flex: 1,
    backgroundColor: '#ff4444',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 8,
    marginLeft: 8,
  },
  deleteButtonText: {
    color: 'white',
    fontWeight: '600',
    marginLeft: 8,
    fontSize: 16,
  },
  // Stili per la sezione note AI
  noteContainer: {
    backgroundColor: 'white',
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  noteContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  noteIcon: {
    marginTop: 2,
    marginRight: 12,
  },
  noteText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
    color: '#555',
  },
  // Stili per la sezione scontrini migliorata
  receiptCard: {
    marginRight: 16,
    borderRadius: 12,
    backgroundColor: 'white',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 3,
    overflow: 'hidden',
  },
  receiptInfo: {
    padding: 12,
    width: width * 0.4,
  },
  receiptFileName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  receiptDate: {
    fontSize: 11,
    color: '#666',
    marginBottom: 8,
  },
  openLinkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f0f8ff',
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  openLinkText: {
    fontSize: 12,
    color: '#007AFF',
    fontWeight: '600',
    marginLeft: 4,
  },
});
