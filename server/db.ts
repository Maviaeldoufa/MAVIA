import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type {
  AdminAuditAction,
  AdminAuditLog,
  AdminOfficial,
  AdminPermissionKey,
  AdminRank,
  AppErrorLog,
  DatabaseSchema,
  SafeUser,
  User,
  UserRankBadge,
} from './types.ts';

import {
  isSupabaseDbEnabled,
  loadLatestStateFromSupabase,
  saveStateToSupabase,
} from './supabase.ts';
import { IS_VERCEL, UPLOADS_DIR } from './storage.ts';
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
  if ((process.env.EMAIL_ENABLED || '').trim().toLowerCase() === 'false') {
    return { enabled: false, apiKey: '', fromEmail: '' };
  }
  const apiKey = process.env.RESEND_API_KEY?.trim() || '';
  const fromEmail = process.env.EMAIL_FROM?.trim() || '';
  if (!apiKey || !fromEmail) {
    return { enabled: false, apiKey: '', fromEmail: '' };
  }
  const match = fromEmail.match(/<([^>]+)>/);
  const addressPart = (match ? match[1] : fromEmail).trim();
  if (!SENDER_EMAIL_REGEX.test(addressPart)) {
    return { enabled: false, apiKey: '', fromEmail: '' };
  }
  return { enabled: true, apiKey, fromEmail };
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

export function buildDefaultAdminRanks(): AdminRank[] {
  const now = new Date().toISOString();
  return [
    {
      id: 'rank-super-admin',
      slug: 'super_admin',
      nameAr: 'المدير العام',
      nameEn: 'Super Admin',
      description: 'القيادة العليا للمنصة مع كامل الصلاحيات.',
      badgeIcon: 'crown',
      badgeColor: 'gold',
      displayOrder: 1,
      isSuperAdminRank: true,
      isVisibleInSupport: true,
      permissions: [...ALL_ADMIN_PERMISSIONS],
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
        if (res.status === 'updated' && res.state) {
          this.data = normalizeLoadedStore(res.state);
          this.remoteVersion = res.version;
          this.writeLocalCache();
        }
      } catch (err) {
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

export function recordAppError(params: {
  source: 'client' | 'server';
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
