# Sprint 1 API

The backend is a JSON API at `http://localhost:3000`. All endpoints except
`GET /health`, registration, login, email verification, and refresh require
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
| `POST` | `/api/auth/refresh` | Exchange a one-time Supabase refresh token for a renewed session |
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

`POST /api/auth/refresh` takes:

```json
{ "refreshToken": "<session.refresh_token>" }
```

It returns `{ "user", "session" }` with the renewed access and refresh tokens.
Supabase refresh tokens are single-use: replace **both** saved tokens with the
returned session, and do not retry an already-used token. Missing or malformed
input returns `400 VALIDATION_ERROR`; invalid, expired, or reused tokens return
`401 INVALID_REFRESH_TOKEN`. The future frontend should call this endpoint when
an access token expires, update its session from the response, and require a
new login if refresh fails. Keep these tokens out of URLs and logs.

Registration, login, email verification, and refresh are rate limited by
client IP. Defaults are 5 registrations, 10 logins, 10 verification requests,
and 10 refreshes per 15 minutes. Configure them with
`AUTH_REGISTER_RATE_LIMIT`, `AUTH_LOGIN_RATE_LIMIT`,
`AUTH_VERIFY_EMAIL_RATE_LIMIT`, `AUTH_REFRESH_RATE_LIMIT`, and
`AUTH_RATE_LIMIT_WINDOW_MS`. Limits are process-local; use shared rate-limit
storage when deploying multiple backend instances. A rejected request returns
`429 { "error": { "code": "AUTH_RATE_LIMITED", "message": "..." } }`.

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
   with its `token_hash`.
2. `POST /api/auth/login` and save both returned session tokens.
3. If the access token expires, call `POST /api/auth/refresh` with the saved
   `refreshToken`, then replace both tokens with the returned session.
4. `POST /api/goals` with the goal JSON above and the bearer token; copy
   `goal.id`.
5. `POST /api/goals/{goalId}/tasks/generate` with the same bearer token.
6. `GET /api/goals/{goalId}/tasks` with the same bearer token.

Example request headers for steps 3-5:

```http
Authorization: Bearer <session.access_token>
Content-Type: application/json
```

Import [`Wagerly-Sprint-1.postman_collection.json`](./Wagerly-Sprint-1.postman_collection.json)
for the request sequence. Set `baseUrl` and `password`; after confirming the
email, copy the `token_hash` from the confirmation link into
`confirmationTokenHash`. The collection scripts save the access/refresh
tokens and created goal ID for subsequent requests. Do not export or share a
collection after entering credentials or receiving session tokens.

The sequence is an API example, not a claim that frontend integration has
been tested. `frontend/src/` still contains placeholders; no running frontend,
forms, or frontend API calls exist yet.

## Optional live-service verification

`npm run test:integration` uses a dedicated Supabase test project with the
migration applied and email confirmation disabled. Set
`SUPABASE_TEST_URL`, `SUPABASE_TEST_ANON_KEY`, `SUPABASE_TEST_DB_URL`, and
`SUPABASE_TEST_PROJECT_REF` to that project's values and explicitly set
`SUPABASE_TEST_ALLOW_CLEANUP=true`. The database URL should use SSL for hosted
Supabase. The integration suite creates uniquely named temporary accounts and
deletes only those exact account IDs and email addresses at teardown (their
goals/tasks cascade); it does not scan or delete other project data. Without
all required values and explicit cleanup opt-in, the suite skips.

`npm run test:live:gemini` sends a real request to the model configured in
`GEMINI_MODEL` (default `gemini-3.8-flash`) and skips unless `GEMINI_API_KEY`
is set. The test validates returned shape only; it is not part of `npm test`.
The backend uses the official `@google/genai` SDK Interactions API with a
structured JSON schema, `store: false`, a 30-second request timeout, and no
automatic retries. Mocked tests verify the model/configuration arguments,
JSON parsing, timeout and quota error mapping. No live Gemini or Supabase
result should be inferred from those mocked tests.
