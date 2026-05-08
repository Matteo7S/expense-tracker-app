import { databaseManager } from './database';
import { getExpenseReportDisplayTitle } from '../utils/expenseReportDisplay';

interface DefaultReport {
  id: string;
  title: string;
  description?: string;
  totalAmount: number;
}

class ExpenseReportService {
  /**
   * Ottiene la nota spese di default per l'utente corrente.
   * La crea se non esiste (al login/registrazione viene sempre creata).
   */
  async getDefaultReport(): Promise<DefaultReport> {
    const reportId = await databaseManager.getDefaultReportId();
    const report = await databaseManager.getExpenseReportById(reportId);
    if (!report) throw new Error('Default report not found');

    const expenses = await databaseManager.getExpensesByReportId(reportId, false);
    const totalAmount = expenses.reduce((sum, e) => sum + e.amount, 0);

    return {
      id: report.id,
      title: getExpenseReportDisplayTitle(report.title),
      description: report.description,
      totalAmount,
    };
  }
}

export const expenseReportService = new ExpenseReportService();
