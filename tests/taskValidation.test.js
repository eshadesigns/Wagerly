import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateTaskInput } from '../backend/src/tasks.js';

const sampleTask = {
  title: 'Review SWE modules',
  description: 'Review the notes and complete practice questions.',
};

describe('Task validation', () => {

  // Make sure a valid task is accepted.
  it('accepts valid task information', () => {
    const result = validateTaskInput({
      tasks: [sampleTask],
    });

    assert.deepEqual(result, [sampleTask]);
  });

  // Make sure extra spaces are removed before saving.
  it('removes extra spaces from task information', () => {
    const result = validateTaskInput({
      tasks: [{
        title: '  Review SWE modules  ',
        description: '  Complete practice questions.  ',
      }],
    });

    assert.equal(result[0].title, 'Review SWE modules');
    assert.equal(result[0].description, 'Complete practice questions.');
  });

  // Seven tasks should still be accepted.
  it('accepts the maximum of seven tasks', () => {
    const tasks = Array.from({ length: 7 }, (_, index) => ({
      title: `Task ${index + 1}`,
      description: 'Complete the assigned task.',
    }));

    const result = validateTaskInput({ tasks });

    assert.equal(result.length, 7);
  });

  // A goal plan should have at least one task.
  it('rejects an empty task list', () => {
    assert.throws(() => {
      validateTaskInput({ tasks: [] });
    }, {
      status: 400,
      code: 'VALIDATION_ERROR',
    });
  });

  // Make sure the task limit cannot be exceeded.
  it('rejects more than seven tasks', () => {
    const tasks = Array.from({ length: 8 }, () => sampleTask);

    assert.throws(() => {
      validateTaskInput({ tasks });
    }, {
      status: 400,
      code: 'VALIDATION_ERROR',
    });
  });

  // Each task needs a valid title.
  it('rejects missing or invalid task titles', () => {
    const invalidTitles = [undefined, '', '   ', 'a'.repeat(121)];

    for (const title of invalidTitles) {
      assert.throws(() => {
        validateTaskInput({
          tasks: [{ ...sampleTask, title }],
        });
      }, {
        status: 400,
        code: 'VALIDATION_ERROR',
      });
    }
  });

  // Each task also needs a valid description.
  it('rejects missing or invalid task descriptions', () => {
    const invalidDescriptions = [
      undefined, '', '   ', 'a'.repeat(1001),
    ];

    for (const description of invalidDescriptions) {
      assert.throws(() => {
        validateTaskInput({
          tasks: [{ ...sampleTask, description }],
        });
      }, {
        status: 400,
        code: 'VALIDATION_ERROR',
      });
    }
  });

});