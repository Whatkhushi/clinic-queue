import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';

let socket: Socket | null = null;

function getSocket() {
  socket ??= io({ path: '/socket.io' }); // same origin as the page
  return socket;
}

/**
 * Calls `onUpdate` whenever any of these doctors' queues change.
 * The server only sends a "something changed" ping; the caller refetches.
 */
export function useQueueUpdates(providerIds: number[], onUpdate: () => void) {
  const callback = useRef(onUpdate);
  callback.current = onUpdate;
  const key = [...new Set(providerIds)].sort().join(',');

  useEffect(() => {
    if (!key) return;
    const ids = key.split(',').map(Number);
    const s = getSocket();
    const join = () => ids.forEach((id) => s.emit('queue:join', id));
    const handler = (msg: { providerId: number }) => {
      if (ids.includes(msg.providerId)) callback.current();
    };

    join();
    s.on('connect', join); // re-join rooms after a reconnect
    s.on('queue:updated', handler);
    return () => {
      ids.forEach((id) => s.emit('queue:leave', id));
      s.off('connect', join);
      s.off('queue:updated', handler);
    };
  }, [key]);
}
