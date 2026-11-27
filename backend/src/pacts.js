import { HttpError, databaseUnavailable, dbError } from './errors.js';
import { getGoal, validateGoalId } from './goals.js';
import { refreshOutcomes } from './progress.js';

export function validatePact(body)
{
  if (!body || typeof body !== 'object' || Array.isArray(body))
  {
    throw new HttpError(400, 'VALIDATION_ERROR', 'A JSON object is required.');
  }

  if (body.stakeType === 'virtual_amount')
  {
    const amount = body.virtualAmount;
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0 || amount > 1000000)
    {
      throw new HttpError(400, 'VALIDATION_ERROR', 'Virtual amount must be a number greater than 0 and at most 1000000.');
    }
    if (Math.abs(amount * 100 - Math.round(amount * 100)) > 0.000001)
    {
      throw new HttpError(400, 'VALIDATION_ERROR', 'Virtual amount can have at most two decimal places.');
    }
    if (body.consequence !== undefined && body.consequence !== null)
    {
      throw new HttpError(400, 'VALIDATION_ERROR', 'A virtual amount pact cannot also have a consequence.');
    }
    return { stake_type: 'virtual_amount', virtual_amount: amount, consequence: null };
  }

  if (body.stakeType === 'custom_consequence')
  {
    let consequence = '';
    if (typeof body.consequence === 'string')
    {
      consequence = body.consequence.trim();
    }

    if (consequence.length === 0 || consequence.length > 500)
    {
      throw new HttpError(400, 'VALIDATION_ERROR', 'Consequence is required and must be at most 500 characters.');
    }
    if (body.virtualAmount !== undefined && body.virtualAmount !== null)
    {
      throw new HttpError(400, 'VALIDATION_ERROR', 'A consequence pact cannot also have a virtual amount.');
    }
    return { stake_type: 'custom_consequence', virtual_amount: null, consequence: consequence };
  }

  throw new HttpError(400, 'VALIDATION_ERROR', 'Stake type must be "virtual_amount" or "custom_consequence".');
}

export async function createPact(client, userId, goalId, body)
{
  validateGoalId(goalId);
  const stake = validatePact(body);

  await refreshOutcomes(client);

  const goal = await getGoal(client, goalId);
  if (!goal || goal.user_id !== userId)
  {
    throw dbError('GOAL_NOT_FOUND');
  }
  if (goal.status !== 'active')
  {
    throw dbError('GOAL_CLOSED');
  }

  const { data: invitation, error: invitationError } = await client
    .from('partner_invitations')
    .select('partner_id')
    .eq('goal_id', goalId)
    .eq('status', 'accepted')
    .maybeSingle();
  if (invitationError)
  {
    throw databaseUnavailable();
  }
  if (!invitation)
  {
    throw dbError('PARTNER_REQUIRED');
  }

  const { data, error } = await client
    .from('pacts')
    .insert({
      goal_id: goalId,
      user_id: userId,
      partner_id: invitation.partner_id,
      deadline: goal.deadline,
      ...stake,
    })
    .select('*')
    .single();
  if (error && error.code === '23505')
  {
    throw dbError('PACT_EXISTS');
  }
  if (error || !data)
  {
    throw databaseUnavailable();
  }
  return data;
}

export async function getPact(client, goalId)
{
  validateGoalId(goalId);

  const { data, error } = await client
    .from('pacts')
    .select('*')
    .eq('goal_id', goalId)
    .maybeSingle();
  if (error)
  {
    throw databaseUnavailable();
  }
  if (!data)
  {
    throw dbError('PACT_NOT_FOUND');
  }
  return data;
}