import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AcademicYear, DatabaseSchema, User, UserRole } from './types.js';

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

export async function upsertUserToSupabase(user: User): Promise<void> {
  if (!isSupabaseDbEnabled()) return;
  const supabase = getSupabaseAdminClient();
  if (!supabase) return;

  try {
    await supabase.from('users').upsert(
      {
        id: user.id,
        name: user.name,
        email: user.email || null,
        phone: user.phone || null,
        password_hash: user.passwordHash,
        year: user.year,
        role: user.role,
        admin_rank_id: user.adminRankId || null,
        is_protected: Boolean(user.isProtected),
        is_suspended: Boolean(user.isSuspended),
        suspended_reason: user.suspendedReason || null,
        suspended_at: user.suspendedAt || null,
        points: user.points || 0,
        quizzes_completed: user.quizzesCompleted || 0,
        email_verified: Boolean(user.emailVerified),
        last_login_at: user.lastLoginAt || null,
        created_at: user.createdAt,
      },
      { onConflict: 'id' }
    );
  } catch {
    // Non-fatal fallback: app_state_snapshot remains active
  }
}

export async function persistSessionToSupabase(session: {
  token: string;
  userId: string;
  createdAt: string;
  expiresAt?: string;
}): Promise<void> {
  if (!isSupabaseDbEnabled()) return;
  const supabase = getSupabaseAdminClient();
  if (!supabase) return;

  try {
    await supabase.from('sessions').upsert(
      {
        token: session.token,
        user_id: session.userId,
        created_at: session.createdAt,
        expires_at: session.expiresAt || null,
      },
      { onConflict: 'token' }
    );
  } catch {
    // Non-fatal fallback: app_state_snapshot & signed JWT remain active
  }
}

export async function deleteSessionFromSupabase(token: string): Promise<void> {
  if (!isSupabaseDbEnabled() || !token) return;
  const supabase = getSupabaseAdminClient();
  if (!supabase) return;

  try {
    await supabase.from('sessions').delete().eq('token', token);
  } catch {
    // Non-fatal
  }
}

export async function deleteUserSessionsFromSupabase(
  userId: string,
  exceptToken?: string
): Promise<void> {
  if (!isSupabaseDbEnabled() || !userId) return;
  const supabase = getSupabaseAdminClient();
  if (!supabase) return;

  try {
    let query = supabase.from('sessions').delete().eq('user_id', userId);
    if (exceptToken) {
      query = query.neq('token', exceptToken);
    }
    await query;
  } catch {
    // Non-fatal
  }
}

export async function deleteNonAdminSessionsFromSupabase(
  adminUserIds: string[]
): Promise<void> {
  if (!isSupabaseDbEnabled()) return;
  const supabase = getSupabaseAdminClient();
  if (!supabase) return;

  try {
    if (adminUserIds.length === 0) {
      await supabase.from('sessions').delete().neq('token', '');
      return;
    }
    const quotedList = `(${adminUserIds.map((id) => `"${id.replace(/"/g, '')}"`).join(',')})`;
    await supabase.from('sessions').delete().not('user_id', 'in', quotedList);
  } catch {
    // Non-fatal
  }
}

export async function findSessionInSupabase(token: string): Promise<{
  token: string;
  userId: string;
  createdAt: string;
  expiresAt?: string;
} | null> {
  if (!isSupabaseDbEnabled() || !token) return null;
  const supabase = getSupabaseAdminClient();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from('sessions')
      .select('token, user_id, created_at, expires_at')
      .eq('token', token)
      .maybeSingle();

    if (error || !data) return null;

    if (data.expires_at) {
      const expMs = new Date(data.expires_at as string).getTime();
      if (Number.isFinite(expMs) && expMs <= Date.now()) {
        void deleteSessionFromSupabase(token);
        return null;
      }
    }

    return {
      token: String(data.token),
      userId: String(data.user_id),
      createdAt: String(data.created_at || new Date().toISOString()),
      expiresAt: data.expires_at ? String(data.expires_at) : undefined,
    };
  } catch {
    return null;
  }
}

export async function findUserInSupabase(userId: string): Promise<User | null> {
  if (!isSupabaseDbEnabled() || !userId) return null;
  const supabase = getSupabaseAdminClient();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error || !data) return null;

    return {
      id: String(data.id),
      name: String(data.name || ''),
      email: String(data.email || ''),
      phone: String(data.phone || ''),
      passwordHash: String(data.password_hash || ''),
      year: (Number(data.year) || 1) as AcademicYear,
      role: (data.role as UserRole) || 'student',
      adminRankId: data.admin_rank_id ? String(data.admin_rank_id) : undefined,
      isProtected: Boolean(data.is_protected),
      isSuspended: Boolean(data.is_suspended),
      suspendedReason: data.suspended_reason ? String(data.suspended_reason) : undefined,
      suspendedAt: data.suspended_at ? String(data.suspended_at) : undefined,
      points: Number(data.points || 0),
      quizzesCompleted: Number(data.quizzes_completed || 0),
      emailVerified: Boolean(data.email_verified),
      lastLoginAt: data.last_login_at ? String(data.last_login_at) : undefined,
      createdAt: String(data.created_at || new Date().toISOString()),
    };
  } catch {
    return null;
  }
}

