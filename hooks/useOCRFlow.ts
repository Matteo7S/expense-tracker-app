/**
 * Hook per gestire il flusso OCR con integrazione offline-first
 */

import { useState, useCallback } from 'react';
import { databaseManager } from '../services/database';
import { ocrService, OCRResult } from '../services/ocrService';
import * as FileSystem from 'expo-file-system/legacy';
import { syncManager } from '../services/syncManager';

export interface OCRFlowState {
  isProcessing: boolean;
  isUploading: boolean;
  result?: OCRResult;
  error?: string;
  localImagePath?: string;
  localExpenseId?: string;
}

export function useOCRFlow() {
  const [state, setState] = useState<OCRFlowState>({
    isProcessing: false,
    isUploading: false
  });

  /**
   * Processa un'immagine con OCR e salva localmente
   */
  const processImage = useCallback(async (
    imagePath: string, 
    expenseReportId: string
  ): Promise<void> => {
    setState(prev => ({ ...prev, isProcessing: true, error: undefined }));

    try {
      console.log('🔍 Starting OCR processing for image:', imagePath);
      
      // Salva l'immagine in una directory permanente
      const imageFileName = `receipt_${Date.now()}.jpg`;
      const permanentImagePath = `${FileSystem.documentDirectory}${imageFileName}`;
      
      // Usa l'API legacy per evitare problemi di permessi
      await FileSystem.copyAsync({
        from: imagePath,
        to: permanentImagePath
      });
      console.log('💾 Image saved to:', permanentImagePath);

      // Esegui OCR sull'immagine
      const ocrResult = await ocrService.processImage(imagePath);
      console.log('🔍 OCR processing completed');

      // Crea spesa locale con dati OCR
      const expenseId = await databaseManager.createExpense({
        expense_report_id: expenseReportId,
        amount: ocrResult.amount || 0,
        currency: ocrResult.currency || 'EUR',
        merchant_name: ocrResult.merchantName || '',
        merchant_address: ocrResult.merchantAddress || '',
        merchant_vat: ocrResult.merchantVat || '',
        category: ocrResult.category || 'Other',
        receipt_date: ocrResult.date?.value || new Date().toISOString().split('T')[0],
        receipt_time: ocrResult.time?.value || new Date().toTimeString().split(' ')[0],
        receipt_image_path: permanentImagePath,
        receipt_image_url: undefined, // Sarà impostato durante la sincronizzazione
        receipt_thumbnail_url: undefined, // Sarà impostato durante la sincronizzazione
        extracted_data: JSON.stringify({
          rawOCRData: ocrResult,
          processingTimestamp: new Date().toISOString()
        }),
        notes: '',
        sync_status: 'pending',
        is_archived: false
      });

      console.log('💾 Expense saved locally with ID:', expenseId);

      setState(prev => ({
        ...prev,
        isProcessing: false,
        result: ocrResult,
        localImagePath: permanentImagePath,
        localExpenseId: expenseId
      }));

      // Avvia sincronizzazione in background se online
      syncManager.syncAll().catch(console.error);

    } catch (error) {
      console.error('❌ OCR processing failed:', error);
      setState(prev => ({
        ...prev,
        isProcessing: false,
        error: error instanceof Error ? error.message : String(error)
      }));
    }
  }, []);

  /**
   * Aggiorna i dati della spesa locale
   */
  const updateExpense = useCallback(async (
    expenseId: string,
    updates: Partial<{
      amount: number;
      currency: string;
      merchant_name: string;
      merchant_address: string;
      merchant_vat: string;
      category: string;
      receipt_date: string;
      receipt_time: string;
      notes: string;
    }>
  ): Promise<void> => {
    try {
      console.log('📝 Updating expense:', expenseId, updates);
      
      await databaseManager.updateExpense(expenseId, {
        ...updates,
        sync_status: 'pending',
        updated_at: new Date().toISOString()
      });

      console.log('✅ Expense updated locally');

      // Avvia sincronizzazione in background se online
      syncManager.syncAll().catch(console.error);

    } catch (error) {
      console.error('❌ Failed to update expense:', error);
      throw error;
    }
  }, []);

  /**
   * Forza l'upload immediato
   */
  const forceSync = useCallback(async (): Promise<void> => {
    setState(prev => ({ ...prev, isUploading: true }));

    try {
      await syncManager.forceSyncNow();
      console.log('✅ Force sync completed');
    } catch (error) {
      console.error('❌ Force sync failed:', error);
      throw error;
    } finally {
      setState(prev => ({ ...prev, isUploading: false }));
    }
  }, []);

  /**
   * Reset dello stato
   */
  const reset = useCallback(() => {
    setState({
      isProcessing: false,
      isUploading: false
    });
  }, []);

  return {
    state,
    processImage,
    updateExpense,
    forceSync,
    reset
  };
}
