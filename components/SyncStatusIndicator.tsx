/**
 * Componente per indicare lo stato di sincronizzazione
 */

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Alert
} from 'react-native';
import { useSyncStats } from '../services/syncManager';
import { useNetworkState } from '../hooks/useNetworkState';
import { useI18n } from '../i18n';

interface SyncStatusIndicatorProps {
  showDetails?: boolean;
  onPress?: () => void;
  style?: any;
}

export const SyncStatusIndicator: React.FC<SyncStatusIndicatorProps> = ({
  showDetails = true,
  onPress,
  style
}) => {
  const syncStats = useSyncStats();
  const networkState = useNetworkState();
  const { t } = useI18n();

  const getSyncStatusInfo = () => {
    if (!networkState.isConnected || !networkState.isInternetReachable) {
      return {
        text: t('sync.offline'),
        color: '#f0ad4e',
        icon: '📴',
        description: t('sync.localChanges')
      };
    }

    if (syncStats.isRunning) {
      return {
        text: t('sync.syncing'),
        color: '#007bff',
        icon: <ActivityIndicator size="small" color="#007bff" />,
        description: t('sync.syncingItems', { count: syncStats.pendingSync })
      };
    }

    if (syncStats.pendingSync > 0) {
      return {
        text: t('sync.pending', { count: syncStats.pendingSync }),
        color: '#f0ad4e',
        icon: '⏳',
        description: t('sync.pendingDescription')
      };
    }

    if (syncStats.errors > 0) {
      return {
        text: t('sync.errors'),
        color: '#dc3545',
        icon: '⚠️',
        description: t('sync.errorsDescription')
      };
    }

    return {
      text: t('sync.synced'),
      color: '#28a745',
      icon: '✅',
      description: syncStats.lastSync ? 
        t('sync.lastSync', { time: new Date(syncStats.lastSync).toLocaleTimeString() }) :
        t('sync.allSynced')
    };
  };

  const statusInfo = getSyncStatusInfo();

  const handlePress = () => {
    if (onPress) {
      onPress();
    } else if (showDetails) {
      // Mostra dettagli in un alert
      Alert.alert(
        t('sync.statusTitle'),
        statusInfo.description,
        [{ text: 'OK' }]
      );
    }
  };

  return (
    <TouchableOpacity
      style={[styles.container, style]}
      onPress={handlePress}
      activeOpacity={0.7}
    >
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          {typeof statusInfo.icon === 'string' ? (
            <Text style={styles.iconText}>{statusInfo.icon}</Text>
          ) : (
            statusInfo.icon
          )}
        </View>
        
        <View style={styles.textContainer}>
          <Text style={[styles.statusText, { color: statusInfo.color }]}>
            {statusInfo.text}
          </Text>
          
          {showDetails && (
            <Text style={styles.descriptionText}>
              {statusInfo.description}
            </Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
};

// Versione mini per spazi ridotti
export const SyncStatusMini: React.FC<{ style?: any }> = ({ style }) => {
  const syncStats = useSyncStats();
  const networkState = useNetworkState();

  const getStatusColor = () => {
    if (!networkState.isConnected || !networkState.isInternetReachable) {
      return '#f0ad4e'; // Arancione per offline
    }
    if (syncStats.isRunning) {
      return '#007bff'; // Blu per in sincronizzazione
    }
    if (syncStats.pendingSync > 0 || syncStats.errors > 0) {
      return '#f0ad4e'; // Arancione per problemi
    }
    return '#28a745'; // Verde per sincronizzato
  };

  return (
    <View style={[styles.miniContainer, style]}>
      <View 
        style={[
          styles.statusDot, 
          { backgroundColor: getStatusColor() }
        ]} 
      />
      {syncStats.isRunning && (
        <ActivityIndicator size="small" color={getStatusColor()} />
      )}
      {syncStats.pendingSync > 0 && (
        <Text style={styles.pendingText}>{syncStats.pendingSync}</Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 12,
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: '#e9ecef'
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  iconContainer: {
    marginRight: 8
  },
  iconText: {
    fontSize: 16
  },
  textContainer: {
    flex: 1
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2
  },
  descriptionText: {
    fontSize: 12,
    color: '#6c757d'
  },
  miniContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 4
  },
  pendingText: {
    fontSize: 12,
    color: '#f0ad4e',
    fontWeight: '600',
    marginLeft: 4
  }
});
