# Contributing

## Before starting

- Check the current repository state and existing documentation.
- Read [the architecture overview](./architecture.md) and [the API contract](./api.md).

## Branches and pull requests

- Start from an up-to-date `main` branch.
- Use a short, descriptive feature branch, for example
  `feature/goal-planning-foundation` or `docs/setup-guide`.
- Make focused commits with clear messages.
- Open a pull request against `main`, describe the change and its validation,
  and request review before merging.
- Keep the pull request focused and address review feedback in follow-up
  commits.

## Where work belongs

Keep API behavior in the existing Express backend and update the API contract
when request or response shapes change. The frontend uses React, TypeScript,
Vite, and Tailwind CSS; keep its requests behind `frontend/src/api.ts` and
models in `frontend/src/types.ts`. Do not describe the frontend as integrated
with the Sprint 1 API until authentication and goal/task mapping are tested.

## Validation

Run `npm run build` from `frontend/` to type-check and build the client. Run
`npm test` from the repository root for the Node built-in backend test suite.
Live Supabase and Gemini checks require team-provided credentials and are
separate opt-in commands. Document the exact checks performed in each pull
request.
