// Server-only environment parsing. NEVER import this file in frontend code.

import { z } from 'zod';

const envSchema = z.object({
  APP_NAME: z.string().default('Bachatly'),
  APP_TAGLINE: z.string().default('Save More. Live More.'),
  CURRENCY: z.string().default('PKR'),
  TIMEZONE: z.string().default('Asia/Karachi'),
  DEFAULT_COUNTRY: z.string().default('PK'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),

  // 60–120, short-lived redemption token.
  QR_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(120).default(90),

  NEXT_PUBLIC_SITE_URL: z.string().url().default('http://localhost:3000'),
  PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),

  // SERVER-ONLY — never NEXT_PUBLIC.
  GOOGLE_MAPS_API_KEY: z.string().optional(),
  NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: z.string().optional(),

  EMAIL_HOST: z.string().optional(),
  EMAIL_PORT: z.coerce.number().int().positive().default(587),
  EMAIL_USER: z.string().optional(),
  EMAIL_PASSWORD: z.string().optional(), // server-only
  EMAIL_FROM: z.string().email().default('hello@bachatly.pk'),

  SMS_PROVIDER_KEY: z.string().optional(), // server-only, SMS-ready
  WHATSAPP_PROVIDER_KEY: z.string().optional(), // server-only, WhatsApp-ready

  S3_ENDPOINT: z.string().url().default('http://localhost:9000'),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(), // server-only
  S3_BUCKET: z.string().default('bachatly'),
  S3_REGION: z.string().default('us-east-1'),

  ACTIVE_PAYMENT_GATEWAY: z
    .enum(['STRIPE', 'JAZZCASH', 'EASYPASA', 'BANK_TRANSFER', 'MANUAL'])
    .default('MANUAL'),
  PAYMENT_GATEWAY_KEY: z.string().optional(),
  PAYMENT_GATEWAY_SECRET: z.string().optional(), // server-only

  JAZZCASH_MERCHANT_ID: z.string().optional(),
  JAZZCASH_PASSWORD: z.string().optional(),
  JAZZCASH_RETURN_URL: z.string().url().optional(),

  EASYPASA_STORE_ID: z.string().optional(),
  EASYPASA_HASH_KEY: z.string().optional(),

  BANK_NAME: z.string().optional(),
  BANK_ACCOUNT_TITLE: z.string().optional(),
  BANK_IBAN: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Parse and validate process.env against the server schema.
 * Throws with a readable message listing every bad/missing variable.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(
      `Invalid environment configuration:\n${problems}\n` +
        'Copy .env.example to .env and fill the required values.',
    );
  }
  return parsed.data;
}
