import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { ApiError } from '../../lib/errors.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { publicUser } from '../auth/auth.routes.js';

export const adminRouter = Router();
adminRouter.use(requireAuth, requireRole('ADMIN'));

adminRouter.get('/staff', async (_req, res) => {
  const staff = await prisma.user.findMany({
    where: { role: { in: ['STAFF', 'ADMIN'] } },
    orderBy: { name: 'asc' },
  });
  res.json({ staff: staff.map(publicUser) });
});

const staffBody = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(100),
});

adminRouter.post('/staff', validate({ body: staffBody }), async (_req, res) => {
  const { name, email, password } = res.locals.body as z.infer<typeof staffBody>;
  if (await prisma.user.findUnique({ where: { email } })) {
    throw ApiError.conflict('EMAIL_TAKEN', 'An account with this email already exists');
  }
  const user = await prisma.user.create({
    data: { name, email, role: 'STAFF', passwordHash: await bcrypt.hash(password, 10) },
  });
  res.status(201).json({ user: publicUser(user) });
});
