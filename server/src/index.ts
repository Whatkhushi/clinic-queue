import { createServer } from 'node:http';
import { config } from './config.js';
import { createApp } from './app.js';
import { prisma } from './db.js';
import { logger } from './logger.js';
import { initRealtime } from './realtime.js';

const server = createServer(createApp());
initRealtime(server);

server.listen(config.PORT, () => {
  logger.info(`ClinicQ API listening on http://localhost:${config.PORT} (${config.NODE_ENV})`);
});

// Graceful shutdown: Docker/Render send SIGTERM before stopping the container.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    logger.info(`${signal} received, shutting down`);
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  });
}
