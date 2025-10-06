import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { CompositeNavigationProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useAuth } from '../../contexts/AuthContext';
import { useSyncStats, syncManager } from '../../services/syncManager';
import { MainStackParamList, TabParamList } from '../../navigation/MainNavigator';

type ProfileScreenNavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<TabParamList, 'Profile'>,
  StackNavigationProp<MainStackParamList>
>;

export function ProfileScreen() {
  const navigation = useNavigation<ProfileScreenNavigationProp>();
  const { user, logout } = useAuth();
  const syncStats = useSyncStats();

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Sei sicuro di voler uscire?',
      [
        {
          text: 'Annulla',
          style: 'cancel',
        },
        {
          text: 'Esci',
          style: 'destructive',
          onPress: logout,
        },
      ]
    );
  };

  const handleChangePassword = () => {
    navigation.navigate('ChangePassword');
  };

  const handleArchiveExpenses = () => {
    navigation.navigate('ArchivedExpenses');
  };

  const handleSync = async () => {
    try {
      await syncManager.forceSyncNow();
      Alert.alert('Sincronizzazione', 'Sincronizzazione completata con successo!');
    } catch (error) {
      Alert.alert(
        'Errore Sincronizzazione', 
        error instanceof Error ? error.message : 'Errore durante la sincronizzazione'
      );
    }
  };

  const getSyncStatusIcon = () => {
    if (syncStats.isRunning) {
      return (
        <ActivityIndicator 
          size={24} 
          color="#007AFF" 
          style={styles.syncIcon}
        />
      );
    }
    
    if (syncStats.errors > 0) {
      return (
        <MaterialIcons 
          name="error" 
          size={24} 
          color="#ff4444" 
          style={styles.syncIcon}
        />
      );
    }
    
    if (syncStats.pendingSync === 0) {
      return (
        <MaterialIcons 
          name="check-circle" 
          size={24} 
          color="#28a745" 
          style={styles.syncIcon}
        />
      );
    }
    
    return (
      <MaterialIcons 
        name="sync" 
        size={24} 
        color="#ffc107" 
        style={styles.syncIcon}
      />
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Profilo</Text>
      </View>

      <View style={styles.content}>
        <View style={styles.userInfo}>
          <View style={styles.avatar}>
            <MaterialIcons name="person" size={48} color="#007AFF" />
          </View>
          <Text style={styles.userName}>{user?.name}</Text>
          <Text style={styles.userEmail}>{user?.email}</Text>
        </View>

        <View style={styles.section}>
          <TouchableOpacity
            style={styles.option}
            onPress={handleSync}
            disabled={syncStats.isRunning}
          >
            <MaterialIcons name="sync" size={24} color="#007AFF" />
            <Text style={styles.optionText}>Sincronizzazione</Text>
            {getSyncStatusIcon()}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.option}
            onPress={handleArchiveExpenses}
          >
            <MaterialIcons name="archive" size={24} color="#6c757d" />
            <Text style={styles.optionText}>Archivio Spese</Text>
            <MaterialIcons name="chevron-right" size={24} color="#ccc" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.option}
            onPress={handleChangePassword}
          >
            <MaterialIcons name="lock" size={24} color="#666" />
            <Text style={styles.optionText}>Cambia Password</Text>
            <MaterialIcons name="chevron-right" size={24} color="#ccc" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.option, styles.logoutOption]}
            onPress={handleLogout}
          >
            <MaterialIcons name="logout" size={24} color="#ff4444" />
            <Text style={[styles.optionText, styles.logoutText]}>Logout</Text>
            <MaterialIcons name="chevron-right" size={24} color="#ccc" />
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    padding: 20,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  userInfo: {
    alignItems: 'center',
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 12,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  userName: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 16,
    color: '#666',
  },
  section: {
    backgroundColor: 'white',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  optionText: {
    flex: 1,
    fontSize: 16,
    color: '#333',
    marginLeft: 12,
  },
  logoutOption: {
    borderBottomWidth: 0,
  },
  logoutText: {
    color: '#ff4444',
  },
  syncIcon: {
    marginRight: 0,
  },
});
