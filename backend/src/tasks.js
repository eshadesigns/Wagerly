import { HttpError, databaseUnavailable, dbError, throwDatabaseError } from './errors.js';
import { getGoal, validateGoalId } from './goals.js';
import { validateId } from './accountability.js';
import { refreshOutcomes } from './progress.js';

const TASK_COLUMNS = 'id, goal_id, title, description, display_order, status, completed_at, created_at';

function publicTask(task)
{
  return {
    id: task.id,
    goal_id: task.goal_id,
    title: task.title,
    description: task.description,
    display_order: task.display_order,
    status: task.status,
    completed_at: task.completed_at,
    created_at: task.created_at,
  };
}

export function validateTaskInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || !Array.isArray(body.tasks)) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Tasks must be an array of 1 to 7 items.');
  }
  if (body.tasks.length < 1 || body.tasks.length > 7) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Tasks must contain between 1 and 7 items.');
  }

  return body.tasks.map((task) => {
    if (!task || typeof task !== 'object' || Array.isArray(task)) {
      throw new HttpError(400, 'VALIDATION_ERROR', 'Each task must include a title and description.');
    }
    const title = typeof task.title === 'string' ? task.title.trim() : '';
    const description = typeof task.description === 'string' ? task.description.trim() : '';
    if (title.length === 0 || title.length > 120) {
      throw new HttpError(400, 'VALIDATION_ERROR', 'Each task title is required and must be at most 120 characters.');
    }
    if (description.length === 0 || description.length > 1000) {
      throw new HttpError(400, 'VALIDATION_ERROR', 'Each task description is required and must be at most 1000 characters.');
    }
    return { title, description };
  });
}

export async function listTasks(client, goalId) {
  validateGoalId(goalId);
  const { data, error } = await client
    .from('tasks')
    .select(TASK_COLUMNS)
    .eq('goal_id', goalId)
    .order('display_order', { ascending: true });

  if (error) {
    throw databaseUnavailable();
  }
  return data ?? [];
}

export async function saveGeneratedTasks(client, goalId, tasks) {
  validateGoalId(goalId);
  const { data, error } = await client.rpc('create_goal_tasks', {
    p_goal_id: goalId,
    p_tasks: tasks,
  });

  if (error?.message === 'TASKS_ALREADY_GENERATED') {
    throw new HttpError(409, 'TASKS_ALREADY_GENERATED', 'Tasks have already been generated for this goal.');
  }
  if (error?.message === 'GOAL_NOT_FOUND') {
    throw new HttpError(404, 'GOAL_NOT_FOUND', 'Goal not found.');
  }
  if (error) {
    throw databaseUnavailable();
  }
  if (!Array.isArray(data) || data.length !== tasks.length) {
    throw databaseUnavailable();
  }
  return data.map(publicTask);
}

export function validateTaskUpdate(body)
{
  if (!body || typeof body !== 'object' || Array.isArray(body))
  {
    throw new HttpError(400, 'VALIDATION_ERROR', 'A JSON object is required.');
  }
  if (body.title === undefined && body.description === undefined)
  {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Provide a title, a description, or both.');
  }

  const update = {};

  if (body.title !== undefined)
  {
    let title = '';
    if (typeof body.title === 'string')
    {
      title = body.title.trim();
    }
    if (title.length === 0 || title.length > 120)
    {
      throw new HttpError(400, 'VALIDATION_ERROR', 'Each task title is required and must be at most 120 characters.');
    }
    update.title = title;
  }

  if (body.description !== undefined)
  {
    let description = '';
    if (typeof body.description === 'string')
    {
      description = body.description.trim();
    }
    if (description.length === 0 || description.length > 1000)
    {
      throw new HttpError(400, 'VALIDATION_ERROR', 'Each task description is required and must be at most 1000 characters.');
    }
    update.description = description;
  }

  return update;
}

export async function updateTask(client, userId, taskId, body)
{
  validateId(taskId, 'Task ID');
  const update = validateTaskUpdate(body);

  await refreshOutcomes(client);

  const { data: task, error } = await client
    .from('tasks')
    .select('user_id, goal_id, status')
    .eq('id', taskId)
    .maybeSingle();
  if (error)
  {
    throw databaseUnavailable();
  }
  if (!task || task.user_id !== userId)
  {
    throw dbError('TASK_NOT_FOUND');
  }

  const goal = await getGoal(client, task.goal_id);
  if (goal.status !== 'active')
  {
    throw dbError('GOAL_CLOSED');
  }
  if (task.status !== 'incomplete')
  {
    throw dbError('TASK_LOCKED');
  }

  const { data, error: updateError } = await client
    .from('tasks')
    .update(update)
    .eq('id', taskId)
    .eq('status', 'incomplete')
    .select(TASK_COLUMNS)
    .maybeSingle();
  if (updateError)
  {
    throw databaseUnavailable();
  }
  if (!data)
  {
    throw dbError('TASK_LOCKED');
  }
  return publicTask(data);
}

export async function completeTask(client, taskId)
{
  validateId(taskId, 'Task ID');

  const { data, error } = await client.rpc('complete_task', { p_task_id: taskId });
  if (error || !data)
  {
    throwDatabaseError(error);
  }
  return publicTask(data);
}

export async function reviewTask(client, taskId, approve)
{
  validateId(taskId, 'Task ID');

  const { data, error } = await client.rpc('review_task', { p_task_id: taskId, p_approve: approve });
  if (error || !data)
  {
    throwDatabaseError(error);
  }
  return publicTask(data);
}