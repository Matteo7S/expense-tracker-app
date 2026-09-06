type DateValue = string | Date | null | undefined;

export interface ReportOption {
  id: string;
  name: string;
  startDate?: DateValue;
  endDate?: DateValue;
  updatedAt?: DateValue;
  createdAt?: DateValue;
}

export function reportDateKey(value: DateValue): string {
  if (!value) return '';
  if (typeof value === 'string') {
    const key = value.slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(key) && !Number.isNaN(Date.parse(key)) ? key : '';
  }
  if (Number.isNaN(value.getTime())) return '';
  return [value.getFullYear(), String(value.getMonth() + 1).padStart(2, '0'), String(value.getDate()).padStart(2, '0')].join('-');
}

const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const timestamp = (value: DateValue) => value ? new Date(value).getTime() || 0 : 0;

export function filterReportOptions<T extends ReportOption>(reports: T[], search: string, from: string, to: string): T[] {
  if (from && to && from > to) return [];
  return reports.filter(report => {
    if (!normalize(report.name).includes(normalize(search))) return false;
    if (!from && !to) return true;
    const start = reportDateKey(report.startDate) || reportDateKey(report.endDate);
    const end = reportDateKey(report.endDate) || start;
    // With a period filter, undated reports cannot be matched reliably.
    return !!start && (!from || end >= from) && (!to || start <= to);
  }).sort((a, b) =>
    (timestamp(b.updatedAt) || timestamp(b.createdAt)) - (timestamp(a.updatedAt) || timestamp(a.createdAt)) ||
    a.id.localeCompare(b.id));
}

