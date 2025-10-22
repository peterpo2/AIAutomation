# SmartOps Automation Engine

SmartOps Automation Engine combines the Bolt-generated SmartOps frontend with a secure TypeScript backend that automates the Dropbox → Upload Queue → TikTok workflow. The stack is optimized for VPS hosting (Hetzner/Contabo) and ships with Docker-based deployment.

## Architecture Overview

| Layer | Tech | Responsibilities |
| --- | --- | --- |
| Frontend | React 18 · Vite · Tailwind CSS | Auth UI, Dropbox browser, upload manager, reports & settings |
| Backend | Express + TypeScript | Firebase-authenticated REST API, Dropbox sync, upload queue, analytics, notifications |
| Database | PostgreSQL (Prisma ORM) | Users, videos, job logs |
| Queue & Scheduler | BullMQ + Redis | Dropbox sync, weekly uploads, analytics summaries |
| Messaging | Firebase Cloud Messaging | Push notifications for key events |
| AI | OpenAI Responses API | Weekly report summaries |

## Repository Layout

```
/ (repo root)
 ├─ src/                    # React frontend source
 ├─ server/                 # Express + Prisma backend
 │   ├─ src/
 │   │   ├─ main.ts         # API bootstrap & Swagger
 │   │   ├─ modules/
 │   │   │   ├─ auth/       # Firebase auth middleware & role sync
 │   │   │   ├─ dropbox/    # Dropbox sync & webhook validation
 │   │   │   ├─ uploads/    # Upload queue CRUD
 │   │   │   ├─ reports/    # Analytics & OpenAI summaries
 │   │   │   ├─ notifications/ # FCM topic subscriptions & triggers
 │   │   │   └─ scheduler/  # BullMQ recurring jobs
 │   │   └─ prisma/schema.prisma
 │   ├─ Dockerfile
 │   └─ .env.example
 ├─ docker-compose.yml      # Unified frontend + backend stack
 └─ README.md               # (this file)
```

## Prerequisites

- Node.js 20+
- Docker & Docker Compose v2
- Firebase project with Authentication + Cloud Messaging enabled
- Dropbox app (Scoped access) with refresh token
- OpenAI API key
- PostgreSQL & Redis credentials (provided automatically when using Docker Compose)

## Environment Variables

### Frontend (`.env.local`)

Copy `frontend/.env.example` (root `.env.example`) and provide:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_VAPID_KEY=
VITE_DROPBOX_APP_KEY=
```

### Backend (`server/.env`)

```env
DATABASE_URL=postgresql://postgres:supersecret@db:5432/postgres?schema=public
REDIS_URL=redis://redis:6379
PORT=8080
CORS_WHITELIST=https://smartops.yourdomain.com,http://localhost:5173
DROPBOX_APP_KEY=
DROPBOX_APP_SECRET=
DROPBOX_REFRESH_TOKEN=
OPENAI_API_KEY=
CAPTION_LANG=bg
CAPTION_MAX_TOKENS=150
CAPTION_STALE_DAYS=30
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\\n"
FIREBASE_ADMIN_EMAIL=admin@smartops.test
FIREBASE_ADMIN_UID=
```

> **Tip:** The backend automatically promotes the Firebase user whose email or UID matches `FIREBASE_ADMIN_EMAIL` / `FIREBASE_ADMIN_UID` to the `Admin` role inside PostgreSQL.

## Example Admin Credentials

1. In the Firebase console (Authentication → Users) create an email/password user:
   - **Email:** `admin@smartops.test`
   - **Password:** `DemoAdmin123!`
2. Copy the generated UID into `FIREBASE_ADMIN_UID` (optional, but keeps the admin role even if the email changes).
3. Sign in with this account on the frontend to receive full administrator privileges (role assignment happens on first authenticated request to the backend).

> For staging, you can create additional Firebase users and assign roles via the `/api/auth/role` endpoint (requires an Admin token).

## Database Schema (Prisma)

```prisma
model User {
  id         String   @id @default(uuid())
  email      String   @unique
  role       String
  createdAt  DateTime @default(now()) @map("created_at")
  videos     Video[]
}

model Video {
  id         String   @id @default(uuid())
  fileName   String   @map("file_name")
  folderPath String   @map("folder_path")
  dropboxId  String   @map("dropbox_id")
  size       BigInt
  status     VideoStatus
  brand      String?
  caption    String?  @db.Text
  hashtags   String?  @db.Text
  captionGeneratedAt DateTime? @map("caption_generated_at")
  createdAt  DateTime @default(now()) @map("created_at")
  user       User?    @relation(fields: [userId], references: [id])
  userId     String?  @map("user_id")
}

enum VideoStatus {
  pending
  ready
  uploaded
}

model JobsLog {
  id         Int      @id @default(autoincrement())
  jobName    String   @map("job_name")
  status     String
  executedAt DateTime @default(now()) @map("executed_at")
}
```

## Backend Features

- **Auth & Users:** Firebase JWT verification on all protected routes, automatic mirroring into PostgreSQL with role persistence and admin bootstrap.
- **Dropbox Module:**
  - `/api/dropbox/webhook` – signature-validated webhook for incremental sync
  - `/api/dropbox/refresh` – manual sync trigger
  - Signed temporary links for previews
- **Upload Queue:**
  - `/api/uploads` – list & create queue entries
  - `/api/uploads/:id` – update status, caption, brand
  - Auto-upload worker runs every Monday at 10:00 (cron placeholder)
- **Reports:** `/api/reports` returns mock metrics plus OpenAI generated summary
- **Notifications:** FCM topic subscription endpoint and automated pushes for Dropbox changes, upload completions, weekly reports
- **Scheduler:** BullMQ recurring jobs
  - Dropbox sync every 6 hours
  - Upload automation every Monday 10:00
  - Weekly analytics summary every Sunday 18:00
  - Execution history stored in `jobs_log`
- **Swagger:** Available at `/api/docs`

## API Quick Reference

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/api/auth/me` | Returns current user profile & role |
| POST | `/api/auth/role` | Admin-only role assignment |
| POST | `/api/dropbox/refresh` | Enqueue Dropbox sync |
| GET | `/api/dropbox/temporary-link/:id` | Get short-lived video preview link |
| POST | `/api/dropbox/webhook` | Dropbox webhook (signature required) |
| GET | `/api/uploads` | List queued uploads |
| POST | `/api/uploads` | Create queue item |
| PATCH | `/api/uploads/:id` | Update status/metadata |
| GET | `/api/reports` | Weekly analytics & AI summary |
| POST | `/api/notifications/subscribe` | Subscribe FCM token to event topic |

All endpoints except webhook require an `Authorization: Bearer <Firebase ID token>` header.

## Running Locally with Docker Compose

```bash
docker compose up -d --build
```

The stack brings up:

- Frontend: http://localhost (served via Nginx container)
- Backend: http://localhost:8080
- PostgreSQL: localhost:5432 (user `postgres`, password `supersecret`)
- Redis: localhost:6379

After containers start:

1. Run Prisma migrations (inside the backend container):
   ```bash
   docker compose exec backend npx prisma migrate deploy
   docker compose exec backend npx prisma generate
   ```
2. (Optional) Seed roles by hitting `/api/auth/me` with your Firebase admin account.

## Local Development (without Docker)

```bash
# Frontend
npm install
npm run dev

# Backend
cd server
npm install
npm run prisma:generate
npm run dev
```

Ensure PostgreSQL & Redis are running locally and that `DATABASE_URL` / `REDIS_URL` in `server/.env` target them.

## Dropbox Setup Guide

1. Create a Dropbox Scoped App with `files.metadata.read` and `files.content.read` permissions.
2. Generate an app key/secret and add them to `server/.env`.
3. Obtain a refresh token by completing the OAuth 2.0 flow (instructions in Dropbox developer docs) and populate `DROPBOX_REFRESH_TOKEN`.
4. In Dropbox console, add your backend URL (e.g., `https://smartops.yourdomain.com/api/dropbox/webhook`) as the webhook.

## Firebase Admin SDK Configuration

1. Create a service account with Firebase Admin privileges.
2. Download the JSON credentials and copy:
   - `project_id` → `FIREBASE_PROJECT_ID`
   - `client_email` → `FIREBASE_CLIENT_EMAIL`
   - `private_key` → `FIREBASE_PRIVATE_KEY` (escape newlines as `\n`).
3. Enable Firebase Authentication (Email/Password) and Cloud Messaging. Upload your VAPID key to the frontend environment variables.

## Automation & Cron Summary

| Job | Schedule | Description |
| --- | --- | --- |
| Dropbox Sync | Every 6 hours | Pulls new media into `videos` table |
| Upload Automation | Monday @ 10:00 | Placeholder for TikTok API upload |
| Weekly Analytics | Sunday @ 18:00 | Generates AI summary & sends notification |

Execution details are stored in the `jobs_log` table for auditing.

## Deployment Checklist

1. Build environment files (`.env.local`, `server/.env`).
2. Configure DNS to point `smartops.yourdomain.com` to the VPS.
3. Provision SSL certificates through Nginx (already configured in frontend Dockerfile/Nginx config).
4. SSH into the VPS, clone the repository, and run:
   ```bash
   docker compose up -d --build
   docker compose exec backend npx prisma migrate deploy
   ```
5. Verify services:
   - `curl https://smartops.yourdomain.com/health`
   - `curl https://smartops.yourdomain.com/api/docs`

## Troubleshooting

- **Unauthorized errors:** Ensure frontend Firebase config matches backend Firebase project and that ID tokens are forwarded.
- **Dropbox sync failures:** Confirm refresh token validity and webhook signature (check backend logs).
- **OpenAI summary fallback:** Logs will show if the API key is missing or rate limited; the API gracefully returns a placeholder summary.
- **Notifications not firing:** Verify FCM topics (`smartops_dropbox`, `smartops_uploads`, `smartops_reports`) and ensure device tokens are subscribed via `/api/notifications/subscribe`.

## License

Proprietary – SmartOps Agency. All rights reserved.
