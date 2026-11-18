import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type {
  AcademicYear,
  AdminAuditAction,
  AdminAuditLog,
  AdminOfficial,
  AdminPermissionKey,
  AdminRank,
  AppErrorLog,
  DatabaseSchema,
  NotificationItem,
  SafeUser,
  User,
  UserRankBadge,
} from './types.js';

import {
  isSupabaseDbEnabled,
  loadLatestStateFromSupabase,
  saveStateToSupabase,
} from './supabase.js';
import { IS_VERCEL, UPLOADS_DIR } from './storage.js';
export { UPLOADS_DIR };

const BUNDLED_DB_FILE = path.resolve(process.cwd(), 'data', 'mafia-db.json');
const DB_FILE = process.env.MVIA_DB_FILE
  ? path.resolve(process.env.MVIA_DB_FILE)
  : IS_VERCEL
  ? path.resolve('/tmp', 'mavia-runtime', 'mafia-db.json')
  : BUNDLED_DB_FILE;
const DATA_DIR = path.dirname(DB_FILE);

const BACKUPS_DIR = path.join(DATA_DIR, 'backups');
const SENDER_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function getEmailDeliveryConfig(): {
  enabled: boolean;
  apiKey: string;
  fromEmail: string;
} {
  const emailFlag = (process.env.EMAIL_ENABLED || '').trim().toLowerCase();
  if (emailFlag === 'false' || emailFlag === 'disabled') {
    return { enabled: false, apiKey: '', fromEmail: '' };
  }
  const apiKey = process.env.RESEND_API_KEY?.trim() || '';
  const fromEmail = process.env.EMAIL_FROM?.trim() || '';
  if (!apiKey || apiKey.toLowerCase() === 'disabled' || !fromEmail) {
    return { enabled: false, apiKey: '', fromEmail: '' };
  }
  const match = fromEmail.match(/<([^>]+)>/);
  const addressPart = (match ? match[1] : fromEmail).trim();
  if (!SENDER_EMAIL_REGEX.test(addressPart)) {
    return { enabled: false, apiKey: '', fromEmail: '' };
  }
  return { enabled: true, apiKey, fromEmail };
}

export async function sendOptionalEmail(params: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ sent: boolean; disabled: boolean; errorMessage?: string }> {
  const emailCfg = getEmailDeliveryConfig();
  if (!emailCfg.enabled) {
    console.warn(
      '[Email] Resend email skipped (RESEND_API_KEY missing/disabled or EMAIL_FROM not configured).'
    );
    return { sent: false, disabled: true };
  }

  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${emailCfg.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: emailCfg.fromEmail,
        to: [params.to],
        subject: params.subject,
        html: params.html,
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      const msg = `Resend email error (${resp.status}): ${errText}`;
      console.warn(`[Email] Optional email delivery failed, continuing normally: ${msg}`);
      return { sent: false, disabled: false, errorMessage: msg };
    }

    return { sent: true, disabled: false };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Email send failure';
    console.warn(`[Email] Optional email delivery threw an error, continuing normally: ${msg}`);
    return { sent: false, disabled: false, errorMessage: msg };
  }
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, originalHash] = stored.split(':');
  if (!salt || !originalHash) return false;
  const hashBuf = crypto.scryptSync(password, salt, 64);
  const origBuf = Buffer.from(originalHash, 'hex');
  if (hashBuf.length !== origBuf.length) return false;
  return crypto.timingSafeEqual(hashBuf, origBuf);
}

export const ALL_ADMIN_PERMISSIONS: AdminPermissionKey[] = [
  'manage_ranks',
  'manage_officials',
  'manage_courses',
  'manage_quizzes',
  'manage_learning',
  'manage_community',
  'manage_students',
  'manage_user_notes',
  'manage_support',
  'view_sensitive_data',
];

export const ADMIN_PERMISSIONS_CATALOG: Array<{
  key: AdminPermissionKey;
  labelAr: string;
  labelEn: string;
  descriptionAr: string;
  superAdminOnly?: boolean;
}> = [
  {
    key: 'manage_ranks',
    labelAr: 'إدارة الرتب والصلاحيات',
    labelEn: 'Manage Ranks & Permissions',
    descriptionAr: 'تعديل الرتب الإدارية وصلاحيات كل رتبة (حصري للمدير العام).',
    superAdminOnly: true,
  },
  {
    key: 'manage_officials',
    labelAr: 'توزيع المسؤولين',
    labelEn: 'Manage Officials',
    descriptionAr: 'تعيين أو تحديث أو إزالة مسؤولي الرتب الإدارية.',
  },
  {
    key: 'manage_courses',
    labelAr: 'إدارة المواد والمجلدات والملخصات',
    labelEn: 'Manage Courses & Materials',
    descriptionAr: 'إضافة وتعديل وحذف المواد الدراسية والمجلدات والكتب والملخصات.',
  },
  {
    key: 'manage_quizzes',
    labelAr: 'إدارة الاختبارات والامتحانات الشاملة',
    labelEn: 'Manage Quizzes & Exams',
    descriptionAr: 'إنشاء وتوليد وحذف الاختبارات وتصحيح الامتحانات الشاملة.',
  },
  {
    key: 'manage_learning',
    labelAr: 'إدارة المحاضرات ومسارات التعلم',
    labelEn: 'Manage Learning & Lectures',
    descriptionAr: 'رفع المحاضرات وإضافة روابط القنوات والمنصات التعليمية.',
  },
  {
    key: 'manage_community',
    labelAr: 'إدارة المجتمع والإعلانات والإشعارات',
    labelEn: 'Manage Community & Announcements',
    descriptionAr: 'إدارة الجروبات والمؤقتات والإشعارات وإعدادات التواصل والرسائل.',
  },
  {
    key: 'manage_students',
    labelAr: 'إدارة حسابات الطلاب والأعضاء',
    labelEn: 'Manage Users & Students',
    descriptionAr: 'إنشاء وتعليق وتفعيل وحذف حسابات الطلاب وتصدير البيانات.',
  },
  {
    key: 'manage_user_notes',
    labelAr: 'ملاحظات الإدارة على البروفايل',
    labelEn: 'Manage User Profile Notes',
    descriptionAr: 'عرض الملفات الأكاديمية وإضافة وحذف الملاحظات الإدارية.',
  },
  {
    key: 'manage_support',
    labelAr: 'إدارة الدعم الفني والتذاكر',
    labelEn: 'Manage Support Team & Tickets',
    descriptionAr: 'تعيين فريق الدعم الفني والرد على بلاغات وتذاكر الطلاب.',
  },
  {
    key: 'view_sensitive_data',
    labelAr: 'عرض البيانات الحساسة وسجل النظام',
    labelEn: 'View Sensitive Data & System Logs',
    descriptionAr: 'عرض البريد والهاتف الكامل وسجلات المراجعة والأعطال والنسخ الاحتياطية.',
  },
];

export function buildDefaultAdminRanks(): AdminRank[] {
  const now = new Date().toISOString();
  return [
    {
      id: 'rank-super-admin',
      slug: 'super_admin',
      nameAr: 'المدير العام',
      nameEn: 'Super Admin',
      description: 'القيادة العليا للمنصة مع كامل الصلاحيات وإدارة الرتب وتوزيع المسؤولين.',
      badgeIcon: 'crown',
      badgeColor: 'gold',
      displayOrder: 1,
      isSuperAdminRank: true,
      isVisibleInSupport: true,
      permissions: [...ALL_ADMIN_PERMISSIONS],
      updatedAt: now,
    },
    {
      id: 'rank-deputy-director',
      slug: 'deputy_director',
      nameAr: 'نائب المدير العام',
      nameEn: 'Deputy General Manager',
      description: 'ينوب عن المدير العام في الإشراف والتشغيل وفق الصلاحيات المفوضة فقط.',
      badgeIcon: 'medal',
      badgeColor: 'silver',
      displayOrder: 2,
      isSuperAdminRank: false,
      isVisibleInSupport: true,
      permissions: [],
      updatedAt: now,
    },
    {
      id: 'rank-tech-director',
      slug: 'tech_director',
      nameAr: 'مدير النظام والتقنية',
      nameEn: 'Systems & Tech Director',
      description: 'مسؤول البنية التقنية والأنظمة والأعطال الفنية.',
      badgeIcon: 'cpu',
      badgeColor: 'sky',
      displayOrder: 3,
      isSuperAdminRank: false,
      isVisibleInSupport: true,
      permissions: [],
      updatedAt: now,
    },
    {
      id: 'rank-academic-director',
      slug: 'academic_director',
      nameAr: 'مدير الشؤون التعليمية',
      nameEn: 'Academic Affairs Director',
      description: 'الإشراف على المناهج والمسارات التعليمية والمواد الدراسية.',
      badgeIcon: 'graduation-cap',
      badgeColor: 'emerald',
      displayOrder: 4,
      isSuperAdminRank: false,
      isVisibleInSupport: true,
      permissions: [],
      updatedAt: now,
    },
    {
      id: 'rank-student-affairs',
      slug: 'student_affairs',
      nameAr: 'مسؤول شؤون الطلاب',
      nameEn: 'Student Affairs Officer',
      description: 'متابعة حسابات الطلاب واستفسارات الفرق الدراسية.',
      badgeIcon: 'users',
      badgeColor: 'violet',
      displayOrder: 5,
      isSuperAdminRank: false,
      isVisibleInSupport: true,
      permissions: [],
      updatedAt: now,
    },
    {
      id: 'rank-tech-support',
      slug: 'tech_support',
      nameAr: 'مسؤول الدعم الفني',
      nameEn: 'Technical Support Officer',
      description: 'استقبال البلاغات ومساعدة الطلاب في مشاكل الدخول والاستخدام.',
      badgeIcon: 'headset',
      badgeColor: 'amber',
      displayOrder: 6,
      isSuperAdminRank: false,
      isVisibleInSupport: true,
      permissions: [],
      updatedAt: now,
    },
    {
      id: 'rank-exams-content',
      slug: 'exams_content',
      nameAr: 'مسؤول الاختبارات والمحتوى',
      nameEn: 'Exams & Content Officer',
      description: 'متابعة بنوك الأسئلة والاختبارات والملخصات الدراسية.',
      badgeIcon: 'clipboard-check',
      badgeColor: 'rose',
      displayOrder: 7,
      isSuperAdminRank: false,
      isVisibleInSupport: true,
      permissions: [],
      updatedAt: now,
    },
  ];
}

export function isUserSuperAdmin(user: User | undefined): boolean {
  if (!user || user.role !== 'admin') return false;
  if (user.adminRankId === 'rank-super-admin') return true;
  if (user.isProtected && !user.adminRankId) return true;
  return false;
}

export function getUserEffectiveRank(user: User | undefined): AdminRank | undefined {
  if (!user || user.role !== 'admin') return undefined;
  const store = db.get();
  const ranks = store.adminRanks || [];
  if (user.adminRankId) {
    return ranks.find((r) => r.id === user.adminRankId);
  }
  if (user.isProtected) {
    return ranks.find((r) => r.isSuperAdminRank || r.id === 'rank-super-admin');
  }
  return undefined;
}

export function getUserPermissions(user: User | undefined): AdminPermissionKey[] {
  if (!user || user.role !== 'admin') return [];
  if (isUserSuperAdmin(user)) {
    return [...ALL_ADMIN_PERMISSIONS];
  }
  const rank = getUserEffectiveRank(user);
  if (!rank) return [];
  return Array.isArray(rank.permissions)
    ? rank.permissions.filter((p) => p !== 'manage_ranks')
    : [];
}

export function hasUserPermission(
  user: User | undefined,
  permission: AdminPermissionKey
): boolean {
  if (!user || user.role !== 'admin') return false;
  if (isUserSuperAdmin(user)) return true;
  return getUserPermissions(user).includes(permission);
}

export function getUserRankBadge(user: User | undefined): UserRankBadge | undefined {
  const rank = getUserEffectiveRank(user);
  if (!rank) return undefined;
  return {
    rankId: rank.id,
    nameAr: rank.nameAr,
    nameEn: rank.nameEn,
    badgeIcon: rank.badgeIcon,
    badgeColor: rank.badgeColor,
    isSuperAdminRank: rank.isSuperAdminRank,
  };
}

export function toSafeUser(user: User): SafeUser {
  const {
    passwordHash: _ignored,
    emailVerificationTokenHash: _ignoredToken,
    emailVerificationExpiresAt: _ignoredExpiry,
    ...safe
  } = user;
  const superAdmin = isUserSuperAdmin(user);
  const rank = getUserEffectiveRank(user);
  const rankBadge = rank
    ? {
        rankId: rank.id,
        nameAr: rank.nameAr,
        nameEn: rank.nameEn,
        badgeIcon: rank.badgeIcon,
        badgeColor: rank.badgeColor,
        isSuperAdminRank: rank.isSuperAdminRank,
      }
    : undefined;

  return {
    ...safe,
    email: safe.email || '',
    phone: safe.phone || '',
    adminRankId: rank?.id || safe.adminRankId,
    isSuperAdmin: superAdmin,
    permissions: getUserPermissions(user),
    rankBadge,
    emailVerified: Boolean(safe.emailVerified),
    lastLoginAt: safe.lastLoginAt,
  };
}

export function toLeaderboardUser(user: User): SafeUser {
  return {
    id: user.id,
    name: user.name,
    email: '',
    phone: '',
    year: user.year,
    role: user.role,
    adminRankId: user.role === 'admin' ? getUserEffectiveRank(user)?.id : undefined,
    rankBadge: user.role === 'admin' ? getUserRankBadge(user) : undefined,
    isProtected: false,
    points: user.points,
    quizzesCompleted: user.quizzesCompleted,
    emailVerified: Boolean(user.emailVerified),
    createdAt: user.createdAt,
  };
}

function buildSeedData(): DatabaseSchema {
  const now = new Date().toISOString();
  return {
    users: [],
    sessions: [],
    revokedSessionIds: [],
    courses: [],
    folders: [],
    summaries: [],
    assignments: [],
    quizzes: [],
    quizSubmissions: [],
    announcements: [],
    notifications: [],
    lectures: [],
    lectureProgress: {},
    analytics: { totalVisits: 0, dailyCounts: {}, visitors: {} },
    platformConfig: { whatsappNumber: '01159637247', telegramUrl: 'https://t.me/+201159637247' },
    learningLinks: [],
    groupLinks: [],
    chatMessages: [],
    gpaTables: {},
    studentProgress: {},
    supportTickets: [],
    errorLogs: [],
    maintenance: { enabled: false, message: 'المنصة تحت التحديث والتطوير.' },
    adminAuditLogs: [],
    adminRanks: buildDefaultAdminRanks(),
    adminOfficials: [],
    supportTeam: [],
    userProfileNotes: [],
    comprehensiveExams: [],
    comprehensiveSubmissions: [],
  };
}

function normalizeLoadedStore(data: DatabaseSchema): DatabaseSchema {
  if (!Array.isArray(data.users)) data.users = [];
  if (!Array.isArray(data.sessions)) data.sessions = [];
  if (!Array.isArray(data.revokedSessionIds)) data.revokedSessionIds = [];
  if (!data.studentProgress) data.studentProgress = {};
  if (!data.folders) data.folders = [];
  if (!Array.isArray(data.assignments)) data.assignments = [];
  if (!data.announcements) data.announcements = [];
  if (!data.notifications) data.notifications = [];
  if (!data.lectures) data.lectures = [];
  if (!data.lectureProgress) data.lectureProgress = {};
  if (!data.analytics) data.analytics = { totalVisits: 0, dailyCounts: {}, visitors: {} };
  if (!data.platformConfig) data.platformConfig = { whatsappNumber: '01159637247', telegramUrl: '' };
  if (!Array.isArray(data.supportTickets)) data.supportTickets = [];
  if (!Array.isArray(data.errorLogs)) data.errorLogs = [];
  if (!Array.isArray(data.adminAuditLogs)) data.adminAuditLogs = [];
  if (!Array.isArray(data.adminRanks) || data.adminRanks.length === 0) {
    data.adminRanks = buildDefaultAdminRanks();
  }
  if (!Array.isArray(data.adminOfficials)) data.adminOfficials = [];
  if (!Array.isArray(data.supportTeam)) data.supportTeam = [];
  if (!Array.isArray(data.userProfileNotes)) data.userProfileNotes = [];
  if (!Array.isArray(data.comprehensiveExams)) data.comprehensiveExams = [];
  if (!Array.isArray(data.comprehensiveSubmissions)) data.comprehensiveSubmissions = [];
  return data;
}

class MafiaStore {
  private data: DatabaseSchema;
  private dirty = false;
  private remoteVersion = 0;
  private lastSyncFailed = false;
  private syncPromise: Promise<void> | null = null;
  private flushPromise: Promise<void> | null = null;

  constructor() {
    for (const dir of [DATA_DIR, UPLOADS_DIR, BACKUPS_DIR]) {
      try {
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
      } catch {}
    }

    const seedSource = fs.existsSync(DB_FILE)
      ? DB_FILE
      : IS_VERCEL && fs.existsSync(BUNDLED_DB_FILE)
      ? BUNDLED_DB_FILE
      : null;

    if (seedSource) {
      try {
        const raw = fs.readFileSync(seedSource, 'utf-8');
        this.data = normalizeLoadedStore(JSON.parse(raw) as DatabaseSchema);
      } catch {
        this.data = buildSeedData();
      }
    } else {
      this.data = buildSeedData();
    }
  }

  private writeLocalCache(): void {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const tmpFile = `${DB_FILE}.tmp`;
      fs.writeFileSync(tmpFile, JSON.stringify(this.data, null, 2), 'utf-8');
      fs.renameSync(tmpFile, DB_FILE);
    } catch {}
  }

  public get(): DatabaseSchema {
    return this.data;
  }

  public isDirty(): boolean {
    return this.dirty;
  }

  public replaceAll(nextData: DatabaseSchema): void {
    this.data = normalizeLoadedStore(nextData);
    this.save();
  }

  public save(): void {
    this.writeLocalCache();
    this.dirty = true;
  }

  public async ensureRemoteSynced(): Promise<void> {
    if (!isSupabaseDbEnabled()) return;
    if (this.syncPromise) return this.syncPromise;

    this.syncPromise = (async () => {
      try {
        const res = await loadLatestStateFromSupabase(this.remoteVersion);
        if (res.status === 'error') {
          this.lastSyncFailed = true;
          return;
        }
        this.lastSyncFailed = false;
        if (res.status === 'updated' && res.data) {
          const remoteNormalized = normalizeLoadedStore(res.data);
          if (this.dirty) {
            // Preserve locally created users/sessions during concurrent request flushes
            const remoteUserIds = new Set(remoteNormalized.users.map((u) => u.id));
            for (const localUser of this.data.users) {
              if (!remoteUserIds.has(localUser.id)) {
                remoteNormalized.users.push(localUser);
              }
            }
            const revokedSet = new Set([
              ...(remoteNormalized.revokedSessionIds || []),
              ...(this.data.revokedSessionIds || []),
            ]);
            remoteNormalized.revokedSessionIds = Array.from(revokedSet).slice(-500);
            const remoteTokens = new Set(remoteNormalized.sessions.map((s) => s.token));
            for (const localSession of this.data.sessions) {
              if (!remoteTokens.has(localSession.token)) {
                remoteNormalized.sessions.push(localSession);
              }
            }
          }
          this.data = remoteNormalized;
          this.remoteVersion = res.version;
          this.writeLocalCache();
        }
      } catch (err) {
        this.lastSyncFailed = true;
        console.error('Failed to sync state from Supabase:', err);
      } finally {
        this.syncPromise = null;
      }
    })();

    return this.syncPromise;
  }

  public async flushToRemote(): Promise<void> {
    if (!isSupabaseDbEnabled() || !this.dirty) return;
    if (this.flushPromise) return this.flushPromise;

    this.flushPromise = (async () => {
      try {
        // Prevent a cold/failed-sync lambda from overwriting remote state with seed data
        if (this.lastSyncFailed || this.remoteVersion === 0) {
          const preCheck = await loadLatestStateFromSupabase(0);
          if (preCheck.status === 'error') {
            this.lastSyncFailed = true;
            return;
          }
          this.lastSyncFailed = false;
          if (preCheck.status === 'updated' && preCheck.data) {
            const remoteStore = normalizeLoadedStore(preCheck.data);
            const mergedUsers = [...remoteStore.users];
            const remoteUserIds = new Set(mergedUsers.map((u) => u.id));
            for (const u of this.data.users) {
              const idx = mergedUsers.findIndex((ru) => ru.id === u.id);
              if (idx >= 0) {
                mergedUsers[idx] = u;
              } else if (!remoteUserIds.has(u.id)) {
                mergedUsers.push(u);
              }
            }
            const mergedTokens = new Set(this.data.sessions.map((s) => s.token));
            const mergedSessions = [...this.data.sessions];
            for (const rs of remoteStore.sessions) {
              if (!mergedTokens.has(rs.token)) {
                mergedSessions.push(rs);
              }
            }
            this.data.users = mergedUsers;
            this.data.sessions = mergedSessions;
            if (!this.data.platformConfig?.sessionSigningSecret && remoteStore.platformConfig?.sessionSigningSecret) {
              this.data.platformConfig = {
                whatsappNumber: this.data.platformConfig?.whatsappNumber || remoteStore.platformConfig.whatsappNumber || '',
                telegramUrl: this.data.platformConfig?.telegramUrl || remoteStore.platformConfig.telegramUrl || '',
                ...this.data.platformConfig,
                sessionSigningSecret: remoteStore.platformConfig.sessionSigningSecret,
              };
            }
            this.remoteVersion = preCheck.version;
          }
        }

        const nextVer = this.remoteVersion + 1;
        const success = await saveStateToSupabase(this.data, nextVer);
        if (success) {
          this.remoteVersion = nextVer;
          this.dirty = false;
        }
      } catch (err) {
        console.error('Failed to flush state to Supabase:', err);
      } finally {
        this.flushPromise = null;
      }
    })();

    return this.flushPromise;
  }

  public async flushRemoteIfDirty(): Promise<void> {
    return this.flushToRemote();
  }
}

export const db = new MafiaStore();

export function recordAdminAudit(params: {
  actorId: string;
  actorName: string;
  action: AdminAuditAction;
  targetUserId?: string;
  targetUserName?: string;
  details?: string;
  ip?: string;
}): void {
  const store = db.get();
  if (!Array.isArray(store.adminAuditLogs)) {
    store.adminAuditLogs = [];
  }
  const log: AdminAuditLog = {
    id: `audit-${crypto.randomUUID()}`,
    actorId: params.actorId,
    actorName: params.actorName,
    action: params.action,
    targetUserId: params.targetUserId,
    targetUserName: params.targetUserName,
    details: params.details,
    ip: params.ip || 'unknown',
    createdAt: new Date().toISOString(),
  };
  store.adminAuditLogs.unshift(log);
  if (store.adminAuditLogs.length > 500) {
    store.adminAuditLogs = store.adminAuditLogs.slice(0, 500);
  }
  db.save();
}

export function pushNotification(params: {
  title: string;
  message: string;
  type: NotificationItem['type'];
  targetSection: NotificationItem['targetSection'];
  year: AcademicYear | 0;
  userId?: string;
  comprehensiveExamId?: string;
  createdBy: string;
}): NotificationItem {
  const store = db.get();
  if (!Array.isArray(store.notifications)) {
    store.notifications = [];
  }
  const item: NotificationItem = {
    id: `notif-${crypto.randomUUID()}`,
    title: params.title,
    message: params.message,
    type: params.type,
    targetSection: params.targetSection,
    year: params.year,
    userId: params.userId,
    comprehensiveExamId: params.comprehensiveExamId,
    readBy: [],
    createdBy: params.createdBy,
    createdAt: new Date().toISOString(),
  };
  store.notifications.unshift(item);
  if (store.notifications.length > 200) {
    store.notifications = store.notifications.slice(0, 200);
  }
  db.save();
  return item;
}

export interface BackupSnapshotInfo {
  filename: string;
  size: number;
  createdAt: string;
}

export function createBackupSnapshot(reason = 'manual'): BackupSnapshotInfo {
  if (!fs.existsSync(BACKUPS_DIR)) {
    fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  }
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const safeReason = reason.replace(/[^a-zA-Z0-9_-]/g, '') || 'manual';
  const filename = `mvia-backup-${ts}-${safeReason}.json`;
  const filePath = path.join(BACKUPS_DIR, filename);
  const content = JSON.stringify(db.get(), null, 2);
  fs.writeFileSync(filePath, content, 'utf-8');
  const stat = fs.statSync(filePath);
  return {
    filename,
    size: stat.size,
    createdAt: stat.birthtime ? stat.birthtime.toISOString() : new Date().toISOString(),
  };
}

export function listBackupSnapshots(): BackupSnapshotInfo[] {
  if (!fs.existsSync(BACKUPS_DIR)) return [];
  const files = fs
    .readdirSync(BACKUPS_DIR)
    .filter((f) => f.endsWith('.json'));
  const items: BackupSnapshotInfo[] = [];
  for (const filename of files) {
    try {
      const stat = fs.statSync(path.join(BACKUPS_DIR, filename));
      items.push({
        filename,
        size: stat.size,
        createdAt: stat.mtime ? stat.mtime.toISOString() : new Date().toISOString(),
      });
    } catch {
      // Skip unreadable entry
    }
  }
  items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return items;
}

export function getBackupFilePath(filename: string): string | null {
  if (!filename || !/^[a-zA-Z0-9._-]+\.json$/.test(filename)) {
    return null;
  }
  const resolved = path.resolve(BACKUPS_DIR, filename);
  if (!resolved.startsWith(path.resolve(BACKUPS_DIR) + path.sep)) {
    return null;
  }
  return fs.existsSync(resolved) ? resolved : null;
}

export function validateBackupSchema(data: unknown): data is DatabaseSchema {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  const candidate = data as Record<string, unknown>;
  const requiredArrays = [
    'users',
    'sessions',
    'courses',
    'summaries',
    'quizzes',
    'quizSubmissions',
    'learningLinks',
    'groupLinks',
    'chatMessages',
  ];
  for (const key of requiredArrays) {
    if (!Array.isArray(candidate[key])) return false;
  }
  if (!candidate.gpaTables || typeof candidate.gpaTables !== 'object' || Array.isArray(candidate.gpaTables)) {
    return false;
  }
  return true;
}

export function restoreBackupSnapshot(candidate: DatabaseSchema): {
  preRestoreBackup: BackupSnapshotInfo;
} {
  const preRestoreBackup = createBackupSnapshot('pre-restore');
  db.replaceAll(candidate);
  return { preRestoreBackup };
}

export function recordAppError(params: {
  source: 'client' | 'server' | 'ai';
  message: string;
  stack?: string;
  path?: string;
  userId?: string;
  notifyAdmin?: boolean;
}): void {
  try {
    const store = db.get();
    if (!Array.isArray(store.errorLogs)) {
      store.errorLogs = [];
    }
    const errorLog: AppErrorLog = {
      id: `err-${crypto.randomUUID()}`,
      source: params.source,
      message: params.message,
      stack: params.stack,
      path: params.path,
      userId: params.userId,
      notifyAdmin: Boolean(params.notifyAdmin),
      resolved: false,
      createdAt: new Date().toISOString(),
    };
    store.errorLogs.unshift(errorLog);
    if (store.errorLogs.length > 200) {
      store.errorLogs = store.errorLogs.slice(0, 200);
    }
    db.save();
  } catch {}
}
