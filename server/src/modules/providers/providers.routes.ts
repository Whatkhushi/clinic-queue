import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { ApiError } from '../../lib/errors.js';
import { atMinute, dayOfWeek, dayRange } from '../../lib/time.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { getQueue, publicSummary } from '../queue/queue.service.js';

export const providersRouter = Router();

const idParams = z.object({ id: z.coerce.number().int().positive() });
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

const hoursSchema = z
  .array(
    z
      .object({
        dayOfWeek: z.number().int().min(0).max(6),
        startMinute: z.number().int().min(0).max(1440),
        endMinute: z.number().int().min(0).max(1440),
      })
      .refine((h) => h.endMinute > h.startMinute, 'endMinute must be after startMinute'),
  )
  .max(28);

const providerBody = z.object({
  name: z.string().trim().min(2).max(80),
  specialty: z.string().trim().min(2).max(80),
  slotMinutes: z.number().int().min(5).max(120).default(15),
  workingHours: hoursSchema.default([]),
});

const withHours = { workingHours: { orderBy: [{ dayOfWeek: 'asc' as const }, { startMinute: 'asc' as const }] } };

// ---------- Public ----------

providersRouter.get('/', async (_req, res) => {
  const providers = await prisma.provider.findMany({
    where: { active: true },
    orderBy: { name: 'asc' },
    include: withHours,
  });
  res.json({ providers });
});

providersRouter.get('/:id', validate({ params: idParams }), async (_req, res) => {
  const { id } = res.locals.params as z.infer<typeof idParams>;
  const provider = await prisma.provider.findUnique({ where: { id }, include: withHours });
  if (!provider) throw ApiError.notFound('Doctor');
  res.json({ provider });
});

/**
 * All slots for a doctor on a date, each marked available or not.
 * A slot is unavailable if it's in the past or already has an active booking.
 */
const slotsQuery = z.object({ date: dateString });
providersRouter.get('/:id/slots', validate({ params: idParams, query: slotsQuery }), async (_req, res) => {
  const { id } = res.locals.params as z.infer<typeof idParams>;
  const { date } = res.locals.query as z.infer<typeof slotsQuery>;

  const provider = await prisma.provider.findUnique({ where: { id }, include: { workingHours: true } });
  if (!provider || !provider.active) throw ApiError.notFound('Doctor');

  const { start, end, local } = dayRange(date);
  const hours = provider.workingHours.filter((h) => h.dayOfWeek === dayOfWeek(local));

  const booked = await prisma.appointment.findMany({
    where: { providerId: id, startTime: { gte: start, lt: end }, status: { not: 'CANCELLED' }, isWalkIn: false },
    select: { startTime: true },
  });
  const taken = new Set(booked.map((b) => b.startTime.getTime()));
  const now = Date.now();

  const slots = hours
    .sort((a, b) => a.startMinute - b.startMinute)
    .flatMap((h) => {
      const out: { startTime: string; endTime: string; available: boolean }[] = [];
      for (let m = h.startMinute; m + provider.slotMinutes <= h.endMinute; m += provider.slotMinutes) {
        const s = atMinute(local, m);
        out.push({
          startTime: s.toISOString(),
          endTime: atMinute(local, m + provider.slotMinutes).toISOString(),
          available: s.getTime() > now && !taken.has(s.getTime()),
        });
      }
      return out;
    });

  res.json({ date, slotMinutes: provider.slotMinutes, slots });
});

/** Anonymous queue summary for the waiting-room TV board. */
providersRouter.get('/:id/queue', validate({ params: idParams }), async (_req, res) => {
  const { id } = res.locals.params as z.infer<typeof idParams>;
  const provider = await prisma.provider.findUnique({ where: { id }, select: { id: true, name: true, specialty: true } });
  if (!provider) throw ApiError.notFound('Doctor');
  res.json({ provider, ...publicSummary(await getQueue(id)) });
});

// ---------- Admin ----------

providersRouter.post('/', requireAuth, requireRole('ADMIN'), validate({ body: providerBody }), async (_req, res) => {
  const { workingHours, ...data } = res.locals.body as z.infer<typeof providerBody>;
  const provider = await prisma.provider.create({
    data: { ...data, workingHours: { create: workingHours } },
    include: withHours,
  });
  res.status(201).json({ provider });
});

const updateBody = providerBody.partial().extend({ active: z.boolean().optional() });

providersRouter.patch(
  '/:id',
  requireAuth,
  requireRole('ADMIN'),
  validate({ params: idParams, body: updateBody }),
  async (_req, res) => {
    const { id } = res.locals.params as z.infer<typeof idParams>;
    const { workingHours, ...data } = res.locals.body as z.infer<typeof updateBody>;

    // Replace working hours atomically: either both the delete and create
    // happen, or neither does.
    const provider = await prisma.$transaction(async (tx) => {
      await tx.provider.update({ where: { id }, data });
      if (workingHours) {
        await tx.workingHours.deleteMany({ where: { providerId: id } });
        await tx.workingHours.createMany({ data: workingHours.map((h) => ({ ...h, providerId: id })) });
      }
      return tx.provider.findUniqueOrThrow({ where: { id }, include: withHours });
    });
    res.json({ provider });
  },
);
