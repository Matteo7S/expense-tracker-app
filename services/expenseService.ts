import { apiClient } from './api';
import { serverPullSyncService } from './serverPullSyncService';
import { databaseManager } from './database';
import { Expense, CreateExpenseData, ApiResponse, ExpenseCategory, FoodSubcategory } from '../types';
import * as FileSystem from 'expo-file-system';
import { triggerExpenseRefresh } from '../hooks/useExpenseRefresh';
import { API_ENDPOINTS } from '../config/api';
import { resolveReceiptPath } from '../utils/receiptPath';

function buildReceiptUrl(filenameOrUrl: string | undefined | null): string | null {
  if (!filenameOrUrl) return null;
  // localhost URLs are invalid on device — extract filename
  if (filenameOrUrl.includes('localhost')) {
    const parts = filenameOrUrl.split('/uploads/');
    if (parts.length === 2) {
      filenameOrUrl = parts[1];
    } else {
      return null;
    }
  }
  // Already a full URL (remote)
  if (filenameOrUrl.startsWith('http://') || filenameOrUrl.startsWith('https://')) {
    return filenameOrUrl;
  }
  // Absolute file:// path — return as-is (local image)
  if (filenameOrUrl.startsWith('file://')) {
    return filenameOrUrl;
  }
  // Could be a relative local receipt path (e.g. "receipt_xxx.jpg" or "receipts/receipt_xxx.jpg")
  if (filenameOrUrl.startsWith('receipt')) {
    const resolved = resolveReceiptPath(filenameOrUrl);
    if (resolved) return resolved;
  }
  // Just a server filename — prepend server uploads path
  // MAIN_API ends with .../api/ but uploads are served at .../uploads/ (sibling, not child)
  const baseUrl = API_ENDPOINTS.MAIN_API.replace(/api\/$/, '');
  return `${baseUrl}uploads/${filenameOrUrl}`;
}

interface ReceiptAnalysisRequest {
  reportId: string;
  imageUri: string;
}

interface ReceiptAnalysisResponse {
  operationId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
}

class ExpenseService {
  private buildExpenseFingerprint(expense: {
    amount?: number | null;
    category?: string | null;
    date?: string | null;
    merchant?: string | null;
    notes?: string | null;
  }): string {
    const normalizedAmount = Number(expense.amount || 0).toFixed(2);
    const normalizedCategory = (expense.category || 'other').trim().toLowerCase();
    const normalizedDate = (expense.date || '').trim().split('T')[0];
    const normalizedMerchant = (expense.merchant || '').trim().toLowerCase();
    const normalizedNotes = (expense.notes || '').trim().toLowerCase();

    return [
      normalizedAmount,
      normalizedCategory,
      normalizedDate,
      normalizedMerchant,
      normalizedNotes
    ].join('|');
  }

  private getServerMerchantAddress(expense: Expense): string {
    const serverExpense = expense as any;
    return serverExpense.merchant_address || serverExpense.merchantAddress || expense.location || '';
  }

  private getServerMerchantVat(expense: Expense): string {
    const serverExpense = expense as any;
    return serverExpense.merchant_vat || serverExpense.merchantVat || expense.vat || '';
  }

  private deduplicateExpenses(expenses: Expense[]): Expense[] {
    const seenIds = new Set<string>();
    const seenFingerprints = new Set<string>();

    return expenses.filter((expense) => {
      if (seenIds.has(expense.id)) {
        return false;
      }

      const fingerprint = this.buildExpenseFingerprint({
        amount: expense.amount,
        category: expense.category,
        date: expense.date,
        merchant: expense.merchant || expense.description,
        notes: expense.note || expense.description
      });

      if (seenFingerprints.has(fingerprint)) {
        console.log('🧹 [getExpenses] Skipping duplicate expense by fingerprint:', expense.id);
        return false;
      }

      seenIds.add(expense.id);
      seenFingerprints.add(fingerprint);
      return true;
    });
  }

  async getExpenses(reportId: string, includeArchived: boolean = false): Promise<Expense[]> {
    try {
      await serverPullSyncService.pullReportExpenses(reportId);
    } catch {
      // Offline edits, including moves, remain visible from SQLite.
    }
    const expenses = await databaseManager.getExpensesByReportId(reportId, true);
    return Promise.all(expenses.filter(expense => includeArchived ? expense.is_archived : !expense.is_archived)
      .map(expense => this.getExpense(expense.id)));
  }

  async getExpense(id: string): Promise<Expense> {
    try {
      // Prima prova a caricare dal database locale
      const localExpense = await databaseManager.getExpenseById(id);

      if (localExpense) {
        console.log('🖼️ [getExpense] Image fields:', {
          receipt_image_url: localExpense.receipt_image_url,
          receipt_image_path: localExpense.receipt_image_path,
          builtUrl: buildReceiptUrl(localExpense.receipt_image_url) || buildReceiptUrl(localExpense.receipt_image_path)
        });
        // Converti dal formato database locale al formato API
        return {
          id: localExpense.server_id || localExpense.id,
          reportId: localExpense.expense_report_id,
          description: localExpense.notes || localExpense.merchant_name || 'Spesa senza descrizione',
          amount: localExpense.amount,
          currency: localExpense.currency,
          category: localExpense.category as ExpenseCategory,
          subcategory: undefined,
          numberOfPeople: 1,
          receiptImages: (() => { const url = buildReceiptUrl(localExpense.receipt_image_url) || buildReceiptUrl(localExpense.receipt_image_path); return url ? [url] : []; })(),
          createdAt: new Date(localExpense.created_at),
          updatedAt: new Date(localExpense.updated_at),
          // Campi aggiuntivi per compatibilità
          merchant: localExpense.merchant_name,
          location: localExpense.merchant_address,
          merchantLocation: localExpense.merchant_location,
          merchantLocationSource: localExpense.merchant_location_source,
          vat: localExpense.merchant_vat,
          date: localExpense.receipt_date,
          note: localExpense.notes
        } as Expense;
      }

      // Fallback: prova l'API del server
      const response = await apiClient.get<ApiResponse<Expense>>(`/expenses/${id}`);

      if (response.success && response.data) {
        return response.data;
      }

      throw new Error(response.error || 'Failed to fetch expense');

    } catch (error) {
      console.error('❌ Error loading expense:', error);
      throw new Error('Impossibile caricare i dettagli della spesa');
    }
  }

  async createExpense(data: CreateExpenseData): Promise<Expense> {
    try {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📝 [CREATE EXPENSE] Starting expense creation process');
      console.log('📋 [CREATE EXPENSE] Input data:', JSON.stringify(data, null, 2));
      console.log('📋 [CREATE EXPENSE] reportId:', data.reportId);
      console.log('📋 [CREATE EXPENSE] amount:', data.amount);
      console.log('📋 [CREATE EXPENSE] category:', data.category);
      console.log('📋 [CREATE EXPENSE] description:', data.description);

      // Auto-resolve reportId to the default report if not provided
      if (!data.reportId) {
        data.reportId = await databaseManager.getDefaultReportId();
        console.log('📋 [CREATE EXPENSE] Auto-resolved reportId to default:', data.reportId);
      }

      // Verifica lo stato del report parent
      try {
        const parentReport = await databaseManager.getExpenseReportById(data.reportId);
        console.log('👨‍👧 [CREATE EXPENSE] Parent report found:', {
          id: parentReport?.id,
          server_id: parentReport?.server_id,
          title: parentReport?.title,
          sync_status: parentReport?.sync_status
        });

        if (!parentReport) {
          console.error('❌ [CREATE EXPENSE] Parent report NOT FOUND!');
        } else if (!parentReport.server_id) {
          console.warn('⚠️ [CREATE EXPENSE] Parent report has NO server_id - sync will fail!');
        }
      } catch (reportError) {
        console.error('❌ [CREATE EXPENSE] Error checking parent report:', reportError);
      }

      // Auto-determine subcategory for food based on time
      let subcategory = data.subcategory;
      if (data.category === ExpenseCategory.FOOD && !subcategory) {
        subcategory = this.determineFoodSubcategory();
        console.log('🍽️ [CREATE EXPENSE] Auto-determined food subcategory:', subcategory);
      }

      // ✅ SALVARE PRIMA NEL DATABASE LOCALE
      console.log('💾 [CREATE EXPENSE] Saving to local database...');
      const expenseData = {
        expense_report_id: data.reportId,
        amount: data.amount,
        currency: 'EUR', // Default currency
        merchant_name: data.description, // Usa description come merchant name per ora
        category: data.category,
        receipt_date: new Date().toISOString().split('T')[0], // Data corrente
        receipt_time: new Date().toTimeString().split(' ')[0], // Ora corrente
        notes: data.description,
        receipt_image_path: data.receiptImages && data.receiptImages.length > 0 ? data.receiptImages[0] : undefined,
        kilometers: data.kilometers,
        fuel_liters: data.fuelLiters,
        fuel_type: data.fuelType,
        is_archived: false,
        sync_status: 'pending' as const
      };
      console.log('💾 [CREATE EXPENSE] Expense data to save:', JSON.stringify(expenseData, null, 2));

      const localExpenseId = await databaseManager.createExpense(expenseData);

      console.log('✅ [CREATE EXPENSE] Expense saved locally with ID:', localExpenseId);

      // Verifica che la spesa sia stata aggiunta alla sync queue
      try {
        const syncQueue = await databaseManager.getSyncQueue();
        const expenseInQueue = syncQueue.find(item =>
          item.table_name === 'expenses' && item.record_id === localExpenseId
        );
        console.log('🔄 [CREATE EXPENSE] Sync queue status:', {
          total_items: syncQueue.length,
          expense_in_queue: !!expenseInQueue,
          queue_item: expenseInQueue ? {
            id: expenseInQueue.id,
            action: expenseInQueue.action,
            attempts: expenseInQueue.attempts,
            last_error: expenseInQueue.last_error
          } : null
        });
      } catch (queueError) {
        console.error('❌ [CREATE EXPENSE] Error checking sync queue:', queueError);
      }

      // ✅ TRIGGER REFRESH PER AGGIORNARE UI
      console.log('🔄 [CREATE EXPENSE] Triggering UI refresh...');
      triggerExpenseRefresh();

      // ✅ RESTITUIRE DATO LOCALE CONVERTITO IN FORMATO API
      console.log('📤 [CREATE EXPENSE] Converting to API format...');
      const createdExpense = await this.getExpense(localExpenseId);
      console.log('📤 [CREATE EXPENSE] Created expense (API format):', JSON.stringify(createdExpense, null, 2));

      console.log('📤 [CREATE EXPENSE] Expense will be synced to server in background by sync manager');
      console.log('✅ [CREATE EXPENSE] Creation process completed successfully');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      return createdExpense;

    } catch (error) {
      console.error('❌ Error creating expense locally:', error);
      throw new Error('Failed to create expense locally');
    }
  }

  async updateExpense(id: string, data: Partial<CreateExpenseData & { isArchived?: boolean }>): Promise<Expense> {
    try {
      // Se si tratta di archiviazione, gestiscila localmente
      if (data.isArchived !== undefined) {
        try {
          await databaseManager.updateExpenseArchiveStatus(id, data.isArchived);
          console.log(`✅ Expense ${id} archive status updated locally`);

          // Ritorna la spesa aggiornata
          const updatedExpense = await this.getExpense(id);
          return updatedExpense;
        } catch (localError) {
          console.error(`❌ Failed to update expense locally:`, localError);
          throw new Error('Failed to archive expense');
        }
      }

      // Per altri aggiornamenti, prova prima localmente poi il server
      try {
        // Prova prima a aggiornare localmente se la spesa esiste
        const localExpense = await databaseManager.getExpenseById(id);
        if (localExpense) {
          // Converte i dati dall'API format al database format
          const databaseUpdates: Partial<any> = {};

          if (data.amount !== undefined) databaseUpdates.amount = data.amount;
          if (data.description !== undefined) {
            // La description nell'API corrisponde alle note nel database
            databaseUpdates.notes = data.description;
            // Se non c'è un merchant name, usa la description come merchant
            if (!localExpense.merchant_name && data.description) {
              databaseUpdates.merchant_name = data.description;
            }
          }
          if (data.category !== undefined) databaseUpdates.category = data.category;
          if (data.numberOfPeople !== undefined) {
            // numberOfPeople non è mappato nel database, lo ignoriamo per ora
          }
          if (data.receiptImages && data.receiptImages.length > 0) {
            databaseUpdates.receipt_image_path = data.receiptImages[0];
          }
          if (data.kilometers !== undefined) databaseUpdates.kilometers = data.kilometers;
          if (data.fuelLiters !== undefined) databaseUpdates.fuel_liters = data.fuelLiters;
          if (data.fuelType !== undefined) databaseUpdates.fuel_type = data.fuelType;

          // Aggiorna nel database locale
          await databaseManager.updateExpense(id, databaseUpdates);
          console.log(`✅ Expense ${id} updated locally`);

          // Trigger refresh
          triggerExpenseRefresh();

          // Ritorna la spesa aggiornata
          const updatedExpense = await this.getExpense(id);
          return updatedExpense;
        }
      } catch (localError) {
        // Fallback al server se aggiornamento locale fallisce
      }

      // Fallback al server per aggiornamenti non-archivio
      const response = await apiClient.put<ApiResponse<Expense>>(`/expenses/${id}`, data);

      if (response.success && response.data) {
        return response.data;
      }

      throw new Error(response.error || 'Failed to update expense');

    } catch (error) {
      console.error('❌ Error updating expense:', error);
      throw error;
    }
  }

  async deleteExpense(id: string): Promise<void> {
    try {
      console.log(`🗑️ Attempting to delete expense ${id}...`);

      // Prima prova a eliminare dal database locale
      try {
        await databaseManager.deleteExpense(id);
        console.log(`✅ Expense ${id} deleted from local database`);
        return;
      } catch (localError) {
        // Se non esiste localmente, prova a eliminare dal server
        const response = await apiClient.delete<ApiResponse<void>>(`/expenses/${id}`);

        if (response.success) {
          return;
        } else {
          throw new Error(response.error || 'Failed to delete expense from server');
        }
      }

    } catch (error) {
      console.error('❌ Error deleting expense:', error);
      throw new Error('Failed to delete expense');
    }
  }

  async uploadReceiptImages(expenseId: string, imageUris: string[]): Promise<string[]> {
    const formData = new FormData();

    for (let i = 0; i < imageUris.length; i++) {
      const uri = imageUris[i];
      const filename = `receipt_${Date.now()}_${i}.jpg`;

      formData.append('receipts', {
        uri,
        type: 'image/jpeg',
        name: filename,
      } as any);
    }

    const response = await apiClient.uploadFile<ApiResponse<{ imageUrls: string[] }>>(
      `/expenses/${expenseId}/receipts`,
      formData
    );

    if (response.success && response.data) {
      return response.data.imageUrls;
    }

    throw new Error(response.error || 'Failed to upload receipt images');
  }

  async analyzeReceipt(reportId: string, imageUri: string): Promise<ReceiptAnalysisResponse> {
    const formData = new FormData();
    const filename = `receipt_analysis_${Date.now()}.jpg`;

    formData.append('receipt', {
      uri: imageUri,
      type: 'image/jpeg',
      name: filename,
    } as any);

    formData.append('reportId', reportId);

    const response = await apiClient.uploadFile<ApiResponse<ReceiptAnalysisResponse>>(
      '/expenses/analyze-receipt',
      formData
    );

    if (response.success && response.data) {
      return response.data;
    }

    throw new Error(response.error || 'Failed to analyze receipt');
  }

  async getAnalysisStatus(operationId: string): Promise<ReceiptAnalysisResponse> {
    const response = await apiClient.get<ApiResponse<ReceiptAnalysisResponse>>(
      `/expenses/analysis-status/${operationId}`
    );

    if (response.success && response.data) {
      return response.data;
    }

    throw new Error(response.error || 'Failed to get analysis status');
  }

  private determineFoodSubcategory(): string {
    const hour = new Date().getHours();

    if (hour >= 5 && hour < 11) {
      return FoodSubcategory.BREAKFAST;
    } else if (hour >= 11 && hour < 16) {
      return FoodSubcategory.LUNCH;
    } else if (hour >= 16 && hour < 22) {
      return FoodSubcategory.DINNER;
    } else {
      return FoodSubcategory.SNACK;
    }
  }

  async getArchivedExpenses(): Promise<Expense[]> {
    try {
      console.log(`📦 Loading all archived expenses from local database...`);

      // Ottieni tutte le spese archiviate da tutti i report
      const archivedExpenses = await databaseManager.getAllArchivedExpenses();

      console.log(`📦 Found ${archivedExpenses.length} archived expenses`);

      // Converti dal formato database locale al formato API
      const apiFormatExpenses = archivedExpenses.map(expense => {
        const apiId = expense.server_id || expense.id;

        return {
          id: apiId,
          reportId: expense.expense_report_id,
          description: expense.notes || expense.merchant_name || 'Spesa senza descrizione',
          amount: expense.amount,
          currency: expense.currency,
          category: expense.category as ExpenseCategory,
          subcategory: undefined,
          numberOfPeople: 1,
          receiptImages: (() => { const url = buildReceiptUrl(expense.receipt_image_url) || buildReceiptUrl(expense.receipt_image_path); return url ? [url] : []; })(),
          createdAt: new Date(expense.created_at),
          updatedAt: new Date(expense.updated_at),
          // Campi aggiuntivi per compatibilità
          merchant: expense.merchant_name,
          location: expense.merchant_address,
          merchantLocation: expense.merchant_location,
          merchantLocationSource: expense.merchant_location_source,
          vat: expense.merchant_vat,
          date: expense.receipt_date,
          note: expense.notes
        } as Expense;
      });

      return apiFormatExpenses;

    } catch (error) {
      console.error('❌ Error loading archived expenses:', error);
      return [];
    }
  }

  getSubcategoriesForCategory(category: ExpenseCategory): string[] {
    switch (category) {
      case ExpenseCategory.FOOD:
        return Object.values(FoodSubcategory);
      case ExpenseCategory.TRANSPORT:
        return ['taxi', 'bus', 'train', 'plane', 'car', 'parking', 'fuel'];
      case ExpenseCategory.ACCOMMODATION:
        return ['hotel', 'airbnb', 'hostel', 'resort'];
      case ExpenseCategory.ENTERTAINMENT:
        return ['cinema', 'theater', 'museum', 'concerts', 'sports', 'nightlife'];
      case ExpenseCategory.SHOPPING:
        return ['clothing', 'electronics', 'books', 'gifts', 'groceries'];
      case ExpenseCategory.HEALTH:
        return ['pharmacy', 'doctor', 'dentist', 'hospital', 'insurance'];
      case ExpenseCategory.BUSINESS:
        return ['office_supplies', 'meetings', 'conferences', 'equipment'];
      default:
        return [];
    }
  }
}

export const expenseService = new ExpenseService();
