import path from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { pinoHttp } from 'pino-http';
import { config, isProd } from './config.js';
import { prisma } from './db.js';
import { logger } from './logger.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { providersRouter } from './modules/providers/providers.routes.js';
import { appointmentsRouter } from './modules/appointments/appointments.routes.js';
import { adminRouter } from './modules/admin/admin.routes.js';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1); // behind Render's / Nginx's proxy: real client IP for rate limiting
  app.use(helmet({ contentSecurityPolicy: isProd ? undefined : false }));
  if (config.CORS_ORIGIN) app.use(cors({ origin: config.CORS_ORIGIN, credentials: true }));
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  if (config.NODE_ENV !== 'test') app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/api/health' } }));

  // Liveness + readiness: also checks the database is reachable.
  app.get('/api/health', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: 'ok', db: 'ok', uptime: Math.round(process.uptime()) });
    } catch {
      res.status(503).json({ status: 'error', db: 'unreachable' });
    }
  });

  // Slow down password guessing: 20 auth attempts per 15 min per IP.
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: config.NODE_ENV === 'test' ? 10_000 : 20,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message: 'Too many attempts, try again in a few minutes' } },
  });

  const api = express.Router();
  api.use('/auth/login', authLimiter);
  api.use('/auth/register', authLimiter);
  api.use('/auth', authRouter);
  api.use('/providers', providersRouter);
  api.use('/appointments', appointmentsRouter);
  api.use('/admin', adminRouter);
  app.use('/api/v1', api);
  app.use('/api', notFoundHandler);

  // Production: serve the built React app from the same server and origin.
  if (config.WEB_DIST) {
    const dist = path.resolve(config.WEB_DIST);
    app.use(express.static(dist, { maxAge: '1h', index: false }));
    // Any other GET -> index.html so React Router can handle the URL.
    app.get('/{*splat}', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
