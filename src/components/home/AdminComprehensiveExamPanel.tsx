import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  EyeOff,
  FilePlus2,
  Hourglass,
  Megaphone,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import type {
  ComprehensiveExamAdmin,
  ComprehensiveQuestionType,
  ComprehensiveSubmission,
} from '../../types';
import { apiRequest } from '../../utils/api';
import { hasAdminPermission } from '../../utils/permissions';
import { GoldChip } from '../ui/GoldChip';

interface DraftQuestion {
  type: ComprehensiveQuestionType;
  question: string;
  points: number;
  options: string[];
  correctIndex: number | undefined;
  modelAnswer: string;
}

interface DraftGradeItem {
  questionId: string;
  awardedPoints: number;
  isCorrect: boolean;
  correctAnswerText: string;
  adminFeedback: string;
}

export function AdminComprehensiveExamPanel({
  embeddedInModal = false,
}: {
  embeddedInModal?: boolean;
}) {
  const { user } = useAuth();
  const { tr, formatYear, isEn } = useLanguage();

  const canManage =
    user?.role === 'admin' && hasAdminPermission(user, 'manage_quizzes');

  const [activeTab, setActiveTab] = useState<'manage' | 'create'>('manage');
  const [exams, setExams] = useState<ComprehensiveExamAdmin[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Create form state
  const [subjectName, setSubjectName] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [announcementDurationValue, setAnnouncementDurationValue] = useState(24);
  const [announcementDurationUnit, setAnnouncementDurationUnit] = useState<
    'minutes' | 'hours' | 'days'
  >('hours');
  const [targetYear, setTargetYear] = useState<number>(0);
  const [questions, setQuestions] = useState<DraftQuestion[]>([
    {
      type: 'mcq',
      question: '',
      points: 5,
      options: ['', '', '', ''],
      correctIndex: 0,
      modelAnswer: '',
    },
  ]);
  const [creating, setCreating] = useState(false);

  // Manual grading modal state
  const [gradingContext, setGradingContext] = useState<{
    exam: ComprehensiveExamAdmin;
    submission: ComprehensiveSubmission;
  } | null>(null);
  const [gradeItems, setGradeItems] = useState<Record<string, DraftGradeItem>>({});
  const [adminNote, setAdminNote] = useState('');
  const [savingGrade, setSavingGrade] = useState(false);

  const loadExams = useCallback(async () => {
    if (!canManage) return;
    setLoading(true);
    try {
      const res = await apiRequest<{ exams: ComprehensiveExamAdmin[] }>(
        '/api/admin/comprehensive-exams'
      );
      setExams(res.exams || []);
    } catch {
      // Ignore
    } finally {
      setLoading(false);
    }
  }, [canManage]);

  useEffect(() => {
    void loadExams();
    const onChanged = () => void loadExams();
    window.addEventListener('mvia:comprehensive-exam-changed', onChanged);
    return () =>
      window.removeEventListener('mvia:comprehensive-exam-changed', onChanged);
  }, [loadExams]);

  if (!canManage) return null;

  const addQuestion = (type: ComprehensiveQuestionType) => {
    setQuestions((prev) => [
      ...prev,
      type === 'mcq'
        ? {
            type: 'mcq',
            question: '',
            points: 5,
            options: ['', '', '', ''],
            correctIndex: 0,
            modelAnswer: '',
          }
        : type === 'true_false'
        ? {
            type: 'true_false',
            question: '',
            points: 2,
            options: ['صح', 'خطأ'],
            correctIndex: 0,
            modelAnswer: '',
          }
        : {
            type: 'essay',
            question: '',
            points: 10,
            options: [],
            correctIndex: undefined,
            modelAnswer: '',
          },
    ]);
  };

  const removeQuestion = (idx: number) => {
    if (questions.length <= 1) return;
    setQuestions((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleCreateExam = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setStatusMsg(null);

    if (!subjectName.trim()) {
      setErrorMsg(tr('يرجى إدخال اسم المادة.', 'Please enter the subject name.'));
      return;
    }

    for (const q of questions) {
      if (!q.question.trim()) {
        setErrorMsg(
          tr('يرجى كتابة نص كل سؤال قبل النشر.', 'Please write every question text.')
        );
        return;
      }
      if (q.type === 'mcq' && q.options.filter((o) => o.trim()).length < 2) {
        setErrorMsg(
          tr(
            'كل سؤال اختياري يحتاج خيارين على الأقل.',
            'Every MCQ question requires at least 2 options.'
          )
        );
        return;
      }
    }

    const multiplier =
      announcementDurationUnit === 'days'
        ? 1440
        : announcementDurationUnit === 'hours'
        ? 60
        : 1;
    const computedAnnouncementMinutes = Math.max(
      1,
      Math.min(43200, Math.round((Number(announcementDurationValue) || 1) * multiplier))
    );

    setCreating(true);
    try {
      await apiRequest('/api/admin/comprehensive-exams', {
        method: 'POST',
        body: JSON.stringify({
          subjectName: subjectName.trim(),
          durationMinutes,
          announcementDurationMinutes: computedAnnouncementMinutes,
          targetYear,
          questions: questions.map((q) => ({
            type: q.type,
            question: q.question.trim(),
            points: q.points,
            options: q.type === 'mcq' ? q.options : q.type === 'true_false' ? ['صح', 'خطأ'] : undefined,
            correctIndex: q.type === 'essay' ? undefined : q.correctIndex,
            modelAnswer: q.modelAnswer.trim() || undefined,
          })),
        }),
      });
      setSubjectName('');
      setDurationMinutes(30);
      setAnnouncementDurationValue(24);
      setAnnouncementDurationUnit('hours');
      setTargetYear(0);
      setQuestions([
        {
          type: 'mcq',
          question: '',
          points: 5,
          options: ['', '', '', ''],
          correctIndex: 0,
          modelAnswer: '',
        },
      ]);
      setStatusMsg(
        tr(
          'تم نشر الامتحان الشامل وظهور الخبر للمستهدفين طوال المدة الزمنية المعلنة.',
          'Comprehensive exam published and visible for the announced duration.'
        )
      );
      setActiveTab('manage');
      window.dispatchEvent(new CustomEvent('mvia:comprehensive-exam-changed'));
      await loadExams();
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : tr('تعذر إنشاء الامتحان الشامل.', 'Failed to create comprehensive exam.')
      );
    } finally {
      setCreating(false);
    }
  };

  const handleToggleBanner = async (exam: ComprehensiveExamAdmin, activate: boolean) => {
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      await apiRequest(
        `/api/admin/comprehensive-exams/${exam.id}/${activate ? 'activate' : 'deactivate'}`,
        { method: 'POST' }
      );
      setStatusMsg(
        activate
          ? tr('تم إعادة إظهار خبر الامتحان الشامل في أعلى الشاشة.', 'Exam banner re-activated.')
          : tr(
              'تم إزالة الامتحان وإخفاء الخبر من أعلى الشاشة؛ يمكنك الآن البدء في التصحيح اليدوي وإرسال الدرجات.',
              'Exam banner removed from top of screen. You can now grade submissions manually.'
            )
      );
      window.dispatchEvent(new CustomEvent('mvia:comprehensive-exam-changed'));
      await loadExams();
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : tr('تعذر تحديث حالة الامتحان.', 'Failed to update exam.')
      );
    }
  };

  const handleDeleteExam = async (examId: string) => {
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      await apiRequest(`/api/admin/comprehensive-exams/${examId}`, {
        method: 'DELETE',
      });
      setConfirmDeleteId(null);
      setStatusMsg(tr('تم حذف الامتحان الشامل نهائياً.', 'Comprehensive exam deleted.'));
      window.dispatchEvent(new CustomEvent('mvia:comprehensive-exam-changed'));
      await loadExams();
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : tr('تعذر حذف الامتحان.', 'Failed to delete exam.')
      );
    }
  };

  const openGradingSheet = (
    exam: ComprehensiveExamAdmin,
    submission: ComprehensiveSubmission
  ) => {
    const initialGrades: Record<string, DraftGradeItem> = {};
    for (const ans of submission.answers) {
      const origQ = exam.questions.find((q) => q.id === ans.questionId);
      let refCorrect = ans.correctAnswerText || '';
      if (!refCorrect && origQ) {
        if (
          (origQ.type === 'mcq' || origQ.type === 'true_false') &&
          typeof origQ.correctIndex === 'number' &&
          origQ.options?.[origQ.correctIndex]
        ) {
          refCorrect = origQ.options[origQ.correctIndex];
        } else if (origQ.modelAnswer) {
          refCorrect = origQ.modelAnswer;
        }
      }

      // Smart pre-fill if admin previously marked a reference key, still 100% editable manually
      let initialPts = ans.awardedPoints ?? 0;
      let initialCorrect = ans.isCorrect ?? false;
      if (
        submission.status === 'pending_grading' &&
        origQ &&
        (origQ.type === 'mcq' || origQ.type === 'true_false') &&
        typeof origQ.correctIndex === 'number'
      ) {
        const matched = ans.selectedIndex === origQ.correctIndex;
        initialCorrect = matched;
        initialPts = matched ? ans.maxPoints : 0;
      }

      initialGrades[ans.questionId] = {
        questionId: ans.questionId,
        awardedPoints: initialPts,
        isCorrect: initialCorrect,
        correctAnswerText: refCorrect,
        adminFeedback: ans.adminFeedback || '',
      };
    }

    setGradeItems(initialGrades);
    setAdminNote(submission.adminNote || '');
    setGradingContext({ exam, submission });
  };

  const handleSaveManualGrades = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gradingContext) return;
    setSavingGrade(true);
    setErrorMsg(null);
    setStatusMsg(null);

    try {
      const grades = Object.values(gradeItems);
      await apiRequest(
        `/api/admin/comprehensive-exams/${gradingContext.exam.id}/submissions/${gradingContext.submission.id}/grade`,
        {
          method: 'POST',
          body: JSON.stringify({
            grades,
            adminNote: adminNote.trim() || undefined,
          }),
        }
      );
      setStatusMsg(
        tr(
          `تم تصحيح وإرسال درجة "${gradingContext.submission.studentName}" بنجاح.`,
          `Grades sent to "${gradingContext.submission.studentName}" successfully.`
        )
      );
      setGradingContext(null);
      window.dispatchEvent(new CustomEvent('mvia:comprehensive-exam-changed'));
      await loadExams();
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : tr('تعذر إرسال الدرجة.', 'Failed to send grade.')
      );
    } finally {
      setSavingGrade(false);
    }
  };

  const liveGradingTotal = gradingContext
    ? Object.values(gradeItems).reduce((s, item) => s + (Number(item.awardedPoints) || 0), 0)
    : 0;
  const liveGradingMax = gradingContext
    ? gradingContext.submission.answers.reduce((s, a) => s + (Number(a.maxPoints) || 1), 0)
    : 0;

  return (
    <section
      className={
        embeddedInModal
          ? 'space-y-5'
          : 'rounded-2xl border border-[#D4AF37]/35 bg-white dark:bg-[#121216] p-5 sm:p-6 space-y-5'
      }
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-black/10 dark:border-white/10 pb-4">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-[#D4AF37]/15 border border-[#D4AF37]/40 text-[#735303] dark:text-[#F5D061] shrink-0">
            <ClipboardCheck className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h2 className="font-display text-lg sm:text-xl font-bold text-[#141418] dark:text-[#F5F0E6]">
              {tr('الامتحان الشامل والتصحيح اليدوي (للأدمن فقط)', 'Comprehensive Exam & Manual Grading (Admin Only)')}
            </h2>
            <p className="text-xs text-[#5C5850] dark:text-[#A8A29E] leading-relaxed">
              {tr(
                'أضف امتحاناً شاملاً (اختياري · صح وغلط · مقالي) ليظهر كخبر في أعلى شاشة جميع الطلاب، وعند إزالة الامتحان يختفي الخبر وتبدأ التصحيح اليدوي وإرسال الدرجات.',
                'Publish a comprehensive exam (MCQ · True/False · Essay) as a top announcement banner, remove it when done, and manually grade & send student scores.'
              )}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <GoldChip
            active={activeTab === 'manage'}
            onClick={() => setActiveTab('manage')}
            className="text-xs px-3.5 py-2"
          >
            <Megaphone className="w-3.5 h-3.5" />
            <span>
              {tr('الامتحانات والتصحيح', 'Exams & Grading')} ({exams.length})
            </span>
          </GoldChip>
          <GoldChip
            active={activeTab === 'create'}
            onClick={() => setActiveTab('create')}
            className="text-xs px-3.5 py-2"
          >
            <FilePlus2 className="w-3.5 h-3.5" />
            <span>{tr('إنشاء امتحان شامل', 'New Exam')}</span>
          </GoldChip>
        </div>
      </div>

      {statusMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-500/40 text-emerald-800 dark:text-emerald-200 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{statusMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-500/40 text-red-700 dark:text-red-200 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* TAB 1: CREATE COMPREHENSIVE EXAM */}
      {activeTab === 'create' && (
        <form onSubmit={handleCreateExam} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 p-4 rounded-xl bg-[#EFECE4] dark:bg-[#0D0D10] border border-black/10 dark:border-white/10">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-[#856104] dark:text-[#E5C158]">
                {tr('اسم المادة', 'Subject Name')}
              </label>
              <input
                type="text"
                required
                value={subjectName}
                onChange={(e) => setSubjectName(e.target.value)}
                placeholder={tr('مثال: نظم المعلومات الجغرافية GIS', 'e.g. Geographic Information Systems')}
                className="w-full px-3.5 py-2 rounded-lg bg-[#F5F2EA] dark:bg-[#151519] border border-black/15 dark:border-white/15 text-sm text-[#141418] dark:text-[#F5F0E6] focus:outline-none focus:border-[#D4AF37]"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-[#856104] dark:text-[#E5C158]">
                {tr('الفرقة المستهدفة', 'Target Year')}
              </label>
              <select
                value={targetYear}
                onChange={(e) => setTargetYear(Number(e.target.value))}
                className="w-full px-3.5 py-2 rounded-lg bg-[#F5F2EA] dark:bg-[#151519] border border-black/15 dark:border-white/15 text-sm text-[#141418] dark:text-[#F5F0E6] focus:outline-none focus:border-[#D4AF37]"
              >
                <option value={0}>{tr('جميع الدفعات', 'All Academic Years')}</option>
                <option value={1}>{formatYear(1)}</option>
                <option value={2}>{formatYear(2)}</option>
                <option value={3}>{formatYear(3)}</option>
                <option value={4}>{formatYear(4)}</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-[#856104] dark:text-[#E5C158]">
                {tr('مدة الحل للطالب (بالدقائق)', 'Exam Timer (Minutes)')}
              </label>
              <input
                type="number"
                min={1}
                max={360}
                required
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Math.max(1, Number(e.target.value) || 30))}
                className="w-full px-3.5 py-2 rounded-lg bg-[#F5F2EA] dark:bg-[#151519] border border-black/15 dark:border-white/15 text-sm text-[#141418] dark:text-[#F5F0E6] font-mono tabular-nums focus:outline-none focus:border-[#D4AF37]"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-[#856104] dark:text-[#E5C158]">
                {tr('المدة الزمنية المعلنة للخبر', 'Published Banner Duration')}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={announcementDurationUnit === 'minutes' ? 43200 : announcementDurationUnit === 'hours' ? 720 : 30}
                  required
                  value={announcementDurationValue}
                  onChange={(e) =>
                    setAnnouncementDurationValue(Math.max(1, Number(e.target.value) || 1))
                  }
                  className="w-24 px-3 py-2 rounded-lg bg-[#F5F2EA] dark:bg-[#151519] border border-black/15 dark:border-white/15 text-sm text-[#141418] dark:text-[#F5F0E6] font-mono tabular-nums focus:outline-none focus:border-[#D4AF37]"
                />
                <select
                  value={announcementDurationUnit}
                  onChange={(e) =>
                    setAnnouncementDurationUnit(
                      e.target.value as 'minutes' | 'hours' | 'days'
                    )
                  }
                  className="flex-1 px-2.5 py-2 rounded-lg bg-[#F5F2EA] dark:bg-[#151519] border border-black/15 dark:border-white/15 text-sm text-[#141418] dark:text-[#F5F0E6] focus:outline-none focus:border-[#D4AF37]"
                >
                  <option value="minutes">{tr('دقيقة', 'Minutes')}</option>
                  <option value="hours">{tr('ساعة', 'Hours')}</option>
                  <option value="days">{tr('يوم', 'Days')}</option>
                </select>
              </div>
              <p className="text-[11px] text-[#5C5850] dark:text-[#A8A29E] leading-snug">
                {tr(
                  'تختفي الرسالة تلقائياً بعد انتهاء هذه المدة ولا تظهر مجدداً إلا عند نشر امتحان جديد.',
                  'Banner disappears automatically after this duration until a new exam is published.'
                )}
              </p>
            </div>
          </div>

          {/* Questions Builder */}
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-[#141418] dark:text-[#F5F0E6]">
                {tr('أسئلة الامتحان الشامل', 'Comprehensive Exam Questions')} ({questions.length})
              </h3>
              <div className="flex flex-wrap items-center gap-2">
                <GoldChip
                  type="button"
                  onClick={() => addQuestion('mcq')}
                  className="text-xs px-3 py-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{tr('سؤال اختياري', 'Add MCQ')}</span>
                </GoldChip>
                <GoldChip
                  type="button"
                  onClick={() => addQuestion('true_false')}
                  className="text-xs px-3 py-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{tr('صح وغلط', 'Add True/False')}</span>
                </GoldChip>
                <GoldChip
                  type="button"
                  onClick={() => addQuestion('essay')}
                  className="text-xs px-3 py-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{tr('سؤال مقالي', 'Add Essay')}</span>
                </GoldChip>
              </div>
            </div>

            {questions.map((q, qIdx) => {
              const typeTitle =
                q.type === 'mcq'
                  ? tr('اختياري (MCQ)', 'Multiple Choice')
                  : q.type === 'true_false'
                  ? tr('صح وغلط', 'True / False')
                  : tr('مقالي (Essay)', 'Essay');

              return (
                <div
                  key={qIdx}
                  className="p-4 rounded-xl bg-[#EFECE4] dark:bg-[#0D0D10] border border-black/10 dark:border-white/10 space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-[#9A7209] dark:text-[#D4AF37] tabular-nums">
                        #{qIdx + 1}
                      </span>
                      <span className="px-2.5 py-0.5 rounded-md bg-[#ECE8DE] dark:bg-[#18181D] border border-[#D4AF37]/30 text-xs font-semibold text-[#735303] dark:text-[#F5D061]">
                        {typeTitle}
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-1.5 text-xs text-[#3F3D38] dark:text-[#C8C2B8]">
                        <span>{tr('الدرجة:', 'Points:')}</span>
                        <input
                          type="number"
                          min={1}
                          max={100}
                          value={q.points}
                          onChange={(e) => {
                            const next = [...questions];
                            next[qIdx].points = Math.max(1, Number(e.target.value) || 1);
                            setQuestions(next);
                          }}
                          className="w-16 px-2 py-1 rounded-md bg-[#F5F2EA] dark:bg-[#151519] border border-black/15 dark:border-white/15 text-xs text-[#141418] dark:text-[#F5F0E6] font-mono tabular-nums"
                        />
                      </label>

                      {questions.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeQuestion(qIdx)}
                          className="text-xs text-red-600 dark:text-red-400 hover:text-red-300 inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>{tr('حذف', 'Delete')}</span>
                        </button>
                      )}
                    </div>
                  </div>

                  <textarea
                    rows={2}
                    required
                    value={q.question}
                    onChange={(e) => {
                      const next = [...questions];
                      next[qIdx].question = e.target.value;
                      setQuestions(next);
                    }}
                    placeholder={tr('اكتب نص السؤال هنا...', 'Enter question prompt...')}
                    className="w-full px-3.5 py-2 rounded-lg bg-[#F5F2EA] dark:bg-[#151519] border border-black/10 dark:border-white/10 text-sm text-[#141418] dark:text-[#F5F0E6] focus:outline-none focus:border-[#D4AF37]"
                  />

                  {q.type === 'mcq' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {q.options.map((opt, optIdx) => (
                        <div key={optIdx} className="flex items-center gap-2">
                          <input
                            type="radio"
                            name={`comp-mcq-ref-${qIdx}`}
                            checked={q.correctIndex === optIdx}
                            onChange={() => {
                              const next = [...questions];
                              next[qIdx].correctIndex = optIdx;
                              setQuestions(next);
                            }}
                            title={tr('إجابة مرجعية للأدمن عند التصحيح', 'Reference answer for grading')}
                            className="accent-[#D4AF37] cursor-pointer"
                          />
                          <input
                            type="text"
                            value={opt}
                            onChange={(e) => {
                              const next = [...questions];
                              next[qIdx].options[optIdx] = e.target.value;
                              setQuestions(next);
                            }}
                            placeholder={tr(`الخيار ${optIdx + 1}`, `Option ${optIdx + 1}`)}
                            className="flex-1 px-3 py-1.5 rounded-lg bg-[#F5F2EA] dark:bg-[#151519] border border-black/10 dark:border-white/10 text-xs text-[#141418] dark:text-[#F5F0E6] focus:outline-none focus:border-[#D4AF37]"
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  {q.type === 'true_false' && (
                    <div className="flex flex-wrap items-center gap-4 text-xs text-[#3F3D38] dark:text-[#C8C2B8]">
                      <span>{tr('الإجابة المرجعية (للمراجعة أثناء التصحيح اليدوي):', 'Reference Key:')}</span>
                      {['صح', 'خطأ'].map((label, optIdx) => (
                        <label key={label} className="inline-flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="radio"
                            name={`comp-tf-ref-${qIdx}`}
                            checked={q.correctIndex === optIdx}
                            onChange={() => {
                              const next = [...questions];
                              next[qIdx].correctIndex = optIdx;
                              setQuestions(next);
                            }}
                            className="accent-[#D4AF37]"
                          />
                          <span>{label}</span>
                        </label>
                      ))}
                    </div>
                  )}

                  <input
                    type="text"
                    value={q.modelAnswer}
                    onChange={(e) => {
                      const next = [...questions];
                      next[qIdx].modelAnswer = e.target.value;
                      setQuestions(next);
                    }}
                    placeholder={
                      q.type === 'essay'
                        ? tr('نموذج الإجابة / معيار التصحيح (اختياري — يظهر للطالب بعد التصحيح)', 'Model answer / grading note (optional)')
                        : tr('توضيح الإجابة (اختياري — يظهر للطالب عند مراجعة أخطائه)', 'Explanation shown to student after grading (optional)')
                    }
                    className="w-full px-3 py-1.5 rounded-lg bg-[#F5F2EA] dark:bg-[#151519] border border-black/10 dark:border-white/10 text-xs text-[#3F3D38] dark:text-[#C8C2B8] focus:outline-none focus:border-[#D4AF37]"
                  />
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
            <GoldChip type="submit" active={true} disabled={creating} className="px-6 py-2.5">
              <Send className="w-4 h-4" />
              <span>
                {creating
                  ? tr('جاري النشر...', 'Publishing...')
                  : tr('نشر الامتحان الشامل وإظهار الخبر للطلاب', 'Publish Comprehensive Exam & Show Top News')}
              </span>
            </GoldChip>
          </div>
        </form>
      )}

      {/* TAB 2: MANAGE EXAMS & MANUAL GRADING QUEUE */}
      {activeTab === 'manage' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-[#5C5850] dark:text-[#A8A29E]">
              {tr(
                'عند إزالة الامتحان من الأعلى يختفي الخبر فوراً لدى جميع الطلاب وتبقى التسليمات للتصحيح اليدوي.',
                'Deactivating removes the top banner immediately while keeping student submissions for grading.'
              )}
            </span>
            <GoldChip onClick={() => void loadExams()} disabled={loading} className="text-xs px-3 py-1.5">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>{tr('تحديث', 'Refresh')}</span>
            </GoldChip>
          </div>

          {exams.length === 0 ? (
            <div className="p-8 rounded-xl bg-[#EFECE4] dark:bg-[#0D0D10] border border-black/10 dark:border-white/10 text-center space-y-3">
              <p className="text-sm text-[#5C5850] dark:text-[#A8A29E]">
                {tr('لا توجد امتحانات شاملة مضافة حالياً.', 'No comprehensive exams created yet.')}
              </p>
              <GoldChip active={true} onClick={() => setActiveTab('create')} className="text-xs px-4 py-2">
                <Plus className="w-4 h-4" />
                <span>{tr('إضافة امتحان شامل الآن', 'Create Comprehensive Exam')}</span>
              </GoldChip>
            </div>
          ) : (
            <div className="space-y-4">
              {exams.map((exam) => (
                <div
                  key={exam.id}
                  className="p-4 sm:p-5 rounded-xl bg-[#EFECE4] dark:bg-[#0D0D10] border border-black/10 dark:border-white/10 space-y-4"
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-display text-base font-bold text-[#141418] dark:text-[#F5F0E6]">
                          {exam.subjectName}
                        </h3>
                        {exam.isActive ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/80 border border-emerald-500/40 text-emerald-700 dark:text-emerald-300 text-xs font-semibold">
                            <Megaphone className="w-3 h-3" />
                            <span>{tr('الخبر ظاهر بالمنصة', 'Banner Active')}</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-[#ECE8DE] dark:bg-[#18181D] border border-black/15 dark:border-white/15 text-[#5C5850] dark:text-[#A8A29E] text-xs font-semibold">
                            <EyeOff className="w-3 h-3" />
                            <span>{tr('تمت إزالة الخبر', 'Banner Hidden')}</span>
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-xs text-[#5C5850] dark:text-[#A8A29E] font-mono tabular-nums">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-[#9A7209] dark:text-[#D4AF37]" />
                          {exam.durationMinutes} {tr('دقيقة', 'min')}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{exam.questions.length} {tr('سؤال', 'questions')}</span>
                        <span aria-hidden="true">·</span>
                        <span>
                          {exam.targetYear === 0
                            ? tr('كل الدفعات', 'All Years')
                            : formatYear(exam.targetYear)}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="text-amber-800 dark:text-amber-300">
                          {tr(`بانتظار التصحيح: ${exam.pendingCount}`, `Pending: ${exam.pendingCount}`)}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="text-emerald-700 dark:text-emerald-300">
                          {tr(`تم التصحيح: ${exam.gradedCount}`, `Graded: ${exam.gradedCount}`)}
                        </span>
                        {exam.announcementExpiresAt && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>
                              {exam.isActive
                                ? `${tr('يختفي الخبر:', 'Expires:')} ${new Date(
                                    exam.announcementExpiresAt
                                  ).toLocaleString()}`
                                : `${tr('انتهت مدة الإعلان:', 'Expired:')} ${new Date(
                                    exam.announcementExpiresAt
                                  ).toLocaleString()}`}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {exam.isActive ? (
                        <GoldChip
                          active={true}
                          onClick={() => void handleToggleBanner(exam, false)}
                          className="text-xs px-3.5 py-2"
                        >
                          <EyeOff className="w-3.5 h-3.5" />
                          <span>{tr('إزالة الامتحان وإخفاء الخبر', 'Remove Exam & Hide Banner')}</span>
                        </GoldChip>
                      ) : (
                        <GoldChip
                          onClick={() => void handleToggleBanner(exam, true)}
                          className="text-xs px-3 py-1.5"
                        >
                          <Megaphone className="w-3.5 h-3.5" />
                          <span>{tr('إعادة إظهار الخبر', 'Re-show Banner')}</span>
                        </GoldChip>
                      )}

                      {confirmDeleteId === exam.id ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => void handleDeleteExam(exam.id)}
                            className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-500 cursor-pointer"
                          >
                            {tr('تأكيد الحذف النهائي', 'Confirm Delete')}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-2.5 py-1.5 rounded-lg bg-[#ECE8DE] dark:bg-[#18181D] text-[#3F3D38] dark:text-[#C8C2B8] text-xs cursor-pointer"
                          >
                            {tr('إلغاء', 'Cancel')}
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(exam.id)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-500/30 text-red-700 dark:text-red-300 hover:bg-red-600 hover:text-white text-xs font-semibold transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>{tr('حذف نهائي', 'Delete')}</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Submissions List for Manual Grading */}
                  <div className="border-t border-black/10 dark:border-white/10 pt-3 space-y-2.5">
                    <div className="text-xs font-semibold text-[#856104] dark:text-[#E5C158]">
                      {tr('تسليمات الطلاب للتصحيح اليدوي:', 'Student Submissions for Manual Grading:')}
                    </div>

                    {exam.submissions.length === 0 ? (
                      <div className="p-3 rounded-lg bg-[#F5F2EA] dark:bg-[#151519] text-xs text-[#5C5850] dark:text-[#A8A29E]">
                        {tr('لم يقم أي طالب بتسليم هذا الامتحان بعد.', 'No student submissions yet.')}
                      </div>
                    ) : (
                      <div className="divide-y divide-black/5 dark:divide-white/5 rounded-xl border border-black/10 dark:border-white/10 bg-[#F5F2EA] dark:bg-[#151519] overflow-hidden">
                        {exam.submissions.map((sub) => {
                          const isGraded = sub.status === 'graded';
                          return (
                            <div
                              key={sub.id}
                              className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                            >
                              <div className="space-y-0.5 min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-sm font-bold text-[#141418] dark:text-[#F5F0E6]">
                                    {sub.studentName}
                                  </span>
                                  <span className="text-xs text-[#5C5850] dark:text-[#A8A29E]">
                                    · {formatYear(sub.studentYear)}
                                  </span>
                                  {isGraded ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/80 border border-emerald-500/40 text-emerald-700 dark:text-emerald-300 text-xs font-semibold font-mono tabular-nums">
                                      <CheckCircle2 className="w-3 h-3" />
                                      <span>
                                        {sub.totalScore} / {sub.maxScore}
                                      </span>
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-950/80 border border-amber-500/40 text-amber-800 dark:text-amber-200 text-xs font-semibold">
                                      <Hourglass className="w-3 h-3" />
                                      <span>{tr('في انتظار التصحيح', 'Pending Grading')}</span>
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs text-[#5C5850] dark:text-[#A8A29E] font-mono tabular-nums">
                                  {tr('تم التسليم:', 'Submitted:')}{' '}
                                  {new Date(sub.submittedAt).toLocaleString()}
                                </div>
                              </div>

                              <GoldChip
                                active={!isGraded}
                                onClick={() => openGradingSheet(exam, sub)}
                                className="text-xs px-3.5 py-2 shrink-0"
                              >
                                <ClipboardCheck className="w-3.5 h-3.5" />
                                <span>
                                  {isGraded
                                    ? tr('تعديل التصحيح وإعادة الإرسال', 'Edit Grade & Resend')
                                    : tr('تصحيح يدوي وإرسال الدرجة', 'Grade & Send Score')}
                                </span>
                              </GoldChip>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* MANUAL GRADING MODAL */}
      {gradingContext && (
        <div
          className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 overflow-y-auto"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={handleSaveManualGrades}
            className="w-full max-w-4xl max-h-[92vh] flex flex-col rounded-2xl bg-white dark:bg-[#121216] border border-[#D4AF37]/45 shadow-[0_24px_80px_rgba(0,0,0,0.9)] overflow-hidden"
          >
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-black/10 dark:border-white/10 bg-[#EFECE4] dark:bg-[#0D0D10] flex items-center justify-between gap-3 shrink-0">
              <div className="space-y-0.5 min-w-0">
                <h3 className="font-display text-base sm:text-lg font-bold text-[#735303] dark:text-[#F5D061] truncate">
                  {tr('التصحيح اليدوي:', 'Manual Grading:')} {gradingContext.submission.studentName}
                </h3>
                <div className="text-xs text-[#5C5850] dark:text-[#A8A29E] font-mono tabular-nums">
                  {gradingContext.exam.subjectName} · {tr('المجموع:', 'Total:')}{' '}
                  <strong className="text-[#856104] dark:text-[#E5C158]">
                    {liveGradingTotal} / {liveGradingMax}
                  </strong>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setGradingContext(null)}
                aria-label={tr('إغلاق', 'Close')}
                className="p-2 rounded-lg text-[#5C5850] dark:text-[#A8A29E] hover:text-[#141418] dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Questions Grading Body */}
            <div className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-4">
              {gradingContext.submission.answers.map((ans, idx) => {
                const draft = gradeItems[ans.questionId] || {
                  questionId: ans.questionId,
                  awardedPoints: 0,
                  isCorrect: false,
                  correctAnswerText: '',
                  adminFeedback: '',
                };

                const origQ = gradingContext.exam.questions.find(
                  (q) => q.id === ans.questionId
                );

                const studentAnswerDisplay =
                  ans.questionType === 'essay'
                    ? ans.essayAnswer?.trim() || tr('لم يكتب إجابة', 'No written answer')
                    : typeof ans.selectedIndex === 'number' &&
                      ans.selectedIndex >= 0 &&
                      ans.options?.[ans.selectedIndex]
                    ? ans.options[ans.selectedIndex]
                    : tr('بدون إجابة', 'Unanswered');

                return (
                  <div
                    key={ans.questionId}
                    className="p-4 rounded-xl bg-[#EFECE4] dark:bg-[#0D0D10] border border-black/10 dark:border-white/10 space-y-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="text-sm font-semibold text-[#141418] dark:text-[#F5F0E6] flex-1 min-w-0">
                        <span className={`font-mono text-[#9A7209] dark:text-[#D4AF37] tabular-nums ${isEn ? 'mr-2' : 'ml-2'}`}>
                          {idx + 1}.
                        </span>
                        {ans.questionText}
                      </div>
                      <span className="font-mono text-xs text-[#856104] dark:text-[#E5C158] tabular-nums shrink-0">
                        {tr('الحد الأقصى:', 'Max:')} {ans.maxPoints}
                      </span>
                    </div>

                    <div className="p-3 rounded-lg bg-[#F5F2EA] dark:bg-[#151519] border border-black/10 dark:border-white/10 space-y-1">
                      <div className="text-xs text-[#5C5850] dark:text-[#A8A29E]">
                        {tr('إجابة الطالب:', 'Student Answer:')}
                      </div>
                      <div className="text-sm text-[#141418] dark:text-[#F5F0E6] whitespace-pre-wrap leading-relaxed">
                        {studentAnswerDisplay}
                      </div>
                    </div>

                    {origQ?.modelAnswer && (
                      <div className="text-xs text-[#3F3D38] dark:text-[#C8C2B8]">
                        <strong className="text-[#9A7209] dark:text-[#D4AF37]">
                          {tr('المرجع المحفوظ لديك:', 'Saved Reference:')}
                        </strong>{' '}
                        {origQ.modelAnswer}
                      </div>
                    )}

                    {/* Manual Marking Controls */}
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end pt-1">
                      <div className="sm:col-span-5 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setGradeItems((prev) => ({
                              ...prev,
                              [ans.questionId]: {
                                ...draft,
                                awardedPoints: ans.maxPoints,
                                isCorrect: true,
                              },
                            }))
                          }
                          className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer transition-colors ${
                            draft.isCorrect
                              ? 'bg-emerald-600 border-emerald-500 text-white'
                              : 'bg-[#F5F2EA] dark:bg-[#151519] border-black/15 dark:border-white/15 text-emerald-700 dark:text-emerald-300 hover:border-emerald-500/60'
                          }`}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>{tr('صحيح (كاملة)', 'Correct (Full)')}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            setGradeItems((prev) => ({
                              ...prev,
                              [ans.questionId]: {
                                ...draft,
                                awardedPoints: 0,
                                isCorrect: false,
                              },
                            }))
                          }
                          className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer transition-colors ${
                            !draft.isCorrect
                              ? 'bg-red-600 border-red-500 text-white'
                              : 'bg-[#F5F2EA] dark:bg-[#151519] border-black/15 dark:border-white/15 text-red-700 dark:text-red-300 hover:border-red-500/60'
                          }`}
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>{tr('خطأ (0)', 'Wrong (0)')}</span>
                        </button>
                      </div>

                      <div className="sm:col-span-2 space-y-1">
                        <label className="block text-xs text-[#5C5850] dark:text-[#A8A29E]">
                          {tr('الدرجة الممنوحة', 'Awarded')}
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={ans.maxPoints}
                          step="0.5"
                          value={draft.awardedPoints}
                          onChange={(e) => {
                            const val = Math.max(
                              0,
                              Math.min(ans.maxPoints, Number(e.target.value) || 0)
                            );
                            setGradeItems((prev) => ({
                              ...prev,
                              [ans.questionId]: {
                                ...draft,
                                awardedPoints: val,
                                isCorrect: val >= ans.maxPoints,
                              },
                            }));
                          }}
                          className="w-full px-2.5 py-1.5 rounded-lg bg-[#F5F2EA] dark:bg-[#151519] border border-black/15 dark:border-white/15 text-xs text-[#141418] dark:text-[#F5F0E6] font-mono tabular-nums focus:outline-none focus:border-[#D4AF37]"
                        />
                      </div>

                      <div className="sm:col-span-5 space-y-1">
                        <label className="block text-xs text-[#5C5850] dark:text-[#A8A29E]">
                          {tr('الإجابة الصحيحة (تظهر للطالب عند الخطأ)', 'Correct Answer (Shown to student)')}
                        </label>
                        <input
                          type="text"
                          value={draft.correctAnswerText}
                          onChange={(e) =>
                            setGradeItems((prev) => ({
                              ...prev,
                              [ans.questionId]: {
                                ...draft,
                                correctAnswerText: e.target.value,
                              },
                            }))
                          }
                          placeholder={tr('اكتب الإجابة الصحيحة...', 'Correct answer text...')}
                          className="w-full px-3 py-1.5 rounded-lg bg-[#F5F2EA] dark:bg-[#151519] border border-black/15 dark:border-white/15 text-xs text-[#141418] dark:text-[#F5F0E6] focus:outline-none focus:border-[#D4AF37]"
                        />
                      </div>
                    </div>

                    <input
                      type="text"
                      value={draft.adminFeedback}
                      onChange={(e) =>
                        setGradeItems((prev) => ({
                          ...prev,
                          [ans.questionId]: {
                            ...draft,
                            adminFeedback: e.target.value,
                          },
                        }))
                      }
                      placeholder={tr(
                        'ملاحظة أو توضيح الخطأ للطالب على هذا السؤال (اختياري)',
                        'Optional feedback explaining the mistake on this question'
                      )}
                      className="w-full px-3 py-1.5 rounded-lg bg-[#F5F2EA] dark:bg-[#151519] border border-black/10 dark:border-white/10 text-xs text-[#3F3D38] dark:text-[#C8C2B8] focus:outline-none focus:border-[#D4AF37]"
                    />
                  </div>
                );
              })}

              <div className="space-y-1.5 pt-2">
                <label className="block text-xs font-semibold text-[#856104] dark:text-[#E5C158]">
                  {tr('ملاحظة عامة للطالب (اختياري)', 'Overall Note to Student (Optional)')}
                </label>
                <textarea
                  rows={2}
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  placeholder={tr(
                    'اكتب تقييمك العام أو نصيحتك للطالب...',
                    'Write an overall comment or advice...'
                  )}
                  className="w-full px-3.5 py-2 rounded-xl bg-[#EFECE4] dark:bg-[#0D0D10] border border-black/15 dark:border-white/15 text-xs text-[#141418] dark:text-[#F5F0E6] focus:outline-none focus:border-[#D4AF37]"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t border-black/10 dark:border-white/10 bg-[#EFECE4] dark:bg-[#0D0D10] flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div className="text-xs font-mono text-[#856104] dark:text-[#E5C158] tabular-nums">
                {tr('الدرجة النهائية للطالب:', 'Final Score:')}{' '}
                <strong className="text-base">
                  {liveGradingTotal} / {liveGradingMax}
                </strong>
              </div>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setGradingContext(null)}
                  className="px-4 py-2 rounded-lg bg-[#ECE8DE] dark:bg-[#18181D] text-xs text-[#3F3D38] dark:text-[#C8C2B8] hover:text-[#141418] dark:hover:text-white cursor-pointer"
                >
                  {tr('إلغاء', 'Cancel')}
                </button>
                <GoldChip type="submit" active={true} disabled={savingGrade} className="px-5 py-2">
                  <Send className="w-3.5 h-3.5" />
                  <span>
                    {savingGrade
                      ? tr('جاري الإرسال...', 'Sending...')
                      : tr('اعتماد وإرسال الدرجة للطالب', 'Send Score to Student')}
                  </span>
                </GoldChip>
              </div>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
