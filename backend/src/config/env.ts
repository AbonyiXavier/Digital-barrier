/**
 * Environment validation.
 *
 * The process refuses to boot on bad configuration rather than failing later at
 * the first request. Everything downstream reads the parsed, typed result, so
 * `process.env` is never touched outside this file.
 */
import { z } from 'zod';

const csv = (value: string): string[] =>
  value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '');

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  CORS_ORIGINS: z.string().default('').transform(csv),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  REDIS_HOST: z.string().default('127.0.0.1'),
  REDIS_PORT: z.coerce.number().int().default(6379),

  BETTER_AUTH_SECRET: z
    .string()
    .min(32, 'BETTER_AUTH_SECRET must be at least 32 characters'),
  BETTER_AUTH_URL: z.string().url(),
  PARTNER_WEB_URL: z.string().url(),

  NOTIFICATION_CHANNELS: z
    .string()
    .default('stub')
    .transform(csv)
    .pipe(z.array(z.enum(['stub', 'email', 'push'])).min(1)),
  SMTP_URL: z.string().default(''),
  MAIL_FROM: z.string().default('Aegis <no-reply@aegis.app>'),
  EXPO_ACCESS_TOKEN: z.string().default(''),

  PARTNER_REQUEST_WINDOW_HOURS: z.coerce.number().int().positive().default(24),
  FREE_PLAN_DEVICE_LIMIT: z.coerce.number().int().positive().default(1),
  DEVICE_OFFLINE_AFTER_MINUTES: z.coerce.number().int().positive().default(30),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}
