# EmailFlow AI

An AI-powered email management app that syncs your email account, classifies emails, extracts actionable tasks, and delivers smart daily digests.

## Features

- **Email Sync** — OAuth-based email integration with incremental sync and configurable start date
- **AI Classification** — Emails are automatically classified by category and priority using Claude / GPT models
- **Task Extraction** — AI pulls actionable tasks out of email threads and links them to projects
- **Daily Digests** — Scheduled digest pipeline summarises your inbox and surfaces what matters
- **Project Contexts** — Group related emails and tasks under named projects for focused views
- **Security**
  - Session management with device tracking and token rotation
  - TOTP-based two-factor authentication (2FA)
  - Step-up authentication for sensitive operations
  - Suspicious login detection and alerts
- **Data Retention** — Configurable retention policies with automated cleanup jobs
- **Admin Panel** — User management and system monitoring at `/admin`

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Database | PostgreSQL via Prisma |
| Queue | BullMQ + Redis |
| AI | Vercel AI SDK (`@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google`) |
| UI | Tailwind CSS v4, shadcn/ui, Radix Base UI |
| Auth | Custom JWT sessions + TOTP |
| Testing | Vitest |

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL
- Redis (for BullMQ job queues)
- A Google OAuth app (Client ID + Secret) for the current email provider

### Setup

```bash
npm install
```

Copy `.env.example` to `.env` and fill in the required values:

```env
DATABASE_URL=postgresql://...
REDIS_URL=redis://localhost:6379
GMAIL_CLIENT_ID=...
GMAIL_CLIENT_SECRET=...
JWT_SECRET=...
ANTHROPIC_API_KEY=...       # optional — for Claude models
OPENAI_API_KEY=...          # optional — for GPT models
```

Apply migrations and seed demo data:

```bash
npx prisma migrate dev
npm run seed
```

Start the dev server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Available Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start dev server (stable restart wrapper) |
| `npm run build` | Generate Prisma client and build for production |
| `npm run test` | Run all tests with Vitest |
| `npm run test:unit` | Run unit tests only |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run seed` | Seed the database with demo data |

## Project Structure

```
src/
├── app/            # Next.js App Router pages and API routes
│   ├── auth/       # Login, registration, TOTP, password reset
│   ├── dashboard/  # Main app: emails, tasks, digests, settings
│   ├── admin/      # Admin panel
│   └── api/        # REST API routes
├── ai/
│   ├── skills/     # AI tasks: classify, extract-task, score-priority, etc.
│   └── workflows/  # Multi-step pipelines: email pipeline, digest pipeline
├── services/       # Business logic (sync, digests, retention, auth)
├── repositories/   # Database access layer (Prisma wrappers)
├── components/     # Shared React components
├── lib/            # Utilities, auth helpers, Redis client
└── types/          # Shared TypeScript types
```

## Deployment

The project includes a `vercel.json` for one-click deployment to Vercel. Set all environment variables in the Vercel project dashboard before deploying.

```bash
npm run build
npm run start
```
