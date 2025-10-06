/**
 * Post-Registration Sync Progress Component
 * 
 * Mostra il progress del sync immediato dopo la registrazione
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ActivityIndicator,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { 
  usePostRegistrationSyncProgress,
  PostRegistrationSyncProgress 
} from '../services/postRegistrationSyncService';

const { width } = Dimensions.get('window');

interface PostRegistrationSyncProgressProps {
  visible: boolean;
  onComplete?: () => void;
  onSkip?: () => void;
  allowSkip?: boolean;
}

export const PostRegistrationSyncProgressComponent: React.FC<PostRegistrationSyncProgressProps> = ({
  visible,
  onComplete,
  onSkip,
  allowSkip = true
}) => {
  const progress = usePostRegistrationSyncProgress();
  const [showCompleted, setShowCompleted] = useState(false);
  const [completedStep, setCompletedStep] = useState<PostRegistrationSyncProgress | null>(null);

  useEffect(() => {
    if (progress?.step === 'completed' && !showCompleted) {
      setCompletedStep(progress);
      setShowCompleted(true);
      
      // Auto-dismiss dopo 3 secondi
      const timer = setTimeout(() => {
        onComplete?.();
      }, 3000);
      
      return () => clearTimeout(timer);
    }
    
    if (progress?.step === 'error') {
      // In caso di errore, mostra per 5 secondi poi chiudi
      const timer = setTimeout(() => {
        onComplete?.();
      }, 5000);
      
      return () => clearTimeout(timer);
    }
  }, [progress, showCompleted, onComplete]);

  const getStepIcon = (step: string, isCompleted: boolean = false): string => {
    switch (step) {
      case 'creating_local':
        return isCompleted ? 'checkmark-circle' : 'document-text';
      case 'syncing_server':
        return isCompleted ? 'checkmark-circle' : 'cloud-upload';
      case 'completed':
        return 'checkmark-circle';
      case 'error':
        return 'alert-circle';
      default:
        return 'hourglass';
    }
  };

  const getStepColor = (step: string): string => {
    switch (step) {
      case 'completed':
        return '#4CAF50';
      case 'error':
        return '#F44336';
      default:
        return '#2196F3';
    }
  };

  const renderProgressBar = (progress: number) => (
    <View style={styles.progressBarContainer}>
      <View 
        style={[
          styles.progressBarFill, 
          { 
            width: `${Math.max(5, progress)}%`,
            backgroundColor: progress === 100 ? '#4CAF50' : '#2196F3'
          }
        ]} 
      />
    </View>
  );

  const renderContent = () => {
    if (showCompleted && completedStep) {
      return (
        <View style={styles.completedContainer}>
          <Ionicons 
            name="checkmark-circle" 
            size={60} 
            color="#4CAF50" 
            style={styles.completedIcon}
          />
          <Text style={styles.completedTitle}>Setup Completato!</Text>
          <Text style={styles.completedMessage}>
            {completedStep.message}
          </Text>
          <TouchableOpacity 
            style={styles.continueButton}
            onPress={onComplete}
          >
            <Text style={styles.continueButtonText}>Continua</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (!progress) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2196F3" />
          <Text style={styles.loadingText}>Preparazione in corso...</Text>
        </View>
      );
    }

    return (
      <View style={styles.progressContainer}>
        <View style={styles.header}>
          <Ionicons 
            name={getStepIcon(progress.step)} 
            size={40} 
            color={getStepColor(progress.step)} 
          />
          <Text style={styles.title}>Configurazione Account</Text>
        </View>

        <View style={styles.messageContainer}>
          <Text style={styles.message}>{progress.message}</Text>
        </View>

        {renderProgressBar(progress.progress)}

        <View style={styles.progressText}>
          <Text style={styles.progressPercentage}>{progress.progress}%</Text>
        </View>

        {progress.step === 'creating_local' && (
          <View style={styles.stepDetails}>
            <View style={styles.stepItem}>
              <Ionicons name="document-text" size={16} color="#2196F3" />
              <Text style={styles.stepItemText}>Creazione nota spese locale</Text>
            </View>
          </View>
        )}

        {progress.step === 'syncing_server' && (
          <View style={styles.stepDetails}>
            <View style={styles.stepItem}>
              <Ionicons name="checkmark-circle" size={16} color="#4CAF50" />
              <Text style={[styles.stepItemText, styles.stepItemCompleted]}>
                Nota spese creata
              </Text>
            </View>
            <View style={styles.stepItem}>
              <ActivityIndicator size="small" color="#2196F3" style={styles.stepItemSpinner} />
              <Text style={styles.stepItemText}>Sincronizzazione con server</Text>
            </View>
          </View>
        )}

        {progress.step === 'error' && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>
              Si è verificato un problema, ma non preoccuparti! 
              I tuoi dati sono al sicuro e verranno sincronizzati automaticamente 
              quando la connessione sarà disponibile.
            </Text>
          </View>
        )}

        {allowSkip && progress.step !== 'error' && (
          <TouchableOpacity 
            style={styles.skipButton}
            onPress={onSkip}
          >
            <Text style={styles.skipButtonText}>Salta e continua</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={true}
      statusBarTranslucent={true}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          {renderContent()}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  container: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 24,
    width: width * 0.9,
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  progressContainer: {
    alignItems: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 12,
    color: '#333',
    textAlign: 'center',
  },
  messageContainer: {
    marginBottom: 20,
  },
  message: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
  },
  progressBarContainer: {
    width: '100%',
    height: 8,
    backgroundColor: '#E0E0E0',
    borderRadius: 4,
    marginBottom: 12,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
    transition: 'width 0.3s ease',
  },
  progressText: {
    marginBottom: 20,
  },
  progressPercentage: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2196F3',
  },
  stepDetails: {
    width: '100%',
    marginBottom: 20,
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  stepItemSpinner: {
    marginRight: 8,
  },
  stepItemText: {
    marginLeft: 8,
    fontSize: 14,
    color: '#666',
  },
  stepItemCompleted: {
    color: '#4CAF50',
    textDecorationLine: 'line-through',
  },
  errorContainer: {
    marginBottom: 20,
  },
  errorText: {
    fontSize: 14,
    color: '#F44336',
    textAlign: 'center',
    lineHeight: 20,
  },
  skipButton: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#DDD',
  },
  skipButtonText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  completedContainer: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  completedIcon: {
    marginBottom: 16,
  },
  completedTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#4CAF50',
    marginBottom: 12,
    textAlign: 'center',
  },
  completedMessage: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  continueButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 8,
    minWidth: 120,
  },
  continueButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
    textAlign: 'center',
  },
});

export default PostRegistrationSyncProgressComponent;
