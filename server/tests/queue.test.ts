import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { api, createProvider, loginAs, resetDb } from './helpers.js';

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

describe('queue', () => {
  it('walk-ins join the queue and move through the status flow', async () => {
    const staff = await loginAs('STAFF');
    const doc = await createProvider(10);
    const auth = { Authorization: `Bearer ${staff}` };

    const a = await api().post('/api/v1/appointments/walk-in').set(auth).send({ providerId: doc.id, name: 'Ravi' }).expect(201);
    const b = await api().post('/api/v1/appointments/walk-in').set(auth).send({ providerId: doc.id, name: 'Priya' }).expect(201);

    let q = await api().get(`/api/v1/providers/${doc.id}/queue`).expect(200);
    expect(q.body.waitingCount).toBe(2);
    expect(q.body.nowServing).toBeNull();
    expect(JSON.stringify(q.body)).not.toContain('Ravi'); // public board has no names

    await api().patch(`/api/v1/appointments/${a.body.appointment.id}/status`).set(auth).send({ status: 'IN_PROGRESS' }).expect(200);

    // Doctor is busy: can't start a second patient.
    const busy = await api()
      .patch(`/api/v1/appointments/${b.body.appointment.id}/status`)
      .set(auth)
      .send({ status: 'IN_PROGRESS' })
      .expect(409);
    expect(busy.body.error.code).toBe('DOCTOR_BUSY');

    q = await api().get(`/api/v1/providers/${doc.id}/queue`);
    expect(q.body.nowServing).toBe(a.body.appointment.id);
    expect(q.body.waitingCount).toBe(1);
    expect(q.body.estimatedWaitMinutes).toBe(20); // 1 in progress + 1 waiting, 10 min each

    await api().patch(`/api/v1/appointments/${a.body.appointment.id}/status`).set(auth).send({ status: 'COMPLETED' }).expect(200);

    // Completed is final.
    const bad = await api()
      .patch(`/api/v1/appointments/${a.body.appointment.id}/status`)
      .set(auth)
      .send({ status: 'CHECKED_IN' })
      .expect(409);
    expect(bad.body.error.code).toBe('INVALID_TRANSITION');
  });

  it('patients cannot change appointment status', async () => {
    const patient = await loginAs('PATIENT');
    await api()
      .patch('/api/v1/appointments/1/status')
      .set('Authorization', `Bearer ${patient}`)
      .send({ status: 'COMPLETED' })
      .expect(403);
  });

  it('health check reports the database', async () => {
    const res = await api().get('/api/health').expect(200);
    expect(res.body).toMatchObject({ status: 'ok', db: 'ok' });
  });
});
