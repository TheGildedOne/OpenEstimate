import type { Config } from 'drizzle-kit';
import { config } from './src/config';

export default {
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  driver: config.databaseUrl.startsWith('file:') ? 'better-sqlite' : 'pg',
  dbCredentials: config.databaseUrl.startsWith('file:')
    ? { url: config.databaseUrl.replace('file:', '') }
    : { connectionString: config.databaseUrl },
} satisfies Config;
