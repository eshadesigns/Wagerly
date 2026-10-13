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

Place future client code under `frontend/` and server/domain logic and
integrations under `backend/`. Add tests under `tests/`. Keep architecture and
collaboration guidance in `docs/`.

These are starting boundaries, not permission to implement the planned
features. Update the architecture documentation when the team approves a
meaningful change in direction.

## Validation

This scaffold has no configured build, lint, or test commands. For
documentation-only changes, check the rendered Markdown and `git status`.
Document the exact checks performed in each pull request. Add tooling when
working application code establishes a concrete need.
