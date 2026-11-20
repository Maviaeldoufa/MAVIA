import { BookOpen, Calculator, GraduationCap, MessageSquare } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import type { NavSection } from '../../types';
import { GoldChip } from '../ui/GoldChip';
import { AdminAnalyticsPanel } from './AdminAnalyticsPanel';
import { AdminComprehensiveExamPanel } from './AdminComprehensiveExamPanel';
import { AdminRanksPanel } from './AdminRanksPanel';
import { AdminUsersPanel } from './AdminUsersPanel';
import { HeroGeoCodingBackdrop } from './HeroGeoCodingBackdrop';
import { HomeCountdownPanel } from './HomeCountdownPanel';
import { LeaderboardPanel } from './LeaderboardPanel';
import { StudentComprehensiveResultsPanel } from './StudentComprehensiveResultsPanel';
import { StudentDashboardPanel } from './StudentDashboardPanel';

interface HomeSectionProps {
  onNavigate: (section: NavSection) => void;
  onOpenCourse: (courseId: string) => void;
}

export function HomeSection({ onNavigate, onOpenCourse }: HomeSectionProps) {
  const { user } = useAuth();
  const { tr, formatYear } = useLanguage();
  const [leaderboardRefresh, setLeaderboardRefresh] = useState(0);

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Editorial Hero Introduction */}
      <section className="relative overflow-hidden rounded-2xl border border-[#D4AF37]/30 dark:border-[#D4AF37]/25 bg-white dark:bg-[#121216] shadow-sm dark:shadow-none">
        <div className="relative overflow-hidden p-5 sm:p-8 lg:p-12 min-h-[240px] sm:min-h-[320px] flex flex-col justify-between space-y-5 sm:space-y-6 bg-[#121216]">
          <HeroGeoCodingBackdrop />

          <div className="relative z-10 space-y-3 sm:space-y-4 max-w-4xl">
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-[#F5D061] drop-shadow-[0_1px_6px_rgba(0,0,0,0.9)]">
              <span>{tr('منصة MAVIA التعليمية', 'MAVIA Educational Platform')}</span>
              <span aria-hidden="true">·</span>
              <span>{user ? formatYear(user.year) : tr('جميع الدفعات', 'All Years')}</span>
              <span aria-hidden="true">·</span>
              <span>{tr('الأقمار الصناعية · GIS والبرمجة', 'Satellites · GIS & Programming')}</span>
            </div>

            <h1 className="font-display text-2xl sm:text-4xl lg:text-[2.65rem] font-bold text-[#F7F3EB] leading-tight text-balance drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)]">
              {tr(
                'بيتك الأكاديمي المتكامل لجميع الدفعات من الأولى للرابعة',
                'Your Complete Academic Hub for Academic Years 1–4'
              )}
            </h1>

            <p className="text-sm sm:text-base text-[#EFE9DF] leading-relaxed max-w-3xl drop-shadow-[0_2px_10px_rgba(0,0,0,0.92)]">
              {tr(
                'منصة MAVIA صُممت خصيصاً لطلاب الفرق الأربع لتجمع مواد ومجلدات كل دفعة على حدة، مع ملخصات PDF منظمة، اختبارات شاملة تمنحك نقاطاً على لوحة التصدر، وكورسات احترافية في نظم المعلومات الجغرافية (GIS) والبرمجة.',
                'MAVIA is built specifically for students across all 4 years—organizing course folders, PDF summaries, interactive quizzes for the leaderboard, and professional GIS & Programming tracks.'
              )}
            </p>
          </div>

          <div className="relative z-10 flex flex-wrap items-center gap-2 sm:gap-2.5 pt-1 sm:pt-2">
            <GoldChip active={true} onClick={() => onNavigate('courses')}>
              <BookOpen className="w-4 h-4" />
              <span>{tr('استكشاف الكورسات والمواد', 'Explore Courses & Folders')}</span>
            </GoldChip>
            <GoldChip onClick={() => onNavigate('learning')}>
              <GraduationCap className="w-4 h-4" />
              <span>{tr('مسارات Learning', 'Learning Tracks')}</span>
            </GoldChip>
            <GoldChip onClick={() => onNavigate('gpa')}>
              <Calculator className="w-4 h-4" />
              <span>{tr('حاسبة GPA', 'GPA Calculator')}</span>
            </GoldChip>
            <GoldChip onClick={() => onNavigate('community')}>
              <MessageSquare className="w-4 h-4" />
              <span>Community</span>
            </GoldChip>
          </div>
        </div>

        {/* 4-column summary strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-px border-t border-black/10 dark:border-white/10 bg-black/10 dark:bg-white/10">
          <div className="p-3.5 sm:p-5 bg-[#EFECE4] dark:bg-[#0D0D10]">
            <div className="text-xs text-[#5C5850] dark:text-[#A8A29E]">{tr('نقاطك الحالية', 'Current Points')}</div>
            <div className="font-mono text-xl sm:text-2xl font-bold text-[#856104] dark:text-[#E5C158] tabular-nums mt-1">
              {user?.points ?? 0}
            </div>
          </div>
          <div className="p-3.5 sm:p-5 bg-[#EFECE4] dark:bg-[#0D0D10]">
            <div className="text-xs text-[#5C5850] dark:text-[#A8A29E]">{tr('الاختبارات المنجزة', 'Quizzes Completed')}</div>
            <div className="font-mono text-xl sm:text-2xl font-bold text-[#141418] dark:text-[#F5F0E6] tabular-nums mt-1">
              {user?.quizzesCompleted ?? 0}
            </div>
          </div>
          <div className="p-3.5 sm:p-5 bg-[#EFECE4] dark:bg-[#0D0D10]">
            <div className="text-xs text-[#5C5850] dark:text-[#A8A29E]">{tr('الفرقة الدراسية', 'Academic Year')}</div>
            <div className="text-base sm:text-lg font-bold text-[#141418] dark:text-[#F5F0E6] mt-1">
              {user ? formatYear(user.year) : '-'}
            </div>
          </div>
          <div className="p-3.5 sm:p-5 bg-[#EFECE4] dark:bg-[#0D0D10]">
            <div className="text-xs text-[#5C5850] dark:text-[#A8A29E]">{tr('التخصصات المغطاة', 'Tracks Covered')}</div>
            <div className="text-base sm:text-lg font-bold text-[#856104] dark:text-[#D4AF37] mt-1">
              {tr('GIS · البرمجة', 'GIS · Programming')}
            </div>
          </div>
        </div>
      </section>

      {/* Upcoming Exam News & Countdowns */}
      <HomeCountdownPanel />

      {/* Student's Submitted / Graded Comprehensive Exam Results & Mistake Review */}
      <StudentComprehensiveResultsPanel />

      {/* Personal Student Dashboard */}
      <StudentDashboardPanel onOpenCourse={onOpenCourse} />

      {/* Batch Leaderboard */}
      <LeaderboardPanel refreshTrigger={leaderboardRefresh} />

      {/* Admin-Only Comprehensive Exam Builder & Manual Grading */}
      <AdminComprehensiveExamPanel />

      {/* Admin-Only Visitor Analytics */}
      <AdminAnalyticsPanel />

      {/* Super Admin Ranks, Officials & Support Directory Control */}
      <AdminRanksPanel
        onDirectoryChanged={() => setLeaderboardRefresh((n) => n + 1)}
      />

      {/* Admin User Controls (Only shown to authorized Admin users) */}
      <AdminUsersPanel
        onUsersChanged={() => setLeaderboardRefresh((n) => n + 1)}
      />
    </div>
  );
}
