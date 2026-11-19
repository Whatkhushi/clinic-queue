import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { config } from './config.js';

/**
 * Socket.IO is used only as a "something changed" signal.
 * Clients join a room per doctor; when that doctor's queue changes we emit
 * `queue:updated` with just the providerId, and clients refetch over REST.
 * No patient data goes over the socket, so it needs no auth of its own.
 */
let io: Server | null = null;

export function initRealtime(server: HttpServer) {
  io = new Server(server, {
    cors: config.CORS_ORIGIN ? { origin: config.CORS_ORIGIN, credentials: true } : undefined,
  });
  io.on('connection', (socket) => {
    socket.on('queue:join', (providerId: unknown) => {
      const id = Number(providerId);
      if (Number.isInteger(id) && id > 0) socket.join(`provider:${id}`);
    });
    socket.on('queue:leave', (providerId: unknown) => {
      socket.leave(`provider:${Number(providerId)}`);
    });
  });
  return io;
}

export function notifyQueueChanged(providerId: number) {
  io?.to(`provider:${providerId}`).emit('queue:updated', { providerId });
}
