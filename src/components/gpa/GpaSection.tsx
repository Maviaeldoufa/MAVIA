import { Calculator, Plus, RotateCcw, Save, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import type { GpaCourseEntry } from '../../types';
import { apiRequest } from '../../utils/api';
import { calculateSemesterGpa, evaluateCourseGrade } from '../../utils/gpa';
import { GoldChip } from '../ui/GoldChip';

// 8 subjects: 7 inside GPA + 1 outside GPA
const DEFAULT_ENTRIES: GpaCourseEntry[] = [
  {
    id: 'gpa-1',
    name: 'نظم المعلومات الجغرافية (GIS)',
    credits: 3,
    coursework: 18,
    midterm: 17,
    finalExam: 52,
    includeInGpa: true,
  },
  {
    id: 'gpa-2',
    name: 'البرمجة بلغة Python',
    credits: 3,
    coursework: 19,
    midterm: 18,
    finalExam: 54,
    includeInGpa: true,
  },
  {
    id: 'gpa-3',
    name: 'الاستشعار عن بُعد',
    credits: 3,
    coursework: 16,
    midterm: 16,
    finalExam: 48,
    includeInGpa: true,
  },
  {
    id: 'gpa-4',
    name: 'المساحة والخرائط',
    credits: 3,
    coursework: 17,
    midterm: 17,
    finalExam: 50,
    includeInGpa: true,
  },
  {
    id: 'gpa-5',
    name: 'قواعد البيانات المكانية',
    credits: 3,
    coursework: 18,
    midterm: 16,
    finalExam: 49,
    includeInGpa: true,
  },
  {
    id: 'gpa-6',
    name: 'تحليل البيانات المكانية',
    credits: 3,
    coursework: 17,
    midterm: 18,
    finalExam: 51,
    includeInGpa: true,
  },
  {
    id: 'gpa-7',
    name: 'برمجة تطبيقات الويب',
    credits: 2,
    coursework: 18,
    midterm: 17,
    finalExam: 50,
    includeInGpa: true,
  },
  {
    id: 'gpa-8',
    name: 'مادة خارج الـ GPA (متطلب جامعي)',
    credits: 2,
    coursework: 16,
    midterm: 15,
    finalExam: 45,
    includeInGpa: false,
  },
];

export function GpaSection() {
  const { tr, isEn } = useLanguage();
  const [entries, setEntries] = useState<GpaCourseEntry[]>(DEFAULT_ENTRIES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiRequest<{ entries: GpaCourseEntry[] }>('/api/gpa')
      .then((res) => {
        if (res.entries && res.entries.length > 0) {
          setEntries(
            res.entries.map((entry) => ({
              ...entry,
              includeInGpa: entry.includeInGpa !== false,
            }))
          );
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const updateRow = (
    id: string,
    field: keyof GpaCourseEntry,
    value: string | number | boolean
  ) => {
    setSavedNotice(false);
    setEntries((prev) =>
      prev.map((row) => (row.id === id ? { ...row, [field]: value } : row))
    );
  };

  const addRow = () => {
    setSavedNotice(false);
    setEntries((prev) => [
      ...prev,
      {
        id: `gpa-${Date.now()}`,
        name: tr(`مادة ${prev.length + 1}`, `Course ${prev.length + 1}`),
        credits: 3,
        coursework: 15,
        midterm: 15,
        finalExam: 45,
        includeInGpa: true,
      },
    ]);
  };

  const removeRow = (id: string) => {
    setSavedNotice(false);
    setEntries((prev) => prev.filter((row) => row.id !== id));
  };

  const handleSave = async () => {
    setSaving(true);
    setSavedNotice(false);
    setError(null);
    try {
      await apiRequest('/api/gpa', {
        method: 'PUT',
        body: JSON.stringify({ entries }),
      });
      setSavedNotice(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : tr('تعذر حفظ جدول الدرجات.', 'Could not save GPA table.')
      );
    } finally {
      setSaving(false);
    }
  };

  const summary = calculateSemesterGpa(entries);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#141418] dark:text-[#F5F0E6]">
            {tr('حاسبة الـ GPA وجدول الدرجات', 'GPA Calculator & Grades Table')}
          </h1>
          <p className="text-xs sm:text-sm text-[#5C5850] dark:text-[#A8A29E]">
            {tr(
              'نظام 8 مواد: 7 مواد تُحسب داخل الـ GPA ومادة واحدة خارج الـ GPA (تستطيع تبديل حالة أي مادة بضغطة واحدة)',
              '8-course system: 7 subjects counted inside GPA + 1 non-GPA subject (toggle any subject with one click)'
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <GoldChip onClick={addRow} className="text-xs px-3 py-2">
            <Plus className="w-4 h-4" />
            <span>{tr('إضافة مادة', 'Add Course')}</span>
          </GoldChip>
          <GoldChip
            onClick={() => {
              setEntries(DEFAULT_ENTRIES);
              setSavedNotice(false);
            }}
            className="text-xs px-3 py-2"
          >
            <RotateCcw className="w-4 h-4" />
            <span>{tr('ضبط افتراضي (7 + 1)', 'Default Preset (7 + 1)')}</span>
          </GoldChip>
          <GoldChip
            active={true}
            disabled={saving}
            onClick={handleSave}
            className="text-xs px-4 py-2"
          >
            <Save className="w-4 h-4" />
            <span>
              {saving ? tr('جاري الحفظ...', 'Saving...') : tr('حفظ جدولي', 'Save Table')}
            </span>
          </GoldChip>
        </div>
      </div>

      {savedNotice && (
        <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-500/40 text-emerald-800 dark:text-emerald-200 text-xs">
          {tr(
            'تم حفظ جدول درجاتك في حسابك بنجاح.',
            'Your grades table has been saved to your account.'
          )}
        </div>
      )}

      {error && (
        <div role="alert" className="p-3 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-500/40 text-red-700 dark:text-red-200 text-xs">
          {error}
        </div>
      )}

      {/* 4-column KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-px rounded-2xl bg-black/10 dark:bg-white/10 border border-[#D4AF37]/30 overflow-hidden">
        <div className="p-3.5 sm:p-5 bg-white dark:bg-[#121216]">
          <div className="text-xs text-[#5C5850] dark:text-[#A8A29E]">
            {tr('المعدل الفصلي (GPA)', 'Semester GPA')}
          </div>
          <div className="font-mono text-2xl sm:text-3xl font-bold text-[#856104] dark:text-[#E5C158] tabular-nums mt-1">
            {summary.gpa.toFixed(2)}
            <span className="text-xs sm:text-sm text-[#5C5850] dark:text-[#A8A29E] font-normal"> / 4.00</span>
          </div>
          <div className="text-[11px] text-[#5C5850] dark:text-[#A8A29E] mt-1 tabular-nums">
            {summary.includedCount} {tr('مواد داخل GPA', 'in GPA')} ·{' '}
            {summary.excludedCount} {tr('خارج GPA', 'outside GPA')}
          </div>
        </div>
        <div className="p-3.5 sm:p-5 bg-white dark:bg-[#121216]">
          <div className="text-xs text-[#5C5850] dark:text-[#A8A29E]">
            {tr('المتوسط المئوي (لمواد GPA)', 'Percentage Avg (GPA Courses)')}
          </div>
          <div className="font-mono text-2xl sm:text-3xl font-bold text-[#141418] dark:text-[#F5F0E6] tabular-nums mt-1">
            {summary.averagePercentage}%
          </div>
        </div>
        <div className="p-3.5 sm:p-5 bg-white dark:bg-[#121216]">
          <div className="text-xs text-[#5C5850] dark:text-[#A8A29E]">
            {tr('ساعات GPA المحتسبة', 'Counted GPA Credits')}
          </div>
          <div className="font-mono text-2xl sm:text-3xl font-bold text-[#141418] dark:text-[#F5F0E6] tabular-nums mt-1">
            {summary.gpaCredits}
            <span className="text-xs sm:text-sm text-[#5C5850] dark:text-[#A8A29E] font-normal">
              {' '}
              {tr('من', 'of')} {summary.totalCredits}
            </span>
          </div>
        </div>
        <div className="p-3.5 sm:p-5 bg-white dark:bg-[#121216]">
          <div className="text-xs text-[#5C5850] dark:text-[#A8A29E]">
            {tr('الساعات المجتازة', 'Passed Credits')}
          </div>
          <div className="font-mono text-2xl sm:text-3xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums mt-1">
            {summary.passedCredits}
          </div>
        </div>
      </div>

      {/* Interactive Spreadsheet Table (Desktop/Tablet) + Card List (Phone) */}
      <section className="rounded-2xl bg-white dark:bg-[#121216] border border-black/10 dark:border-white/10 p-3.5 sm:p-6">
        {loading ? (
          <div className="py-10 text-center text-sm text-[#5C5850] dark:text-[#A8A29E]">
            {tr('جاري تحميل جدول الدرجات...', 'Loading grades table...')}
          </div>
        ) : entries.length === 0 ? (
          <div className="py-12 text-center space-y-3">
            <Calculator className="w-8 h-8 text-[#9A7209] dark:text-[#D4AF37] mx-auto" />
            <p className="text-sm text-[#5C5850] dark:text-[#A8A29E]">
              {tr(
                'جدول المواد فارغ حالياً. أضف مادتك الأولى لحساب المعدل.',
                'Course table is empty. Add your first course to compute GPA.'
              )}
            </p>
            <GoldChip active={true} onClick={addRow}>
              <Plus className="w-4 h-4" />
              <span>{tr('إضافة مادة جديدة', 'Add New Course')}</span>
            </GoldChip>
          </div>
        ) : (
          <>
            {/* Mobile Card Layout (< md) */}
            <div className="md:hidden space-y-3">
              {entries.map((row, idx) => {
                const grade = evaluateCourseGrade(row);
                const isIncluded = row.includeInGpa !== false;

                return (
                  <div
                    key={row.id}
                    className={`p-3.5 rounded-xl border border-black/10 dark:border-white/10 space-y-3 ${
                      isIncluded
                        ? 'bg-[#F6F4EF]/65 dark:bg-[#0D0D10]'
                        : 'bg-black/[0.03] dark:bg-white/[0.02] opacity-85'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-[#5C5850] dark:text-[#A8A29E] tabular-nums shrink-0">
                        #{idx + 1}
                      </span>
                      <input
                        type="text"
                        value={row.name}
                        onChange={(e) => updateRow(row.id, 'name', e.target.value)}
                        aria-label={tr('اسم المادة الدراسية', 'Course Name')}
                        className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#121216] border border-black/10 dark:border-white/10 text-sm text-[#141418] dark:text-[#F5F0E6] focus:outline-none focus:border-[#D4AF37]"
                      />
                      <button
                        type="button"
                        onClick={() => removeRow(row.id)}
                        className="p-2 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer shrink-0"
                        aria-label={tr('حذف المادة', 'Delete course')}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <label className="space-y-1">
                        <span className="block text-[11px] font-medium text-[#5C5850] dark:text-[#A8A29E]">
                          {tr('الساعات', 'Credits')}
                        </span>
                        <input
                          type="number"
                          min={1}
                          max={6}
                          value={row.credits}
                          onChange={(e) => updateRow(row.id, 'credits', Number(e.target.value))}
                          className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#121216] border border-black/10 dark:border-white/10 text-center font-mono tabular-nums text-sm text-[#141418] dark:text-[#F5F0E6] focus:outline-none focus:border-[#D4AF37]"
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="block text-[11px] font-medium text-[#5C5850] dark:text-[#A8A29E]">
                          {tr('أعمال السنة (20)', 'Coursework (20)')}
                        </span>
                        <input
                          type="number"
                          min={0}
                          max={30}
                          value={row.coursework}
                          onChange={(e) => updateRow(row.id, 'coursework', Number(e.target.value))}
                          className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#121216] border border-black/10 dark:border-white/10 text-center font-mono tabular-nums text-sm text-[#141418] dark:text-[#F5F0E6] focus:outline-none focus:border-[#D4AF37]"
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="block text-[11px] font-medium text-[#5C5850] dark:text-[#A8A29E]">
                          {tr('الميدتيرم (20)', 'Midterm (20)')}
                        </span>
                        <input
                          type="number"
                          min={0}
                          max={30}
                          value={row.midterm}
                          onChange={(e) => updateRow(row.id, 'midterm', Number(e.target.value))}
                          className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#121216] border border-black/10 dark:border-white/10 text-center font-mono tabular-nums text-sm text-[#141418] dark:text-[#F5F0E6] focus:outline-none focus:border-[#D4AF37]"
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="block text-[11px] font-medium text-[#5C5850] dark:text-[#A8A29E]">
                          {tr('الفاينل (60)', 'Final (60)')}
                        </span>
                        <input
                          type="number"
                          min={0}
                          max={70}
                          value={row.finalExam}
                          onChange={(e) => updateRow(row.id, 'finalExam', Number(e.target.value))}
                          className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#121216] border border-black/10 dark:border-white/10 text-center font-mono tabular-nums text-sm text-[#141418] dark:text-[#F5F0E6] focus:outline-none focus:border-[#D4AF37]"
                        />
                      </label>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-black/10 dark:border-white/10">
                      <GoldChip
                        active={isIncluded}
                        onClick={() => updateRow(row.id, 'includeInGpa', !isIncluded)}
                        className="px-2.5 py-1 text-[11px]"
                      >
                        {isIncluded ? tr('داخل GPA', 'In GPA') : tr('خارج GPA', 'Non-GPA')}
                      </GoldChip>

                      <div className="flex items-center gap-3 text-xs font-mono tabular-nums">
                        <span className="text-[#5C5850] dark:text-[#A8A29E]">
                          {tr('المجموع:', 'Total:')}{' '}
                          <strong className="text-[#141418] dark:text-[#F5F0E6]">{grade.total}</strong>
                        </span>
                        <span
                          className={`font-bold ${
                            grade.letter === 'F'
                              ? 'text-red-600 dark:text-red-400'
                              : grade.letter.startsWith('A')
                              ? 'text-[#856104] dark:text-[#E5C158]'
                              : 'text-emerald-600 dark:text-emerald-400'
                          }`}
                        >
                          {isIncluded
                            ? grade.letter
                            : grade.total >= 50
                            ? tr('ناجح', 'Pass')
                            : tr('راسب', 'Fail')}
                        </span>
                        <span className="text-[#3F3D38] dark:text-[#C8C2B8]">
                          {isIncluded ? `${grade.points.toFixed(1)} pts` : tr('خارج GPA', 'Non-GPA')}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Tablet/Desktop Spreadsheet Table (>= md) */}
            <div className="hidden md:block overflow-x-auto">
              <table
                className={`w-full ${
                  isEn ? 'text-left' : 'text-right'
                } border-collapse min-w-[920px]`}
              >
                <thead>
                  <tr className="border-b border-black/10 dark:border-white/10 text-xs text-[#5C5850] dark:text-[#A8A29E]">
                    <th className="py-3 px-2 font-semibold w-10 text-center">#</th>
                    <th className="py-3 px-2 font-semibold">
                      {tr('اسم المادة الدراسية', 'Course Name')}
                    </th>
                    <th className="py-3 px-2 font-semibold text-center w-28">
                      {tr('الاحتساب', 'GPA Mode')}
                    </th>
                    <th className="py-3 px-2 font-semibold text-center w-20">
                      {tr('الساعات', 'Credits')}
                    </th>
                    <th className="py-3 px-2 font-semibold text-center w-28">
                      {tr('أعمال السنة (20)', 'Coursework (20)')}
                    </th>
                    <th className="py-3 px-2 font-semibold text-center w-24">
                      {tr('الميدتيرم (20)', 'Midterm (20)')}
                    </th>
                    <th className="py-3 px-2 font-semibold text-center w-24">
                      {tr('الفاينل (60)', 'Final (60)')}
                    </th>
                    <th className="py-3 px-2 font-semibold text-center w-20">
                      {tr('المجموع', 'Total')}
                    </th>
                    <th className="py-3 px-2 font-semibold text-center w-20">
                      {tr('التقدير', 'Grade')}
                    </th>
                    <th className="py-3 px-2 font-semibold text-center w-24">
                      {tr('النقاط', 'Points')}
                    </th>
                    <th
                      className={`py-3 px-2 font-semibold ${
                        isEn ? 'text-right' : 'text-left'
                      } w-14`}
                    >
                      {tr('حذف', 'Del')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5 dark:divide-white/5 text-sm">
                  {entries.map((row, idx) => {
                    const grade = evaluateCourseGrade(row);
                    const isIncluded = row.includeInGpa !== false;

                    return (
                      <tr
                        key={row.id}
                        className={`transition-colors ${
                          isIncluded ? 'hover:bg-black/[0.025] dark:hover:bg-white/[0.02]' : 'bg-black/[0.025] dark:bg-white/[0.015] opacity-80'
                        }`}
                      >
                        <td className="py-2.5 px-2 text-center font-mono text-xs text-[#5C5850] dark:text-[#A8A29E] tabular-nums">
                          {idx + 1}
                        </td>
                        <td className="py-2.5 px-2">
                          <input
                            type="text"
                            value={row.name}
                            onChange={(e) => updateRow(row.id, 'name', e.target.value)}
                            className="w-full px-3 py-1.5 rounded-lg bg-[#F6F4EF] dark:bg-[#09090B] border border-black/10 dark:border-white/10 text-sm text-[#141418] dark:text-[#F5F0E6] focus:outline-none focus:border-[#D4AF37]"
                          />
                        </td>
                        <td className="py-2.5 px-2 text-center">
                          <GoldChip
                            active={isIncluded}
                            onClick={() => updateRow(row.id, 'includeInGpa', !isIncluded)}
                            className="px-2.5 py-1 text-[11px]"
                          >
                            {isIncluded ? tr('داخل GPA', 'In GPA') : tr('خارج GPA', 'Non-GPA')}
                          </GoldChip>
                        </td>
                        <td className="py-2.5 px-2">
                          <input
                            type="number"
                            min={1}
                            max={6}
                            value={row.credits}
                            onChange={(e) =>
                              updateRow(row.id, 'credits', Number(e.target.value))
                            }
                            className="w-full px-2 py-1.5 rounded-lg bg-[#F6F4EF] dark:bg-[#09090B] border border-black/10 dark:border-white/10 text-center font-mono tabular-nums text-sm text-[#141418] dark:text-[#F5F0E6] focus:outline-none focus:border-[#D4AF37]"
                          />
                        </td>
                        <td className="py-2.5 px-2">
                          <input
                            type="number"
                            min={0}
                            max={30}
                            value={row.coursework}
                            onChange={(e) =>
                              updateRow(row.id, 'coursework', Number(e.target.value))
                            }
                            className="w-full px-2 py-1.5 rounded-lg bg-[#F6F4EF] dark:bg-[#09090B] border border-black/10 dark:border-white/10 text-center font-mono tabular-nums text-sm text-[#141418] dark:text-[#F5F0E6] focus:outline-none focus:border-[#D4AF37]"
                          />
                        </td>
                        <td className="py-2.5 px-2">
                          <input
                            type="number"
                            min={0}
                            max={30}
                            value={row.midterm}
                            onChange={(e) =>
                              updateRow(row.id, 'midterm', Number(e.target.value))
                            }
                            className="w-full px-2 py-1.5 rounded-lg bg-[#F6F4EF] dark:bg-[#09090B] border border-black/10 dark:border-white/10 text-center font-mono tabular-nums text-sm text-[#141418] dark:text-[#F5F0E6] focus:outline-none focus:border-[#D4AF37]"
                          />
                        </td>
                        <td className="py-2.5 px-2">
                          <input
                            type="number"
                            min={0}
                            max={70}
                            value={row.finalExam}
                            onChange={(e) =>
                              updateRow(row.id, 'finalExam', Number(e.target.value))
                            }
                            className="w-full px-2 py-1.5 rounded-lg bg-[#F6F4EF] dark:bg-[#09090B] border border-black/10 dark:border-white/10 text-center font-mono tabular-nums text-sm text-[#141418] dark:text-[#F5F0E6] focus:outline-none focus:border-[#D4AF37]"
                          />
                        </td>
                        <td className="py-2.5 px-2 text-center font-mono tabular-nums font-semibold text-[#141418] dark:text-[#F5F0E6]">
                          {grade.total}
                        </td>
                        <td
                          className={`py-2.5 px-2 text-center font-mono font-bold ${
                            grade.letter === 'F'
                              ? 'text-red-600 dark:text-red-400'
                              : grade.letter.startsWith('A')
                              ? 'text-[#856104] dark:text-[#E5C158]'
                              : 'text-emerald-600 dark:text-emerald-400'
                          }`}
                        >
                          {isIncluded
                            ? grade.letter
                            : grade.total >= 50
                            ? tr('ناجح', 'Pass')
                            : tr('راسب', 'Fail')}
                        </td>
                        <td className="py-2.5 px-2 text-center font-mono tabular-nums text-[#3F3D38] dark:text-[#C8C2B8]">
                          {isIncluded
                            ? grade.points.toFixed(1)
                            : tr('خارج GPA', 'Non-GPA')}
                        </td>
                        <td className={`py-2.5 px-2 ${isEn ? 'text-right' : 'text-left'}`}>
                          <button
                            type="button"
                            onClick={() => removeRow(row.id)}
                            className="p-1.5 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-950/60 transition-colors cursor-pointer"
                            aria-label={tr('حذف المادة', 'Delete course')}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
