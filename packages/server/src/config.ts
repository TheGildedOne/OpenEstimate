import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().default('file:./data/openestimate.db'),
  JWT_ACCESS_SECRET: z.string().min(32).default('dev-access-secret-change-in-production-!!!'),
  JWT_REFRESH_SECRET: z.string().min(32).default('dev-refresh-secret-change-in-production-!!!'),
  JWT_ACCESS_TTL: z.coerce.number().int().default(900),
  JWT_REFRESH_TTL: z.coerce.number().int().default(2592000),
  CLIENT_URL: z.string().url().default('http://localhost:5173'),
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_PATH: z.string().default('./data/uploads'),
  MAX_FILE_SIZE: z.coerce.number().int().default(52428800), // 50MB
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: z
    .string()
    .transform((v) => v === 'true')
    .default('false'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().default(587),
  SMTP_SECURE: z
    .string()
    .transform((v) => v === 'true')
    .default('false'),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
});

function loadConfig() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('Invalid environment configuration:');
    console.error(result.error.format());
    process.exit(1);
  }
  return result.data;
}

export const config = loadConfig();
export type Config = typeof config;
