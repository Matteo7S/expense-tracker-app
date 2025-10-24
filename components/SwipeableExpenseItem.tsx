import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { PanGestureHandler, PanGestureHandlerGestureEvent } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedGestureHandler,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
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
  moveLabel?: string; // Custom label for the move action
  useArchiveInsteadOfDelete?: boolean; // If true, use archive logic instead of permanent deletion
  onArchiveConfirm?: () => void; // Callback per mostrare modal di conferma
}

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
  const translateX = useSharedValue(0);
  const SWIPE_THRESHOLD = 80;

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

  const handleSwipeAction = (action: () => void) => {
    translateX.value = withSpring(0);
    action();
  };

  const showDeleteAlert = () => {
    translateX.value = withSpring(0);
    if (onArchiveConfirm) {
      onArchiveConfirm();
    }
  };


  const gestureHandler = useAnimatedGestureHandler<PanGestureHandlerGestureEvent>({
    onStart: (_, context) => {
      context.startX = translateX.value;
    },
    onActive: (event, context) => {
      if (selectionMode) return; // Disable swipe in selection mode
      const newTranslateX = (context.startX as number) + event.translationX;
      // Limita lo swipe tra -120 e +200
      translateX.value = Math.max(-120, Math.min(200, newTranslateX));
    },
    onEnd: (event) => {
      if (selectionMode) return; // Disable swipe in selection mode
      
      const velocity = event.velocityX;
      const translation = event.translationX;
      
      if (translation < -SWIPE_THRESHOLD || velocity < -500) {
        // Swipe left - show delete button
        translateX.value = withSpring(-120);
      } else if (translation > SWIPE_THRESHOLD || velocity > 500) {
        // Swipe right - show action buttons (Modifica e Trasferisci)
        translateX.value = withSpring(200);
      } else {
        // Return to center
        translateX.value = withSpring(0);
      }
    },
  });

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateX: translateX.value }],
    };
  });

  const handlePress = () => {
    if (selectionMode && onSelect) {
      onSelect();
    } else {
      onPress();
    }
  };

  return (
    <View style={styles.container}>
      {/* Background actions - Left side (Modifica/Trasferisci) */}
      <View style={styles.leftActionsBackground}>
        <View style={styles.actionButtonsContainer}>
          <TouchableOpacity 
            style={styles.editAction} 
            onPress={() => handleSwipeAction(onEdit)}
          >
            <MaterialIcons name="edit" size={20} color="white" />
            <Text style={styles.actionText}>Modifica</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.transferAction} 
            onPress={() => handleSwipeAction(onMove)}
          >
            <MaterialIcons name={moveLabel === 'Ripristina' ? "restore" : "swap-horiz"} size={20} color="white" />
            <Text style={styles.actionText}>{moveLabel}</Text>
          </TouchableOpacity>
        </View>
      </View>
      
      {/* Background actions - Right side (Elimina/Archivia) */}
      <View style={styles.rightActionsBackground}>
        <TouchableOpacity 
          style={styles.deleteAction} 
          onPress={() => handleSwipeAction(() => showDeleteAlert())}
        >
          <MaterialIcons name={useArchiveInsteadOfDelete ? "archive" : "delete"} size={20} color="white" />
          <Text style={styles.actionText}>{useArchiveInsteadOfDelete ? 'Archivia' : 'Elimina'}</Text>
        </TouchableOpacity>
      </View>
      
      {/* Main content */}
      <PanGestureHandler onGestureEvent={gestureHandler} enabled={!selectionMode}>
        <Animated.View style={[styles.expenseItem, animatedStyle]}>
          <TouchableOpacity style={styles.expenseContent} onPress={handlePress}>
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
              <Text style={styles.expenseDescription}>
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
                {expense.date ? new Date(expense.date).toLocaleDateString('it-IT') : new Date(expense.createdAt).toLocaleDateString('it-IT')}
              </Text>
            </View>
            
            {/* Amount */}
            <Text style={styles.expenseAmount}>€{expense.amount.toFixed(2)}</Text>
          </TouchableOpacity>
        </Animated.View>
      </PanGestureHandler>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 12,
    borderRadius: 12,
    overflow: 'hidden',
  },
  leftActionsBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    width: 200,
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
  },
  rightActionsBackground: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: 120,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  actionButtonsContainer: {
    flexDirection: 'row',
    height: '100%',
  },
  editAction: {
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    width: 100,
    paddingHorizontal: 12,
    height: '100%',
  },
  transferAction: {
    backgroundColor: '#34C759',
    justifyContent: 'center',
    alignItems: 'center',
    width: 100,
    paddingHorizontal: 12,
    height: '100%',
  },
  deleteAction: {
    backgroundColor: '#FF3B30',
    justifyContent: 'center',
    alignItems: 'center',
    width: 120,
    paddingHorizontal: 12,
    height: '100%',
  },
  actionText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  expenseItem: {
    backgroundColor: 'white',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  expenseContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
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
  },
  expenseDescription: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  expenseCategory: {
    fontSize: 14,
    color: '#666',
    marginBottom: 2,
    textTransform: 'capitalize',
  },
  expensePeople: {
    fontSize: 12,
    color: '#999',
    marginBottom: 2,
  },
  expenseDate: {
    fontSize: 12,
    color: '#999',
  },
  expenseAmount: {
    fontSize: 16,
    fontWeight: '600',
    color: '#007AFF',
  },
});
