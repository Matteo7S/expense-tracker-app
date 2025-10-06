import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { ExpenseReport } from '../types';

interface SwipeableExpenseReportItemProps {
  report: ExpenseReport;
  onPress: () => void;
  onDelete: () => void;
  onArchiveComplete?: () => void;
  onArchiveConfirm?: () => void;
}

// Fallback version for Expo Go compatibility (no reanimated/gestures)
export function SwipeableExpenseReportItem({
  report,
  onPress,
  onDelete,
  onArchiveComplete,
  onArchiveConfirm,
}: SwipeableExpenseReportItemProps) {
  const [showActions, setShowActions] = useState(false);

  const isGeneric = report.isGeneric || report.name === 'Nota Spesa Generica' || report.name === 'Note Spese Generiche';

  const handleLongPress = () => {
    if (!isGeneric) {
      setShowActions(!showActions);
    }
  };

  const handleDeletePress = () => {
    if (onArchiveConfirm) {
      onArchiveConfirm();
    } else {
      Alert.alert(
        'Archivia nota spesa',
        'Vuoi archiviare questa nota spesa?',
        [
          { text: 'Annulla', style: 'cancel' },
          { 
            text: 'Archivia', 
            style: 'destructive', 
            onPress: () => {
              onDelete();
              if (onArchiveComplete) {
                onArchiveComplete();
              }
            }
          },
        ]
      );
    }
    setShowActions(false);
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity 
        style={[
          styles.reportItem,
          isGeneric && styles.genericReportItem
        ]} 
        onPress={onPress}
        onLongPress={handleLongPress}
      >
        {isGeneric && (
          <View style={styles.genericHeader}>
            <MaterialIcons name="folder-special" size={24} color="#4A90E2" />
            <Text style={styles.genericBadge}>PREDEFINITA</Text>
          </View>
        )}
        
        <Text style={[
          styles.reportName,
          isGeneric && styles.genericReportName
        ]}>
          {report.name}
        </Text>
        
        {report.description && !isGeneric && (
          <Text style={styles.reportDescription}>{report.description}</Text>
        )}
        
        {isGeneric && (
          <Text style={styles.genericDescription}>
            Tutti gli scontrini scansionati dalla funzionalità "Scansiona"
          </Text>
        )}
        
        {!isGeneric && (
          <Text style={styles.reportDates}>
            {new Date(report.startDate).toLocaleDateString('it-IT')} - {' '}
            {new Date(report.endDate).toLocaleDateString('it-IT')}
          </Text>
        )}
      </TouchableOpacity>
      
      {/* Action buttons (shown when item is long-pressed) */}
      {showActions && !isGeneric && (
        <View style={styles.actionsContainer}>
          <TouchableOpacity style={styles.archiveButton} onPress={handleDeletePress}>
            <MaterialIcons name="archive" size={16} color="white" />
            <Text style={styles.actionButtonText}>Archivia</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 12,
    borderRadius: 12,
    backgroundColor: 'white',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  reportItem: {
    padding: 16,
    borderRadius: 12,
  },
  genericReportItem: {
    backgroundColor: '#F8F9FF',
    borderWidth: 2,
    borderColor: '#E3E8FF',
  },
  genericHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  genericBadge: {
    backgroundColor: '#4A90E2',
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginLeft: 8,
    textAlign: 'center',
  },
  reportName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2C3E50',
    marginBottom: 8,
  },
  genericReportName: {
    color: '#4A90E2',
    fontWeight: 'bold',
  },
  reportDescription: {
    fontSize: 14,
    color: '#7F8C8D',
    marginBottom: 8,
  },
  genericDescription: {
    fontSize: 14,
    color: '#6C7B7F',
    fontStyle: 'italic',
    marginBottom: 8,
  },
  reportDates: {
    fontSize: 14,
    color: '#95A5A6',
  },
  actionsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: '#E8E8E8',
  },
  archiveButton: {
    backgroundColor: '#FF9500',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionButtonText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },
});