import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import { env } from '$env/dynamic/private';
import fs from 'fs';
import path from 'path';

// Ensure DATABASE_URL is set
if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not set');

// Parse the database URL to get the file path
const dbUrl = new URL(env.DATABASE_URL);
const dbPath = dbUrl.pathname;

// Ensure the database directory exists
if (dbPath.startsWith('/')) {
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
}

// Create the database client
const client = createClient({ 
  url: env.DATABASE_URL,
  // Don't use syncUrl for local file-based databases
  ...(env.DATABASE_URL.startsWith('file:') ? {} : { syncUrl: env.DATABASE_SYNC_URL || env.DATABASE_URL })
});

// Export the database instance
export const db = drizzle(client);
