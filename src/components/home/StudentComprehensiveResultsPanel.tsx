import { CheckCircle2, ClipboardCheck, Eye, Hourglass } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import type { ComprehensiveSubmission } from '../../types';
import { apiRequest } from '../../utils/api';
import { GoldChip } from '../ui/GoldChip';

export function StudentComprehensiveResultsPanel() {
  const { user } = useAuth();
  const { tr } = useLanguage();
  const [submissions, setSubmissions] = useState<ComprehensiveSubmission[]>([]);

  const loadSubmissions = useCallback(async () => {
    if (!user) return;
    try {
      const res = await apiRequest<{ submissions: ComprehensiveSubmission[] }>(
        '/api/comprehensive-exams/my-submissions'
      );
      setSubmissions(res.submissions || []);
    } catch {
      // Ignore
    }
  }, [user?.id]);

  useEffect(() => {
    void loadSubmissions();
    const onChanged = () => void loadSubmissions();
    window.addEventListener('mvia:comprehensive-exam-changed', onChanged);
    return () =>
      window.removeEventListener('mvia:comprehensive-exam-changed', onChanged);
  }, [loadSubmissions]);

  if (!user || submissions.length === 0) return null;

  return (
    <section className="rounded-2xl border border-[#D4AF37]/30 bg-[#121216] p-5 sm:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <ClipboardCheck className="w-5 h-5 text-[#D4AF37]" />
          <div>
            <h2 className="font-display text-lg font-bold text-[#F5F0E6]">
              {tr('نتائج الامتحانات الشاملة', 'Comprehensive Exam Results')}
            </h2>
            <p className="text-xs text-[#A8A29E]">
              {tr(
                'تابع حالة تصحيح امتحاناتك الشاملة، وعند إرسال الدرجة يمكنك عرض التفاصيل ومراجعة ما غلطت فيه.',
                'Track grading status and review detailed feedback and mistakes once graded.'
              )}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {submissions.map((sub) => {
          const isGraded = sub.status === 'graded';
          const wrongCount = isGraded
            ? sub.answers.filter((a) => a.isCorrect === false).length
            : 0;
          const pct =
            isGraded && sub.maxScore > 0
              ? Math.round((sub.totalScore / sub.maxScore) * 100)
              : 0;

          return (
            <div
              key={sub.id}
              className="p-4 rounded-xl bg-[#0D0D10] border border-white/10 flex flex-col justify-between gap-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1 min-w-0">
                  <h3 className="text-sm font-bold text-[#F5F0E6] truncate">
                    {sub.subjectName}
                  </h3>
                  <div className="text-xs text-[#A8A29E] font-mono tabular-nums">
                    {new Date(sub.submittedAt).toLocaleString()}
                  </div>
                </div>

                {isGraded ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-950/70 border border-emerald-500/40 text-emerald-300 text-xs font-semibold shrink-0">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{tr('تم التصحيح', 'Graded')}</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-950/70 border border-amber-500/40 text-amber-200 text-xs font-semibold shrink-0">
                    <Hourglass className="w-3.5 h-3.5" />
                    <span>{tr('في انتظار التصحيح', 'Pending Grading')}</span>
                  </span>
                )}
              </div>

              {isGraded ? (
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-white/10">
                  <div className="flex items-center gap-3 text-xs font-mono tabular-nums">
                    <span className="text-base font-bold text-[#F5D061]">
                      {sub.totalScore} / {sub.maxScore}
                    </span>
                    <span className="text-emerald-300 font-bold">({pct}%)</span>
                    <span className="text-red-300">
                      {tr(`أخطاء: ${wrongCount}`, `Mistakes: ${wrongCount}`)}
                    </span>
                  </div>

                  <GoldChip
                    active={true}
                    onClick={() =>
                      window.dispatchEvent(
                        new CustomEvent('mvia:open-comprehensive-results', {
                          detail: { submissionId: sub.id },
                        })
                      )
                    }
                    className="text-xs px-3 py-1.5"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>{tr('عرض الدرجة ومراجعة الأخطاء', 'View Score & Mistakes')}</span>
                  </GoldChip>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/10 text-xs text-[#C8C2B8]">
                  <span>
                    {tr(
                      'بانتظار مراجعة الأدمن وإرسال الدرجة...',
                      'Waiting for Admin manual grading...'
                    )}
                  </span>
                  <GoldChip
                    onClick={() =>
                      window.dispatchEvent(
                        new CustomEvent('mvia:open-comprehensive-results', {
                          detail: { submissionId: sub.id },
                        })
                      )
                    }
                    className="text-xs px-3 py-1"
                  >
                    {tr('عرض الحالة', 'Status')}
                  </GoldChip>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
