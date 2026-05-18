export type MerchantLocationSource = 'ocr' | 'history' | 'manual';

export interface MerchantLocationSuggestion {
  location: string;
  source: MerchantLocationSource;
  confidence: number;
}

const COUNTRY_LINES = new Set([
  'ITALIA',
  'ITALY',
  'UNITED KINGDOM',
  'UK',
  'DEUTSCHLAND',
  'GERMANY',
  'FRANCE',
  'FRANCIA',
  'SPAIN',
  'ESPAÑA',
  'SVIZZERA',
  'SWITZERLAND',
]);

const KNOWN_CITY_HINTS = [
  'milano',
  'mantova',
  'roma',
  'bologna',
  'torino',
  'venezia',
  'verona',
  'parma',
  'modena',
  'firenze',
  'napoli',
  'hounslow',
  'cranford',
  'london',
  'londra',
];

function normalizeLine(line: string): string {
  return line
    .replace(/\s+/g, ' ')
    .replace(/[|•]+/g, ' ')
    .trim();
}

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split(/([\s'-])/)
    .map((part) => (/^[a-zà-ÿ]/i.test(part) ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join('')
    .trim();
}

function stripProvinceSuffix(value: string): string {
  return value
    .replace(/\s+\([A-Z]{2}\)$/i, '')
    .replace(/\s+[A-Z]{2}$/i, '')
    .trim();
}

function isNoisyLine(line: string): boolean {
  return /\b(?:tid|mid|stan|auth|rrn|aid|cid|pos|visa|mastercard|card|carta|payment|amount|totale|total|subtotal|vat|iva|p\.?\s*iva|tax|table|covers|device|till|order|qty|price|cash|contactless|approved|signature|receipt|scontrino)\b/i.test(line)
    || /(?:xxxx|a000000|approved\/stan)/i.test(line)
    || /[€£$]\s?\d|\d+[,.]\d{2}/.test(line)
    || /^\+?\d[\d\s\-/.]{6,}$/.test(line);
}

function looksLikeStreetAddress(line: string): boolean {
  return /\b(?:via|viale|corso|piazza|largo|strada|road|street|st\.?|avenue|ave|bath road|unit|building)\b/i.test(line);
}

function cleanCity(value: string): string | null {
  const cleaned = stripProvinceSuffix(
    value
      .replace(/[.,;:]+$/g, '')
      .replace(/\b(?:italia|italy|united kingdom|uk|germany|deutschland)\b/ig, '')
      .replace(/\s+/g, ' ')
      .trim()
  );

  if (cleaned.length < 3 || cleaned.length > 40) {
    return null;
  }

  if (!/[a-zà-ÿ]/i.test(cleaned) || /\d/.test(cleaned)) {
    return null;
  }

  if (isNoisyLine(cleaned) || looksLikeStreetAddress(cleaned)) {
    return null;
  }

  return titleCase(cleaned);
}

function findKnownCity(line: string): string | null {
  const lowerLine = line.toLowerCase();
  const match = KNOWN_CITY_HINTS.find((city) => new RegExp(`\\b${city}\\b`, 'i').test(lowerLine));
  return match ? titleCase(match) : null;
}

function scoreCandidate(line: string, index: number, lines: string[], merchantName?: string): MerchantLocationSuggestion | null {
  if (isNoisyLine(line) || looksLikeStreetAddress(line)) {
    return null;
  }

  const normalizedMerchant = merchantName?.trim().toLowerCase();
  if (normalizedMerchant && line.toLowerCase().includes(normalizedMerchant)) {
    return null;
  }

  const postalMatch = line.match(/\b\d{5}\s+([A-ZÀ-Ü][A-ZÀ-Ü' -]{2,})(?:\s+\(?[A-Z]{2}\)?)?\b/i);
  if (postalMatch) {
    const city = cleanCity(postalMatch[1]);
    if (city) {
      return { location: city, source: 'ocr', confidence: 0.88 };
    }
  }

  const knownCity = findKnownCity(line);
  if (knownCity) {
    return { location: knownCity, source: 'ocr', confidence: 0.78 };
  }

  const countryNearby = [
    lines[index - 1],
    lines[index + 1],
    lines[index + 2],
  ].some((nearby) => nearby && COUNTRY_LINES.has(nearby.toUpperCase()));

  const city = cleanCity(line);
  if (!city) {
    return null;
  }

  if (countryNearby || /^[A-ZÀ-Ü' -]{3,}$/.test(line)) {
    return { location: city, source: 'ocr', confidence: countryNearby ? 0.74 : 0.62 };
  }

  return null;
}

export function extractReceiptLocationCity(
  ocrText: string | undefined,
  options: { merchantName?: string } = {}
): MerchantLocationSuggestion | null {
  if (!ocrText) {
    return null;
  }

  const lines = ocrText
    .split(/\r?\n/)
    .map(normalizeLine)
    .filter(Boolean);

  const candidates = lines
    .map((line, index) => scoreCandidate(line, index, lines, options.merchantName))
    .filter((candidate): candidate is MerchantLocationSuggestion => Boolean(candidate))
    .sort((a, b) => b.confidence - a.confidence);

  return candidates[0] || null;
}
