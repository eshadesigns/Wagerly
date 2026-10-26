# Architecture overview

## Current implementation

Sprint 1 provides a Node.js/Express JSON backend in `backend/src/`. It uses
Supabase Auth and Postgres, validates bearer access tokens, and performs
database calls with those user tokens so row-level security applies. Gemini
task generation uses the official `@google/genai` SDK on the server. The
Supabase schema and RLS policies are in
`supabase/migrations/20261026000000_sprint1_backend.sql`.

The frontend is still only comment-only JavaScript placeholders; React and
frontend build tooling have not been implemented. There are no forms or API
calls to integrate yet. API paths and JSON shapes are defined in
[`api.md`](./api.md).

## Separation of responsibilities

- **Frontend (`frontend/`):** Future UI; currently no framework, forms, or
  browser API integration is implemented.
- **Backend (`backend/`):** Express API for authentication, goals, and task
  generation.
- **Persistence and authentication:** Supabase Auth and Postgres. RLS policies
  restrict goal and task access to the owning user.
- **AI integration:** Gemini generates a validated 3-7 task JSON plan on the
  backend. `GEMINI_API_KEY` must never be exposed to a browser.

## Directory responsibilities

- `frontend/src/main.js` and `frontend/src/api.js`: placeholders; no frontend
  behavior or API calls yet.
- `backend/src/index.js`: Express server startup, routes, authentication
  middleware, CORS, and generation rate limit.
- `backend/src/auth.js`, `goals.js`, and `tasks.js`: auth and goal/task logic.
- `backend/src/ai.js` and `database.js`: Gemini and Supabase integrations.
- `supabase/migrations/`: database schema, RLS, and atomic task insertion.
- `tests/`: Node's built-in test runner for API contracts using mocked
  Supabase/Gemini services.

## Sprint 1 flow

1. A user registers, confirms their email if required by Supabase, and logs in.
2. The user creates a personal goal with a deadline.
3. The backend generates and saves one ordered task plan for that goal.
4. The user retrieves their goals and saved tasks.

The API contract for this flow is in [`api.md`](./api.md). Partner invitations,
pacts, task completion/verification, progress reporting, and plan editing are
later-release work.

## Remaining work

- Implement the frontend framework/forms and connect them to the published
  contract in [`api.md`](./api.md); actual frontend integration is unverified.
- Configure the team's Supabase project, email confirmation template, allowed
  local redirect URL, and apply the SQL migration.
- Supply a Gemini API key and choose an available model in `GEMINI_MODEL` for
  live generation. AI behavior is covered by mocked tests only.
- Partners, pacts, task completion, verification, dashboards, and payments
  remain out of scope.
