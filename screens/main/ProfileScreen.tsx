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
import { CompositeNavigationProp, useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useAuth } from '../../contexts/AuthContext';
import { useSyncStats, syncManager } from '../../services/syncManager';
import { MainStackParamList, TabParamList } from '../../navigation/MainNavigator';
import { useI18n } from '../../i18n';

type ProfileScreenNavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<TabParamList, 'Profile'>,
  StackNavigationProp<MainStackParamList>
>;

export function ProfileScreen() {
  const navigation = useNavigation<ProfileScreenNavigationProp>();
  const { user, logout } = useAuth();
  const syncStats = useSyncStats();
  const { language, languageLabel, supportedLanguages, setLanguage, t } = useI18n();

  const handleLogout = () => {
    Alert.alert(
      t('profile.logoutTitle'),
      t('profile.logoutConfirmation'),
      [
        {
          text: t('common.cancel'),
          style: 'cancel',
        },
        {
          text: t('profile.logoutAction'),
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

  const handleChangeLanguage = () => {
    Alert.alert(
      t('profile.language'),
      languageLabel,
      [
        ...supportedLanguages.map((item) => ({
          text: `${t(`languages.${item}`)}${item === language ? ' ✓' : ''}`,
          onPress: () => {
            void setLanguage(item);
          },
        })),
        {
          text: t('common.cancel'),
          style: 'cancel' as const,
        },
      ]
    );
  };

  const handleSync = async () => {
    try {
      const result = await syncManager.forceSyncNow();

      if (result.errorCount > 0 || result.failedCount > 0 || result.pendingSync > 0) {
        const details = result.lastError
          ? `${t('profile.syncErrorMessage')}\n\n${result.lastError}`
          : t('profile.syncErrorMessage');
        Alert.alert(t('profile.syncErrorTitle'), details);
        return;
      }

      Alert.alert(t('profile.syncSuccessTitle'), t('profile.syncSuccessMessage'));
    } catch (error) {
      Alert.alert(
        t('profile.syncErrorTitle'),
        error instanceof Error ? error.message : t('profile.syncErrorMessage')
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
        <Text style={styles.title}>{t('profile.title')}</Text>
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
            <Text style={styles.optionText}>{t('profile.sync')}</Text>
            {getSyncStatusIcon()}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.option}
            onPress={handleArchiveExpenses}
          >
            <MaterialIcons name="archive" size={24} color="#6c757d" />
            <Text style={styles.optionText}>{t('profile.archivedExpenses')}</Text>
            <MaterialIcons name="chevron-right" size={24} color="#ccc" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.option}
            onPress={handleChangePassword}
          >
            <MaterialIcons name="lock" size={24} color="#666" />
            <Text style={styles.optionText}>{t('profile.changePassword')}</Text>
            <MaterialIcons name="chevron-right" size={24} color="#ccc" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.option}
            onPress={handleChangeLanguage}
          >
            <MaterialIcons name="language" size={24} color="#666" />
            <Text style={styles.optionText}>{t('profile.language')}</Text>
            <Text style={styles.optionValue}>{languageLabel}</Text>
            <MaterialIcons name="chevron-right" size={24} color="#ccc" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.option, styles.logoutOption]}
            onPress={handleLogout}
          >
            <MaterialIcons name="logout" size={24} color="#ff4444" />
            <Text style={[styles.optionText, styles.logoutText]}>{t('profile.logoutTitle')}</Text>
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
  optionValue: {
    fontSize: 14,
    color: '#666',
    marginRight: 8,
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
