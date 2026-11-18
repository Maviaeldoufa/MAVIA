import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  FileText,
  Filter,
  Hourglass,
  Megaphone,
  Send,
  X,
  XCircle,
} from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import type {
  ComprehensiveExamPublic,
  ComprehensiveSubmission,
} from '../../types';
import { apiRequest } from '../../utils/api';
import { GoldChip } from '../ui/GoldChip';

function formatSecondsMMSS(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function ComprehensiveSubmissionReviewView({
  submission,
  onClose,
}: {
  submission: ComprehensiveSubmission;
  onClose: () => void;
}) {
  const { tr, isEn } = useLanguage();
  const [filter, setFilter] = useState<'all' | 'wrong' | 'correct'>('all');

  if (submission.status === 'pending_grading') {
    return (
      <div className="p-6 sm:p-8 text-center space-y-5">
        <div className="mx-auto w-14 h-14 rounded-2xl bg-[#D4AF37]/15 border border-[#D4AF37]/40 flex items-center justify-center text-[#735303] dark:text-[#F5D061]">
          <Hourglass className="w-7 h-7" />
        </div>
        <div className="space-y-2">
          <h3 className="font-display text-xl font-bold text-[#735303] dark:text-[#F5D061]">
            {tr('في انتظار التصحيح', 'Pending Manual Grading')}
          </h3>
          <p className="text-sm text-[#3F3D38] dark:text-[#C8C2B8] leading-relaxed max-w-md mx-auto">
            {tr(
              `تم استلام إجاباتك في الامتحان الشامل لمادة "${submission.subjectName}" بنجاح. امتحانك الآن قيد المراجعة والتصحيح اليدوي من قِبل الأدمن، وستصلك الدرجة وتفاصيل الأخطاء فور إرسالها.`,
              `Your answers for the comprehensive exam "${submission.subjectName}" were received. Your exam is currently awaiting manual grading by the Admin.`
            )}
          </p>
        </div>
        <div className="inline-flex flex-wrap items-center justify-center gap-3 px-4 py-2.5 rounded-xl bg-[#EFECE4] dark:bg-[#0D0D10] border border-black/10 dark:border-white/10 text-xs text-[#5C5850] dark:text-[#A8A29E] font-mono tabular-nums">
          <span>
            {tr('عدد الأسئلة:', 'Questions:')} {submission.answers.length}
          </span>
          <span aria-hidden="true">·</span>
          <span>
            {tr('تاريخ التسليم:', 'Submitted:')}{' '}
            {new Date(submission.submittedAt).toLocaleString()}
          </span>
        </div>
        <div>
          <GoldChip active={true} onClick={onClose} className="px-6 py-2">
            {tr('حسناً', 'Close')}
          </GoldChip>
        </div>
      </div>
    );
  }

  const wrongAnswers = submission.answers.filter((a) => a.isCorrect === false);
  const correctAnswers = submission.answers.filter((a) => a.isCorrect === true);
  const pct =
    submission.maxScore > 0
      ? Math.round((submission.totalScore / submission.maxScore) * 100)
      : 0;

  const filtered = submission.answers.filter((a) => {
    if (filter === 'wrong') return a.isCorrect === false;
    if (filter === 'correct') return a.isCorrect === true;
    return true;
  });

  return (
    <div className="space-y-5">
      {/* Score Overview */}
      <div className="p-5 rounded-2xl bg-[#EFECE4] dark:bg-[#0D0D10] border border-[#D4AF37]/35 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="text-xs font-semibold text-[#9A7209] dark:text-[#D4AF37]">
              {tr('نتيجة الامتحان الشامل ومراجعة الأخطاء', 'Comprehensive Exam Result & Mistakes')}
            </div>
            <h3 className="font-display text-xl font-bold text-[#141418] dark:text-[#F5F0E6]">
              {submission.subjectName}
            </h3>
            {submission.gradedBy && (
              <div className="text-xs text-[#5C5850] dark:text-[#A8A29E]">
                {tr('تم التصحيح بواسطة:', 'Graded by:')} {submission.gradedBy}{' '}
                {submission.gradedAt
                  ? `· ${new Date(submission.gradedAt).toLocaleString()}`
                  : ''}
              </div>
            )}
          </div>

          <div className="flex items-center gap-4 px-4 py-3 rounded-xl bg-[#F5F2EA] dark:bg-[#151519] border border-[#D4AF37]/30 shrink-0">
            <div>
              <div className="text-xs text-[#5C5850] dark:text-[#A8A29E]">{tr('الدرجة', 'Score')}</div>
              <div className="font-mono text-2xl font-bold text-[#735303] dark:text-[#F5D061] tabular-nums">
                {submission.totalScore} / {submission.maxScore}
              </div>
            </div>
            <div className="h-8 w-px bg-black/10 dark:bg-white/10" />
            <div>
              <div className="text-xs text-[#5C5850] dark:text-[#A8A29E]">{tr('النسبة', 'Percent')}</div>
              <div className="font-mono text-2xl font-bold text-emerald-700 dark:text-emerald-300 tabular-nums">
                {pct}%
              </div>
            </div>
          </div>
        </div>

        {submission.adminNote && (
          <div className="p-3.5 rounded-xl bg-[#F5F2EA] dark:bg-[#151519] border border-[#D4AF37]/25 text-xs text-[#856104] dark:text-[#E5C158] leading-relaxed">
            <strong>{tr('ملاحظة المصحح:', 'Grader Note:')}</strong>{' '}
            <span className="text-[#141418] dark:text-[#F5F0E6]">{submission.adminNote}</span>
          </div>
        )}
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-[#856104] dark:text-[#E5C158]">
          <Filter className="w-4 h-4" />
          <span>{tr('مراجعة إجاباتك سؤالاً بسؤال', 'Question-by-Question Review')}</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <GoldChip
            active={filter === 'all'}
            onClick={() => setFilter('all')}
            className="text-xs px-3 py-1"
          >
            {tr('الكل', 'All')} ({submission.answers.length})
          </GoldChip>
          <GoldChip
            active={filter === 'wrong'}
            onClick={() => setFilter('wrong')}
            className="text-xs px-3 py-1"
          >
            {tr('ما غلطت فيه', 'Mistakes')} ({wrongAnswers.length})
          </GoldChip>
          <GoldChip
            active={filter === 'correct'}
            onClick={() => setFilter('correct')}
            className="text-xs px-3 py-1"
          >
            {tr('الصحيحة', 'Correct')} ({correctAnswers.length})
          </GoldChip>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="py-8 text-center text-sm text-[#5C5850] dark:text-[#A8A29E] rounded-xl bg-[#EFECE4] dark:bg-[#0D0D10] border border-black/10 dark:border-white/10">
          {filter === 'wrong'
            ? tr('لا توجد أخطاء! إجاباتك كلها صحيحة.', 'No mistakes found! All answers were correct.')
            : tr('لا توجد أسئلة مطابقة.', 'No matching questions.')}
        </div>
      ) : (
        <div className="space-y-3.5">
          {filtered.map((ans, idx) => {
            const isCorrect = ans.isCorrect === true;
            const studentDisplayAnswer =
              ans.questionType === 'essay'
                ? ans.essayAnswer?.trim() || tr('لم يكتب إجابة', 'No written answer')
                : typeof ans.selectedIndex === 'number' &&
                  ans.selectedIndex >= 0 &&
                  ans.options?.[ans.selectedIndex]
                ? ans.options[ans.selectedIndex]
                : tr('بدون إجابة', 'Unanswered');

            const typeLabel =
              ans.questionType === 'mcq'
                ? tr('اختياري', 'MCQ')
                : ans.questionType === 'true_false'
                ? tr('صح وغلط', 'True/False')
                : tr('مقالي', 'Essay');

            return (
              <div
                key={ans.questionId}
                className={`p-4 rounded-xl border space-y-3 ${
                  isCorrect
                    ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-500/35'
                    : 'bg-red-50 dark:bg-red-950/20 border-red-500/35'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="text-xs text-[#5C5850] dark:text-[#A8A29E] font-medium">{typeLabel}</div>
                    <div className="text-sm font-semibold text-[#141418] dark:text-[#F5F0E6] leading-relaxed">
                      <span className={`font-mono text-[#9A7209] dark:text-[#D4AF37] tabular-nums ${isEn ? 'mr-2' : 'ml-2'}`}>
                        {idx + 1}.
                      </span>
                      {ans.questionText}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-mono text-xs font-bold text-[#856104] dark:text-[#E5C158] tabular-nums px-2.5 py-1 rounded-lg bg-[#F6F4EF]/85 dark:bg-[#09090B]/70 border border-black/10 dark:border-white/10">
                      {ans.awardedPoints ?? 0} / {ans.maxPoints}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border ${
                        isCorrect
                          ? 'bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border-emerald-500/40'
                          : 'bg-red-50 dark:bg-red-950/80 text-red-700 dark:text-red-300 border-red-500/40'
                      }`}
                    >
                      {isCorrect ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>{tr('صحيح', 'Correct')}</span>
                        </>
                      ) : (
                        <>
                          <XCircle className="w-3.5 h-3.5" />
                          <span>{tr('خطأ', 'Wrong')}</span>
                        </>
                      )}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  <div className="p-3 rounded-lg bg-[#F6F4EF]/85 dark:bg-[#09090B]/75 border border-black/10 dark:border-white/10 space-y-1">
                    <div className="text-xs text-[#5C5850] dark:text-[#A8A29E]">
                      {tr('إجابتك:', 'Your Answer:')}
                    </div>
                    <div
                      className={`text-sm font-medium whitespace-pre-wrap ${
                        isCorrect ? 'text-emerald-800 dark:text-emerald-200' : 'text-red-700 dark:text-red-200'
                      }`}
                    >
                      {studentDisplayAnswer}
                    </div>
                  </div>

                  {(ans.correctAnswerText || !isCorrect) && (
                    <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/25 border border-emerald-500/30 space-y-1">
                      <div className="text-xs text-emerald-700 dark:text-emerald-300">
                        {tr('الإجابة الصحيحة / النموذجية:', 'Correct / Model Answer:')}
                      </div>
                      <div className="text-sm font-medium text-emerald-900 dark:text-emerald-100 whitespace-pre-wrap">
                        {ans.correctAnswerText ||
                          tr('راجع ملاحظة المصحح أو محتوى المادة.', 'See grader note or course material.')}
                      </div>
                    </div>
                  )}
                </div>

                {ans.adminFeedback && (
                  <div className="p-3 rounded-lg bg-[#EFECE4] dark:bg-[#0D0D10] border border-[#D4AF37]/30 text-xs text-[#3F3D38] dark:text-[#C8C2B8] leading-relaxed">
                    <strong className="text-[#856104] dark:text-[#E5C158]">{tr('توضيح المصحح:', 'Feedback:')}</strong>{' '}
                    {ans.adminFeedback}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ComprehensiveExamBannerAndModal() {
  const { user } = useAuth();
  const { tr, isEn, formatYear } = useLanguage();

  const [activeExams, setActiveExams] = useState<ComprehensiveExamPublic[]>([]);
  const [mySubmissions, setMySubmissions] = useState<ComprehensiveSubmission[]>([]);
  const [openExam, setOpenExam] = useState<ComprehensiveExamPublic | null>(null);
  const [openReviewSub, setOpenReviewSub] = useState<ComprehensiveSubmission | null>(null);

  // Active exam attempt state
  const [selectedChoices, setSelectedChoices] = useState<Record<string, number>>({});
  const [essayTexts, setEssayTexts] = useState<Record<string, string>>({});
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [justSubmitted, setJustSubmitted] = useState<ComprehensiveSubmission | null>(null);

  const selectedChoicesRef = useRef(selectedChoices);
  selectedChoicesRef.current = selectedChoices;
  const essayTextsRef = useRef(essayTexts);
  essayTextsRef.current = essayTexts;
  const remainingRef = useRef(remainingSeconds);
  remainingRef.current = remainingSeconds;
  const submittingRef = useRef(false);

  const loadState = useCallback(async () => {
    if (!user) {
      setActiveExams([]);
      setMySubmissions([]);
      return;
    }
    try {
      const [activeRes, subsRes] = await Promise.all([
        apiRequest<{ exams: ComprehensiveExamPublic[] }>('/api/comprehensive-exams/active'),
        apiRequest<{ submissions: ComprehensiveSubmission[] }>(
          '/api/comprehensive-exams/my-submissions'
        ),
      ]);
      setActiveExams(activeRes.exams || []);
      setMySubmissions(subsRes.submissions || []);
    } catch {
      // Ignore network hiccup
    }
  }, [user?.id]);

  const handleOpenExamFromBanner = useCallback(
    (exam: ComprehensiveExamPublic, subsOverride?: ComprehensiveSubmission[]) => {
      const listToSearch = subsOverride || mySubmissions;
      const existing = listToSearch.find((s) => s.examId === exam.id);
      if (existing) {
        setOpenExam(null);
        setOpenReviewSub(existing);
        return;
      }
      setOpenReviewSub(null);
      setJustSubmitted(null);
      setSubmitError(null);
      setSelectedChoices({});
      setEssayTexts({});

      const totalSeconds = Math.max(60, (exam.durationMinutes || 30) * 60);
      let secsLeft = totalSeconds;
      if (user) {
        const storageKey = `mvia_cexam_deadline_${user.id}_${exam.id}`;
        try {
          const savedRaw = window.sessionStorage.getItem(storageKey);
          if (savedRaw) {
            const deadlineMs = Number(savedRaw);
            if (Number.isFinite(deadlineMs) && deadlineMs > 0) {
              const diffSecs = Math.ceil((deadlineMs - Date.now()) / 1000);
              secsLeft = Math.max(5, Math.min(totalSeconds, diffSecs));
            }
          } else {
            window.sessionStorage.setItem(
              storageKey,
              String(Date.now() + totalSeconds * 1000)
            );
          }
        } catch {
          secsLeft = totalSeconds;
        }
      }

      setRemainingSeconds(secsLeft);
      setOpenExam(exam);
    },
    [mySubmissions, user]
  );

  useEffect(() => {
    void loadState();
    const interval = window.setInterval(() => void loadState(), 12000);
    const onChanged = () => void loadState();
    const onFocus = () => void loadState();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void loadState();
      }
    };

    window.addEventListener('mvia:comprehensive-exam-changed', onChanged);
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onFocus);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('mvia:comprehensive-exam-changed', onChanged);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [loadState]);

  // Allow notifications or home results panel to open an active exam or graded/pending submission modal
  useEffect(() => {
    const onOpenResults = async (ev: Event) => {
      const detail = (ev as CustomEvent<{ examId?: string; submissionId?: string }>).detail;
      try {
        const [activeRes, subsRes] = await Promise.all([
          apiRequest<{ exams: ComprehensiveExamPublic[] }>('/api/comprehensive-exams/active'),
          apiRequest<{ submissions: ComprehensiveSubmission[] }>(
            '/api/comprehensive-exams/my-submissions'
          ),
        ]);
        const latestExams = activeRes.exams || [];
        const list = subsRes.submissions || [];
        setActiveExams(latestExams);
        setMySubmissions(list);

        const target =
          (detail?.submissionId && list.find((s) => s.id === detail.submissionId)) ||
          (detail?.examId && list.find((s) => s.examId === detail.examId)) ||
          (!detail?.examId ? list[0] : undefined);
        if (target) {
          setOpenExam(null);
          setOpenReviewSub(target);
          return;
        }
        // If not submitted yet and exam is still active, open the exam directly to begin solving
        if (detail?.examId) {
          const active = latestExams.find((e) => e.id === detail.examId);
          if (active) {
            handleOpenExamFromBanner(active, list);
          }
        }
      } catch {
        // Ignore
      }
    };

    window.addEventListener('mvia:open-comprehensive-results', onOpenResults);
    return () =>
      window.removeEventListener('mvia:open-comprehensive-results', onOpenResults);
  }, [handleOpenExamFromBanner]);

  const handleSubmitExam = useCallback(
    async (isAutoTimeout = false) => {
      if (!openExam || submittingRef.current || justSubmitted) return;

      const choices = selectedChoicesRef.current;
      const essays = essayTextsRef.current;

      if (!isAutoTimeout) {
        const missing = openExam.questions.some((q) => {
          if (q.type === 'essay') {
            return !(essays[q.id] || '').trim();
          }
          return typeof choices[q.id] !== 'number' || choices[q.id] < 0;
        });
        if (missing) {
          setSubmitError(
            tr(
              'يرجى الإجابة على جميع الأسئلة (الاختيارية، صح وغلط، والمقالية) قبل التسليم.',
              'Please answer all questions (MCQ, True/False, and Essay) before submitting.'
            )
          );
          return;
        }
      }

      submittingRef.current = true;
      setSubmitting(true);
      setSubmitError(null);

      const totalSecs = Math.max(60, (openExam.durationMinutes || 30) * 60);
      const timeSpentSeconds = Math.max(1, totalSecs - remainingRef.current);

      const responses = openExam.questions.map((q) =>
        q.type === 'essay'
          ? { questionId: q.id, essayAnswer: essays[q.id] || '' }
          : { questionId: q.id, selectedIndex: choices[q.id] ?? -1 }
      );

      try {
        const res = await apiRequest<{ submission: ComprehensiveSubmission }>(
          `/api/comprehensive-exams/${openExam.id}/submit`,
          {
            method: 'POST',
            body: JSON.stringify({ responses, timeSpentSeconds }),
          }
        );
        setJustSubmitted(res.submission);
        setMySubmissions((prev) => [
          res.submission,
          ...prev.filter((s) => s.id !== res.submission.id),
        ]);
        if (user) {
          try {
            window.sessionStorage.removeItem(
              `mvia_cexam_deadline_${user.id}_${openExam.id}`
            );
          } catch {
            // Ignore
          }
        }
        window.dispatchEvent(new CustomEvent('mvia:comprehensive-exam-changed'));
      } catch (err) {
        setSubmitError(
          err instanceof Error
            ? err.message
            : tr('تعذر تسليم الامتحان الشامل.', 'Could not submit comprehensive exam.')
        );
      } finally {
        submittingRef.current = false;
        setSubmitting(false);
      }
    },
    [justSubmitted, openExam, tr]
  );

  // Live countdown timer while taking exam
  useEffect(() => {
    if (!openExam || justSubmitted) return;
    const timer = window.setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          window.clearInterval(timer);
          void handleSubmitExam(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [handleSubmitExam, justSubmitted, openExam]);

  if (!user) return null;

  const isAnyModalOpen = Boolean(openExam || openReviewSub);

  return (
    <>
      {/* Persistent Top News Bar whenever at least one comprehensive exam is active */}
      {activeExams.length > 0 && (
        <div className="relative z-30 border-b border-[#D4AF37]/45 bg-gradient-to-l from-[#FBF4DE] via-[#F7ECC8] to-[#FBF4DE] dark:from-[#1E190C] dark:via-[#171410] dark:to-[#1E190C]">
          <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2.5 flex flex-col gap-2">
            {activeExams.map((exam) => {
              const mySub = mySubmissions.find((s) => s.examId === exam.id);
              const status = mySub?.status || exam.mySubmissionStatus;

              return (
                <button
                  key={exam.id}
                  type="button"
                  onClick={() => handleOpenExamFromBanner(exam)}
                  className="w-full text-start flex flex-wrap items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl bg-white/90 dark:bg-[#0D0D10]/85 border border-[#D4AF37]/40 hover:border-[#D4AF37] dark:hover:border-[#F5D061] hover:bg-white dark:hover:bg-[#121216] transition-all cursor-pointer group"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="p-2 rounded-lg bg-[#D4AF37]/20 border border-[#D4AF37]/45 text-[#735303] dark:text-[#F5D061] shrink-0">
                      <Megaphone className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-[#735303] dark:text-[#F5D061]">
                        <span className="text-[#141418] dark:text-[#F5F0E6] text-sm">
                          {tr(
                            `الامتحان الشامل لمادة ${exam.subjectName}`,
                            `Comprehensive Exam: ${exam.subjectName}`
                          )}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="px-2 py-0.5 rounded bg-[#D4AF37]/15 border border-[#D4AF37]/35 text-[11px]">
                          {exam.targetYear === 0
                            ? tr('جميع الفرق', 'All Years')
                            : formatYear(exam.targetYear)}
                        </span>
                      </div>
                      <div className="text-xs text-[#3F3D38] dark:text-[#C8C2B8] font-mono tabular-nums">
                        {tr(`المدة: ${exam.durationMinutes} دقيقة`, `Duration: ${exam.durationMinutes} min`)}
                        {' · '}
                        {exam.questionsCount} {tr('سؤال', 'questions')}
                        {status === 'pending_grading'
                          ? ` · ${tr('تم التسليم — في انتظار التصحيح اليدوي', 'Submitted — Pending Grading')}`
                          : status === 'graded'
                          ? ` · ${tr('تم نشر الدرجة في ملفك الشخصي — اضغط للمراجعة', 'Graded — Published in your profile')}`
                          : ` · ${tr('اضغط هنا للبدء بالحل الآن', 'Click here to start solving now')}`}
                      </div>
                    </div>
                  </div>

                  <span className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#D4AF37] text-[#09090B] font-bold text-xs whitespace-nowrap shrink-0 group-hover:bg-[#F5D061] transition-colors">
                    {status === 'pending_grading' ? (
                      <>
                        <Hourglass className="w-3.5 h-3.5" />
                        <span>{tr('في انتظار التصحيح', 'Pending Grading')}</span>
                      </>
                    ) : status === 'graded' ? (
                      <>
                        <ClipboardCheck className="w-3.5 h-3.5" />
                        <span>{tr('عرض الدرجة والأخطاء', 'View Score & Mistakes')}</span>
                      </>
                    ) : (
                      <>
                        <span>{tr('ابدأ الامتحان الآن', 'Start Exam Now')}</span>
                        <ArrowRight className={`w-3.5 h-3.5 ${isEn ? '' : 'rotate-180'}`} />
                      </>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Modal: Either Active Exam Runner OR Pending/Graded Review */}
      {isAnyModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 overflow-y-auto"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-4xl max-h-[92vh] flex flex-col rounded-2xl bg-white dark:bg-[#121216] border border-[#D4AF37]/40 shadow-[0_24px_80px_rgba(0,0,0,0.85)] overflow-hidden">
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-black/10 dark:border-white/10 bg-[#EFECE4] dark:bg-[#0D0D10] flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <FileText className="w-5 h-5 text-[#9A7209] dark:text-[#D4AF37] shrink-0" />
                <div className="min-w-0">
                  <h2 className="font-display text-base sm:text-lg font-bold text-[#141418] dark:text-[#F5F0E6] truncate">
                    {openExam
                      ? `${tr('الامتحان الشامل:', 'Comprehensive Exam:')} ${openExam.subjectName}`
                      : openReviewSub
                      ? `${tr('مراجعة الامتحان الشامل:', 'Exam Review:')} ${openReviewSub.subjectName}`
                      : ''}
                  </h2>
                </div>
              </div>

              <div className="flex items-center gap-2.5 shrink-0">
                {openExam && !justSubmitted && (
                  <div
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border font-mono text-sm font-bold tabular-nums ${
                      remainingSeconds <= 60
                        ? 'bg-red-50 dark:bg-red-950/75 border-red-500/60 text-red-700 dark:text-red-200'
                        : 'bg-[#F5F2EA] dark:bg-[#151519] border-[#D4AF37]/45 text-[#735303] dark:text-[#F5D061]'
                    }`}
                  >
                    <Clock className="w-4 h-4" />
                    <span>{formatSecondsMMSS(remainingSeconds)}</span>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setOpenExam(null);
                    setOpenReviewSub(null);
                    setJustSubmitted(null);
                  }}
                  aria-label={tr('إغلاق', 'Close')}
                  className="p-2 rounded-lg text-[#5C5850] dark:text-[#A8A29E] hover:text-[#141418] dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-5">
              {openReviewSub ? (
                <ComprehensiveSubmissionReviewView
                  submission={openReviewSub}
                  onClose={() => setOpenReviewSub(null)}
                />
              ) : justSubmitted ? (
                <ComprehensiveSubmissionReviewView
                  submission={justSubmitted}
                  onClose={() => {
                    setOpenExam(null);
                    setJustSubmitted(null);
                  }}
                />
              ) : openExam ? (
                <>
                  {/* Exam Meta Summary */}
                  <div className="p-3.5 rounded-xl bg-[#EFECE4] dark:bg-[#0D0D10] border border-black/10 dark:border-white/10 flex flex-wrap items-center justify-between gap-2 text-xs text-[#3F3D38] dark:text-[#C8C2B8]">
                    <span>
                      {tr(
                        'يتم تصحيح جميع الأسئلة يدوياً من قِبل الأدمن. ركز جيداً في إجاباتك.',
                        'All questions are graded manually by the Admin.'
                      )}
                    </span>
                    <span className="font-mono text-[#856104] dark:text-[#E5C158] tabular-nums">
                      {openExam.questions.length} {tr('سؤال', 'Questions')} ·{' '}
                      {openExam.totalPoints} {tr('درجة', 'Points')}
                    </span>
                  </div>

                  {submitError && (
                    <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-500/40 text-red-700 dark:text-red-200 text-xs flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>{submitError}</span>
                    </div>
                  )}

                  {/* Questions List */}
                  <div className="space-y-4">
                    {openExam.questions.map((q, idx) => {
                      const typeLabel =
                        q.type === 'mcq'
                          ? tr('سؤال اختياري', 'Multiple Choice')
                          : q.type === 'true_false'
                          ? tr('صح وغلط', 'True / False')
                          : tr('سؤال مقالي', 'Essay Question');

                      return (
                        <div
                          key={q.id}
                          className="p-4 sm:p-5 rounded-xl bg-[#EFECE4] dark:bg-[#0D0D10] border border-black/10 dark:border-white/10 space-y-3.5"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="text-sm sm:text-base font-semibold text-[#141418] dark:text-[#F5F0E6] leading-relaxed">
                              <span
                                className={`font-mono text-[#9A7209] dark:text-[#D4AF37] tabular-nums ${
                                  isEn ? 'mr-2' : 'ml-2'
                                }`}
                              >
                                {idx + 1}.
                              </span>
                              {q.question}
                            </div>

                            <div className="flex items-center gap-2 text-xs text-[#5C5850] dark:text-[#A8A29E] shrink-0">
                              <span>{typeLabel}</span>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono text-[#856104] dark:text-[#E5C158] tabular-nums">
                                {q.points} {tr('درجة', 'pts')}
                              </span>
                            </div>
                          </div>

                          {q.type === 'essay' ? (
                            <textarea
                              rows={4}
                              value={essayTexts[q.id] || ''}
                              onChange={(e) =>
                                setEssayTexts((prev) => ({
                                  ...prev,
                                  [q.id]: e.target.value,
                                }))
                              }
                              placeholder={tr(
                                'اكتب إجابتك المقالية بالتفصيل هنا...',
                                'Write your detailed essay answer here...'
                              )}
                              className="w-full px-3.5 py-2.5 rounded-xl bg-[#F5F2EA] dark:bg-[#151519] border border-black/10 dark:border-white/10 text-sm text-[#141418] dark:text-[#F5F0E6] leading-relaxed focus:outline-none focus:border-[#D4AF37]"
                            />
                          ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                              {(q.options || (q.type === 'true_false' ? ['صح', 'خطأ'] : [])).map(
                                (opt, optIdx) => {
                                  const isSelected = selectedChoices[q.id] === optIdx;
                                  return (
                                    <button
                                      key={optIdx}
                                      type="button"
                                      onClick={() =>
                                        setSelectedChoices((prev) => ({
                                          ...prev,
                                          [q.id]: optIdx,
                                        }))
                                      }
                                      className={`${
                                        isEn ? 'text-left' : 'text-right'
                                      } px-4 py-2.5 rounded-xl text-sm font-medium border transition-colors cursor-pointer ${
                                        isSelected
                                          ? 'bg-[#D4AF37] border-[#E5C158] text-[#09090B] font-bold'
                                          : 'bg-[#F5F2EA] dark:bg-[#151519] border-black/10 dark:border-white/10 text-[#3F3D38] dark:text-[#C8C2B8] hover:border-[#D4AF37]/50'
                                      }`}
                                    >
                                      {opt}
                                    </button>
                                  );
                                }
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-black/10 dark:border-white/10">
                    <span className="text-xs text-[#5C5850] dark:text-[#A8A29E]">
                      {tr(
                        'بعد التسليم سيظهر لك أن الامتحان في انتظار التصحيح اليدوي.',
                        'After submission, your exam enters manual grading.'
                      )}
                    </span>
                    <GoldChip
                      active={true}
                      disabled={submitting}
                      onClick={() => void handleSubmitExam(false)}
                      className="px-6 py-2.5"
                    >
                      <Send className="w-4 h-4" />
                      <span>
                        {submitting
                          ? tr('جاري التسليم...', 'Submitting...')
                          : tr('تسليم الامتحان الشامل', 'Submit Exam')}
                      </span>
                    </GoldChip>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
