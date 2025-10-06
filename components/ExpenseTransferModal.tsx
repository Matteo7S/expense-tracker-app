/**
 * Modal per trasferire spese tra note spese
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  SafeAreaView,
  FlatList,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useModernModal, createErrorModal, createConfirmModal, createSuccessModal } from './ModernModal';
import { ExpenseReport } from '../types';
import { expenseReportService } from '../services/expenseReportService';
import { expenseService } from '../services/expenseService';

interface ExpenseTransferModalProps {
  visible: boolean;
  onClose: () => void;
  selectedExpenseIds: string[];
  currentReportId: string;
  onTransferComplete: () => void;
}

interface ReportOption {
  id: string;
  name: string;
  description?: string;
  totalAmount: number;
  isCurrentReport: boolean;
}

export const ExpenseTransferModal: React.FC<ExpenseTransferModalProps> = ({
  visible,
  onClose,
  selectedExpenseIds,
  currentReportId,
  onTransferComplete,
}) => {
  const [reports, setReports] = useState<ReportOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const { showModal, hideModal, ModalComponent } = useModernModal();

  useEffect(() => {
    if (visible) {
      loadReports();
    }
  }, [visible]);

  const loadReports = async () => {
    try {
      setLoading(true);
      const response = await expenseReportService.getExpenseReports();
      
      // Gestisce sia la struttura {data: [...]} che l'array diretto
      let allReports: any[];
      if (response && typeof response === 'object' && 'data' in response) {
        // Risposta con struttura {data: [...], pagination: {...}}
        allReports = response.data;
        console.log('📋 Found expense reports structure with data property:', allReports.length);
      } else if (Array.isArray(response)) {
        // Array diretto
        allReports = response;
        console.log('📋 Found expense reports as direct array:', allReports.length);
      } else {
        console.warn('⚠️ Unexpected response structure:', response);
        setReports([]);
        return;
      }
      
      if (!Array.isArray(allReports)) {
        console.warn('⚠️ allReports is not an array:', allReports);
        setReports([]);
        return;
      }
      
      const reportOptions: ReportOption[] = allReports.map(report => ({
        id: report.id,
        name: report.name,
        description: report.description,
        totalAmount: report.totalAmount,
        isCurrentReport: report.id === currentReportId,
      }));

      console.log(`✅ Loaded ${reportOptions.length} expense reports for transfer`);
      setReports(reportOptions);
    } catch (error) {
      console.error('❌ Failed to load expense reports:', error);
      showModal(createErrorModal(
        'Errore',
        'Impossibile caricare le note spese dal database locale',
        () => hideModal()
      ));
      setReports([]);
    } finally {
      setLoading(false);
    }
  };

  const handleTransfer = async (targetReportId: string) => {
    console.log('📄 handleTransfer called for target report:', targetReportId);
    
    if (targetReportId === currentReportId) {
      console.log('⚠️ Transfer blocked - same report');
      showModal(createErrorModal(
        'Attenzione',
        'Non puoi trasferire le spese nella stessa nota spese',
        () => hideModal()
      ));
      return;
    }

    const targetReport = reports.find(r => r.id === targetReportId);
    if (!targetReport) {
      console.log('❌ Target report not found:', targetReportId);
      return;
    }
    
    console.log('🎯 Target report found:', targetReport.name);
    console.log('📄 Showing confirmation modal...');

    showModal(createConfirmModal(
      'Conferma Trasferimento',
      `Trasferire ${selectedExpenseIds.length} ${selectedExpenseIds.length === 1 ? 'spesa' : 'spese'} in "${targetReport.name}"?`,
      () => {
        console.log('✅ User confirmed transfer - calling performTransfer');
        hideModal();
        performTransfer(targetReportId);
      },
      () => {
        console.log('❌ User cancelled transfer');
        hideModal();
      },
      'Conferma',
      'Annulla'
    ));
    
    console.log('📄 Confirmation modal should now be visible');
  };

  const performTransfer = async (targetReportId: string) => {
    try {
      setTransferring(true);

      // Transfer each expense to the target report using the database manager
      const { databaseManager } = require('../services/database');
      for (const expenseId of selectedExpenseIds) {
        await databaseManager.moveExpenseToReport(expenseId, targetReportId);
      }

      console.log(`\u2705 Transferred ${selectedExpenseIds.length} expenses to report ${targetReportId}`);
      
      console.log('🎉 About to show success modal...');
      
      // Piccolo delay per evitare interferenze con il timeout del modal precedente
      setTimeout(() => {
        console.log('⏳ Showing success modal after delay...');
        showModal(createSuccessModal(
          'Trasferimento Completato',
          `${selectedExpenseIds.length} ${selectedExpenseIds.length === 1 ? 'spesa trasferita' : 'spese trasferite'} con successo!`,
          () => {
            console.log('🎉 Transfer success modal - user clicked OK');
            hideModal();
            
            try {
              console.log('🔄 Calling onTransferComplete to refresh data...');
              onTransferComplete();
              console.log('✅ onTransferComplete completed successfully');
            } catch (error) {
              console.error('❌ Error in onTransferComplete:', error);
            }
            
            try {
              console.log('🚪 Calling onClose to close transfer modal...');
              onClose();
              console.log('✅ onClose completed successfully');
            } catch (error) {
              console.error('❌ Error in onClose:', error);
            }
          }
        ));
      }, 350); // Delay di 350ms, leggermente superiore ai 300ms del timeout
    } catch (error) {
      console.error('❌ Failed to transfer expenses:', error);
      showModal(createErrorModal(
        'Errore',
        'Impossibile trasferire le spese',
        () => hideModal()
      ));
    } finally {
      setTransferring(false);
    }
  };

  const renderReportItem = ({ item }: { item: ReportOption }) => (
    <TouchableOpacity
      style={[
        styles.reportItem,
        item.isCurrentReport && styles.currentReportItem,
      ]}
      onPress={() => handleTransfer(item.id)}
      disabled={item.isCurrentReport || transferring}
    >
      <View style={styles.reportInfo}>
        <Text style={[
          styles.reportName,
          item.isCurrentReport && styles.currentReportText,
        ]}>
          {item.name}
          {item.isCurrentReport && ' (Corrente)'}
        </Text>
        {item.description && (
          <Text style={styles.reportDescription}>{item.description}</Text>
        )}
        <Text style={styles.reportTotal}>
          Totale: €{item.totalAmount.toFixed(2)}
        </Text>
      </View>
      {!item.isCurrentReport && (
        <MaterialIcons name="arrow-forward" size={24} color="#007AFF" />
      )}
    </TouchableOpacity>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
    >
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} disabled={transferring}>
            <MaterialIcons name="close" size={24} color="#007AFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Trasferisci Spese</Text>
          <View style={{ width: 24 }} />
        </View>

        {/* Info */}
        <View style={styles.infoContainer}>
          <Text style={styles.infoText}>
            Seleziona la nota spese di destinazione per trasferire{' '}
            {selectedExpenseIds.length} {selectedExpenseIds.length === 1 ? 'spesa' : 'spese'}
          </Text>
        </View>

        {/* Reports List */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#007AFF" />
            <Text style={styles.loadingText}>Caricamento note spese...</Text>
          </View>
        ) : (
          <FlatList
            data={reports}
            renderItem={renderReportItem}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContainer}
            showsVerticalScrollIndicator={false}
          />
        )}

        {/* Loading overlay */}
        {transferring && (
          <View style={styles.transferringOverlay}>
            <View style={styles.transferringContent}>
              <ActivityIndicator size="large" color="white" />
              <Text style={styles.transferringText}>
                Trasferimento in corso...
              </Text>
            </View>
          </View>
        )}
        
        {/* Modern Modal Component */}
        <ModalComponent />
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
  infoContainer: {
    padding: 20,
    backgroundColor: '#e3f2fd',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#1565c0',
    textAlign: 'center',
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
  listContainer: {
    padding: 16,
  },
  reportItem: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  currentReportItem: {
    backgroundColor: '#f8f9fa',
    borderColor: '#dee2e6',
  },
  reportInfo: {
    flex: 1,
  },
  reportName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#212529',
    marginBottom: 4,
  },
  currentReportText: {
    color: '#6c757d',
  },
  reportDescription: {
    fontSize: 14,
    color: '#6c757d',
    marginBottom: 4,
  },
  reportTotal: {
    fontSize: 14,
    fontWeight: '500',
    color: '#28a745',
  },
  transferringOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  transferringContent: {
    alignItems: 'center',
    padding: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    borderRadius: 12,
  },
  transferringText: {
    color: 'white',
    fontSize: 16,
    marginTop: 12,
  },
});
