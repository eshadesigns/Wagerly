# Sprint 1 API

The backend is a JSON API at `http://localhost:3000`. All endpoints except
`GET /health`, registration, login, and email verification require
`Authorization: Bearer <access_token>`. The access token is the Supabase
`session.access_token`; the API validates it with Supabase for every protected
request and uses that same token for database queries so RLS applies.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Local server health |
| `POST` | `/api/auth/register` | Register with email and password |
| `POST` | `/api/auth/verify-email` | Exchange a Supabase confirmation token hash for a session |
| `POST` | `/api/auth/login` | Sign in with email and password |
| `GET` | `/api/goals` | List the signed-in user's goals |
| `POST` | `/api/goals` | Create a goal |
| `GET` | `/api/goals/:goalId` | Retrieve one owned goal |
| `POST` | `/api/goals/:goalId/tasks/generate` | Generate and atomically save a task plan |
| `GET` | `/api/goals/:goalId/tasks` | Retrieve saved tasks in display order |

### Authentication

`POST /api/auth/register`

```json
{ "email": "person@example.com", "password": "at-least-8-characters" }
```

Returns `201` with `{ "user", "session", "emailConfirmationRequired" }`.
When Supabase email confirmation is on, `session` is `null` and
`emailConfirmationRequired` is `true`. Supabase sends the confirmation email;
the frontend should take its `token_hash` from the confirmation link and post
it to `/api/auth/verify-email`:

```json
{ "tokenHash": "confirmation-token-hash" }
```

The verification route returns `{ "user", "session" }`. Configure the
Supabase confirmation email template to direct the user to the frontend with
the `token_hash` and `type` query parameters (Supabase's `{{ .TokenHash }}` and
`{{ .SiteURL }}` template values). Configure the Supabase Auth Site URL and
allowed redirect URLs for the frontend's local origin. Do not put an access
token or secret in a confirmation URL.

`POST /api/auth/login` takes the same email/password JSON and returns
`{ "user", "session" }`. Unconfirmed accounts receive
`403 EMAIL_NOT_CONFIRMED`; incorrect credentials receive `401`.

### Goals

Create with `POST /api/goals`:

```json
{
  "title": "Run a 5K",
  "description": "Build a steady running habit and finish comfortably.",
  "deadline": "2026-12-01"
}
```

`title` is required (1-120 characters), `description` is optional (up to 2000
characters), and `deadline` is required as `YYYY-MM-DD` or a timezone-qualified
ISO 8601 date-time. A date-only deadline is treated as the end of that UTC
calendar day. The server derives `user_id` from the validated access
token; any `user_id` in a request is ignored. A successful response is
`201 { "goal": { "id", "user_id", "title", "description", "deadline",
"created_at" } }`.

List and detail responses are `{ "goals": [...] }` and `{ "goal": {...} }`.
An invalid goal UUID returns `400`; a missing or another user's goal returns
`404` to avoid disclosing its existence.

### Generated tasks

`POST /api/goals/:goalId/tasks/generate` needs no request body. Gemini receives
the goal title, description, and deadline. It must return 3-7 unique task
objects with non-empty `title` (up to 120 characters) and `description` (up
to 1000 characters). Tasks are saved in one database transaction and returned
as `201 { "tasks": [...] }`, ordered by `display_order`. Repeating generation
returns `409 TASKS_ALREADY_GENERATED`; concurrent requests are serialized in
Postgres so only one batch can be saved. Generation is limited to five
requests per signed-in user per hour per backend process.

Task retrieval returns `{ "tasks": [...] }`; a goal owned by another user
returns `404`. Gemini errors never produce placeholder tasks: timeout is
`504 AI_TIMEOUT`, quota is `503 AI_QUOTA_EXCEEDED`, blocked/invalid output is
`502 AI_BLOCKED` or `502 AI_INVALID_OUTPUT`, and missing server configuration
is `503 AI_NOT_CONFIGURED`.

All errors use `{ "error": { "code": "...", "message": "..." } }`.

## Demo request sequence

1. `POST /api/auth/register` with an email and password. If confirmation is
   enabled, confirm using the email link and call `/api/auth/verify-email`
   with its `token_hash`; use the returned `session.access_token`.
2. `POST /api/auth/login` and copy `session.access_token`.
3. `POST /api/goals` with the goal JSON above and the bearer token; copy
   `goal.id`.
4. `POST /api/goals/{goalId}/tasks/generate` with the same bearer token.
5. `GET /api/goals/{goalId}/tasks` with the same bearer token.

Example request headers for steps 3-5:

```http
Authorization: Bearer <session.access_token>
Content-Type: application/json
```

This sequence is an API example, not a claim that frontend integration has
been tested. There is no running frontend or form contract in this repository
yet.
