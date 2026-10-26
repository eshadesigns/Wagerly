import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { confirmEmail, login, register } from './auth.js';
import { generateTasks } from './ai.js';
import { createSupabaseClient } from './database.js';
import { HttpError } from './errors.js';
import { createGoal, getGoal, listGoals, validateGoalId } from './goals.js';
import { listTasks, saveGeneratedTasks } from './tasks.js';

function createAuthMiddleware(env, createClient) {
  return async function authenticate(req, _res, next) {
    const authorization = req.get('authorization') ?? '';
    const match = /^Bearer\s+(\S+)$/i.exec(authorization);
    if (!match) {
      return next(new HttpError(401, 'AUTHENTICATION_REQUIRED', 'A valid bearer access token is required.'));
    }

    try {
      const client = createClient(env, match[1]);
      let result;
      try {
        result = await client.auth.getUser(match[1]);
      } catch {
        return next(new HttpError(503, 'AUTH_SERVICE_UNAVAILABLE', 'The authentication service is unavailable.'));
      }

      if (result.error || !result.data.user?.id) {
        return next(new HttpError(401, 'INVALID_ACCESS_TOKEN', 'The access token is invalid or expired.'));
      }

      req.user = { id: result.data.user.id, email: result.data.user.email };
      req.supabase = client;
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

function errorHandler(logger) {
  return (error, _req, res, _next) => {
    let responseError = error;
    if (error?.type === 'entity.parse.failed') {
      responseError = new HttpError(400, 'INVALID_JSON', 'Request body must contain valid JSON.');
    } else if (error?.type === 'entity.too.large') {
      responseError = new HttpError(413, 'REQUEST_TOO_LARGE', 'Request body exceeds the allowed size.');
    } else if (!(error instanceof HttpError)) {
      logger('Unhandled request error', {
        name: typeof error?.name === 'string' ? error.name : 'Error',
        code: typeof error?.code === 'string' ? error.code : undefined,
      });
      responseError = new HttpError(500, 'INTERNAL_ERROR', 'An unexpected error occurred.');
    }

    res.status(responseError.status).json({
      error: {
        code: responseError.code,
        message: responseError.message,
      },
    });
  };
}

export function createApp({
  env = process.env,
  createClient = createSupabaseClient,
  generateGoalTasks = generateTasks,
  logger = console.error,
} = {}) {
  const app = express();
  const allowedOrigins = new Set(
    (env.FRONTEND_ORIGIN || 'http://localhost:5173')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
  const authenticate = createAuthMiddleware(env, createClient);

  app.use(cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        return callback(null, true);
      }
      return callback(new HttpError(403, 'ORIGIN_NOT_ALLOWED', 'This origin is not allowed.'));
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
  }));
  app.use(express.json({ limit: '32kb' }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.post('/api/auth/register', async (req, res) => {
    const client = createClient(env);
    const result = await register(client, req.body);
    res.status(201).json(result);
  });

  app.post('/api/auth/login', async (req, res) => {
    const client = createClient(env);
    const result = await login(client, req.body);
    res.json(result);
  });

  app.post('/api/auth/verify-email', async (req, res) => {
    const client = createClient(env);
    const result = await confirmEmail(client, req.body);
    res.json(result);
  });

  app.get('/api/goals', authenticate, async (req, res) => {
    res.json({ goals: await listGoals(req.supabase) });
  });

  app.post('/api/goals', authenticate, async (req, res) => {
    const goal = await createGoal(req.supabase, req.user.id, req.body);
    res.status(201).json({ goal });
  });

  app.get('/api/goals/:goalId', authenticate, async (req, res) => {
    validateGoalId(req.params.goalId);
    const goal = await getGoal(req.supabase, req.params.goalId);
    if (!goal) {
      throw new HttpError(404, 'GOAL_NOT_FOUND', 'Goal not found.');
    }
    res.json({ goal });
  });

  app.get('/api/goals/:goalId/tasks', authenticate, async (req, res) => {
    validateGoalId(req.params.goalId);
    const goal = await getGoal(req.supabase, req.params.goalId);
    if (!goal) {
      throw new HttpError(404, 'GOAL_NOT_FOUND', 'Goal not found.');
    }
    res.json({ tasks: await listTasks(req.supabase, req.params.goalId) });
  });

  const generationLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 5,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.user.id,
    handler: (_req, res) => {
      res.status(429).json({
        error: {
          code: 'GENERATION_RATE_LIMITED',
          message: 'Task generation limit reached. Try again later.',
        },
      });
    },
  });

  app.post('/api/goals/:goalId/tasks/generate', authenticate, generationLimiter, async (req, res) => {
    const goalId = validateGoalId(req.params.goalId);
    const goal = await getGoal(req.supabase, goalId);
    if (!goal) {
      throw new HttpError(404, 'GOAL_NOT_FOUND', 'Goal not found.');
    }

    if ((await listTasks(req.supabase, goalId)).length > 0) {
      throw new HttpError(409, 'TASKS_ALREADY_GENERATED', 'Tasks have already been generated for this goal.');
    }

    const generatedTasks = await generateGoalTasks(goal, env);
    const tasks = await saveGeneratedTasks(req.supabase, goalId, generatedTasks);
    res.status(201).json({ tasks });
  });

  app.use((_req, _res, next) => {
    next(new HttpError(404, 'NOT_FOUND', 'Endpoint not found.'));
  });
  app.use(errorHandler(logger));

  return app;
}

export function startServer(env = process.env) {
  const port = Number(env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }
  const app = createApp({ env });
  return app.listen(port, () => {
    console.log(`Wagerly API listening on port ${port}`);
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startServer();
}
