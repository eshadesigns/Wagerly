import { HttpError, databaseUnavailable } from './errors.js';
import { validateGoalId } from './goals.js';

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
    .select('id, goal_id, title, description, display_order, created_at')
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
  return data.map(({ id, goal_id, title, description, display_order, created_at }) => ({
    id,
    goal_id,
    title,
    description,
    display_order,
    created_at,
  }));
}
