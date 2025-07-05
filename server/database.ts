import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import { merchants, transactions } from '@shared/schema';

let db: ReturnType<typeof drizzle> | null = null;

export function getDb() {
  if (!db) {
    const connectionString = process.env.DATABASE_URL;
    
    if (!connectionString) {
      console.log('DATABASE_URL not configured. Database operations will not be available.');
      return null;
    }

    try {
      const sql = neon(connectionString);
      db = drizzle(sql, {
        schema: { merchants, transactions },
      });
      console.log('Database connection established');
    } catch (error) {
      console.error('Failed to connect to database:', error);
      return null;
    }
  }
  
  return db;
}

export function isDatabaseConnected(): boolean {
  return getDb() !== null;
}

// Initialize database connection
getDb();