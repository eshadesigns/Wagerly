# Architecture overview

## Current implementation

Sprint 1 provides a Node.js/Express JSON backend in `backend/src/`. It uses
Supabase Auth and Postgres, validates bearer access tokens, and performs
database calls with those user tokens so row-level security applies. Gemini
task generation runs on the server. The schema and policies are defined in
`supabase/migrations/20261026000000_sprint1_backend.sql`; API paths and JSON
shapes are documented in [`api.md`](./api.md).

The React/TypeScript frontend under `frontend/` implements the supplied
design's dashboard, goal creation, milestone tracking, partner verification,
and history screens. It starts without demo data and stores records in browser
local storage by default. It does not yet authenticate users or integrate with
the Sprint 1 backend.

The frontend's optional `VITE_API_BASE_URL` adapter currently describes a
separate `/api/wagers` REST shape. It is not compatible with the implemented
`/api/goals` Sprint 1 contract. Do not configure it to point at the Sprint 1
backend until the client is updated to handle authentication, goal/task
mapping, and backend capability differences.

## Separation of responsibilities

- **Frontend (`frontend/`):** Owns presentation and browser-local prototype
  behavior. Keep backend requests behind `frontend/src/api.ts`, and shared
  frontend models in `frontend/src/types.ts`. Never place server-only secrets
  in browser code.
- **Backend (`backend/`):** Express API for authentication, goals, and task
  generation. It validates inputs and access tokens and applies ownership rules.
- **Persistence and authentication:** Supabase Auth and Postgres. RLS policies
  restrict goal and task access to the owning user.
- **AI integration:** Gemini generates a validated task plan on the backend.
  `GEMINI_API_KEY` must never be exposed to a browser.

## Directory responsibilities

- `frontend/src/main.tsx`: React application entry point.
- `frontend/src/App.tsx`: designed frontend screens and workflows.
- `frontend/src/api.ts`: browser-local persistence and the not-yet-integrated
  frontend REST adapter.
- `frontend/src/types.ts`: frontend commitment and milestone models.
- `backend/src/index.js`: Express server startup, routes, authentication
  middleware, CORS, and generation rate limit.
- `backend/src/auth.js`, `goals.js`, and `tasks.js`: auth and goal/task logic.
- `backend/src/ai.js` and `database.js`: Gemini and Supabase integrations.
- `supabase/migrations/`: database schema, RLS, and atomic task insertion.
- `tests/index.js`: Node's built-in test runner for API contracts using mocked
  Supabase/Gemini services.
- `tests/integration/` and `tests/live/`: opt-in checks against configured
  Supabase and Gemini services.

## Sprint 1 backend flow

1. A user registers, confirms their email if required by Supabase, and logs in.
2. The user creates a personal goal with a deadline.
3. The backend generates and saves one ordered task plan for that goal.
4. The user retrieves their goals and saved tasks.

See [`api.md`](./api.md) for request and response contracts. Partner
invitations, pacts, task completion/verification, progress reporting, and
editing a generated plan are later-release work. The current frontend design
includes some of these future workflows, so they cannot yet be persisted by
the Sprint 1 backend.

## Remaining work

- Integrate frontend auth with the backend register, login, verification, and
  refresh routes.
- Map the frontend goal and milestone models to the Sprint 1 goal/task API;
  document and handle features that the API does not yet support.
- Configure the Supabase project, email confirmation template and local
  redirect URLs, then apply the SQL migration.
- Supply a Gemini API key and choose an available model in `GEMINI_MODEL` for
  live generation. The Gemini smoke test is separate from the mocked suite.
- Run the opt-in Supabase integration suite only against a dedicated test
  project; mocked tests do not verify its RLS policies or transaction locking.
