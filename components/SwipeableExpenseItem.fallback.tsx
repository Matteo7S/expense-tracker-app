import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Expense, ExpenseCategory } from '../types';

interface SwipeableExpenseItemProps {
  expense: Expense;
  onPress: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onMove: () => void;
  isSelected?: boolean;
  onSelect?: () => void;
  selectionMode?: boolean;
  moveLabel?: string;
  useArchiveInsteadOfDelete?: boolean;
  onArchiveConfirm?: () => void;
}

// Fallback version for Expo Go compatibility (no reanimated/gestures)
export function SwipeableExpenseItem({
  expense,
  onPress,
  onEdit,
  onDelete,
  onMove,
  isSelected = false,
  onSelect,
  selectionMode = false,
  moveLabel = 'Trasferisci',
  useArchiveInsteadOfDelete = false,
  onArchiveConfirm,
}: SwipeableExpenseItemProps) {
  const [showActions, setShowActions] = useState(false);

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

  const handlePress = () => {
    if (selectionMode && onSelect) {
      onSelect();
    } else {
      onPress();
    }
  };

  const handleLongPress = () => {
    if (!selectionMode) {
      setShowActions(!showActions);
    }
  };

  const handleDeletePress = () => {
    if (onArchiveConfirm) {
      onArchiveConfirm();
    } else {
      Alert.alert(
        useArchiveInsteadOfDelete ? 'Archivia spesa' : 'Elimina spesa',
        useArchiveInsteadOfDelete ? 'Vuoi archiviare questa spesa?' : 'Vuoi eliminare questa spesa?',
        [
          { text: 'Annulla', style: 'cancel' },
          { 
            text: useArchiveInsteadOfDelete ? 'Archivia' : 'Elimina', 
            style: 'destructive', 
            onPress: onDelete 
          },
        ]
      );
    }
    setShowActions(false);
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity 
        style={styles.expenseItem} 
        onPress={handlePress}
        onLongPress={handleLongPress}
      >
        {/* Selection checkbox */}
        {selectionMode && (
          <TouchableOpacity style={styles.checkbox} onPress={onSelect}>
            <MaterialIcons 
              name={isSelected ? "check-box" : "check-box-outline-blank"} 
              size={24} 
              color={isSelected ? "#007AFF" : "#ccc"} 
            />
          </TouchableOpacity>
        )}
        
        {/* Category icon */}
        <View style={[styles.categoryIcon, { backgroundColor: getCategoryColor(expense.category) }]}>
          <MaterialIcons name={getCategoryIcon(expense.category) as any} size={24} color="white" />
        </View>
        
        {/* Expense info */}
        <View style={styles.expenseInfo}>
          <Text style={styles.expenseName}>
            {expense.merchant || expense.description || 'Commerciante non specificato'}
          </Text>
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
        
        {/* Amount */}
        <Text style={styles.expenseAmount}>€{expense.amount.toFixed(2)}</Text>
      </TouchableOpacity>
      
      {/* Action buttons (shown when item is long-pressed) */}
      {showActions && !selectionMode && (
        <View style={styles.actionsContainer}>
          <TouchableOpacity style={styles.editButton} onPress={() => { onEdit(); setShowActions(false); }}>
            <MaterialIcons name="edit" size={16} color="white" />
            <Text style={styles.actionButtonText}>Modifica</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.moveButton} onPress={() => { onMove(); setShowActions(false); }}>
            <MaterialIcons name={moveLabel === 'Ripristina' ? "restore" : "swap-horiz"} size={16} color="white" />
            <Text style={styles.actionButtonText}>{moveLabel}</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.deleteButton} onPress={handleDeletePress}>
            <MaterialIcons name={useArchiveInsteadOfDelete ? "archive" : "delete"} size={16} color="white" />
            <Text style={styles.actionButtonText}>{useArchiveInsteadOfDelete ? 'Archivia' : 'Elimina'}</Text>
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
  expenseItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
  },
  checkbox: {
    marginRight: 12,
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
    marginRight: 12,
  },
  expenseName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2C3E50',
    marginBottom: 4,
  },
  expenseCategory: {
    fontSize: 14,
    color: '#7F8C8D',
    marginBottom: 2,
    textTransform: 'capitalize',
  },
  expensePeople: {
    fontSize: 12,
    color: '#95A5A6',
    marginBottom: 2,
  },
  expenseDate: {
    fontSize: 12,
    color: '#95A5A6',
  },
  expenseAmount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#27AE60',
  },
  actionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: '#E8E8E8',
  },
  editButton: {
    backgroundColor: '#3498DB',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },
  moveButton: {
    backgroundColor: '#F39C12',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },
  deleteButton: {
    backgroundColor: '#E74C3C',
    paddingHorizontal: 12,
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