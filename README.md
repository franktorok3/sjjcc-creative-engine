# SJJCC Creative Engine

Standalone proof-of-concept: **Google Form → Canva Brand Template Autofill → Basecamp Message Board**.

This is a thin test harness, not a production workflow system. No AI generation, approval flows, user management, or generic workflow builders.

## Architecture

```text
Google Form
  → linked response Google Sheet
  → Apps Script installable onFormSubmit
  → POST /api/form-submit  (X-Webhook-Secret)
  → Canva Connect Brand Template Autofill (async poll)
  → editable Canva design URL
  → Basecamp Message Board post
```

## Stack

- Next.js App Router + TypeScript
- pnpm
- Zod
- Vitest

## Local setup

```bash
cp .env.example .env.local
# fill Canva, Basecamp, and GOOGLE_FORM_WEBHOOK_SECRET

pnpm install
pnpm dev
```

Open http://localhost:3000

## API routes

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/health` | Liveness |
| GET | `/api/canva/connect` | Start Canva OAuth (PKCE) |
| GET | `/api/canva/callback` | OAuth callback / token store |
| GET | `/api/basecamp/connect` | Start Basecamp / Launchpad OAuth |
| GET | `/api/basecamp/callback` | OAuth callback / token store + accounts |
| GET | `/api/test/canva/templates` | Auth check + list brand templates (AI Marketing 2.0 prioritized) |
| GET | `/api/test/canva/brand-check` | Brand Kit / structure / dataset role report |
| GET | `/api/test/canva/template-dataset` | Dataset fields for configured template |
| POST | `/api/test/canva/autofill` | Create one autofilled design |
| GET/POST | `/api/test/basecamp` | Auth check / TEST message |
| GET | `/api/test/basecamp/projects` | List projects (discover boards) |
| GET | `/api/test/basecamp/project` | Message Board id for `?projectId=` |
| POST | `/api/form-submit` | Full Form → Canva → Basecamp webhook |

## Field mapping

Brand Kit for production: **AI Marketing 2.0** (see `config/canva-brand.ts`).

Edit `config/form-to-canva.ts` **and** `config/canva-brand.ts` **after** inspecting the live template dataset:

```bash
curl -s http://localhost:3000/api/test/canva/brand-check | jq
curl -s http://localhost:3000/api/test/canva/template-dataset | jq
```

Do not guess Canva autofill field names.

Locked template chrome (bottom brand bar, SJJCC + UJA logos) must remain in the Brand Template itself. Autofill only fills variable content + QR image (from destination URL).

## Google Apps Script

See `docs/google-form-trigger.gs`.

## Token persistence

Local OAuth tokens are encrypted in `.data/canva-tokens.enc` (gitignored).

**On Vercel, the local filesystem is ephemeral and not shared across instances.** Do not rely on it for production token persistence — use an external store (DB / KV / secrets manager). Env-provided `CANVA_ACCESS_TOKEN` + `CANVA_REFRESH_TOKEN` work for short local tests.

## Dev commands

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Quick test sequence

See **[QUICK_TEST.md](./QUICK_TEST.md)** — run TEST 1 → TEST 8 in order; stop on first failure.
