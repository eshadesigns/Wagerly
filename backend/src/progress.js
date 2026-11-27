import { databaseUnavailable } from './errors.js';
import { validateGoalId } from './goals.js';

export async function refreshOutcomes(client)
{
  const { error } = await client.rpc('refresh_goal_outcomes');
  if (error)
  {
    throw databaseUnavailable();
  }
}

function countTasks(tasks, status)
{
  let count = 0;
  for (const task of tasks)
  {
    if (task.status === status)
    {
      count = count + 1;
    }
  }
  return count;
}

export async function getDashboard(client, userId)
{
  await refreshOutcomes(client);

  const goalsResult = await client.from('goals').select('*').order('created_at', { ascending: false });
  const tasksResult = await client.from('tasks').select('goal_id, status');
  const pactsResult = await client.from('pacts').select('*');
  const invitesResult = await client.from('partner_invitations').select('goal_id, partner_email').eq('status', 'accepted');
  if (goalsResult.error || tasksResult.error || pactsResult.error || invitesResult.error)
  {
    throw databaseUnavailable();
  }

  const dashboard = [];
  for (const goal of goalsResult.data)
  {
    const tasks = tasksResult.data.filter((task) => task.goal_id === goal.id);
    const incomplete = countTasks(tasks, 'incomplete');
    const pending = countTasks(tasks, 'pending_verification');
    const verified = countTasks(tasks, 'verified');

    let percent = 0;
    if (tasks.length > 0)
    {
      percent = Math.round((verified / tasks.length) * 10000) / 100;
    }

    let progressStatus = goal.status;
    if (goal.status === 'active')
    {
      const threeDays = 3 * 24 * 60 * 60 * 1000;
      const timeLeft = new Date(goal.deadline).getTime() - Date.now();
      if (timeLeft <= threeDays)
      {
        progressStatus = 'at_risk';
      }
      else
      {
        progressStatus = 'on_track';
      }
    }

    let role = 'partner';
    if (goal.user_id === userId)
    {
      role = 'owner';
    }

    let partnerEmail = null;
    const invite = invitesResult.data.find((item) => item.goal_id === goal.id);
    if (invite)
    {
      partnerEmail = invite.partner_email;
    }

    let pact = null;
    const savedPact = pactsResult.data.find((item) => item.goal_id === goal.id);
    if (savedPact)
    {
      let amount = null;
      if (savedPact.virtual_amount !== null)
      {
        amount = Number(savedPact.virtual_amount);
      }
      pact = {
        id: savedPact.id,
        status: savedPact.status,
        stake_type: savedPact.stake_type,
        virtual_amount: amount,
        consequence: savedPact.consequence,
      };
    }

    dashboard.push({
      goal_id: goal.id,
      title: goal.title,
      description: goal.description,
      deadline: goal.deadline,
      created_at: goal.created_at,
      resolved_at: goal.resolved_at,
      role: role,
      status: goal.status,
      progress_status: progressStatus,
      total_tasks: tasks.length,
      incomplete_tasks: incomplete,
      pending_verification_tasks: pending,
      verified_tasks: verified,
      completion_percent: percent,
      partner_email: partnerEmail,
      pact: pact,
    });
  }
  return dashboard;
}

export async function getGoalProgress(client, userId, goalId)
{
  validateGoalId(goalId);
  const dashboard = await getDashboard(client, userId);
  const goal = dashboard.find((item) => item.goal_id === goalId);
  if (!goal)
  {
    return null;
  }
  return goal;
}

function makeOutcome(goal)
{
  let consequenceApplies = false;
  if (goal.pact !== null && goal.pact.status === 'forfeited')
  {
    consequenceApplies = true;
  }

  return {
    goal_id: goal.goal_id,
    title: goal.title,
    status: goal.status,
    deadline: goal.deadline,
    resolved_at: goal.resolved_at,
    completed_tasks: goal.verified_tasks,
    total_tasks: goal.total_tasks,
    completion_percent: goal.completion_percent,
    consequence_applies: consequenceApplies,
    pact: goal.pact,
  };
}

export async function getGoalOutcome(client, userId, goalId)
{
  const goal = await getGoalProgress(client, userId, goalId);
  if (!goal)
  {
    return null;
  }
  return makeOutcome(goal);
}

export async function listOutcomes(client, userId, status)
{
  const dashboard = await getDashboard(client, userId);

  const finished = [];
  for (const goal of dashboard)
  {
    if (goal.role !== 'owner' || goal.status === 'active')
    {
      continue;
    }
    if (status && goal.status !== status)
    {
      continue;
    }
    finished.push(goal);
  }

  finished.sort((a, b) => (a.resolved_at < b.resolved_at ? 1 : -1));

  const outcomes = [];
  for (const goal of finished)
  {
    outcomes.push(makeOutcome(goal));
  }
  return outcomes;
}