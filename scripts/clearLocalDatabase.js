/**
 * Script per pulire completamente il database SQLite locale dell'app mobile
 * Utile per testing e debug quando si vuole un database completamente pulito
 */

import { databaseManager } from '../services/database.js';

async function clearLocalDatabase() {
  try {
    console.log('🧹 Starting local database cleanup...');
    
    // Inizializza il database se non è già inizializzato
    await databaseManager.initDatabase();
    
    // Pulisce tutti i dati
    await databaseManager.clearAllData();
    
    console.log('✅ Local database cleared successfully');
    console.log('💡 Next registration will create a fresh "Nota Spesa Generica"');
    
    // Mostra statistiche finali (dovrebbero essere tutte zero)
    const stats = await databaseManager.getStats();
    console.log('📊 Final database stats:', stats);
    
  } catch (error) {
    console.error('❌ Failed to clear local database:', error);
  }
}

// Esegui il cleanup
console.log('🗄️ Local Database Cleanup Script');
console.log('==================================');
clearLocalDatabase()
  .then(() => {
    console.log('\n🎉 Cleanup completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Cleanup failed:', error);
    process.exit(1);
  });
