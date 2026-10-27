import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { Pool } from 'pg';
import { createClient } from '@supabase/supabase-js';
import { createApp } from '../../backend/src/index.js';

const config = {
  url: process.env.SUPABASE_TEST_URL,
  anonKey: process.env.SUPABASE_TEST_ANON_KEY,
  databaseUrl: process.env.SUPABASE_TEST_DB_URL,
  projectRef: process.env.SUPABASE_TEST_PROJECT_REF,
};

const missingConfig = [
  ['SUPABASE_TEST_URL', config.url],
  ['SUPABASE_TEST_ANON_KEY', config.anonKey],
  ['SUPABASE_TEST_DB_URL', config.databaseUrl],
  ['SUPABASE_TEST_PROJECT_REF', config.projectRef],
  ['SUPABASE_TEST_ALLOW_CLEANUP=true', process.env.SUPABASE_TEST_ALLOW_CLEANUP === 'true'],
].filter(([, value]) => !value).map(([name]) => name);

const skipReason = missingConfig.length > 0
  ? `Set ${missingConfig.join(', ')} to run against a dedicated Supabase test project.`
  : false;

const taskPlan = [
  { title: 'Choose a weekly schedule', description: 'Select three realistic days and add them to your calendar.' },
  { title: 'Complete an easy first session', description: 'Start with a short, comfortable practice session.' },
  { title: 'Review and adjust the plan', description: 'Review progress and adjust next week as needed.' },
];

describe('Supabase database integration', { skip: skipReason }, () => {
  const createdUsers = [];
  let pool;
  let server;
  let baseUrl;

  function userClient(accessToken) {
    const client = createClient(config.url, config.anonKey, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
      global: {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    });
    return client;
  }

  async function createTestUser() {
    const email = `wagerly-it-${randomUUID()}@example.com`;
    const password = randomBytes(32).toString('base64url');
    const client = createClient(config.url, config.anonKey, {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    });
    const { data, error } = await client.auth.signUp({ email, password });
    if (data.user?.id) {
      createdUsers.push({ id: data.user.id, email });
    }
    assert.ifError(error);
    assert.ok(data.user, 'Supabase should return a test user');
    assert.ok(
      data.session,
      'Disable email confirmation in the dedicated test project so tests can authenticate without inbox access',
    );
    return {
      user: data.user,
      session: data.session,
      dataClient: userClient(data.session.access_token),
    };
  }

  async function request(path, { token, method = 'GET', body } = {}) {
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
  }

  async function createGoal(token, title) {
    const response = await request('/api/goals', {
      method: 'POST',
      token,
      body: {
        title,
        description: 'Created by the isolated Supabase integration suite.',
        deadline: '2027-01-31',
      },
    });
    assert.equal(response.status, 201);
    return response.body.goal;
  }

  before(async () => {
    const targetHost = new URL(config.url).hostname;
    const databaseTarget = new URL(config.databaseUrl);
    const localHosts = new Set(['localhost', '127.0.0.1', '::1']);
    if (
      !localHosts.has(targetHost) &&
      targetHost !== `${config.projectRef}.supabase.co`
    ) {
      throw new Error('SUPABASE_TEST_URL does not match SUPABASE_TEST_PROJECT_REF; refusing to run.');
    }
    if (!localHosts.has(targetHost)) {
      const databaseUser = decodeURIComponent(databaseTarget.username);
      const matchesProject = databaseTarget.hostname === `db.${config.projectRef}.supabase.co` ||
        databaseUser.endsWith(`.${config.projectRef}`);
      if (!matchesProject) {
        throw new Error('SUPABASE_TEST_DB_URL does not match SUPABASE_TEST_PROJECT_REF; refusing to run.');
      }
    } else if (!localHosts.has(databaseTarget.hostname)) {
      throw new Error('A local Supabase test URL requires a local database URL; refusing to run.');
    }

    pool = new Pool({ connectionString: config.databaseUrl });
    const app = createApp({
      env: {
        SUPABASE_URL: config.url,
        SUPABASE_ANON_KEY: config.anonKey,
        FRONTEND_ORIGIN: 'http://localhost:5173',
        AUTH_REGISTER_RATE_LIMIT: '100',
        AUTH_LOGIN_RATE_LIMIT: '100',
        AUTH_VERIFY_EMAIL_RATE_LIMIT: '100',
        AUTH_REFRESH_RATE_LIMIT: '100',
      },
      generateGoalTasks: async () => taskPlan,
      logger: () => {},
    });
    server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    try {
      if (server) {
        server.closeAllConnections();
        await new Promise((resolve, reject) => {
          server.close((error) => error ? reject(error) : resolve());
        });
      }
    } finally {
      if (pool) {
        try {
          if (createdUsers.length > 0) {
            const ids = createdUsers.map(({ id }) => id);
            const emails = createdUsers.map(({ email }) => email);
            await pool.query(
              'DELETE FROM auth.users WHERE id = ANY($1::uuid[]) AND email = ANY($2::text[])',
              [ids, emails],
            );
          }
        } finally {
          await pool.end();
        }
      }
    }
  });

  it('enforces user ownership for goals and tasks through authenticated RLS requests', async () => {
    const owner = await createTestUser();
    const other = await createTestUser();
    const goal = await createGoal(owner.session.access_token, `RLS goal ${randomUUID()}`);
    const generated = await request(`/api/goals/${goal.id}/tasks/generate`, {
      method: 'POST',
      token: owner.session.access_token,
    });
    assert.equal(generated.status, 201);
    assert.equal(generated.body.tasks.length, taskPlan.length);

    const otherGoal = await request(`/api/goals/${goal.id}`, {
      token: other.session.access_token,
    });
    assert.equal(otherGoal.status, 404);
    const otherTasksEndpoint = await request(`/api/goals/${goal.id}/tasks`, {
      token: other.session.access_token,
    });
    assert.equal(otherTasksEndpoint.status, 404);

    const invisibleGoal = await other.dataClient
      .from('goals')
      .select('id')
      .eq('id', goal.id);
    assert.ifError(invisibleGoal.error);
    assert.deepEqual(invisibleGoal.data, []);

    const invisibleTasks = await other.dataClient
      .from('tasks')
      .select('id')
      .eq('goal_id', goal.id);
    assert.ifError(invisibleTasks.error);
    assert.deepEqual(invisibleTasks.data, []);
  });

  it('serializes concurrent generation and saves exactly one complete batch', async () => {
    const owner = await createTestUser();
    const goal = await createGoal(owner.session.access_token, `Concurrency goal ${randomUUID()}`);
    const url = `/api/goals/${goal.id}/tasks/generate`;
    const responses = await Promise.all([
      request(url, { method: 'POST', token: owner.session.access_token }),
      request(url, { method: 'POST', token: owner.session.access_token }),
    ]);

    assert.deepEqual(responses.map(({ status }) => status).sort(), [201, 409]);
    const saved = await owner.dataClient
      .from('tasks')
      .select('id, goal_id, title, description, display_order')
      .eq('goal_id', goal.id)
      .order('display_order', { ascending: true });
    assert.ifError(saved.error);
    assert.equal(saved.data.length, taskPlan.length);
    assert.deepEqual(saved.data.map(({ display_order }) => display_order), [1, 2, 3]);
    assert.deepEqual(saved.data.map(({ title }) => title), taskPlan.map(({ title }) => title));
    assert.ok(saved.data.every((task) => task.goal_id === goal.id && task.description.length > 0));
  });
});
