import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { api, createProvider, loginAs, resetDb, tomorrowAt, tomorrowDate } from './helpers.js';

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

describe('booking', () => {
  it('books a free slot and then shows it as unavailable', async () => {
    const token = await loginAs('PATIENT');
    const doc = await createProvider();
    const startTime = tomorrowAt(10);

    const res = await api()
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${token}`)
      .send({ providerId: doc.id, startTime })
      .expect(201);
    expect(res.body.appointment.status).toBe('BOOKED');

    const slots = await api().get(`/api/v1/providers/${doc.id}/slots?date=${tomorrowDate()}`).expect(200);
    const slot = slots.body.slots.find((s: { startTime: string }) => s.startTime === new Date(startTime).toISOString());
    expect(slot).toBeDefined();
    expect(slot.available).toBe(false);
  });

  it('prevents double booking under concurrency: exactly one of 10 parallel requests wins', async () => {
    const doc = await createProvider();
    const tokens = await Promise.all(Array.from({ length: 10 }, () => loginAs('PATIENT')));
    const startTime = tomorrowAt(11);

    const results = await Promise.all(
      tokens.map((t) =>
        api().post('/api/v1/appointments').set('Authorization', `Bearer ${t}`).send({ providerId: doc.id, startTime }),
      ),
    );

    const statuses = results.map((r) => r.status).sort();
    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(9);
    expect(await prisma.appointment.count()).toBe(1);
  });

  it('frees the slot again after cancellation', async () => {
    const doc = await createProvider();
    const [a, b] = [await loginAs('PATIENT'), await loginAs('PATIENT')];
    const startTime = tomorrowAt(12);

    const first = await api()
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${a}`)
      .send({ providerId: doc.id, startTime })
      .expect(201);
    await api()
      .post(`/api/v1/appointments/${first.body.appointment.id}/cancel`)
      .set('Authorization', `Bearer ${a}`)
      .expect(200);
    await api()
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${b}`)
      .send({ providerId: doc.id, startTime })
      .expect(201);
  });

  it('rejects times that are not slot boundaries or in the past', async () => {
    const token = await loginAs('PATIENT');
    const doc = await createProvider(15);
    await api()
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${token}`)
      .send({ providerId: doc.id, startTime: tomorrowAt(10, 7) })
      .expect(400);
    await api()
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${token}`)
      .send({ providerId: doc.id, startTime: '2020-01-01T04:30:00.000Z' })
      .expect(400);
  });

  it("does not let a patient cancel someone else's appointment", async () => {
    const doc = await createProvider();
    const [a, b] = [await loginAs('PATIENT'), await loginAs('PATIENT')];
    const appt = await api()
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${a}`)
      .send({ providerId: doc.id, startTime: tomorrowAt(9) });
    await api()
      .post(`/api/v1/appointments/${appt.body.appointment.id}/cancel`)
      .set('Authorization', `Bearer ${b}`)
      .expect(404);
  });

  it('only staff can see a schedule (403 for patients)', async () => {
    const doc = await createProvider();
    const patient = await loginAs('PATIENT');
    await api()
      .get(`/api/v1/appointments?providerId=${doc.id}&date=2030-01-01`)
      .set('Authorization', `Bearer ${patient}`)
      .expect(403);
  });
});
