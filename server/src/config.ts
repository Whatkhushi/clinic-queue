import { z } from 'zod';

// Fail fast at startup if the environment is misconfigured.
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  CLINIC_TZ: z.string().default('Asia/Kolkata'),
  // Only needed in development, when Vite runs on a different port.
  CORS_ORIGIN: z.string().optional(),
  // Folder with the built React app; served by Express in production.
  WEB_DIST: z.string().optional(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;
export const isProd = config.NODE_ENV === 'production';
