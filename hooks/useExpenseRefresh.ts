/**
 * Hook per gestire il refresh automatico delle liste spese
 */

import { useEffect, useCallback, useRef } from 'react';
import { databaseManager } from '../services/database';

interface RefreshListener {
  id: string;
  callback: () => void | Promise<void>;
}

class ExpenseRefreshManager {
  private listeners: RefreshListener[] = [];
  private refreshTimeoutId: NodeJS.Timeout | null = null;

  addListener(id: string, callback: () => void | Promise<void>): () => void {
    // Remove existing listener with same ID
    this.removeListener(id);
    
    // Add new listener
    this.listeners.push({ id, callback });

    // Return unsubscribe function
    return () => this.removeListener(id);
  }

  private removeListener(id: string): void {
    this.listeners = this.listeners.filter(listener => listener.id !== id);
  }

  triggerRefresh(): void {
    // Debounce multiple refresh calls
    if (this.refreshTimeoutId) {
      clearTimeout(this.refreshTimeoutId);
    }

    this.refreshTimeoutId = setTimeout(() => {
      console.log(`🔄 Triggering refresh for ${this.listeners.length} listeners:`, this.listeners.map(l => l.id));
      
      this.listeners.forEach(async (listener) => {
        try {
          console.log(`🔄 Calling refresh for listener: ${listener.id}`);
          await listener.callback();
          console.log(`✅ Refresh completed for listener: ${listener.id}`);
        } catch (error) {
          console.error(`❌ Error in refresh listener ${listener.id}:`, error);
        }
      });
      
      this.refreshTimeoutId = null;
    }, 100); // Wait 100ms to batch multiple refresh calls
  }

  clearListeners(): void {
    this.listeners = [];
    if (this.refreshTimeoutId) {
      clearTimeout(this.refreshTimeoutId);
      this.refreshTimeoutId = null;
    }
  }
}

// Global singleton instance
const expenseRefreshManager = new ExpenseRefreshManager();

/**
 * Hook per ricevere notifiche di refresh automatico
 */
export function useExpenseRefresh(refreshCallback: () => void | Promise<void>): void {
  const callbackRef = useRef(refreshCallback);
  
  // Update callback ref when it changes
  useEffect(() => {
    callbackRef.current = refreshCallback;
  }, [refreshCallback]);

  useEffect(() => {
    const listenerId = `listener_${Math.random().toString(36).substr(2, 9)}`;
    
    const unsubscribe = expenseRefreshManager.addListener(
      listenerId,
      () => callbackRef.current()
    );

    return unsubscribe;
  }, []);
}

/**
 * Hook per triggerare il refresh di tutte le liste
 */
export function useExpenseRefreshTrigger() {
  return useCallback(() => {
    expenseRefreshManager.triggerRefresh();
  }, []);
}

/**
 * Funzione globale per triggerare il refresh
 */
export function triggerExpenseRefresh(): void {
  expenseRefreshManager.triggerRefresh();
}

/**
 * Hook per gestire operazioni CRUD che richiedono refresh
 */
export function useExpenseCRUD() {
  const triggerRefresh = useExpenseRefreshTrigger();

  const createExpense = useCallback(async (expenseData: any) => {
    try {
      const result = await databaseManager.createExpense(expenseData);
      console.log('✅ Expense created, triggering refresh');
      triggerRefresh();
      return result;
    } catch (error) {
      console.error('❌ Failed to create expense:', error);
      throw error;
    }
  }, [triggerRefresh]);

  const updateExpense = useCallback(async (expenseId: string, updates: any) => {
    try {
      await databaseManager.updateExpense(expenseId, updates);
      console.log('✅ Expense updated, triggering refresh');
      triggerRefresh();
    } catch (error) {
      console.error('❌ Failed to update expense:', error);
      throw error;
    }
  }, [triggerRefresh]);

  const deleteExpense = useCallback(async (expenseId: string) => {
    try {
      await databaseManager.deleteExpense(expenseId);
      console.log('✅ Expense deleted, triggering refresh');
      triggerRefresh();
    } catch (error) {
      console.error('❌ Failed to delete expense:', error);
      throw error;
    }
  }, [triggerRefresh]);

  return {
    createExpense,
    updateExpense,
    deleteExpense,
    triggerRefresh
  };
}
