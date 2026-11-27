import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { throwDatabaseError } from '../backend/src/errors.js';
import { validatePact } from '../backend/src/pacts.js';
import { validateInvitation, validateReview } from '../backend/src/accountability.js';
import { validateTaskUpdate } from '../backend/src/tasks.js';

function getError(functionToRun)
{
  try
  {
    functionToRun();
  }
  catch (error)
  {
    return error;
  }
  return null;
}

function assertBadRequest(functionToRun)
{
  const error = getError(functionToRun);
  assert.notEqual(error, null);
  assert.equal(error.status, 400);
  assert.equal(error.code, 'VALIDATION_ERROR');
}

describe('Pacts', () =>
{
  it('accepts a virtual amount pact', () =>
  {
    const result = validatePact({ stakeType: 'virtual_amount', virtualAmount: 25.5 });
    assert.equal(result.stake_type, 'virtual_amount');
    assert.equal(result.virtual_amount, 25.5);
    assert.equal(result.consequence, null);
  });

  it('accepts a custom consequence pact', () =>
  {
    const result = validatePact({ stakeType: 'custom_consequence', consequence: '  Do the dishes ' });
    assert.equal(result.stake_type, 'custom_consequence');
    assert.equal(result.virtual_amount, null);
    assert.equal(result.consequence, 'Do the dishes');
  });

  it('rejects a missing or unknown stake type', () =>
  {
    assertBadRequest(() => validatePact(null));
    assertBadRequest(() => validatePact({}));
    assertBadRequest(() => validatePact({ stakeType: 'cash' }));
  });

  it('rejects bad virtual amounts', () =>
  {
    assertBadRequest(() => validatePact({ stakeType: 'virtual_amount' }));
    assertBadRequest(() => validatePact({ stakeType: 'virtual_amount', virtualAmount: 0 }));
    assertBadRequest(() => validatePact({ stakeType: 'virtual_amount', virtualAmount: -1 }));
    assertBadRequest(() => validatePact({ stakeType: 'virtual_amount', virtualAmount: '5' }));
    assertBadRequest(() => validatePact({ stakeType: 'virtual_amount', virtualAmount: 1000001 }));
    assertBadRequest(() => validatePact({ stakeType: 'virtual_amount', virtualAmount: 1.999 }));
  });

  it('rejects bad consequences', () =>
  {
    assertBadRequest(() => validatePact({ stakeType: 'custom_consequence' }));
    assertBadRequest(() => validatePact({ stakeType: 'custom_consequence', consequence: '   ' }));
    assertBadRequest(() => validatePact({ stakeType: 'custom_consequence', consequence: 'x'.repeat(501) }));
  });

  it('rejects a pact with both an amount and a consequence', () =>
  {
    assertBadRequest(() => validatePact({ stakeType: 'virtual_amount', virtualAmount: 5, consequence: 'x' }));
    assertBadRequest(() => validatePact({ stakeType: 'custom_consequence', consequence: 'x', virtualAmount: 5 }));
  });
});

describe('Task edits', () =>
{
  it('accepts a new title or description', () =>
  {
    assert.deepEqual(validateTaskUpdate({ title: ' New title ' }), { title: 'New title' });
    assert.deepEqual(validateTaskUpdate({ description: 'New description' }), { description: 'New description' });
  });

  it('accepts the longest allowed title and description', () =>
  {
    const result = validateTaskUpdate({ title: 'x'.repeat(120), description: 'y'.repeat(1000) });
    assert.equal(result.title.length, 120);
    assert.equal(result.description.length, 1000);
  });

  it('rejects an empty edit or bad values', () =>
  {
    assertBadRequest(() => validateTaskUpdate(null));
    assertBadRequest(() => validateTaskUpdate({}));
    assertBadRequest(() => validateTaskUpdate({ title: '' }));
    assertBadRequest(() => validateTaskUpdate({ title: 5 }));
    assertBadRequest(() => validateTaskUpdate({ title: 'x'.repeat(121) }));
    assertBadRequest(() => validateTaskUpdate({ description: '   ' }));
    assertBadRequest(() => validateTaskUpdate({ description: 'y'.repeat(1001) }));
  });
});

describe('Invitations and reviews', () =>
{
  it('cleans up a valid email', () =>
  {
    assert.equal(validateInvitation({ email: ' Friend@Example.COM ' }), 'friend@example.com');
  });

  it('rejects bad emails', () =>
  {
    assertBadRequest(() => validateInvitation(null));
    assertBadRequest(() => validateInvitation({}));
    assertBadRequest(() => validateInvitation({ email: 'nope' }));
    assertBadRequest(() => validateInvitation({ email: 5 }));
  });

  it('turns approve and reject into true and false', () =>
  {
    assert.equal(validateReview({ decision: 'approve' }), true);
    assert.equal(validateReview({ decision: 'reject' }), false);
  });

  it('rejects any other decision', () =>
  {
    assertBadRequest(() => validateReview(null));
    assertBadRequest(() => validateReview({}));
    assertBadRequest(() => validateReview({ decision: 'maybe' }));
    assertBadRequest(() => validateReview({ decision: true }));
  });
});

describe('Database errors', () =>
{
  it('turns known database messages into the right HTTP error', () =>
  {
    const cases = [
      ['NOT_ASSIGNED_PARTNER', 403],
      ['GOAL_CLOSED', 409],
      ['TASK_NOT_PENDING', 409],
      ['PARTNER_NOT_FOUND', 404],
      ['CANNOT_INVITE_SELF', 400],
      ['PACT_EXISTS', 409],
    ];

    for (const testCase of cases)
    {
      const error = getError(() => throwDatabaseError({ message: testCase[0] }));
      assert.equal(error.code, testCase[0]);
      assert.equal(error.status, testCase[1]);
    }
  });

  it('hides unknown database failures', () =>
  {
    const error = getError(() => throwDatabaseError({ message: 'relation "x" does not exist' }));
    assert.equal(error.status, 503);
    assert.equal(error.code, 'DATABASE_UNAVAILABLE');

    const noError = getError(() => throwDatabaseError(null));
    assert.equal(noError.status, 503);
  });
});