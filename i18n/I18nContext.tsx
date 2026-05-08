import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { NativeModules, Platform } from 'react-native';
import {
  defaultLanguage,
  languageLabels,
  SupportedLanguage,
  supportedLanguages,
  translations,
} from './translations';

const LANGUAGE_STORAGE_KEY = 'welfy.language';

type TranslationDictionary = typeof translations[SupportedLanguage];

interface I18nContextValue {
  language: SupportedLanguage;
  languageLabel: string;
  locale: string;
  supportedLanguages: readonly SupportedLanguage[];
  isLanguageLoaded: boolean;
  setLanguage: (language: SupportedLanguage) => Promise<void>;
  t: (key: string, params?: Record<string, string | number>) => string;
  formatCurrency: (amount: number, currency?: string) => string;
  formatDate: (value: Date | string | number, options?: Intl.DateTimeFormatOptions) => string;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
}

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

function isSupportedLanguage(value: string | null | undefined): value is SupportedLanguage {
  return Boolean(value && supportedLanguages.includes(value as SupportedLanguage));
}

function normalizeLanguage(locale: string | null | undefined): SupportedLanguage | null {
  const languageCode = locale?.split(/[-_]/)[0]?.toLowerCase();
  return isSupportedLanguage(languageCode) ? languageCode : null;
}

function getDeviceLanguage(): SupportedLanguage {
  const settings = NativeModules.SettingsManager?.settings;
  const iosLocale = settings?.AppleLocale || settings?.AppleLanguages?.[0];
  const androidLocale = NativeModules.I18nManager?.localeIdentifier;
  const platformLocale = Platform.OS === 'ios' ? iosLocale : androidLocale;

  return normalizeLanguage(platformLocale) || defaultLanguage;
}

function getNestedValue(dictionary: TranslationDictionary, key: string): string | undefined {
  const value = key.split('.').reduce<unknown>((current, part) => {
    if (current && typeof current === 'object' && part in current) {
      return (current as Record<string, unknown>)[part];
    }

    return undefined;
  }, dictionary);

  return typeof value === 'string' ? value : undefined;
}

function interpolate(value: string, params?: Record<string, string | number>) {
  if (!params) {
    return value;
  }

  return Object.entries(params).reduce(
    (message, [param, replacement]) => message.replace(new RegExp(`{{\\s*${param}\\s*}}`, 'g'), String(replacement)),
    value
  );
}

function toLocale(language: SupportedLanguage) {
  switch (language) {
    case 'en':
      return 'en-GB';
    case 'de':
      return 'de-DE';
    case 'it':
    default:
      return 'it-IT';
  }
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<SupportedLanguage>(defaultLanguage);
  const [isLanguageLoaded, setIsLanguageLoaded] = useState(false);

  useEffect(() => {
    let mounted = true;

    const loadLanguage = async () => {
      try {
        const storedLanguage = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
        const nextLanguage = isSupportedLanguage(storedLanguage)
          ? storedLanguage
          : getDeviceLanguage();

        if (mounted) {
          setLanguageState(nextLanguage);
        }
      } finally {
        if (mounted) {
          setIsLanguageLoaded(true);
        }
      }
    };

    loadLanguage();

    return () => {
      mounted = false;
    };
  }, []);

  const setLanguage = useCallback(async (nextLanguage: SupportedLanguage) => {
    await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, nextLanguage);
    setLanguageState(nextLanguage);
  }, []);

  const t = useCallback((key: string, params?: Record<string, string | number>) => {
    const translated = getNestedValue(translations[language], key)
      || getNestedValue(translations[defaultLanguage], key)
      || key;

    return interpolate(translated, params);
  }, [language]);

  const formatCurrency = useCallback((amount: number, currency = 'EUR') => (
    new Intl.NumberFormat(toLocale(language), {
      style: 'currency',
      currency,
    }).format(amount)
  ), [language]);

  const formatDate = useCallback((value: Date | string | number, options?: Intl.DateTimeFormatOptions) => (
    new Intl.DateTimeFormat(toLocale(language), options).format(new Date(value))
  ), [language]);

  const formatNumber = useCallback((value: number, options?: Intl.NumberFormatOptions) => (
    new Intl.NumberFormat(toLocale(language), options).format(value)
  ), [language]);

  const value = useMemo<I18nContextValue>(() => ({
    language,
    languageLabel: languageLabels[language],
    locale: toLocale(language),
    supportedLanguages,
    isLanguageLoaded,
    setLanguage,
    t,
    formatCurrency,
    formatDate,
    formatNumber,
  }), [formatCurrency, formatDate, formatNumber, isLanguageLoaded, language, setLanguage, t]);

  return (
    <I18nContext.Provider value={value}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(I18nContext);

  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider');
  }

  return context;
}
