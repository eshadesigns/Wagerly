import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { generateTasks } from '../backend/src/ai.js';
import { HttpError } from '../backend/src/errors.js';
import { createApp } from '../backend/src/index.js';

const sampleTasks = [
  { title: 'Choose a weekly schedule', description: 'Select three realistic days and add them to your calendar.' },
  { title: 'Complete an easy first run', description: 'Run or walk for 20 minutes at a comfortable pace.' },
  { title: 'Review and adjust the plan', description: 'After two weeks, review your runs and adjust the next week.' },
];

function createFakeSupabase() {
  const usersByEmail = new Map();
  const usersById = new Map();
  const usersByToken = new Map();
  const usersByRefreshToken = new Map();
  const passwordHashes = new Map();
  const goals = [];
  const tasks = [];

  function makeSession(user) {
    const accessToken = `access-${randomUUID()}`;
    const refreshToken = `refresh-${randomUUID()}`;
    usersByToken.set(accessToken, user);
    usersByRefreshToken.set(refreshToken, user);
    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: 'bearer',
      expires_in: 3600,
      user,
    };
  }

  class Query {
    constructor(table, userId) {
      this.table = table;
      this.userId = userId;
      this.filters = [];
      this.action = 'select';
      this.values = null;
      this.columns = null;
      this.sort = null;
      this.singleMode = null;
    }

    select(columns) {
      if (this.action !== 'insert') {
        this.action = 'select';
      }
      this.columns = columns;
      return this;
    }

    insert(values) {
      this.action = 'insert';
      this.values = values;
      return this;
    }

    eq(field, value) {
      this.filters.push([field, value]);
      return this;
    }

    order(field, options) {
      this.sort = [field, options.ascending];
      return this;
    }

    single() {
      this.singleMode = 'single';
      return this.execute();
    }

    maybeSingle() {
      this.singleMode = 'maybe';
      return this.execute();
    }

    then(resolve, reject) {
      return this.execute().then(resolve, reject);
    }

    async execute() {
      if (this.action === 'insert') {
        if (!this.userId || this.table !== 'goals' || this.values.user_id !== this.userId) {
          return { data: null, error: { code: '42501' } };
        }
        const row = {
          ...this.values,
          id: randomUUID(),
          created_at: new Date().toISOString(),
        };
        goals.push(row);
        return { data: row, error: null };
      }

      let data = (this.table === 'goals' ? goals : tasks)
        .filter((row) => row.user_id === this.userId)
        .filter((row) => this.filters.every(([field, value]) => row[field] === value));
      if (this.sort) {
        const [field, ascending] = this.sort;
        data = [...data].sort((a, b) => {
          const comparison = a[field] < b[field] ? -1 : a[field] > b[field] ? 1 : 0;
          return ascending ? comparison : -comparison;
        });
      }
      if (this.columns) {
        const selectedColumns = this.columns.split(',').map((column) => column.trim());
        data = data.map((row) => Object.fromEntries(
          selectedColumns.map((column) => [column, row[column]]),
        ));
      }
      if (this.singleMode === 'single') {
        return { data: data[0] ?? null, error: data.length === 1 ? null : { code: 'PGRST116' } };
      }
      if (this.singleMode === 'maybe') {
        return { data: data[0] ?? null, error: data.length > 1 ? { code: 'PGRST116' } : null };
      }
      return { data, error: null };
    }
  }

  function createClient(_env, accessToken) {
    const user = usersByToken.get(accessToken);
    return {
      auth: {
        async signUp({ email, password }) {
          if (usersByEmail.has(email)) {
            return { data: { user: null, session: null }, error: { code: 'user_already_exists' } };
          }
          const createdUser = { id: randomUUID(), email, confirmed: false };
          usersByEmail.set(email, createdUser);
          usersById.set(createdUser.id, createdUser);
          passwordHashes.set(createdUser.id, createHash('sha256').update(password).digest('hex'));
          return { data: { user: createdUser, session: null }, error: null };
        },
        async signInWithPassword({ email, password }) {
          const foundUser = usersByEmail.get(email);
          const passwordHash = createHash('sha256').update(password).digest('hex');
          if (!foundUser || passwordHashes.get(foundUser.id) !== passwordHash) {
            return { data: {}, error: { status: 400, code: 'invalid_credentials' } };
          }
          if (!foundUser.confirmed) {
            return { data: {}, error: { status: 400, code: 'email_not_confirmed' } };
          }
          return { data: { user: foundUser, session: makeSession(foundUser) }, error: null };
        },
        async verifyOtp({ token_hash: tokenHash }) {
          const userId = tokenHash.startsWith('confirm-') ? tokenHash.slice('confirm-'.length) : '';
          const foundUser = usersById.get(userId);
          if (!foundUser) {
            return { data: {}, error: { status: 422, code: 'otp_expired' } };
          }
          if (foundUser.confirmed) {
            return { data: {}, error: { status: 422, code: 'otp_expired' } };
          }
          foundUser.confirmed = true;
          return { data: { user: foundUser, session: makeSession(foundUser) }, error: null };
        },
        async refreshSession({ refresh_token: refreshToken }) {
          const refreshedUser = usersByRefreshToken.get(refreshToken);
          if (!refreshedUser) {
            return { data: { user: null, session: null }, error: { status: 400, code: 'refresh_token_not_found' } };
          }
          usersByRefreshToken.delete(refreshToken);
          const session = makeSession(refreshedUser);
          return { data: { user: refreshedUser, session }, error: null };
        },
        async getUser(token) {
          const verifiedUser = usersByToken.get(token);
          return verifiedUser
            ? { data: { user: verifiedUser }, error: null }
            : { data: { user: null }, error: { status: 401 } };
        },
      },
      from(table) {
        return new Query(table, user?.id);
      },
      async rpc(name, args) {
        if (name !== 'create_goal_tasks' || !user) {
          return { data: null, error: { code: '42501' } };
        }
        const goal = goals.find((item) => item.id === args.p_goal_id && item.user_id === user.id);
        if (!goal) {
          return { data: null, error: { message: 'GOAL_NOT_FOUND' } };
        }
        if (tasks.some((item) => item.goal_id === goal.id)) {
          return { data: null, error: { message: 'TASKS_ALREADY_GENERATED' } };
        }
        const createdTasks = args.p_tasks.map((task, index) => ({
          ...task,
          id: randomUUID(),
          goal_id: goal.id,
          user_id: user.id,
          display_order: index + 1,
          created_at: new Date().toISOString(),
        }));
        tasks.push(...createdTasks);
        return { data: createdTasks, error: null };
      },
    };
  }

  return { createClient, goals, tasks };
}

async function createHarness(options = {}) {
  const database = createFakeSupabase();
  const app = createApp({
    env: {
      SUPABASE_URL: 'http://supabase.test',
      SUPABASE_ANON_KEY: 'test-anon-key',
      GEMINI_API_KEY: 'test-gemini-key',
      FRONTEND_ORIGIN: 'http://localhost:5173',
      AUTH_REGISTER_RATE_LIMIT: '100',
      AUTH_LOGIN_RATE_LIMIT: '100',
      AUTH_VERIFY_EMAIL_RATE_LIMIT: '100',
      AUTH_REFRESH_RATE_LIMIT: '100',
    },
    createClient: database.createClient,
    generateGoalTasks: options.generateGoalTasks ?? (async () => sampleTasks),
    logger: () => {},
    authRateLimits: options.authRateLimits,
  });
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  return {
    database,
    async request(path, { method = 'GET', token, body } = {}) {
      const headers = {};
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
      if (body !== undefined) {
        headers['Content-Type'] = 'application/json';
      }
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: response.status, body: await response.json() };
    },
    async close() {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

async function registerAndConfirm(harness, email) {
  const registration = await harness.request('/api/auth/register', {
    method: 'POST',
    body: { email, password: 'a-secure-test-password' },
  });
  assert.equal(registration.status, 201);
  assert.equal(registration.body.emailConfirmationRequired, true);

  const beforeConfirmation = await harness.request('/api/auth/login', {
    method: 'POST',
    body: { email, password: 'a-secure-test-password' },
  });
  assert.equal(beforeConfirmation.status, 403);
  assert.equal(beforeConfirmation.body.error.code, 'EMAIL_NOT_CONFIRMED');

  const confirmation = await harness.request('/api/auth/verify-email', {
    method: 'POST',
    body: { tokenHash: `confirm-${registration.body.user.id}` },
  });
  assert.equal(confirmation.status, 200);
  return {
    user: registration.body.user,
    token: confirmation.body.session.access_token,
    session: confirmation.body.session,
  };
}

describe('Wagerly API', () => {
  let harness;

  before(async () => {
    harness = await createHarness();
  });

  after(async () => {
    await harness.close();
  });

  it('serves health and returns consistent validation and authentication errors', async () => {
    assert.deepEqual((await harness.request('/health')).body, { status: 'ok' });

    const invalidEmail = await harness.request('/api/auth/register', {
      method: 'POST',
      body: { email: 'not-an-email', password: 'a-secure-test-password' },
    });
    assert.equal(invalidEmail.status, 400);
    assert.equal(invalidEmail.body.error.code, 'VALIDATION_ERROR');

    const unauthenticated = await harness.request('/api/goals');
    assert.equal(unauthenticated.status, 401);
    assert.equal(unauthenticated.body.error.code, 'AUTHENTICATION_REQUIRED');

    const invalidToken = await harness.request('/api/goals', { token: 'not-a-token' });
    assert.equal(invalidToken.status, 401);
    assert.equal(invalidToken.body.error.code, 'INVALID_ACCESS_TOKEN');
  });

  it('validates missing registration fields, invalid emails and password length boundaries', async () => {
    const invalidRegistrations = [
      { body: { password: 'a-secure-test-password' } },
      { body: { email: 'missing-password@example.com' } },
      { body: { email: 'invalid-email', password: 'a-secure-test-password' } },
      { body: { email: 'short-password@example.com', password: '1234567' } },
      { body: { email: 'long-password@example.com', password: 'p'.repeat(129) } },
    ];

    for (const { body } of invalidRegistrations) {
      const response = await harness.request('/api/auth/register', { method: 'POST', body });
      assert.equal(response.status, 400);
      assert.equal(response.body.error.code, 'VALIDATION_ERROR');
    }

    const invalidLogins = [
      { password: 'a-secure-test-password' },
      { email: 'missing-password@example.com' },
    ];
    for (const body of invalidLogins) {
      const response = await harness.request('/api/auth/login', { method: 'POST', body });
      assert.equal(response.status, 400);
      assert.equal(response.body.error.code, 'VALIDATION_ERROR');
    }
  });

  it('registers successfully, requires confirmation, and permits login after confirmation', async () => {
    const registration = await harness.request('/api/auth/register', {
      method: 'POST',
      body: { email: 'auth-success@example.com', password: 'a-secure-test-password' },
    });
    assert.equal(registration.status, 201);
    assert.equal(registration.body.user.email, 'auth-success@example.com');
    assert.equal(registration.body.session, null);
    assert.equal(registration.body.emailConfirmationRequired, true);

    const confirmation = await harness.request('/api/auth/verify-email', {
      method: 'POST',
      body: { tokenHash: `confirm-${registration.body.user.id}` },
    });
    assert.equal(confirmation.status, 200);
    assert.ok(confirmation.body.session.access_token);

    const login = await harness.request('/api/auth/login', {
      method: 'POST',
      body: { email: 'auth-success@example.com', password: 'a-secure-test-password' },
    });
    assert.equal(login.status, 200);
    assert.equal(login.body.user.id, registration.body.user.id);
    assert.ok(login.body.session.access_token);
  });

  it('rejects incorrect passwords and invalid or expired confirmation tokens', async () => {
    const account = await registerAndConfirm(harness, 'incorrect-password@example.com');
    const wrongPassword = await harness.request('/api/auth/login', {
      method: 'POST',
      body: { email: 'incorrect-password@example.com', password: 'wrong-password' },
    });
    assert.equal(wrongPassword.status, 401);
    assert.equal(wrongPassword.body.error.code, 'INVALID_CREDENTIALS');

    for (const body of [{ tokenHash: 'expired-confirmation-token' }, { tokenHash: '' }, {}]) {
      const invalidConfirmation = await harness.request('/api/auth/verify-email', {
        method: 'POST',
        body,
      });
      assert.equal(invalidConfirmation.status, 400);
      assert.ok(['VALIDATION_ERROR', 'EMAIL_CONFIRMATION_INVALID'].includes(invalidConfirmation.body.error.code));
    }

    const repeatedConfirmation = await harness.request('/api/auth/verify-email', {
      method: 'POST',
      body: { tokenHash: `confirm-${account.user.id}` },
    });
    assert.equal(repeatedConfirmation.status, 400);
    assert.equal(repeatedConfirmation.body.error.code, 'EMAIL_CONFIRMATION_INVALID');
  });

  it('renews sessions with one-time refresh tokens and rejects invalid or reused tokens', async () => {
    const account = await registerAndConfirm(harness, 'refresh@example.com');
    for (const body of [{}, { refreshToken: 'invalid refresh token' }]) {
      const invalidInput = await harness.request('/api/auth/refresh', {
        method: 'POST',
        body,
      });
      assert.equal(invalidInput.status, 400);
      assert.equal(invalidInput.body.error.code, 'VALIDATION_ERROR');
    }

    const invalidToken = await harness.request('/api/auth/refresh', {
      method: 'POST',
      body: { refreshToken: 'expired-refresh-token' },
    });
    assert.equal(invalidToken.status, 401);
    assert.equal(invalidToken.body.error.code, 'INVALID_REFRESH_TOKEN');

    const renewed = await harness.request('/api/auth/refresh', {
      method: 'POST',
      body: { refreshToken: account.session.refresh_token },
    });
    assert.equal(renewed.status, 200);
    assert.equal(renewed.body.user.id, account.user.id);
    assert.notEqual(renewed.body.session.access_token, account.session.access_token);
    assert.notEqual(renewed.body.session.refresh_token, account.session.refresh_token);

    const reused = await harness.request('/api/auth/refresh', {
      method: 'POST',
      body: { refreshToken: account.session.refresh_token },
    });
    assert.equal(reused.status, 401);
    assert.equal(reused.body.error.code, 'INVALID_REFRESH_TOKEN');
  });

  it('rate limits each authentication endpoint with a consistent JSON 429', async () => {
    const limited = await createHarness({
      authRateLimits: {
        register: { windowMs: 60_000, limit: 1 },
        login: { windowMs: 60_000, limit: 1 },
        verify_email: { windowMs: 60_000, limit: 1 },
        refresh: { windowMs: 60_000, limit: 1 },
      },
    });

    try {
      const endpoints = [
        ['/api/auth/register', { email: 'limit@example.com', password: 'a-secure-test-password' }],
        ['/api/auth/login', { email: 'limit@example.com', password: 'a-secure-test-password' }],
        ['/api/auth/verify-email', { tokenHash: 'invalid' }],
        ['/api/auth/refresh', { refreshToken: 'invalid-refresh-token' }],
      ];

      for (const [path, body] of endpoints) {
        const first = await limited.request(path, { method: 'POST', body: {} });
        assert.equal(first.status, 400);
        assert.equal(first.body.error.code, 'VALIDATION_ERROR');
        const limitedResponse = await limited.request(path, { method: 'POST', body });
        assert.equal(limitedResponse.status, 429);
        assert.deepEqual(limitedResponse.body, {
          error: {
            code: 'AUTH_RATE_LIMITED',
            message: 'Too many authentication requests. Try again later.',
          },
        });
      }
    } finally {
      await limited.close();
    }
  });

  it('handles email confirmation, login, goal ownership and validation', async () => {
    const owner = await registerAndConfirm(harness, 'owner@example.com');
    const login = await harness.request('/api/auth/login', {
      method: 'POST',
      body: { email: 'owner@example.com', password: 'a-secure-test-password' },
    });
    assert.equal(login.status, 200);
    assert.ok(login.body.session.access_token);

    const invalidDeadline = await harness.request('/api/goals', {
      method: 'POST',
      token: owner.token,
      body: { title: 'A valid title', deadline: '2026-02-30' },
    });
    assert.equal(invalidDeadline.status, 400);

    const created = await harness.request('/api/goals', {
      method: 'POST',
      token: owner.token,
      body: {
        title: 'Run a 5K',
        description: 'Build a steady habit.',
        deadline: '2026-12-01',
        user_id: randomUUID(),
      },
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.goal.user_id, owner.user.id);
    assert.equal(created.body.goal.title, 'Run a 5K');
    assert.equal(created.body.goal.deadline, '2026-12-01T23:59:59.999Z');
    assert.ok(created.body.goal.created_at);

    const listed = await harness.request('/api/goals', { token: owner.token });
    assert.deepEqual(listed.body.goals.map((goal) => goal.id), [created.body.goal.id]);
    const retrieved = await harness.request(`/api/goals/${created.body.goal.id}`, { token: owner.token });
    assert.equal(retrieved.body.goal.id, created.body.goal.id);

    const otherUser = await registerAndConfirm(harness, 'other@example.com');
    const crossUser = await harness.request(`/api/goals/${created.body.goal.id}`, { token: otherUser.token });
    assert.equal(crossUser.status, 404);
    const otherList = await harness.request('/api/goals', { token: otherUser.token });
    assert.deepEqual(otherList.body.goals, []);
  });

  it('generates, saves, orders and retrieves one task batch', async () => {
    const account = await registerAndConfirm(harness, 'tasks@example.com');
    const created = await harness.request('/api/goals', {
      method: 'POST',
      token: account.token,
      body: { title: 'Learn guitar', description: 'Practice consistently.', deadline: '2026-12-31' },
    });

    const generated = await harness.request(`/api/goals/${created.body.goal.id}/tasks/generate`, {
      method: 'POST',
      token: account.token,
    });
    assert.equal(generated.status, 201);
    assert.equal(generated.body.tasks.length, 3);
    assert.deepEqual(generated.body.tasks.map((task) => task.display_order), [1, 2, 3]);

    const retrieved = await harness.request(`/api/goals/${created.body.goal.id}/tasks`, {
      token: account.token,
    });
    assert.deepEqual(retrieved.body.tasks.map((task) => task.id), generated.body.tasks.map((task) => task.id));
    assert.deepEqual(
      Object.keys(retrieved.body.tasks[0]).sort(),
      Object.keys(generated.body.tasks[0]).sort(),
    );

    const otherUser = await registerAndConfirm(harness, 'tasks-other@example.com');
    const crossUserTasks = await harness.request(`/api/goals/${created.body.goal.id}/tasks`, {
      token: otherUser.token,
    });
    assert.equal(crossUserTasks.status, 404);

    const duplicate = await harness.request(`/api/goals/${created.body.goal.id}/tasks/generate`, {
      method: 'POST',
      token: account.token,
    });
    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.body.error.code, 'TASKS_ALREADY_GENERATED');
  });

  it('prevents concurrent duplicate task batches', async () => {
    let generationCalls = 0;
    await harness.close();
    harness = await createHarness({
      generateGoalTasks: async () => {
        generationCalls += 1;
        await new Promise((resolve) => setTimeout(resolve, 20));
        return sampleTasks;
      },
    });
    const account = await registerAndConfirm(harness, 'concurrent@example.com');
    const created = await harness.request('/api/goals', {
      method: 'POST',
      token: account.token,
      body: { title: 'Practice piano', deadline: '2026-12-31' },
    });

    const results = await Promise.all([1, 2].map(() => harness.request(
      `/api/goals/${created.body.goal.id}/tasks/generate`,
      { method: 'POST', token: account.token },
    )));
    assert.deepEqual(results.map((result) => result.status).sort(), [201, 409]);
    assert.equal(generationCalls, 2);
  });

  it('limits task generation to five requests per user per hour', async () => {
    let generationCalls = 0;
    await harness.close();
    harness = await createHarness({
      generateGoalTasks: async () => {
        generationCalls += 1;
        return sampleTasks;
      },
    });
    const account = await registerAndConfirm(harness, 'rate-limit@example.com');
    const created = await harness.request('/api/goals', {
      method: 'POST',
      token: account.token,
      body: { title: 'Learn to cook', deadline: '2026-12-31' },
    });
    const responses = [];
    for (let requestNumber = 0; requestNumber < 6; requestNumber += 1) {
      responses.push(await harness.request(`/api/goals/${created.body.goal.id}/tasks/generate`, {
        method: 'POST',
        token: account.token,
      }));
    }

    assert.equal(responses[0].status, 201);
    assert.equal(responses[5].status, 429);
    assert.equal(responses[5].body.error.code, 'GENERATION_RATE_LIMITED');
    assert.equal(generationCalls, 1);
  });

  it('returns Gemini failures without saving placeholder tasks', async () => {
    await harness.close();
    harness = await createHarness({
      generateGoalTasks: async () => {
        throw new HttpError(504, 'AI_TIMEOUT', 'Gemini took too long to respond. Please try again.');
      },
    });
    const account = await registerAndConfirm(harness, 'gemini-failure@example.com');
    const created = await harness.request('/api/goals', {
      method: 'POST',
      token: account.token,
      body: { title: 'Write a book', deadline: '2026-12-31' },
    });
    const generated = await harness.request(`/api/goals/${created.body.goal.id}/tasks/generate`, {
      method: 'POST',
      token: account.token,
    });
    assert.equal(generated.status, 504);
    assert.equal(generated.body.error.code, 'AI_TIMEOUT');
    const retrieved = await harness.request(`/api/goals/${created.body.goal.id}/tasks`, {
      token: account.token,
    });
    assert.deepEqual(retrieved.body.tasks, []);
  });
});

describe('Gemini integration', () => {
  const goal = {
    title: 'Build a garden',
    description: 'Start a small vegetable garden.',
    deadline: '2026-12-01T00:00:00.000Z',
  };

  it('uses the configured model and validates structured task output', async () => {
    let requestOptions;
    let requestOptions2;
    let clientOptions;
    const tasks = await generateTasks(goal, {
      GEMINI_API_KEY: 'test-key',
      GEMINI_MODEL: 'test-model',
    }, (options) => {
      clientOptions = options;
      return {
        interactions: {
          async create(options, sdkOptions) {
            requestOptions = options;
            requestOptions2 = sdkOptions;
            return { status: 'completed', output_text: JSON.stringify({ tasks: sampleTasks }) };
          },
        },
      };
    });

    assert.equal(requestOptions.model, 'test-model');
    assert.equal(requestOptions.response_format.mime_type, 'application/json');
    assert.equal(requestOptions.response_format.schema.properties.tasks.minItems, 3);
    assert.equal(requestOptions.response_format.schema.properties.tasks.maxItems, 7);
    assert.match(requestOptions.input, /Build a garden/);
    assert.equal(requestOptions.store, false);
    assert.equal(tasks.length, 3);
    assert.equal(clientOptions.apiKey, 'test-key');
    assert.equal(requestOptions2.timeout_ms, 30000);
    assert.deepEqual(requestOptions2.retries, { strategy: 'none' });
  });

  it('maps Gemini quota, timeout, blocked, invalid JSON and invalid schema responses', async () => {
    async function runWith(responseOrError) {
      return generateTasks(goal, { GEMINI_API_KEY: 'test-key' }, () => ({
        interactions: {
          async create() {
            if (responseOrError instanceof Error) {
              throw responseOrError;
            }
            return responseOrError;
          },
        },
      }));
    }

    await assert.rejects(runWith(Object.assign(new Error('quota'), { statusCode: 429 })), {
      code: 'AI_QUOTA_EXCEEDED',
      status: 503,
    });
    await assert.rejects(runWith(Object.assign(new Error('timeout'), { name: 'APIConnectionTimeoutError' })), {
      code: 'AI_TIMEOUT',
      status: 504,
    });
    await assert.rejects(runWith({
      status: 'failed',
      errors: [{ code: 'safety_blocked', message: 'Response blocked by safety policy.' }],
    }), {
      code: 'AI_BLOCKED',
      status: 502,
    });
    await assert.rejects(runWith({ status: 'failed', errors: [{ code: 'internal_error' }] }), {
      code: 'AI_UNAVAILABLE',
      status: 502,
    });
    await assert.rejects(runWith({ status: 'completed', output_text: 'not json' }), {
      code: 'AI_INVALID_OUTPUT',
      status: 502,
    });
    await assert.rejects(runWith({
      status: 'completed',
      output_text: JSON.stringify({ tasks: sampleTasks.slice(0, 2) }),
    }), {
      code: 'AI_INVALID_OUTPUT',
      status: 502,
    });
  });

  it('fails explicitly when the Gemini API key is missing', async () => {
    await assert.rejects(generateTasks(goal, {}, () => {
      throw new Error('The Gemini client should not be constructed without a key.');
    }), {
      code: 'AI_NOT_CONFIGURED',
      status: 503,
    });
  });
});
