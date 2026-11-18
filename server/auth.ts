import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { db, hasUserPermission, isUserSuperAdmin } from './db.js';
import {
  deleteNonAdminSessionsFromSupabase,
  deleteSessionFromSupabase,
  deleteUserSessionsFromSupabase,
  findSessionInSupabase,
  findUserInSupabase,
  isSupabaseDbEnabled,
  persistSessionToSupabase,
  upsertUserToSupabase,
} from './supabase.js';
import type { AdminPermissionKey, User } from './types.js';

const SESSION_COOKIE_NAME = 'mvia_session';
const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;
const ONE_YEAR_MS = ONE_YEAR_SECONDS * 1000;

export interface AuthenticatedRequest extends Request {
  currentUser?: User;
  authToken?: string;
}

export function getAdminSecretCode(): string {
  return (process.env.ADMIN_SECRET_CODE || '').trim();
}

function getSessionSigningSecret(): string {
  const envSecret = (
    process.env.SESSION_SECRET ||
    process.env.JWT_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.ADMIN_SECRET_CODE ||
    ''
  ).trim();
  if (envSecret) {
    return crypto.createHash('sha256').update(`mvia-jwt:${envSecret}`).digest('hex');
  }

  const store = db.get();
  if (!store.platformConfig) {
    store.platformConfig = { whatsappNumber: '01159637247', telegramUrl: '' };
  }
  if (!store.platformConfig.sessionSigningSecret) {
    store.platformConfig.sessionSigningSecret = crypto.randomBytes(32).toString('hex');
    db.save();
  }
  return store.platformConfig.sessionSigningSecret;
}

function toBase64Url(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf-8') : input;
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(input: string): string {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((input.length + 3) % 4);
  return Buffer.from(padded, 'base64').toString('utf-8');
}

interface SessionJwtPayload {
  sid: string;
  sub: string;
  iat: number;
  iatMs?: number;
  exp: number;
}

function signSessionJwt(userId: string, sid: string): string {
  const nowMs = Date.now();
  const nowSec = Math.floor(nowMs / 1000);
  const header = toBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload: SessionJwtPayload = {
    sid,
    sub: userId,
    iat: nowSec,
    iatMs: nowMs,
    exp: nowSec + ONE_YEAR_SECONDS,
  };
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const data = `${header}.${encodedPayload}`;
  const sig = toBase64Url(
    crypto.createHmac('sha256', getSessionSigningSecret()).update(data).digest()
  );
  return `${data}.${sig}`;
}

export function verifySessionJwt(token: string): SessionJwtPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, encodedPayload, sig] = parts;
  if (!header || !encodedPayload || !sig) return null;

  const data = `${header}.${encodedPayload}`;
  const expectedSig = toBase64Url(
    crypto.createHmac('sha256', getSessionSigningSecret()).update(data).digest()
  );
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }

  try {
    const parsed = JSON.parse(fromBase64Url(encodedPayload)) as Partial<SessionJwtPayload>;
    if (!parsed.sub || !parsed.sid || !parsed.exp || !parsed.iat) return null;
    if (Date.now() >= parsed.exp * 1000) return null;
    return parsed as SessionJwtPayload;
  } catch {
    return null;
  }
}

function getTokenSessionId(token: string): string {
  const jwt = verifySessionJwt(token);
  if (jwt?.sid) return jwt.sid;
  return crypto.createHash('sha256').update(token).digest('hex').slice(0, 24);
}

function recordRevokedSessionId(token: string): void {
  const store = db.get();
  if (!Array.isArray(store.revokedSessionIds)) {
    store.revokedSessionIds = [];
  }
  const sid = getTokenSessionId(token);
  if (!store.revokedSessionIds.includes(sid)) {
    store.revokedSessionIds.push(sid);
    if (store.revokedSessionIds.length > 500) {
      store.revokedSessionIds = store.revokedSessionIds.slice(-500);
    }
  }
}

function parseCookies(cookieHeader?: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!cookieHeader) return result;
  for (const part of cookieHeader.split(';')) {
    const eqIdx = part.indexOf('=');
    if (eqIdx === -1) continue;
    const key = part.slice(0, eqIdx).trim();
    const val = part.slice(eqIdx + 1).trim();
    if (key) {
      try {
        result[key] = decodeURIComponent(val);
      } catch {
        result[key] = val;
      }
    }
  }
  return result;
}

export function extractAuthToken(req: Request): string | undefined {
  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.toLowerCase().startsWith('bearer ')) {
    const bearer = authHeader.slice(7).trim();
    if (bearer) return bearer;
  }

  const cookies = parseCookies(req.headers.cookie);
  const cookieToken = cookies[SESSION_COOKIE_NAME];
  if (cookieToken && cookieToken.trim()) {
    return cookieToken.trim();
  }

  return undefined;
}

export function getUserByToken(token?: string): User | undefined {
  if (!token) return undefined;
  const store = db.get();
  const session = store.sessions.find((s) => s.token === token);
  if (session) {
    return store.users.find((u) => u.id === session.userId);
  }

  // Fallback to stateless JWT signature check when DB snapshot lagged
  const jwt = verifySessionJwt(token);
  if (jwt) {
    if (store.revokedSessionIds?.includes(jwt.sid)) return undefined;
    const user = store.users.find((u) => u.id === jwt.sub);
    if (!user) return undefined;
    const issuedAtMs = jwt.iatMs ?? jwt.iat * 1000;
    if (user.sessionsRevokedBefore && issuedAtMs < user.sessionsRevokedBefore) {
      return undefined;
    }
    return user;
  }

  return undefined;
}

export async function resolveUserByToken(token?: string): Promise<User | undefined> {
  if (!token) return undefined;
  const store = db.get();

  const localSession = store.sessions.find((s) => s.token === token);
  if (localSession) {
    if (localSession.expiresAt) {
      const expMs = new Date(localSession.expiresAt).getTime();
      if (Number.isFinite(expMs) && expMs <= Date.now()) {
        await revokeSessionToken(token);
        return undefined;
      }
    }
    let user = store.users.find((u) => u.id === localSession.userId);
    if (!user && isSupabaseDbEnabled()) {
      const remoteUser = await findUserInSupabase(localSession.userId);
      if (remoteUser) {
        store.users.push(remoteUser);
        user = remoteUser;
      }
    }
    if (user) return user;
  }

  // Check persistent Supabase public.sessions table directly (immune to snapshot races/cold starts)
  if (isSupabaseDbEnabled()) {
    const remoteSession = await findSessionInSupabase(token);
    if (remoteSession) {
      let user = store.users.find((u) => u.id === remoteSession.userId);
      if (!user) {
        const remoteUser = await findUserInSupabase(remoteSession.userId);
        if (remoteUser) {
          store.users.push(remoteUser);
          user = remoteUser;
        }
      }
      if (user) {
        if (!store.sessions.some((s) => s.token === token)) {
          store.sessions.push({
            token: remoteSession.token,
            userId: remoteSession.userId,
            createdAt: remoteSession.createdAt,
            expiresAt: remoteSession.expiresAt,
          });
        }
        return user;
      }
    }
  }

  // Stateless signed JWT fallback (if session row wasn't flushed before deploy/cold start)
  const jwt = verifySessionJwt(token);
  if (jwt) {
    if (store.revokedSessionIds?.includes(jwt.sid)) {
      return undefined;
    }
    let user = store.users.find((u) => u.id === jwt.sub);
    if (!user && isSupabaseDbEnabled()) {
      const remoteUser = await findUserInSupabase(jwt.sub);
      if (remoteUser) {
        store.users.push(remoteUser);
        user = remoteUser;
      }
    }
    if (!user) return undefined;
    const issuedAtMs = jwt.iatMs ?? jwt.iat * 1000;
    if (user.sessionsRevokedBefore && issuedAtMs < user.sessionsRevokedBefore) {
      return undefined;
    }
    if (!store.sessions.some((s) => s.token === token)) {
      store.sessions.push({
        token,
        userId: user.id,
        createdAt: new Date(issuedAtMs).toISOString(),
        expiresAt: new Date(jwt.exp * 1000).toISOString(),
      });
    }
    return user;
  }

  return undefined;
}

export function createSessionToken(userId: string): string {
  const sid = crypto.randomBytes(16).toString('hex');
  const token = signSessionJwt(userId, sid);
  const now = Date.now();
  const createdAt = new Date(now).toISOString();
  const expiresAt = new Date(now + ONE_YEAR_MS).toISOString();
  const store = db.get();
  store.sessions.push({
    token,
    userId,
    createdAt,
    expiresAt,
  });
  db.save();

  if (isSupabaseDbEnabled()) {
    const user = store.users.find((u) => u.id === userId);
    void (async () => {
      if (user) await upsertUserToSupabase(user);
      await persistSessionToSupabase({ token, userId, createdAt, expiresAt });
    })();
  }

  return token;
}

export async function createPersistentSession(userId: string): Promise<string> {
  const sid = crypto.randomBytes(16).toString('hex');
  const token = signSessionJwt(userId, sid);
  const now = Date.now();
  const createdAt = new Date(now).toISOString();
  const expiresAt = new Date(now + ONE_YEAR_MS).toISOString();
  const store = db.get();
  store.sessions.push({
    token,
    userId,
    createdAt,
    expiresAt,
  });
  db.save();

  if (isSupabaseDbEnabled()) {
    const user = store.users.find((u) => u.id === userId);
    if (user) {
      await upsertUserToSupabase(user);
    }
    await persistSessionToSupabase({ token, userId, createdAt, expiresAt });
    await db.flushRemoteIfDirty();
  }

  return token;
}

export async function revokeSessionToken(token?: string): Promise<void> {
  if (!token) return;
  const store = db.get();
  store.sessions = store.sessions.filter((s) => s.token !== token);
  recordRevokedSessionId(token);
  db.save();

  if (isSupabaseDbEnabled()) {
    await deleteSessionFromSupabase(token);
    await db.flushRemoteIfDirty();
  }
}

export async function revokeUserSessions(
  userId: string,
  exceptToken?: string
): Promise<void> {
  const store = db.get();
  store.sessions = store.sessions.filter(
    (s) => s.userId !== userId || (exceptToken ? s.token === exceptToken : false)
  );
  if (!exceptToken) {
    const user = store.users.find((u) => u.id === userId);
    if (user) {
      user.sessionsRevokedBefore = Date.now();
    }
  }
  db.save();

  if (isSupabaseDbEnabled()) {
    await deleteUserSessionsFromSupabase(userId, exceptToken);
    await db.flushRemoteIfDirty();
  }
}

export async function revokeNonAdminSessions(
  adminUserIds: Set<string>
): Promise<{ revokedSessionsCount: number; affectedUsersCount: number; keptAdminSessionsCount: number }> {
  const store = db.get();
  const nowMs = Date.now();

  const beforeCount = store.sessions.length;
  const affectedUsers = new Set<string>();
  const keptSessions = store.sessions.filter((s) => {
    if (adminUserIds.has(s.userId)) return true;
    affectedUsers.add(s.userId);
    return false;
  });

  for (const user of store.users) {
    if (!adminUserIds.has(user.id)) {
      user.sessionsRevokedBefore = nowMs;
    }
  }

  const revokedSessionsCount = beforeCount - keptSessions.length;
  store.sessions = keptSessions;
  db.save();

  if (isSupabaseDbEnabled()) {
    await deleteNonAdminSessionsFromSupabase(Array.from(adminUserIds));
    await db.flushRemoteIfDirty();
  }

  return {
    revokedSessionsCount,
    affectedUsersCount: affectedUsers.size,
    keptAdminSessionsCount: keptSessions.length,
  };
}

function isSecureRequest(req: Request): boolean {
  if (req.secure) return true;
  const proto = req.headers['x-forwarded-proto'];
  if (typeof proto === 'string') {
    return proto.split(',')[0].trim().toLowerCase() === 'https';
  }
  return false;
}

export function setSessionCookie(req: Request, res: Response, token: string): void {
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${ONE_YEAR_SECONDS}`,
  ];
  if (isSecureRequest(req)) {
    parts.push('Secure');
  }
  res.setHeader('Set-Cookie', parts.join('; '));
  res.setHeader('Cache-Control', 'no-store, private');
}

export function clearSessionCookie(req: Request, res: Response): void {
  const parts = [
    `${SESSION_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
  ];
  if (isSecureRequest(req)) {
    parts.push('Secure');
  }
  res.setHeader('Set-Cookie', parts.join('; '));
  res.setHeader('Cache-Control', 'no-store, private');
}

export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const token = extractAuthToken(req);
    if (!token) {
      res.status(401).json({ error: 'يرجى تسجيل الدخول أولاً.' });
      return;
    }

    const user = await resolveUserByToken(token);
    if (!user) {
      res.status(401).json({ error: 'انتهت صلاحية الجلسة، يرجى تسجيل الدخول مجدداً.' });
      return;
    }

    if (user.isSuspended && !user.isProtected && user.role !== 'admin') {
      res.status(403).json({
        suspended: true,
        error:
          'تم حظر حسابك مؤقتاً لمخالفة الشروط والأحكام، ولا يمكن الدخول إلا بإذن وموافقة من الأدمن.',
      });
      return;
    }

    req.currentUser = user;
    req.authToken = token;
    next();
  } catch (err) {
    next(err);
  }
}

export function requireAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.currentUser || req.currentUser.role !== 'admin') {
    res.status(403).json({ error: 'هذه الصلاحية مخصصة للإدارة (Admin) فقط.' });
    return;
  }
  next();
}

export function requireSuperAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  if (!isUserSuperAdmin(req.currentUser)) {
    res.status(403).json({ error: 'هذه الصلاحية حصرية للمدير العام (Super Admin) فقط.' });
    return;
  }
  next();
}

export function requirePermission(permission: AdminPermissionKey) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!hasUserPermission(req.currentUser, permission)) {
      res.status(403).json({ error: 'ليس لديك الصلاحية المطلوبة لتنفيذ هذا الإجراء.' });
      return;
    }
    next();
  };
}

export function requireAnyPermission(...permissions: AdminPermissionKey[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!permissions.some((p) => hasUserPermission(req.currentUser, p))) {
      res.status(403).json({ error: 'ليس لديك أي من الصلاحيات المطلوبة للوصول إلى هذا القسم.' });
      return;
    }
    next();
  };
}

