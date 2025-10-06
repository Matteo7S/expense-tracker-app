import React, { createContext, useContext, useEffect, useState } from 'react';
import { AuthContextType, User } from '../types';
import { authService } from '../services/authService';
import { postRegistrationSyncService, PostRegistrationSyncResult } from '../services/postRegistrationSyncService';
import { databaseManager } from '../services/database';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: React.ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isNewUser, setIsNewUser] = useState(false);

  useEffect(() => {
    checkAuthState();
  }, []);

  const checkAuthState = async () => {
    try {
      const currentUser = await authService.getCurrentUser();
      if (currentUser) {
        console.log('👤 [AUTH] User authenticated:', currentUser.email, 'ID:', currentUser.id);
        databaseManager.setCurrentUserId(currentUser.id);
      }
      setUser(currentUser);
    } catch (error) {
      console.error('Error checking auth state:', error);
      databaseManager.setCurrentUserId(null);
    } finally {
      setLoading(false);
    }
  };

  const login = async (email: string, password: string): Promise<void> => {
    setLoading(true);
    try {
      const loggedInUser = await authService.login(email, password);
      console.log('👤 [AUTH] User logged in:', loggedInUser.email, 'ID:', loggedInUser.id);
      databaseManager.setCurrentUserId(loggedInUser.id);
      setUser(loggedInUser);
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const register = async (email: string, password: string, name: string): Promise<void> => {
    setLoading(true);
    try {
      // 1. Registra l'utente
      const newUser = await authService.register(email, password, name);
      console.log('👤 [AUTH] New user registered:', newUser.email, 'ID:', newUser.id);
      databaseManager.setCurrentUserId(newUser.id);
      setUser(newUser);
      
      // 2. Avvia sync post-registrazione in background
      console.log('🚀 Starting post-registration sync...');
      
      // Non bloccare l'UI - avvia in background
      postRegistrationSyncService.performPostRegistrationSync(newUser, {
        // Usa i valori predefiniti del servizio (Nota Spesa Generica)
        skipIfOffline: false, // Crea comunque localmente
        showProgress: true
      }).then((result: PostRegistrationSyncResult) => {
        if (result.success) {
          console.log('✅ Post-registration sync completed:', {
            synced: result.synced,
            reportsCreated: result.syncStats.reportsCreated,
            syncTime: result.syncStats.syncTime
          });
        } else {
          console.warn('⚠️ Post-registration sync had issues:', result.error);
        }
      }).catch((error) => {
        console.error('❌ Post-registration sync failed:', error);
        // Non fallire la registrazione per problemi di sync
      });
      
    } catch (error) {
      console.error('Registration error:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const logout = async (): Promise<void> => {
    setLoading(true);
    try {
      console.log('👋 [AUTH] User logging out');
      
      // Pulisci i dati dell'utente corrente dal database locale
      await databaseManager.clearCurrentUserData();
      
      // Logout dal server
      await authService.logout();
      
      // Reset stato
      databaseManager.setCurrentUserId(null);
      setUser(null);
      
      console.log('✅ [AUTH] Logout completed');
    } catch (error) {
      console.error('Logout error:', error);
      // Anche in caso di errore, pulisci lo stato locale
      databaseManager.setCurrentUserId(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const changePassword = async (oldPassword: string, newPassword: string): Promise<void> => {
    try {
      await authService.changePassword(oldPassword, newPassword);
    } catch (error) {
      console.error('Change password error:', error);
      throw error;
    }
  };

  const value: AuthContextType = {
    user,
    login,
    register,
    logout,
    changePassword,
    loading,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
