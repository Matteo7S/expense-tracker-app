import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

/**
 * Secure storage wrapper that works on both mobile and web
 */
export class SecureStorage {
  static async getItemAsync(key: string): Promise<string | null> {
    if (Platform.OS === 'web') {
      // Use localStorage for web
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem(key);
      }
      return null;
    } else {
      // Use SecureStore for mobile
      try {
        return await SecureStore.getItemAsync(key);
      } catch (error) {
        console.warn(`SecureStore.getItemAsync failed for key ${key}:`, error);
        return null;
      }
    }
  }

  static async setItemAsync(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') {
      // Use localStorage for web
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, value);
      }
    } else {
      // Use SecureStore for mobile
      try {
        await SecureStore.setItemAsync(key, value);
      } catch (error) {
        console.warn(`SecureStore.setItemAsync failed for key ${key}:`, error);
        // Fallback to localStorage if available
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem(key, value);
        }
      }
    }
  }

  static async deleteItemAsync(key: string): Promise<void> {
    if (Platform.OS === 'web') {
      // Use localStorage for web
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(key);
      }
    } else {
      // Use SecureStore for mobile
      try {
        await SecureStore.deleteItemAsync(key);
      } catch (error) {
        console.warn(`SecureStore.deleteItemAsync failed for key ${key}:`, error);
        // Fallback to localStorage if available
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.removeItem(key);
        }
      }
    }
  }
}
