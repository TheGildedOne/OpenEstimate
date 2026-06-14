import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import { config } from '../config';
import path from 'path';
import fs from 'fs';

// Extract the file path from the URL (strips leading 'file:')
const dbPath = config.DATABASE_URL.replace(/^file:/, '');
const resolvedPath = path.resolve(dbPath);

// Ensure the data directory exists
const dir = path.dirname(resolvedPath);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

const sqlite = new Database(resolvedPath);

// Enable WAL mode for better concurrent read performance
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');
sqlite.pragma('cache_size = -32000'); // 32MB cache

export const db = drizzle(sqlite, { schema });
export type DB = typeof db;
