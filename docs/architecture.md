# Architecture overview

## Current implementation

The repository contains documentation and comment-only JavaScript placeholders
under `frontend/`, `backend/`, and `tests/`. There is no UI, server behavior,
application logic, persistence layer, AI integration, or configured test suite.
The technologies and flows below describe proposals, not existing behavior.

## Proposed separation of responsibilities

- **Frontend (`frontend/`):** A future client application will handle
  user-facing workflows. React is proposed, but framework and build tooling
  have not been approved. Visual design is intentionally out of scope.
- **Backend (`backend/`):** Future server-side application services and API
  routes will coordinate requests, enforce application rules, and protect
  credentials that must not be exposed to a browser.
- **Persistence and authentication:** Supabase is proposed for authentication
  and persistent data. Its use, data model, and security policies remain
  undecided.
- **AI integration:** Gemini is proposed for producing suggested task plans.
  The integration should be server-side if it uses a secret API key. Provider,
  prompt behavior, error handling, and plan format require agreement before
  implementation.

JavaScript is the intended primary application language. The `.env.example`
variable names are provisional; confirm whether the `VITE_` names are
appropriate before introducing a client build. Never expose a Gemini secret in
client-side code.

## Directory responsibilities

- `frontend/src/main.js`: future React application entry point.
- `frontend/src/api.js`: future frontend-to-backend communication.
- `backend/src/index.js`: future server startup and composition.
- `backend/src/goals.js`, `tasks.js`, `pacts.js`, and `accountability.js`:
  future domain logic for those areas.
- `backend/src/ai.js` and `database.js`: future AI and persistence integrations,
  if approved.
- `tests/`: tests for implemented application logic.

These files are placeholders only; they do not define APIs or behavior.

## Expected high-level flow

1. A user creates an account and logs in.
2. The user creates a goal and sets a deadline.
3. An AI service proposes a task plan for the user to review.
4. The user invites an accountability partner and establishes a pact.
5. The user marks tasks complete; the partner reviews and approves or rejects
   completion.
6. Progress is presented to the user. Goal outcomes and history are planned for
   a later release.

This is product direction, not a defined API or data contract. The plan-editing
step is a later-release capability.

## Decisions still pending

- Confirm frontend framework and build tooling, and decide where any frontend
  code belongs without adding visual implementation before design direction is
  approved.
- Confirm how Node.js services and API routes will be hosted and organized.
- Confirm Supabase adoption, authentication approach, data model, and database
  security policies.
- Confirm Gemini adoption, server-side integration details, and expected plan
  behavior.
- Define partner roles, invitation lifecycle, permissions, and the task
  verification and dispute/rejection flow.
- Agree on pact rules and consequence handling. Stakes and consequences are
  accountability mechanisms only; the product does not require financial
  transactions.
- Define progress semantics and data retention for the dashboard and later
  goal history.
- Confirm environment variable names and ownership before adding integrations.
