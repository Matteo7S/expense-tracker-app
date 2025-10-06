/**
 * Sistema di modal moderne per sostituire tutti gli Alert dell'app
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
  Dimensions,
  Animated,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');

// Tipi di modal supportati
export type ModalType = 'success' | 'error' | 'warning' | 'info' | 'confirm' | 'input';

interface ModalButton {
  text: string;
  onPress?: (inputValue?: string) => void;
  style?: 'default' | 'primary' | 'destructive' | 'cancel';
  loading?: boolean;
}

interface ModernModalProps {
  visible: boolean;
  type: ModalType;
  title: string;
  message?: string;
  buttons: ModalButton[];
  onClose?: () => void;
  // Props specifiche per input modal
  inputProps?: {
    placeholder?: string;
    defaultValue?: string;
    keyboardType?: 'default' | 'numeric' | 'email-address' | 'phone-pad' | 'decimal-pad';
    secureTextEntry?: boolean;
    multiline?: boolean;
    maxLength?: number;
  };
  // Props per personalizzazione
  customIcon?: string;
  showCloseButton?: boolean;
}

export const ModernModal: React.FC<ModernModalProps> = ({
  visible,
  type,
  title,
  message,
  buttons,
  onClose,
  inputProps,
  customIcon,
  showCloseButton = false,
}) => {
  const [inputValue, setInputValue] = useState(inputProps?.defaultValue || '');
  const [scaleAnimation] = useState(new Animated.Value(0));

  useEffect(() => {
    if (visible) {
      setInputValue(inputProps?.defaultValue || '');
      Animated.spring(scaleAnimation, {
        toValue: 1,
        useNativeDriver: true,
        tension: 100,
        friction: 8,
      }).start();
    } else {
      Animated.timing(scaleAnimation, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  const getIconConfig = () => {
    if (customIcon) {
      return { name: customIcon, color: getTypeColor(), size: 48 };
    }

    switch (type) {
      case 'success':
        return { name: 'check-circle', color: '#4CAF50', size: 48 };
      case 'error':
        return { name: 'error', color: '#F44336', size: 48 };
      case 'warning':
        return { name: 'warning', color: '#FF9800', size: 48 };
      case 'info':
        return { name: 'info', color: '#2196F3', size: 48 };
      case 'confirm':
        return { name: 'help', color: '#FF9800', size: 48 };
      case 'input':
        return { name: 'edit', color: '#2196F3', size: 48 };
      default:
        return { name: 'info', color: '#2196F3', size: 48 };
    }
  };

  const getTypeColor = () => {
    switch (type) {
      case 'success': return '#4CAF50';
      case 'error': return '#F44336';
      case 'warning': return '#FF9800';
      case 'info': return '#2196F3';
      case 'confirm': return '#FF9800';
      case 'input': return '#2196F3';
      default: return '#2196F3';
    }
  };

  const getButtonStyle = (buttonStyle?: string) => {
    switch (buttonStyle) {
      case 'primary':
        return [styles.button, styles.primaryButton];
      case 'destructive':
        return [styles.button, styles.destructiveButton];
      case 'cancel':
        return [styles.button, styles.cancelButton];
      default:
        return [styles.button, styles.defaultButton];
    }
  };

  const getButtonTextStyle = (buttonStyle?: string) => {
    switch (buttonStyle) {
      case 'primary':
        return [styles.buttonText, styles.primaryButtonText];
      case 'destructive':
        return [styles.buttonText, styles.destructiveButtonText];
      case 'cancel':
        return [styles.buttonText, styles.cancelButtonText];
      default:
        return [styles.buttonText, styles.defaultButtonText];
    }
  };

  const handleButtonPress = (button: ModalButton) => {
    console.log('🔘 ModernModal button pressed:', button.text, 'for modal type:', type);
    if (type === 'input' && button.onPress) {
      button.onPress(inputValue);
    } else if (button.onPress) {
      button.onPress();
    }
  };

  const iconConfig = getIconConfig();

  if (!visible) return null;
  
  return (
    <View style={styles.overlay}>
      <TouchableOpacity
        style={styles.overlayTouchable}
        activeOpacity={1}
        onPress={type === 'success' || type === 'error' ? undefined : onClose}
      />
      <Animated.View
        style={[
          styles.modalContainer,
          {
            transform: [{ scale: scaleAnimation }],
          },
        ]}
      >
        {/* Close button */}
        {showCloseButton && onClose && (
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <MaterialIcons name="close" size={24} color="#666" />
          </TouchableOpacity>
        )}

        {/* Icon */}
        <View style={styles.iconContainer}>
          <MaterialIcons 
            name={iconConfig.name as any} 
            size={iconConfig.size} 
            color={iconConfig.color} 
          />
        </View>

        {/* Title */}
        <Text style={styles.title}>{title}</Text>

        {/* Message */}
        {message && <Text style={styles.message}>{message}</Text>}

        {/* Input field for input modal */}
        {type === 'input' && (
          <View style={styles.inputContainer}>
            <TextInput
              style={[
                styles.textInput,
                inputProps?.multiline && styles.multilineInput,
              ]}
              value={inputValue}
              onChangeText={setInputValue}
              placeholder={inputProps?.placeholder}
              keyboardType={inputProps?.keyboardType || 'default'}
              secureTextEntry={inputProps?.secureTextEntry}
              multiline={inputProps?.multiline}
              maxLength={inputProps?.maxLength}
              autoFocus
            />
          </View>
        )}

        {/* Buttons */}
        <View style={[
          styles.buttonsContainer,
          buttons.length === 1 ? styles.singleButtonContainer : styles.multiButtonContainer
        ]}>
          {buttons.map((button, index) => (
            <TouchableOpacity
              key={index}
              style={[
                getButtonStyle(button.style),
                buttons.length > 1 && { flex: 1, marginHorizontal: 6 }
              ]}
              onPress={() => handleButtonPress(button)}
              disabled={button.loading}
            >
              {button.loading ? (
                <View style={styles.loadingContainer}>
                  <Text style={getButtonTextStyle(button.style)}>Caricamento...</Text>
                </View>
              ) : (
                <Text style={getButtonTextStyle(button.style)}>
                  {button.text}
                </Text>
              )}
            </TouchableOpacity>
          ))}
        </View>
      </Animated.View>
    </View>
  );
};

// Hook personalizzato per gestire le modal in modo più semplice
interface UseModernModalReturn {
  showModal: (config: Omit<ModernModalProps, 'visible'>) => void;
  hideModal: () => void;
  ModalComponent: React.FC;
}

export const useModernModal = (): UseModernModalReturn => {
  const [modalConfig, setModalConfig] = useState<ModernModalProps | null>(null);
  const [clearTimeoutId, setClearTimeoutId] = useState<NodeJS.Timeout | null>(null);

  const showModal = (config: Omit<ModernModalProps, 'visible'>) => {
    console.log('🎯 ModernModal showModal called with type:', config.type);
    
    // Annulla il timeout precedente se esiste
    if (clearTimeoutId) {
      console.log('⏰ Cancelling previous modal clear timeout');
      clearTimeout(clearTimeoutId);
      setClearTimeoutId(null);
    }
    
    setModalConfig({ ...config, visible: true });
  };

  const hideModal = () => {
    console.log('🚫 ModernModal hideModal called');
    setModalConfig(prev => prev ? { ...prev, visible: false } : null);
    
    const timeoutId = setTimeout(() => {
      console.log('🧹 ModernModal clearing modal config after timeout');
      setModalConfig(null);
      setClearTimeoutId(null);
    }, 300); // Delay per animazione
    
    setClearTimeoutId(timeoutId);
  };

  const ModalComponent = () => {
    if (!modalConfig) return null;
    
    return (
      <ModernModal
        {...modalConfig}
        onClose={hideModal}
      />
    );
  };

  return { showModal, hideModal, ModalComponent };
};

// Helper functions per i tipi di modal più comuni
export const createSuccessModal = (
  title: string,
  message?: string,
  onConfirm?: () => void
): Omit<ModernModalProps, 'visible'> => ({
  type: 'success',
  title,
  message,
  buttons: [
    {
      text: 'OK',
      style: 'primary',
      onPress: onConfirm,
    },
  ],
});

export const createErrorModal = (
  title: string,
  message?: string,
  onConfirm?: () => void
): Omit<ModernModalProps, 'visible'> => ({
  type: 'error',
  title,
  message,
  buttons: [
    {
      text: 'OK',
      style: 'primary',
      onPress: onConfirm,
    },
  ],
});

export const createConfirmModal = (
  title: string,
  message?: string,
  onConfirm?: () => void,
  onCancel?: () => void,
  confirmText: string = 'Conferma',
  cancelText: string = 'Annulla'
): Omit<ModernModalProps, 'visible'> => ({
  type: 'confirm',
  title,
  message,
  buttons: [
    {
      text: cancelText,
      style: 'cancel',
      onPress: onCancel,
    },
    {
      text: confirmText,
      style: 'primary',
      onPress: onConfirm,
    },
  ],
});

export const createInputModal = (
  title: string,
  message?: string,
  onConfirm?: (value: string) => void,
  onCancel?: () => void,
  inputProps?: ModernModalProps['inputProps'],
  confirmText: string = 'Conferma',
  cancelText: string = 'Annulla'
): Omit<ModernModalProps, 'visible'> => ({
  type: 'input',
  title,
  message,
  buttons: [
    {
      text: cancelText,
      style: 'cancel',
      onPress: onCancel,
    },
    {
      text: confirmText,
      style: 'primary',
      onPress: (inputValue) => onConfirm?.(inputValue || ''),
    },
  ],
  inputProps,
});

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    zIndex: 9999,
  },
  overlayTouchable: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  modalContainer: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 24,
    width: Math.min(width - 40, 320),
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.25,
        shadowRadius: 20,
      },
      android: {
        elevation: 10,
      },
    }),
  },
  closeButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 1,
    padding: 4,
  },
  iconContainer: {
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#212529',
    textAlign: 'center',
    marginBottom: 8,
  },
  message: {
    fontSize: 16,
    color: '#6c757d',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  inputContainer: {
    width: '100%',
    marginBottom: 24,
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#e9ecef',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: '#f8f9fa',
  },
  multilineInput: {
    height: 80,
    textAlignVertical: 'top',
  },
  buttonsContainer: {
    width: '100%',
  },
  singleButtonContainer: {
    alignItems: 'center',
  },
  multiButtonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  button: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    minWidth: 100,
  },
  primaryButton: {
    backgroundColor: '#007AFF',
  },
  defaultButton: {
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#dee2e6',
  },
  destructiveButton: {
    backgroundColor: '#dc3545',
  },
  cancelButton: {
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#dee2e6',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  primaryButtonText: {
    color: 'white',
  },
  defaultButtonText: {
    color: '#212529',
  },
  destructiveButtonText: {
    color: 'white',
  },
  cancelButtonText: {
    color: '#6c757d',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
