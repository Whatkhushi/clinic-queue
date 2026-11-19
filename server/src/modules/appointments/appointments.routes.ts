import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { ApiError } from '../../lib/errors.js';
import { dayRange } from '../../lib/time.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { addWalkIn, apptInclude, book, changeStatus, queuesFor, serialize } from './appointments.service.js';

export const appointmentsRouter = Router();
appointmentsRouter.use(requireAuth);

const idParams = z.object({ id: z.coerce.number().int().positive() });

// ---------- Patient ----------

const bookBody = z.object({
  providerId: z.number().int().positive(),
  startTime: z.string().datetime({ offset: true }).transform((s) => new Date(s)),
});

appointmentsRouter.post('/', requireRole('PATIENT'), validate({ body: bookBody }), async (req, res) => {
  const { providerId, startTime } = res.locals.body as z.infer<typeof bookBody>;
  const appt = await book(req.user!.sub, providerId, startTime);
  res.status(201).location(`/api/v1/appointments/${appt.id}`).json({ appointment: serialize(appt) });
});

appointmentsRouter.get('/me', requireRole('PATIENT'), async (req, res) => {
  const appts = await prisma.appointment.findMany({
    where: { patientId: req.user!.sub },
    include: apptInclude,
    orderBy: { startTime: 'desc' },
    take: 50,
  });
  const queues = await queuesFor(appts);
  res.json({ appointments: appts.map((a) => serialize(a, queues.get(a.providerId))) });
});

// ---------- Staff / admin ----------

const scheduleQuery = z.object({
  providerId: z.coerce.number().int().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
});

appointmentsRouter.get('/', requireRole('STAFF', 'ADMIN'), validate({ query: scheduleQuery }), async (_req, res) => {
  const { providerId, date } = res.locals.query as z.infer<typeof scheduleQuery>;
  const { start, end } = dayRange(date);
  const appts = await prisma.appointment.findMany({
    where: { providerId, startTime: { gte: start, lt: end } },
    include: apptInclude,
    orderBy: { startTime: 'asc' },
  });
  const queues = await queuesFor(appts);
  res.json({ appointments: appts.map((a) => serialize(a, queues.get(a.providerId))) });
});

const walkInBody = z.object({
  providerId: z.number().int().positive(),
  name: z.string().trim().min(2).max(80),
});

appointmentsRouter.post('/walk-in', requireRole('STAFF', 'ADMIN'), validate({ body: walkInBody }), async (_req, res) => {
  const { providerId, name } = res.locals.body as z.infer<typeof walkInBody>;
  const appt = await addWalkIn(providerId, name);
  res.status(201).json({ appointment: serialize(appt) });
});

const statusBody = z.object({ status: z.enum(['CHECKED_IN', 'IN_PROGRESS', 'COMPLETED', 'NO_SHOW']) });

appointmentsRouter.patch(
  '/:id/status',
  requireRole('STAFF', 'ADMIN'),
  validate({ params: idParams, body: statusBody }),
  async (_req, res) => {
    const { id } = res.locals.params as z.infer<typeof idParams>;
    const { status } = res.locals.body as z.infer<typeof statusBody>;
    res.json({ appointment: serialize(await changeStatus(id, status)) });
  },
);

// ---------- Patient (own) or staff ----------

appointmentsRouter.post('/:id/cancel', validate({ params: idParams }), async (req, res) => {
  const { id } = res.locals.params as z.infer<typeof idParams>;
  const appt = await prisma.appointment.findUnique({ where: { id } });
  if (!appt) throw ApiError.notFound('Appointment');

  const isStaff = req.user!.role === 'STAFF' || req.user!.role === 'ADMIN';
  // Patients get 404 (not 403) for other people's appointments so they can't
  // probe which appointment IDs exist.
  if (!isStaff && appt.patientId !== req.user!.sub) throw ApiError.notFound('Appointment');

  res.json({ appointment: serialize(await changeStatus(id, 'CANCELLED')) });
});
