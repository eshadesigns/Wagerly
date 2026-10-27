# Contributing

## Before starting

- Check the current repository state and existing documentation.
- Read [the architecture overview](./architecture.md) and confirm pending
  technology or product decisions with the team before making them part of the
  implementation.
- Keep changes within the requested scope. Do not add UI, backend behavior, or
  external integrations without an agreed task.

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

Place client code under `frontend/` and server/domain logic and integrations
under `backend/`. Add tests under `tests/`. Keep architecture and collaboration
guidance in `docs/`.

The frontend currently uses React, TypeScript, Vite, and Tailwind CSS. Keep
network requests behind `frontend/src/api.ts` and shared request/response
shapes in `frontend/src/types.ts`. Update the architecture documentation when
the team approves a meaningful change in direction.

## Validation

Run `npm run build` from `frontend/` to type-check and build the client. The
backend and tests do not yet have configured commands. Document the exact
checks performed in each pull request.
