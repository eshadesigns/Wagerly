import { HttpError } from './errors.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function requestAuthService(operation) {
  try {
    return await operation();
  } catch {
    throw new HttpError(503, 'AUTH_SERVICE_UNAVAILABLE', 'The authentication service is unavailable.');
  }
}

function validateCredentials(body, registration) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'A JSON object with email and password is required.');
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Enter a valid email address.');
  }

  if (registration && (password.length < 8 || password.length > 128)) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Password must be between 8 and 128 characters.');
  }

  if (!registration && (password.length === 0 || password.length > 128)) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'A password of at most 128 characters is required.');
  }

  return { email, password };
}

function authFailure(error, registration) {
  if (error.code === 'user_already_exists' || error.code === 'email_exists') {
    return new HttpError(409, 'EMAIL_ALREADY_REGISTERED', 'An account with this email already exists.');
  }
  if (error.code === 'weak_password') {
    return new HttpError(400, 'VALIDATION_ERROR', 'The password does not meet Supabase password requirements.');
  }
  if (error.code === 'email_not_confirmed' || /email not confirmed/i.test(error.message ?? '')) {
    return new HttpError(403, 'EMAIL_NOT_CONFIRMED', 'Confirm your email address before logging in.');
  }
  if (!registration && (error.status === 400 || error.code === 'invalid_credentials')) {
    return new HttpError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
  }
  if (error.status === 400) {
    return new HttpError(400, 'AUTH_REQUEST_FAILED', 'The authentication request could not be completed.');
  }
  return new HttpError(503, 'AUTH_SERVICE_UNAVAILABLE', 'The authentication service is unavailable.');
}

export async function register(client, body) {
  const credentials = validateCredentials(body, true);
  const { data, error } = await requestAuthService(() => client.auth.signUp(credentials));
  if (error) {
    throw authFailure(error, true);
  }
  if (!data.user) {
    throw new HttpError(502, 'AUTH_RESPONSE_INVALID', 'The authentication service returned an invalid response.');
  }

  return {
    user: { id: data.user.id, email: data.user.email },
    session: data.session ?? null,
    emailConfirmationRequired: data.session == null,
  };
}

export async function login(client, body) {
  const credentials = validateCredentials(body, false);
  const { data, error } = await requestAuthService(() => client.auth.signInWithPassword(credentials));
  if (error) {
    throw authFailure(error, false);
  }
  if (!data.user || !data.session) {
    throw new HttpError(403, 'EMAIL_NOT_CONFIRMED', 'Confirm your email address before logging in.');
  }

  return {
    user: { id: data.user.id, email: data.user.email },
    session: data.session,
  };
}

export async function confirmEmail(client, body) {
  const tokenHash = typeof body?.tokenHash === 'string' ? body.tokenHash.trim() : '';
  if (tokenHash.length === 0 || tokenHash.length > 2048) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'A valid email confirmation token is required.');
  }

  const { data, error } = await requestAuthService(() => client.auth.verifyOtp({
    token_hash: tokenHash,
    type: 'email',
  }));
  if (error) {
    if (error.status === 400 || error.status === 422 || error.code === 'otp_expired') {
      throw new HttpError(400, 'EMAIL_CONFIRMATION_INVALID', 'The email confirmation link is invalid or expired.');
    }
    throw new HttpError(503, 'AUTH_SERVICE_UNAVAILABLE', 'The authentication service is unavailable.');
  }
  if (!data.user || !data.session) {
    throw new HttpError(502, 'AUTH_RESPONSE_INVALID', 'The authentication service returned an invalid response.');
  }

  return {
    user: { id: data.user.id, email: data.user.email },
    session: data.session,
  };
}

export async function refreshSession(client, body) {
  const refreshToken = typeof body?.refreshToken === 'string' ? body.refreshToken.trim() : '';
  if (refreshToken.length === 0 || refreshToken.length > 4096 || /\s/.test(refreshToken)) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'A valid refresh token is required.');
  }

  const { data, error } = await requestAuthService(() => client.auth.refreshSession({
    refresh_token: refreshToken,
  }));
  if (error || !data.session || !data.user) {
    if (!error || error.status === 400 || error.status === 401 || error.status === 422) {
      throw new HttpError(401, 'INVALID_REFRESH_TOKEN', 'The refresh token is invalid, expired, or already used.');
    }
    throw new HttpError(503, 'AUTH_SERVICE_UNAVAILABLE', 'The authentication service is unavailable.');
  }

  return {
    user: { id: data.user.id, email: data.user.email },
    session: data.session,
  };
}
