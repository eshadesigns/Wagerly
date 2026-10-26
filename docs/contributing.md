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
when request or response shapes change. The frontend is still a placeholder
and should not be described as integrated until tested end to end.

## Validation

Run `npm test` for the Node built-in test suite. Live Supabase and Gemini
integration checks require team-provided local credentials and are not part of
the automated suite. Document the exact checks performed in each pull request.
