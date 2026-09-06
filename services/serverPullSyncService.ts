import { apiClient } from './api';
import { databaseManager } from './database';
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
  private reportPulls = new Map<string, Promise<number>>();

  private async getAllPages<T>(endpoint: string, params: Record<string, unknown> = {}): Promise<T[]> {
    const result: T[] = [];
    for (let page = 1; ; page++) {
      const response = await apiClient.get<any>(endpoint, { ...params, page, limit: 100 });
      const rows = unwrapArray<T>(response, ['reports', 'expenseReports', 'expenses']);
      result.push(...rows);
      const pagination = response?.pagination || response?.data?.pagination;
      if (!pagination || page >= pagination.totalPages || rows.length === 0) break;
    }
    return result;
  }

  async pullReports(): Promise<ServerExpenseReport[]> {
    const reports = await this.getAllPages<ServerExpenseReport>('/expense-reports');
    for (const report of reports) await databaseManager.upsertExpenseReportFromServer(report as any);
    return reports;
  }

  pullReportExpenses(localReportId: string): Promise<number> {
    const running = this.reportPulls.get(localReportId);
    if (running) return running;
    const pull = this.performReportPull(localReportId).finally(() => this.reportPulls.delete(localReportId));
    this.reportPulls.set(localReportId, pull);
    return pull;
  }

  private async performReportPull(localReportId: string): Promise<number> {
    const report = await databaseManager.getExpenseReportById(localReportId);
    if (!report?.server_id) return 0;
    const expenses = [
      ...await this.getAllPages<any>(`/expenses/report/${report.server_id}`),
      ...await this.getAllPages<any>(`/expenses/report/${report.server_id}`, { archived: true })
    ];
    for (const expense of expenses) await databaseManager.upsertExpenseFromServer(expense, localReportId);
    const ids = new Set(expenses.map(expense => expense.id));
    const local = await databaseManager.getExpensesByReportId(localReportId, true);
    for (const expense of local) {
      if (!expense.server_id || expense.sync_status !== 'synced' || ids.has(expense.server_id)) continue;
      // An absent row may have moved to a report that has never been opened on this device.
      const response = await apiClient.get<any>(`/expenses/${expense.server_id}`);
      const remote = response.data;
      const remoteReportId = remote?.expense_report_id || remote?.reportId;
      if (remoteReportId && remoteReportId !== report.server_id) {
        const parent = await apiClient.get<any>(`/expense-reports/${remoteReportId}`);
        const targetId = await databaseManager.upsertExpenseReportFromServer(parent.data);
        await databaseManager.upsertExpenseFromServer(remote, targetId);
      }
    }
    return expenses.length;
  }

  async pullUserData(): Promise<{ reports: number; expenses: number }> {
    if (this.isRunning) {
      console.log('🔽 [PULL SYNC] Already running, skipping duplicate request');
      return { reports: 0, expenses: 0 };
    }

    this.isRunning = true;

    try {
      console.log('🔽 [PULL SYNC] Starting server-to-local sync...');

      const reportsResponse = await this.pullReports();
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
          pulledExpenses += await this.pullReportExpenses(localReportId);
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
