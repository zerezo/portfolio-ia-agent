# Portfolio IA Agent

Interactive personal portfolio of Alejandro Cerezo: a CV page with an AI agent that answers questions about it, plus a contact form to request a meeting.

**Live:** https://portfolio-ia-agent.alezerezo.workers.dev · **API:** https://portfolio-ia-agent-production.up.railway.app (custom domain `alejandrocerezo.dev` pending)

## Version 1.0 (current release)

v1.0 is the first public release and is frozen: it only receives security or bug fixes. New work happens in v2.0.

What v1.0 includes:

- **CV + chat** side by side. The agent (Claude Haiku 5.5 in production, Ollama `qwen2.5:7b` locally) answers only about the CV using tool calling (`search_cv`, keyword search over `backend/data/cv.json`).
- **Pre-model guard** (`guard.js`): blocks prompt manipulation and off-topic questions at zero cost.
- **Contact form** without AI: weekly slot picker (video call, phone or email), deterministic validation, approve/reject links signed with HMAC, calendar invitations (`.ics`) and Jitsi rooms, emails via the Gmail API.
- **Persistence** in PostgreSQL (contact requests and chat sessions), SQL migrations applied at startup.
- **Security**: rate limits per IP and global, strict CSP and security headers, CORS limited to the frontend, no visitor content in production logs.

## Architecture

```
Browser ──► Cloudflare (DNS, WAF, Workers static assets)  portfolio-ia-agent.alezerezo.workers.dev
   │
   └──► Railway API (*.up.railway.app) ──► Railway: Node.js + Express ──► PostgreSQL (Railway)
                                          ├──► Anthropic API (Claude Haiku 5.5)
                                          └──► Gmail API (HTTPS)
```

| Folder | Content |
|---|---|
| `backend/` | Express API: agent loop, guard, tools, sessions, calendar, contacts, mailer, migrations, tests |
| `frontend/` | React + Vite; deployed to Cloudflare Workers (`wrangler.jsonc`) |
| `.github/workflows/` | CI: install, audit, syntax check, tests (with a Postgres service), frontend build |

## Run locally

Requirements: Node 22, Docker, Ollama with `qwen2.5:7b`.

```bash
docker compose up -d                 # local PostgreSQL
cd backend && cp .env.example .env   # fill in the variables
npm install && npm run dev           # API on http://localhost:3000
cd ../frontend && npm install && npm run dev   # web on http://localhost:5173
```

Tests: `cd backend && npm test` (no real model or email calls; PostgreSQL tests need `TEST_DATABASE_URL`).

## Roadmap (v2.0)

- Dashboard-style frontend (no scroll, side navbar) with shadcn/ui: CV + Agent, Calendar, Architecture map.
- Orchestrator agent with two tools: CV lookup and a RAG over Markdown documents stored in Cloudflare R2 (accessed only from the backend).
- CV moved out of code into a Markdown file or PostgreSQL.
- Separate `dev` and `prod` environments in Railway, each with its own frontend.
- Explicit English/Spanish support in the prompt.

See [PRIVACY.md](PRIVACY.md) for the privacy policy.
