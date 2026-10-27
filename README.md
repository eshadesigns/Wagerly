# Wagerly

**Stake your success.**

Wagerly is a proposed goal-planning and accountability product. It aims to help
people turn goals into actionable plans, collaborate with an accountability
partner, and track verified progress. Virtual stakes and consequences do not
require financial transactions.

## Frontend

The frontend uses React, TypeScript, Vite, and Tailwind CSS. In local mode,
commitments are stored in the browser's local storage; no backend or account is
required.

### Run locally

Prerequisites: Node.js 20.19+ and npm.

```sh
cd frontend
npm install
npm run dev
```

Open the local URL printed by Vite (usually `http://localhost:5173`). To create
a production build, run `npm run build`; `npm run preview` serves that build
locally.

### Connect a backend

Copy `frontend/.env.example` to `frontend/.env.local` and set
`VITE_API_BASE_URL` to the backend origin. The frontend then calls:

- `GET /api/wagers` — list the current user's commitments
- `POST /api/wagers` — create a commitment; the response is the created record
- `PATCH /api/wagers/:id` — update a commitment; the response is the updated record
- `POST /api/wagers/plan` — generate milestones from `{ "goal", "deadline" }`

The list and record responses use the frontend types in
[`frontend/src/types.ts`](./frontend/src/types.ts). Successful endpoints must
return JSON; errors should use a non-2xx status and a useful response body.
Configure CORS on the backend for the local Vite origin. Authentication is
intentionally not simulated; add it when the backend's auth contract is
defined. Never put server-only secrets in `VITE_` variables.

See the [architecture overview](./docs/architecture.md) for the current
frontend/backend boundary.
