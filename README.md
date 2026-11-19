# ClinicQ: appointments and live queues for small clinics

[![CI](https://github.com/Whatkhushi/clinic-queue/actions/workflows/ci.yml/badge.svg)](https://github.com/Whatkhushi/clinic-queue/actions/workflows/ci.yml)

**Live demo:** _add your Render URL here after deploying_

Small clinics still run on walk-ins, phone calls and a paper register. Patients sit in a crowded waiting room for an hour because they have no idea when they'll be seen, and double bookings happen because nobody shares one source of truth.

**ClinicQ** puts booked and walk-in patients into one live queue:

- **Patients** book a slot online and, on the day, watch their **live position and estimated wait** from their phone.
- **Reception** checks people in, adds walk-ins and moves the queue along from one screen.
- **Owners** manage doctors, working hours and staff accounts.
- A **waiting-room TV board** shows "now seeing" and who's next (ticket numbers only, no names).

### Demo logins

| Role | Email | Password |
|---|---|---|
| Patient | `patient@clinicq.dev` | `patient1234` |
| Reception | `staff@clinicq.dev` | `staff1234` |
| Admin | `admin@clinicq.dev` | `admin1234` |

The login page has one-click buttons for these.

---

## Tech stack

| Layer | Tech |
|---|---|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS, TanStack Query, React Router |
| Backend | Node.js, Express 5, TypeScript, REST API |
| Database | PostgreSQL, Prisma ORM + SQL migrations |
| Auth | JWT access tokens + rotating httpOnly refresh-token cookies, bcrypt |
| Realtime | Socket.IO |
| Validation | Zod |
| Testing | Vitest + Supertest integration tests against real Postgres |
| DevOps | Docker (multi-stage), docker-compose, GitHub Actions CI, Render + Neon |

## Architecture

```
React SPA ──REST /api/v1──▶ Express API ──Prisma──▶ PostgreSQL
    ▲                           │
    └──── Socket.IO ping ◀──────┘  "doctor 3's queue changed" → client refetches
```

In production a single Docker image serves both the API and the built React app from the same origin. That means one URL, no CORS, and same-site cookies.

Full design, data model and reasoning: **[docs/DESIGN.md](docs/DESIGN.md)**

## Engineering highlights

- **No double booking, even under race conditions.** A Postgres *partial unique index* on `(providerId, startTime) WHERE status <> 'CANCELLED'` makes the database reject the second of two simultaneous bookings, and the API returns `409 SLOT_TAKEN`. A test fires 10 parallel requests at one slot and asserts exactly one wins.
- **Appointment state machine.** `BOOKED → CHECKED_IN → IN_PROGRESS → COMPLETED` (plus cancel/no-show). Invalid transitions return 409. Updates use **optimistic concurrency** (`UPDATE … WHERE status = <what I read>`), so two receptionists can't overwrite each other.
- **Secure auth.** Access token kept in memory only. Refresh token in an `httpOnly`, `SameSite=Strict` cookie, stored hashed, **rotated on every use**, with **reuse detection** that revokes all of a user's sessions if a stolen token is replayed.
- **Time-zone-correct slots.** Hours are stored in clinic-local minutes and converted to UTC with Luxon.
- **Realtime without leaking data.** Sockets only say *that* something changed; data is fetched over the authorized REST API.
- **Production basics:** helmet security headers, rate limiting on login, structured JSON logs (pino), `/api/health` with a DB check, graceful shutdown, a non-root container user and a Docker `HEALTHCHECK`.

## REST API

| Method | Endpoint | Who |
|---|---|---|
| POST | `/api/v1/auth/register` · `/login` · `/refresh` · `/logout` | public |
| GET | `/api/v1/auth/me` | logged in |
| GET | `/api/v1/providers` · `/providers/:id` | public |
| GET | `/api/v1/providers/:id/slots?date=YYYY-MM-DD` | public |
| GET | `/api/v1/providers/:id/queue` | public (anonymous) |
| POST · PATCH | `/api/v1/providers` · `/providers/:id` | admin |
| POST | `/api/v1/appointments` | patient |
| GET | `/api/v1/appointments/me` | patient |
| GET | `/api/v1/appointments?providerId=&date=` | staff |
| POST | `/api/v1/appointments/walk-in` | staff |
| PATCH | `/api/v1/appointments/:id/status` | staff |
| POST | `/api/v1/appointments/:id/cancel` | owner or staff |
| GET · POST | `/api/v1/admin/staff` | admin |

Errors always look like `{ "error": { "code": "SLOT_TAKEN", "message": "…" } }`.

---

## Running locally

### Option A: Docker (easiest)

Needs [Docker Desktop](https://www.docker.com/products/docker-desktop/).

```bash
docker compose up --build
```

Open http://localhost:8080. Demo data is loaded automatically.

### Option B: Run the API and frontend directly (hot reload)

Needs Node 22+ and a Postgres. The simplest way to get one is `docker compose up db`.

```bash
# API
cd server
cp .env.example .env
npm install
npx prisma migrate deploy
npm run db:seed
npm run dev            # http://localhost:4000

# Frontend (second terminal)
cd web
npm install
npm run dev            # http://localhost:5173 (proxies /api to :4000)
```

> **Windows without Docker:** `scripts/install-postgres-windows.ps1` installs PostgreSQL 16 and writes `server/.env` for you
> (`powershell -ExecutionPolicy Bypass -File .\scripts\install-postgres-windows.ps1`).
> If PowerShell says "running scripts is disabled", use `npm.cmd` instead of `npm`.

### Tests

```bash
cd server
# point at an empty test database, then:
npx prisma migrate deploy
npm test
```

## Deploying (free)

1. **Database: [Neon](https://neon.tech)**. Create a free project and copy the connection string (`postgresql://…?sslmode=require`).
2. **App: [Render](https://render.com)**. Choose New → Blueprint, pick this repo (it reads `render.yaml`), and paste the Neon URL as `DATABASE_URL`.
3. Render builds the Dockerfile, runs migrations, seeds demo data and gives you a public `https://….onrender.com` URL. Every push to `main` redeploys.

> Render's free tier sleeps after 15 minutes idle, so the first visit after that takes about 30 to 50 seconds to wake up.

## Project structure

```
clinic-queue/
├── server/                 Express API
│   ├── prisma/             schema.prisma + SQL migrations
│   ├── src/
│   │   ├── modules/        auth, providers, appointments, queue, admin
│   │   ├── middleware/     auth, validation, error handling
│   │   ├── lib/            tokens, time zones, errors
│   │   ├── realtime.ts     Socket.IO
│   │   ├── app.ts          Express app setup
│   │   └── index.ts        HTTP server + graceful shutdown
│   └── tests/              integration tests
├── web/                    React app
│   └── src/pages/          Home, Book, MyAppointments, Staff, Admin, Board
├── docs/DESIGN.md          design doc
├── Dockerfile              multi-stage production image
├── docker-compose.yml      local stack
├── render.yaml             deployment blueprint
└── .github/workflows/      CI
```
