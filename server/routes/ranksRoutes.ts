import crypto from 'crypto';
import { Router } from 'express';
import {
  requireAnyPermission,
  requireAuth,
  requirePermission,
  requireSuperAdmin,
} from '../auth.js';
import type { AuthenticatedRequest } from '../auth.js';
import {
  ADMIN_PERMISSIONS_CATALOG,
  ALL_ADMIN_PERMISSIONS,
  db,
  hashPassword,
  isUserSuperAdmin,
  recordAdminAudit,
} from '../db.js';
import type {
  AdminOfficial,
  AdminPermissionKey,
  AdminRankColor,
  AdminRankIcon,
  SupportTeamMember,
} from '../types.js';

const MAX_SUPPORT_TEAM_SIZE = 7;

const router = Router();

const VALID_BADGE_ICONS = new Set<AdminRankIcon>([
  'crown',
  'medal',
  'cpu',
  'graduation-cap',
  'users',
  'headset',
  'clipboard-check',
]);

const VALID_BADGE_COLORS = new Set<AdminRankColor>([
  'gold',
  'silver',
  'sky',
  'emerald',
  'violet',
  'amber',
  'rose',
]);

function normalizeWhatsappNumber(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  return digits;
}

function isValidWhatsappNumber(raw: string): boolean {
  const digits = normalizeWhatsappNumber(raw);
  return digits.length >= 8 && digits.length <= 16;
}

function formatWhatsappLink(raw: string): string {
  const digits = normalizeWhatsappNumber(raw);
  if (digits.startsWith('00')) {
    return `https://wa.me/${digits.slice(2)}`;
  }
  if (digits.startsWith('0') && digits.length === 11) {
    return `https://wa.me/2${digits}`;
  }
  return `https://wa.me/${digits}`;
}

function getClientIp(req: AuthenticatedRequest): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.trim()) {
    return fwd.split(',')[0].trim();
  }
  return req.ip || 'unknown';
}

router.get('/support/directory', requireAuth, (_req: AuthenticatedRequest, res) => {
  const store = db.get();
  const ranks = [...(store.adminRanks || [])].sort(
    (a, b) => a.displayOrder - b.displayOrder
  );
  const officials = store.adminOfficials || [];

  const leaderOfficial = officials.find(
    (o) => o.rankId === 'rank-super-admin' && o.isActive
  );
  const founderUser = store.users.find(
    (u) => u.isProtected && u.role === 'admin'
  );
  const rawLeaderWhatsapp =
    (leaderOfficial && isValidWhatsappNumber(leaderOfficial.whatsappNumber)
      ? leaderOfficial.whatsappNumber
      : store.platformConfig?.whatsappNumber) || '';
  const leaderHasWhatsapp = isValidWhatsappNumber(rawLeaderWhatsapp);

  const leader = {
    id: 'platform-leader',
    displayName: leaderOfficial?.displayName || founderUser?.name || 'ليدر المنصة',
    titleAr: 'ليدر المنصة',
    titleEn: 'Platform Leader',
    urgencyNoteAr: 'للضرورة',
    urgencyNoteEn: 'Urgent Only',
    hasWhatsapp: leaderHasWhatsapp,
    whatsappUrl: leaderHasWhatsapp ? formatWhatsappLink(rawLeaderWhatsapp) : undefined,
  };

  const publicSupportTeam = [...(store.supportTeam || [])]
    .filter((m) => m.isActive)
    .sort((a, b) => a.slotNumber - b.slotNumber)
    .slice(0, MAX_SUPPORT_TEAM_SIZE)
    .map((m) => {
      const validWa = isValidWhatsappNumber(m.whatsappNumber);
      return {
        id: m.id,
        slotNumber: m.slotNumber,
        userId: m.userId,
        displayName: m.displayName,
        specialty: m.specialty || undefined,
        hasWhatsapp: validWa,
        whatsappUrl: validWa ? formatWhatsappLink(m.whatsappNumber) : undefined,
      };
    });

  const publicRanks = ranks
    .filter((rank) => rank.isVisibleInSupport !== false)
    .map((rank) => {
      const activeOfficials = officials
        .filter((o) => o.rankId === rank.id && o.isActive && o.showInSupport)
        .map((o) => {
          const validWa = isValidWhatsappNumber(o.whatsappNumber);
          return {
            id: o.id,
            rankId: o.rankId,
            displayName: o.displayName,
            titleNote: o.titleNote || undefined,
            hasWhatsapp: validWa,
            whatsappUrl: validWa ? formatWhatsappLink(o.whatsappNumber) : undefined,
          };
        });

      return {
        id: rank.id,
        slug: rank.slug,
        nameAr: rank.nameAr,
        nameEn: rank.nameEn,
        description: rank.description,
        badgeIcon: rank.badgeIcon,
        badgeColor: rank.badgeColor,
        displayOrder: rank.displayOrder,
        isSuperAdminRank: rank.isSuperAdminRank,
        officials: activeOfficials,
      };
    });

  res.json({ leader, supportTeam: publicSupportTeam, ranks: publicRanks });
});

router.post('/support/leader/whatsapp-link', requireAuth, (_req: AuthenticatedRequest, res) => {
  const store = db.get();
  const leaderOfficial = (store.adminOfficials || []).find(
    (o) => o.rankId === 'rank-super-admin' && o.isActive
  );
  const rawWhatsapp =
    (leaderOfficial && isValidWhatsappNumber(leaderOfficial.whatsappNumber)
      ? leaderOfficial.whatsappNumber
      : store.platformConfig?.whatsappNumber) || '';

  if (!isValidWhatsappNumber(rawWhatsapp)) {
    res.status(400).json({ error: 'لم يتم إضافة رقم واتساب لليدر المنصة بعد.' });
    return;
  }

  res.json({
    whatsappUrl: formatWhatsappLink(rawWhatsapp),
    displayName: leaderOfficial?.displayName || 'ليدر المنصة',
    urgencyNote: 'للضرورة',
  });
});

router.post(
  '/support/team/:id/whatsapp-link',
  requireAuth,
  (req: AuthenticatedRequest, res) => {
    const { id } = req.params;
    const store = db.get();
    const member = (store.supportTeam || []).find((m) => m.id === id);

    if (!member || !member.isActive) {
      res.status(404).json({ error: 'عضو الدعم الفني غير متاح حالياً.' });
      return;
    }

    if (!isValidWhatsappNumber(member.whatsappNumber)) {
      res.status(400).json({ error: 'لم يتم إضافة رقم واتساب لهذا العضو بعد.' });
      return;
    }

    res.json({
      whatsappUrl: formatWhatsappLink(member.whatsappNumber),
      displayName: member.displayName,
      specialty: member.specialty,
      slotNumber: member.slotNumber,
    });
  }
);

router.post(
  '/support/officials/:id/whatsapp-link',
  requireAuth,
  (req: AuthenticatedRequest, res) => {
    const { id } = req.params;
    const store = db.get();
    const official = (store.adminOfficials || []).find((o) => o.id === id);

    if (!official || !official.isActive || !official.showInSupport) {
      res.status(404).json({ error: 'هذا المسؤول غير متاح حالياً في مركز الدعم.' });
      return;
    }

    const rank = (store.adminRanks || []).find((r) => r.id === official.rankId);
    if (!rank || rank.isVisibleInSupport === false) {
      res.status(404).json({ error: 'هذا القسم الإداري مخفي حالياً من مركز الدعم.' });
      return;
    }

    if (!isValidWhatsappNumber(official.whatsappNumber)) {
      res.status(400).json({ error: 'وسيلة التواصل عبر واتساب غير مكتملة لهذا المسؤول.' });
      return;
    }

    res.json({
      whatsappUrl: formatWhatsappLink(official.whatsappNumber),
      officialName: official.displayName,
      rankNameAr: rank.nameAr,
      rankNameEn: rank.nameEn,
    });
  }
);

router.get(
  '/admin/ranks',
  requireAuth,
  requireAnyPermission('manage_officials', 'manage_support'),
  (req: AuthenticatedRequest, res) => {
    const store = db.get();
    const callerIsSuperAdmin = isUserSuperAdmin(req.currentUser);
    const ranks = [...(store.adminRanks || [])].sort(
      (a, b) => a.displayOrder - b.displayOrder
    );

    const officials = (store.adminOfficials || []).map((o) => {
      const isProtectedRank =
        o.rankId === 'rank-super-admin' || o.rankId === 'rank-deputy-director';
      if (!callerIsSuperAdmin && isProtectedRank) {
        return {
          ...o,
          whatsappNumber: '********',
        };
      }
      return o;
    });

    const supportTeam = [...(store.supportTeam || [])].sort(
      (a, b) => a.slotNumber - b.slotNumber
    );

    const candidates = (store.users || []).map((u) => ({
      id: u.id,
      name: u.name,
      role: u.role,
      year: u.year,
      adminRankId: u.adminRankId,
      isProtected: u.isProtected,
      isSuspended: Boolean(u.isSuspended),
    }));

    res.json({
      ranks,
      officials,
      supportTeam,
      maxSupportTeamSize: MAX_SUPPORT_TEAM_SIZE,
      candidates,
      permissionsCatalog: ADMIN_PERMISSIONS_CATALOG,
      canEditRanks: callerIsSuperAdmin,
      canManageOfficials: true,
    });
  }
);

router.patch(
  '/admin/ranks/:rankId',
  requireAuth,
  requireSuperAdmin,
  (req: AuthenticatedRequest, res) => {
    const { rankId } = req.params;
    const {
      nameAr,
      nameEn,
      description,
      badgeIcon,
      badgeColor,
      isVisibleInSupport,
      permissions,
    } = req.body as {
      nameAr?: string;
      nameEn?: string;
      description?: string;
      badgeIcon?: AdminRankIcon;
      badgeColor?: AdminRankColor;
      isVisibleInSupport?: boolean;
      permissions?: AdminPermissionKey[];
    };

    const store = db.get();
    const rank = (store.adminRanks || []).find((r) => r.id === rankId);
    if (!rank) {
      res.status(404).json({ error: 'الرتبة الإدارية غير موجودة.' });
      return;
    }

    if (typeof nameAr === 'string' && nameAr.trim().length >= 2) {
      rank.nameAr = nameAr.trim().slice(0, 80);
    }
    if (typeof nameEn === 'string' && nameEn.trim().length >= 2) {
      rank.nameEn = nameEn.trim().slice(0, 80);
    }
    if (typeof description === 'string') {
      rank.description = description.trim().slice(0, 240);
    }
    if (badgeIcon && VALID_BADGE_ICONS.has(badgeIcon)) {
      rank.badgeIcon = badgeIcon;
    }
    if (badgeColor && VALID_BADGE_COLORS.has(badgeColor)) {
      rank.badgeColor = badgeColor;
    }
    if (typeof isVisibleInSupport === 'boolean') {
      rank.isVisibleInSupport = isVisibleInSupport;
    }

    if (Array.isArray(permissions)) {
      if (rank.isSuperAdminRank || rank.id === 'rank-super-admin') {
        rank.permissions = [...ALL_ADMIN_PERMISSIONS];
      } else {
        const validSet = new Set<AdminPermissionKey>(ALL_ADMIN_PERMISSIONS);
        rank.permissions = Array.from(
          new Set(
            permissions.filter(
              (p): p is AdminPermissionKey =>
                validSet.has(p) && p !== 'manage_ranks'
            )
          )
        );
      }
    }

    rank.updatedAt = new Date().toISOString();
    db.save();

    recordAdminAudit({
      actorId: req.currentUser!.id,
      actorName: req.currentUser!.name,
      action: 'rank.update',
      details: `Updated rank ${rank.nameAr} (${rank.id}) — permissions: ${rank.permissions.length}`,
      ip: getClientIp(req),
    });

    res.json({ rank });
  }
);

router.post(
  '/admin/officials',
  requireAuth,
  requirePermission('manage_officials'),
  (req: AuthenticatedRequest, res) => {
    const {
      userId,
      rankId,
      displayName,
      whatsappNumber,
      titleNote,
      showInSupport,
      isActive,
    } = req.body as {
      userId?: string;
      rankId?: string;
      displayName?: string;
      whatsappNumber?: string;
      titleNote?: string;
      showInSupport?: boolean;
      isActive?: boolean;
    };

    if (!userId?.trim() || !rankId?.trim()) {
      res.status(400).json({
        error: 'يرجى تحديد المستخدم والرتبة الإدارية.',
      });
      return;
    }

    const hasRawWhatsapp = Boolean(whatsappNumber?.trim());
    if (hasRawWhatsapp && !isValidWhatsappNumber(whatsappNumber!)) {
      res.status(400).json({
        error: 'رقم الواتساب غير صالح (يجب أن يكون من 8 إلى 16 رقماً).',
      });
      return;
    }

    const store = db.get();
    const callerIsSuperAdmin = isUserSuperAdmin(req.currentUser);
    const targetUser = store.users.find((u) => u.id === userId.trim());
    if (!targetUser) {
      res.status(404).json({ error: 'المستخدم المحدد غير موجود في قاعدة البيانات.' });
      return;
    }

    const targetRank = (store.adminRanks || []).find((r) => r.id === rankId.trim());
    if (!targetRank) {
      res.status(404).json({ error: 'الرتبة الإدارية غير موجودة.' });
      return;
    }

    if (targetUser.id === req.currentUser!.id && !callerIsSuperAdmin) {
      res.status(403).json({
        error: 'لا يمكنك تعديل رتبتك أو ترقية نفسك.',
      });
      return;
    }

    if (!callerIsSuperAdmin) {
      if (
        targetRank.isSuperAdminRank ||
        targetRank.id === 'rank-super-admin' ||
        targetRank.id === 'rank-deputy-director'
      ) {
        res.status(403).json({
          error: 'تعيين أو تعديل منصب المدير العام أو نائبه محصور بالمدير العام فقط.',
        });
        return;
      }
      if (targetUser.isProtected || targetUser.adminRankId === 'rank-super-admin') {
        res.status(403).json({
          error: 'لا تملك صلاحية تعديل منصب المدير العام.',
        });
        return;
      }
    }

    if (
      (targetRank.isSuper
