import { apiClient } from './api';
import { databaseManager } from './database';
import { ExpenseReport, CreateExpenseReportData, ApiResponse, PaginatedResponse, FilterOptions, SortOptions } from '../types';

class ExpenseReportService {
  async getExpenseReports(
    page: number = 1,
    limit: number = 100,
    filters?: FilterOptions,
    sort?: SortOptions
  ): Promise<PaginatedResponse<ExpenseReport>> {
    try {
      console.log('📋 Loading expense reports from local database...');
      
      // Prima prova a caricare dal database locale
      const localReports = await databaseManager.getExpenseReports(false);
      console.log(`📋 Found ${localReports.length} expense reports in local database`);
      
      // Non creiamo più automaticamente la nota generica qui
      // Sarà creata solo quando necessario dalla funzionalità Scansiona
      const updatedLocalReports = localReports;
      
      // Calcola i totali per ogni nota spese dal database locale
      const apiFormatReports = await Promise.all(
        updatedLocalReports.map(async (report) => {
          // Ottieni le spese associate a questa nota spese
          const expenses = await databaseManager.getExpensesByReportId(report.id, false);
          const totalAmount = expenses.reduce((sum, expense) => sum + expense.amount, 0);
          
          console.log(`💰 Report "${report.title}" (ID: ${report.id}): ${expenses.length} spese, totale €${totalAmount.toFixed(2)}`);
          
          return {
            id: report.id, // Usa sempre l'ID locale come riferimento primario
            name: report.title,
            description: report.description || undefined,
            startDate: new Date(report.created_at),
            endDate: new Date(report.updated_at),
            expenses: [], // Sarà popolato se necessario
            totalAmount, // Calcolato dalle spese effettive
            createdAt: new Date(report.created_at),
            updatedAt: new Date(report.updated_at),
            userId: 'local', // Placeholder per utente locale
            isGeneric: report.title === 'Nota Spesa Generica' // Flag per identificare la nota generica
          };
        })
      );
      
      // Ordina: Note Spese Generiche per prima, poi le altre per data
      apiFormatReports.sort((a, b) => {
        if (a.isGeneric) return -1; // Note Spese Generiche sempre per prima
        if (b.isGeneric) return 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(); // Ordine decrescente per data
      });
      
      // Se ci sono dati locali, restituiscili
      if (localReports.length > 0) {
        return {
          data: apiFormatReports,
          pagination: {
            page: 1,
            limit: localReports.length,
            total: localReports.length,
            totalPages: 1
          }
        };
      }
      
      // Fallback: se non ci sono dati locali, prova il server
      console.log('📋 No local data found, trying server...');
      const params = {
        page,
        limit,
        ...filters,
        sortField: sort?.field,
        sortDirection: sort?.direction,
      };

      const response = await apiClient.get<ApiResponse<PaginatedResponse<ExpenseReport>>>(
        '/expense-reports',
        params
      );

      if (response.success && response.data) {
        return response.data;
      }

      throw new Error(response.error || 'Failed to fetch expense reports');
      
    } catch (error) {
      console.error('❌ Error loading expense reports:', error);
      
      // Se tutto fallisce, restituisci un array vuoto per evitare crash
      return {
        data: [],
        pagination: {
          page: 1,
          limit: 0,
          total: 0,
          totalPages: 0
        }
      };
    }
  }

  async getExpenseReport(id: string): Promise<ExpenseReport> {
    try {
      console.log(`📋 Loading expense report ${id} from local database...`);
      
      // Prima prova a caricare dal database locale usando l'ID
      let localReport = await databaseManager.getExpenseReportById(id);
      
      // Se non trovato con l'ID diretto, prova con server_id
      if (!localReport) {
        const allReports = await databaseManager.getExpenseReports(false);
        localReport = allReports.find(report => report.server_id === id);
      }
      
      if (localReport) {
        // Calcola il totale dalle spese associate
        const expenses = await databaseManager.getExpensesByReportId(localReport.id, false);
        const totalAmount = expenses.reduce((sum, expense) => sum + expense.amount, 0);
        
        console.log(`✅ Found expense report locally: ${localReport.title} with total €${totalAmount.toFixed(2)}`);
        
        return {
          id: localReport.id, // Usa sempre l'ID locale come riferimento primario
          name: localReport.title,
          description: localReport.description || '',
          startDate: new Date(localReport.created_at),
          endDate: new Date(localReport.updated_at),
          expenses: [], // Sarà popolato se necessario
          totalAmount,
          createdAt: new Date(localReport.created_at),
          updatedAt: new Date(localReport.updated_at),
          userId: 'local',
          isGeneric: localReport.title === 'Nota Spesa Generica' // Flag per identificare la nota generica
        };
      }
      
      // Fallback: prova l'API del server
      console.log(`📋 No local report found for ${id}, trying server...`);
      const response = await apiClient.get<ApiResponse<ExpenseReport>>(`/expense-reports/${id}`);

      if (response.success && response.data) {
        return response.data;
      }

      throw new Error(response.error || 'Failed to fetch expense report');
      
    } catch (error) {
      console.error('❌ Error loading expense report:', error);
      throw new Error('Impossibile caricare i dettagli della nota spese');
    }
  }

  async createExpenseReport(data: CreateExpenseReportData): Promise<ExpenseReport> {
    try {
      console.log('📝 Creating expense report locally first...', data);
      
      // Salva prima nel database locale
      const localReportId = await databaseManager.createExpenseReport({
        title: data.name,
        description: data.description,
        is_archived: false,
        sync_status: 'pending'
      });
      
      console.log('✅ Expense report created locally:', localReportId);
      
      // Restituisci un oggetto nel formato ExpenseReport atteso
      const createdReport: ExpenseReport = {
        id: localReportId, // ID locale per ora
        name: data.name,
        description: data.description || '',
        startDate: data.startDate,
        endDate: data.endDate,
        expenses: [], // Inizialmente nessuna spesa
        totalAmount: 0, // Inizialmente nessuna spesa
        createdAt: new Date(),
        updatedAt: new Date(),
        userId: 'local'
      };
      
      // Tenta invio al server in background (non bloccante)
      apiClient.post<ApiResponse<ExpenseReport>>('/expense-reports', data)
        .then(response => {
          if (response.success && response.data) {
            console.log('✅ Expense report synced to server successfully');
            // Aggiorna il database locale con il server_id
            databaseManager.updateExpenseReport(localReportId, {
              server_id: response.data.id,
              sync_status: 'synced'
            }).catch(console.error);
          }
        })
        .catch(error => {
          console.warn('⚠️ Failed to sync expense report to server:', error);
          // Il record rimane in pending, sarà sincronizzato in seguito
        });
      
      return createdReport;
      
    } catch (error) {
      console.error('❌ Error creating expense report:', error);
      throw new Error('Failed to create expense report locally');
    }
  }

  async updateExpenseReport(id: string, data: Partial<CreateExpenseReportData>): Promise<ExpenseReport> {
    try {
      console.log(`📝 Attempting to update expense report ${id} locally first...`, data);
      
      // Prima prova a aggiornare nel database locale
      try {
        const localReport = await databaseManager.getExpenseReportById(id);
        if (localReport) {
          console.log(`📝 Updating expense report ${id} locally...`);
          
          // Prepara i dati per l'aggiornamento locale
          const updateData: Partial<any> = {
            sync_status: 'pending' // Segna come pending per sync
          };
          
          if (data.name !== undefined) {
            updateData.title = data.name; // Campo locale è 'title' non 'name'
          }
          if (data.description !== undefined) {
            updateData.description = data.description;
          }
          
          // Aggiorna nel database locale
          await databaseManager.updateExpenseReport(id, updateData);
          console.log(`✅ Expense report ${id} updated locally`);
          
          // Restituisci la versione aggiornata dal database locale
          const updatedReport = await this.getExpenseReport(id);
          
          console.log('📤 Expense report will be synced to server in background by sync manager');
          
          return updatedReport;
        } else {
          console.log(`📊 Local expense report ${id} not found, trying server update...`);
        }
      } catch (localError) {
        console.log(`📊 Local update failed: ${(localError as Error).message}`);
        console.log(`📊 Trying server update instead...`);
      }
      
      // Fallback: aggiornamento diretto sul server
      console.log(`📤 Updating expense report ${id} directly on server...`);
      const response = await apiClient.put<ApiResponse<ExpenseReport>>(`/expense-reports/${id}`, data);

      if (response.success && response.data) {
        return response.data;
      }

      throw new Error(response.error || 'Failed to update expense report');
      
    } catch (error) {
      console.error('❌ Error updating expense report:', error);
      throw new Error('Failed to update expense report');
    }
  }

  async deleteExpenseReport(id: string): Promise<void> {
    try {
      console.log(`🗑️ Attempting to delete expense report ${id}...`);
      
      // Prima prova a fare soft delete nel database locale
      try {
        await databaseManager.archiveExpenseReportWithExpenses(id);
        console.log(`✅ Expense report ${id} and all expenses archived locally (soft delete)`);
        return;
      } catch (localError) {
        console.log(`📊 Local archiving failed: ${localError.message}`);
        console.log(`📊 Attempting to delete from server instead...`);
        
        // Se non esiste localmente, prova a eliminare dal server
        const response = await apiClient.delete<ApiResponse<void>>(`/expense-reports/${id}`);
        
        if (response.success) {
          console.log(`✅ Expense report ${id} deleted from server`);
          return;
        } else {
          throw new Error(response.error || 'Failed to delete expense report from server');
        }
      }
      
    } catch (error) {
      console.error('❌ Error deleting expense report:', error);
      throw new Error('Failed to delete expense report');
    }
  }
  
  async archiveExpenseReportWithExpenses(id: string): Promise<void> {
    try {
      console.log(`🗂️ Archiving expense report ${id} with all associated expenses...`);
      
      await databaseManager.archiveExpenseReportWithExpenses(id);
      console.log(`✅ Successfully archived expense report ${id} with all expenses`);
      
    } catch (error) {
      console.error('❌ Error archiving expense report with expenses:', error);
      throw new Error('Failed to archive expense report and expenses');
    }
  }

  async searchExpenseReports(query: string): Promise<ExpenseReport[]> {
    try {
      console.log(`🔍 Searching expense reports locally for query: "${query}"...`);
      
      // ✅ PRIMA CERCA NEL DATABASE LOCALE
      const localReports = await databaseManager.getExpenseReports(false);
      
      if (localReports.length > 0) {
        // Effettua ricerca locale con filtro case-insensitive
        const searchTerm = query.toLowerCase().trim();
        
        const filteredReports = await Promise.all(
          localReports
            .filter(report => {
              // Ricerca nei campi title e description
              const titleMatch = report.title.toLowerCase().includes(searchTerm);
              const descriptionMatch = report.description && 
                report.description.toLowerCase().includes(searchTerm);
              
              return titleMatch || descriptionMatch;
            })
            .map(async (report) => {
              // Calcola il totale dalle spese associate (come in getExpenseReports)
              const expenses = await databaseManager.getExpensesByReportId(report.id, false);
              const totalAmount = expenses.reduce((sum, expense) => sum + expense.amount, 0);
              
              return {
                id: report.id,
                name: report.title,
                description: report.description || '',
                startDate: new Date(report.created_at),
                endDate: new Date(report.updated_at),
                expenses: [], // Sarà popolato se necessario
                totalAmount,
                createdAt: new Date(report.created_at),
                updatedAt: new Date(report.updated_at),
                userId: 'local'
              };
            })
        );
        
        console.log(`✅ Found ${filteredReports.length} matching expense reports locally`);
        
        // Se ci sono risultati locali, restituiscili
        if (filteredReports.length > 0 || searchTerm.length > 0) {
          return filteredReports;
        }
      }
      
      // 📤 FALLBACK: se non ci sono dati locali o risultati, prova il server
      console.log(`🗜️ No local results found, trying server search...`);
      const response = await apiClient.get<ApiResponse<ExpenseReport[]>>('/expense-reports/search', {
        q: query,
      });

      if (response.success && response.data) {
        console.log(`✅ Found ${response.data.length} results from server`);
        return response.data;
      }

      throw new Error(response.error || 'Failed to search expense reports');
      
    } catch (error) {
      console.error('❌ Error searching expense reports:', error);
      
      // Se tutto fallisce, restituisci array vuoto per evitare crash
      return [];
    }
  }
}

export const expenseReportService = new ExpenseReportService();
