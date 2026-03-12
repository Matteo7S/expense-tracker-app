import { apiClient } from './api';
import { User, ApiResponse } from '../types';
import { SecureStorage } from './secureStorage';

interface LoginRequest {
  email: string;
  password: string;
}

interface LoginResponse {
  user: User;
  token: string;
}

interface RegisterRequest {
  email: string;
  password: string;
  firstName: string;

  lastName: string;
  company?: string;
}

interface ChangePasswordRequest {
  oldPassword: string;
  newPassword: string;
}

class AuthService {
  async login(email: string, password: string): Promise<User> {
    const response = await apiClient.authPost<ApiResponse<LoginResponse>>('/auth/login', {
      email,
      password,
    });

    if (response.success && response.data) {
      await SecureStorage.setItemAsync('auth_token', response.data.token);
      await SecureStorage.setItemAsync('auth_user', JSON.stringify(response.data.user));
      return response.data.user;
    }

    throw new Error(response.error || 'Login failed');
  }

  async register(email: string, password: string, name: string, company?: string): Promise<User> {
    // Split name into firstName and lastName
    const nameParts = name.trim().split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || firstName;

    const response = await apiClient.authPost<ApiResponse<LoginResponse>>('/auth/register', {
      email,
      password,
      firstName,
      lastName,
      company,
    });

    if (response.success && response.data) {
      await SecureStorage.setItemAsync('auth_token', response.data.token);
      await SecureStorage.setItemAsync('auth_user', JSON.stringify(response.data.user));
      return response.data.user;
    }

    throw new Error(response.error || 'Registration failed');
  }

  async logout(): Promise<void> {
    try {
      await apiClient.authPost('/auth/logout');
    } catch (error) {
      // Ignore logout errors
    } finally {
      await SecureStorage.deleteItemAsync('auth_token');
      await SecureStorage.deleteItemAsync('auth_user');
    }
  }

  async getCurrentUser(): Promise<User | null> {
    try {
      const token = await SecureStorage.getItemAsync('auth_token');
      if (!token) return null;

      // Use authGet instead of authPost for /auth/me
      const response = await apiClient.authGet<ApiResponse<User>>('/auth/me');

      if (response.success && response.data) {
        await SecureStorage.setItemAsync('auth_user', JSON.stringify(response.data));
        return response.data;
      }

      return null;
    } catch (error) {
      // Se c'è un errore di rete o il server non è raggiungibile, prova a usare i dati salvati offline.
      // api.ts gestisce già la cancellazione del token in caso di vero 401 Unauthorized.
      const cachedUser = await SecureStorage.getItemAsync('auth_user');
      if (cachedUser) {
        try {
          return JSON.parse(cachedUser) as User;
        } catch (e) {
          // Fallback if parsing fails
        }
      }
      return null;
    }
  }

  async changePassword(oldPassword: string, newPassword: string): Promise<void> {
    const response = await apiClient.authPost<ApiResponse<void>>('/auth/change-password', {
      oldPassword,
      newPassword,
    });

    if (!response.success) {
      throw new Error(response.error || 'Password change failed');
    }
  }

  async isAuthenticated(): Promise<boolean> {
    const token = await SecureStorage.getItemAsync('auth_token');
    return !!token;
  }
}

export const authService = new AuthService();
