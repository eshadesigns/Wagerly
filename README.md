# Wagerly

**Stake your success.**

Wagerly helps people turn goals into actionable plans and build accountability.
The Sprint 1 backend provides Supabase Auth, personal goals, and Gemini-generated
task plans. The frontend is a design-based prototype with browser-local
persistence; it is not yet integrated with the Sprint 1 backend. Partners,
pacts, shared verification, and payments are not implemented by that backend.

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
npm run dev
```

Open the local URL printed by Vite (usually `http://localhost:5173`). The app
starts with no sample data and stores goals in this browser's local storage.
Build and preview the production frontend with `npm run build` and
`npm run preview`.

## Run the backend locally

The backend requires a configured Supabase project. Gemini credentials are
needed only for live AI generation.

```sh
npm install
cp .env.example .env
```

Fill in the backend values in `.env`, then apply
[`supabase/migrations/20261026000000_sprint1_backend.sql`](./supabase/migrations/20261026000000_sprint1_backend.sql)
to the Supabase project using its SQL Editor or migration tooling. Configure
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `GEMINI_API_KEY` (for live task generation),
`GEMINI_MODEL` (optional), `PORT`, and `FRONTEND_ORIGIN`. The API starts at
`http://localhost:3000`:

```sh
npm run dev
```

`GET /health` checks server availability. Run the mocked backend tests with
`npm test`. See [`docs/api.md`](./docs/api.md) for the API contract, Supabase
email-setup details, and opt-in live tests.

## Frontend/backend integration status

The frontend currently uses browser local storage. Its optional
`VITE_API_BASE_URL` adapter describes an earlier, frontend-specific REST shape;
it does **not** match the Sprint 1 backend contract in [`docs/api.md`](./docs/api.md)
and should not be pointed at that backend yet. Authentication and mapping the
design's partner, stake, milestone, and verification flows onto backend
capabilities remain to be implemented. Never expose server-only secrets in
`VITE_` variables.

Keep `.env` local and private. Never use or share a Supabase service-role key.
