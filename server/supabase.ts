import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { DatabaseSchema } from './types.ts';

let cachedClient: SupabaseClient | null = null;
let cachedKeySignature = '';
let lastSupabaseSyncError: string | null = null;

function getSupabaseUrl(): string {
  return (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
}

function getSupabaseSecretKey(): string {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    ''
  ).trim();
}

function getSupabasePublishableKey(): string {
  return (
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    ''
  ).trim();
}

export function isSupabaseConfigured(): boolean {
  return Boolean(getSupabaseUrl() && getSupabaseSecretKey());
}

export function isSupabaseDbEnabled(): boolean {
  if (!isSupabaseConfigured()) return false;
  if (process.env.MVIA_FORCE_SUPABASE === '1') return true;
  if (process.env.MVIA_DB_FILE) return false;
  return true;
}

export function getSupabaseStatusDetails() {
  return {
    urlConfigured: Boolean(getSupabaseUrl()),
    publishableKeyConfigured: Boolean(getSupabasePublishableKey()),
    serviceRoleConfigured: Boolean(getSupabaseSecretKey()),
    dbEnabled: isSupabaseDbEnabled(),
  };
}

export function getLastSupabaseSyncError(): string | null {
  return lastSupabaseSyncError;
}

export function getSupabaseAdminClient(): SupabaseClient | null {
  const url = getSupabaseUrl();
  const serviceRoleKey = getSupabaseSecretKey();
  if (!url || !serviceRoleKey) return null;

  const sig = `${url}::${serviceRoleKey.slice(0, 12)}`;
  if (!cachedClient || cachedKeySignature !== sig) {
    cachedClient = createClient(url, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
    cachedKeySignature = sig;
  }
  return cachedClient;
}

export async function loadLatestStateFromSupabase(
  currentVersion: number
): Promise<
  | { status: 'unchanged'; version: number }
  | { status: 'updated'; data: DatabaseSchema; version: number }
  | { status: 'empty' }
  | { status: 'error'; error: string }
> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return { status: 'unchanged', version: currentVersion };

  try {
    const { data: fullRow, error: fullErr } = await supabase
      .from('app_state_snapshot')
      .select('payload, version')
      .eq('id', 'default')
      .maybeSingle();

    if (fullErr) {
      lastSupabaseSyncError = fullErr.message;
      return { status: 'error', error: fullErr.message };
    }

    if (!fullRow || !fullRow.payload) {
      return { status: 'empty' };
    }

    const remoteVersion = Number(fullRow.version || 1);
    if (currentVersion > 0 && remoteVersion === currentVersion) {
      lastSupabaseSyncError = null;
      return { status: 'unchanged', version: remoteVersion };
    }

    lastSupabaseSyncError = null;
    return {
      status: 'updated',
      data: fullRow.payload as DatabaseSchema,
      version: remoteVersion,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Supabase sync failed';
    lastSupabaseSyncError = msg;
    return { status: 'error', error: msg };
  }
}

export async function saveStateToSupabase(
  data: DatabaseSchema,
  nextVersion: number
): Promise<boolean> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return false;

  try {
    const { error } = await supabase.from('app_state_snapshot').upsert(
      {
        id: 'default',
        payload: data,
        version: nextVersion,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );

    if (error) {
      lastSupabaseSyncError = error.message;
      return false;
    }

    lastSupabaseSyncError = null;
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Supabase save failed';
    lastSupabaseSyncError = msg;
    return false;
  }
}
