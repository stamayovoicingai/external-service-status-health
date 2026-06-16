# Service Health · External service monitor

An **Uptime Kuma**-style app to watch the health of Qdrant, OpenAI, Deepgram, ElevenLabs and Soniox.
Backend in **Node + TypeScript + Express**, frontend in **React + Vite**.

It distinguishes two levels of health:

1. **Official status (status-feed)** — global provider outages, via their public status pages. No API key required.
2. **Account / billing (account)** — your own problems: expired API key (`401`), payment failure (`402`), restricted account (`403`), exhausted quota (`429`). Detected by calling the real API with your key. Enabled only if you set the key in `.env`.

## Health sources per service

| Service     | Source                                                       | Key |
| ----------- | ------------------------------------------------------------ | --- |
| OpenAI      | `status.openai.com/api/v2/summary.json` (Statuspage)         | No  |
| Deepgram    | `status.deepgram.com/api/v2/summary.json` (Statuspage)       | No  |
| ElevenLabs  | `status.elevenlabs.io/api/v2/summary.json` (Statuspage)      | No  |
| Soniox      | `status.soniox.com/api/v2/summary.json` (Better Uptime)      | No  |
| Qdrant      | `GET {QDRANT_URL}/healthz` (+ optional `/cluster`)           | URL + api-key |
| *-account   | Authenticated call to the real API (detects key/billing/quota)| Yes |

## Quick start

```bash
# 1. Install dependencies (backend + frontend)
npm install                 # root (concurrently)
npm run install:all         # backend and frontend

# 2. (Optional) configure keys
cp .env.example .env        # fill in whatever you want; the status pages work without this

# 3. Run everything (backend :4000 + frontend :5173)
npm run dev
```

Open **http://localhost:5173**. The frontend proxies `/api` to the backend on `:4000`.

> The `.env` is read from the repo root. If you prefer it inside `backend/`, move it there.

## Backend API

| Method | Path                          | Description                          |
| ------ | ----------------------------- | ------------------------------------ |
| GET    | `/api/health`                 | Liveness of the monitor itself       |
| GET    | `/api/services`               | Status of all services + overall     |
| GET    | `/api/services/:id`           | Status of a single service           |
| POST   | `/api/services/:id/check`     | Force an immediate re-check          |

## Deploying on Easypanel (recommended · single service)

A single service: the backend serves the built frontend (one domain, no CORS).
Always-on, ideal for polling. Uses the `Dockerfile` at the root.

1. Easypanel → **Create Service → App** → connect this repo (branch `main`).
2. **Build:** **Dockerfile** method (repo root). The `Dockerfile` builds the
   frontend and bundles it with the backend.
3. **Network/Port:** expose port **4000**.
4. **Environment:** add your variables (those from `.env`): `QDRANT_URL`,
   `QDRANT_API_KEY`, `QDRANT_CHECK_CLUSTER=true`, `ELEVENLABS_API_KEY`, and the
   notification ones if you want. **Never** in the repo.
5. **Domains:** add a domain (Easypanel offers a free `*.easypanel.host` one
   with automatic SSL, or use your own).

> **Oracle Cloud:** open ports **80 and 443** both in the *VCN Security List/NSG*
> and in the OS firewall (iptables/firewalld). This is the most common failure.

The frontend uses relative paths (`/api`), so in this mode you do **not** need
`VITE_API_BASE_URL`.

## Alternative deployment (Vercel/Netlify + Render)

The backend is a long-running process (it polls on a scheduler), so it does
**not** run on Vercel serverless. Recommended architecture:

- **Frontend → Vercel** (static Vite)
- **Backend → Render** (always-on Node web service)

### Backend on Render

1. Render → **New → Blueprint** → connect this repo (uses the included `render.yaml`).
   - Manual alternative: **New → Web Service**, Root Directory `backend`,
     Build `npm install`, Start `npm start`.
2. In the service's **Environment**, fill in the variables (the same as `.env`):
   `QDRANT_URL`, `QDRANT_API_KEY`, `ELEVENLABS_API_KEY`, etc. **Never** in the repo.
3. Copy the service's public URL, e.g. `https://your-backend.onrender.com`.

> Render free tier: the service sleeps after ~15 min without traffic (polling
> pauses until the next request). For 24/7 monitoring use a paid plan or an external pinger.

### Frontend on Vercel

1. **Framework Preset:** Vite · **Root Directory:** `frontend` · Output `dist`.
2. In **Settings → Environment Variables** add:
   `VITE_API_BASE_URL = https://your-backend.onrender.com`
3. Redeploy. The frontend will use that URL; locally (without the variable) it uses the Vite proxy.

## How to add a new service

Edit `backend/src/config.ts` and add an object to the list. Available check types
(`backend/src/checks.ts`): `statuspage`, `betteruptime`, `qdrant`, `synthetic`.

## Notes and next steps

- **Persistence**: state lives in memory (`backend/src/store.ts`). For durable
  history, replace the `Store` with SQLite/Postgres.
- **Notifications**: there is already a hook in `store.onTransition(...)`
  (it currently only logs to the console). That's where Telegram / Slack / email / WhatsApp connect.
- **Soniox synthetic**: the default authenticated endpoint (`/v1/models`) is a placeholder;
  adjust it to the real read resource for your plan if you enable `SONIOX_API_KEY`.
- **Qdrant**: `/healthz` is liveness. For a distributed cluster set `QDRANT_CHECK_CLUSTER=true`.
