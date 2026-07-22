import { createClient } from '@supabase/supabase-js';
import { env } from '@shared/config/env';
import type { Database } from '@shared/types/database.types';

export const supabase = createClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});
