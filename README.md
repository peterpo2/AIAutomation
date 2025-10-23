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
 │   │   │   ├─ caption-generator/ # OpenAI-powered caption & hashtag service
 │   │   │   └─ scheduler/  # BullMQ recurring jobs
 │   │   └─ prisma/schema.prisma
 │   ├─ Dockerfile
 │   └─ .env.example
 ├─ docker-compose.yml      # Unified frontend + backend stack
 └─ README.md               # (this file)
```

## Prerequisites

- Docker & Docker Compose v2 (Docker Desktop on Windows/macOS)
- Firebase project with Authentication + Cloud Messaging enabled
- Dropbox app (Scoped access) with refresh token
- OpenAI API key
- Git (optional, for cloning the repository)

## Environment Variables

The entire stack (frontend, backend, Postgres, Redis) reads from a single `.env` file stored in the repository root. Duplicate files such as `.env.local` or `server/.env` are no longer required.

1. Copy `.env.example` to `.env`.
2. Fill in the placeholders with your project-specific credentials.

The file includes:

- **Frontend variables** (`VITE_*`) that Vite injects at build-time.
- **Backend variables** (`DATABASE_URL`, `DROPBOX_*`, `OPENAI_API_KEY`, etc.).
- **Database credentials** (`POSTGRES_*`) reused by both the app and the bundled Postgres container.

> **Tip:** The backend automatically promotes the Firebase user whose email or UID matches `FIREBASE_ADMIN_EMAIL` / `FIREBASE_ADMIN_UID` to the `Admin` role inside PostgreSQL. You can also reserve an executive account by defining `FIREBASE_CEO_EMAIL` or `FIREBASE_CEO_UID`; that user is synchronised with the `CEO` role on every login.

## Run with Docker (local or VPS)

The same files and commands work on Windows, macOS, Linux, and remote VPS hosts.

```bash
docker compose up -d --build
```

- Frontend → `http://localhost`
- Backend API → `http://localhost:8080`
- Postgres → exposed on port `5432`
- Redis → exposed on port `6379`

To stop the stack, run:

```bash
docker compose down
```

Tail logs for all services with:

```bash
docker compose logs -f
```

## Demo Workspace Accounts

Provision the following users in the Firebase console (Authentication → Users) to mirror the five-seat SmartOps workspace. Set `FIREBASE_ADMIN_EMAIL`/`FIREBASE_ADMIN_UID` and `FIREBASE_CEO_EMAIL`/`FIREBASE_CEO_UID` so the backend keeps those roles immutable.

| Role | Email | Password | Notes |
| --- | --- | --- | --- |
| Admin | `admin@smartops.test` | `DemoAdmin123!` | Full platform control, reserved seat |
| CEO | `ceo@smartops.test` | `DemoCeo123!` | Executive overview with approvals & reports |
| Team | `marketing@smartops.test` | `DemoTeam123!` | Standard user for campaign execution |
| Team | `creative@smartops.test` | `DemoTeam123!` | Standard user for asset preparation |
| Client | `client@smartops.test` | `DemoClient123!` | Read-only stakeholder access |

> Invite additional team/client users only after freeing a standard seat—the workspace is capped at five concurrent accounts.

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
- **Caption Generator:** Admin/Team-only endpoint to refresh captions & hashtags via OpenAI with rate limiting
- **Swagger:** Available at `/api/docs`

## API Quick Reference

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/api/auth/me` | Returns current user profile, role, and resolved permissions |
| GET | `/api/auth/users` | Admin/CEO: list all workspace members and immutable assignments |
| GET | `/api/auth/permissions` | Any authenticated user: role catalogue with permission matrix |
| POST | `/api/auth/role` | Admin/CEO: assign roles (immutable admin safeguards) |
| POST | `/api/dropbox/refresh` | Enqueue Dropbox sync |
| GET | `/api/dropbox/temporary-link/:id` | Get short-lived video preview link |
| POST | `/api/dropbox/webhook` | Dropbox webhook (signature required) |
| GET | `/api/uploads` | List queued uploads |
| POST | `/api/uploads` | Create queue item |
| PATCH | `/api/uploads/:id` | Update status/metadata |
| GET | `/api/reports` | Weekly analytics & AI summary |
| POST | `/api/notifications/subscribe` | Subscribe FCM token to event topic |
| POST | `/api/captions/generate/:videoId` | Admin/Team: Regenerate captions and hashtags |

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

When the stack is running, navigating to `http://localhost` immediately renders the SmartOps login screen via the bundled Nginx frontend container.

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

Ensure PostgreSQL & Redis are running locally and that `DATABASE_URL` / `REDIS_URL` in `.env` target them.

## Dropbox Setup Guide

1. Create a Dropbox Scoped App with `files.metadata.read` and `files.content.read` permissions.
2. Generate an app key/secret and add them to `.env`.
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

1. Build the shared environment file (`.env`).
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

## Admin Startup Checklist

Follow these steps the first time you bring SmartOps online (locally or on a VPS):

1. **Install tooling**
   - Windows/macOS: [Docker Desktop](https://www.docker.com/products/docker-desktop) (includes Docker Compose v2)
   - Linux VPS: `sudo apt-get install docker.io docker-compose-plugin`
   - Git for cloning (`winget install Git.Git` on Windows, `sudo apt-get install git` on Debian/Ubuntu)
2. **Clone the repository**
   ```bash
   git clone https://github.com/your-org/smartops.git
   cd smartops
   ```
3. **Create the runtime environment file**
   ```bash
   cp .env.example .env
   ```
4. **Fill in mandatory secrets & URLs inside `.env`**
   - `OPENAI_API_KEY` – required for AI captions and weekly summaries
   - `DROPBOX_APP_KEY`, `DROPBOX_APP_SECRET`, `DROPBOX_REFRESH_TOKEN` – generated from your Dropbox Scoped App
   - `FIREBASE_*` block – copy from your Firebase Admin service account JSON and client config (project ID, private key, client email, API key, auth domain, messaging sender ID, app ID, VAPID key)
   - `FIREBASE_ADMIN_EMAIL` / `FIREBASE_ADMIN_UID` – email/UID of the bootstrap administrator you want promoted on first login
   - `FIREBASE_CEO_EMAIL` / `FIREBASE_CEO_UID` – optional executive account that will always assume the CEO role
   - `SMARTOPS_MAX_USERS` – workspace seat cap (defaults to 5: 1 Admin, 1 CEO, 3 standard members)
   - `DATABASE_URL` – keep the default `postgresql://postgres:supersecret@postgres:5432/postgres` unless you manage Postgres externally
   - `REDIS_URL` – keep the default `redis://redis:6379`
   - Update any domains (e.g., `APP_BASE_URL`, `BACKEND_API_URL`) to match your intended hostnames
5. **Reference snippet for `.env` values**
   ```env
   # Core access keys
   OPENAI_API_KEY=sk-your-openai-key
   DROPBOX_APP_KEY=dropbox-app-key
   DROPBOX_APP_SECRET=dropbox-app-secret
   DROPBOX_REFRESH_TOKEN=dropbox-refresh-token

   # Firebase admin bootstrap
   FIREBASE_ADMIN_EMAIL=admin@smartops.test
   FIREBASE_ADMIN_UID=abcd1234firebaseuid
   FIREBASE_CEO_EMAIL=ceo@smartops.test

   # Seat management
   SMARTOPS_MAX_USERS=5

   # Public Firebase config for the frontend (prefix with VITE_)
   VITE_FIREBASE_API_KEY=your-firebase-api-key
   VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=your-project-id
   VITE_FIREBASE_MESSAGING_SENDER_ID=1234567890
   VITE_FIREBASE_APP_ID=1:1234567890:web:abcdef123456
   VITE_FIREBASE_MEASUREMENT_ID=G-XXXXXXXXXX
   VITE_FIREBASE_VAPID_KEY=BPExampleVapidKey
   ```
6. **Start the stack**
   ```bash
   docker compose up -d --build
   ```
7. **Apply database migrations inside the backend container**
   ```bash
   docker compose exec backend npx prisma migrate deploy
   docker compose exec backend npx prisma generate
   ```
8. **Verify services before handing access to the team**
   - Frontend: http://localhost (or your VPS domain)
   - Backend health check: `curl http://localhost:8080/health`
   - API docs: `curl http://localhost:8080/api/docs`
9. **Create the first admin account**
   - In Firebase Authentication, add the email/UID specified above.
   - Sign into the frontend; the backend will promote this user to the Admin role automatically.
   - Optional: add a second Firebase user whose email/UID matches `FIREBASE_CEO_EMAIL` or `FIREBASE_CEO_UID` for the reserved CEO seat.

10. **Invite up to three standard members**
    - Any additional Firebase logins beyond the Admin/CEO slots will be assigned the standard role (Client by default).
    - SmartOps enforces a hard cap of three standard members (five users total). Remove an existing member before inviting another.

## License

Proprietary – SmartOps Agency. All rights reserved.
