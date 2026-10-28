# Architecture overview

## Current implementation

Sprint 1 provides a Node.js/Express JSON backend in `backend/src/`. It uses
Supabase Auth and Postgres, validates bearer access tokens, and performs
database calls with those user tokens so row-level security applies. Gemini
task generation runs on the server. The schema and policies are defined in
`supabase/migrations/20261026000000_sprint1_backend.sql`; API paths and JSON
shapes are documented in [`api.md`](./api.md).

The React/TypeScript frontend under `frontend/` connects its login,
registration, email-confirmation, session-renewal, goal, and task-plan flows to
the Sprint 1 API. It maps the backend's `Goal` and `Task` records directly and
does not persist goal data in browser storage. The browser stores only the
authentication session needed for reload and refresh. Partner, stake,
verification, task-completion, and manual task-editing actions remain outside
the connected Sprint 1 flow.

## Separation of responsibilities

- **Frontend (`frontend/`):** Owns presentation and calls the JSON API through
  `frontend/src/api.ts`. Keep API record/authentication models in
  `frontend/src/types.ts`. Never place server-only secrets in browser code.
- **Backend (`backend/`):** Express API for authentication, goals, and task
  generation. It validates inputs and access tokens and applies ownership rules.
- **Persistence and authentication:** Supabase Auth and Postgres. RLS policies
  restrict goal and task access to the owning user.
- **AI integration:** Gemini generates a validated task plan on the backend.
  `GEMINI_API_KEY` must never be exposed to a browser.

## Directory responsibilities

- `frontend/src/main.tsx`: React application entry point.
- `frontend/src/App.tsx`: authentication gate and goal/task workflows.
- `frontend/src/api.ts`: authenticated API client, session storage, and
  coordinated session refresh.
- `frontend/src/types.ts`: API-aligned `Goal`, `Task`, and auth models.
- `frontend/tests/`: frontend-to-Express integration tests with external
  Supabase and Gemini behavior mocked.
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
editing a generated plan are later-release work and are not offered as
persisted Sprint 1 actions in the connected flow.

## Verification and setup

- The frontend test suite runs the frontend API client against an in-process
  Express server with Supabase and Gemini mocked. It does not verify live
  database policies or Gemini service behavior.
- Configure the Supabase project, email confirmation template and local
  redirect URLs, then apply the SQL migration.
- Supply a Gemini API key and choose an available model in `GEMINI_MODEL` for
  live generation. The Gemini smoke test is separate from the mocked suite.
- Run the opt-in Supabase integration suite only against a dedicated test
  project; mocked tests do not verify its RLS policies or transaction locking.
