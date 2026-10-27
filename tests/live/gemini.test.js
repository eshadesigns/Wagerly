import 'dotenv/config';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { generateTasks } from '../../backend/src/ai.js';

const skipReason = process.env.GEMINI_API_KEY
  ? false
  : 'Set GEMINI_API_KEY to run the live Gemini smoke test.';

describe('Live Gemini smoke test', { skip: skipReason }, () => {
  it('generates a valid task plan using the configured Gemini model', { timeout: 45_000 }, async () => {
    const deadline = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const tasks = await generateTasks({
      title: 'Prepare a short daily reading habit',
      description: 'Build a sustainable reading routine with a few minutes each day.',
      deadline,
    });

    assert.ok(tasks.length >= 3 && tasks.length <= 7);
    assert.ok(tasks.every((task) => (
      typeof task.title === 'string' &&
      task.title.length > 0 &&
      typeof task.description === 'string' &&
      task.description.length > 0
    )));
  });
});
