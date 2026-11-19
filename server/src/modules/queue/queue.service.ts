import type { Appointment } from '@prisma/client';
import { prisma } from '../../db.js';
import { dayRange, today } from '../../lib/time.js';

/**
 * Today's live queue for one doctor.
 *
 * Queue order = checked-in patients sorted by startTime. A booked patient's
 * startTime is their slot; a walk-in's startTime is when they arrived. So a
 * patient who booked 10:00 and a walk-in who arrived at 9:50 are seen in the
 * order 9:50, 10:00. Nothing is stored about position: it's always computed,
 * so it can never get out of sync.
 */
export async function getQueue(providerId: number) {
  const { start, end } = dayRange(today());
  const [provider, active] = await Promise.all([
    prisma.provider.findUnique({ where: { id: providerId }, select: { slotMinutes: true } }),
    prisma.appointment.findMany({
      where: { providerId, startTime: { gte: start, lt: end }, status: { in: ['CHECKED_IN', 'IN_PROGRESS'] } },
      orderBy: { startTime: 'asc' },
    }),
  ]);
  return {
    slotMinutes: provider?.slotMinutes ?? 15,
    inProgress: active.find((a) => a.status === 'IN_PROGRESS') ?? null,
    waiting: active.filter((a) => a.status === 'CHECKED_IN'),
  };
}

export type Queue = Awaited<ReturnType<typeof getQueue>>;

/** Position (1 = next) and estimated wait for one appointment, or null if it isn't waiting. */
export function positionIn(queue: Queue, appt: Pick<Appointment, 'id'>) {
  const index = queue.waiting.findIndex((a) => a.id === appt.id);
  if (index === -1) return null;
  const slotsAhead = index + (queue.inProgress ? 1 : 0);
  return { position: index + 1, estimatedWaitMinutes: slotsAhead * queue.slotMinutes };
}

/** Public, anonymous summary for the waiting-room board. No names. */
export function publicSummary(queue: Queue) {
  return {
    nowServing: queue.inProgress ? queue.inProgress.id : null,
    waiting: queue.waiting.map((a) => a.id),
    waitingCount: queue.waiting.length,
    estimatedWaitMinutes: (queue.waiting.length + (queue.inProgress ? 1 : 0)) * queue.slotMinutes,
  };
}
