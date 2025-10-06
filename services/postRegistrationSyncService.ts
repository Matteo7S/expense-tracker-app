/**
 * Post-Registration Sync Service
 * 
 * Gestisce il sync immediato dopo la registrazione:
 * 1. Crea nota spesa default locale
 * 2. Avvia sync immediato con server
 * 3. Gestisce errori e retry
 * 4. Mostra feedback all'utente
 */

import { databaseManager } from './database';
import { syncManager } from './syncManager';
import { networkManager } from './networkManager';
import { receiptService } from './receiptService';
import { triggerExpenseRefresh } from '../hooks/useExpenseRefresh';
import { User } from '../types';

export interface PostRegistrationSyncOptions {
  defaultReportName?: string;
  defaultReportDescription?: string;
  skipIfOffline?: boolean;
  showProgress?: boolean;
}

export interface PostRegistrationSyncResult {
  success: boolean;
  defaultReportId?: string;
  synced: boolean;
  error?: string;
  syncStats: {
    reportsCreated: number;
    syncTime?: number;
  };
}

export interface PostRegistrationSyncProgress {
  step: 'creating_local' | 'syncing_server' | 'completed' | 'error';
  message: string;
  progress: number; // 0-100
}

class PostRegistrationSyncService {
  private progressListeners: Array<(progress: PostRegistrationSyncProgress) => void> = [];

  /**
   * Esegue il sync completo post-registrazione
   */
  async performPostRegistrationSync(
    user: User,
    options: PostRegistrationSyncOptions = {}
  ): Promise<PostRegistrationSyncResult> {
    const startTime = Date.now();
    const {
      defaultReportName = 'Nota Spesa Generica',
      defaultReportDescription = 'Nota spese generica con layout predefinito',
      skipIfOffline = false,
      showProgress = true
    } = options;

    console.log('🚀 Starting post-registration sync for user:', user.email);

    try {
      // STEP 0: Verifica se esistono già note spese per questo utente
      const hasExisting = await this.hasExistingReports(user.id);
      if (hasExisting) {
        console.log('✅ User already has existing expense reports, skipping default creation');
        return {
          success: true,
          synced: true, // Considera "synced" perché non c'è bisogno di fare nulla
          syncStats: { reportsCreated: 0 }
        };
      }

      // STEP 1: Verifica connettività (opzionale)
      const isOnline = networkManager.isOnline();
      if (!isOnline && skipIfOffline) {
        console.log('🌐 Offline and skipIfOffline=true, skipping sync');
        return {
          success: true,
          synced: false,
          syncStats: { reportsCreated: 0 }
        };
      }

      // STEP 2: Crea nota spesa default locale
      if (showProgress) {
        this.notifyProgress({
          step: 'creating_local',
          message: 'Creazione nota spese locale...',
          progress: 10
        });
      }

      const defaultReportId = await this.createDefaultExpenseReport(
        user.id,
        defaultReportName,
        defaultReportDescription
      );

      console.log('✅ Default expense report created with ID:', defaultReportId);
      
      // Trigger refresh per aggiornare la UI immediatamente
      console.log('🔄 Triggering expense refresh to update UI...');
      triggerExpenseRefresh();

      // STEP 3: Sync immediato con server (se online)
      let synced = false;
      let syncTime: number | undefined;

      if (isOnline) {
        if (showProgress) {
          this.notifyProgress({
            step: 'syncing_server',
            message: 'Sincronizzazione con server...',
            progress: 50
          });
        }

        synced = await this.syncDefaultReportWithServer(defaultReportId);
        
        if (synced) {
          syncTime = Date.now() - startTime;
          console.log(`✅ Sync completed in ${syncTime}ms`);
          
          // Trigger refresh per aggiornare la UI con i dati del server
          console.log('🔄 Triggering expense refresh after server sync...');
          triggerExpenseRefresh();
        }
      } else {
        console.log('🌐 Offline - sync will be performed later automatically');
      }

      // STEP 4: Completamento
      if (showProgress) {
        this.notifyProgress({
          step: 'completed',
          message: synced ? 'Sincronizzazione completata!' : 'Setup completato (sync in sospeso)',
          progress: 100
        });
      }

      const result: PostRegistrationSyncResult = {
        success: true,
        defaultReportId,
        synced,
        syncStats: {
          reportsCreated: 1,
          syncTime
        }
      };

      console.log('🎉 Post-registration sync completed:', result);
      return result;

    } catch (error) {
      console.error('❌ Post-registration sync failed:', error);
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      if (showProgress) {
        this.notifyProgress({
          step: 'error',
          message: `Errore: ${errorMessage}`,
          progress: 0
        });
      }

      return {
        success: false,
        synced: false,
        error: errorMessage,
        syncStats: { reportsCreated: 0 }
      };
    }
  }

  /**
   * Crea la nota spesa default nel database locale usando la funzione dedicata
   */
  private async createDefaultExpenseReport(
    userId: string,
    name: string,
    description: string
  ): Promise<string> {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📝 [POST-REG] Creating generic expense report...');
    console.log('👤 [POST-REG] User ID:', userId);
    console.log('📋 [POST-REG] Report name:', name);
    console.log('📋 [POST-REG] Report description:', description);
    
    // Usa la funzione specifica che crea "Nota Spesa Generica" con il layout corretto
    console.log('🔍 [POST-REG] Calling getOrCreateGenericExpenseReport...');
    const genericReportId = await databaseManager.getOrCreateGenericExpenseReport();
    console.log('✅ [POST-REG] Generic expense report created/retrieved');
    console.log('🆔 [POST-REG] Local report ID:', genericReportId);

    // Recupera l'oggetto completo dal database
    console.log('🔍 [POST-REG] Retrieving report details from database...');
    const genericReport = await databaseManager.getExpenseReportById(genericReportId);
    if (!genericReport) {
      console.error('❌ [POST-REG] Failed to retrieve generic expense report!');
      throw new Error('Failed to retrieve generic expense report');
    }
    
    console.log('📊 [POST-REG] Report details before update:', {
      id: genericReport.id,
      title: genericReport.title,
      sync_status: genericReport.sync_status,
      server_id: genericReport.server_id,
      user_id: genericReport.user_id
    });

    // Aggiorna il sync_status a 'pending' e user_id senza aggiungere alla coda
    // (l'update automaticamente aggiunge alla coda via updateExpenseReport)
    console.log('💾 [POST-REG] Updating report with user_id and pending status...');
    await databaseManager.updateExpenseReport(genericReportId, {
      sync_status: 'pending',
      user_id: userId // Associa all'utente corrente
    });
    
    console.log('✅ [POST-REG] Updated generic report with user_id and pending status');
    
    // Verifica lo stato dopo l'update
    const updatedReport = await databaseManager.getExpenseReportById(genericReportId);
    console.log('📊 [POST-REG] Report details after update:', {
      id: updatedReport?.id,
      sync_status: updatedReport?.sync_status,
      server_id: updatedReport?.server_id,
      user_id: updatedReport?.user_id
    });
    
    console.log('📤 [POST-REG] Report added to sync queue');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    return genericReportId;
  }

  /**
   * Sincronizza la nota spesa default con il server
   */
  private async syncDefaultReportWithServer(localReportId: string): Promise<boolean> {
    try {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🔄 [POST-REG SYNC] Starting immediate sync for default report...');
      console.log('🆔 [POST-REG SYNC] Local report ID:', localReportId);
      
      // Verifica stato iniziale
      let report = await databaseManager.getExpenseReportById(localReportId);
      console.log('📊 [POST-REG SYNC] Initial report state:', {
        id: report?.id,
        title: report?.title,
        sync_status: report?.sync_status,
        server_id: report?.server_id,
        user_id: report?.user_id
      });
      
      // Forza sync immediato
      console.log('🚀 [POST-REG SYNC] Triggering forceSyncNow...');
      await syncManager.forceSyncNow();
      console.log('✅ [POST-REG SYNC] forceSyncNow completed');
      
      // Attendi un momento per il completamento asincrono
      console.log('⏳ [POST-REG SYNC] Waiting 1 second for async completion...');
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Verifica stato dopo sync con retry
      let syncCompleted = false;
      let maxRetries = 5;
      let retryCount = 0;
      
      console.log('🔍 [POST-REG SYNC] Starting verification with retry logic...');
      
      while (!syncCompleted && retryCount < maxRetries) {
        report = await databaseManager.getExpenseReportById(localReportId);
        
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        console.log(`🔍 [POST-REG SYNC] Checking sync status (attempt ${retryCount + 1}/${maxRetries})`);
        console.log('📊 [POST-REG SYNC] Current state:', {
          local_id: report?.id,
          sync_status: report?.sync_status,
          server_id: report?.server_id,
          last_sync: report?.last_sync
        });
        
        if (report && report.sync_status === 'synced' && report.server_id) {
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          console.log('✅ [POST-REG SYNC] SUCCESS! Report synced with server');
          console.log('🆔 [POST-REG SYNC] Local ID:', report.id);
          console.log('🌐 [POST-REG SYNC] Server ID:', report.server_id);
          console.log('⏰ [POST-REG SYNC] Last sync:', report.last_sync);
          console.log('📊 [POST-REG SYNC] Final report state:', {
            id: report.id,
            title: report.title,
            server_id: report.server_id,
            sync_status: report.sync_status,
            user_id: report.user_id
          });
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          syncCompleted = true;
          return true;
        }
        
        // Se non è ancora sincronizzato, attendi e riprova
        if (retryCount < maxRetries - 1) {
          console.log(`⏳ [POST-REG SYNC] Sync not complete yet, waiting 2 seconds before retry...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
        retryCount++;
      }
      
      // Se arriviamo qui, il sync non è completato nei tentativi
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('⚠️ [POST-REG SYNC] Report sync incomplete after retries');
      console.log('📌 [POST-REG SYNC] Sync will be processed automatically later');
      
      // Controlliamo se almeno è in coda di sync
      const syncQueue = await databaseManager.getSyncQueue();
      const isInQueue = syncQueue.some(item => 
        item.table_name === 'expense_reports' && 
        item.record_id === localReportId
      );
      
      console.log('📊 [POST-REG SYNC] Sync queue status:', {
        totalItems: syncQueue.length,
        reportInQueue: isInQueue
      });
      
      console.log('📋 [POST-REG SYNC] Queue items:');
      syncQueue.forEach((item, index) => {
        console.log(`  ${index + 1}. ${item.action} ${item.table_name}:${item.record_id} (attempts: ${item.attempts})`);
      });
      
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      return false;
      
    } catch (error) {
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.error('❌ [POST-REG SYNC] Failed to sync default report immediately!');
      console.error('❌ [POST-REG SYNC] Error:', error);
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      return false;
    }
  }

  /**
   * Verifica se esistono già note spese nel database locale
   * (per evitare duplicati con la nota spesa generica esistente)
   */
  async hasExistingReports(userId: string): Promise<boolean> {
    try {
      const reports = await databaseManager.getExpenseReports();
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`🔍 [POST-REG] Checking existing reports: found ${reports.length} reports`);
      
      if (reports.length > 0) {
        console.log(`📋 [POST-REG] Existing reports details:`);
        reports.forEach((report, index) => {
          console.log(`  ${index + 1}. ID: ${report.id}`);
          console.log(`     Title: ${report.title}`);
          console.log(`     User ID: ${report.user_id || 'null'}`);
          console.log(`     Server ID: ${report.server_id || 'null'}`);
          console.log(`     Sync Status: ${report.sync_status}`);
        });
        
        // Verifica se c'è già una nota spesa per questo utente
        const userReports = reports.filter(r => r.user_id === userId);
        console.log(`👤 [POST-REG] Reports for current user (${userId}): ${userReports.length}`);
        
        if (userReports.length > 0) {
          console.log(`✅ [POST-REG] User already has expense reports, skipping creation`);
        } else {
          console.log(`⚠️ [POST-REG] Reports exist but belong to different users!`);
          console.log(`⚠️ [POST-REG] This might indicate a database cleanup is needed`);
          console.log(`⚠️ [POST-REG] Skipping creation anyway to avoid duplicates`);
        }
      }
      
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      
      // Filtra solo le note spese dell'utente corrente
      const userReports = reports.filter(r => r.user_id === userId);
      
      if (userReports.length > 0) {
        console.log(`✅ [POST-REG] User has ${userReports.length} existing reports`);
        return true;
      } else if (reports.length > 0) {
        console.log(`⚠️ [POST-REG] Found ${reports.length} reports but none belong to current user`);
        console.log(`👉 [POST-REG] Will create new expense report for this user`);
        return false;
      }
      
      console.log(`🆕 [POST-REG] No reports found, will create generic report`);
      return false;
    } catch (error) {
      console.error('Error checking existing reports:', error);
      return false;
    }
  }

  /**
   * Crea multiple note spese (per casi avanzati)
   */
  async createMultipleDefaultReports(
    user: User,
    reportTemplates: Array<{ name: string; description: string }>
  ): Promise<PostRegistrationSyncResult> {
    const startTime = Date.now();
    
    try {
      this.notifyProgress({
        step: 'creating_local',
        message: `Creazione ${reportTemplates.length} note spese...`,
        progress: 10
      });

      const createdReports: string[] = [];
      
      for (const template of reportTemplates) {
        const reportId = await this.createDefaultExpenseReport(
          user.id,
          template.name,
          template.description
        );
        createdReports.push(reportId);
      }

      // Sync se online
      let synced = false;
      if (networkManager.isOnline()) {
        this.notifyProgress({
          step: 'syncing_server',
          message: 'Sincronizzazione note spese...',
          progress: 50
        });

        await syncManager.forceSyncNow();
        synced = true;
      }

      this.notifyProgress({
        step: 'completed',
        message: `${reportTemplates.length} note spese create!`,
        progress: 100
      });

      return {
        success: true,
        defaultReportId: createdReports[0], // Prima come default
        synced,
        syncStats: {
          reportsCreated: createdReports.length,
          syncTime: Date.now() - startTime
        }
      };

    } catch (error) {
      console.error('Failed to create multiple default reports:', error);
      
      this.notifyProgress({
        step: 'error',
        message: `Errore nella creazione: ${error}`,
        progress: 0
      });

      return {
        success: false,
        synced: false,
        error: error instanceof Error ? error.message : String(error),
        syncStats: { reportsCreated: 0 }
      };
    }
  }

  /**
   * Registra listener per progress updates
   */
  addProgressListener(listener: (progress: PostRegistrationSyncProgress) => void): () => void {
    this.progressListeners.push(listener);
    
    return () => {
      const index = this.progressListeners.indexOf(listener);
      if (index > -1) {
        this.progressListeners.splice(index, 1);
      }
    };
  }

  /**
   * Notifica progress a tutti i listeners
   */
  private notifyProgress(progress: PostRegistrationSyncProgress): void {
    console.log(`📊 Post-registration progress: ${progress.step} - ${progress.message} (${progress.progress}%)`);
    
    this.progressListeners.forEach(listener => {
      try {
        listener(progress);
      } catch (error) {
        console.error('Error in progress listener:', error);
      }
    });
  }

  /**
   * Ottiene i template predefiniti per le note spese
   */
  getDefaultReportTemplates(): Array<{ name: string; description: string }> {
    return [
      {
        name: 'Nota Spesa Generica',
        description: 'Nota spese generica con layout predefinito'
      },
      {
        name: 'Viaggi di Lavoro',
        description: 'Spese per viaggi di lavoro e trasferte'
      },
      {
        name: 'Rimborsi Clienti',
        description: 'Spese anticipate per conto di clienti'
      }
    ];
  }
}

export const postRegistrationSyncService = new PostRegistrationSyncService();

/**
 * Hook React per il progress del sync post-registrazione
 */
import { useEffect, useState } from 'react';

export function usePostRegistrationSyncProgress(): PostRegistrationSyncProgress | null {
  const [progress, setProgress] = useState<PostRegistrationSyncProgress | null>(null);

  useEffect(() => {
    const unsubscribe = postRegistrationSyncService.addProgressListener(setProgress);
    return unsubscribe;
  }, []);

  return progress;
}
