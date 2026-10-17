import { apiClient } from './api';
import { networkManager } from './networkManager';
import type { ExtractedData } from '../components/DataVerificationModal';

export interface OnlineReceiptAnalysis {
  provider: 'azure'; text: string; confidence: number;
  fields: ExtractedData & { merchantAddress?: string };
}

export async function analyzeReceiptOnline(imageUri: string, signal: AbortSignal): Promise<OnlineReceiptAnalysis | null> {
  if (!networkManager.isOnline() || signal.aborted) return null;
  const form = new FormData();
  form.append('receipt', { uri: imageUri, type: 'image/jpeg', name: 'receipt.jpg' } as any);
  try {
    const response = await apiClient.uploadFile<{ success: boolean; data?: OnlineReceiptAnalysis }>(
      '/expenses/analyze-receipt', form, undefined, { timeout: 45000, signal });
    if (!signal.aborted && response.success && response.data?.provider === 'azure' && response.data.fields) return response.data;
  } catch {
    // Offline, timeout, unavailable Azure and old servers all fall back to on-device OCR.
  }
  return null;
}
