import {
  Languages,
  LayoutDashboard,
  LogOut,
  Moon,
  ShieldCheck,
  Sun,
  Trophy,
  UserCog,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useTheme } from '../../context/ThemeContext';
import type { NavSection } from '../../types';
import { AccountModal } from './AccountModal';
import { HonorBoardModal } from './HonorBoardModal';
import { MviaBrandMark } from './MviaBrandMark';
import { NotificationsBell } from './NotificationsBell';
import { RankIconGlyph } from './RankBadge';
import { StudentProfileLevelModal } from './StudentProfileLevelModal';

interface NavbarProps {
  activeSection: NavSection;
  onChangeSection: (section: NavSection) => void;
}

export function Navbar({ activeSection, onChangeSection }: NavbarProps) {
  const { user, logout } = useAuth();
  const { lang, toggleLang, tr } = useLanguage();
  const { isLight, toggleTheme } = useTheme();
  const [honorBoardOpen, setHonorBoardOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [profileDashboardOpen, setProfileDashboardOpen] = useState(false);
  const [brandLit, setBrandLit] = useState(false);
  const brandTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (brandTimerRef.current !== null) {
        window.clearTimeout(brandTimerRef.current);
      }
    };
  }, []);

  const handleBrandClick = () => {
    setBrandLit(true);
    if (brandTimerRef.current !== null) {
      window.clearTimeout(brandTimerRef.current);
    }
    brandTimerRef.current = window.setTimeout(() => setBrandLit(false), 900);
    onChangeSection('home');
  };

  const navItems: Array<{ id: NavSection; label: string }> = [
    { id: 'home', label: 'Home' },
    { id: 'courses', label: tr('الكورسات', 'Courses') },
    { id: 'learning', label: 'Learning' },
    { id: 'gpa', label: tr('حاسبة GPA', 'GPA Calc') },
    { id: 'community', label: 'Community' },
  ];

  return (
    <>
    <header className="sticky top-0 z-40 border-b border-black/10 dark:border-[#D4AF37]/20 bg-white/95 dark:bg-[#09090B]/95 backdrop-blur-md transition-colors duration-200">
      <div className="max-w-7xl mx-auto px-2.5 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between gap-1.5 sm:gap-3">
        {/* Zone 1: Custom M with Engineer Hard Hat + MVIA Wordmark */}
        <button
          type="button"
          onClick={handleBrandClick}
          className={`cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] rounded-lg px-0.5 sm:px-1 py-0.5 shrink-0 transition-all duration-200 hover:drop-shadow-[0_0_14px_rgba(229,193,88,0.65)] scale-[0.88] sm:scale-100 origin-center ${
            brandLit ? 'drop-shadow-[0_0_22px_rgba(255,241,184,0.95)]' : ''
          }`}
        >
          <MviaBrandMark size="sm" lit={brandLit} interactive={false} />
        </button>

        {/* Zone 2: 5 concise single-line nav links with smooth Gold active chip */}
        <nav
          aria-label={tr('التنقل الرئيسي', 'Main Navigation')}
          className="hidden lg:flex items-center gap-1.5"
        >
          {navItems.map((item) => {
            const isActive = activeSection === item.id;
            return (
              <motion.button
                key={item.id}
                type="button"
                onClick={() => onChangeSection(item.id)}
                whileTap={{ scale: 0.95 }}
                transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
                className={`relative px-3.5 py-2 rounded-lg text-sm font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] ${
                  isActive
                    ? 'text-[#09090B]'
                    : 'text-[#3F3D38] dark:text-[#C8C2B8] hover:text-[#856104] dark:hover:text-[#F5D061]'
                }`}
              >
                {isActive && (
                  <motion.span
                    layoutId="mvia-main-nav-pill"
                    transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                    className="absolute inset-0 bg-gradient-to-l from-[#D4AF37] to-[#E5C158] rounded-lg"
                  />
                )}
                <span className="relative z-10">{item.label}</span>
              </motion.button>
            );
          })}
        </nav>

        {/* Zone 3: Dashboard + Honor Board + Theme Toggle + Language + Notifications + User + Logout */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          {user && (
            <button
              type="button"
              onClick={() => setProfileDashboardOpen(true)}
              title={tr('لوحة التحكم — بيانات الطالب ومستواه', 'Dashboard — Student Profile & Level')}
              aria-label={tr('لوحة التحكم', 'Student Dashboard')}
              className="inline-flex items-center gap-1.5 p-2 sm:px-2.5 sm:py-2 rounded-lg text-xs font-semibold border border-[#D4AF37]/50 dark:border-[#D4AF37]/45 bg-[#D4AF37]/15 text-[#735303] dark:text-[#F5D061] hover:bg-[#D4AF37] hover:text-[#09090B] hover:shadow-[0_0_18px_rgba(212,175,55,0.45)] transition-all whitespace-nowrap shrink-0 cursor-pointer"
            >
              <LayoutDashboard className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">{tr('لوحة التحكم', 'Dashboard')}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setHonorBoardOpen(true)}
            title={tr('لوحة الشرف — ترتيب جميع المسجلين', 'Honor Board — All Rankings')}
            aria-label={tr('لوحة الشرف', 'Honor Board')}
            className="inline-flex items-center gap-1.5 p-2 sm:px-2.5 sm:py-2 rounded-lg text-xs font-semibold border border-[#D4AF37]/40 dark:border-[#D4AF37]/35 bg-[#F5F2EA] dark:bg-[#151519] text-[#735303] dark:text-[#E5C158] hover:bg-[#D4AF37] hover:text-[#09090B] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Trophy className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden md:inline">{tr('لوحة الشرف', 'Honor Board')}</span>
          </button>

          <motion.button
            type="button"
            onClick={toggleTheme}
            whileTap={{ scale: 0.95 }}
            aria-pressed={isLight}
            title={
              isLight
                ? tr('التبديل إلى الوضع المظلم', 'Switch to Dark Mode')
                : tr('التبديل إلى الوضع الفاتح', 'Switch to Light Mode')
            }
            aria-label={
              isLight
                ? tr('التبديل إلى الوضع المظلم', 'Switch to Dark Mode')
                : tr('التبديل إلى الوضع الفاتح', 'Switch to Light Mode')
            }
            className="inline-flex items-center gap-1.5 p-2 sm:px-2.5 sm:py-2 rounded-lg text-xs font-semibold border border-[#D4AF37]/40 bg-[#F5F2EA] dark:bg-[#151519] text-[#735303] dark:text-[#E5C158] hover:bg-[#D4AF37] hover:text-[#09090B] transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]"
          >
            {isLight ? (
              <>
                <Moon className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden xl:inline">{tr('مظلم', 'Dark')}</span>
              </>
            ) : (
              <>
                <Sun className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden xl:inline">{tr('فاتح', 'Light')}</span>
              </>
            )}
          </motion.button>

          <motion.button
            type="button"
            onClick={toggleLang}
            whileTap={{ scale: 0.95 }}
            aria-label={tr('تبديل إلى الإنجليزية', 'Switch to Arabic')}
            className="inline-flex items-center gap-1 px-2 sm:px-2.5 py-2 rounded-lg text-[11px] sm:text-xs font-mono font-semibold border border-[#D4AF37]/40 bg-[#F5F2EA] dark:bg-[#151519] text-[#735303] dark:text-[#E5C158] hover:bg-[#D4AF37] hover:text-[#09090B] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Languages className="w-3.5 h-3.5" />
            <span>{lang === 'ar' ? 'EN' : 'عربي'}</span>
          </motion.button>

          <NotificationsBell onNavigate={onChangeSection} />

          {user && (
            <button
              type="button"
              onClick={() => setAccountOpen(true)}
              title={
                user.rankBadge
                  ? `${user.name} — ${lang === 'ar' ? user.rankBadge.nameAr : user.rankBadge.nameEn}`
                  : tr('حسابي وإدارة البيانات', 'My Account & Data')
              }
              aria-label={tr('حسابي وإدارة البيانات', 'My Account & Data')}
              className="inline-flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-medium border border-black/10 dark:border-white/10 bg-[#F5F2EA] dark:bg-[#151519] text-[#141418] dark:text-[#F5F0E6] hover:border-[#D4AF37]/60 hover:text-[#856104] dark:hover:text-[#E5C158] transition-colors cursor-pointer shrink-0"
            >
              {user.rankBadge ? (
                <RankIconGlyph
                  icon={user.rankBadge.badgeIcon}
                  color={user.rankBadge.badgeColor}
                  className="w-4 h-4"
                />
              ) : user.role === 'admin' ? (
                <ShieldCheck
                  className="w-4 h-4 text-[#B8860B] dark:text-[#D4AF37] shrink-0"
                  aria-label={tr('أدمن', 'Admin')}
                />
              ) : (
                <UserCog className="w-3.5 h-3.5 text-[#B8860B] dark:text-[#D4AF37] shrink-0" />
              )}
              <span className="hidden xl:inline max-w-[110px] truncate">
                {user.name}
              </span>
            </button>
          )}

          <motion.button
            type="button"
            onClick={logout}
            whileTap={{ scale: 0.95 }}
            title={tr('تسجيل الخروج', 'Sign Out')}
            aria-label={tr('تسجيل الخروج', 'Sign Out')}
            className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-lg text-xs font-semibold border border-red-600/30 dark:border-red-500/30 bg-red-50 dark:bg-red-950/35 text-red-700 dark:text-red-200 hover:bg-red-600 hover:text-white hover:border-red-500 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden sm:inline">{tr('تسجيل الخروج', 'Logout')}</span>
          </motion.button>
        </div>
      </div>

      {/* Mobile & Tablet compact horizontal nav strip */}
      <nav
        aria-label={tr('تنقل الجوال والتابلت', 'Mobile & Tablet Navigation')}
        className="lg:hidden flex items-center gap-1.5 px-2.5 sm:px-6 pb-2.5 overflow-x-auto scrollbar-none"
      >
        {navItems.map((item) => {
          const isActive = activeSection === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onChangeSection(item.id)}
              className={`px-3.5 py-2 min-h-[36px] rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                isActive
                  ? 'bg-[#D4AF37] text-[#09090B]'
                  : 'bg-[#F5F2EA] dark:bg-[#151519] text-[#3F3D38] dark:text-[#C8C2B8] border border-black/10 dark:border-white/10'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </nav>
    </header>
    <HonorBoardModal open={honorBoardOpen} onClose={() => setHonorBoardOpen(false)} />
    <AccountModal open={accountOpen} onClose={() => setAccountOpen(false)} />
    <StudentProfileLevelModal
      open={profileDashboardOpen}
      onClose={() => setProfileDashboardOpen(false)}
    />
    </>
  );
}
