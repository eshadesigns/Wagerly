# Wagerly

**Stake your success.**

Wagerly helps people turn goals into actionable plans and build accountability.
The Sprint 1 app connects its React frontend to an Express backend for Supabase
authentication, personal goals, and Gemini-generated task plans. Partners,
pacts, shared verification, task completion, stakes, and payments are not
implemented in Sprint 1.

## Stack

- Frontend: React, TypeScript, Vite, and Tailwind CSS.
- Backend: Node.js ES modules and Express.
- Authentication and database: Supabase Auth and Postgres, with row-level
  security for user-owned goals and tasks.
- AI: Google's `@google/genai` SDK, called only from the backend.

## Run the frontend locally

Prerequisite: Node.js 20+ and npm.

```sh
cd frontend
npm install
```

In PowerShell, create the local frontend environment file from the example if
you need to override the default API origin:

```powershell
Copy-Item .env.example .env
```

Then start Vite:

```sh
npm run dev
```

Open `http://localhost:5173`. The frontend calls
`http://localhost:3000` by default; change `VITE_API_BASE_URL` in
`frontend/.env` only when using a different local API origin. Goal and task
records are loaded from the backend, not browser-local records. The browser
stores the Supabase session for reload/refresh support. Build and preview the
production frontend with `npm run build` and `npm run preview`.

## Run the backend locally

Run this in a separate VS Code terminal from the frontend. The backend requires
a configured Supabase project. Gemini credentials are needed for live AI
generation.

```sh
npm install
```

In PowerShell, create the private backend environment file:

```powershell
Copy-Item .env.example .env
```

Set `FRONTEND_ORIGIN=http://localhost:5173` and fill in the required
`SUPABASE_URL` and `SUPABASE_ANON_KEY` values. Set `GEMINI_API_KEY` for live
task generation; `GEMINI_MODEL` and `PORT` are optional. Then apply
[`supabase/migrations/20261026000000_sprint1_backend.sql`](./supabase/migrations/20261026000000_sprint1_backend.sql)
to the shared Supabase project using its SQL Editor or migration tooling.
Each teammate creates their own local `.env` and `frontend/.env`; share neither
file. Do not use a Supabase service-role key. Start the API at
`http://localhost:3000` with:

```sh
npm run dev
```

`GET /health` checks server availability. Run backend mocked tests from the
repository root with `npm test`; run the frontend-to-Express tests from
`frontend/` with `npm test`, and its type check/build with `npm run build`.
See [`docs/api.md`](./docs/api.md) for the API contract, Supabase email setup,
and opt-in live tests.

## Frontend/backend integration status

Frontend authentication, goals, and generated tasks use the documented Sprint 1
backend endpoints. Automated integration tests run the actual Express app with
Supabase and Gemini mocked; they do not verify live Supabase policies, live
Gemini, or deployment behavior. The frontend intentionally does not expose
partner, stake, task-completion, or verification actions as working features.
Never expose server-only secrets in `VITE_` variables.

Keep `.env` local and private. Never use or share a Supabase service-role key.
