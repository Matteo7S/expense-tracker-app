import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { CompositeNavigationProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useAuth } from '../../contexts/AuthContext';
import { MainStackParamList, TabParamList } from '../../navigation/MainNavigator';

type ChangePasswordScreenNavigationProp = CompositeNavigationProp<
  StackNavigationProp<MainStackParamList, 'ChangePassword'>,
  BottomTabNavigationProp<TabParamList>
>;

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
  <View style={styles.inputContainer}>
    <TextInput
      style={styles.textInput}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      secureTextEntry={!showPassword}
      autoCapitalize="none"
      autoCorrect={false}
      textContentType="password"
      editable={!loading}
      autoFocus={autoFocus}
      returnKeyType="next"
    />
    <TouchableOpacity
      style={styles.eyeButton}
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

export function ChangePasswordScreen() {
  const navigation = useNavigation<ChangePasswordScreenNavigationProp>();
  const { changePassword } = useAuth();
  
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

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
      await changePassword(oldPassword, newPassword);
      Alert.alert(
        'Successo', 
        'Password cambiata con successo!',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Errore durante il cambio password';
      Alert.alert('Errore', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const isFormValid = oldPassword && newPassword && confirmPassword && 
    newPassword.length >= 6 && newPassword === confirmPassword && 
    oldPassword !== newPassword;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header con back button */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          disabled={loading}
        >
          <MaterialIcons name="arrow-back" size={24} color="#007AFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Cambia Password</Text>
        <View style={styles.headerRight} />
      </View>

      <KeyboardAvoidingView 
        style={styles.keyboardAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView 
          style={styles.scrollContainer}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Icona e descrizione */}
          <View style={styles.topSection}>
            <View style={styles.iconContainer}>
              <MaterialIcons name="lock" size={64} color="#007AFF" />
            </View>
            <Text style={styles.description}>
              Per modificare la tua password, inserisci la password corrente e la nuova password che desideri utilizzare.
            </Text>
          </View>

          {/* Form */}
          <View style={styles.formContainer}>
            <View style={styles.fieldContainer}>
              <Text style={styles.label}>Password Corrente</Text>
              <PasswordInput
                value={oldPassword}
                onChangeText={setOldPassword}
                placeholder="Inserisci la password corrente"
                showPassword={showOldPassword}
                onToggleShow={toggleOldPassword}
                loading={loading}
                autoFocus={true}
              />
            </View>

            <View style={styles.fieldContainer}>
              <Text style={styles.label}>Nuova Password</Text>
              <PasswordInput
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder="Inserisci la nuova password"
                showPassword={showNewPassword}
                onToggleShow={toggleNewPassword}
                loading={loading}
              />
            </View>

            <View style={styles.fieldContainer}>
              <Text style={styles.label}>Conferma Nuova Password</Text>
              <PasswordInput
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Conferma la nuova password"
                showPassword={showConfirmPassword}
                onToggleShow={toggleConfirmPassword}
                loading={loading}
              />
            </View>

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
        </ScrollView>

        {/* Bottom button */}
        <View style={styles.bottomContainer}>
          <TouchableOpacity
            style={[
              styles.submitButton,
              (!isFormValid || loading) && styles.submitButtonDisabled
            ]}
            onPress={handleSubmit}
            disabled={!isFormValid || loading}
          >
            <Text style={[
              styles.submitButtonText,
              (!isFormValid || loading) && styles.submitButtonTextDisabled
            ]}>
              {loading ? 'Caricamento...' : 'Conferma Cambio Password'}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  backButton: {
    padding: 8,
    marginLeft: -8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  headerRight: {
    width: 40, // Spacer per centrare il titolo
  },
  keyboardAvoid: {
    flex: 1,
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 100, // Spazio per il bottone fisso
  },
  topSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  iconContainer: {
    marginBottom: 16,
  },
  description: {
    fontSize: 16,
    color: '#6c757d',
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 16,
  },
  formContainer: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  fieldContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e9ecef',
    borderRadius: 12,
    backgroundColor: '#f8f9fa',
  },
  textInput: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
  },
  eyeButton: {
    padding: 12,
    marginRight: 4,
  },
  requirementsContainer: {
    marginTop: 20,
    padding: 16,
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  requirementsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  requirementItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  requirementText: {
    fontSize: 14,
    marginLeft: 10,
  },
  bottomContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'white',
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20, // Safe area per iPhone con notch
    borderTopWidth: 1,
    borderTopColor: '#e9ecef',
  },
  submitButton: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: '#007AFF',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  submitButtonDisabled: {
    backgroundColor: '#ccc',
    shadowOpacity: 0,
    elevation: 0,
  },
  submitButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  submitButtonTextDisabled: {
    color: '#999',
  },
});
