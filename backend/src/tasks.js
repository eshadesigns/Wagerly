import { HttpError, databaseUnavailable } from './errors.js';
import { validateGoalId } from './goals.js';

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
