import { apiClient } from './api';
import { databaseManager } from './database';
import { Expense, CreateExpenseData, ApiResponse, ExpenseCategory, FoodSubcategory } from '../types';
import * as FileSystem from 'expo-file-system';
import { triggerExpenseRefresh } from '../hooks/useExpenseRefresh';

interface ReceiptAnalysisRequest {
  reportId: string;
  imageUri: string;
}

interface ReceiptAnalysisResponse {
  operationId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
}

class ExpenseService {
  async getExpenses(reportId: string, includeArchived: boolean = false): Promise<Expense[]> {
    try {
      // Da ora in poi reportId è sempre l'ID locale del database
      const localExpenses = await databaseManager.getExpensesByReportId(reportId, true);
      
      // Filtra le spese in base al flag includeArchived
      const filteredExpenses = includeArchived 
        ? localExpenses.filter(expense => expense.is_archived) // Solo spese archiviate
        : localExpenses.filter(expense => !expense.is_archived); // Solo spese attive
      
      // Converti dal formato database locale al formato API
      const apiFormatExpenses = filteredExpenses.map(expense => {
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
          receiptImages: expense.receipt_image_path ? [expense.receipt_image_path] : [],
          createdAt: new Date(expense.created_at),
          updatedAt: new Date(expense.updated_at),
          // Campi aggiuntivi per compatibilità
          merchant: expense.merchant_name,
          location: expense.merchant_address,
          vat: expense.merchant_vat,
          date: expense.receipt_date,
          note: expense.notes
        };
      });
      
      // Se ci sono dati locali, restituisci le spese filtrate
      if (localExpenses.length > 0) {
        return apiFormatExpenses;
      }
      
      // Fallback: se non ci sono dati locali, prova il server
      // Ma solo se reportId sembra un GUID valido (server_id)
      const isGuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(reportId);
      
      if (isGuid) {
        const response = await apiClient.get<ApiResponse<Expense[]>>(`/expenses/report/${reportId}`);

        if (response.success && response.data) {
          return response.data;
        }

        throw new Error(response.error || 'Failed to fetch expenses');
      }
      
      // Se reportId è un local_id e non ci sono dati locali, restituisci array vuoto
      console.log('⚠️ No local expenses found for local reportId:', reportId);
      return [];
      
    } catch (error) {
      console.error('❌ Error loading expenses:', error);
      
      // Se tutto fallisce, restituisci un array vuoto per evitare crash
      return [];
    }
  }

  async getExpense(id: string): Promise<Expense> {
    try {
      // Prima prova a caricare dal database locale
      const localExpense = await databaseManager.getExpenseById(id);
      
      if (localExpense) {
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
          receiptImages: localExpense.receipt_image_path ? [localExpense.receipt_image_path] : [],
          createdAt: new Date(localExpense.created_at),
          updatedAt: new Date(localExpense.updated_at),
          // Campi aggiuntivi per compatibilità
          merchant: localExpense.merchant_name,
          location: localExpense.merchant_address,
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
        is_archived: false,
        sync_status: 'pending'
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
          receiptImages: expense.receipt_image_path ? [expense.receipt_image_path] : [],
          createdAt: new Date(expense.created_at),
          updatedAt: new Date(expense.updated_at),
          // Campi aggiuntivi per compatibilità
          merchant: expense.merchant_name,
          location: expense.merchant_address,
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
