export class HttpError extends Error
{
  constructor(status, code, message)
  {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
  }
}

export function databaseUnavailable()
{
  return new HttpError(503, 'DATABASE_UNAVAILABLE', 'The database request could not be completed.');
}

const ERRORS = {
  GOAL_NOT_FOUND: [404, 'Goal not found.'],
  TASK_NOT_FOUND: [404, 'Task not found.'],
  INVITATION_NOT_FOUND: [404, 'Invitation not found.'],
  PACT_NOT_FOUND: [404, 'This goal has no pact.'],
  PARTNER_NOT_FOUND: [404, 'No user has that email address.'],
  NOT_ASSIGNED_PARTNER: [403, 'Only the accepted partner for this goal can review its tasks.'],
  CANNOT_INVITE_SELF: [400, 'You cannot invite yourself.'],
  GOAL_CLOSED: [409, 'This goal is already completed or missed.'],
  TASK_LOCKED: [409, 'Only incomplete tasks can be edited.'],
  TASK_NOT_PENDING: [409, 'This task is not waiting for verification.'],
  INVITATION_EXISTS: [409, 'This goal already has a pending or accepted partner.'],
  INVITATION_ALREADY_RESPONDED: [409, 'This invitation was already answered.'],
  PARTNER_REQUIRED: [409, 'You need an accepted partner before creating a pact.'],
  PACT_EXISTS: [409, 'This goal already has a pact.'],
};

export function dbError(code)
{
  const info = ERRORS[code];
  return new HttpError(info[0], code, info[1]);
}

export function throwDatabaseError(error)
{
  if (error && ERRORS[error.message])
  {
    throw dbError(error.message);
  }
  throw databaseUnavailable();
}