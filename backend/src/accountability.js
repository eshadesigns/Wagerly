import { HttpError, databaseUnavailable, dbError, throwDatabaseError } from './errors.js';
import { validateGoalId } from './goals.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateId(value, label)
{
  if (typeof value !== 'string' || !UUID_PATTERN.test(value))
  {
    throw new HttpError(400, 'VALIDATION_ERROR', label + ' must be a valid UUID.');
  }
  return value;
}

export function validateInvitation(body)
{
  let email = '';
  if (body && typeof body.email === 'string')
  {
    email = body.email.trim().toLowerCase();
  }

  const looksLikeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (email.length > 254 || !looksLikeEmail)
  {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Enter a valid email address.');
  }
  return email;
}

export function validateReview(body)
{
  let decision = undefined;
  if (body)
  {
    decision = body.decision;
  }

  if (decision !== 'approve' && decision !== 'reject')
  {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Decision must be "approve" or "reject".');
  }
  return decision === 'approve';
}

export async function inviteAccountabilityPartner(client, goalId, body)
{
  validateGoalId(goalId);
  const email = validateInvitation(body);

  const { data, error } = await client.rpc('invite_partner', { p_goal_id: goalId, p_email: email });
  if (error || !data)
  {
    throwDatabaseError(error);
  }
  return data;
}

export async function listInvitations(client, userId)
{
  const { data, error } = await client
    .from('partner_invitations')
    .select('*')
    .order('created_at', { ascending: false });
  if (error)
  {
    throw databaseUnavailable();
  }

  const invitations = [];
  for (const invitation of data)
  {
    let role = 'partner';
    if (invitation.owner_id === userId)
    {
      role = 'owner';
    }

    invitations.push({
      id: invitation.id,
      goal_id: invitation.goal_id,
      goal_title: invitation.goal_title,
      owner_email: invitation.owner_email,
      partner_email: invitation.partner_email,
      status: invitation.status,
      role: role,
      created_at: invitation.created_at,
    });
  }
  return invitations;
}

export async function respondToInvitation(client, userId, invitationId, accept)
{
  validateId(invitationId, 'Invitation ID');

  const { data: invitation, error } = await client
    .from('partner_invitations')
    .select('*')
    .eq('id', invitationId)
    .maybeSingle();
  if (error)
  {
    throw databaseUnavailable();
  }
  if (!invitation || invitation.partner_id !== userId)
  {
    throw dbError('INVITATION_NOT_FOUND');
  }
  if (invitation.status !== 'pending')
  {
    throw dbError('INVITATION_ALREADY_RESPONDED');
  }

  let newStatus = 'declined';
  if (accept)
  {
    newStatus = 'accepted';
  }

  const { data, error: updateError } = await client
    .from('partner_invitations')
    .update({ status: newStatus })
    .eq('id', invitationId)
    .eq('status', 'pending')
    .select('*')
    .maybeSingle();
  if (updateError)
  {
    throw databaseUnavailable();
  }
  if (!data)
  {
    throw dbError('INVITATION_ALREADY_RESPONDED');
  }
  return data;
}

export async function listPendingReviews(client, userId)
{
  const { data: invitations, error } = await client
    .from('partner_invitations')
    .select('goal_id, goal_title, owner_email')
    .eq('partner_id', userId)
    .eq('status', 'accepted');
  if (error)
  {
    throw databaseUnavailable();
  }
  if (invitations.length === 0)
  {
    return [];
  }

  const goalIds = [];
  for (const invitation of invitations)
  {
    goalIds.push(invitation.goal_id);
  }

  const { data: goals, error: goalsError } = await client
    .from('goals')
    .select('id')
    .eq('status', 'active')
    .in('id', goalIds);
  const { data: tasks, error: tasksError } = await client
    .from('tasks')
    .select('id, goal_id, title, description, display_order, completed_at')
    .eq('status', 'pending_verification')
    .in('goal_id', goalIds)
    .order('completed_at', { ascending: true });
  if (goalsError || tasksError)
  {
    throw databaseUnavailable();
  }

  const result = [];
  for (const task of tasks)
  {
    const goalIsActive = goals.some((goal) => goal.id === task.goal_id);
    if (!goalIsActive)
    {
      continue;
    }

    const invitation = invitations.find((item) => item.goal_id === task.goal_id);
    result.push({
      task_id: task.id,
      goal_id: task.goal_id,
      goal_title: invitation.goal_title,
      owner_email: invitation.owner_email,
      title: task.title,
      description: task.description,
      display_order: task.display_order,
      completed_at: task.completed_at,
    });
  }
  return result;
}