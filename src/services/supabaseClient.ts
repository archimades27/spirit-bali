import { createClient, type SupabaseClient } from '@supabase/supabase-js';

function normalizeSupabaseUrl(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  return raw.trim().replace(/\/rest\/v1\/?$/i, '').replace(/\/+$/, '');
}

const supabaseUrl = normalizeSupabaseUrl(
  import.meta.env.VITE_SUPABASE_URL as string | undefined
);
const supabaseKey = (
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined
)?.trim();

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
    supabaseKey &&
    !supabaseUrl.includes('your-project-ref') &&
    !supabaseKey.includes('your-publishable')
);

let clientInstance: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (!isSupabaseConfigured || !supabaseUrl || !supabaseKey) {
    return null;
  }
  if (!clientInstance) {
    clientInstance = createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
      realtime: {
        params: {
          eventsPerSecond: 15,
        },
      },
    });
  }
  return clientInstance;
}
