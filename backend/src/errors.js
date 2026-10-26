export class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
  }
}

export function databaseUnavailable() {
  return new HttpError(503, 'DATABASE_UNAVAILABLE', 'The database request could not be completed.');
}
