import * as FileSystem from 'expo-file-system';
import { apiClient } from './api';

export interface ReceiptUploadResponse {
  success: boolean;
  data?: {
    id: string;
    url: string;
    filename: string;
    analysis?: {
      extractedText?: string;
      extractedData?: {
        total?: number;
        currency?: string;
        date?: string;
        merchant?: string;
        items?: Array<{
          description: string;
          amount: number;
        }>;
      };
    };
  };
  error?: string;
}

class ReceiptService {
  async uploadReceipt(
    imageUri: string,
    reportId: string
  ): Promise<ReceiptUploadResponse> {
    try {
      const formData = new FormData();

      const imageFile = {
        uri: imageUri,
        type: 'image/jpeg',
        name: `receipt_${Date.now()}.jpg`,
      } as any;

      formData.append('receipt', imageFile);
      formData.append('reportId', reportId);

      const data = await apiClient.uploadFile<ReceiptUploadResponse>('/receipts/upload', formData);
      return data;
    } catch (error: any) {
      console.error('❌ Error uploading receipt:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  async getReceiptAnalysis(receiptId: string): Promise<any> {
    try {
      const data = await apiClient.get(`/receipts/${receiptId}/analysis`);
      return data;
    } catch (error) {
      console.error('Error getting receipt analysis:', error);
      throw error;
    }
  }

  async deleteReceipt(receiptId: string): Promise<boolean> {
    try {
      await apiClient.delete(`/receipts/${receiptId}`);
      return true;
    } catch (error) {
      console.error('Error deleting receipt:', error);
      return false;
    }
  }

  // Shorthand method for uploading to generic note spese
  async uploadGenericReceipt(
    imageUri: string
  ): Promise<ReceiptUploadResponse> {
    console.log('📤 Uploading receipt to generic note spese...');
    return this.uploadReceipt(imageUri, 'generic');
  }

  /**
   * Upload di un'immagine scontrino per una spesa specifica
   */
  async uploadReceiptImage(imageUri: string): Promise<{
    success: boolean;
    data?: {
      id: string;
      url: string;
      thumbnailUrl: string;
      filename: string;
    };
    error?: string;
  }> {
    try {
      const formData = new FormData();

      const imageFile = {
        uri: imageUri,
        type: 'image/jpeg',
        name: `receipt_${Date.now()}.jpg`,
      } as any;

      formData.append('image', imageFile);

      const response = await apiClient.uploadFile<{
        id: string;
        url: string;
        thumbnailUrl: string;
        filename: string;
      }>('/receipts/images/upload', formData);

      return {
        success: true,
        data: response
      };
    } catch (error: any) {
      console.error('❌ Error uploading receipt image:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Crea una spesa con dati
   */
  async createExpense(expenseReportId: string, expenseData: {
    amount: number;
    currency: string;
    merchantName?: string;
    merchantAddress?: string;
    merchantVat?: string;
    merchantLocation?: string;
    merchantLocationSource?: string;
    category: string;
    receiptDate: string;
    receiptTime: string;
    receiptImageUrl?: string;
    extractedData?: any;
    notes?: string;
    kilometers?: number;
    fuelLiters?: number;
    fuelType?: string;
  }): Promise<{
    success: boolean;
    data?: { id: string };
    error?: string;
  }> {
    try {
      console.log('📝 Creating expense...', expenseData);

      // Prepara il payload per l'API
      const payload = {
        amount: expenseData.amount,
        currency: expenseData.currency,
        merchantName: expenseData.merchantName,
        merchantAddress: expenseData.merchantAddress,
        merchantVat: expenseData.merchantVat,
        merchantLocation: expenseData.merchantLocation,
        merchantLocationSource: expenseData.merchantLocationSource,
        category: expenseData.category,
        receiptDate: expenseData.receiptDate,
        receiptTime: expenseData.receiptTime,
        receiptImageUrl: expenseData.receiptImageUrl,
        extractedData: expenseData.extractedData,
        notes: expenseData.notes,
        kilometers: expenseData.kilometers,
        fuelLiters: expenseData.fuelLiters,
        fuelType: expenseData.fuelType
      };

      console.log('📋 Sending expense payload:', payload);
      console.log('🔗 Endpoint:', `/expense-reports/${expenseReportId}/expenses`);

      const response = await apiClient.post<{ id: string }>(`/expense-reports/${expenseReportId}/expenses`, payload);

      console.log('✅ Expense created:', response);

      return {
        success: true,
        data: response
      };
    } catch (error: any) {
      console.error('❌ Error creating expense:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Crea una spesa con immagine in una singola chiamata API
   */
  async createExpenseWithImage(expenseReportId: string, expenseData: {
    localId?: string;
    amount: number;
    currency: string;
    merchantName?: string;
    merchantAddress?: string;
    merchantVat?: string;
    merchantLocation?: string;
    merchantLocationSource?: string;
    category: string;
    receiptDate: string;
    receiptTime: string;
    extractedData?: any;
    notes?: string;
    kilometers?: number;
    fuelLiters?: number;
    fuelType?: string;
  }, imageUri?: string): Promise<{
    success: boolean;
    data?: {
      id: string;
      receiptImageUrl?: string;
      receiptThumbnailUrl?: string;
      alreadyExisted?: boolean;
    };
    error?: string;
  }> {
    try {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📝 [CREATE EXPENSE] Starting...');
      console.log('📊 [CREATE EXPENSE] Report ID:', expenseReportId);
      console.log('📋 [CREATE EXPENSE] Expense data:', {
        amount: expenseData.amount,
        currency: expenseData.currency,
        merchantName: expenseData.merchantName,
        category: expenseData.category,
        receiptDate: expenseData.receiptDate,
        receiptTime: expenseData.receiptTime,
        hasExtractedData: !!expenseData.extractedData,
        hasNotes: !!expenseData.notes,
        kilometers: expenseData.kilometers
      });
      console.log('📷 [CREATE EXPENSE] Image URI:', imageUri || 'none');
      if (!imageUri) {
        const response = await apiClient.post<any>(`/expense-reports/${expenseReportId}/expenses`, expenseData);
        const data = response.data || response;
        if (!data.id) throw new Error('Server did not return an expense ID');
        // Reapply the latest state when a JSON create is retried after an offline edit or move.
        return { success: true, data: { id: data.id, alreadyExisted: true } };
      }

      // Crea FormData per multipart request
      const formData = new FormData();

      console.log('📦 [CREATE EXPENSE] Building FormData...');

      // Aggiungi i dati della spesa
      if (expenseData.localId) formData.append('localId', expenseData.localId);
      formData.append('amount', expenseData.amount.toString());
      formData.append('currency', expenseData.currency);
      if (expenseData.merchantName) formData.append('merchantName', expenseData.merchantName);
      if (expenseData.merchantAddress) formData.append('merchantAddress', expenseData.merchantAddress);
      if (expenseData.merchantVat) formData.append('merchantVat', expenseData.merchantVat);
      if (expenseData.merchantLocation) formData.append('merchantLocation', expenseData.merchantLocation);
      if (expenseData.merchantLocationSource) formData.append('merchantLocationSource', expenseData.merchantLocationSource);
      formData.append('category', expenseData.category);
      formData.append('receiptDate', expenseData.receiptDate);
      formData.append('receiptTime', expenseData.receiptTime);
      if (expenseData.extractedData) formData.append('extractedData', JSON.stringify(expenseData.extractedData));
      if (expenseData.notes) formData.append('notes', expenseData.notes);
      if (expenseData.kilometers) formData.append('kilometers', expenseData.kilometers.toString());
      if (expenseData.fuelLiters) formData.append('fuelLiters', expenseData.fuelLiters.toString());
      if (expenseData.fuelType) formData.append('fuelType', expenseData.fuelType);

      // Aggiungi l'immagine se presente
      if (imageUri) {
        const imageFile = {
          uri: imageUri,
          type: 'image/jpeg',
          name: `receipt_${Date.now()}.jpg`,
        } as any;

        console.log('📷 [CREATE EXPENSE] Adding image to FormData:', imageFile.name);
        formData.append('receiptImage', imageFile);
      }

      const endpoint = `/expense-reports/${expenseReportId}/expenses/with-image`;
      console.log('🌐 [CREATE EXPENSE] Endpoint:', endpoint);
      console.log('🔐 [CREATE EXPENSE] Auth token will be added by API client interceptor');
      console.log('📤 [CREATE EXPENSE] Sending multipart/form-data request...');

      const response = await apiClient.uploadFile<any>(endpoint, formData);

      console.log('✅ [CREATE EXPENSE] Server response received');
      console.log('📋 [CREATE EXPENSE] Response:', JSON.stringify(response, null, 2));

      // Il server ritorna { success, data: { id, receiptImageUrl, ... }, message }
      // Estraiamo i dati dalla struttura corretta
      const expenseId = response.data?.id || response.id;
      const imageUrl = response.data?.receiptImageUrl || response.receiptImageUrl;
      const thumbnailUrl = response.data?.receiptThumbnailUrl || response.receiptThumbnailUrl;

      console.log('🆔 [CREATE EXPENSE] Expense ID:', expenseId);
      console.log('🖼️ [CREATE EXPENSE] Image URL:', imageUrl || 'none');
      console.log('🖼️ [CREATE EXPENSE] Thumbnail URL:', thumbnailUrl || 'none');

      if (!expenseId) {
        console.error('⚠️ [CREATE EXPENSE] WARNING: No expense ID in response!');
        console.error('📋 [CREATE EXPENSE] Full response structure:', JSON.stringify(response, null, 2));
      }

      console.log('✅ [CREATE EXPENSE] Expense created successfully');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      return {
        success: true,
        data: {
          id: expenseId,
          receiptImageUrl: imageUrl,
          receiptThumbnailUrl: thumbnailUrl,
          alreadyExisted: response.alreadyExisted === true
        }
      };
    } catch (error: any) {
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.error('❌ [CREATE EXPENSE] Error occurred!');
      console.error('❌ [CREATE EXPENSE] Error type:', error.constructor.name);
      console.error('❌ [CREATE EXPENSE] Error message:', error.message);

      // Log dettagliato per debugging
      if (error.response) {
        console.error('📋 [CREATE EXPENSE] API Error Details:', {
          status: error.response.status,
          statusText: error.response.statusText,
          data: error.response.data,
        });

        if (error.response.status === 401) {
          console.error('🚫 [CREATE EXPENSE] Authentication failed - token may be invalid');
        } else if (error.response.status === 400) {
          console.error('⚠️ [CREATE EXPENSE] Bad request - check data format');
        } else if (error.response.status === 404) {
          console.error('🔍 [CREATE EXPENSE] Expense report not found on server');
        } else if (error.response.status === 500) {
          console.error('💥 [CREATE EXPENSE] Server error');
        }
      } else if (error.request) {
        console.error('🌐 [CREATE EXPENSE] No response from server');
      } else {
        console.error('⚙️ [CREATE EXPENSE] Error setting up request:', error.message);
      }
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Aggiorna una spesa
   */
  async updateExpense(expenseId: string, expenseData: {
    amount?: number;
    currency?: string;
    merchantName?: string;
    merchantAddress?: string;
    merchantVat?: string;
    merchantLocation?: string;
    merchantLocationSource?: string;
    category?: string;
    receiptDate?: string;
    receiptTime?: string;
    receiptImageUrl?: string;
    extractedData?: any;
    notes?: string;
    kilometers?: number;
    fuelLiters?: number;
    fuelType?: string;
    archived?: boolean; // Server usa 'archived' non 'is_archived'
  }): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      await apiClient.put(`/expenses/${expenseId}`, expenseData);
      return { success: true };
    } catch (error: any) {
      console.error('❌ Error updating expense:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Elimina una spesa
   */
  async deleteExpense(expenseId: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      console.log('🗑️ Deleting expense:', expenseId);

      await apiClient.delete(`/expenses/${expenseId}`);

      console.log('✅ Expense deleted');

      return { success: true };
    } catch (error: any) {
      console.error('❌ Error deleting expense:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Crea una expense report
   */
  async createExpenseReport(data: {
    localId?: string;
    title: string;
    description?: string;
    start_date?: string;
    end_date?: string;
  }): Promise<{
    success: boolean;
    data?: { id: string };
    error?: string;
  }> {
    try {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📝 [CREATE EXPENSE REPORT] Starting...');
      console.log('📋 [CREATE EXPENSE REPORT] Input data:', {
        title: data.title,
        description: data.description,
        start_date: data.start_date,
        end_date: data.end_date
      });

      // Prepara il payload con tutti i campi per l'API
      // Converti null/undefined in stringhe vuote per evitare errori di validazione
      const payload = {
        localId: data.localId,
        title: data.title,
        description: data.description || '',
        start_date: data.start_date,
        end_date: data.end_date
      };

      console.log('📦 [CREATE EXPENSE REPORT] Prepared payload:', JSON.stringify(payload, null, 2));
      console.log('🌐 [CREATE EXPENSE REPORT] Sending POST to /expense-reports');
      console.log('🔐 [CREATE EXPENSE REPORT] Auth token will be added by API client interceptor');

      const response = await apiClient.post<any>('/expense-reports', payload);

      console.log('✅ [CREATE EXPENSE REPORT] Server response received');
      console.log('📋 [CREATE EXPENSE REPORT] Response data:', JSON.stringify(response, null, 2));

      // Il server ritorna { success, data: { id, ... }, message }
      // Estraiamo l'ID dalla struttura corretta
      const serverId = response.data?.id || response.id;

      console.log('🆔 [CREATE EXPENSE REPORT] Server-generated ID:', serverId);

      if (!serverId) {
        console.error('⚠️ [CREATE EXPENSE REPORT] WARNING: No server ID in response!');
        console.error('📋 [CREATE EXPENSE REPORT] Full response structure:', JSON.stringify(response, null, 2));
      }

      console.log('✅ [CREATE EXPENSE REPORT] Expense report created successfully');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      return {
        success: true,
        data: { id: serverId }
      };
    } catch (error: any) {
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.error('❌ [CREATE EXPENSE REPORT] Error occurred!');
      console.error('❌ [CREATE EXPENSE REPORT] Error type:', error.constructor.name);
      console.error('❌ [CREATE EXPENSE REPORT] Error message:', error.message);

      // Log dettagliato dell'errore per debugging
      if (error.response) {
        console.error('📋 [CREATE EXPENSE REPORT] API Error Details:', {
          status: error.response.status,
          statusText: error.response.statusText,
          data: error.response.data,
          headers: error.response.headers
        });

        if (error.response.status === 401) {
          console.error('🚫 [CREATE EXPENSE REPORT] Authentication failed - token may be invalid');
        } else if (error.response.status === 400) {
          console.error('⚠️ [CREATE EXPENSE REPORT] Bad request - check payload format');
        } else if (error.response.status === 500) {
          console.error('💥 [CREATE EXPENSE REPORT] Server error');
        }
      } else if (error.request) {
        console.error('🌐 [CREATE EXPENSE REPORT] No response from server');
        console.error('📡 [CREATE EXPENSE REPORT] Request details:', error.request);
      } else {
        console.error('⚙️ [CREATE EXPENSE REPORT] Error setting up request:', error.message);
      }
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Aggiorna una expense report
   */
  async updateExpenseReport(reportId: string, data: {
    title?: string;
    description?: string;
    archived?: boolean; // Server usa 'archived' non 'is_archived'
  }): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      await apiClient.put(`/expense-reports/${reportId}`, data);
      return { success: true };
    } catch (error: any) {
      console.error('❌ Error updating expense report:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Elimina una expense report
   */
  async deleteExpenseReport(reportId: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      console.log('🗑️ Deleting expense report:', reportId);

      await apiClient.delete(`/expense-reports/${reportId}`);

      console.log('✅ Expense report deleted');

      return { success: true };
    } catch (error: any) {
      console.error('❌ Error deleting expense report:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }
}

export const receiptService = new ReceiptService();
