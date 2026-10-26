import { GoogleGenAI } from '@google/genai';
import { HttpError } from './errors.js';

const TASK_SCHEMA = {
  type: 'object',
  properties: {
    tasks: {
      type: 'array',
      minItems: 3,
      maxItems: 7,
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
        },
        required: ['title', 'description'],
      },
    },
  },
  required: ['tasks'],
};

function validateGeneratedTasks(value) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.tasks) || value.tasks.length < 3 || value.tasks.length > 7) {
    throw new HttpError(502, 'AI_INVALID_OUTPUT', 'Gemini returned a task plan in an invalid format.');
  }

  const titles = new Set();
  const tasks = value.tasks.map((task) => {
    if (!task || typeof task !== 'object' || Array.isArray(task)) {
      throw new HttpError(502, 'AI_INVALID_OUTPUT', 'Gemini returned a task plan in an invalid format.');
    }

    const title = typeof task.title === 'string' ? task.title.trim() : '';
    const description = typeof task.description === 'string' ? task.description.trim() : '';
    if (title.length === 0 || title.length > 120 || description.length === 0 || description.length > 1000) {
      throw new HttpError(502, 'AI_INVALID_OUTPUT', 'Gemini returned a task plan in an invalid format.');
    }
    const normalizedTitle = title.toLowerCase();
    if (titles.has(normalizedTitle)) {
      throw new HttpError(502, 'AI_INVALID_OUTPUT', 'Gemini returned duplicate tasks.');
    }
    titles.add(normalizedTitle);
    return { title, description };
  });

  return tasks;
}

function providerFailure(error) {
  const status = error?.status ?? error?.statusCode;
  if (
    ['TimeoutError', 'AbortError', 'RequestTimeoutError', 'APIConnectionTimeoutError'].includes(error?.name) ||
    status === 408 ||
    status === 504
  ) {
    return new HttpError(504, 'AI_TIMEOUT', 'Gemini took too long to respond. Please try again.');
  }
  if (status === 429) {
    return new HttpError(503, 'AI_QUOTA_EXCEEDED', 'Gemini is temporarily unavailable due to quota limits.');
  }
  return new HttpError(502, 'AI_UNAVAILABLE', 'Gemini could not generate a task plan.');
}

export async function generateTasks(
  goal,
  env = process.env,
  createClient = (options) => new GoogleGenAI(options),
) {
  if (!env.GEMINI_API_KEY) {
    throw new HttpError(503, 'AI_NOT_CONFIGURED', 'Gemini is not configured on this server.');
  }

  const client = createClient({
    apiKey: env.GEMINI_API_KEY,
    httpOptions: { timeout: 30000, retryOptions: { attempts: 1 } },
  });
  const model = env.GEMINI_MODEL || 'gemini-3.8-flash';
  let response;
  try {
    response = await client.interactions.create({
      model,
      input: [
        'Create between 3 and 7 specific, actionable steps for this personal goal. ' +
        'Order them logically, make them achievable before the deadline, and tailor them to the available time. ' +
        'Return only the requested structured JSON task list.',
        `Goal title: ${goal.title}\nGoal description: ${goal.description}\nDeadline: ${goal.deadline}`,
      ].join('\n\n'),
      response_format: {
        type: 'text',
        mime_type: 'application/json',
        schema: TASK_SCHEMA,
      },
    });
  } catch (error) {
    throw providerFailure(error);
  }

  if (response?.status !== 'completed' || !response?.output_text) {
    throw new HttpError(502, 'AI_BLOCKED', 'Gemini did not return a usable task plan.');
  }

  let parsed;
  try {
    parsed = JSON.parse(response.output_text);
  } catch {
    throw new HttpError(502, 'AI_INVALID_OUTPUT', 'Gemini returned a task plan in an invalid format.');
  }
  return validateGeneratedTasks(parsed);
}
