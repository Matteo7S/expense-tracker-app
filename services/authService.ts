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
  name: string;
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
      return response.data.user;
    }

    throw new Error(response.error || 'Login failed');
  }

  async register(email: string, password: string, name: string): Promise<User> {
    const response = await apiClient.authPost<ApiResponse<LoginResponse>>('/auth/register', {
      email,
      password,
      name,
    });

    if (response.success && response.data) {
      await SecureStorage.setItemAsync('auth_token', response.data.token);
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
    }
  }

  async getCurrentUser(): Promise<User | null> {
    try {
      const token = await SecureStorage.getItemAsync('auth_token');
      if (!token) return null;

      // Use authGet instead of authPost for /auth/me
      const response = await apiClient.authGet<ApiResponse<User>>('/auth/me');
      
      if (response.success && response.data) {
        return response.data;
      }
      
      return null;
    } catch (error) {
      // Safely remove token on error
      await SecureStorage.deleteItemAsync('auth_token');
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
