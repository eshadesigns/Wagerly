# Architecture overview

## Current implementation

The frontend is a React/TypeScript application built with Vite and Tailwind
CSS. It includes a commitment dashboard, goal creation, milestone tracking,
partner verification, and history screens. With no API URL configured, it
stores user-created commitments in browser local storage and starts empty; it
does not provide demo accounts or sample records.

The frontend API adapter in `frontend/src/api.ts` uses local storage in local
mode and switches to REST requests when `VITE_API_BASE_URL` is configured. The
backend files remain placeholders; authentication, persistence, and the API
itself are not implemented.

## Proposed separation of responsibilities

- **Frontend (`frontend/`):** The client owns presentation and calls the
  service boundary in `frontend/src/api.ts`. Keep server credentials and
  authorization rules out of browser code.
- **Backend (`backend/`):** Future server-side application services and API
  routes will coordinate requests, enforce application rules, and protect
  credentials that must not be exposed to a browser.
- **Persistence and authentication:** Supabase remains a proposal. The local
  frontend uses browser storage only; it is not multi-user or secure
  persistence.
- **AI integration:** Gemini is proposed for producing suggested task plans.
  The integration should be server-side if it uses a secret API key. Provider,
  prompt behavior, error handling, and plan format require agreement before
  implementation.

JavaScript and TypeScript are used in their respective frontend and backend
areas. `VITE_API_BASE_URL` is a public backend origin, not a secret. Never
expose a Gemini API key or other server-only credentials in client-side code.

## Directory responsibilities

- `frontend/src/main.tsx`: React application entry point.
- `frontend/src/api.ts`: local persistence adapter and REST boundary.
- `frontend/src/types.ts`: frontend commitment and milestone contracts.
- `backend/src/index.js`: future server startup and composition.
- `backend/src/goals.js`, `tasks.js`, `pacts.js`, and `accountability.js`:
  future domain logic for those areas.
- `backend/src/ai.js` and `database.js`: future AI and persistence integrations,
  if approved.
- `tests/`: tests for implemented application logic.

Backend JavaScript files are placeholders and do not yet implement these
contracts.

## Frontend REST contract

When `VITE_API_BASE_URL` is set, the frontend expects:

- `GET /api/wagers` to return a JSON array of `Wager` records.
- `POST /api/wagers` to accept a `Wager` without its `id` and return the
  persisted record including its `id`.
- `PATCH /api/wagers/:id` to accept and return the updated `Wager`.
- `POST /api/wagers/plan` to accept `{ goal, deadline }` and return a
  `Milestone[]`.

All successful responses include JSON bodies; non-2xx responses are surfaced
to the user. Authentication and authorization need to be added with the
backend auth design. In particular, the backend must enforce goal ownership
and partner verification permissions rather than trusting client-supplied
milestone state.

## Expected high-level flow

1. In local mode, a user creates commitments stored in their browser. In API
   mode, the frontend requests commitments from the configured backend.
2. The user sets a goal and deadline, then creates milestones manually or
   requests a plan from the backend.
3. The user records partner details and submits completed milestones for
   verification.
4. The dashboard and history summarize the records returned by the active
   persistence adapter.

Local mode is a single-browser prototype, not an authenticated or secure
multi-user system. Backend login, invitation delivery, and authorization are
not implemented.

## Decisions still pending

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
- Define the backend auth contract, then connect it to the frontend service
  adapter without exposing server-only credentials.
