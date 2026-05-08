const GENERIC_EXPENSE_REPORT_TITLE = 'Nota Spesa Generica';
const GENERIC_EXPENSE_REPORT_DISPLAY_TITLE = 'Nota Spesa';

const normalizeReportTitle = (title?: string | null) => (title || '').trim().toLowerCase();

export const isGenericExpenseReportTitle = (title?: string | null): boolean => {
  return normalizeReportTitle(title) === normalizeReportTitle(GENERIC_EXPENSE_REPORT_TITLE);
};

export const getExpenseReportDisplayTitle = (title?: string | null): string => {
  if (isGenericExpenseReportTitle(title)) {
    return GENERIC_EXPENSE_REPORT_DISPLAY_TITLE;
  }

  return title || '';
};
