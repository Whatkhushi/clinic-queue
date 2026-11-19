import bcrypt from 'bcryptjs';
import request from 'supertest';
import { DateTime } from 'luxon';
import type { Role } from '@prisma/client';
import { createApp } from '../src/app.js';
import { prisma } from '../src/db.js';

export const app = createApp();
export const api = () => request(app);

export async function resetDb() {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "Appointment", "WorkingHours", "Provider", "RefreshToken", "User" RESTART IDENTITY CASCADE',
  );
}

let counter = 0;

/** Create a user directly in the DB and log in; returns the access token. */
export async function loginAs(role: Role) {
  const email = `${role.toLowerCase()}${++counter}@test.dev`;
  await prisma.user.create({
    data: { name: `${role} ${counter}`, email, role, passwordHash: await bcrypt.hash('password123', 4) },
  });
  const res = await api().post('/api/v1/auth/login').send({ email, password: 'password123' });
  return res.body.accessToken as string;
}

/** A doctor who works every day, all day, so tests don't depend on the clock. */
export async function createProvider(slotMinutes = 15) {
  return prisma.provider.create({
    data: {
      name: 'Dr. Test',
      specialty: 'General',
      slotMinutes,
      workingHours: { create: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ dayOfWeek: d, startMinute: 0, endMinute: 1440 })) },
    },
  });
}

/** Tomorrow's date (YYYY-MM-DD) in the clinic time zone. */
export function tomorrowDate() {
  return DateTime.now().setZone(process.env.CLINIC_TZ).plus({ days: 1 }).toISODate()!;
}

/** Tomorrow at HH:MM in the clinic time zone, as an ISO string. */
export function tomorrowAt(hour: number, minute = 0) {
  return DateTime.now()
    .setZone(process.env.CLINIC_TZ)
    .plus({ days: 1 })
    .set({ hour, minute, second: 0, millisecond: 0 })
    .toUTC()
    .toISO()!;
}
