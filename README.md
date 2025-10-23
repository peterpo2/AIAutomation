# SmartOps Operations Console

SmartOps delivers an end-to-end automation workspace for the Dropbox → Upload Queue → TikTok publishing flow. The platform pairs a Vite/React frontend with an Express/TypeScript backend that is ready for containerised deployment. Access is intentionally limited to three role types:

- **Admin** – you, the platform owner.
- **CEO** – executive oversight with approval authority.
- **Team** – a shared pool for up to five collaborators.

There is no client/stakeholder role anymore; every authenticated account fits into one of the categories above.

## Tech stack

| Layer | Tooling | Responsibilities |
| --- | --- | --- |
| Frontend | React 18 · Vite · Tailwind CSS | Auth flows, dashboard, Dropbox browser, uploads & reports |
| Backend | Express · TypeScript | Firebase-authenticated REST API, Dropbox sync, uploads, analytics |
| Database | PostgreSQL via Prisma | User directory, content queue, job logs |
| Queueing | BullMQ · Redis | Recurring sync jobs, analytics summaries |
| AI | OpenAI Responses API | Weekly performance digests |

## Repository layout

```
/ (repo root)
├─ src/                  # Frontend source (React + Tailwind)
├─ server/               # Backend API (Express + Prisma)
│  ├─ src/modules/auth   # Role, permission, and Firebase middleware
│  ├─ src/modules/dropbox# Dropbox integration services
│  ├─ src/modules/uploads# Upload queue endpoints
│  └─ ...                # Reports, notifications, scheduler, etc.
├─ public/               # Static assets served by Vite
├─ docker-compose.yml    # Local/VPS multi-service stack
└─ README.md             # You are here
```

## Quick start with Docker

The repository ships with a production-like stack that runs locally or on a VPS.

```bash
docker compose up -d --build
```

Services start on the following ports by default:

- Frontend: http://localhost
- Backend API: http://localhost:8080
- PostgreSQL: 5432
- Redis: 6379

Shut everything down with `docker compose down` and follow logs with `docker compose logs -f`.

## Workspace roles & seat policy

| Role | Description | Seat notes |
| --- | --- | --- |
| Admin | Full platform control. Manages automation settings, integrations, and users. | Reserved seat (immutable) |
| CEO | Executive visibility with approvals, analytics, and high-level reporting. | Reserved seat (immutable) |
| Team | Day-to-day operators. Manage uploads, review analytics, and monitor automations. | Shared pool capped at **5** concurrent accounts |

### Default workspace accounts

The backend seeds demo accounts on first launch. Override any credential via environment variables if desired.

| Role | Email | Password | Display name |
| --- | --- | --- | --- |
| Admin | `admin@smartops.test` | `DemoAdmin123!` | SmartOps Administrator |
| CEO | `ceo@smartops.test` | `DemoCeo123!` | SmartOps CEO |
| Team | `marketing@smartops.test` | `DemoTeam123!` | Marketing Strategist |
| Team | `creative@smartops.test` | `DemoTeam123!` | Creative Producer |
| Team | `operations@smartops.test` | `DemoOps123!` | Operations Specialist |
| Team | `editor@smartops.test` | `DemoTeam123!` | Content Editor |
| Team | `analyst@smartops.test` | `DemoTeam123!` | Performance Analyst |

Only five team members can be active simultaneously by default. Adjust the cap with `SMARTOPS_MAX_TEAM` (and optionally `SMARTOPS_MAX_USERS`) if you need more seats.

## Environment configuration

Create a `.env` file in the repository root (copy from `.env.example`) and populate the following values:

### Core integrations

| Variable | Purpose |
| --- | --- |
| `OPENAI_API_KEY` | Enables AI-generated weekly summaries |
| `DROPBOX_APP_KEY`, `DROPBOX_APP_SECRET`, `DROPBOX_REFRESH_TOKEN` | Scoped Dropbox app credentials |
| `DATABASE_URL` | PostgreSQL connection string (defaults to the bundled container) |
| `REDIS_URL` | Redis connection string |

### Firebase authentication

| Variable | Purpose |
| --- | --- |
| `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` | Firebase Admin SDK configuration |
| `FIREBASE_ADMIN_EMAIL` / `FIREBASE_ADMIN_UID` | Locks the Admin seat |
| `FIREBASE_CEO_EMAIL` / `FIREBASE_CEO_UID` | Locks the CEO seat |
| `FIREBASE_ADMIN_PASSWORD`, `FIREBASE_CEO_PASSWORD` | Optional bootstrap passwords |
| `SMARTOPS_TEAM_[1-5]_EMAIL` / `_PASSWORD` / `_NAME` | Overrides for the seeded team accounts |

### Frontend (Vite) variables

Prefix public Firebase values with `VITE_` so Vite exposes them to the browser:

```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_VAPID_KEY=...
```

### Seat limits

| Variable | Default | Behaviour |
| --- | --- | --- |
| `SMARTOPS_MAX_TEAM` | `5` | Maximum number of active Team members |
| `SMARTOPS_MAX_USERS` | `SMARTOPS_MAX_TEAM + 2` | Hard ceiling for total accounts (including Admin & CEO) |

## Local development scripts

From the repository root:

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite dev server (frontend) |
| `npm run build` | Production build for the frontend |
| `npm run lint` | ESLint check |
| `npm run typecheck` | TypeScript project validation |

Backend commands live under the `server/` directory. Run `npm install` once, then use:

| Command | Description |
| --- | --- |
| `npm run start:dev` | Nodemon-powered API watcher |
| `npm run build` | Compile TypeScript to JavaScript |
| `npm run prisma:migrate` | Apply Prisma migrations |

## Deployment checklist

1. Prepare the `.env` file with production credentials.
2. Configure DNS and SSL for your chosen domain.
3. Deploy with `docker compose up -d --build` on the server.
4. Run `docker compose exec backend npx prisma migrate deploy` to apply database schema changes.
5. Log in with the reserved Admin account, confirm the CEO seat, and invite (at most) five Team members.

## License

Proprietary – SmartOps Agency. All rights reserved.
