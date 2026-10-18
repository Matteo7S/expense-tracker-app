import { apiClient } from './api';
import { networkManager } from './networkManager';
import { getQwenEnabled } from './ocrPreferences';
import type { ExtractedData } from '../components/DataVerificationModal';

export interface OnlineReceiptAnalysis {
  provider: 'qwen'; text: string;
  fields: ExtractedData & { merchantAddress?: string; merchantVat?: string };
}

export async function analyzeReceiptOnline(
  imageUri: string, signal: AbortSignal, userId?: string | null, onStart?: () => void,
): Promise<OnlineReceiptAnalysis | null> {
  if (!networkManager.isOnline() || signal.aborted) return null;
  if (!await getQwenEnabled(userId) || signal.aborted || !networkManager.isOnline()) return null;
  const form = new FormData();
  form.append('receipt', { uri: imageUri, type: 'image/jpeg', name: 'receipt.jpg' } as any);
  form.append('provider', 'qwen');
  try {
    onStart?.();
    const response = await apiClient.uploadFile<{ success: boolean; data?: OnlineReceiptAnalysis }>(
      '/expenses/analyze-receipt', form, undefined, { timeout: 45000, signal });
    if (!signal.aborted && response.success && response.data?.provider === 'qwen' &&
        response.data.fields && typeof response.data.fields === 'object' && !Array.isArray(response.data.fields)) {
      const fields = response.data.fields;
      const hasAmount = typeof fields.amount === 'number' && Number.isFinite(fields.amount) && fields.amount >= 0;
      const hasMerchant = typeof fields.merchantName === 'string' && fields.merchantName.trim().length > 0;
      const hasDate = typeof fields.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fields.date);
      if (!hasAmount && !hasMerchant && !hasDate) return null;
      return { ...response.data, fields: { ...response.data.fields, analysisProvider: 'qwen', confidence: {} } };
    }
  } catch {
    // Offline, timeout, unavailable Qwen and old servers all fall back to on-device OCR.
  }
  return null;
}
