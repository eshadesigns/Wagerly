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

Additional frontend and backend tests were added during Sprint 2.
See the Automated Testing section below for more details on what is
being tested, how to run the tests, and the current testing results.

## Automated Testing

The frontend and backend have separate automated tests. These tests help
us check that the features work as expected and that adding new features
does not break anything that was already working.

Make sure the dependencies are installed in both the main Wagerly
folder and the `frontend/` folder before running the tests.

### Backend tests

From the main Wagerly folder, run:

```sh
npm test
```

This runs the existing backend tests along with the new task validation
tests added during Sprint 2. These tests cover authentication, goal
creation, AI task generation, task validation, and error handling.

To run just the task validation tests:

```sh
node --test tests/taskValidation.test.js
```

The new task validation tests check that:

- Valid task information is accepted.
- Extra spaces are removed from titles and descriptions.
- Task lists with seven tasks are accepted.
- Empty task lists and lists with more than seven tasks are rejected.
- Missing or invalid task titles and descriptions are rejected.

### Frontend tests

From the main Wagerly folder, run:

```sh
cd frontend
npm test
```

This runs the existing frontend integration tests along with the new
goal outcome tests added during Sprint 2.

To run just the goal outcome tests from the `frontend/` folder:

```sh
npm test -- tests/goalOutcome.test.tsx
```

The new goal outcome tests check that:

- The correct outcome is displayed for completed and missed goals.
- The progress percentage is calculated and rounded correctly.
- Zero progress is displayed when no tasks are completed.
- Goals with no tasks are handled correctly.
- The Back to Dashboard button calls the correct function.

To make sure the frontend builds without any errors, run:

```sh
npm run build
```

### Live integration tests

The Supabase and Gemini live tests are run separately because they
require additional setup and credentials.

From the main Wagerly folder, run the following commands.

Supabase:

```sh
npm run test:integration
```

Gemini:

```sh
npm run test:live:gemini
```

See [`docs/api.md`](./docs/api.md) for the setup needed to run these tests.

### Sprint 2 testing results

The following automated tests were run on November 25, 2026.

| Test category | Total | Passed | Failed |
| --- | ---: | ---: | ---: |
| Existing backend tests | 14 | 14 | 0 |
| Task validation tests | 7 | 7 | 0 |
| Frontend integration tests | 3 | 3 | 0 |
| Goal outcome tests | 6 | 6 | 0 |
| **Total** | **30** | **30** | **0** |

A total of 13 new automated tests were added during Sprint 2. All 30
current automated tests passed, and the frontend build was successful.

The live Supabase and Gemini tests are not included in these results.
The goal outcome component was tested separately and still needs to be
connected to the rest of the application. More tests will be added as
the remaining Sprint 2 features are completed and connected.

Note: If PowerShell blocks the npm commands, use `npm.cmd` instead of
`npm`.

## Frontend/backend integration status

Frontend authentication, goals, and generated tasks use the documented Sprint 1
backend endpoints. Automated integration tests run the actual Express app with
Supabase and Gemini mocked; they do not verify live Supabase policies, live
Gemini, or deployment behavior. The frontend intentionally does not expose
partner, stake, task-completion, or verification actions as working features.
Never expose server-only secrets in `VITE_` variables.

Keep `.env` local and private. Never use or share a Supabase service-role key.
