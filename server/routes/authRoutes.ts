import crypto from 'crypto';
import { Router } from 'express';
import {
  clearSessionCookie,
  createPersistentSession,
  getAdminSecretCode,
  requireAnyPermission,
  requireAuth,
  requirePermission,
  requireSuperAdmin,
  revokeNonAdminSessions,
  revokeSessionToken,
  revokeUserSessions,
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
  sendOptionalEmail,
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
import { closeNonAdminWsClients } from '../wsHub.js';

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

router.post('/auth/register', registerRateLimiter, async (req, res) => {
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

  const token = await createPersistentSession(newUser.id);
  setSessionCookie(req, res, token);
  res.status(201).json({
    token,
    user: toSafeUser(newUser),
  });
});

router.post('/auth/login', loginRateLimiter, async (req, res) => {
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
  const token = await createPersistentSession(user.id);
  setSessionCookie(req, res, token);
  res.json({
    token,
    user: toSafeUser(user),
  });
});

router.post('/auth/logout', requireAuth, async (req: AuthenticatedRequest, res) => {
  await revokeSessionToken(req.authToken);
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

router.post('/auth/send-verification', requireAuth, async (req: AuthenticatedRequest, res) => {
  const emailCfg = getEmailDeliveryConfig();
  if (!emailCfg.enabled) {
    console.warn(
      '[Email] Verification email skipped because Resend is disabled or not configured.'
    );
    res.json({
      sent: false,
      disabled: true,
      requiresConfig: true,
      message: 'خدمة إرسال رسائل البريد الإلكتروني غير مفعلة حالياً.',
    });
    return;
  }

  const user = req.currentUser!;
  if (!user.email) {
    console.warn('[Email] Verification email skipped: user has no email address.');
    res.json({
      sent: false,
      disabled: false,
      message: 'لا يوجد بريد إلكتروني مسجل لهذا الحساب، وتمت متابعة العملية بشكل طبيعي.',
    });
    return;
  }

  const code = String(crypto.randomInt(100000, 999999));
  user.emailVerificationTokenHash = hashOtpCode(code);
  user.emailVerificationExpiresAt = new Date(Date.now() + VERIFICATION_TTL_MS).toISOString();
  db.save();

  const result = await sendOptionalEmail({
    to: user.email,
    subject: 'رمز تأكيد البريد الإلكتروني - منصة MAVIA',
    html: `<p>رمز التأكيد الخاص بك هو: <strong>${code}</strong></p>`,
  });

  if (!result.sent) {
    if (result.errorMessage) {
      recordAppError({
        source: 'server',
        message: result.errorMessage,
        path: '/api/auth/send-verification',
        userId: user.id,
      });
    }
    res.json({
      sent: false,
      disabled: result.disabled,
      warning: true,
      message: 'تمت العملية بشكل طبيعي، تعذر إرسال رسالة البريد الإلكتروني حالياً.',
    });
    return;
  }

  res.json({ sent: true, message: 'تم إرسال رمز التأكيد إلى بريدك الإلكتروني.' });
});

router.post('/auth/verify-email', requireAuth, (req: AuthenticatedRequest, res) => {
  const { code } = req.body as { code?: string };
  const user = req.currentUser!;

  if (!code || !code.trim()) {
    res.status(400).json({ error: 'يرجى إدخال رمز التأكيد.' });
    return;
  }

  if (!user.emailVerificationTokenHash || !user.emailVerificationExpiresAt) {
    res.status(400).json({ error: 'لم يتم طلب رمز تأكيد مسبقاً أو انتهت صلاحيته.' });
    return;
  }

  if (new Date(user.emailVerificationExpiresAt).getTime() < Date.now()) {
    res.status(400).json({ error: 'انتهت صلاحية رمز التأكيد، اطلب رمزاً جديداً.' });
    return;
  }

  if (hashOtpCode(code) !== user.emailVerificationTokenHash) {
    res.status(400).json({ error: 'رمز التأكيد غير صحيح.' });
    return;
  }

  user.emailVerified = true;
  user.emailVerificationTokenHash = undefined;
  user.emailVerificationExpiresAt = undefined;
  db.save();

  res.json({ ok: true, user: toSafeUser(user) });
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

router.get(
  '/admin/users',
  requireAuth,
  requireAnyPermission('manage_students', 'manage_user_notes'),
  (req: AuthenticatedRequest, res) => {
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
  }
);

router.post(
  '/admin/users',
  requireAuth,
  requirePermission('manage_students'),
  (req: AuthenticatedRequest, res) => {
    const { name, email, phone, password, year, role } = req.body as {
      name?: string;
      email?: string;
      phone?: string;
      password?: string;
      year?: number;
      role?: UserRole;
    };

    if (!name?.trim() || !email?.trim() || !phone?.trim() || !password || !year) {
      res.status(400).json({ error: 'يرجى استكمال جميع الحقول المطلوبة لإنشاء الحساب.' });
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    if (!EMAIL_REGEX.test(cleanEmail)) {
      res.status(400).json({ error: 'صيغة البريد الإلكتروني غير صحيحة.' });
      return;
    }

    const parsedYear = Number(year) as AcademicYear;
    if (![1, 2, 3, 4].includes(parsedYear)) {
      res.status(400).json({ error: 'السنة الدراسية غير صالحة.' });
      return;
    }

    if (password.length < 4) {
      res.status(400).json({ error: 'كلمة المرور يجب أن تكون 4 أحرف على الأقل.' });
      return;
    }

    const targetRole: UserRole =
      role === 'admin' || role === 'teacher' || role === 'student' ? role : 'student';

    if (targetRole === 'admin' && !isUserSuperAdmin(req.currentUser)) {
      res.status(403).json({ error: 'إنشاء حسابات الأدمن متاح للمدير العام فقط.' });
      return;
    }

    const store = db.get();
    const cleanPhone = phone.trim();
    if (store.users.some((u) => u.phone === cleanPhone)) {
      res.status(409).json({ error: 'رقم التليفون مسجل بالفعل.' });
      return;
    }
    if (store.users.some((u) => (u.email || '').toLowerCase() === cleanEmail)) {
      res.status(409).json({ error: 'البريد الإلكتروني مسجل بالفعل.' });
      return;
    }

    const newUser: User = {
      id: `user-${crypto.randomUUID()}`,
      name: name.trim(),
      email: cleanEmail,
      phone: cleanPhone,
      passwordHash: hashPassword(password),
      year: parsedYear,
      role: targetRole,
      adminRankId: targetRole === 'admin' ? 'rank-deputy-director' : undefined,
      isProtected: false,
      points: 0,
      quizzesCompleted: 0,
      emailVerified: false,
      createdAt: new Date().toISOString(),
    };

    store.users.push(newUser);
    db.save();

    recordAdminAudit({
      actorId: req.currentUser!.id,
      actorName: req.currentUser!.name,
      action: 'user.create',
      targetUserId: newUser.id,
      targetUserName: newUser.name,
      details: `Created ${targetRole} account (${cleanEmail})`,
      ip: getClientIp(req),
    });

    res.status(201).json({ user: toSafeUser(newUser) });
  }
);

router.get(
  '/admin/users/export.csv',
  requireAuth,
  requirePermission('manage_students'),
  (req: AuthenticatedRequest, res) => {
    const store = db.get();
    const canViewSensitive = hasUserPermission(req.currentUser, 'view_sensitive_data');
    const includeContact = req.query.includeContact === 'true' && canViewSensitive;

    const filtered = filterAndSortAdminUsers(
      store.users,
      req.query as Record<string, unknown>
    );

    const headers = [
      'ID',
      'Name',
      'Email',
      'Phone',
      'Role',
      'Year',
      'Status',
      'Points',
      'QuizzesCompleted',
      'LastLoginAt',
      'CreatedAt',
    ];

    const rows = filtered.map((u) => [
      csvEscapeCell(u.id),
      csvEscapeCell(u.name),
      csvEscapeCell(includeContact ? u.email : maskEmail(u.email)),
      csvEscapeCell(includeContact ? u.phone : maskPhone(u.phone)),
      csvEscapeCell(u.role),
      csvEscapeCell(u.year),
      csvEscapeCell(u.isSuspended ? 'suspended' : 'active'),
      csvEscapeCell(u.points),
      csvEscapeCell(u.quizzesCompleted),
      csvEscapeCell(u.lastLoginAt || ''),
      csvEscapeCell(u.createdAt),
    ]);

    const csv = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');

    recordAdminAudit({
      actorId: req.currentUser!.id,
      actorName: req.currentUser!.name,
      action: 'users.csv_export',
      details: `Exported ${filtered.length} user(s) to CSV (includeContact=${includeContact})`,
      ip: getClientIp(req),
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="mvia-users-${new Date().toISOString().slice(0, 10)}.csv"`
    );
    res.send(csv);
  }
);

router.get(
  '/admin/users/:id/profile',
  requireAuth,
  requireAnyPermission('manage_students', 'manage_user_notes'),
  (req: AuthenticatedRequest, res) => {
    const { id } = req.params;
    const store = db.get();
    const target = store.users.find((u) => u.id === id);
    if (!target) {
      res.status(404).json({ error: 'المستخدم غير موجود.' });
      return;
    }

    const canViewSensitive = hasUserPermission(req.currentUser, 'view_sensitive_data');
    const safeTarget = toSafeUser(target);
    const userPayload = canViewSensitive
      ? safeTarget
      : {
          ...safeTarget,
          email: maskEmail(safeTarget.email),
          phone: maskPhone(safeTarget.phone),
        };

    const progress = store.studentProgress?.[id];
    const enrolledIds = progress?.enrolledCourseIds || [];
    const enrolledCourses = store.courses
      .filter((c) => enrolledIds.includes(c.id))
      .map((c) => ({ id: c.id, title: c.title, code: c.code, year: c.year }));

    const userSubs = store.quizSubmissions
      .filter((s) => s.userId === id)
      .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());

    const avgQuizScorePercent =
      userSubs.length > 0
        ? Math.round(
            userSubs.reduce(
              (acc, s) => acc + (s.maxScore > 0 ? (s.score / s.maxScore) * 100 : 0),
              0
            ) / userSubs.length
          )
        : 0;

    const recentSubmissions = userSubs.slice(0, 15).map((s) => {
      const quiz = store.quizzes.find((q) => q.id === s.quizId);
      const course = store.courses.find((c) => c.id === s.courseId);
      return {
        id: s.id,
        quizId: s.quizId,
        quizTitle: quiz?.title || s.quizId,
        courseId: s.courseId,
        courseTitle: course?.title || s.courseId,
        score: s.score,
        maxScore: s.maxScore,
        correctCount: s.correctCount,
        totalQuestions: s.totalQuestions,
        timeSpentSeconds: s.timeSpentSeconds,
        submittedAt: s.submittedAt,
      };
    });

    const notes = [...(store.userProfileNotes || [])]
      .filter((n) => n.targetUserId === id)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const tasks = progress?.tasks || [];
    const gpaEntries = store.gpaTables?.[id] || [];
    const lecturesWatchedCount = Object.keys(store.lectureProgress?.[id] || {}).length;
    const supportTicketsCount = (store.supportTickets || []).filter(
      (t) => t.userId === id
    ).length;

    recordAdminAudit({
      actorId: req.currentUser!.id,
      actorName: req.currentUser!.name,
      action: 'user.profile_view',
      targetUserId: target.id,
      targetUserName: target.name,
      details: 'Viewed user academic profile',
      ip: getClientIp(req),
    });

    res.json({
      user: userPayload,
      academicStats: {
        points: target.points,
        quizzesCompleted: target.quizzesCompleted,
        totalSubmissions: userSubs.length,
        avgQuizScorePercent,
        enrolledCoursesCount: enrolledCourses.length,
        completedSummariesCount: (progress?.completedSummaryIds || []).length,
        studyMinutes: progress?.studyMinutes || 0,
        tasksTotal: tasks.length,
        tasksCompleted: tasks.filter((t) => t.completed).length,
        gpaEntriesCount: gpaEntries.length,
        lecturesWatchedCount,
        supportTicketsCount,
        enrolledCourses,
      },
      recentSubmissions,
      notes,
    });
  }
);

router.patch(
  '/admin/users/:id/credentials',
  requireAuth,
  requireSuperAdmin,
  async (req: AuthenticatedRequest, res) => {
    const { id } = req.params;
    const { email, newPassword } = req.body as {
      email?: string;
      newPassword?: string;
    };

    const store = db.get();
    const target = store.users.find((u) => u.id === id);
    if (!target) {
      res.status(404).json({ error: 'المستخدم غير موجود.' });
      return;
    }

    if (email !== undefined) {
      const cleanEmail = email.trim().toLowerCase();
      if (!EMAIL_REGEX.test(cleanEmail)) {
        res.status(400).json({ error: 'صيغة البريد الإلكتروني غير صحيحة.' });
        return;
      }
      if (
        store.users.some(
          (u) => u.id !== target.id && (u.email || '').toLowerCase() === cleanEmail
        )
      ) {
        res.status(409).json({ error: 'البريد الإلكتروني مستخدم بالفعل في حساب آخر.' });
        return;
      }
      target.email = cleanEmail;
    }

    if (newPassword !== undefined && newPassword.length > 0) {
      if (newPassword.length < 4) {
        res.status(400).json({ error: 'كلمة المرور الجديدة يجب أن تكون 4 أحرف على الأقل.' });
        return;
      }
      target.passwordHash = hashPassword(newPassword);
      await revokeUserSessions(target.id, req.authToken);
    }

    db.save();

    recordAdminAudit({
      actorId: req.currentUser!.id,
      actorName: req.currentUser!.name,
      action: 'user.credentials_update',
      targetUserId: target.id,
      targetUserName: target.name,
      details: 'Super Admin updated user credentials',
      ip: getClientIp(req),
    });

    res.json({ user: toSafeUser(target) });
  }
);

router.post(
  '/admin/users/:id/notes',
  requireAuth,
  requirePermission('manage_user_notes'),
  (req: AuthenticatedRequest, res) => {
    const { id } = req.params;
    const { content } = req.body as { content?: string };
    const clean = content?.trim() || '';

    if (clean.length < 2 || clean.length > 1000) {
      res.status(400).json({ error: 'الملاحظة يجب أن تكون بين حرفين و1000 حرف.' });
      return;
    }

    const store = db.get();
    const target = store.users.find((u) => u.id === id);
    if (!target) {
      res.status(404).json({ error: 'المستخدم غير موجود.' });
      return;
    }

    if (!Array.isArray(store.userProfileNotes)) {
      store.userProfileNotes = [];
    }

    const now = new Date().toISOString();
    const note: UserProfileNote = {
      id: `note-${crypto.randomUUID()}`,
      targetUserId: target.id,
      authorId: req.currentUser!.id,
      authorName: req.currentUser!.name,
      content: clean,
      reactions: [],
      createdAt: now,
      updatedAt: now,
    };

    store.userProfileNotes.unshift(note);
    db.save();

    recordAdminAudit({
      actorId: req.currentUser!.id,
      actorName: req.currentUser!.name,
      action: 'user.note_create',
      targetUserId: target.id,
      targetUserName: target.name,
      details: 'Added admin note on user profile',
      ip: getClientIp(req),
    });

    res.status(201).json({ note });
  }
);

router.delete(
  '/admin/users/:id/notes/:noteId',
  requireAuth,
  requirePermission('manage_user_notes'),
  (req: AuthenticatedRequest, res) => {
    const { id, noteId } = req.params;
    const store = db.get();
    const existing = (store.userProfileNotes || []).find(
      (n) => n.id === noteId && n.targetUserId === id
    );
    if (!existing) {
      res.status(404).json({ error: 'الملاحظة غير موجودة.' });
      return;
    }

    store.userProfileNotes = (store.userProfileNotes || []).filter(
      (n) => n.id !== noteId
    );
    db.save();

    const target = store.users.find((u) => u.id === id);
    recordAdminAudit({
      actorId: req.currentUser!.id,
      actorName: req.currentUser!.name,
      action: 'user.note_delete',
      targetUserId: id,
      targetUserName: target?.name,
      details: `Deleted note ${noteId}`,
      ip: getClientIp(req),
    });

    res.json({ ok: true });
  }
);

router.post(
  '/admin/users/:id/suspend',
  requireAuth,
  requirePermission('manage_students'),
  async (req: AuthenticatedRequest, res) => {
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
    await revokeUserSessions(targetId);
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
  }
);

router.post(
  '/admin/users/:id/unsuspend',
  requireAuth,
  requirePermission('manage_students'),
  (req: AuthenticatedRequest, res) => {
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
      action: 'user.activate',
      targetUserId: targetId,
      targetUserName: target.name,
      details: 'Lifted suspension and restored user access',
      ip: getClientIp(req),
    });

    res.json({ ok: true, user: toSafeUser(target) });
  }
);

router.delete(
  '/admin/users/:id',
  requireAuth,
  requirePermission('manage_students'),
  async (req: AuthenticatedRequest, res) => {
    const targetId = req.params.id;
    const store = db.get();
    const target = store.users.find((u) => u.id === targetId);

    if (!target) {
      res.status(404).json({ error: 'المستخدم غير موجود.' });
      return;
    }

    if (target.isProtected || target.role === 'admin' || target.id === req.currentUser!.id) {
      res.status(403).json({ error: 'حساب الأدمن محمي ولا يمكن حذفه.' });
      return;
    }

    store.users = store.users.filter((u) => u.id !== targetId);
    await revokeUserSessions(targetId);
    store.quizSubmissions = store.quizSubmissions.filter((s) => s.userId !== targetId);
    store.chatMessages = store.chatMessages.filter((m) => m.userId !== targetId);
    if (store.supportTickets) {
      store.supportTickets = store.supportTickets.filter((t) => t.userId !== targetId);
    }
    if (store.supportTeam) {
      store.supportTeam = store.supportTeam.filter((m) => m.userId !== targetId);
    }
    if (store.adminOfficials) {
      store.adminOfficials = store.adminOfficials.filter((o) => o.userId !== targetId);
    }
    if (store.userProfileNotes) {
      store.userProfileNotes = store.userProfileNotes.filter(
        (n) => n.targetUserId !== targetId
      );
    }
    if (store.studentProgress) {
      delete store.studentProgress[targetId];
    }
    if (store.gpaTables) {
      delete store.gpaTables[targetId];
    }
    if (store.lectureProgress) {
      delete store.lectureProgress[targetId];
    }
    if (store.analytics?.visitors) {
      delete store.analytics.visitors[targetId];
    }

    db.save();

    recordAdminAudit({
      actorId: req.currentUser!.id,
      actorName: req.currentUser!.name,
      action: 'user.delete',
      targetUserId: targetId,
      targetUserName: target.name,
      details: `Deleted user ${target.email}`,
      ip: getClientIp(req),
    });

    res.json({ ok: true, deletedUserId: targetId });
  }
);

router.get(
  '/admin/audit-logs',
  requireAuth,
  requirePermission('view_sensitive_data'),
  (_req, res) => {
    const store = db.get();
    res.json({ logs: store.adminAuditLogs || [] });
  }
);

router.post(
  '/admin/sessions/revoke-non-admins',
  requireAuth,
  requirePermission('manage_students'),
  async (req: AuthenticatedRequest, res) => {
    const store = db.get();
    const adminUserIds = new Set(
      store.users.filter((u) => u.role === 'admin').map((u) => u.id)
    );

    const { revokedSessionsCount, affectedUsersCount, keptAdminSessionsCount } =
      await revokeNonAdminSessions(adminUserIds);

    closeNonAdminWsClients(adminUserIds);

    recordAdminAudit({
      actorId: req.currentUser!.id,
      actorName: req.currentUser!.name,
      action: 'sessions.revoke_non_admins',
      details: `Revoked ${revokedSessionsCount} non-admin session(s) across ${affectedUsersCount} user(s); kept ${keptAdminSessionsCount} admin session(s)`,
      ip: getClientIp(req),
    });

    res.json({
      ok: true,
      revokedSessionsCount,
      affectedUsersCount,
      keptAdminSessionsCount,
    });
  }
);

export default router;
