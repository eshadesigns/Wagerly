import { HttpError, databaseUnavailable } from './errors.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/i;

export function validateGoalId(value) {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Goal ID must be a valid UUID.');
  }
  return value;
}

function normalizeDeadline(value) {
  if (typeof value !== 'string' || (!DATE_PATTERN.test(value) && !DATETIME_PATTERN.test(value))) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Deadline must be an ISO date or timezone-qualified date-time.');
  }

  const datePart = value.slice(0, 10);
  const calendarDate = new Date(`${datePart}T00:00:00.000Z`);
  if (Number.isNaN(calendarDate.getTime()) || calendarDate.toISOString().slice(0, 10) !== datePart) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Deadline must be a valid calendar date.');
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Deadline must be a valid date.');
  }
  if (DATE_PATTERN.test(value)) {
    date.setUTCHours(23, 59, 59, 999);
  }
  return date.toISOString();
}

export function validateGoal(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'A JSON object is required.');
  }
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const description = body.description === undefined ? '' : body.description;

  if (title.length === 0 || title.length > 120) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Title is required and must be at most 120 characters.');
  }
  if (typeof description !== 'string' || description.length > 2000) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Description must be a string of at most 2000 characters.');
  }
  if (body.deadline === undefined || body.deadline === null) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Deadline is required.');
  }

  return {
    title,
    description: description.trim(),
    deadline: normalizeDeadline(body.deadline),
  };
}

export async function createGoal(client, userId, body) {
  const input = validateGoal(body);
  const { data, error } = await client
    .from('goals')
    .insert({ ...input, user_id: userId })
    .select('id, user_id, title, description, deadline, created_at')
    .single();

  if (error || !data) {
    throw databaseUnavailable();
  }
  return data;
}

export async function listGoals(client) {
  const { data, error } = await client
    .from('goals')
    .select('id, user_id, title, description, deadline, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    throw databaseUnavailable();
  }
  return data ?? [];
}

export async function getGoal(client, goalId) {
  validateGoalId(goalId);
  const { data, error } = await client
    .from('goals')
    .select('id, user_id, title, description, deadline, created_at')
    .eq('id', goalId)
    .maybeSingle();

  if (error) {
    throw databaseUnavailable();
  }
  return data;
}
