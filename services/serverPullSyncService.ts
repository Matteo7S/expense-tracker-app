import { apiClient } from './api';
import { databaseManager } from './database';
import { ApiResponse, Expense } from '../types';
import { triggerExpenseRefresh } from '../hooks/useExpenseRefresh';

type ServerExpenseReport = {
  id: string;
  title?: string;
  name?: string;
  description?: string;
  start_date?: string | null;
  end_date?: string | null;
  user_id?: string;
  userId?: string;
  archived?: boolean;
  is_archived?: boolean;
  isArchived?: boolean;
  created_at?: string;
  updated_at?: string;
  createdAt?: string;
  updatedAt?: string;
};

function unwrapArray<T>(response: any, keys: string[] = []): T[] {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.data)) return response.data;

  const arrayKeys = [...keys, 'items', 'rows', 'results', 'records'];
  for (const key of arrayKeys) {
    if (Array.isArray(response?.data?.[key])) return response.data[key];
    if (Array.isArray(response?.[key])) return response[key];
  }

  if (response && typeof response === 'object') {
    for (const value of Object.values(response)) {
      const nested = unwrapArray<T>(value, arrayKeys);
      if (nested.length > 0) return nested;
    }
  }

  return [];
}

function describeShape(value: any): any {
  if (Array.isArray(value)) return `array(${value.length})`;
  if (!value || typeof value !== 'object') return typeof value;

  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [
      key,
      Array.isArray(nested)
        ? `array(${nested.length})`
        : nested && typeof nested === 'object'
          ? Object.keys(nested)
          : typeof nested
    ])
  );
}

class ServerPullSyncService {
  private isRunning = false;

  async pullUserData(): Promise<{ reports: number; expenses: number }> {
    if (this.isRunning) {
      console.log('🔽 [PULL SYNC] Already running, skipping duplicate request');
      return { reports: 0, expenses: 0 };
    }

    this.isRunning = true;

    try {
      console.log('🔽 [PULL SYNC] Starting server-to-local sync...');

      const reportsResponse = await apiClient.get<ApiResponse<ServerExpenseReport[]> | any>('/expense-reports');
      console.log('🔽 [PULL SYNC] Reports response shape:', describeShape(reportsResponse));
      const reports = unwrapArray<ServerExpenseReport>(reportsResponse, ['expenseReports', 'expense_reports', 'reports']);

      console.log(`🔽 [PULL SYNC] Found ${reports.length} server reports`);

      let pulledReports = 0;
      let pulledExpenses = 0;

      for (const report of reports) {
        if (!report.id) continue;

        const localReportId = await databaseManager.upsertExpenseReportFromServer(report as any);
        pulledReports++;

        try {
          const expensesResponse = await apiClient.get<ApiResponse<Expense[]> | any>(`/expenses/report/${report.id}`);
          const expenses = unwrapArray<Expense>(expensesResponse, ['expenses']);

          console.log(`🔽 [PULL SYNC] Report ${report.id}: found ${expenses.length} server expenses`);

          for (const expense of expenses) {
            if (!expense.id) continue;
            await databaseManager.upsertExpenseFromServer(expense as any, localReportId);
            pulledExpenses++;
          }
        } catch (error) {
          console.warn('⚠️ [PULL SYNC] Failed to pull expenses for report:', report.id, error);
        }
      }

      console.log('✅ [PULL SYNC] Completed:', { reports: pulledReports, expenses: pulledExpenses });
      triggerExpenseRefresh();

      return { reports: pulledReports, expenses: pulledExpenses };
    } catch (error) {
      console.warn('⚠️ [PULL SYNC] Failed to pull user data:', error);
      return { reports: 0, expenses: 0 };
    } finally {
      this.isRunning = false;
    }
  }
}

export const serverPullSyncService = new ServerPullSyncService();
