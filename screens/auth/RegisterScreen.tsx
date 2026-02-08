import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Modal,
  FlatList,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useAuth } from '../../contexts/AuthContext';
import { AuthStackParamList } from '../../navigation/AuthNavigator';
import PostRegistrationSyncProgressComponent from '../../components/PostRegistrationSyncProgress';

type RegisterScreenNavigationProp = StackNavigationProp<AuthStackParamList, 'Register'>;

export function RegisterScreen() {
  const navigation = useNavigation<RegisterScreenNavigationProp>();
  const { register, loading } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showSyncProgress, setShowSyncProgress] = useState(false);
  const [registrationCompleted, setRegistrationCompleted] = useState(false);

  // Company selection state
  const [company, setCompany] = useState('');
  const [showCompanyModal, setShowCompanyModal] = useState(false);

  const COMPANIES = [
    { id: 'casa_optima', label: 'Casa Optima' },
    { id: 'surgital', label: 'Surgital' }
  ];

  const handleRegister = async () => {
    if (!name || !email || !password || !confirmPassword || !company) {
      Alert.alert('Errore', 'Per favore compila tutti i campi, inclusa l\'azienda');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Errore', 'Le password non coincidono');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Errore', 'La password deve essere di almeno 6 caratteri');
      return;
    }

    try {
      // Mostra progress sync immediato dopo registrazione
      setShowSyncProgress(true);

      await register(email, password, name, company);
      setRegistrationCompleted(true);

      console.log('✅ Registration completed, sync progress will be shown');
    } catch (error: any) {
      setShowSyncProgress(false);
      Alert.alert('Errore di Registrazione', error.message || 'Errore durante la registrazione');
    }
  };

  const navigateToLogin = () => {
    navigation.navigate('Login');
  };

  const handleSyncProgressComplete = () => {
    setShowSyncProgress(false);
    // L'AuthContext si occuperà automaticamente della navigazione
    console.log('🎉 Post-registration sync progress completed');
  };

  const handleSyncProgressSkip = () => {
    setShowSyncProgress(false);
    console.log('⏭️ User skipped post-registration sync progress');
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.title}>Registrazione</Text>
          <Text style={styles.subtitle}>Crea il tuo account</Text>
          <Text style={styles.requiredNote}>* Campi obbligatori</Text>
        </View>

        <View style={styles.form}>
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Nome Completo *</Text>
            <TextInput
              style={styles.input}
              placeholder="Inserisci il tuo nome e cognome"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Email *</Text>
            <TextInput
              style={styles.input}
              placeholder="esempio@email.com"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Password *</Text>
            <TextInput
              style={styles.input}
              placeholder="Minimo 6 caratteri"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Conferma Password *</Text>
            <TextInput
              style={styles.input}
              placeholder="Ripeti la password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              autoCapitalize="none"
            />
          </View>

          {/* Company Selection */}
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Azienda *</Text>
            <TouchableOpacity
              style={styles.dropdownButton}
              onPress={() => setShowCompanyModal(true)}
            >
              <Text style={[styles.dropdownText, !company && styles.placeholderText]}>
                {company
                  ? COMPANIES.find(c => c.label === company)?.label || company
                  : 'Seleziona la tua azienda'}
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleRegister}
            disabled={loading}
          >
            <Text style={styles.buttonText}>
              {loading ? 'Registrazione in corso...' : 'Registrati'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.linkButton}
            onPress={navigateToLogin}
          >
            <Text style={styles.linkText}>
              Hai già un account? Accedi
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Post-Registration Sync Progress Modal */}
      <PostRegistrationSyncProgressComponent
        visible={showSyncProgress && registrationCompleted}
        onComplete={handleSyncProgressComplete}
        onSkip={handleSyncProgressSkip}
        allowSkip={true}
      />

      {/* Company Selection Modal */}
      <Modal
        visible={showCompanyModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowCompanyModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Seleziona Azienda</Text>
            <FlatList
              data={COMPANIES}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.modalItem}
                  onPress={() => {
                    setCompany(item.label);
                    setShowCompanyModal(false);
                  }}
                >
                  <Text style={styles.modalItemText}>{item.label}</Text>
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => setShowCompanyModal(false)}
            >
              <Text style={styles.modalCloseButtonText}>Annulla</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#007AFF',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
  },
  requiredNote: {
    fontSize: 14,
    color: '#999',
    fontStyle: 'italic',
    marginTop: 8,
  },
  form: {
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  inputContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    padding: 15,
    borderRadius: 8,
    fontSize: 16,
    backgroundColor: '#fafafa',
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 20,
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  linkButton: {
    alignItems: 'center',
  },
  linkText: {
    color: '#007AFF',
    fontSize: 16,
  },
  dropdownButton: {
    borderWidth: 1,
    borderColor: '#ddd',
    padding: 15,
    borderRadius: 8,
    backgroundColor: '#fafafa',
  },
  dropdownText: {
    fontSize: 16,
    color: '#333',
  },
  placeholderText: {
    color: '#C7C7CD', // Default placeholder color for iOS
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: 'white',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    minHeight: 300,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  modalItem: {
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  modalItemText: {
    fontSize: 18,
    color: '#333',
  },
  modalCloseButton: {
    marginTop: 20,
    padding: 15,
    backgroundColor: '#eee',
    borderRadius: 8,
    alignItems: 'center',
  },
  modalCloseButtonText: {
    fontSize: 16,
    color: '#333',
    fontWeight: '600',
  },
});
