/**
 * Schermata dettaglio spesa con gestione immagine e thumbnail
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  StatusBar,
  Modal,
  Dimensions,
  ActivityIndicator
} from 'react-native';
import { Image } from 'expo-image';
import { databaseManager, Expense } from '../services/database';
import { SyncStatusMini } from '../components/SyncStatusIndicator';
import { syncManager } from '../services/syncManager';

interface ExpenseDetailScreenProps {
  route: {
    params: {
      expenseId: string;
    };
  };
  navigation: any;
}

export const ExpenseDetailScreen: React.FC<ExpenseDetailScreenProps> = ({
  route,
  navigation
}) => {
  const { expenseId } = route.params;
  const [expense, setExpense] = useState<Expense | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showFullImage, setShowFullImage] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);

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
      console.log('📊 Loaded expense:', loadedExpense);
    } catch (error) {
      console.error('❌ Failed to load expense:', error);
      Alert.alert('Errore', 'Impossibile caricare la spesa');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = () => {
    navigation.navigate('ExpenseEdit', { expenseId });
  };

  const handleArchive = async () => {
    if (!expense) return;

    const actionText = expense.is_archived ? 'ripristinare' : 'archiviare';
    const confirmText = expense.is_archived ? 'Ripristina' : 'Archivia';

    Alert.alert(
      `${confirmText} spesa`,
      `Confermi di voler ${actionText} questa spesa?`,
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: confirmText,
          onPress: async () => {
            try {
              await databaseManager.updateExpense(expense.id, {
                is_archived: !expense.is_archived,
                sync_status: 'pending',
                updated_at: new Date().toISOString()
              });

              console.log(`📝 Expense ${expense.is_archived ? 'restored' : 'archived'}`);
              
              // Ricarica la spesa
              await loadExpense();
              
              // Avvia sync in background
              syncManager.syncAll().catch(console.error);
              
            } catch (error) {
              console.error('❌ Failed to toggle archive:', error);
              Alert.alert('Errore', `Impossibile ${actionText} la spesa`);
            }
          }
        }
      ]
    );
  };

  const handleDelete = async () => {
    if (!expense) return;

    Alert.alert(
      'Elimina spesa',
      `Eliminare definitivamente la spesa di ${expense.amount.toFixed(2)} ${expense.currency}?`,
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Elimina',
          style: 'destructive',
          onPress: async () => {
            try {
              await databaseManager.deleteExpense(expense.id);
              console.log('🗑️ Expense deleted');
              
              // Avvia sync in background
              syncManager.syncAll().catch(console.error);
              
              // Torna indietro
              navigation.goBack();
              
            } catch (error) {
              console.error('❌ Failed to delete expense:', error);
              Alert.alert('Errore', 'Impossibile eliminare la spesa');
            }
          }
        }
      ]
    );
  };

  const getSyncStatusColor = () => {
    if (!expense) return '#6c757d';
    switch (expense.sync_status) {
      case 'synced': return '#28a745';
      case 'pending': return '#f0ad4e';
      case 'error': return '#dc3545';
      default: return '#6c757d';
    }
  };

  const getSyncStatusText = () => {
    if (!expense) return 'Sconosciuto';
    switch (expense.sync_status) {
      case 'synced': return 'Sincronizzato';
      case 'pending': return 'In attesa';
      case 'error': return 'Errore';
      default: return 'Sconosciuto';
    }
  };

  const formatDate = (dateString: string, timeString?: string) => {
    try {
      const date = new Date(dateString);
      const formattedDate = date.toLocaleDateString('it-IT');
      return timeString ? `${formattedDate} ${timeString}` : formattedDate;
    } catch {
      return dateString + (timeString ? ` ${timeString}` : '');
    }
  };

  const getReceiptImageSource = () => {
    if (!expense) return null;
    
    // Preferisci il thumbnail se disponibile per la vista anteprima
    if (expense.receipt_thumbnail_url) {
      return { uri: expense.receipt_thumbnail_url };
    }
    
    // Fallback all'immagine completa
    if (expense.receipt_image_url) {
      return { uri: expense.receipt_image_url };
    }
    
    // Fallback all'immagine locale (se ancora disponibile)
    if (expense.receipt_image_path) {
      return { uri: expense.receipt_image_path };
    }
    
    return null;
  };

  const getFullImageSource = () => {
    if (!expense) return null;
    
    // Per la vista a schermo intero, usa sempre l'immagine originale se disponibile
    if (expense.receipt_image_url) {
      return { uri: expense.receipt_image_url };
    }
    
    // Fallback al thumbnail se l'originale non è disponibile
    if (expense.receipt_thumbnail_url) {
      return { uri: expense.receipt_thumbnail_url };
    }
    
    // Fallback all'immagine locale
    if (expense.receipt_image_path) {
      return { uri: expense.receipt_image_path };
    }
    
    return null;
  };

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#007bff" />
        <Text style={styles.loadingText}>Caricamento...</Text>
      </View>
    );
  }

  if (!expense) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>Spesa non trovata</Text>
      </View>
    );
  }

  const receiptImageSource = getReceiptImageSource();
  const fullImageSource = getFullImageSource();

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      
      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerTitle}>
            <Text style={styles.title}>Dettaglio Spesa</Text>
            <SyncStatusMini style={styles.syncIndicator} />
          </View>
          
          <View style={styles.headerActions}>
            <TouchableOpacity onPress={handleEdit} style={styles.actionButton}>
              <Text style={styles.actionButtonText}>✏️</Text>
            </TouchableOpacity>
            
            <TouchableOpacity onPress={handleArchive} style={styles.actionButton}>
              <Text style={styles.actionButtonText}>
                {expense.is_archived ? '📤' : '📥'}
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity onPress={handleDelete} style={styles.actionButton}>
              <Text style={styles.actionButtonText}>🗑️</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Status Card */}
        {expense.is_archived && (
          <View style={styles.archivedBanner}>
            <Text style={styles.archivedText}>📥 Spesa Archiviata</Text>
          </View>
        )}

        {/* Main Info Card */}
        <View style={styles.card}>
          <View style={styles.amountContainer}>
            <Text style={styles.amount}>
              {expense.amount.toFixed(2)} {expense.currency}
            </Text>
            <View style={styles.syncStatusContainer}>
              <View 
                style={[
                  styles.syncStatusDot, 
                  { backgroundColor: getSyncStatusColor() }
                ]} 
              />
              <Text style={styles.syncStatusText}>
                {getSyncStatusText()}
              </Text>
            </View>
          </View>

          {expense.merchant_name && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Commerciante:</Text>
              <Text style={styles.infoValue}>{expense.merchant_name}</Text>
            </View>
          )}

          {expense.merchant_address && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Indirizzo:</Text>
              <Text style={styles.infoValue}>{expense.merchant_address}</Text>
            </View>
          )}

          {expense.merchant_vat && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>P.IVA:</Text>
              <Text style={styles.infoValue}>{expense.merchant_vat}</Text>
            </View>
          )}

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Categoria:</Text>
            <Text style={styles.infoValue}>{expense.category || 'Non specificata'}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Data:</Text>
            <Text style={styles.infoValue}>
              {formatDate(expense.receipt_date, expense.receipt_time)}
            </Text>
          </View>
        </View>

        {/* Receipt Image Card */}
        {receiptImageSource && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Scontrino</Text>
            <TouchableOpacity 
              onPress={() => setShowFullImage(true)}
              style={styles.imageContainer}
            >
              <Image
                source={receiptImageSource}
                style={styles.receiptImage}
                contentFit="cover"
                onLoadStart={() => setImageLoading(true)}
                onLoad={() => setImageLoading(false)}
// placeholder gestito automaticamente da expo-image
              />
              {imageLoading && (
                <View style={styles.imageLoadingOverlay}>
                  <ActivityIndicator size="small" color="#007bff" />
                </View>
              )}
              <View style={styles.imageOverlay}>
                <Text style={styles.imageOverlayText}>Tocca per ingrandire</Text>
              </View>
            </TouchableOpacity>
          </View>
        )}

        {/* Notes Card */}
        {expense.notes && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Note</Text>
            <Text style={styles.notesText}>{expense.notes}</Text>
          </View>
        )}

        {/* Metadata Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Informazioni</Text>
          
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Creata:</Text>
            <Text style={styles.infoValue}>
              {new Date(expense.created_at).toLocaleString('it-IT')}
            </Text>
          </View>
          
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Modificata:</Text>
            <Text style={styles.infoValue}>
              {new Date(expense.updated_at).toLocaleString('it-IT')}
            </Text>
          </View>
          
          {expense.last_sync && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Ultima sync:</Text>
              <Text style={styles.infoValue}>
                {new Date(expense.last_sync).toLocaleString('it-IT')}
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Full Screen Image Modal */}
      <Modal
        visible={showFullImage}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowFullImage(false)}
      >
        <View style={styles.modalContainer}>
          <StatusBar barStyle="light-content" backgroundColor="#000" />
          
          <TouchableOpacity 
            style={styles.modalCloseButton}
            onPress={() => setShowFullImage(false)}
          >
            <Text style={styles.modalCloseText}>✕</Text>
          </TouchableOpacity>
          
          {fullImageSource && (
            <Image
              source={fullImageSource}
              style={styles.fullImage}
              contentFit="contain"
            />
          )}
        </View>
      </Modal>
    </>
  );
};

const { width, height } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa'
  },
  contentContainer: {
    paddingBottom: 20
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f9fa'
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef'
  },
  headerTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#212529',
    marginRight: 12
  },
  syncIndicator: {
    // Stili per sync indicator
  },
  headerActions: {
    flexDirection: 'row'
  },
  actionButton: {
    padding: 8,
    marginLeft: 8,
    borderRadius: 20,
    backgroundColor: '#f8f9fa'
  },
  actionButtonText: {
    fontSize: 18
  },
  archivedBanner: {
    backgroundColor: '#ffc107',
    padding: 12,
    margin: 16,
    borderRadius: 8,
    alignItems: 'center'
  },
  archivedText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#856404'
  },
  card: {
    backgroundColor: '#fff',
    margin: 16,
    marginTop: 8,
    marginBottom: 8,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#212529',
    marginBottom: 12
  },
  amountContainer: {
    alignItems: 'center',
    marginBottom: 20
  },
  amount: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#28a745',
    marginBottom: 8
  },
  syncStatusContainer: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  syncStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6
  },
  syncStatusText: {
    fontSize: 14,
    color: '#6c757d'
  },
  infoRow: {
    flexDirection: 'row',
    marginBottom: 12,
    alignItems: 'flex-start'
  },
  infoLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#495057',
    width: 100,
    flexShrink: 0
  },
  infoValue: {
    fontSize: 14,
    color: '#212529',
    flex: 1
  },
  imageContainer: {
    position: 'relative',
    borderRadius: 8,
    overflow: 'hidden'
  },
  receiptImage: {
    width: '100%',
    height: 200,
    backgroundColor: '#f8f9fa'
  },
  imageLoadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(248, 249, 250, 0.8)'
  },
  imageOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    padding: 8
  },
  imageOverlayText: {
    color: '#fff',
    fontSize: 12,
    textAlign: 'center'
  },
  notesText: {
    fontSize: 16,
    color: '#495057',
    lineHeight: 24
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center'
  },
  modalCloseButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 1,
    padding: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 20
  },
  modalCloseText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold'
  },
  fullImage: {
    width: width,
    height: height,
    backgroundColor: '#000'
  },
  loadingText: {
    fontSize: 16,
    color: '#007bff',
    marginTop: 12
  },
  errorText: {
    fontSize: 18,
    color: '#dc3545',
    textAlign: 'center'
  }
});
