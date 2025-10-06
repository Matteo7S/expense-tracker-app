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
} from 'react-native-reanimated';
import { ExpenseReport } from '../types';

interface SwipeableExpenseReportItemProps {
  report: ExpenseReport;
  onPress: () => void;
  onDelete: () => void;
  onArchiveComplete?: () => void; // Callback dopo archiviazione completata
  onArchiveConfirm?: () => void; // Callback per mostrare modal di conferma
}

export function SwipeableExpenseReportItem({
  report,
  onPress,
  onDelete,
  onArchiveComplete,
  onArchiveConfirm,
}: SwipeableExpenseReportItemProps) {
  const translateX = useSharedValue(0);
  const SWIPE_THRESHOLD = 80;

  const isGeneric = report.isGeneric || report.name === 'Nota Spesa Generica' || report.name === 'Note Spese Generiche'; // Support both old and new name

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
      // Disable swipe for generic report
      if (isGeneric) return;
      
      const newTranslateX = (context.startX as number) + event.translationX;
      // Limit swipe to left side only (negative values)
      translateX.value = Math.max(-120, Math.min(0, newTranslateX));
    },
    onEnd: (event) => {
      // Disable swipe for generic report
      if (isGeneric) return;
      
      const velocity = event.velocityX;
      const translation = event.translationX;
      
      if (translation < -SWIPE_THRESHOLD || velocity < -500) {
        // Swipe left - show delete button
        translateX.value = withSpring(-120);
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

  return (
    <View style={styles.container}>
      
      {/* Background action - Right side (Elimina/Archivia) */}
      {!isGeneric && (
        <View style={styles.rightActionsBackground}>
          <TouchableOpacity 
            style={styles.deleteAction} 
            onPress={() => handleSwipeAction(() => showDeleteAlert())}
          >
            <MaterialIcons name="archive" size={20} color="white" />
            <Text style={styles.actionText}>Archivia</Text>
          </TouchableOpacity>
        </View>
      )}
      
      {/* Main content */}
      <PanGestureHandler onGestureEvent={gestureHandler} enabled={!isGeneric}>
        <Animated.View style={[
          styles.reportItem,
          isGeneric && styles.genericReportItem,
          animatedStyle
        ]}>
          <TouchableOpacity 
            style={[
              styles.reportInfo,
              isGeneric && styles.genericReportInfo
            ]} 
            onPress={onPress}
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
  deleteAction: {
    backgroundColor: '#FF9500',
    justifyContent: 'center',
    alignItems: 'center',
    width: 120,
    paddingHorizontal: 12,
    height: '100%',
    borderRadius: 12,
  },
  actionText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  reportItem: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  reportInfo: {
    flex: 1,
  },
  reportName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  reportDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  reportDates: {
    fontSize: 14,
    color: '#666',
  },
  // Stili per la nota spese generica
  genericReportItem: {
    backgroundColor: '#F0F7FF',
    borderWidth: 2,
    borderColor: '#4A90E2',
    borderStyle: 'solid',
  },
  genericReportInfo: {
    paddingVertical: 4,
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
    textTransform: 'uppercase',
  },
  genericReportName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#4A90E2',
    marginBottom: 4,
  },
  genericDescription: {
    fontSize: 13,
    color: '#2E5A99',
    fontStyle: 'italic',
  },
});
