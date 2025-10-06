import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Modal,
  SafeAreaView,
  Animated,
  Dimensions,
  Platform,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');

// Stili per i componenti interni
const inputStyles = StyleSheet.create({
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e9ecef',
    borderRadius: 8,
    backgroundColor: '#f8f9fa',
  },
  textInput: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
  },
  eyeButton: {
    padding: 12,
  },
});

// Componente PasswordInput separato per evitare re-render
const PasswordInput: React.FC<{
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  showPassword: boolean;
  onToggleShow: () => void;
  loading: boolean;
  autoFocus?: boolean;
}> = React.memo(({ value, onChangeText, placeholder, showPassword, onToggleShow, loading, autoFocus = false }) => (
  <View style={inputStyles.inputContainer}>
    <TextInput
      style={inputStyles.textInput}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      secureTextEntry={!showPassword}
      autoCapitalize="none"
      autoCorrect={false}
      textContentType="password"
      editable={!loading}
      autoFocus={autoFocus}
      blurOnSubmit={false}
      returnKeyType="next"
    />
    <TouchableOpacity
      style={inputStyles.eyeButton}
      onPress={onToggleShow}
      disabled={loading}
      activeOpacity={0.7}
    >
      <MaterialIcons
        name={showPassword ? 'visibility' : 'visibility-off'}
        size={24}
        color="#666"
      />
    </TouchableOpacity>
  </View>
));

interface ChangePasswordModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (oldPassword: string, newPassword: string) => Promise<void>;
}

export const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({
  visible,
  onClose,
  onSubmit,
}) => {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [scaleAnimation] = useState(new Animated.Value(0));

  useEffect(() => {
    if (visible) {
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

  const resetForm = () => {
    setOldPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setShowOldPassword(false);
    setShowNewPassword(false);
    setShowConfirmPassword(false);
    setLoading(false);
  };

  const validatePasswords = (): string | null => {
    if (!oldPassword.trim()) {
      return 'Inserisci la password corrente';
    }
    
    if (!newPassword.trim()) {
      return 'Inserisci la nuova password';
    }
    
    if (newPassword.length < 6) {
      return 'La nuova password deve essere di almeno 6 caratteri';
    }
    
    if (newPassword !== confirmPassword) {
      return 'Le password non coincidono';
    }
    
    if (oldPassword === newPassword) {
      return 'La nuova password deve essere diversa da quella corrente';
    }

    return null;
  };

  const handleSubmit = async () => {
    const validationError = validatePasswords();
    if (validationError) {
      Alert.alert('Errore', validationError);
      return;
    }

    try {
      setLoading(true);
      await onSubmit(oldPassword, newPassword);
      Alert.alert(
        'Successo', 
        'Password cambiata con successo!',
        [{ text: 'OK', onPress: () => {
          resetForm();
          onClose();
        }}]
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Errore durante il cambio password';
      Alert.alert('Errore', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      resetForm();
      onClose();
    }
  };

  // Callbacks memorizzati per evitare re-render
  const toggleOldPassword = useCallback(() => {
    setShowOldPassword(prev => !prev);
  }, []);

  const toggleNewPassword = useCallback(() => {
    setShowNewPassword(prev => !prev);
  }, []);

  const toggleConfirmPassword = useCallback(() => {
    setShowConfirmPassword(prev => !prev);
  }, []);

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <TouchableOpacity
          style={styles.overlayTouchable}
          activeOpacity={1}
          onPress={loading ? undefined : handleClose}
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
          {!loading && (
            <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
              <MaterialIcons name="close" size={24} color="#666" />
            </TouchableOpacity>
          )}

          {/* Header Section */}
          <View style={styles.headerSection}>
            {/* Icon */}
            <View style={styles.iconContainer}>
              <MaterialIcons name="lock" size={42} color="#2196F3" />
            </View>

            {/* Title */}
            <Text style={styles.title}>Cambia Password</Text>

            {/* Message */}
            <Text style={styles.message}>
              Inserisci la password corrente e la nuova password
            </Text>
          </View>

          {/* Form */}
          <View style={styles.formContainer}>
            <Text style={styles.label}>Password Corrente</Text>
            <PasswordInput
              value={oldPassword}
              onChangeText={setOldPassword}
              placeholder="Inserisci password corrente"
              showPassword={showOldPassword}
              onToggleShow={toggleOldPassword}
              loading={loading}
            />

            <Text style={styles.label}>Nuova Password</Text>
            <PasswordInput
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder="Inserisci nuova password (min. 6 caratteri)"
              showPassword={showNewPassword}
              onToggleShow={toggleNewPassword}
              loading={loading}
            />

            <Text style={styles.label}>Conferma Nuova Password</Text>
            <PasswordInput
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Conferma nuova password"
              showPassword={showConfirmPassword}
              onToggleShow={toggleConfirmPassword}
              loading={loading}
            />

            {/* Password requirements */}
            <View style={styles.requirementsContainer}>
              <Text style={styles.requirementsTitle}>Requisiti password:</Text>
              <View style={styles.requirementItem}>
                <MaterialIcons 
                  name={newPassword.length >= 6 ? 'check' : 'close'} 
                  size={16} 
                  color={newPassword.length >= 6 ? '#28a745' : '#dc3545'} 
                />
                <Text style={[
                  styles.requirementText, 
                  { color: newPassword.length >= 6 ? '#28a745' : '#6c757d' }
                ]}>
                  Almeno 6 caratteri
                </Text>
              </View>
              <View style={styles.requirementItem}>
                <MaterialIcons 
                  name={newPassword && confirmPassword && newPassword === confirmPassword ? 'check' : 'close'} 
                  size={16} 
                  color={newPassword && confirmPassword && newPassword === confirmPassword ? '#28a745' : '#dc3545'} 
                />
                <Text style={[
                  styles.requirementText, 
                  { color: newPassword && confirmPassword && newPassword === confirmPassword ? '#28a745' : '#6c757d' }
                ]}>
                  Le password devono coincidere
                </Text>
              </View>
              <View style={styles.requirementItem}>
                <MaterialIcons 
                  name={oldPassword && newPassword && oldPassword !== newPassword ? 'check' : 'close'} 
                  size={16} 
                  color={oldPassword && newPassword && oldPassword !== newPassword ? '#28a745' : '#dc3545'} 
                />
                <Text style={[
                  styles.requirementText, 
                  { color: oldPassword && newPassword && oldPassword !== newPassword ? '#28a745' : '#6c757d' }
                ]}>
                  Diversa dalla password corrente
                </Text>
              </View>
            </View>
          </View>

          {/* Buttons */}
          <View style={styles.buttonsContainer}>
            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={handleClose}
              disabled={loading}
            >
              <Text style={[styles.buttonText, styles.cancelButtonText]}>
                Annulla
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.button, styles.primaryButton]}
              onPress={handleSubmit}
              disabled={loading}
            >
              <Text style={[styles.buttonText, styles.primaryButtonText]}>
                {loading ? 'Caricamento...' : 'Conferma'}
              </Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
};

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
    padding: 20,
    width: Math.min(width - 40, 380),
    maxHeight: '85%',
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
  headerSection: {
    alignItems: 'center',
    marginBottom: 16,
  },
  iconContainer: {
    marginBottom: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#212529',
    textAlign: 'center',
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    color: '#6c757d',
    textAlign: 'center',
    lineHeight: 20,
  },
  scrollContainer: {
    flex: 1,
    width: '100%',
    maxHeight: 300,
  },
  scrollContent: {
    paddingBottom: 10,
    flexGrow: 1,
  },
  formContainer: {
    width: '100%',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
    marginTop: 12,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e9ecef',
    borderRadius: 8,
    backgroundColor: '#f8f9fa',
  },
  textInput: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
  },
  eyeButton: {
    padding: 12,
  },
  requirementsContainer: {
    marginTop: 16,
    padding: 12,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  requirementsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  requirementItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  requirementText: {
    fontSize: 13,
    marginLeft: 8,
  },
  buttonsContainer: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  primaryButton: {
    backgroundColor: '#007AFF',
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
  cancelButtonText: {
    color: '#6c757d',
  },
});
