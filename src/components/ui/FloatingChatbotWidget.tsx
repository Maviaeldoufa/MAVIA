import {
  BookOpen,
  Bot,
  Calculator,
  ClipboardCheck,
  Compass,
  GraduationCap,
  Headset,
  Home,
  MessageSquare,
  Send,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import type { ComprehensiveExamAdmin, NavSection } from '../../types';
import { apiRequest } from '../../utils/api';
import { hasAdminPermission } from '../../utils/permissions';
import { AdminComprehensiveExamPanel } from '../home/AdminComprehensiveExamPanel';
import { GoldChip } from './GoldChip';
import { SupportCenterModal } from './SupportCenterModal';

interface ChatItem {
  id: string;
  role: 'user' | 'model';
  text: string;
  suggestedSection?: NavSection;
}

interface FloatingChatbotWidgetProps {
  activeSection: NavSection;
  onNavigate: (section: NavSection) => void;
}

function detectSuggestedSection(text: string): NavSection | undefined {
  const lower = text.toLowerCase();
  if (lower.includes('gpa') || text.includes('المعدل') || text.includes('الدرجات')) {
    return 'gpa';
  }
  if (
    text.includes('الكورسات') ||
    text.includes('المواد') ||
    text.includes('ملخص') ||
    text.includes('اختبار') ||
    lower.includes('pdf') ||
    lower.includes('course')
  ) {
    return 'courses';
  }
  if (lower.includes('learning') || text.includes('يوتيوب') || text.includes('روابط تعليمية')) {
    return 'learning';
  }
  if (
    text.includes('كوميونتي') ||
    text.includes('جروب') ||
    text.includes('شات الدفعة') ||
    lower.includes('community')
  ) {
    return 'community';
  }
  if (text.includes('تصدر') || text.includes('الرئيسية') || lower.includes('home')) {
    return 'home';
  }
  return undefined;
}

export function FloatingChatbotWidget({
  activeSection,
  onNavigate,
}: FloatingChatbotWidgetProps) {
  const { user } = useAuth();
  const { tr } = useLanguage();
  const canManageExams =
    user?.role === 'admin' && hasAdminPermission(user, 'manage_quizzes');

  const [open, setOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [examsOpen, setExamsOpen] = useState(false);
  const [pendingExamSubmissions, setPendingExamSubmissions] = useState(0);
  const [examsLit, setExamsLit] = useState(false);
  const [supportLit, setSupportLit] = useState(false);
  const [botLit, setBotLit] = useState(false);
  const [examsHovered, setExamsHovered] = useState(false);
  const [supportHovered, setSupportHovered] = useState(false);
  const [botHovered, setBotHovered] = useState(false);
  const examsTimerRef = useRef<number | null>(null);
  const supportTimerRef = useRef<number | null>(null);
  const botTimerRef = useRef<number | null>(null);
  const [messages, setMessages] = useState<ChatItem[]>([
    {
      id: 'guide-welcome',
      role: 'model',
      text: tr(
        'أهلاً بك! أنا مرشد MAVIA الذكي. لو تهت في أي وقت اسألني أو اضغط على أي قسم فوق للانتقال الفوري.',
        'Welcome! I am the MAVIA Smart Guide. Ask me anytime or jump straight to any section above.'
      ),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const loadPendingExamCount = useCallback(async () => {
    if (!canManageExams) {
      setPendingExamSubmissions(0);
      return;
    }
    try {
      const res = await apiRequest<{ exams: ComprehensiveExamAdmin[] }>(
        '/api/admin/comprehensive-exams'
      );
      const pending = (res.exams || []).reduce(
        (sum, ex) => sum + (ex.pendingCount || 0),
        0
      );
      setPendingExamSubmissions(pending);
    } catch {
      // Ignore network hiccup
    }
  }, [canManageExams]);

  useEffect(() => {
    void loadPendingExamCount();
    if (!canManageExams) return;
    const interval = window.setInterval(() => void loadPendingExamCount(), 15000);
    const onChanged = () => void loadPendingExamCount();
    const onOpenAdminExams = () => setExamsOpen(true);

    window.addEventListener('mvia:comprehensive-exam-changed', onChanged);
    window.addEventListener('focus', onChanged);
    window.addEventListener('mvia:open-admin-comprehensive-exams', onOpenAdminExams);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('mvia:comprehensive-exam-changed', onChanged);
      window.removeEventListener('focus', onChanged);
      window.removeEventListener('mvia:open-admin-comprehensive-exams', onOpenAdminExams);
    };
  }, [canManageExams, loadPendingExamCount]);

  useEffect(() => {
    if (!examsOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExamsOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [examsOpen]);

  useEffect(() => {
    return () => {
      if (examsTimerRef.current !== null) window.clearTimeout(examsTimerRef.current);
      if (supportTimerRef.current !== null) window.clearTimeout(supportTimerRef.current);
      if (botTimerRef.current !== null) window.clearTimeout(botTimerRef.current);
    };
  }, []);

  const handleExamsClick = () => {
    setExamsLit(true);
    if (examsTimerRef.current !== null) window.clearTimeout(examsTimerRef.current);
    examsTimerRef.current = window.setTimeout(() => setExamsLit(false), 850);
    setExamsOpen(true);
  };

  const handleSupportClick = () => {
    setSupportLit(true);
    if (supportTimerRef.current !== null) window.clearTimeout(supportTimerRef.current);
    supportTimerRef.current = window.setTimeout(() => setSupportLit(false), 850);
    setSupportOpen(true);
  };

  const handleBotClick = () => {
    setBotLit(true);
    if (botTimerRef.current !== null) window.clearTimeout(botTimerRef.current);
    botTimerRef.current = window.setTimeout(() => setBotLit(false), 850);
    setOpen((prev) => !prev);
  };

  const quickRoutes: Array<{
    id: NavSection;
    label: string;
    icon: React.ReactNode;
  }> = [
    { id: 'home', label: tr('الرئيسية', 'Home'), icon: <Home className="w-3.5 h-3.5" /> },
    { id: 'courses', label: tr('الكورسات', 'Courses'), icon: <BookOpen className="w-3.5 h-3.5" /> },
    { id: 'learning', label: 'Learning', icon: <GraduationCap className="w-3.5 h-3.5" /> },
    { id: 'gpa', label: tr('حاسبة GPA', 'GPA Calc'), icon: <Calculator className="w-3.5 h-3.5" /> },
    { id: 'community', label: 'Community', icon: <MessageSquare className="w-3.5 h-3.5" /> },
  ];

  const quickQuestions = [
    tr('تايه ومش عارف أبدأ منين؟', 'Where should I start on MAVIA?'),
    tr('فين ملخصات PDF والاختبارات؟', 'Where are PDF summaries and quizzes?'),
    tr('إزاي أحسب معدلي GPA؟', 'How do I calculate my GPA?'),
    tr('فين شات الدفعة والجروبات؟', 'Where is batch chat and support?'),
  ];

  const handleJump = (section: NavSection) => {
    onNavigate(section);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const sendMessage = async (textToSend: string) => {
    const clean = textToSend.trim();
    if (!clean || loading) return;

    const userMsg: ChatItem = {
      id: `u-${Date.now()}`,
      role: 'user',
      text: clean,
    };

    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    setInput('');
    setLoading(true);

    setTimeout(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    }, 30);

    try {
      const data = await apiRequest<{ reply: string }>('/api/ai/chat', {
        method: 'POST',
        body: JSON.stringify({
          message: `القسم الحالي للطالب هو (${activeSection}). سؤاله: ${clean}`,
          history: nextHistory.map((m) => ({ role: m.role, text: m.text })),
        }),
      });

      const suggestedSection = detectSuggestedSection(data.reply);
      setMessages((prev) => [
        ...prev,
        {
          id: `m-${Date.now()}`,
          role: 'model',
          text: data.reply,
          suggestedSection,
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'model',
          text:
            err instanceof Error
              ? err.message
              : tr('تعذر الاتصال بالمرشد الذكي حالياً.', 'Unable to reach smart guide right now.'),
        },
      ]);
    } finally {
      setLoading(false);
      setTimeout(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      }, 30);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  return (
    <>
    <div className="fixed bottom-4 left-4 sm:bottom-5 sm:left-5 z-40 flex flex-col items-start gap-2.5 sm:gap-3">
      <AnimatePresence>
        {open && (
          <motion.section
            initial={{ opacity: 0, y: 16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.95 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            aria-label={tr('مرشد منصة MAVIA الذكي', 'MAVIA Smart Platform Guide')}
            className="w-[calc(100vw-2rem)] sm:w-[390px] max-h-[calc(100dvh-10rem)] rounded-2xl bg-white dark:bg-[#121216] border border-[#D4AF37]/45 shadow-[0_24px_70px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="px-4 py-3 border-b border-black/10 dark:border-white/10 bg-[#EFECE4] dark:bg-[#0D0D10] flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-[#D4AF37]/15 border border-[#D4AF37]/50 flex items-center justify-center text-[#856104] dark:text-[#E5C158]">
                  <Bot className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-display text-sm font-bold text-[#856104] dark:text-[#E5C158]">
                    {tr('مرشد MAVIA الذكي', 'MAVIA Smart Guide')}
                  </h3>
                  <p className="text-[11px] text-[#5C5850] dark:text-[#A8A29E]">
                    {tr('دليلك السريع لكل أقسام المنصة', 'Quick navigation for every section')}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={tr('إغلاق الشات بوت', 'Close chatbot')}
                className="p-1.5 rounded-lg text-[#5C5850] dark:text-[#A8A29E] hover:text-[#141418] dark:hover:text-[#F5F0E6] hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Instant Platform Navigation Bar */}
            <div className="px-3.5 py-2.5 border-b border-black/10 dark:border-white/10 bg-[#F6F4EF]/85 dark:bg-[#09090B]/70 space-y-1.5">
              <div className="flex items-center gap-1.5 text-[11px] text-[#5C5850] dark:text-[#A8A29E]">
                <Compass className="w-3.5 h-3.5 text-[#9A7209] dark:text-[#D4AF37]" />
                <span>{tr('انتقل مباشرة لأي قسم في المنصة:', 'Jump directly to any section:')}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {quickRoutes.map((route) => (
                  <GoldChip
                    key={route.id}
                    active={activeSection === route.id}
                    layoutId="floating-bot-nav"
                    onClick={() => handleJump(route.id)}
                    className="px-2.5 py-1 text-[11px]"
                  >
                    {route.icon}
                    <span>{route.label}</span>
                  </GoldChip>
                ))}
              </div>
            </div>

            {/* Chat Messages */}
            <div
              ref={scrollRef}
              className="h-52 sm:h-64 overflow-y-auto p-3.5 space-y-2.5 bg-[#F6F4EF] dark:bg-[#09090B]"
            >
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`flex flex-col ${
                    m.role === 'user' ? 'items-start' : 'items-end'
                  }`}
                >
                  <div
                    className={`max-w-[88%] rounded-xl px-3.5 py-2.5 text-xs leading-relaxed border whitespace-pre-wrap ${
                      m.role === 'user'
                        ? 'bg-[#D4AF37]/15 border-[#D4AF37]/40 text-[#141418] dark:text-[#F5F0E6]'
                        : 'bg-[#F5F2EA] dark:bg-[#151519] border-black/10 dark:border-white/10 text-[#141418] dark:text-[#F5F0E6]'
                    }`}
                  >
                    <p>{m.text}</p>
                    {m.suggestedSection && (
                      <button
                        type="button"
                        onClick={() => handleJump(m.suggestedSection!)}
                        className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#D4AF37] text-[#09090B] font-semibold text-[11px] hover:bg-[#E5C158] transition-colors cursor-pointer"
                      >
                        <span>
                          {tr('افتح قسم', 'Open')}{' '}
                          {quickRoutes.find((r) => r.id === m.suggestedSection)
                            ?.label || ''}
                        </span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-end">
                  <div className="rounded-xl px-3 py-2 bg-[#F5F2EA] dark:bg-[#151519] border border-black/10 dark:border-white/10 text-[11px] text-[#9A7209] dark:text-[#D4AF37]">
                    {tr('جاري الرد...', 'Replying...')}
                  </div>
                </div>
              )}
            </div>

            {/* Quick Suggestion Chips */}
            <div className="px-3.5 pt-2 pb-1 flex items-center gap-1.5 overflow-x-auto border-t border-black/10 dark:border-white/10 bg-white dark:bg-[#121216]">
              {quickQuestions.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => sendMessage(q)}
                  className="px-2.5 py-1 rounded-md bg-[#ECE8DE] dark:bg-[#18181D] border border-black/10 dark:border-white/10 text-[11px] text-[#3F3D38] dark:text-[#C8C2B8] hover:border-[#D4AF37]/60 hover:text-[#735303] dark:hover:text-[#F5D061] whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>

            {/* Input */}
            <form
              onSubmit={handleSubmit}
              className="p-3 bg-white dark:bg-[#121216] flex items-center gap-2"
            >
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={tr('اسألني لو تهت في أي مكان...', 'Ask me anything about MAVIA...')}
                className="flex-1 px-3 py-2 rounded-xl bg-[#F6F4EF] dark:bg-[#09090B] border border-black/10 dark:border-white/10 text-xs text-[#141418] dark:text-[#F5F0E6] placeholder-[#6E6A61] dark:placeholder-[#6B6661] focus:outline-none focus:border-[#D4AF37]"
              />
              <GoldChip
                type="submit"
                active={true}
                disabled={loading || !input.trim()}
                className="px-3 py-2 text-xs"
              >
                <Send className="w-3.5 h-3.5" />
              </GoldChip>
            </form>
          </motion.section>
        )}
      </AnimatePresence>

      {/* Bottom-Left Stacked Floating Icons: Admin Exams (Admin Only) -> Technical Support -> Chatbot */}
      <div className="flex flex-col items-start gap-2.5 sm:gap-3">
        {/* Admin-Only Comprehensive Exams Floating Icon */}
        {canManageExams && (
          <div className="relative flex items-center">
            <motion.div
              animate={{ y: [0, -5, 0] }}
              transition={{
                duration: 3.2,
                delay: 0.3,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
              className="relative"
            >
              {/* Outer illumination halo */}
              <span
                aria-hidden="true"
                className={`pointer-events-none absolute -inset-1.5 rounded-full blur-md transition-opacity duration-200 bg-indigo-400/55 ${
                  examsLit || examsHovered ? 'opacity-100' : 'opacity-0'
                }`}
              />
              <motion.button
                type="button"
                onClick={handleExamsClick}
                onMouseEnter={() => setExamsHovered(true)}
                onMouseLeave={() => setExamsHovered(false)}
                onFocus={() => setExamsHovered(true)}
                onBlur={() => setExamsHovered(false)}
                whileHover={{ scale: 1.09 }}
                whileTap={{ scale: 0.93 }}
                aria-label={tr(
                  'إدارة الامتحانات الشاملة والتصحيح اليدوي (أدمن)',
                  'Comprehensive Exams & Manual Grading (Admin)'
                )}
                title={tr('الامتحانات الشاملة (للأدمن فقط)', 'Comprehensive Exams (Admin Only)')}
                className={`relative w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-gradient-to-br from-[#1C1A3A] via-[#2B245A] to-[#131229] text-[#F5D061] border flex items-center justify-center cursor-pointer transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 ${
                  examsLit
                    ? 'border-[#FFF1B8] text-white brightness-125 shadow-[0_0_34px_rgba(129,140,248,0.9),0_0_60px_rgba(212,175,55,0.55)]'
                    : examsHovered
                    ? 'border-[#F5D061] text-white brightness-110 shadow-[0_0_26px_rgba(129,140,248,0.75),0_0_42px_rgba(212,175,55,0.4)]'
                    : 'border-[#D4AF37]/65 shadow-[0_10px_28px_rgba(67,56,202,0.38)]'
                }`}
              >
                <ClipboardCheck className="w-5 h-5 sm:w-6 sm:h-6" />
                {pendingExamSubmissions > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-red-600 text-white text-[10px] font-mono font-bold tabular-nums flex items-center justify-center border-2 border-[#09090B] shadow">
                    {pendingExamSubmissions > 99 ? '99+' : pendingExamSubmissions}
                  </span>
                )}
              </motion.button>
            </motion.div>

            {examsHovered && (
              <span className="pointer-events-none absolute left-full ml-2.5 px-2.5 py-1 rounded-lg bg-white/95 dark:bg-[#121216]/95 border border-[#D4AF37]/55 text-[#735303] dark:text-[#F5D061] text-[11px] font-semibold whitespace-nowrap shadow-lg">
                {pendingExamSubmissions > 0
                  ? tr(
                      `الامتحانات (${pendingExamSubmissions} بانتظار التصحيح)`,
                      `Exams (${pendingExamSubmissions} pending)`
                    )
                  : tr('الامتحانات الشاملة (أدمن)', 'Comprehensive Exams')}
              </span>
            )}
          </div>
        )}

        {/* Technical Support Floating Icon (Above Chatbot) */}
        <div className="relative flex items-center">
          <motion.div
            animate={{ y: [0, -5, 0] }}
            transition={{ duration: 3.4, repeat: Infinity, ease: 'easeInOut' }}
            className="relative"
          >
            {/* Outer illumination halo */}
            <span
              aria-hidden="true"
              className={`pointer-events-none absolute -inset-1.5 rounded-full blur-md transition-opacity duration-200 bg-emerald-400/55 ${
                supportLit || supportHovered ? 'opacity-100' : 'opacity-0'
              }`}
            />
            <motion.button
              type="button"
              onClick={handleSupportClick}
              onMouseEnter={() => setSupportHovered(true)}
              onMouseLeave={() => setSupportHovered(false)}
              onFocus={() => setSupportHovered(true)}
              onBlur={() => setSupportHovered(false)}
              whileHover={{ scale: 1.09 }}
              whileTap={{ scale: 0.93 }}
              aria-label={tr('الدعم الفني والتواصل مع الإدارة', 'Technical Support & Contact')}
              title={tr('الدعم الفني', 'Technical Support')}
              className={`relative w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-gradient-to-br from-[#0F2C24] via-[#134235] to-[#0B221C] text-emerald-200 border flex items-center justify-center cursor-pointer transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 ${
                supportLit
                  ? 'border-emerald-200 text-white brightness-125 shadow-[0_0_34px_rgba(52,211,153,0.95),0_0_62px_rgba(212,175,55,0.5)]'
                  : supportHovered
                  ? 'border-emerald-300 text-white brightness-110 shadow-[0_0_26px_rgba(52,211,153,0.8),0_0_42px_rgba(212,175,55,0.35)]'
                  : 'border-emerald-400/55 shadow-[0_10px_28px_rgba(16,185,129,0.28)]'
              }`}
            >
              <Headset className="w-5 h-5 sm:w-6 sm:h-6" />
            </motion.button>
          </motion.div>

          {/* Side floating label shown smoothly on hover/focus */}
          {supportHovered && (
            <span className="pointer-events-none absolute left-full ml-2.5 px-2.5 py-1 rounded-lg bg-white/95 dark:bg-[#121216]/95 border border-emerald-400/50 text-emerald-800 dark:text-emerald-200 text-[11px] font-semibold whitespace-nowrap shadow-lg">
              {tr('الدعم الفني', 'Support')}
            </span>
          )}
        </div>

        {/* Bottom-Left Floating Chatbot Launcher Button */}
        <div className="relative flex items-center">
          <motion.div
            animate={{ y: [0, -5, 0] }}
            transition={{
              duration: 3.8,
              delay: 0.6,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
            className="relative"
          >
            {/* Outer illumination halo */}
            <span
              aria-hidden="true"
              className={`pointer-events-none absolute -inset-1.5 rounded-full blur-md transition-opacity duration-200 bg-[#FFF1B8]/60 ${
                botLit || botHovered ? 'opacity-100' : 'opacity-0'
              }`}
            />
            <motion.button
              type="button"
              onClick={handleBotClick}
              onMouseEnter={() => setBotHovered(true)}
              onMouseLeave={() => setBotHovered(false)}
              onFocus={() => setBotHovered(true)}
              onBlur={() => setBotHovered(false)}
              whileHover={{ scale: 1.09 }}
              whileTap={{ scale: 0.93 }}
              aria-label={tr('فتح شات بوت إرشاد المنصة', 'Open MAVIA Guide Chatbot')}
              title={tr('المرشد الذكي (الشات بوت)', 'MAVIA Smart Guide Chatbot')}
              className={`relative w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-gradient-to-br from-[#D4AF37] via-[#E5C158] to-[#B68D20] text-[#09090B] border flex items-center justify-center cursor-pointer transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFF1B8] ${
                botLit
                  ? 'border-[#FFF6D6] brightness-125 shadow-[0_0_36px_rgba(255,241,184,0.95),0_0_68px_rgba(212,175,55,0.7)]'
                  : botHovered
                  ? 'border-[#FFF1B8] brightness-110 shadow-[0_0_28px_rgba(245,208,97,0.85),0_0_48px_rgba(212,175,55,0.5)]'
                  : 'border-[#F5D061]/60 shadow-[0_12px_32px_rgba(212,175,55,0.4)]'
              }`}
            >
              {open ? (
                <X className="w-5 h-5 sm:w-6 sm:h-6" />
              ) : (
                <Bot className="w-5 h-5 sm:w-6 sm:h-6" />
              )}
            </motion.button>
          </motion.div>

          {botHovered && !open && (
            <span className="pointer-events-none absolute left-full ml-2.5 px-2.5 py-1 rounded-lg bg-white/95 dark:bg-[#121216]/95 border border-[#D4AF37]/60 text-[#735303] dark:text-[#F5D061] text-[11px] font-semibold whitespace-nowrap shadow-lg">
              {tr('الشات بوت الذكي', 'Smart Guide')}
            </span>
          )}
        </div>
      </div>
    </div>

    <SupportCenterModal open={supportOpen} onClose={() => setSupportOpen(false)} />

    {/* Admin-Only Comprehensive Exams & Manual Grading Modal */}
    {canManageExams && examsOpen && (
      <div
        role="dialog"
        aria-modal="true"
        aria-label={tr('إدارة الامتحانات الشاملة والتصحيح اليدوي', 'Comprehensive Exams & Manual Grading')}
        onClick={() => setExamsOpen(false)}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-3 sm:p-5"
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-5xl max-h-[90vh] flex flex-col rounded-2xl bg-white dark:bg-[#121216] border border-[#D4AF37]/40 shadow-[0_24px_80px_rgba(0,0,0,0.85)] overflow-hidden"
        >
          <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b border-black/10 dark:border-white/10 bg-[#EFECE4] dark:bg-[#0D0D10] shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#D4AF37]/15 border border-[#D4AF37]/45 flex items-center justify-center text-[#735303] dark:text-[#F5D061]">
                <ClipboardCheck className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-display text-base sm:text-lg font-bold text-[#141418] dark:text-[#F5F0E6]">
                  {tr('بوابة الامتحانات الشاملة والتصحيح اليدوي', 'Comprehensive Exams & Manual Grading')}
                </h2>
                <p className="text-xs text-[#5C5850] dark:text-[#A8A29E]">
                  {tr(
                    'تظهر هذه النافذة للأدمن فقط — أنشئ الامتحان حسب الفرقة وصحح إجابات الطلاب يدوياً.',
                    'Admin only — create targeted exams by academic year and grade submissions manually.'
                  )}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setExamsOpen(false)}
              aria-label={tr('إغلاق نافذة الامتحانات', 'Close exams dialog')}
              className="w-10 h-10 rounded-xl bg-[#ECE8DE] dark:bg-[#18181D] border border-black/10 dark:border-white/10 text-[#3F3D38] dark:text-[#C8C2B8] hover:text-[#141418] dark:hover:text-white hover:border-[#D4AF37]/50 flex items-center justify-center cursor-pointer shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 sm:p-6">
            <AdminComprehensiveExamPanel embeddedInModal />
          </div>
        </div>
      </div>
    )}
    </>
  );
}
