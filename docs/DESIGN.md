# ClinicQ: Design Document

## 1. Problem

Small clinics (and salons, labs, service centres) run their day on phone calls and a paper register:

- Patients don't know when they'll be seen, so they arrive early and sit in a crowded waiting room for an hour.
- Two people get booked into the same slot because the receptionist and the phone line don't share state.
- Walk-ins and booked patients are mixed with no visible order, which causes arguments at the front desk.
- The owner has no record of no-shows or how busy each doctor is.

## 2. Solution

ClinicQ is a web app with three roles:

| Role | Can do |
|---|---|
| **Patient** | Browse doctors, see free slots, book or cancel, and watch their **live position in the queue** on the day |
| **Staff** (reception) | See each doctor's schedule for a day, check patients in, start/complete visits, mark no-shows, add walk-ins |
| **Admin** (owner) | Everything staff can do, plus add doctors, set their working hours, and create staff accounts |

There is also a public **queue board** (`/board/:providerId`) meant for a TV in the waiting room that shows who is being seen and how many are waiting. It shows no names.

## 3. Architecture

```
 Browser (React SPA)
    │  REST (JSON)  /api/v1/*         WebSocket (Socket.IO)
    ▼                                   ▼
 ┌───────────────────────── Node.js process ─────────────────────────┐
 │ Express app                                                       │
 │  helmet · rate-limit · pino logs · zod validation · JWT auth      │
 │  routes → services → Prisma ORM                                   │
 │ Socket.IO server: clients join room "provider:<id>" and get a     │
 │   `queue:updated` ping whenever that doctor's queue changes       │
 │ In production it also serves the built React files (same origin)  │
 └───────────────────────────────────────────────────────────────────┘
    │ SQL (TCP 5432)
    ▼
 PostgreSQL
```

**One deployable unit.** The React build is served by the same Express server, so the whole app is a single Docker image with a single URL. Because the frontend and API share an origin, there is no CORS setup in production and the refresh-token cookie works without third-party-cookie problems.

**Realtime design.** Socket events carry no data, only "provider 3's queue changed". The client then refetches over the normal authenticated REST API. This keeps all authorization in one place (REST) and avoids leaking patient data over sockets.

## 4. Data model

```
User ───────────────< Appointment >──────────── Provider ───< WorkingHours
 id                    id                         id            providerId
 name                  patientId?  (null=walk-in) name          dayOfWeek 0-6
 email (unique)        walkInName?                specialty     startMinute
 passwordHash          providerId                 slotMinutes   endMinute
 role PATIENT|STAFF|   startTime / endTime (UTC)  active
      ADMIN            status                                  
                       isWalkIn                   
 RefreshToken          checkedInAt                
  userId, tokenHash,   createdAt / updatedAt      
  expiresAt, revokedAt
```

Appointment status is a small state machine:

```
BOOKED ──► CHECKED_IN ──► IN_PROGRESS ──► COMPLETED
  │            │
  ├──► NO_SHOW └──► CANCELLED
  └──► CANCELLED
```

Any other transition returns **409 Conflict**.

## 5. Key engineering decisions (interview talking points)

### 5.1 Preventing double booking

The naive approach is to check whether the slot is free and then insert. Two requests that arrive at the same moment both pass the check, and both insert. That's a race condition.

The fix: the **database** is the source of truth. A *partial unique index*:

```sql
CREATE UNIQUE INDEX appointment_active_slot_unique
  ON "Appointment" ("providerId", "startTime")
  WHERE status <> 'CANCELLED' AND "isWalkIn" = false;
```

- The second insert fails with a unique violation (Prisma code `P2002`), which the API turns into **409 Conflict: slot already booked**.
- It's *partial* so a **cancelled** booking frees the slot for someone else, and walk-ins (which don't occupy a booked slot) are ignored.
- The app still does a friendly pre-check, but correctness doesn't depend on it. `tests/booking.test.ts` fires 10 parallel bookings at one slot and asserts exactly one succeeds.

### 5.2 Queue position

On the day, the queue for a doctor is every appointment with status `CHECKED_IN`, ordered by `startTime` (walk-ins get `startTime = time they arrived`). A patient's position is the number of checked-in people ahead of them, and the estimated wait is that number times the doctor's `slotMinutes`, plus one more slot if someone is currently `IN_PROGRESS`. This is computed with a query, not stored, so it can never drift out of sync.

### 5.3 Time zones

All timestamps are stored in **UTC**. A doctor's working hours are stored as minutes since local midnight (`540` = 9:00) in the clinic's time zone (`CLINIC_TZ`, e.g. `Asia/Kolkata`). Slot generation converts local times to UTC with Luxon, so it stays correct no matter what time zone the server runs in.

### 5.4 Authentication

- Passwords are hashed with **bcrypt**.
- Login returns a short-lived **access token** (JWT, 15 min), which the client keeps in memory, not localStorage, so XSS can't easily steal it.
- A long-lived **refresh token** (random, 7 days) is set as an `httpOnly`, `SameSite=Strict` cookie. Only its **SHA-256 hash** is stored in the DB.
- **Rotation**: each refresh revokes the old token and issues a new one. Logout revokes it server-side.
- Authorization is role middleware: `requireRole('STAFF', 'ADMIN')`.

### 5.5 API conventions

- Versioned: `/api/v1`.
- Resource URLs, correct verbs and status codes: `201` created, `400` validation, `401` not logged in, `403` wrong role, `404`, `409` conflict, `429` rate-limited.
- One error shape everywhere: `{ "error": { "code": "SLOT_TAKEN", "message": "...", "details": ... } }`.
- Input validated with **zod** at the edge; handlers only ever see typed, valid data.

## 6. REST API

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/v1/auth/register` | – | Create patient account |
| POST | `/api/v1/auth/login` | – | Get access token + refresh cookie |
| POST | `/api/v1/auth/refresh` | cookie | Rotate refresh token, new access token |
| POST | `/api/v1/auth/logout` | cookie | Revoke refresh token |
| GET | `/api/v1/auth/me` | any | Current user |
| GET | `/api/v1/providers` | – | List active doctors |
| GET | `/api/v1/providers/:id` | – | One doctor + working hours |
| GET | `/api/v1/providers/:id/slots?date=YYYY-MM-DD` | – | Free/taken slots for a day |
| GET | `/api/v1/providers/:id/queue` | – | Public queue summary (no names) |
| POST | `/api/v1/providers` | admin | Create doctor + working hours |
| PATCH | `/api/v1/providers/:id` | admin | Update doctor / working hours |
| POST | `/api/v1/appointments` | patient | Book a slot |
| GET | `/api/v1/appointments/me` | patient | My appointments, with live queue position |
| GET | `/api/v1/appointments?providerId=&date=` | staff | A doctor's schedule for a day |
| POST | `/api/v1/appointments/walk-in` | staff | Add a walk-in straight into the queue |
| PATCH | `/api/v1/appointments/:id/status` | staff | Check in / start / complete / no-show |
| POST | `/api/v1/appointments/:id/cancel` | owner or staff | Cancel |
| POST | `/api/v1/admin/staff` | admin | Create a staff account |
| GET | `/api/health` | – | Liveness + DB check (used by Docker/Render) |

## 7. Out of scope (possible next steps)

SMS/email reminders, payments, multi-clinic tenancy, OpenAPI/Swagger docs, analytics.
