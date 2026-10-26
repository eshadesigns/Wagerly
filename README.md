# Wagerly

**Stake your success.**

Wagerly helps people turn goals into actionable plans and build accountability.
Sprint 1 provides a backend API for Supabase Auth, personal goals, and Gemini
generated task plans. Partners, pacts, task completion, dashboards, and
payments are out of scope.

## Stack and current status

- Backend: Node.js ES modules and Express.
- Authentication and database: Supabase Auth and Postgres, with row-level
  security for user-owned goals and tasks.
- AI: Google's `@google/genai` SDK, called only from the backend.
- Frontend: not implemented. Existing `frontend/src/` files remain placeholders;
  no React app, forms, or frontend API calls exist yet.

## Local development

Prerequisites: Node.js 20+ and a Supabase project. Gemini credentials are
needed only for live AI generation.

```sh
npm install
Copy-Item .env.example .env
```

Fill in the backend values in `.env`, then apply
[`supabase/migrations/20261026000000_sprint1_backend.sql`](./supabase/migrations/20261026000000_sprint1_backend.sql)
to the shared Supabase project using its SQL Editor or migration tooling.
Configure `SUPABASE_URL` and `SUPABASE_ANON_KEY` from Supabase, `GEMINI_API_KEY`
for live task generation, `GEMINI_MODEL` if you want to override the default,
`PORT` for the API, and `FRONTEND_ORIGIN` for the frontend's actual local
development origin (the current default is `http://localhost:5173`).
Start the API:

```sh
npm run dev
```

The API starts at `http://localhost:3000`; `GET /health` checks server
availability. Run the tests with `npm test`. For setup details, the API
contract, and the signup-to-task demo sequence, read
[`docs/api.md`](./docs/api.md).

Each teammate can run a separate local API using the team's Supabase project
URL and anon/publishable key, plus their own Gemini API key. Never use or share
a Supabase service-role key. Keep `.env` local and private.
