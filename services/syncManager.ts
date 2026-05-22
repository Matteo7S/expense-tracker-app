/**
 * Sync Manager
 * 
 * Sistema di sincronizzazione offline-first che:
 * - Sincronizza automaticamente quando è disponibile la connessione
 * - Gestisce la coda di sincronizzazione
 * - Risolve i conflitti
 * - Lavora in background
 */

import { databaseManager, ExpenseReport, Expense, SyncQueueItem } from './database';
import { networkManager } from './networkManager';
import { receiptService } from './receiptService';
import { useEffect, useState } from 'react';
import * as FileSystem from 'expo-file-system/legacy';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { resolveReceiptPath, toRelativeReceiptPath } from '../utils/receiptPath';

// Server requires HH:MM. Legacy records may have HH:MM:SS; normalize.
function normalizeReceiptTime(raw: string | null | undefined, fallback = '00:00'): string {
  if (!raw) return fallback;
  const m = /^(\d{1,2}):(\d{2})/.exec(raw);
  if (!m) return fallback;
  const hh = m[1].padStart(2, '0');
  return `${hh}:${m[2]}`;
}

export interface SyncStats {
  pendingSync: number;
  lastSync?: string;
  isRunning: boolean;
  errors: number;
}

export interface SyncRunResult {
  syncedCount: number;
  errorCount: number;
  pendingSync: number;
  failedCount: number;
  lastError?: string;
}

class SyncManager {
  private isRunning = false;
  private currentSyncPromise: Promise<SyncRunResult> | null = null;
  private hasRequeued = false;
  private syncIntervalId: NodeJS.Timeout | null = null;
  private listeners: ((stats: SyncStats) => void)[] = [];
  private stats: SyncStats = {
    pendingSync: 0,
    isRunning: false,
    errors: 0
  };

  async initialize(): Promise<void> {
    console.log('🔄 Initializing Sync Manager...');

    // Ascolta i cambiamenti di rete per avviare sync
    networkManager.addListener((networkState) => {
      if (networkState.isConnected && networkState.isInternetReachable) {
        this.startPeriodicSync();

        // Forza un sync immediato quando torna online (utile per post-registrazione)
        setTimeout(async () => {
          const queue = await databaseManager.getSyncQueue();
          if (queue.length > 0) {
            console.log('🚀 Network available, sync queue has items, triggering immediate sync');
            this.syncAll();
          }
        }, 500); // Breve delay per stabilizzare la connessione

      } else {
        this.stopPeriodicSync();
      }
    });

    // Carica stats iniziali
    await this.updateStats();

    console.log('✅ Sync Manager initialized');
  }

  /**
   * Avvia sincronizzazione periodica in background
   */
  private startPeriodicSync(): void {
    if (this.syncIntervalId) {
      clearInterval(this.syncIntervalId);
    }

    // Prima sincronizzazione immediata
    this.syncAll();

    // Poi ogni 30 secondi, ma solo se ci sono elementi da sincronizzare
    this.syncIntervalId = setInterval(async () => {
      const queue = await databaseManager.getSyncQueue();
      if (queue.length > 0) {
        this.syncAll();
      }
    }, 30000);
  }

  /**
   * Ferma sincronizzazione periodica
   */
  private stopPeriodicSync(): void {
    if (this.syncIntervalId) {
      clearInterval(this.syncIntervalId);
      this.syncIntervalId = null;
    }
  }

  /**
   * Re-enqueue expenses that have sync_status pending/error, no server_id,
   * and are not already in the sync queue (orphaned after failed attempts).
   */
  private async requeueOrphanedExpenses(): Promise<void> {
    try {
      const orphaned = await databaseManager.getOrphanedUnsyncedExpenses();

      for (const expense of orphaned) {
        console.log('🔄 Re-queuing orphaned expense:', expense.id, expense.merchant_name, 'prev_status:', expense.sync_status);
        // Reset status so it flows normally through the queue; if it fails again it'll hit 5 attempts and be marked failed.
        if (expense.sync_status === 'failed') {
          await databaseManager.updateRecordSyncStatus('expenses', expense.id, 'pending');
        }
        await databaseManager.addToSyncQueue({
          table_name: 'expenses',
          record_id: expense.id,
          action: 'create',
          data: expense
        });
      }

      if (orphaned.length > 0) {
        console.log(`🔄 Re-queued ${orphaned.length} orphaned expenses`);
      }
    } catch (e) {
      console.error('❌ Failed to requeue orphaned expenses:', e);
    }
  }

  /**
   * Sincronizza tutto nella coda
   */
  async syncAll(): Promise<SyncRunResult> {
    if (this.currentSyncPromise) {
      console.log('🔄 Sync already running, waiting for current run...');
      return this.currentSyncPromise;
    }

    this.currentSyncPromise = this.executeSyncAll();
    try {
      return await this.currentSyncPromise;
    } finally {
      this.currentSyncPromise = null;
    }
  }

  private async executeSyncAll(): Promise<SyncRunResult> {
    let result: SyncRunResult = {
      syncedCount: 0,
      errorCount: 0,
      pendingSync: this.stats.pendingSync,
      failedCount: this.stats.errors
    };

    if (!networkManager.isOnline()) {
      console.log('🌐 No internet connection, sync skipped');
      this.isRunning = false;
      this.stats.isRunning = false;
      await this.updateStats();
      this.notifyListeners();
      return {
        ...result,
        pendingSync: this.stats.pendingSync,
        failedCount: this.stats.errors
      };
    }

    this.isRunning = true;
    this.stats.isRunning = true;
    this.notifyListeners();

    try {
      console.log('🔄 Starting sync process...');

      // Re-enqueue orphaned expenses once per app session
      if (!this.hasRequeued) {
        this.hasRequeued = true;
        await this.requeueOrphanedExpenses();
      }

      // Prima pulisci i duplicati dalla coda
      await databaseManager.cleanupSyncQueueDuplicates();

      const queue = await databaseManager.getSyncQueue();
      console.log(`📊 Found ${queue.length} items to sync`);

      if (queue.length === 0) {
        console.log('✅ Sync queue is empty - stopping sync indicator');
        this.isRunning = false;
        this.stats.isRunning = false;
        await this.updateStats();
        this.notifyListeners();
        return {
          syncedCount: 0,
          errorCount: 0,
          pendingSync: this.stats.pendingSync,
          failedCount: this.stats.errors
        };
      }

      // Ordina la coda: prima expense_reports, poi expenses
      // Questo assicura che i parent report vengano sincronizzati prima delle spese
      const sortedQueue = queue.sort((a, b) => {
        const orderMap = { 'expense_reports': 0, 'expenses': 1 };
        const orderA = orderMap[a.table_name as keyof typeof orderMap] ?? 999;
        const orderB = orderMap[b.table_name as keyof typeof orderMap] ?? 999;
        return orderA - orderB;
      });

      console.log('📋 Processing sync queue in order:', sortedQueue.map(item => `${item.action} ${item.table_name}:${item.record_id}`).join(', '));

      let syncedCount = 0;
      let errorCount = 0;
      let lastError: string | undefined;

      for (const item of sortedQueue) {
        try {
          await this.syncItem(item);
          await databaseManager.removeSyncQueueItem(item.id);
          syncedCount++;
          console.log(`✅ Synced item ${item.id}`);
        } catch (error) {
          console.error(`❌ Failed to sync item ${item.id}:`, error);
          errorCount++;
          lastError = error instanceof Error ? error.message : String(error);

          // Incrementa tentativi
          const newAttempts = item.attempts + 1;
          await databaseManager.updateSyncQueueItem(
            item.id,
            newAttempts,
            lastError
          );

          // Rimuovi item dopo 5 tentativi falliti e segna come failed
          if (newAttempts >= 5) {
            console.log(`❌ Removing item ${item.id} after ${newAttempts} failed attempts`);
            await databaseManager.removeSyncQueueItem(item.id);
            // Mark the record as permanently failed so requeueOrphanedExpenses won't re-add it
            if (item.table_name === 'expense_reports' || item.table_name === 'expenses') {
              await databaseManager.updateRecordSyncStatus(item.table_name, item.record_id, 'failed');
            }
          } else if (item.table_name === 'expense_reports' || item.table_name === 'expenses') {
            await databaseManager.updateRecordSyncStatus(item.table_name, item.record_id, 'error');
          }
        }
      }

      console.log(`🔄 Sync completed: ${syncedCount} synced, ${errorCount} errors`);
      this.stats.errors = errorCount;
      if (syncedCount > 0) {
        this.stats.lastSync = new Date().toISOString();
      }

      result = {
        syncedCount,
        errorCount,
        pendingSync: this.stats.pendingSync,
        failedCount: this.stats.errors,
        lastError
      };

    } catch (error) {
      console.error('❌ Sync process failed:', error);
      this.stats.errors++;
      result = {
        syncedCount: 0,
        errorCount: 1,
        pendingSync: this.stats.pendingSync,
        failedCount: this.stats.errors,
        lastError: error instanceof Error ? error.message : String(error)
      };
    } finally {
      this.isRunning = false;
      this.stats.isRunning = false;
      await this.updateStats();
      result.pendingSync = this.stats.pendingSync;
      result.failedCount = this.stats.errors;
      this.notifyListeners();
    }

    return result;
  }

  /**
   * Sincronizza un singolo elemento
   */
  private async syncItem(item: SyncQueueItem): Promise<void> {
    const data = JSON.parse(item.data);

    switch (item.table_name) {
      case 'expense_reports':
        await this.syncExpenseReport(item, data);
        break;
      case 'expenses':
        await this.syncExpense(item, data);
        break;
      default:
        throw new Error(`Unknown table: ${item.table_name}`);
    }
  }

  /**
   * Sincronizza una expense report
   */
  private async syncExpenseReport(item: SyncQueueItem, report: ExpenseReport): Promise<void> {
    console.log('🔄 Syncing expense report:', {
      action: item.action,
      localId: report.id,
      serverId: report.server_id,
      title: report.title
    });

    switch (item.action) {
      case 'create':
        console.log('🆕 Creating expense report on server:', {
          title: report.title,
          description: report.description,
          start_date: report.start_date,
          end_date: report.end_date
        });

        const createResult = await receiptService.createExpenseReport({
          title: report.title,  // L'API ora accetta 'title'
          description: report.description,
          start_date: report.start_date,
          end_date: report.end_date
        });

        if (createResult.success) {
          console.log('✅ Expense report created on server:', {
            localId: report.id,
            serverId: createResult.data?.id
          });

          console.log('💾 [SYNC] Updating local database with server_id...');
          console.log('📊 [SYNC] Update details:', {
            localId: report.id,
            serverId: createResult.data?.id,
            syncStatus: 'synced',
            timestamp: new Date().toISOString()
          });

          // Aggiorna con server ID senza aggiungere alla coda di sync
          await this.updateExpenseReportLocally(report.id, {
            server_id: createResult.data?.id,
            sync_status: 'synced',
            last_sync: new Date().toISOString()
          });

          console.log('✅ [SYNC] Local database updated successfully with server_id');

          // Verifica l'update
          const updatedReport = await databaseManager.getExpenseReportById(report.id);
          console.log('🔍 [SYNC] Verification - Report state after update:', {
            localId: updatedReport?.id,
            serverId: updatedReport?.server_id,
            syncStatus: updatedReport?.sync_status,
            lastSync: updatedReport?.last_sync
          });

          if (updatedReport?.server_id === createResult.data?.id) {
            console.log('✅ [SYNC] Server ID successfully saved in local database!');
          } else {
            console.error('⚠️ [SYNC] Server ID mismatch or not saved correctly!');
          }
        } else {
          console.error('❌ Failed to create expense report on server:', createResult.error);
          throw new Error(createResult.error);
        }
        break;

      case 'update':
        if (!report.server_id) {
          throw new Error('Cannot update report without server ID');
        }

        const updateResult = await receiptService.updateExpenseReport(report.server_id, {
          title: report.title,
          description: report.description,
          archived: report.is_archived // Server usa 'archived' non 'is_archived'
        });

        if (updateResult.success) {
          await databaseManager.updateExpenseReport(report.id, {
            sync_status: 'synced',
            last_sync: new Date().toISOString()
          });
        } else {
          throw new Error(updateResult.error);
        }
        break;

      case 'delete':
        if (!report.server_id) {
          console.log('Skipping delete for report without server ID');
          return;
        }

        const deleteResult = await receiptService.deleteExpenseReport(report.server_id);
        if (!deleteResult.success) {
          throw new Error(deleteResult.error);
        }
        break;
    }
  }

  /**
   * Sincronizza una spesa
   */
  private async syncExpense(item: SyncQueueItem, expense: Expense): Promise<void> {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔄 [SYNC EXPENSE] Starting expense sync');
    console.log('📋 [SYNC EXPENSE] Expense ID:', expense.id);
    console.log('📋 [SYNC EXPENSE] Parent Report ID (local):', expense.expense_report_id);
    console.log('📋 [SYNC EXPENSE] Amount:', expense.amount);
    console.log('📋 [SYNC EXPENSE] Category:', expense.category);
    console.log('📋 [SYNC EXPENSE] Sync action:', item.action);
    console.log('📋 [SYNC EXPENSE] Attempts:', item.attempts);

    // Prima assicuriamoci che la expense report parent sia sincronizzata
    console.log('👨‍👧 [SYNC EXPENSE] Checking parent report...');
    const parentReport = await databaseManager.getExpenseReportById(expense.expense_report_id);

    console.log('👨‍👧 [SYNC EXPENSE] Parent report details:', {
      found: !!parentReport,
      id: parentReport?.id,
      server_id: parentReport?.server_id,
      title: parentReport?.title,
      sync_status: parentReport?.sync_status
    });

    if (!parentReport) {
      console.error('❌ [SYNC EXPENSE] Parent report NOT FOUND!');
      throw new Error('Parent expense report not found');
    }

    if (!parentReport?.server_id) {
      console.error('❌ [SYNC EXPENSE] Parent report has NO server_id!');
      console.error('❌ [SYNC EXPENSE] Cannot sync expense without parent server_id');
      throw new Error('Parent expense report not synced yet');
    }

    console.log('✅ [SYNC EXPENSE] Parent report is synced with server_id:', parentReport.server_id);

    switch (item.action) {
      case 'create':
        console.log('➕ [SYNC EXPENSE] Action: CREATE');
        console.log('📤 [SYNC EXPENSE] Preparing data for server...');

        const expenseDataForServer = {
          amount: expense.amount,
          currency: expense.currency,
          merchantName: expense.merchant_name,
          merchantAddress: expense.merchant_address,
          merchantVat: expense.merchant_vat,
          merchantLocation: expense.merchant_location,
          merchantLocationSource: expense.merchant_location_source,
          category: expense.category || 'other',
          receiptDate: expense.receipt_date,
          receiptTime: normalizeReceiptTime(expense.receipt_time),
          extractedData: expense.extracted_data ? JSON.parse(expense.extracted_data) : undefined,
          notes: expense.notes,
          kilometers: expense.kilometers,
          fuelLiters: expense.fuel_liters,
          fuelType: expense.fuel_type
        };

        console.log('📤 [SYNC EXPENSE] Data to send:', JSON.stringify(expenseDataForServer, null, 2));
        console.log('📤 [SYNC EXPENSE] Using parent server_id:', parentReport.server_id);
        console.log('📷 [SYNC EXPENSE] Receipt image path:', expense.receipt_image_path || 'none');

        // Resolve relative path to absolute and check if file exists
        let imagePath = resolveReceiptPath(expense.receipt_image_path) || undefined;
        if (imagePath) {
          const fileInfo = await FileSystem.getInfoAsync(imagePath);
          if (!fileInfo.exists) {
            console.warn('⚠️ [SYNC EXPENSE] Image file no longer exists, syncing without image:', imagePath);
            imagePath = undefined;
          }
        }

        // ✨ Usa una singola chiamata API che gestisce sia i dati che l'immagine
        console.log('🌐 [SYNC EXPENSE] Calling receiptService.createExpenseWithImage...');
        const createResult = await receiptService.createExpenseWithImage(
          parentReport.server_id,
          expenseDataForServer,
          imagePath
        );

        console.log('🌐 [SYNC EXPENSE] Server response:', JSON.stringify(createResult, null, 2));

        if (createResult.success) {
          console.log('✅ [SYNC EXPENSE] Expense created on server successfully');
          console.log('📝 [SYNC EXPENSE] Server expense ID:', createResult.data?.id);

          // Generate local thumbnail and delete full-size image
          let localThumbPath = expense.receipt_image_path;
          if (imagePath) {
            try {
              const thumbResult = await manipulateAsync(
                imagePath,
                [{ resize: { width: 300 } }],
                { compress: 0.7, format: SaveFormat.JPEG }
              );
              const thumbFileName = `thumb_${toRelativeReceiptPath(expense.receipt_image_path || 'receipt.jpg')}`;
              const thumbDest = `${FileSystem.documentDirectory}${thumbFileName}`;
              await FileSystem.moveAsync({ from: thumbResult.uri, to: thumbDest });
              await FileSystem.deleteAsync(imagePath, { idempotent: true });
              localThumbPath = thumbFileName;
              console.log('🖼️ [SYNC EXPENSE] Thumbnail created, original deleted:', thumbFileName);
            } catch (thumbErr) {
              console.warn('⚠️ [SYNC EXPENSE] Thumbnail creation failed, keeping original:', thumbErr);
            }
          }

          console.log('💾 [SYNC EXPENSE] Updating local expense with server data...');
          // Usa updateExpenseLocal per evitare di aggiungere nuovamente alla sync queue
          await databaseManager.updateExpenseLocal(expense.id, {
            server_id: createResult.data?.id,
            receipt_image_url: createResult.data?.receiptImageUrl,
            receipt_thumbnail_url: createResult.data?.receiptThumbnailUrl,
            receipt_image_path: localThumbPath,
            sync_status: 'synced',
            last_sync: new Date().toISOString()
          });
          console.log('✅ [SYNC EXPENSE] Local expense updated with server_id');
        } else {
          console.error('❌ [SYNC EXPENSE] Server returned error:', createResult.error);
          throw new Error(createResult.error);
        }
        console.log('✅ [SYNC EXPENSE] CREATE action completed successfully');
        break;

      case 'update':
        if (!expense.server_id) {
          throw new Error('Cannot update expense without server ID');
        }

        // Upload nuova immagine se cambiata
        let updatedImageUrl = expense.receipt_image_url;
        const resolvedUpdateImagePath = resolveReceiptPath(expense.receipt_image_path);
        if (resolvedUpdateImagePath && !expense.receipt_image_url) {
          const imageResult = await receiptService.uploadReceiptImage(resolvedUpdateImagePath);
          if (imageResult.success) {
            updatedImageUrl = imageResult.data?.url;
          }
        }

        // Only send receiptImageUrl if it's a valid URL (not a bare filename)
        const validImageUrl = updatedImageUrl && /^https?:\/\//.test(updatedImageUrl) ? updatedImageUrl : undefined;

        const updateResult = await receiptService.updateExpense(expense.server_id, {
          amount: expense.amount,
          currency: expense.currency,
          merchantName: expense.merchant_name,
          merchantAddress: expense.merchant_address,
          merchantVat: expense.merchant_vat,
          merchantLocation: expense.merchant_location,
          merchantLocationSource: expense.merchant_location_source,
          category: expense.category,
          receiptDate: expense.receipt_date,
          receiptTime: normalizeReceiptTime(expense.receipt_time),
          receiptImageUrl: validImageUrl,
          extractedData: expense.extracted_data ? JSON.parse(expense.extracted_data) : undefined,
          notes: expense.notes,
          kilometers: expense.kilometers,
          fuelLiters: expense.fuel_liters,
          fuelType: expense.fuel_type,
          archived: expense.is_archived // Server usa 'archived' non 'is_archived'
        });

        if (updateResult.success) {
          // Usa updateExpenseLocal per evitare di aggiungere nuovamente alla sync queue
          await databaseManager.updateExpenseLocal(expense.id, {
            receipt_image_url: updatedImageUrl,
            sync_status: 'synced',
            last_sync: new Date().toISOString()
          });
        } else {
          throw new Error(updateResult.error);
        }
        break;

      case 'delete':
        if (!expense.server_id) {
          console.log('Skipping delete for expense without server ID');
          return;
        }

        const deleteResult = await receiptService.deleteExpense(expense.server_id);
        if (!deleteResult.success) {
          throw new Error(deleteResult.error);
        }
        break;
    }

    console.log('✅ [SYNC EXPENSE] Sync completed successfully');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  }

  /**
   * Aggiorna una expense report localmente senza aggiungere alla coda sync
   */
  private async updateExpenseReportLocally(id: string, updates: Partial<ExpenseReport>): Promise<void> {
    if (!databaseManager) return;

    const now = new Date().toISOString();
    const updatedReport = {
      ...updates,
      updated_at: now
      // NON imposta sync_status a 'pending'
    };

    // Accesso diretto al database bypassando updateExpenseReport che aggiunge alla sync queue
    const db = (databaseManager as any).db;
    if (!db) return;

    const setClause = Object.keys(updatedReport)
      .map(key => `${key} = ?`)
      .join(', ');

    const values = Object.values(updatedReport);
    values.push(id);

    await db.runAsync(
      `UPDATE expense_reports SET ${setClause} WHERE id = ?`,
      values
    );

    console.log(`💾 Local expense report update completed: ${id}`);
  }

  /**
   * Forza una sincronizzazione immediata
   */
  async forceSyncNow(): Promise<SyncRunResult> {
    if (!networkManager.isOnline()) {
      throw new Error('No internet connection available');
    }

    return this.syncAll();
  }

  /**
   * Aggiorna le statistiche
   */
  private async updateStats(): Promise<void> {
    const queue = await databaseManager.getSyncQueue();
    this.stats.pendingSync = queue.length;
    this.stats.errors = await databaseManager.getSyncErrorCount();
  }

  /**
   * Registra listener per aggiornamenti stats
   */
  addStatsListener(listener: (stats: SyncStats) => void): () => void {
    this.listeners.push(listener);

    // Chiama immediatamente con stats correnti
    listener(this.stats);

    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  /**
   * Notifica tutti i listeners
   */
  private notifyListeners(): void {
    this.listeners.forEach(listener => {
      try {
        listener(this.stats);
      } catch (error) {
        console.error('Error in sync stats listener:', error);
      }
    });
  }

  /**
   * Ottiene le statistiche correnti
   */
  getStats(): SyncStats {
    return { ...this.stats };
  }

  /**
   * Pulisce tutte le risorse
   */
  dispose(): void {
    this.stopPeriodicSync();
    this.listeners = [];
  }
}

export const syncManager = new SyncManager();

/**
 * Hook per usare le statistiche di sync nei componenti
 */
export function useSyncStats(): SyncStats {
  const [syncStats, setSyncStats] = useState<SyncStats>(syncManager.getStats());

  useEffect(() => {
    const unsubscribe = syncManager.addStatsListener(setSyncStats);
    return unsubscribe;
  }, []);

  return syncStats;
}
