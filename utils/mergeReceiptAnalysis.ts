import type { ExtractedData } from '../components/DataVerificationModal';

export function mergeReceiptAnalysis(local: ExtractedData, online: ExtractedData): ExtractedData {
  const result = { ...local, confidence: { ...local.confidence } };
  // Only explicit receipt fields override local extraction. Never infer merchant location.
  for (const key of ['amount', 'currency', 'date', 'time', 'merchantName'] as const) {
    const value = online[key];
    if (value !== undefined && value !== null && value !== '') {
      Object.assign(result, { [key]: value });
      const scoreKey = key === 'merchantName' ? 'merchant' : key;
      if (scoreKey !== 'currency') {
        result.confidence[scoreKey] = online.confidence?.[scoreKey];
      }
    }
  }
  return result;
}
