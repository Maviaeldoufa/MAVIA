import crypto from 'crypto';
import { Router } from 'express';
import {
  clearSessionCookie,
  createSessionToken,
  getAdminSecretCode,
  requireAnyPermission,
  requireAuth,
  requirePermission,
  requireSuperAdmin,
  setSessionCookie,
} from '../auth.js';
import type { AuthenticatedRequest } from '../auth.js';
import {
  db,
  getEmailDeliveryConfig,
  hashPassword,
  hasUserPermission,
  isUserSuperAdmin,
  recordAdminAudit,
  recordAppError,
  toLeaderboardUser,
  toSafeUser,
  verifyPassword,
} from '../db.js';
import {
  checkLoginLockout,
  clearLoginFailures,
  loginRateLimiter,
  recordFailedLogin,
  registerRateLimiter,
} from '../rateLimit.js';
import type { AcademicYear, User, UserProfileNote, UserRole } from '../types.js';

const router = Router();

const SUPER_ADMIN_EMAIL = 'MAVIAMahmou1@1';
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VERIFICATION_TTL_MS = 15 * 60 * 1000;

function hashOtpCode(code: string): string {
  return crypto.createHash('sha256').update(code.trim()).digest('hex');
}

function getClientIp(req: AuthenticatedRequest): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.trim()) {
    return fwd.split(',')[0].trim();
  }
  return req.ip || 'unknown';
}

function csvEscapeCell(raw: string | number | boolean | undefined | null): string {
  const str = String(raw ?? '');
  const safe = /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
  return `"${safe.replace(/"/g, '""')}"`;
}

function maskEmail(email: string): string {
  const clean = (email || '').trim();
  if (!clean || !clean.includes('@')) return clean ? '***' : '';
  const [local, domain] = clean.split('@');
  if (!local) return `***@${domain}`;
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}***@${domain}`;
}

function maskPhone(phone: string): string {
  const clean = (phone || '').trim();
  if (!clean) return '';
  if (clean.length <= 4) return '****';
  return `${clean.slice(0, 3)}${'*'.repeat(Math.max(2, clean.length - 5))}${clean.slice(-2)}`;
}

function filterAndSortAdminUsers(
  allUsers: User[],
  query: Record<string, unknown>
): User[] {
  const search = typeof query.search === 'string' ? query.search.trim().toLowerCase() : '';
  const roleFilter = typeof query.role === 'string' ? query.role.trim() : 'all';
  const statusFilter = typeof query.status === 'string' ? query.status.trim() : 'all';
  const yearFilter = Number(query.year || 0);
  const sortBy = typeof query.sortBy === 'string' ? query.sortBy : 'createdAt';
  const sortDir = query.sortDir === 'asc' ? 1 : -1;

  const filtered = allUsers.filter((u) => {
    if (roleFilter === 'student' || roleFilter === 'teacher' || roleFilter === 'admin') {
      if (u.role !== roleFilter) return false;
    }
    if (statusFilter === 'active' && u.isSuspended) return false;
    if (statusFilter === 'suspended' && !u.isSuspended) return false;
    if (yearFilter >= 1 && yearFilter <= 4 && u.year !== yearFilter) return false;
    if (search) {
      const hay = `${u.name} ${u.email || ''} ${u.phone || ''} ${u.id}`.toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });

  filtered.sort((a, b) => {
    if (sortBy === 'name') {
      return a.name.localeCompare(b.name, 'ar') * sortDir;
    }
    if (sortBy === 'points') {
      return (a.points - b.points) * sortDir;
    }
    if (sortBy === 'role') {
      return a.role.localeCompare(b.role) * sortDir;
    }
    if (sortBy === 'status') {
      const av = a.isSuspended ? 1 : 0;
      const bv = b.isSuspended ? 1 : 0;
      return (av - bv) * sortDir;
    }
    if (sortBy === 'lastLoginAt') {
      const at = a.lastLoginAt ? new Date(a.lastLoginAt).getTime() : 0;
      const bt = b.lastLoginAt ? new Date(b.lastLoginAt).getTime() : 0;
      return (at - bt) * sortDir;
    }
    const at = new Date(a.createdAt).getTime() || 0;
    const bt = new Date(b.createdAt).getTime() || 0;
    return (at - bt) * sortDir;
  });

  return filtered;
}

router.post('/auth/register', registerRateLimiter, (req, res) => {
  const { name, email, phone, password, year, adminCode, acceptedTerms } = req.body as {
    name?: string;
    email?: string;
    phone?: string;
    password?: string;
    year?: number;
    adminCode?: string;
    acceptedTerms?: boolean;
  };

  if (acceptedTerms !== true) {
    res.status(400).json({
      error: 'يجب الموافقة على الشروط والأحكام أولاً قبل إنشاء الحساب.',
    });
    return;
  }

  if (!name?.trim() || !email?.trim() || !phone?.trim() || !password || !year) {
    res.status(400).json({
      error: 'يرجى استكمال الاسم والبريد الإلكتروني ورقم التليفون وكلمة المرور والسنة الدراسية.',
    });
    return;
  }

  const cleanEmail = email.trim().toLowerCase();
  if (!EMAIL_REGEX.test(cleanEmail)) {
    res.status(400).json({ error: 'صيغة البريد الإلكتروني غير صحيحة.' });
    return;
  }

  const parsedYear = Number(year) as AcademicYear;
  if (![1, 2, 3, 4].includes(parsedYear)) {
    res.status(400).json({ error: 'السنة الدراسية يجب أن تكون من الفرقة الأولى إلى الرابعة.' });
    return;
  }

  if (password.length < 4) {
    res.status(400).json({ error: 'كلمة المرور يجب أن تكون 4 أحرف على الأقل.' });
    return;
  }

  const store = db.get();
  const cleanPhone = phone.trim();
  const cleanName = name.trim();

  if (store.users.some((u) => u.phone === cleanPhone)) {
    res.status(409).json({ error: 'رقم التليفون مسجل بالفعل في المنصة.' });
    return;
  }

  if (store.users.some((u) => (u.email || '').toLowerCase() === cleanEmail)) {
    res.status(409).json({ error: 'البريد الإلكتروني مسجل بالفعل في المنصة.' });
    return;
  }

  const isOwnerEmail = cleanEmail === SUPER_ADMIN_EMAIL.toLowerCase();
  const isFirstAccount = store.users.length === 0 || isOwnerEmail;

  let role: UserRole = 'student';
  let isProtected = false;
  let adminRankId: string | undefined;

  if (isFirstAccount) {
    role = 'admin';
    isProtected = true;
    adminRankId = 'rank-super-admin';
  } else if (adminCode && adminCode.trim().length > 0) {
    const cleanCode = adminCode.trim();
    const configuredSecret = getAdminSecretCode();
    const customHash = store.platformConfig?.adminActivationPasswordHash;

    if (configuredSecret && cleanCode === configuredSecret) {
      role = 'admin';
      isProtected = true;
      adminRankId = 'rank-super-admin';
    } else if (customHash && verifyPassword(cleanCode, customHash)) {
      const configuredRankId =
        store.platformConfig?.adminActivationDefaultRankId || 'rank-deputy-director';
      const validRank = (store.adminRanks || []).find(
        (r) => r.id === configuredRankId && !r.isSuperAdminRank && r.id !== 'rank-super-admin'
      );
      role = 'admin';
      isProtected = false;
      adminRankId = validRank ? validRank.id : 'rank-deputy-director';
    } else if (!configuredSecret && !customHash) {
      res.status(403).json({ error: 'تسجيل الأدمن بالكود غير مفعّل حالياً على الخادم.' });
      return;
    } else {
      res.status(403).json({ error: 'كود أو كلمة سر تفعيل الأدمن غير صحيحة.' });
      return;
    }
  }

  const nowIso = new Date().toISOString();
  const newUser: User = {
    id: `user-${crypto.randomUUID()}`,
    name: cleanName,
    email: cleanEmail,
    phone: cleanPhone,
    passwordHash: hashPassword(password),
    year: parsedYear,
    role,
    adminRankId,
    isProtected,
    points: 0,
    quizzesCompleted: 0,
    emailVerified: false,
    lastLoginAt: nowIso,
    createdAt: nowIso,
  };

  store.users.push(newUser);
  db.save();

  const token = createSessionToken(newUser.id);
  setSessionCookie(req, res, token);
  res.status(201).json({
    token,
    user: toSafeUser(newUser),
  });
});

router.post('/auth/login', loginRateLimiter, (req, res) => {
  const { identifier, password } = req.body as {
    identifier?: string;
    password?: string;
  };

  if (!identifier?.trim() || !password) {
    res.status(400).json({ error: 'يرجى إدخال البريد الإلكتروني أو رقم التليفون وكلمة المرور.' });
    return;
  }

  const clean = identifier.trim().toLowerCase();
  const lockout = checkLoginLockout(clean);
  if (lockout.locked) {
    const minutes = Math.max(1, Math.ceil(lockout.retryAfterSeconds / 60));
    res.setHeader('Retry-After', String(lockout.retryAfterSeconds));
    res.status(429).json({
      error: `تم قفل المحاولة مؤقتاً بسبب تكرار كلمات مرور خاطئة. حاول بعد ${minutes} دقيقة.`,
      retryAfterSeconds: lockout.retryAfterSeconds,
    });
    return;
  }

  const store = db.get();
  const user = store.users.find(
    (u) =>
      u.phone === identifier.trim() ||
      (u.email || '').toLowerCase() === clean ||
      u.name.toLowerCase() === clean
  );

  if (!user || !verifyPassword(password, user.passwordHash)) {
    const failState = recordFailedLogin(clean);
    if (failState.locked) {
      res.setHeader('Retry-After', String(failState.retryAfterSeconds));
      res.status(429).json({
        error: 'تم قفل تسجيل الدخول لهذا الحساب لمدة 15 دقيقة بعد 5 محاولات خاطئة متتالية.',
        retryAfterSeconds: failState.retryAfterSeconds,
      });
      return;
    }
    res.status(401).json({
      error: `بيانات الدخول غير صحيحة. المحاولات المتبقية: ${failState.remainingAttempts}.`,
    });
    return;
  }

  if (user.isSuspended && !user.isProtected && user.role !== 'admin') {
    res.status(403).json({
      suspended: true,
      error:
        'تم حظر حسابك مؤقتاً لمخالفة الشروط والأحكام، ولا يمكنك الدخول مجدداً إلا بإذن وموافقة من الأدمن.',
    });
    return;
  }

  if ((user.email || '').toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase()) {
    user.role = 'admin';
    user.isProtected = true;
    user.adminRankId = 'rank-super-admin';
  }

  clearLoginFailures(clean);
  user.lastLoginAt = new Date().toISOString();
  db.save();
  const token = createSessionToken(user.id);
  setSessionCookie(req, res, token);
  res.json({
    token,
    user: toSafeUser(user),
  });
});

router.post('/auth/logout', requireAuth, (req: AuthenticatedRequest, res) => {
  const store = db.get();
  store.sessions = store.sessions.filter((s) => s.token !== req.authToken);
  db.save();
  clearSessionCookie(req, res);
  res.json({ ok: true });
});

router.get('/auth/me', requireAuth, (req: AuthenticatedRequest, res) => {
  if (req.authToken) {
    setSessionCookie(req, res, req.authToken);
  }
  res.json({
    token: req.authToken,
    user: toSafeUser(req.currentUser!),
  });
});

router.get('/users', requireAuth, (req: AuthenticatedRequest, res) => {
  const yearParam = req.query.year ? Number(req.query.year) : 0;
  const store = db.get();
  const canViewSensitive = hasUserPermission(req.currentUser, 'view_sensitive_data');
  let users = store.users.map((u) =>
    canViewSensitive ? toSafeUser(u) : toLeaderboardUser(u)
  );
  if (yearParam >= 1 && yearParam <= 4) {
    users = users.filter((u) => u.year === yearParam);
  }
  users.sort((a, b) => b.points - a.points);
  res.json({ users });
});

router.get('/admin/users', requireAuth, requireAnyPermission('manage_students', 'manage_user_notes'), (req: AuthenticatedRequest, res) => {
  const store = db.get();
  const allUsers = store.users;
  const canViewSensitive = hasUserPermission(req.currentUser, 'view_sensitive_data');

  const stats = {
    totalUsers: allUsers.length,
    activeUsers: allUsers.filter((u) => !u.isSuspended).length,
    suspendedUsers: allUsers.filter((u) => Boolean(u.isSuspended)).length,
    studentsCount: allUsers.filter((u) => u.role === 'student').length,
    teachersCount: allUsers.filter((u) => u.role === 'teacher').length,
    adminsCount: allUsers.filter((u) => u.role === 'admin').length,
  };

  const filtered = filterAndSortAdminUsers(
    allUsers,
    req.query as Record<string, unknown>
  );

  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 10));
  const totalFiltered = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / limit));
  const safePage = Math.min(page, totalPages);
  const offset = (safePage - 1) * limit;
  const paginated = filtered.slice(offset, offset + limit).map((u) => {
    const safe = toSafeUser(u);
    if (!canViewSensitive) {
      return {
        ...safe,
        email: maskEmail(safe.email),
        phone: maskPhone(safe.phone),
      };
    }
    return safe;
  });

  res.json({
    users: paginated,
    pagination: {
      page: safePage,
      limit,
      totalFiltered,
      totalPages,
    },
    stats,
  });
});

router.post('/admin/users/:id/suspend', requireAuth, requirePermission('manage_students'), (req: AuthenticatedRequest, res) => {
  const targetId = req.params.id;
  const { reason } = req.body as { reason?: string };
  const store = db.get();
  const target = store.users.find((u) => u.id === targetId);

  if (!target) {
    res.status(404).json({ error: 'المستخدم غير موجود.' });
    return;
  }

  if (target.isProtected || target.role === 'admin' || target.id === req.currentUser!.id) {
    res.status(403).json({ error: 'حساب الأدمن محمي ولا يمكن تعليقه.' });
    return;
  }

  const finalReason = reason?.trim() || 'تجاوز الحدود ومخالفة الشروط والأحكام';
  target.isSuspended = true;
  target.suspendedReason = finalReason;
  target.suspendedAt = new Date().toISOString();
  store.sessions = store.sessions.filter((s) => s.userId !== targetId);
  db.save();

  recordAdminAudit({
    actorId: req.currentUser!.id,
    actorName: req.currentUser!.name,
    action: 'user.suspend',
    targetUserId: targetId,
    targetUserName: target.name,
    details: `Suspended user: ${finalReason}`,
    ip: getClientIp(req),
  });

  res.json({ ok: true, user: toSafeUser(target) });
});

router.post('/admin/users/:id/unsuspend', requireAuth, requirePermission('manage_students'), (req: AuthenticatedRequest, res) => {
  const targetId = req.params.id;
  const store = db.get();
  const target = store.users.find((u) => u.id === targetId);

  if (!target) {
    res.status(404).json({ error: 'المستخدم غير موجود.' });
    return;
  }

  target.isSuspended = false;
  target.suspendedReason = undefined;
  target.suspendedAt = undefined;
  db.save();

  recordAdminAudit({
    actorId: req.currentUser!.id,
    actorName: req.currentUser!.name,
    action: 'user.unsuspend',
    targetUserId: targetId,
    targetUserName: target.name,
    details: 'Lifted suspension and restored user access',
    ip: getClientIp(req),
  });

  res.json({ ok: true, user: toSafeUser(target) });
});

export default router;
