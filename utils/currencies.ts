import catalogue from './currencies.json';

export interface CurrencyOption {
  code: string;
  name: string;
  symbol: string;
  searchText: string;
}

const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

export function getCurrencyOptions(locale: string, selectedCode = ''): CurrencyOption[] {
  const language = locale.split('-')[0] as 'it' | 'en' | 'de';
  const options = catalogue.currencies.map(currency => ({
    code: currency.code,
    name: currency.names[language] || currency.names.en,
    symbol: currency.symbol,
    searchText: normalize([currency.code, currency.symbol, ...Object.values(currency.names)].join(' ')),
  }));
  // Keep historical or newly introduced codes already stored on an expense editable.
  const code = selectedCode.trim().toUpperCase();
  if (/^[A-Z]{3}$/.test(code) && !options.some(option => option.code === code)) {
    options.push({ code, name: code, symbol: code, searchText: normalize(code) });
  }
  return options.sort((a, b) => a.name.localeCompare(b.name, locale) || a.code.localeCompare(b.code));
}

export function searchCurrencies(options: CurrencyOption[], query: string): CurrencyOption[] {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  return options.filter(option => terms.every(term => option.searchText.includes(term)));
}
