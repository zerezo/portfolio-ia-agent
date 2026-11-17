# Portfolio IA Agent

Interactive personal portfolio of Alejandro Cerezo: a CV page with an AI agent that answers questions about it, plus a contact form to request a meeting.

**Live:** https://alejandrocerezo.dev · **API:** https://api.alejandrocerezo.dev

Environments: `production` (branch `main`) at the URLs above, and `development` (branch `dev`) at `dev.alejandrocerezo.dev` / `dev-api.alejandrocerezo.dev`, each with its own Railway service, database and keys.

## Version 2.0 (current release)

What v2.0 includes:

- **Dashboard** (React + Tailwind + shadcn/ui, no page scroll): CV + AI assistant side by side, a one-screen booking page and an interactive architecture map (the AI agent and the whole system).
- **Orchestrator agent** (Claude Haiku 5.5 in production, Ollama `qwen2.5:7b` locally) with four tools: `search_cv` (keyword search over the profile), `search_knowledge` (RAG over Markdown documents in Cloudflare R2: what a CV does not say), and `get_availability` / `propose_meeting` to arrange a meeting from the chat. The model proposes, code validates and the visitor confirms. The answer language (English or Spanish) is detected in code.
- **Profile as a single source of truth** (`backend/data/profile.yaml`): the web, the agent, the PDF CV in English and Spanish and the LinkedIn texts are generated from it (see below).
- **Pre-model guard** (`guard.js`): blocks prompt manipulation and off-topic questions at zero cost.
- **Booking** without AI on the Book page: deterministic validation, approve/reject links signed with HMAC, calendar invitations (`.ics`) and Jitsi rooms, emails via the Gmail API.
- **Persistence** in PostgreSQL (contact requests, chat sessions and rate-limit counters), SQL migrations applied at startup.
- **Security**: rate limits per IP and global (persistent), strict CSP and security headers, CORS limited to the frontend, no visitor content in production logs, client names never published (checked in CI).
- **Environments**: `development` and `production`, each with its own Railway service, database, keys and R2 bucket.

v1.0 (tag `v1.0.0`, 2026-10-28) was the first public release: CV page + chat with tool calling over the CV, guard, booking form with approval, Gmail, PostgreSQL, Cloudflare + Railway.

## Architecture

```
Browser ──► Cloudflare (DNS, WAF, Workers static assets)  alejandrocerezo.dev
   │
   └──► api.alejandrocerezo.dev ──► Railway: Node.js + Express ──► PostgreSQL (Railway)
                                          ├──► Anthropic API (Claude Haiku 5.5)
                                          └──► Gmail API (HTTPS)
```

| Folder | Content |
|---|---|
| `backend/` | Express API: agent loop, guard, tools, sessions, calendar, contacts, mailer, migrations, tests |
| `frontend/` | React + Vite + Tailwind + shadcn/ui dashboard (CV + chat, booking, architecture map); deployed to Cloudflare Workers (`wrangler.jsonc`) |
| `.github/workflows/` | CI: install, audit, syntax check, tests (with a Postgres service), frontend build |

## Editing the profile

`backend/data/profile.yaml` is the single source of truth for the profile: the web page, the chat agent (`search_cv`), the PDF CV in English and Spanish, and the LinkedIn texts are all generated from it. Every statement has an id, tags, a priority (1 = always shown, 3 = first to be cut to fit one page), the channels it appears in (`web`, `cv`, `linkedin`, `agent`) and a `verified` flag; unverified statements and `TODO` texts never reach any output. To update it: edit `backend/data/profile.yaml` → `npm run cv` → `npm run linkedin` (from `backend/`; `npm run profile:check` validates the file and `npm run profile:review` lists what is pending). `npm run cv -- --variant fde` builds a CV variant that puts the matching tags first. CI fails if the schema breaks, a client name appears in any output, or the PDFs and LinkedIn texts are out of date.

## Run locally

Requirements: Node 22, Docker, Ollama with `qwen2.5:7b`.

```bash
docker compose up -d                 # local PostgreSQL
cd backend && cp .env.example .env   # fill in the variables
npm install && npm run dev           # API on http://localhost:3000
cd ../frontend && npm install && npm run dev   # web on http://localhost:5173
```

Tests: `cd backend && npm test` (no real model or email calls; PostgreSQL tests need `TEST_DATABASE_URL`).

## v2.0 changes

- ✅ Dashboard-style frontend (no scroll, icon navbar) with shadcn/ui: CV + Agent, Book, interactive architecture map. Live in the `development` environment.
- Orchestrator agent with two tools: CV lookup and a RAG over Markdown documents stored in Cloudflare R2 (accessed only from the backend).
- ✅ Profile as a single source of truth (`backend/data/profile.yaml`): web, agent, PDF CV (EN/ES) and LinkedIn texts.
- Explicit English/Spanish support in the prompt.

See [PRIVACY.md](PRIVACY.md) for the privacy policy.
