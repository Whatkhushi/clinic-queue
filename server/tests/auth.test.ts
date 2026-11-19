import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { api, resetDb } from './helpers.js';

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

const creds = { name: 'Test User', email: 'test@example.com', password: 'password123' };

function refreshCookie(res: { headers: Record<string, unknown> }) {
  const cookies = res.headers['set-cookie'] as string[];
  return cookies.find((c) => c.startsWith('refresh_token='))!.split(';')[0];
}

describe('auth', () => {
  it('registers a patient and returns an access token + httpOnly refresh cookie', async () => {
    const res = await api().post('/api/v1/auth/register').send(creds).expect(201);
    expect(res.body.accessToken).toBeTypeOf('string');
    expect(res.body.user).toMatchObject({ email: creds.email, role: 'PATIENT' });
    expect(res.body.user.passwordHash).toBeUndefined();
    const cookie = (res.headers['set-cookie'] as unknown as string[]).join(';');
    expect(cookie).toContain('HttpOnly');
  });

  it('rejects a duplicate email with 409', async () => {
    await api().post('/api/v1/auth/register').send(creds).expect(201);
    const res = await api().post('/api/v1/auth/register').send(creds).expect(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('validates input with 400', async () => {
    const res = await api().post('/api/v1/auth/register').send({ email: 'nope' }).expect(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects a wrong password with 401', async () => {
    await api().post('/api/v1/auth/register').send(creds).expect(201);
    await api().post('/api/v1/auth/login').send({ ...creds, password: 'wrong-password' }).expect(401);
  });

  it('protects /me', async () => {
    await api().get('/api/v1/auth/me').expect(401);
    const { body } = await api().post('/api/v1/auth/register').send(creds);
    const me = await api().get('/api/v1/auth/me').set('Authorization', `Bearer ${body.accessToken}`).expect(200);
    expect(me.body.user.email).toBe(creds.email);
  });

  it('rotates refresh tokens and detects reuse of an old one', async () => {
    const reg = await api().post('/api/v1/auth/register').send(creds);
    const first = refreshCookie(reg);

    const r1 = await api().post('/api/v1/auth/refresh').set('Cookie', first).expect(200);
    const second = refreshCookie(r1);
    expect(second).not.toBe(first);

    // Reusing the first (now revoked) token = possible theft -> all sessions revoked.
    await api().post('/api/v1/auth/refresh').set('Cookie', first).expect(401);
    await api().post('/api/v1/auth/refresh').set('Cookie', second).expect(401);
  });

  it('logout revokes the refresh token', async () => {
    const reg = await api().post('/api/v1/auth/register').send(creds);
    const cookie = refreshCookie(reg);
    await api().post('/api/v1/auth/logout').set('Cookie', cookie).expect(204);
    await api().post('/api/v1/auth/refresh').set('Cookie', cookie).expect(401);
  });
});
