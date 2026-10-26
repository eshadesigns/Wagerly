import { createClient } from '@supabase/supabase-js';
import { HttpError } from './errors.js';

export function createSupabaseClient(env, accessToken) {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    throw new HttpError(503, 'SUPABASE_NOT_CONFIGURED', 'Supabase is not configured on this server.');
  }

  const options = {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  };

  if (accessToken) {
    options.global = {
      headers: { Authorization: `Bearer ${accessToken}` },
    };
  }

  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, options);
}
