import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { db, hasUserPermission, isUserSuperAdmin } from './db.ts';
import type { AdminPermissionKey, User } from './types.ts';

export const SESSION_COOKIE_NAME = 'mvia_session';
const SESSION_COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60; // 1 year

function parseCookieHeader(cookieHeader: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!cookieHeader) return result;
  for (const part of cookieHeader.split(';')) {
    const eqIdx = part.indexOf('=');
    if (eqIdx === -1) continue;
    const key = part.slice(0, eqIdx).trim();
    const val = part.slice(eqIdx + 1).trim();
    if (!key) continue;
    try {
      result[key] = decodeURIComponent(val);
    } catch {
      result[key] = val;
    }
  }
  return result;
}

export function extractAuthToken(req: Request): string | undefined {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const bearer = authHeader.slice(7).trim();
    if (bearer) return bearer;
  }
  const cookies = parseCookieHeader(req.headers.cookie);
  const cookieToken = cookies[SESSION_COOKIE_NAME]?.trim();
  return cookieToken || undefined;
}

function isHttpsRequest(req: Request): boolean {
  const protoHeader = String(req.headers['x-forwarded-proto'] || '')
    .split(',')[0]
    .trim()
    .toLowerCase();
  return Boolean(req.secure || protoHeader === 'https');
}

export function setSessionCookie(req: Request, res: Response, token: string): void {
  const isHttps = isHttpsRequest(req);
  const attrs = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    `Max-Age=${SESSION_COOKIE_MAX_AGE_SECONDS}`,
    'HttpOnly',
    isHttps ? 'SameSite=None' : 'SameSite=Lax',
    ...(isHttps ? ['Secure'] : []),
  ];
  res.append('Set-Cookie', attrs.join('; '));
}

export function clearSessionCookie(req: Request, res: Response): void {
  const isHttps = isHttpsRequest(req);
  const attrs = [
    `${SESSION_COOKIE_NAME}=`,
    'Path=/',
    'Max-Age=0',
    'HttpOnly',
    isHttps ? 'SameSite=None' : 'SameSite=Lax',
    ...(isHttps ? ['Secure'] : []),
  ];
  res.append('Set-Cookie', attrs.join('; '));
}

export function getAdminSecretCode(): string {
  return (process.env.ADMIN_SECRET_CODE || '').trim();
}

export interface AuthenticatedRequest extends Request {
  currentUser?: User;
  authToken?: string;
}

export function createSessionToken(userId: string): string {
  const token = crypto.randomBytes(32).toString('hex');
  const store = db.get();
  store.sessions.push({
    token,
    userId,
    createdAt: new Date().toISOString(),
  });
  db.save();
  return token;
}

export function getUserByToken(token: string | undefined): User | undefined {
  if (!token) return undefined;
  const store = db.get();
  const session = store.sessions.find((s) => s.token === token);
  if (!session) return undefined;
  return store.users.find((u) => u.id === session.userId);
}

export function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const token = extractAuthToken(req);

  const user = getUserByToken(token);
  if (!user) {
    res.status(401).json({ error: 'يرجى تسجيل الدخول أولاً أو تم إنهاء جلستك.' });
    return;
  }

  if (user.isSuspended && !user.isProtected && user.role !== 'admin') {
    res.status(403).json({
      suspended: true,
      error:
        'تم حظر حسابك مؤقتاً لمخالفة الشروط والأحكام (في الشات أو المنصة)، ولا يمكنك الدخول مجدداً إلا بإذن مباشر من الأدمن.',
    });
    return;
  }

  req.currentUser = user;
  req.authToken = token;
  next();
}

export function requireAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.currentUser || req.currentUser.role !== 'admin') {
    res.status(403).json({ error: 'هذه الصلاحية مخصصة للأدمن فقط.' });
    return;
  }
  next();
}

export function requireSuperAdmin(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.currentUser || !isUserSuperAdmin(req.currentUser)) {
    res.status(403).json({
      error: 'هذه الصلاحية حصرية للمدير العام (Super Admin) فقط.',
    });
    return;
  }
  next();
}

export function requirePermission(permission: AdminPermissionKey) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.currentUser || req.currentUser.role !== 'admin') {
      res.status(403).json({ error: 'هذه الصلاحية مخصصة للمسؤولين فقط.' });
      return;
    }
    if (!hasUserPermission(req.currentUser, permission)) {
      res.status(403).json({
        error: 'رتبتك الإدارية الحالية لا تملك صلاحية تنفيذ هذا الإجراء.',
      });
      return;
    }
    next();
  };
}

export function requireAnyPermission(...permissions: AdminPermissionKey[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.currentUser || req.currentUser.role !== 'admin') {
      res.status(403).json({ error: 'هذه الصلاحية مخصصة للمسؤولين فقط.' });
      return;
    }
    if (!permissions.some((p) => hasUserPermission(req.currentUser, p))) {
      res.status(403).json({
        error: 'رتبتك الإدارية الحالية لا تملك صلاحية تنفيذ هذا الإجراء.',
      });
      return;
    }
    next();
  };
}
