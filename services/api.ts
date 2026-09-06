import axios, { AxiosInstance, AxiosResponse } from 'axios';
import { SecureStorage } from './secureStorage';
import { API_ENDPOINTS } from '../config/api';
import logger from '../utils/logger';
import { authEvents } from '../utils/authEvents';

const API_BASE_URL = API_ENDPOINTS.MAIN_API;
const AUTH_API_URL = API_ENDPOINTS.AUTH_API;

const AUTH_EXEMPT_PATHS = ['/auth/login', '/auth/register', '/auth/refresh-token'];

let refreshPromise: Promise<string | null> | null = null;

async function tryRefresh(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    try {
      const rt = await SecureStorage.getItemAsync('auth_refresh_token');
      if (!rt) {
        logger.warn('🔁 Refresh skipped: no refresh token stored');
        return null;
      }
      logger.info('🔁 Attempting token refresh...');
      const res = await axios.post(
        `${AUTH_API_URL}/auth/refresh-token`,
        { refreshToken: rt },
        { timeout: 10000, headers: { 'Content-Type': 'application/json' } }
      );
      if (res.data?.success && res.data?.data?.token) {
        await SecureStorage.setItemAsync('auth_token', res.data.data.token);
        if (res.data.data.refreshToken) {
          await SecureStorage.setItemAsync('auth_refresh_token', res.data.data.refreshToken);
        }
        logger.info('✅ Token refresh succeeded');
        return res.data.data.token;
      }
      logger.warn('🔁 Refresh response missing token');
      return null;
    } catch (err: any) {
      logger.warn('🔁 Refresh failed:', err?.response?.status, err?.message);
      return null;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

// Debug logging for API URLs
logger.info('🔧 API Configuration:');
logger.info('📡 Main API:', API_BASE_URL);
logger.info('🔐 Auth API:', AUTH_API_URL);

class ApiClient {
  private client: AxiosInstance;
  private authClient: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: `${API_BASE_URL}api`,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.authClient = axios.create({
      baseURL: AUTH_API_URL,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors() {
    // Request interceptor to add auth token
    const requestInterceptor = async (config: any) => {
      const token = await SecureStorage.getItemAsync('auth_token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
        
        // Log dettagliato per richieste API (mostra solo primi/ultimi caratteri del token)
        const tokenPreview = token.length > 20 
          ? `${token.substring(0, 10)}...${token.substring(token.length - 10)}`
          : '***';
        
        logger.debug('🔐 API Request:', {
          method: config.method?.toUpperCase(),
          url: `${config.baseURL}${config.url}`,
          hasToken: true,
          tokenPreview,
          hasData: !!config.data,
          dataSize: config.data ? JSON.stringify(config.data).length : 0
        });
        
        // Log payload per richieste POST/PUT (escludi dati sensibili)
        if ((config.method === 'post' || config.method === 'put') && config.data) {
          logger.debug('📦 Request payload:', JSON.stringify(config.data, null, 2));
        }
      } else {
        logger.warn('⚠️ API Request without token:', {
          method: config.method?.toUpperCase(),
          url: `${config.baseURL}${config.url}`
        });
      }
      return config;
    };

    this.client.interceptors.request.use(requestInterceptor);
    this.authClient.interceptors.request.use(requestInterceptor);

    // Response interceptor to handle auth errors
    const responseInterceptor = (response: AxiosResponse) => {
      logger.debug('✅ API Response:', {
        status: response.status,
        url: response.config.url,
        dataSize: JSON.stringify(response.data).length
      });
      return response;
    };
    
    const errorInterceptor = async (error: any) => {
      logger.error('❌ API Error:', {
        status: error.response?.status,
        url: error.config?.url,
        message: error.message,
        data: error.response?.data
      });

      const original = error.config;
      const url: string = original?.url || '';
      const isAuthExempt = AUTH_EXEMPT_PATHS.some((p) => url.includes(p));

      if (error.response?.status === 401 && original && !original._retry && !isAuthExempt) {
        original._retry = true;
        logger.warn('🚫 Unauthorized - attempting token refresh');
        const newToken = await tryRefresh();
        if (newToken) {
          original.headers = original.headers || {};
          original.headers.Authorization = `Bearer ${newToken}`;
          // retry using the same instance (preserves baseURL + interceptors for logging)
          const instance = original.baseURL?.startsWith(AUTH_API_URL) ? this.authClient : this.client;
          return instance.request(original);
        }
        logger.error('🚫 Refresh failed - forcing logout');
        await SecureStorage.deleteItemAsync('auth_token');
        await SecureStorage.deleteItemAsync('auth_refresh_token');
        await SecureStorage.deleteItemAsync('auth_user');
        authEvents.emit('forceLogout');
      }
      return Promise.reject(error);
    };

    this.client.interceptors.response.use(responseInterceptor, errorInterceptor);
    this.authClient.interceptors.response.use(responseInterceptor, errorInterceptor);
  }

  // Main API methods
  async get<T>(endpoint: string, params?: any): Promise<T> {
    const response = await this.client.get(endpoint, { params });
    return response.data;
  }

  async post<T>(endpoint: string, data?: any): Promise<T> {
    const response = await this.client.post(endpoint, data);
    return response.data;
  }

  async put<T>(endpoint: string, data?: any): Promise<T> {
    const response = await this.client.put(endpoint, data);
    return response.data;
  }

  async patch<T>(endpoint: string, data?: any): Promise<T> {
    const response = await this.client.patch(endpoint, data);
    return response.data;
  }

  async delete<T>(endpoint: string): Promise<T> {
    const response = await this.client.delete(endpoint);
    return response.data;
  }

  // Auth API methods
  async authGet<T>(endpoint: string, params?: any): Promise<T> {
    const response = await this.authClient.get(endpoint, { params });
    return response.data;
  }

  async authPost<T>(endpoint: string, data?: any): Promise<T> {
    const response = await this.authClient.post(endpoint, data);
    return response.data;
  }

  // Upload file with progress
  async uploadFile<T>(endpoint: string, formData: FormData, onProgress?: (progress: number) => void): Promise<T> {
    const response = await this.client.post(endpoint, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      timeout: 60000, // Increase timeout to 60 seconds for file uploads
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const progress = (progressEvent.loaded / progressEvent.total) * 100;
          onProgress(progress);
        }
      },
    });
    return response.data;
  }
}

export const apiClient = new ApiClient();
