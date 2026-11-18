import {
  Award,
  Crown,
  Eye,
  RefreshCw,
  Search,
  ShieldCheck,
  Trophy,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import type { User } from '../../types';
import { apiRequest } from '../../utils/api';
import { hasAnyAdminPermission } from '../../utils/permissions';
import { AdminUserProfileModal } from '../home/AdminUserProfileModal';
import { RankBadge } from './RankBadge';

interface HonorBoardModalProps {
  open: boolean;
  onClose: () => void;
}

export function HonorBoardModal({ open, onClose }: HonorBoardModalProps) {
  const { user: currentUser } = useAuth();
  const { tr, formatYear } = useLanguage();

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedYear, setSelectedYear] = useState<number>(0);
  const [search, setSearch] = useState('');
  const [profileTargetId, setProfileTargetId] = useState<string | null>(null);

  const isAdmin = currentUser?.role === 'admin';
  const canInspectProfiles = hasAnyAdminPermission(currentUser, [
    'manage_students',
    'manage_user_notes',
  ]);

  const fetchAllRanked = useCallback(async () => {
    setLoading(true);
    try {
      const targetYear = isAdmin ? selectedYear : currentUser?.year || 0;
      const scopeParam = isAdmin ? '' : '&scope=honor';
      const res = await apiRequest<{ users: User[] }>(
        `/api/users?year=${targetYear}${scopeParam}`
      );
      setUsers(Array.isArray(res.users) ? res.users : []);
    } catch {
      // Keep existing state if temporary error occurs
    } finally {
      setLoading(false);
    }
  }, [isAdmin, selectedYear, currentUser?.year]);

  useEffect(() => {
    if (!open) return;
    void fetchAllRanked();
  }, [open, fetchAllRanked]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !profileTargetId) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose, profileTargetId]);

  const rankedList = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users
      .map((u, index) => ({ user: u, globalRank: index + 1 }))
      .filter(({ user: u }) => {
        if (!q) return true;
        if (isAdmin) {
          return `${u.name} ${u.email || ''} ${u.phone || ''}`.toLowerCase().includes(q);
        }
        return u.name.toLowerCase().includes(q);
      });
  }, [users, search, isAdmin]);

  if (!open) return null;

  const yearFilters: Array<{ value: number; label: string }> = [
    { value: 0, label: tr('الكل', 'All') },
    { value: 1, label: tr('الفرقة 1', 'Year 1') },
    { value: 2, label: tr('الفرقة 2', 'Year 2') },
    { value: 3, label: tr('الفرقة 3', 'Year 3') },
    { value: 4, label: tr('الفرقة 4', 'Year 4') },
  ];

  return (
    <>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={tr('لوحة الشرف والمتصدرين', 'Honor Board & Leaderboard')}
        className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-5"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="w-full max-w-4xl max-h-[88vh] flex flex-col rounded-2xl bg-[#121216] border border-[#D4AF37]/35 shadow-[0_24px_90px_rgba(0,0,0,0.9)] overflow-hidden">
          {/* Header */}
          <div className="px-5 py-4 border-b border-white/10 bg-[#16161C] flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-[#D4AF37]/15 border border-[#D4AF37]/45 flex items-center justify-center text-[#F5D061] shrink-0">
                <Trophy className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="font-display text-lg sm:text-xl font-bold text-[#F7F3EB]">
                    {tr('لوحة الشرف — المتصدرين', 'Honor Board — All Rankings')}
                  </h2>
                  <span className="px-2 py-0.5 rounded-md bg-[#D4AF37]/15 border border-[#D4AF37]/35 text-xs font-mono tabular-nums text-[#F5D061]">
                    {users.length} {tr('مسجل', 'registered')}
                  </span>
                </div>
                <p className="text-xs text-[#C9C2B8]">
                  {isAdmin
                    ? tr(
                        'عرض الإدارة الكامل: الترتيب والأسماء والنقاط وكافة بيانات المسجلين.',
                        'Admin full view: rankings, names, points, and complete registered user details.'
                      )
                    : tr(
                        `لوحة شرف ${currentUser?.year ? formatYear(currentUser.year) : 'دفعتك'} — يظهر مسجلو فرقتك الدراسية فقط (الأسماء والنقاط).`,
                        `${currentUser?.year ? formatYear(currentUser.year) : 'Your Batch'} Honor Board — only your batch members appear (names and points).`
                      )}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => void fetchAllRanked()}
                disabled={loading}
                title={tr('تحديث الترتيب', 'Refresh Rankings')}
                className="p-2 rounded-lg bg-[#1C1C22] border border-white/10 text-[#DFD9CF] hover:text-[#F5D061] hover:border-[#D4AF37]/50 transition-colors cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
              <button
                type="button"
                onClick={onClose}
                aria-label={tr('إغلاق', 'Close')}
                className="p-2 rounded-lg bg-[#1C1C22] border border-white/10 text-[#DFD9CF] hover:text-white hover:border-white/25 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Search & Year filter bar */}
          <div className="px-5 py-3 border-b border-white/10 bg-[#121216] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-4 h-4 text-[#C9C2B8] absolute top-1/2 -translate-y-1/2 start-3 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={
                  isAdmin
                    ? tr('ابحث بالاسم أو البريد أو الهاتف...', 'Search name, email, or phone...')
                    : tr('ابحث بالاسم...', 'Search by name...')
                }
                className="w-full ps-9 pe-3 py-2 rounded-xl bg-[#0D0D11] border border-white/10 text-sm text-[#F7F3EB] focus:outline-none focus:border-[#D4AF37]/60"
              />
            </div>

            {isAdmin ? (
              <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                {yearFilters.map((f) => (
                  <button
                    key={f.value}
                    type="button"
                    onClick={() => setSelectedYear(f.value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                      selectedYear === f.value
                        ? 'bg-[#D4AF37] text-[#09090B]'
                        : 'bg-[#1A1A20] text-[#DFD9CF] border border-white/10 hover:border-[#D4AF37]/40'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            ) : (
              currentUser?.year && (
                <span className="px-3 py-1.5 rounded-lg bg-[#D4AF37]/15 border border-[#D4AF37]/35 text-xs font-semibold text-[#F5D061] whitespace-nowrap">
                  {formatYear(currentUser.year)}
                </span>
              )
            )}
          </div>

          {/* Leaderboard Table */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-5">
            {loading && users.length === 0 ? (
              <div className="space-y-2.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <div key={n} className="h-12 rounded-xl bg-white/5 animate-pulse" />
                ))}
              </div>
            ) : rankedList.length === 0 ? (
              <div className="py-12 text-center text-sm text-[#C9C2B8]">
                {tr('لا توجد نتائج مطابقة.', 'No matching entries found.')}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-start border-collapse">
                  <thead>
                    <tr className="border-b border-white/10 text-xs text-[#C9C2B8]">
                      <th className="py-3 px-3 font-semibold">{tr('الترتيب', 'Rank')}</th>
                      <th className="py-3 px-3 font-semibold">{tr('الاسم', 'Name')}</th>
                      {isAdmin && (
                        <>
                          <th className="py-3 px-3 font-semibold">{tr('الدور / الرتبة', 'Role')}</th>
                          <th className="py-3 px-3 font-semibold">{tr('البريد', 'Email')}</th>
                          <th className="py-3 px-3 font-semibold">{tr('الهاتف', 'Phone')}</th>
                          <th className="py-3 px-3 font-semibold">{tr('الفرقة', 'Year')}</th>
                          <th className="py-3 px-3 font-semibold text-center">{tr('الاختبارات', 'Quizzes')}</th>
                        </>
                      )}
                      <th className="py-3 px-3 font-semibold text-end">{tr('النقاط', 'Points')}</th>
                      {isAdmin && canInspectProfiles && (
                        <th className="py-3 px-3 font-semibold text-end">{tr('تفاصيل', 'Profile')}</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-sm">
                    {rankedList.map(({ user: entry, globalRank }) => {
                      const isMe = entry.id === currentUser?.id;
                      return (
                        <tr
                          key={entry.id}
                          className={`transition-colors ${
                            isMe
                              ? 'bg-[#D4AF37]/12'
                              : globalRank === 1
                              ? 'bg-amber-500/[0.06]'
                              : 'hover:bg-white/[0.03]'
                          }`}
                        >
                          <td className="py-3 px-3 font-mono tabular-nums font-bold">
                            {globalRank === 1 ? (
                              <span className="inline-flex items-center gap-1.5 text-[#F5D061]">
                                <Crown className="w-4 h-4" />
                                <span>#1</span>
                              </span>
                            ) : globalRank <= 3 ? (
                              <span
                                className={`inline-flex items-center gap-1.5 ${
                                  globalRank === 2 ? 'text-zinc-200' : 'text-amber-500'
                                }`}
                              >
                                <Award className="w-4 h-4" />
                                <span>#{globalRank}</span>
                              </span>
                            ) : (
                              <span className="text-[#C9C2B8]">#{globalRank}</span>
                            )}
                          </td>

                          <td className="py-3 px-3 font-semibold text-[#F7F3EB]">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span>{entry.name}</span>
                              {isMe && (
                                <span className="text-xs font-bold text-[#F5D061]">
                                  {tr('(أنت)', '(You)')}
                                </span>
                              )}
                            </div>
                          </td>

                          {isAdmin && (
                            <>
                              <td className="py-3 px-3">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {entry.rankBadge ? (
                                    <RankBadge rankBadge={entry.rankBadge} size="xs" />
                                  ) : entry.role === 'admin' ? (
                                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#F5D061]">
                                      <ShieldCheck className="w-3.5 h-3.5" />
                                      {tr('أدمن', 'Admin')}
                                    </span>
                                  ) : entry.role === 'teacher' ? (
                                    <span className="text-xs font-semibold text-sky-300">
                                      {tr('معلم', 'Teacher')}
                                    </span>
                                  ) : (
                                    <span className="text-xs text-[#C9C2B8]">
                                      {tr('طالب', 'Student')}
                                    </span>
                                  )}
                                  {entry.isSuspended && (
                                    <span className="px-1.5 py-0.5 rounded bg-red-500/20 border border-red-500/40 text-xs text-red-300">
                                      {tr('معلق', 'Suspended')}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="py-3 px-3 text-xs font-mono text-[#DFD9CF]">
                                {entry.email || '—'}
                              </td>
                              <td className="py-3 px-3 text-xs font-mono tabular-nums text-[#DFD9CF]">
                                {entry.phone || '—'}
                              </td>
                              <td className="py-3 px-3 text-xs text-[#DFD9CF]">
                                {formatYear(entry.year)}
                              </td>
                              <td className="py-3 px-3 text-center font-mono tabular-nums text-[#DFD9CF]">
                                {entry.quizzesCompleted}
                              </td>
                            </>
                          )}

                          <td className="py-3 px-3 text-end font-mono tabular-nums font-bold text-[#F5D061]">
                            {entry.points}
                          </td>

                          {isAdmin && canInspectProfiles && (
                            <td className="py-3 px-3 text-end">
                              <button
                                type="button"
                                onClick={() => setProfileTargetId(entry.id)}
                                title={tr('عرض البروفايل الكامل', 'View Full Profile')}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#1A1A20] border border-[#D4AF37]/35 text-xs text-[#F5D061] hover:bg-[#D4AF37] hover:text-[#09090B] transition-colors cursor-pointer"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>{tr('عرض', 'View')}</span>
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      <AdminUserProfileModal
        open={Boolean(profileTargetId)}
        targetUserId={profileTargetId}
        onClose={() => setProfileTargetId(null)}
      />
    </>
  );
}
