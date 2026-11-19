import { DateTime } from 'luxon';
import { Prisma, type Appointment, type AppointmentStatus, type Provider, type User } from '@prisma/client';
import { prisma } from '../../db.js';
import { config } from '../../config.js';
import { ApiError } from '../../lib/errors.js';
import { dayOfWeek, dayRange, today } from '../../lib/time.js';
import { notifyQueueChanged } from '../../realtime.js';
import { getQueue, positionIn, type Queue } from '../queue/queue.service.js';

/** Allowed status changes. Anything else is a 409. See docs/DESIGN.md section 4. */
const TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  BOOKED: ['CHECKED_IN', 'NO_SHOW', 'CANCELLED'],
  CHECKED_IN: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

type ApptWithRelations = Appointment & {
  provider: Pick<Provider, 'id' | 'name' | 'specialty'>;
  patient: Pick<User, 'id' | 'name' | 'email'> | null;
};

export const apptInclude = {
  provider: { select: { id: true, name: true, specialty: true } },
  patient: { select: { id: true, name: true, email: true } },
} satisfies Prisma.AppointmentInclude;

/** Shape sent to clients. Adds live queue info when the patient is waiting. */
export function serialize(a: ApptWithRelations, queue?: Queue) {
  return {
    id: a.id,
    startTime: a.startTime,
    endTime: a.endTime,
    status: a.status,
    isWalkIn: a.isWalkIn,
    checkedInAt: a.checkedInAt,
    patientName: a.patient?.name ?? a.walkInName ?? 'Walk-in',
    patientEmail: a.patient?.email ?? null,
    provider: a.provider,
    queue: queue ? positionIn(queue, a) : null,
  };
}

/** Fetch today's queue once per doctor (not once per appointment). */
export async function queuesFor(appts: Appointment[]) {
  const { start, end } = dayRange(today());
  const ids = new Set(
    appts.filter((a) => a.status === 'CHECKED_IN' && a.startTime >= start && a.startTime < end).map((a) => a.providerId),
  );
  const queues = new Map<number, Queue>();
  await Promise.all([...ids].map(async (id) => queues.set(id, await getQueue(id))));
  return queues;
}

/** Is `start` exactly the beginning of one of this doctor's slots? */
async function assertValidSlot(provider: Provider, start: Date) {
  const local = DateTime.fromJSDate(start).setZone(config.CLINIC_TZ);
  const minute = local.hour * 60 + local.minute;
  const hours = await prisma.workingHours.findMany({
    where: { providerId: provider.id, dayOfWeek: dayOfWeek(local) },
  });
  const ok =
    local.second === 0 &&
    local.millisecond === 0 &&
    hours.some(
      (h) =>
        minute >= h.startMinute &&
        minute + provider.slotMinutes <= h.endMinute &&
        (minute - h.startMinute) % provider.slotMinutes === 0,
    );
  if (!ok) throw ApiError.badRequest('That time is not one of the doctor’s slots');
}

export async function book(patientId: number, providerId: number, startTime: Date) {
  const provider = await prisma.provider.findUnique({ where: { id: providerId } });
  if (!provider || !provider.active) throw ApiError.notFound('Doctor');
  if (startTime.getTime() <= Date.now()) throw ApiError.badRequest('That slot is in the past');
  await assertValidSlot(provider, startTime);

  // One active booking per doctor per day per patient.
  const localDay = DateTime.fromJSDate(startTime).setZone(config.CLINIC_TZ).toISODate()!;
  const { start, end } = dayRange(localDay);
  const existing = await prisma.appointment.findFirst({
    where: { patientId, providerId, startTime: { gte: start, lt: end }, status: { in: ['BOOKED', 'CHECKED_IN'] } },
  });
  if (existing) throw ApiError.conflict('ALREADY_BOOKED', 'You already have a booking with this doctor that day');

  try {
    // No "is the slot free?" check here on purpose: the partial unique index
    // decides. If two requests race, exactly one insert wins and the other
    // gets P2002, which becomes 409 SLOT_TAKEN.
    const appt = await prisma.appointment.create({
      data: {
        patientId,
        providerId,
        startTime,
        endTime: new Date(startTime.getTime() + provider.slotMinutes * 60_000),
      },
      include: apptInclude,
    });
    notifyQueueChanged(providerId);
    return appt;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw ApiError.conflict('SLOT_TAKEN', 'Sorry, someone just booked that slot. Please pick another.');
    }
    throw err;
  }
}

export async function addWalkIn(providerId: number, name: string) {
  const provider = await prisma.provider.findUnique({ where: { id: providerId } });
  if (!provider || !provider.active) throw ApiError.notFound('Doctor');
  const now = new Date();
  const appt = await prisma.appointment.create({
    data: {
      providerId,
      walkInName: name,
      isWalkIn: true,
      status: 'CHECKED_IN',
      checkedInAt: now,
      startTime: now, // walk-ins queue by arrival time
      endTime: new Date(now.getTime() + provider.slotMinutes * 60_000),
    },
    include: apptInclude,
  });
  notifyQueueChanged(providerId);
  return appt;
}

/**
 * Change status with optimistic concurrency: the UPDATE only matches if the
 * row is still in the status we read. If a second receptionist changed it in
 * the meantime, 0 rows match and we return 409 instead of overwriting.
 */
export async function changeStatus(id: number, to: AppointmentStatus) {
  const appt = await prisma.appointment.findUnique({ where: { id } });
  if (!appt) throw ApiError.notFound('Appointment');

  if (!TRANSITIONS[appt.status].includes(to)) {
    throw ApiError.conflict('INVALID_TRANSITION', `Cannot change ${appt.status} to ${to}`);
  }
  const { start, end } = dayRange(today());
  const isToday = appt.startTime >= start && appt.startTime < end;
  if ((to === 'CHECKED_IN' || to === 'IN_PROGRESS') && !isToday) {
    throw ApiError.conflict('NOT_TODAY', 'Patients can only be checked in on the day of their appointment');
  }
  if (to === 'IN_PROGRESS') {
    const busy = await prisma.appointment.findFirst({
      where: { providerId: appt.providerId, status: 'IN_PROGRESS', id: { not: id } },
    });
    if (busy) throw ApiError.conflict('DOCTOR_BUSY', 'Complete the current patient first');
  }

  const result = await prisma.appointment.updateMany({
    where: { id, status: appt.status },
    data: { status: to, ...(to === 'CHECKED_IN' ? { checkedInAt: new Date() } : {}) },
  });
  if (result.count === 0) {
    throw ApiError.conflict('STALE_UPDATE', 'This appointment was just changed by someone else. Refresh and try again.');
  }
  notifyQueueChanged(appt.providerId);
  return prisma.appointment.findUniqueOrThrow({ where: { id }, include: apptInclude });
}
