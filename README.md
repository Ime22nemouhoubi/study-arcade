# Résidanat — Lockdown

A study-arcade command center to prepare for the Algerian résidanat exam. Full-stack: React/Vite frontend, Node/Express backend, SQLite storage, per-user accounts. One deployable service — Express serves the API **and** the built frontend.

## What's inside

- **Poste (dashboard)** — live countdown to the exam, today's goals, progress rings, daily streak.
- **Plan** — a 3-phase study plan (first pass → consolidation → timed simulations), organized by *appareil* with fundamental science feeding each clinical module, biology kept for the end.
- **QCM** — graded tests, corrected **server-side** (answers never sent to the browser until you submit), with commented explanations. Missed blocks are pushed into **zones faibles** that surface back in the plan.
- **Bibliothèque** — annales indexed by year & épreuve, vetted public resources, and a book selection mapped to the module each one serves best.
- **Modules** — a Lu / QCM / Maîtrisé checklist feeding the analytics.
- **Notes** — organized by block.

All progress is saved to the signed-in account (SQLite).

## Tech

- **Backend:** Node ≥ 22.5, Express, `node:sqlite` (built-in — no native compile), JWT auth (`jsonwebtoken`), `bcryptjs`.
- **Frontend:** React 18 + Vite, plain CSS (no build-time CSS framework, for deploy robustness).
- **One service:** `npm run build` builds the client into `client/dist`; the server serves it with an SPA fallback.

> Note on the database driver: this uses Node's built-in `node:sqlite` (stable in Node 22, flagged experimental) specifically so there's **no native module to compile** at deploy time. That's why `package.json` pins `"node": ">=22.5.0"`.

## Run locally (Windows / Git Bash)

```bash
# 1. install
npm install
npm --prefix client install

# 2. env
cp .env.example .env      # then edit JWT_SECRET

# 3a. dev (two terminals — hot reload)
npm run dev:server        # http://localhost:3000  (API)
npm run dev:client        # http://localhost:5173  (Vite, proxies /api → :3000)

# 3b. OR production-style (single server)
npm run build             # builds client/dist
npm start                 # http://localhost:3000  (serves API + frontend)
```

## Deploy to Railway

Railway builds with Nixpacks. `nixpacks.toml` pins Node 22, `railway.json` sets the build/start commands.

**Important:** Railway's filesystem is ephemeral — the SQLite file must live on a **persistent Volume**, or every redeploy wipes all accounts and progress.

### 1. Push to GitHub

```bash
cd residanat-lockdown
git init
git add .
git commit -m "Résidanat Lockdown — full-stack app"
git branch -M main
git remote add origin https://github.com/<your-username>/residanat-lockdown.git
git push -u origin main
```

### 2. Create the Railway project

1. Railway → **New Project → Deploy from GitHub repo** → pick the repo.
2. Railway detects Nixpacks and runs `npm install && npm run build`, then `npm start`.

### 3. Add a persistent Volume (required for the database)

1. In the service → **Variables/Settings → Volumes → New Volume**.
2. Mount path: **`/data`**.

### 4. Set environment variables

In the service → **Variables**:

| Variable        | Value                                                        |
|-----------------|--------------------------------------------------------------|
| `JWT_SECRET`    | a long random string (e.g. `openssl rand -hex 32`)           |
| `DATABASE_PATH` | `/data/residanat.db`  ← must be inside the mounted volume    |
| `NODE_ENV`      | `production`                                                 |

`PORT` is provided by Railway automatically — don't set it.

### 5. Generate a domain

Service → **Settings → Networking → Generate Domain**. Open it — you should land on the login screen. Register an account and the dashboard loads.

### Redeploys

Push to `main` → Railway rebuilds automatically. Because the DB lives on the `/data` volume, accounts and progress survive redeploys.

## Extending the QCM bank

Questions live in `server/data/qcm.json`. Add objects of this shape:

```json
{
  "id": "cardio-3",
  "block": "cardio",
  "type": "QCM",
  "q": "…",
  "choices": ["…", "…", "…", "…", "…"],
  "answer": [0, 2],
  "why": "explanation shown after grading"
}
```

`type` is `"QCS"` (single answer) or `"QCM"` (multiple). `block` must match an `id` in `server/data/blocks.json`. The bank re-seeds only when the `qcm` table is empty; to force a reseed on an existing DB, clear that table (or bump to a fresh volume).

## Verified

The API passed a 24-check end-to-end suite: health, curriculum, register/login, duplicate-email rejection, JWT-gated routes, server-side grading, hidden answers, weak-area injection, settings/notes/checklist persistence, and full state hydration.
