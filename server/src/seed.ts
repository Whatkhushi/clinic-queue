/**
 * Demo data so the live site is usable right away.
 * Safe to run more than once: users are upserted, doctors are only created
 * if none exist yet.
 *
 * Demo logins (shown on the login page):
 *   admin@clinicq.dev   / admin1234
 *   staff@clinicq.dev   / staff1234
 *   patient@clinicq.dev / patient1234
 */
import bcrypt from 'bcryptjs';
import { PrismaClient, type Role } from '@prisma/client';

const prisma = new PrismaClient();

const users: { name: string; email: string; password: string; role: Role }[] = [
  { name: 'Dr. Owner (Admin)', email: 'admin@clinicq.dev', password: 'admin1234', role: 'ADMIN' },
  { name: 'Riya (Reception)', email: 'staff@clinicq.dev', password: 'staff1234', role: 'STAFF' },
  { name: 'Aarav Patient', email: 'patient@clinicq.dev', password: 'patient1234', role: 'PATIENT' },
];

const MON_SAT = [1, 2, 3, 4, 5, 6];
const h = (hh: number, mm = 0) => hh * 60 + mm;

const providers = [
  {
    name: 'Dr. Meera Sharma',
    specialty: 'General Physician',
    slotMinutes: 15,
    hours: MON_SAT.flatMap((d) => [
      { dayOfWeek: d, startMinute: h(9), endMinute: h(13) },
      { dayOfWeek: d, startMinute: h(17), endMinute: h(20) },
    ]),
  },
  {
    name: 'Dr. Arjun Rao',
    specialty: 'Pediatrician',
    slotMinutes: 20,
    hours: MON_SAT.map((d) => ({ dayOfWeek: d, startMinute: h(10), endMinute: h(16) })),
  },
  {
    name: 'Dr. Sana Khan',
    specialty: 'Dermatologist',
    slotMinutes: 30,
    hours: [0, 1, 3, 5].map((d) => ({ dayOfWeek: d, startMinute: h(11), endMinute: h(18) })),
  },
];

async function main() {
  for (const u of users) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: { name: u.name, email: u.email, role: u.role, passwordHash: await bcrypt.hash(u.password, 10) },
    });
  }

  if ((await prisma.provider.count()) === 0) {
    for (const p of providers) {
      await prisma.provider.create({
        data: {
          name: p.name,
          specialty: p.specialty,
          slotMinutes: p.slotMinutes,
          workingHours: { create: p.hours },
        },
      });
    }
  }
  console.log('Seed complete');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
