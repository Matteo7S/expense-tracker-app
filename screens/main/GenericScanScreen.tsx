import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  SafeAreaView,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { MaterialIcons } from '@expo/vector-icons';
import { TabParamList } from '../../navigation/MainNavigator';

type GenericScanScreenNavigationProp = BottomTabNavigationProp<TabParamList, 'GenericScan'>;

export function GenericScanScreen() {
  const navigation = useNavigation<GenericScanScreenNavigationProp>();

  useFocusEffect(
    useCallback(() => {
      // Navigate directly to Scanner AI when tab is focused
      console.log('🔍 Navigating directly to Scanner AI');
      (navigation as any).navigate('GenericLiveOCRCamera');
    }, [])
  );

  // This component should never be visible as it redirects immediately
  // But we keep it as fallback for edge cases
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.centerContent}>
        <MaterialIcons name="camera-alt" size={64} color="#007AFF" />
        <Text style={styles.loadingText}>Apertura scanner...</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 18,
    color: '#666',
    marginTop: 16,
    textAlign: 'center',
  },
});
