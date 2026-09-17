# GRIDLOCK

**Build your grid. Own the weekend.**

GRIDLOCK is a premium, free-to-play fantasy motorsport game. Draft five drivers
and two constructors under a strict budget, name a captain, arm tactical boosts,
make transfers, follow a live race centre, spin up private leagues, and climb a
global grid — all with a cinematic, motorsport-first, mobile-first interface.

> GRIDLOCK is an unofficial fan project for a private group of friends. Driver,
> team and circuit data reflects the real Formula 1 grid (sourced via the
> OpenF1 API) but the product itself is not affiliated with, endorsed by, or
> derived from Formula 1 or any team/driver named here. It is **free-to-play**
> — there is no real-money wagering, deposits, or withdrawals.

The product name is centralised (`product` in the API meta + the `Brand`
component) so it can be rebranded later.

## Stack

- **Frontend:** React 19 + TypeScript + Vite, Framer Motion, lucide-react.
  Original design system (no UI-kit look), inline-SVG telemetry charts (no heavy
  chart lib), installable PWA.
- **Backend:** FastAPI + SQLModel. An **isolated, unit-tested fantasy scoring
  engine**, a `MotorsportDataProvider` adapter (mock/real), and a deterministic
  seeded season.
- **Database:** SQLite locally, Postgres in production (via `DATABASE_URL`).
- **Deploy:** Vercel — static frontend + Python serverless function for the API.

## Architecture

```
backend/app/
  main.py                 FastAPI app (mounts the GRIDLOCK router)
  database.py             SQLModel engine (SQLite / Postgres)
  moderation.py           Username / team-name guard
  gridlock/
    scoring.py            FantasyScoringEngine — pure, deterministic, config-driven
    season.py             Seeded season: real 2026 F1 drivers/constructors/circuits +
                          deterministic race simulation → points, form, prices
    provider.py           MotorsportDataProvider adapter (Mock / Real switch)
    store.py              Cached season, demo managers/leagues, insights, live race
    models.py             User-owned persistence (profiles, teams, leagues)
    schemas.py            Request/response validation (Pydantic + moderation)
    router.py             HTTP transport only — no fantasy rules live here
    tests/test_scoring.py Scoring unit tests (pinned scenarios)
frontend/src/
  lib/          api client, types, session + meta context, formatting/timezone
  components/   Brand, RacingLine (signature graphic), CountUp/Countdown,
                Avatar/Sparkline/Delta, AppShell (sidebar + bottom nav),
                CommandPalette (⌘K)
  features/     landing, onboarding, dashboard, team (+ DriverDrawer, BoostBar),
                drivers, constructors, races (+ CircuitTrace), live, leagues,
                leaderboard, rules, profile
```

Key principles enforced by the layout:

- **Fantasy scoring never lives in React.** It lives in `scoring.py`, is pure and
  deterministic (same events → same points), and is config-driven via
  `DEFAULT_SCORING_RULES` so an admin/DB layer can override any value.
- **The app never depends on a specific data API.** Everything goes through
  `MotorsportDataProvider`; `MockMotorsportProvider` seeds a full season so the
  product works beautifully with zero credentials. A real feed drops in behind
  the same interface, selected with `MOTORSPORT_DATA_PROVIDER`.
- **All team actions are validated server-side** (budget, roster, duplicates,
  captain, ownership) in `store.validate_team` before persistence.
- **Race times are stored in UTC** and rendered in the viewer's local timezone.

## Fantasy rules (from the engine)

- Budget **$100.0M**; squad = **5 drivers + 2 constructors**; one **captain** at
  **2×** points.
- Points for qualifying progression + pole, finishing position, positions gained
  / lost vs. the (penalty-adjusted) grid, fastest lap, Driver of the Day,
  teammate battles, classification, and penalties for DNF / DSQ / DNS. Sprint
  weekends use a separate points table.
- Constructors score their drivers' combined race points plus reliability and
  pit-stop bonuses.
- Tactical boosts: Turbo, Double Stack, No Limit, Wildcard, Pit Stop.

The `/rules` page renders these values live from the engine, so the UI can never
drift from real scoring.

## Local development

Backend:

```bash
cd backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt          # or requirements-dev.txt for tests
uvicorn app.main:app --reload --port 8000
```

Frontend (another terminal):

```bash
cd frontend
npm install
npm run dev        # Vite dev server, proxies /api → localhost:8000
```

Open http://localhost:5173.

## Tests

Backend (scoring engine — the critical game logic):

```bash
cd backend && pip install -r requirements-dev.txt
python -m pytest app/gridlock/tests/ -q
```

Frontend type-check + production build, and lint:

```bash
cd frontend
npm run build      # tsc -b && vite build
npm run lint       # oxlint
```

## Environment variables

See `.env.example`:

| Variable | Purpose | Default |
| --- | --- | --- |
| `DATABASE_URL` | Postgres in prod; SQLite file locally | SQLite |
| `MOTORSPORT_DATA_PROVIDER` | `mock` (seeded) or `real` (feed adapter) | `mock` |
| `DEMO_MODE` | Keep the app fully populated without auth/API | `true` |

## Deployment (Vercel)

Single Vercel project:

- `frontend/` builds to static assets (`frontend/dist`).
- `api/index.py` wraps the FastAPI app as a Python serverless function.
- `vercel.json` rewrites `/api/*` to the function and everything else to the SPA.

Set a **Postgres** `DATABASE_URL` for persistent profiles/teams/leagues (SQLite
won't survive across serverless invocations). Motorsport data is served from the
mock provider and needs no configuration.

```bash
vercel link
vercel env add DATABASE_URL production
vercel --prod
```

## Data: mock vs. real

Everything you see — 20 drivers, 10 constructors, 24 races (with completed
results, form, prices, ownership), 240 demo managers, public leagues, a live-race
snapshot, and algorithmic insights — is **deterministically generated** by the
mock provider. Real user profiles, teams and private leagues are persisted in the
database and scored against the same season. Wiring a live feed is a matter of
implementing `RealMotorsportProvider.get_season()` behind the existing adapter.
