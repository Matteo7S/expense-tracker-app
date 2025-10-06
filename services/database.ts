/**
 * Database Locale SQLite
 * 
 * Sistema offline-first per la gestione di:
 * - Note spese
 * - Spese individuali
 * - Immagini scontrini
 * - Coda di sincronizzazione
 * - Soft delete e archivio
 */

import * as SQLite from 'expo-sqlite';

// Tipi TypeScript per il database
export interface ExpenseReport {
  id: string;
  title: string;
  description?: string;
  start_date?: string; // Data di inizio (ISO string)
  end_date?: string; // Data di fine (ISO string)
  user_id?: string; // ID dell'utente proprietario
  created_at: string;
  updated_at: string;
  is_archived: boolean;
  server_id?: string; // ID sul server remoto
  sync_status: 'pending' | 'synced' | 'error';
  last_sync?: string;
}

export interface Expense {
  id: string;
  expense_report_id: string;
  amount: number;
  currency: string;
  merchant_name?: string;
  merchant_address?: string;
  merchant_vat?: string;
  category?: string;
  receipt_date: string; // Data dello scontrino
  receipt_time?: string; // Ora dello scontrino
  receipt_image_path?: string; // Path locale dell'immagine
  receipt_image_url?: string; // URL remoto dell'immagine originale
  receipt_thumbnail_url?: string; // URL remoto del thumbnail
  extracted_data?: string; // JSON con dati OCR completi
  notes?: string;
  created_at: string;
  updated_at: string;
  is_archived: boolean;
  server_id?: string;
  sync_status: 'pending' | 'synced' | 'error';
  last_sync?: string;
}

export interface SyncQueueItem {
  id: string;
  table_name: string; // 'expense_reports' | 'expenses'
  record_id: string;
  action: 'create' | 'update' | 'delete';
  data: string; // JSON serialized data
  created_at: string;
  attempts: number;
  last_error?: string;
}

class DatabaseManager {
  private db: SQLite.SQLiteDatabase | null = null;
  private currentUserId: string | null = null;
  
  /**
   * Imposta l'utente corrente per filtrare i dati
   */
  setCurrentUserId(userId: string | null): void {
    console.log('👤 [DB] Setting current user ID:', userId);
    this.currentUserId = userId;
  }
  
  /**
   * Ottiene l'utente corrente
   */
  getCurrentUserId(): string | null {
    return this.currentUserId;
  }
  
  async initDatabase(): Promise<void> {
    try {
      console.log('🗄️ Initializing SQLite database...');
      
      this.db = await SQLite.openDatabaseAsync('expense_tracker.db');
      
      await this.createTables();
      await this.runMigrations();
      
      console.log('✅ Database initialized successfully');
    } catch (error) {
      console.error('❌ Database initialization failed:', error);
      throw error;
    }
  }
  
  private async createTables(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    
    // Tabella note spese
    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS expense_reports (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        start_date TEXT,
        end_date TEXT,
        user_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        is_archived INTEGER DEFAULT 0,
        server_id TEXT,
        sync_status TEXT DEFAULT 'pending',
        last_sync TEXT
      );
    `);
    
    // Tabella spese
    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS expenses (
        id TEXT PRIMARY KEY,
        expense_report_id TEXT NOT NULL,
        amount REAL NOT NULL,
        currency TEXT DEFAULT 'EUR',
        merchant_name TEXT,
        merchant_address TEXT,
        merchant_vat TEXT,
        category TEXT,
        receipt_date TEXT NOT NULL,
        receipt_time TEXT,
        receipt_image_path TEXT,
        receipt_image_url TEXT,
        receipt_thumbnail_url TEXT,
        extracted_data TEXT,
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        is_archived INTEGER DEFAULT 0,
        server_id TEXT,
        sync_status TEXT DEFAULT 'pending',
        last_sync TEXT,
        FOREIGN KEY (expense_report_id) REFERENCES expense_reports (id)
      );
    `);
    
    // Coda di sincronizzazione
    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS sync_queue (
        id TEXT PRIMARY KEY,
        table_name TEXT NOT NULL,
        record_id TEXT NOT NULL,
        action TEXT NOT NULL,
        data TEXT NOT NULL,
        created_at TEXT NOT NULL,
        attempts INTEGER DEFAULT 0,
        last_error TEXT
      );
    `);
    
    // Indici per performance
    await this.db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_expenses_report_id ON expenses(expense_report_id);
      CREATE INDEX IF NOT EXISTS idx_expenses_receipt_date ON expenses(receipt_date);
      CREATE INDEX IF NOT EXISTS idx_expenses_archived ON expenses(is_archived);
      CREATE INDEX IF NOT EXISTS idx_reports_archived ON expense_reports(is_archived);
      CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(table_name, action);
    `);
  }
  
  private async runMigrations(): Promise<void> {
    const currentVersion = await this.getDbVersion();
    console.log(`📊 Database version: ${currentVersion}`);
    
    // Migrazione 1: Aggiunta colonna user_id
    if (currentVersion <= 1) {
      console.log('📊 Running migration 1: Adding user_id column to expense_reports');
      try {
        await this.db?.execAsync('ALTER TABLE expense_reports ADD COLUMN user_id TEXT');
        console.log('✅ Migration 1 completed: user_id column added');
      } catch (error) {
        // Ignora l'errore se la colonna esiste già
        console.log('⚠️ Migration 1 skipped: user_id column might already exist');
      }
      await this.setDbVersion(2);
    }
    
    // Migrazione 2: Aggiunta colonne start_date e end_date
    if (currentVersion <= 2) {
      console.log('📊 Running migration 2: Adding start_date and end_date columns to expense_reports');
      try {
        await this.db?.execAsync('ALTER TABLE expense_reports ADD COLUMN start_date TEXT');
        await this.db?.execAsync('ALTER TABLE expense_reports ADD COLUMN end_date TEXT');
        console.log('✅ Migration 2 completed: start_date and end_date columns added');
      } catch (error) {
        // Ignora l'errore se le colonne esistono già
        console.log('⚠️ Migration 2 skipped: start_date/end_date columns might already exist');
      }
      await this.setDbVersion(3);
    }
    
    // Migrazione 3: Assegna user_id corrente alle note spese esistenti senza user_id
    if (currentVersion <= 3) {
      console.log('📊 Running migration 3: Assigning current user_id to expense reports without user_id');
      if (this.currentUserId) {
        try {
          const result = await this.db?.runAsync(
            'UPDATE expense_reports SET user_id = ? WHERE user_id IS NULL',
            [this.currentUserId]
          );
          console.log(`✅ Migration 3 completed: Updated ${result?.changes || 0} expense reports with user_id`);
        } catch (error) {
          console.log('⚠️ Migration 3 error:', error);
        }
      } else {
        console.log('⚠️ Migration 3 skipped: No current user set');
      }
      await this.setDbVersion(4);
    }
  }
  
  private async getDbVersion(): Promise<number> {
    if (!this.db) return 0;
    
    try {
      // Crea tabella versione se non esiste
      await this.db.execAsync(`
        CREATE TABLE IF NOT EXISTS db_version (
          version INTEGER NOT NULL
        );
      `);
      
      const result = await this.db.getFirstAsync<{version: number}>('SELECT version FROM db_version LIMIT 1');
      
      if (!result) {
        // Prima installazione - imposta versione 1
        await this.db.execAsync('INSERT INTO db_version (version) VALUES (1)');
        return 1;
      }
      
      return result.version;
    } catch (error) {
      console.error('Error getting database version:', error);
      return 1;
    }
  }
  
  private async setDbVersion(version: number): Promise<void> {
    if (!this.db) return;
    
    try {
      // Prova prima UPDATE, poi INSERT se non ci sono righe
      const result = await this.db.runAsync('UPDATE db_version SET version = ?', [version]);
      
      if (result.changes === 0) {
        // Nessuna riga aggiornata, inserisci
        await this.db.runAsync('INSERT INTO db_version (version) VALUES (?)', [version]);
      }
      
      console.log(`📊 Database version updated to ${version}`);
    } catch (error) {
      console.error('Error setting database version:', error);
    }
  }
  
  // EXPENSE REPORTS CRUD
  
  async createExpenseReport(report: Omit<ExpenseReport, 'id' | 'created_at' | 'updated_at'>): Promise<string> {
    if (!this.db) throw new Error('Database not initialized');
    
    const id = this.generateId();
    const now = new Date().toISOString();
    
    const fullReport: ExpenseReport = {
      ...report,
      id,
      created_at: now,
      updated_at: now
    };
    
    await this.db.runAsync(`
      INSERT INTO expense_reports (
        id, title, description, start_date, end_date, user_id, created_at, updated_at, is_archived, 
        server_id, sync_status, last_sync
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      fullReport.id,
      fullReport.title,
      fullReport.description || null,
      fullReport.start_date || null,
      fullReport.end_date || null,
      fullReport.user_id || null,
      fullReport.created_at,
      fullReport.updated_at,
      fullReport.is_archived ? 1 : 0,
      fullReport.server_id || null,
      fullReport.sync_status,
      fullReport.last_sync || null
    ]);
    
    // Aggiungi alla coda di sync
    await this.addToSyncQueueInternal('expense_reports', id, 'create', fullReport);
    
    return id;
  }
  
  async getExpenseReports(includeArchived = false): Promise<ExpenseReport[]> {
    if (!this.db) throw new Error('Database not initialized');
    
    console.log('📋 [DB] getExpenseReports - Current user ID:', this.currentUserId);
    
    let query: string;
    let params: any[];
    
    if (this.currentUserId) {
      // Filtra per utente corrente
      query = includeArchived 
        ? 'SELECT * FROM expense_reports WHERE user_id = ? ORDER BY created_at DESC'
        : 'SELECT * FROM expense_reports WHERE user_id = ? AND is_archived = 0 ORDER BY created_at DESC';
      params = [this.currentUserId];
    } else {
      // Nessun filtro utente (per compatibilità)
      query = includeArchived 
        ? 'SELECT * FROM expense_reports ORDER BY created_at DESC'
        : 'SELECT * FROM expense_reports WHERE is_archived = 0 ORDER BY created_at DESC';
      params = [];
    }
    
    const reports = await this.db.getAllAsync<ExpenseReport>(query, params);
    
    console.log(`📋 [DB] Found ${reports.length} expense reports for user ${this.currentUserId || 'all'}`);
    
    return reports.map(report => ({
      ...report,
      is_archived: Boolean(report.is_archived)
    }));
  }
  
  async getExpenseReportById(id: string): Promise<ExpenseReport | null> {
    if (!this.db) throw new Error('Database not initialized');
    
    const report = await this.db.getFirstAsync<ExpenseReport>(
      'SELECT * FROM expense_reports WHERE id = ?',
      [id]
    );
    
    if (!report) return null;
    
    return {
      ...report,
      is_archived: Boolean(report.is_archived)
    };
  }
  
  async updateExpenseReport(id: string, updates: Partial<ExpenseReport>): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    
    const now = new Date().toISOString();
    const updatedReport = {
      ...updates,
      updated_at: now,
      sync_status: 'pending' as const
    };
    
    const setClause = Object.keys(updatedReport)
      .map(key => `${key} = ?`)
      .join(', ');
    
    const values = Object.values(updatedReport);
    values.push(id);
    
    await this.db.runAsync(
      `UPDATE expense_reports SET ${setClause} WHERE id = ?`,
      values
    );
    
    // Aggiungi alla coda di sync
    const fullReport = await this.getExpenseReportById(id);
    if (fullReport) {
      await this.addToSyncQueueInternal('expense_reports', id, 'update', fullReport);
    }
  }
  
  async archiveExpenseReport(id: string): Promise<void> {
    await this.updateExpenseReport(id, { 
      is_archived: true,
      sync_status: 'pending'
    });
  }
  
  async archiveExpenseReportWithExpenses(id: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    
    console.log(`🗂️ Archiving expense report ${id} and all associated expenses...`);
    
    // Prima archivia la nota spese
    await this.archiveExpenseReport(id);
    console.log(`✅ Expense report ${id} archived`);
    
    // Poi archivia tutte le spese associate
    const expenses = await this.getExpensesByReportId(id, false); // Solo spese non archiviate
    console.log(`📋 Found ${expenses.length} active expenses to archive`);
    
    for (const expense of expenses) {
      await this.archiveExpense(expense.id);
      console.log(`✅ Expense ${expense.id} archived`);
    }
    
    console.log(`🎉 Successfully archived expense report ${id} with ${expenses.length} expenses`);
  }
  
  // EXPENSES CRUD
  
  async createExpense(expense: Omit<Expense, 'id' | 'created_at' | 'updated_at'>): Promise<string> {
    if (!this.db) throw new Error('Database not initialized');
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📦 [DB] Creating expense in local database...');
    
    const id = this.generateId();
    const now = new Date().toISOString();
    
    console.log('🆔 [DB] Generated local ID:', id);
    
    const fullExpense: Expense = {
      ...expense,
      id,
      created_at: now,
      updated_at: now
    };
    
    console.log('📋 [DB] Expense details:', {
      id: fullExpense.id,
      expense_report_id: fullExpense.expense_report_id,
      amount: fullExpense.amount,
      currency: fullExpense.currency,
      merchant_name: fullExpense.merchant_name,
      category: fullExpense.category,
      receipt_date: fullExpense.receipt_date,
      sync_status: fullExpense.sync_status,
      hasImage: !!fullExpense.receipt_image_path
    });
    
    console.log('💾 [DB] Inserting expense into SQLite...');
    await this.db.runAsync(`
      INSERT INTO expenses (
        id, expense_report_id, amount, currency, merchant_name, merchant_address,
        merchant_vat, category, receipt_date, receipt_time, receipt_image_path,
        receipt_image_url, receipt_thumbnail_url, extracted_data, notes, created_at, updated_at,
        is_archived, server_id, sync_status, last_sync
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      fullExpense.id,
      fullExpense.expense_report_id,
      fullExpense.amount,
      fullExpense.currency,
      fullExpense.merchant_name || null,
      fullExpense.merchant_address || null,
      fullExpense.merchant_vat || null,
      fullExpense.category || null,
      fullExpense.receipt_date,
      fullExpense.receipt_time || null,
      fullExpense.receipt_image_path || null,
      fullExpense.receipt_image_url || null,
      fullExpense.receipt_thumbnail_url || null,
      fullExpense.extracted_data || null,
      fullExpense.notes || null,
      fullExpense.created_at,
      fullExpense.updated_at,
      fullExpense.is_archived ? 1 : 0,
      fullExpense.server_id || null,
      fullExpense.sync_status,
      fullExpense.last_sync || null
    ]);
    
    console.log('✅ [DB] Expense inserted successfully into SQLite');
    
    // Aggiungi alla coda di sync
    console.log('🔄 [DB] Adding expense to sync queue...');
    await this.addToSyncQueueInternal('expenses', id, 'create', fullExpense);
    console.log('✅ [DB] Expense added to sync queue');
    
    console.log('🆔 [DB] Final local expense ID:', id);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    return id;
  }
  
  async getExpensesByReportId(reportId: string, includeArchived = false): Promise<Expense[]> {
    if (!this.db) throw new Error('Database not initialized');
    
    const query = includeArchived
      ? 'SELECT * FROM expenses WHERE expense_report_id = ? ORDER BY receipt_date DESC, created_at DESC'
      : 'SELECT * FROM expenses WHERE expense_report_id = ? AND is_archived = 0 ORDER BY receipt_date DESC, created_at DESC';
    
    const expenses = await this.db.getAllAsync<Expense>(query, [reportId]);
    
    return expenses.map(expense => ({
      ...expense,
      is_archived: Boolean(expense.is_archived)
    }));
  }
  
  async getExpenseById(id: string): Promise<Expense | null> {
    if (!this.db) throw new Error('Database not initialized');
    
    console.log(`🔍 getExpenseById called with ID: ${id}`);
    
    // Prima prova con l'ID locale
    let expense = await this.db.getFirstAsync<Expense>(
      'SELECT * FROM expenses WHERE id = ?',
      [id]
    );
    
    console.log(`🔍 Search by local ID result:`, expense ? `Found expense with local ID ${expense.id}` : 'Not found');
    
    // Se non trovato, prova con server_id
    if (!expense) {
      expense = await this.db.getFirstAsync<Expense>(
        'SELECT * FROM expenses WHERE server_id = ?',
        [id]
      );
      console.log(`🔍 Search by server_id result:`, expense ? `Found expense with local ID ${expense.id} and server_id ${expense.server_id}` : 'Not found');
    }
    
    if (!expense) {
      console.log(`❌ getExpenseById: No expense found for ID ${id}`);
      return null;
    }
    
    console.log(`✅ getExpenseById: Found expense - Local ID: ${expense.id}, Server ID: ${expense.server_id || 'none'}, Amount: ${expense.amount}`);
    
    return {
      ...expense,
      is_archived: Boolean(expense.is_archived)
    };
  }
  
  async updateExpense(id: string, updates: Partial<Expense>): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    
    // Prima trova l'expense (potrebbe essere passato local_id o server_id)
    const expense = await this.getExpenseById(id);
    if (!expense) {
      throw new Error(`Expense not found with ID: ${id}`);
    }
    
    const localId = expense.id; // Usa sempre il local_id per l'update
    
    const now = new Date().toISOString();
    const updatedExpense = {
      ...updates,
      updated_at: now,
      sync_status: 'pending' as const
    };
    
    const setClause = Object.keys(updatedExpense)
      .map(key => `${key} = ?`)
      .join(', ');
    
    const values = Object.values(updatedExpense);
    values.push(localId);
    
    await this.db.runAsync(
      `UPDATE expenses SET ${setClause} WHERE id = ?`,
      values
    );
    
    // Aggiungi alla coda di sync solo se l'expense ha un server_id
    const fullExpense = await this.getExpenseById(localId);
    if (fullExpense && fullExpense.server_id) {
      await this.addToSyncQueue({
        table_name: 'expenses',
        record_id: localId,
        action: 'update',
        data: fullExpense
      });
    } else {
      console.log(`🔄 Skipping sync queue for local-only expense: ${localId}`);
    }
  }
  
  async moveExpenseToReport(expenseId: string, newReportId: string): Promise<void> {
    await this.updateExpense(expenseId, {
      expense_report_id: newReportId
    });
  }
  
  async archiveExpense(id: string): Promise<void> {
    await this.updateExpense(id, { 
      is_archived: true,
      sync_status: 'pending'
    });
  }
  
  async updateExpenseArchiveStatus(id: string, isArchived: boolean): Promise<void> {
    await this.updateExpense(id, { 
      is_archived: isArchived,
      sync_status: 'pending'
    });
  }
  
  /**
   * Updates expense without adding to sync queue - useful for local operations like restore
   */
  async updateExpenseLocal(id: string, updates: Partial<Expense>): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    
    const now = new Date().toISOString();
    const updatedExpense = {
      ...updates,
      updated_at: now
      // Note: NOT setting sync_status to pending for local operations
    };
    
    const setClause = Object.keys(updatedExpense)
      .map(key => `${key} = ?`)
      .join(', ');
    
    const values = Object.values(updatedExpense);
    values.push(id);
    
    await this.db.runAsync(
      `UPDATE expenses SET ${setClause} WHERE id = ?`,
      values
    );
    
    console.log(`💾 Local update completed for expense: ${id}`);
  }
  
  async deleteExpense(id: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    
    // Prima recupera i dati della spesa per la coda di sync
    const expense = await this.getExpenseById(id);
    if (!expense) {
      throw new Error('Expense not found');
    }
    
    // Elimina dal database locale usando l'ID locale (non server_id)
    await this.db.runAsync('DELETE FROM expenses WHERE id = ?', [expense.id]);
    
    // Aggiungi alla coda di sync solo se ha un server_id
    if (expense.server_id) {
      await this.addToSyncQueue({
        table_name: 'expenses',
        record_id: expense.id,
        action: 'delete',
        data: expense
      });
    }
    
    console.log(`🗑️ Expense ${expense.id} deleted from local database`);
  }
  
  // FILTRI TEMPORALI
  
  async getExpenseReportsByDateRange(startDate: string, endDate: string, includeArchived = false): Promise<ExpenseReport[]> {
    if (!this.db) throw new Error('Database not initialized');
    
    const query = includeArchived
      ? 'SELECT * FROM expense_reports WHERE created_at BETWEEN ? AND ? ORDER BY created_at DESC'
      : 'SELECT * FROM expense_reports WHERE created_at BETWEEN ? AND ? AND is_archived = 0 ORDER BY created_at DESC';
    
    const reports = await this.db.getAllAsync<ExpenseReport>(query, [startDate, endDate]);
    
    return reports.map(report => ({
      ...report,
      is_archived: Boolean(report.is_archived)
    }));
  }
  
  async getExpensesByDateRange(startDate: string, endDate: string, reportId?: string, includeArchived = false): Promise<Expense[]> {
    if (!this.db) throw new Error('Database not initialized');
    
    let query = 'SELECT * FROM expenses WHERE receipt_date BETWEEN ? AND ?';
    const params: any[] = [startDate, endDate];
    
    if (reportId) {
      query += ' AND expense_report_id = ?';
      params.push(reportId);
    }
    
    if (!includeArchived) {
      query += ' AND is_archived = 0';
    }
    
    query += ' ORDER BY receipt_date DESC, created_at DESC';
    
    const expenses = await this.db.getAllAsync<Expense>(query, params);
    
    return expenses.map(expense => ({
      ...expense,
      is_archived: Boolean(expense.is_archived)
    }));
  }
  
  async getAllArchivedExpenses(): Promise<Expense[]> {
    if (!this.db) throw new Error('Database not initialized');
    
    const expenses = await this.db.getAllAsync<Expense>(
      'SELECT * FROM expenses WHERE is_archived = 1 ORDER BY receipt_date DESC, created_at DESC'
    );
    
    return expenses.map(expense => ({
      ...expense,
      is_archived: Boolean(expense.is_archived)
    }));
  }
  
  // SYNC QUEUE MANAGEMENT
  
  private async addToSyncQueueInternal(tableName: string, recordId: string, action: 'create' | 'update' | 'delete', data: any): Promise<void> {
    if (!this.db) return;
    
    const queueId = this.generateId();
    const now = new Date().toISOString();
    
    await this.db.runAsync(`
      INSERT INTO sync_queue (id, table_name, record_id, action, data, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [
      queueId,
      tableName,
      recordId,
      action,
      JSON.stringify(data),
      now
    ]);
  }
  
  async getSyncQueue(): Promise<SyncQueueItem[]> {
    if (!this.db) throw new Error('Database not initialized');
    
    return await this.db.getAllAsync<SyncQueueItem>(`
      SELECT * FROM sync_queue ORDER BY created_at ASC
    `);
  }
  
  async removeSyncQueueItem(id: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    
    await this.db.runAsync('DELETE FROM sync_queue WHERE id = ?', [id]);
  }
  
  async updateSyncQueueItem(id: string, attempts: number, error?: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    
    await this.db.runAsync(`
      UPDATE sync_queue SET attempts = ?, last_error = ? WHERE id = ?
    `, [attempts, error || null, id]);
  }
  
  /**
   * Rimuove duplicati dalla coda di sync per lo stesso record
   * Gestisce anche il caso di create+update per lo stesso record
   */
  async cleanupSyncQueueDuplicates(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    
    console.log('🧆 Cleaning up sync queue duplicates...');
    
    // Prima fase: elimina i duplicati esatti (stessa tabella, record_id e action)
    await this.db.execAsync(`
      DELETE FROM sync_queue 
      WHERE id NOT IN (
        SELECT id FROM (
          SELECT id, table_name, record_id, action,
                 ROW_NUMBER() OVER (
                   PARTITION BY table_name, record_id, action 
                   ORDER BY created_at DESC
                 ) as rn
          FROM sync_queue
        ) ranked
        WHERE rn = 1
      )
    `);
    
    console.log('✅ [SyncQueue] Exact duplicates removed');
    
    // Seconda fase: rimuove gli 'update' se c'è già un 'create' pendente per lo stesso record
    await this.db.execAsync(`
      DELETE FROM sync_queue 
      WHERE action = 'update'
      AND EXISTS (
        SELECT 1 FROM sync_queue sq2 
        WHERE sq2.table_name = sync_queue.table_name 
        AND sq2.record_id = sync_queue.record_id 
        AND sq2.action = 'create'
        AND sq2.created_at <= sync_queue.created_at
      )
    `);
    
    console.log('✅ [SyncQueue] Redundant updates after create removed');
    
    const remainingItems = await this.getSyncQueue();
    console.log(`✅ Sync queue cleanup completed. Remaining items: ${remainingItems.length}`);
    
    // Log dettagliato degli elementi rimanenti per debugging
    if (remainingItems.length > 0) {
      console.log('📋 Remaining sync queue items:');
      remainingItems.forEach((item, index) => {
        console.log(`  ${index + 1}. ${item.action} ${item.table_name}:${item.record_id} (created: ${item.created_at})`);
      });
    }
  }
  
  /**
   * Metodo pubblico per aggiungere elementi alla coda di sync
   */
  async addToSyncQueue(item: { table_name: string; record_id: string; action: 'create' | 'update' | 'delete'; data: any; created_at?: string; attempts?: number }): Promise<void> {
    if (!this.db) return;
    
    const queueId = this.generateId();
    const now = item.created_at || new Date().toISOString();
    
    await this.db.runAsync(`
      INSERT INTO sync_queue (id, table_name, record_id, action, data, created_at, attempts)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      queueId,
      item.table_name,
      item.record_id,
      item.action,
      typeof item.data === 'string' ? item.data : JSON.stringify(item.data),
      now,
      item.attempts || 0
    ]);
  }
  
  // UTILITY METHODS
  
  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }
  
  /**
   * Ottiene o crea la nota spese generica per gli scontrini dalla funzionalità Scansiona
   */
  async getOrCreateGenericExpenseReport(): Promise<string> {
    if (!this.db) throw new Error('Database not initialized');
    
    const GENERIC_TITLE = 'Nota Spesa Generica';
    
    // Cerca se esiste già una nota spese generica per l'utente corrente
    let query: string;
    let params: any[];
    
    if (this.currentUserId) {
      query = 'SELECT * FROM expense_reports WHERE title = ? AND user_id = ? AND is_archived = 0';
      params = [GENERIC_TITLE, this.currentUserId];
    } else {
      query = 'SELECT * FROM expense_reports WHERE title = ? AND is_archived = 0';
      params = [GENERIC_TITLE];
    }
    
    const existingGeneric = await this.db.getFirstAsync<ExpenseReport>(query, params);
    
    if (existingGeneric) {
      console.log('📋 Using existing generic expense report:', existingGeneric.id, 'server_id:', existingGeneric.server_id || 'NULL');
      
      // Verifica se la nota spese esistente ha bisogno di essere sincronizzata
      if (!existingGeneric.server_id && existingGeneric.sync_status !== 'synced') {
        console.log('🔄 Adding existing generic expense report to sync queue');
        await this.addToSyncQueueInternal('expense_reports', existingGeneric.id, 'create', existingGeneric);
      }
      
      return existingGeneric.id;
    }
    
    // Crea una nuova nota spese generica
    console.log('📋 Creating new generic expense report for user:', this.currentUserId || 'no user');
    const genericId = await this.createExpenseReport({
      title: GENERIC_TITLE,
      description: 'Nota spese automatica per scontrini scansionati con la funzionalità Scansiona',
      user_id: this.currentUserId || undefined,
      is_archived: false,
      sync_status: 'pending'
    });
    
    console.log('✅ Generic expense report created:', genericId);
    return genericId;
  }
  
  /**
   * Pulisce completamente il database (per sviluppo/debug)
   */
  async clearAllData(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    
    console.log('🗑️ Clearing all database data...');
    
    // Cancella tutte le tabelle in ordine per rispettare i vincoli di foreign key
    await this.db.execAsync('DELETE FROM sync_queue');
    await this.db.execAsync('DELETE FROM expenses');
    await this.db.execAsync('DELETE FROM expense_reports');
    
    console.log('✅ All database data cleared');
  }
  
  /**
   * Pulisce i dati dell'utente corrente (usato al logout)
   */
  async clearCurrentUserData(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    
    if (!this.currentUserId) {
      console.log('⚠️ [DB] No current user set, clearing all data instead');
      await this.clearAllData();
      return;
    }
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🗑️ [DB LOGOUT] Clearing data for user:', this.currentUserId);
    
    // Prima, ottieni tutti i report dell'utente (inclusi quelli senza user_id)
    // Questo cattura sia i report con user_id esplicito che quelli senza (creati prima della migrazione)
    const userReports = await this.db.getAllAsync<{id: string}>(
      'SELECT id FROM expense_reports WHERE user_id = ? OR user_id IS NULL',
      [this.currentUserId]
    );
    
    console.log(`📋 [DB LOGOUT] Found ${userReports.length} expense reports to delete`);
    
    // Cancella le spese associate ai report dell'utente
    for (const report of userReports) {
      const expensesResult = await this.db.runAsync(
        'DELETE FROM expenses WHERE expense_report_id = ?',
        [report.id]
      );
      console.log(`  - Deleted ${expensesResult.changes} expenses from report ${report.id}`);
    }
    
    console.log('✅ [DB LOGOUT] Deleted all expenses for user reports');
    
    // Cancella i report dell'utente (con o senza user_id)
    const reportResult = await this.db.runAsync(
      'DELETE FROM expense_reports WHERE user_id = ? OR user_id IS NULL',
      [this.currentUserId]
    );
    
    console.log(`✅ [DB LOGOUT] Deleted ${reportResult.changes} expense reports`);
    
    // Cancella gli item nella sync queue relativi ai record eliminati
    const reportIds = userReports.map(r => r.id);
    if (reportIds.length > 0) {
      const placeholders = reportIds.map(() => '?').join(',');
      await this.db.runAsync(
        `DELETE FROM sync_queue WHERE record_id IN (${placeholders})`,
        reportIds
      );
      console.log('✅ [DB LOGOUT] Cleared sync queue items for deleted reports');
    }
    
    // Pulisci anche eventuali spese orfane (senza report parent valido)
    const orphanExpensesResult = await this.db.runAsync(
      'DELETE FROM expenses WHERE expense_report_id NOT IN (SELECT id FROM expense_reports)'
    );
    if (orphanExpensesResult.changes > 0) {
      console.log(`🧹 [DB LOGOUT] Cleaned up ${orphanExpensesResult.changes} orphan expenses`);
    }
    
    console.log('✅ [DB LOGOUT] All user data cleared successfully');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    // Reset current user
    this.currentUserId = null;
  }
  
  async getStats(): Promise<{
    totalReports: number;
    totalExpenses: number;
    archivedReports: number;
    archivedExpenses: number;
    pendingSync: number;
  }> {
    if (!this.db) throw new Error('Database not initialized');
    
    const [
      totalReports,
      totalExpenses,
      archivedReports,
      archivedExpenses,
      pendingSync
    ] = await Promise.all([
      this.db.getFirstAsync<{count: number}>('SELECT COUNT(*) as count FROM expense_reports'),
      this.db.getFirstAsync<{count: number}>('SELECT COUNT(*) as count FROM expenses'),
      this.db.getFirstAsync<{count: number}>('SELECT COUNT(*) as count FROM expense_reports WHERE is_archived = 1'),
      this.db.getFirstAsync<{count: number}>('SELECT COUNT(*) as count FROM expenses WHERE is_archived = 1'),
      this.db.getFirstAsync<{count: number}>('SELECT COUNT(*) as count FROM sync_queue')
    ]);
    
    return {
      totalReports: totalReports?.count || 0,
      totalExpenses: totalExpenses?.count || 0,
      archivedReports: archivedReports?.count || 0,
      archivedExpenses: archivedExpenses?.count || 0,
      pendingSync: pendingSync?.count || 0
    };
  }
  
  /**
   * Debug method - logs detailed info about expense reports and sync queue
   */
  async debugLocalDatabase(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');
    
    console.log('\n🔍 ==========DEBUG LOCAL DATABASE==========');
    
    // Check all expense reports
    const reports = await this.getExpenseReports(true);
    console.log(`\n📋 EXPENSE REPORTS (${reports.length}):`); 
    
    if (reports.length === 0) {
      console.log('❌ No expense reports found');
    } else {
      reports.forEach((report, index) => {
        console.log(`\n${index + 1}. "${report.title}"`);
        console.log(`   Local ID: ${report.id}`);
        console.log(`   Server ID: ${report.server_id || 'NULL ❌'}`);
        console.log(`   Sync Status: ${report.sync_status}`);
        console.log(`   Last Sync: ${report.last_sync || 'NEVER'}`);
        console.log(`   Created: ${report.created_at}`);
      });
    }
    
    // Check sync queue
    const queue = await this.getSyncQueue();
    console.log(`\n\n🔄 SYNC QUEUE (${queue.length}):`); 
    
    if (queue.length === 0) {
      console.log('✅ Sync queue is empty');
    } else {
      queue.forEach((item, index) => {
        console.log(`\n${index + 1}. ${item.action} ${item.table_name}:${item.record_id}`);
        console.log(`   Queue ID: ${item.id}`);
        console.log(`   Created: ${item.created_at}`);
        console.log(`   Attempts: ${item.attempts}`);
        console.log(`   Last Error: ${item.last_error || 'none'}`);
      });
    }
    
    console.log('\n🏁 =======================================\n');
  }
}

export const databaseManager = new DatabaseManager();
