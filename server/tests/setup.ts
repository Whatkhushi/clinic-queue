// Tests need a real Postgres. Point TEST_DATABASE_URL (or DATABASE_URL) at a
// throwaway database and run `npx prisma migrate deploy` against it first.
// CI does this automatically (see .github/workflows/ci.yml).
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
process.env.JWT_SECRET ??= 'test-secret-at-least-16-chars';
process.env.CLINIC_TZ ??= 'Asia/Kolkata';
