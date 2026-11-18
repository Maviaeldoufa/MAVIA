import crypto from 'crypto';
import { Router } from 'express';
import { requireAdmin, requireAuth, requirePermission } from '../auth.ts';
import type { AuthenticatedRequest } from '../auth.ts';
import { db, pushNotification } from '../db.ts';
import type {
  AcademicYear,
  ComprehensiveAnswerItem,
  ComprehensiveExam,
  ComprehensiveQuestion,
  ComprehensiveQuestionType,
  ComprehensiveSubmission,
} from '../types.ts';

const router = Router();

function sanitizeExamForStudent(exam: ComprehensiveExam) {
  return {
    id: exam.id,
    subjectName: exam.subjectName,
    durationMinutes: exam.durationMinutes,
    targetYear: exam.targetYear,
    isActive: exam.isActive,
    questionsCount: exam.questions.length,
    totalPoints: exam.questions.reduce((acc, q) => acc + (Number(q.points) || 1), 0),
    createdBy: exam.createdBy,
    createdAt: exam.createdAt,
    closedAt: exam.closedAt,
    questions: exam.questions.map((q) => ({
      id: q.id,
      type: q.type,
      question: q.question,
      points: q.points,
      options: q.type === 'mcq' || q.type === 'true_false' ? q.options : undefined,
    })),
  };
}

// Public-to-logged-in-users: get active comprehensive exams visible in top news bar
router.get('/comprehensive-exams/active', requireAuth, (req: AuthenticatedRequest, res) => {
  const store = db.get();
  const user = req.currentUser!;
  const exams = (store.comprehensiveExams || []).filter(
    (e) =>
      e.isActive &&
      (user.role === 'admin' || e.targetYear === 0 || e.targetYear === user.year)
  );
  const submissions = store.comprehensiveSubmissions || [];

  const result = exams.map((exam) => {
    const mySub = submissions.find(
      (s) => s.examId === exam.id && s.userId === user.id
    );
    return {
      ...sanitizeExamForStudent(exam),
      mySubmissionStatus: mySub ? mySub.status : null,
      mySubmissionId: mySub ? mySub.id : null,
    };
  });

  res.json({ exams: result });
});

// Student submissions (both pending grading and graded with mistake breakdown)
router.get('/comprehensive-exams/my-submissions', requireAuth, (req: AuthenticatedRequest, res) => {
  const store = db.get();
  const userId = req.currentUser!.id;
  const subs = (store.comprehensiveSubmissions || [])
    .filter((s) => s.userId === userId)
    .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime())
    .map((s) => {
      if (s.status !== 'graded') {
        return {
          ...s,
          answers: s.answers.map((a) => ({
            questionId: a.questionId,
            questionType: a.questionType,
            questionText: a.questionText,
            maxPoints: a.maxPoints,
            options: a.options,
            selectedIndex: a.selectedIndex,
            essayAnswer: a.essayAnswer,
          })),
        };
      }
      return s;
    });

  res.json({ submissions: subs });
});

// Student submits answers for an active comprehensive exam -> enters 'pending_grading'
router.post('/comprehensive-exams/:id/submit', requireAuth, (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const store = db.get();
  const user = req.currentUser!;

  const exam = (store.comprehensiveExams || []).find((e) => e.id === id);
  if (!exam || !exam.isActive) {
    res.status(404).json({ error: 'الامتحان الشامل غير متاح حالياً أو تم إيقافه من الأدمن.' });
    return;
  }

  if (user.role !== 'admin' && exam.targetYear !== 0 && exam.targetYear !== user.year) {
    res.status(403).json({ error: 'هذا الامتحان الشامل غير مخصص لدفعتك الدراسية.' });
    return;
  }

  if (!Array.isArray(store.comprehensiveSubmissions)) {
    store.comprehensiveSubmissions = [];
  }

  const already = store.comprehensiveSubmissions.find(
    (s) => s.examId === exam.id && s.userId === user.id
  );
  if (already) {
    res.status(409).json({
      error: 'تم تسليم هذا الامتحان مسبقاً وهو حالياً في انتظار التصحيح.',
      submission: already,
    });
    return;
  }

  const { responses, timeSpentSeconds } = req.body as {
    responses?: Array<{
      questionId: string;
      selectedIndex?: number;
      essayAnswer?: string;
    }>;
    timeSpentSeconds?: number;
  };

  if (!Array.isArray(responses)) {
    res.status(400).json({ error: 'صيغة الإجابات غير صالحة.' });
    return;
  }

  const responseMap = new Map<
    string,
    { selectedIndex?: number; essayAnswer?: string }
  >();
  for (const r of responses) {
    if (r?.questionId) {
      responseMap.set(String(r.questionId), r);
    }
  }

  const answers: ComprehensiveAnswerItem[] = exam.questions.map((q) => {
    const resp = responseMap.get(q.id);
    if (q.type === 'essay') {
      return {
        questionId: q.id,
        questionType: 'essay',
        questionText: q.question,
        maxPoints: q.points,
        essayAnswer: String(resp?.essayAnswer || '').trim().slice(0, 5000),
      };
    }

    const opts =
      q.type === 'true_false'
        ? q.options && q.options.length === 2
          ? q.options
          : ['صح', 'خطأ']
        : q.options || [];
    const sel =
      typeof resp?.selectedIndex === 'number' &&
      Number.isInteger(resp.selectedIndex) &&
      resp.selectedIndex >= 0 &&
      resp.selectedIndex < opts.length
        ? resp.selectedIndex
        : -1;

    return {
      questionId: q.id,
      questionType: q.type,
      questionText: q.question,
      maxPoints: q.points,
      options: opts,
      selectedIndex: sel,
    };
  });

  const maxScore = exam.questions.reduce((sum, q) => sum + (Number(q.points) || 1), 0);

  const submission: ComprehensiveSubmission = {
    id: `csub-${crypto.randomUUID()}`,
    examId: exam.id,
    subjectName: exam.subjectName,
    userId: user.id,
    studentName: user.name,
    studentYear: user.year,
    answers,
    status: 'pending_grading',
    totalScore: 0,
    maxScore,
    timeSpentSeconds: Math.max(1, Number(timeSpentSeconds) || 0),
    submittedAt: new Date().toISOString(),
  };

  store.comprehensiveSubmissions.unshift(submission);
  db.save();

  const yearLabel =
    user.year === 1
      ? 'الفرقة الأولى'
      : user.year === 2
      ? 'الفرقة الثانية'
      : user.year === 3
      ? 'الفرقة الثالثة'
      : 'الفرقة الرابعة';

  const activeAdmins = (store.users || []).filter(
    (u) => u.role === 'admin' && !u.isSuspended
  );
  for (const adminUser of activeAdmins) {
    pushNotification({
      title: `تسليم امتحان شامل: ${exam.subjectName}`,
      message: `قام الطالب ${user.name} (${yearLabel}) بتسليم الامتحان الشامل لمادة ${exam.subjectName} — في انتظار التصحيح اليدوي.`,
      type: 'exam',
      targetSection: 'home',
      year: 0,
      userId: adminUser.id,
      comprehensiveExamId: exam.id,
      createdBy: user.name,
    });
  }

  res.status(201).json({ submission });
});

// ADMIN ONLY: List all comprehensive exams and their student submissions
router.get(
  '/admin/comprehensive-exams',
  requireAuth,
  requireAdmin,
  requirePermission('manage_quizzes'),
  (_req, res) => {
    const store = db.get();
    const exams = [...(store.comprehensiveExams || [])].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    const submissions = store.comprehensiveSubmissions || [];

    const payload = exams.map((exam) => {
      const examSubs = submissions
        .filter((s) => s.examId === exam.id)
        .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
      const pendingCount = examSubs.filter((s) => s.status === 'pending_grading').length;
      const gradedCount = examSubs.filter((s) => s.status === 'graded').length;
      return {
        ...exam,
        submissionsCount: examSubs.length,
        pendingCount,
        gradedCount,
        submissions: examSubs,
      };
    });

    res.json({ exams: payload });
  }
);

// ADMIN ONLY: Create and publish comprehensive exam (activates top news bar immediately)
router.post(
  '/admin/comprehensive-exams',
  requireAuth,
  requireAdmin,
  requirePermission('manage_quizzes'),
  (req: AuthenticatedRequest, res) => {
    const { subjectName, durationMinutes, targetYear, questions } = req.body as {
      subjectName?: string;
      durationMinutes?: number;
      targetYear?: number;
      questions?: Array<{
        type?: ComprehensiveQuestionType;
        question?: string;
        points?: number;
        options?: string[];
        correctIndex?: number;
        modelAnswer?: string;
      }>;
    };

    if (!subjectName?.trim()) {
      res.status(400).json({ error: 'يرجى إدخال اسم المادة للامتحان الشامل.' });
      return;
    }

    const duration = Math.max(1, Math.min(360, Number(durationMinutes) || 30));
    const parsedYear = Number(targetYear || 0);
    const validYear = ([0, 1, 2, 3, 4].includes(parsedYear)
      ? parsedYear
      : 0) as AcademicYear | 0;

    if (!Array.isArray(questions) || questions.length === 0) {
      res.status(400).json({ error: 'يرجى إضافة سؤال واحد على الأقل للامتحان الشامل.' });
      return;
    }

    const normalizedQuestions: ComprehensiveQuestion[] = [];
    for (const rawQ of questions) {
      const qType: ComprehensiveQuestionType =
        rawQ?.type === 'true_false'
          ? 'true_false'
          : rawQ?.type === 'essay'
          ? 'essay'
          : 'mcq';
      const qText = String(rawQ?.question || '').trim();
      if (!qText) {
        res.status(400).json({ error: 'يوجد سؤال بدون نص، يرجى كتابة نص كل سؤال.' });
        return;
      }

      const pts = Math.max(1, Math.min(100, Number(rawQ?.points) || 1));

      if (qType === 'mcq') {
        const cleanOpts = (Array.isArray(rawQ?.options) ? rawQ.options : [])
          .map((o) => String(o || '').trim())
          .filter(Boolean);
        if (cleanOpts.length < 2) {
          res.status(400).json({
            error: `السؤال الاختياري "${qText.slice(0, 35)}" يجب أن يحتوي على خيارين على الأقل.`,
          });
          return;
        }
        const safeCorrect =
          typeof rawQ?.correctIndex === 'number' &&
          rawQ.correctIndex >= 0 &&
          rawQ.correctIndex < cleanOpts.length
            ? rawQ.correctIndex
            : undefined;
        normalizedQuestions.push({
          id: `cq-${crypto.randomUUID()}`,
          type: 'mcq',
          question: qText,
          points: pts,
          options: cleanOpts,
          correctIndex: safeCorrect,
          modelAnswer: rawQ?.modelAnswer?.trim() || undefined,
        });
      } else if (qType === 'true_false') {
        const safeCorrect =
          rawQ?.correctIndex === 0 || rawQ?.correctIndex === 1
            ? rawQ.correctIndex
            : undefined;
        normalizedQuestions.push({
          id: `cq-${crypto.randomUUID()}`,
          type: 'true_false',
          question: qText,
          points: pts,
          options: ['صح', 'خطأ'],
          correctIndex: safeCorrect,
          modelAnswer: rawQ?.modelAnswer?.trim() || undefined,
        });
      } else {
        normalizedQuestions.push({
          id: `cq-${crypto.randomUUID()}`,
          type: 'essay',
          question: qText,
          points: pts,
          modelAnswer: rawQ?.modelAnswer?.trim() || undefined,
        });
      }
    }

    const store = db.get();
    if (!Array.isArray(store.comprehensiveExams)) {
      store.comprehensiveExams = [];
    }

    const exam: ComprehensiveExam = {
      id: `cexam-${crypto.randomUUID()}`,
      subjectName: subjectName.trim(),
      durationMinutes: duration,
      targetYear: validYear,
      isActive: true,
      questions: normalizedQuestions,
      createdBy: req.currentUser!.name,
      createdById: req.currentUser!.id,
      createdAt: new Date().toISOString(),
    };

    store.comprehensiveExams.unshift(exam);
    db.save();

    const yearLabel =
      validYear === 1
        ? 'الفرقة الأولى'
        : validYear === 2
        ? 'الفرقة الثانية'
        : validYear === 3
        ? 'الفرقة الثالثة'
        : validYear === 4
        ? 'الفرقة الرابعة'
        : 'جميع الدفعات';

    pushNotification({
      title: `الامتحان الشامل لمادة ${exam.subjectName}`,
      message: `تم نشر الامتحان الشامل لمادة ${exam.subjectName} (${yearLabel}) — مدة الامتحان ${exam.durationMinutes} دقيقة. اضغط هنا للدخول وبدء الحل الآن.`,
      type: 'exam',
      targetSection: 'home',
      year: validYear,
      comprehensiveExamId: exam.id,
      createdBy: req.currentUser!.name,
    });

    res.status(201).json({ exam });
  }
);

// ADMIN ONLY: Remove/Deactivate exam from top news bar while preserving submissions for manual grading
router.post(
  '/admin/comprehensive-exams/:id/deactivate',
  requireAuth,
  requireAdmin,
  requirePermission('manage_quizzes'),
  (req, res) => {
    const { id } = req.params;
    const store = db.get();
    const exam = (store.comprehensiveExams || []).find((e) => e.id === id);
    if (!exam) {
      res.status(404).json({ error: 'الامتحان الشامل غير موجود.' });
      return;
    }

    exam.isActive = false;
    exam.closedAt = new Date().toISOString();
    db.save();

    res.json({ exam });
  }
);

// ADMIN ONLY: Re-activate a closed comprehensive exam if needed
router.post(
  '/admin/comprehensive-exams/:id/activate',
  requireAuth,
  requireAdmin,
  requirePermission('manage_quizzes'),
  (req, res) => {
    const { id } = req.params;
    const store = db.get();
    const exam = (store.comprehensiveExams || []).find((e) => e.id === id);
    if (!exam) {
      res.status(404).json({ error: 'الامتحان الشامل غير موجود.' });
      return;
    }

    exam.isActive = true;
    exam.closedAt = undefined;
    db.save();

    res.json({ exam });
  }
);

// ADMIN ONLY: Permanently delete a comprehensive exam and its submissions
router.delete(
  '/admin/comprehensive-exams/:id',
  requireAuth,
  requireAdmin,
  requirePermission('manage_quizzes'),
  (req, res) => {
    const { id } = req.params;
    const store = db.get();
    const before = (store.comprehensiveExams || []).length;
    store.comprehensiveExams = (store.comprehensiveExams || []).filter((e) => e.id !== id);
    if (store.comprehensiveExams.length === before) {
      res.status(404).json({ error: 'الامتحان الشامل غير موجود.' });
      return;
    }
    store.comprehensiveSubmissions = (store.comprehensiveSubmissions || []).filter(
      (s) => s.examId !== id
    );
    db.save();
    res.json({ ok: true });
  }
);

// ADMIN ONLY: Manually grade a student's submission and send the score + mistakes to the student
router.post(
  '/admin/comprehensive-exams/:examId/submissions/:submissionId/grade',
  requireAuth,
  requireAdmin,
  requirePermission('manage_quizzes'),
  (req: AuthenticatedRequest, res) => {
    const { examId, submissionId } = req.params;
    const store = db.get();

    const exam = (store.comprehensiveExams || []).find((e) => e.id === examId);
    const submission = (store.comprehensiveSubmissions || []).find(
      (s) => s.id === submissionId && s.examId === examId
    );

    if (!exam || !submission) {
      res.status(404).json({ error: 'تسليم الامتحان غير موجود.' });
      return;
    }

    const { grades, adminNote } = req.body as {
      grades?: Array<{
        questionId: string;
        awardedPoints: number;
        isCorrect?: boolean;
        correctAnswerText?: string;
        adminFeedback?: string;
      }>;
      adminNote?: string;
    };

    if (!Array.isArray(grades)) {
      res.status(400).json({ error: 'يرجى إدخال درجات الأسئلة للتصحيح اليدوي.' });
      return;
    }

    const gradeMap = new Map(grades.map((g) => [String(g.questionId), g]));
    const questionMap = new Map(exam.questions.map((q) => [q.id, q]));

    let totalScore = 0;
    let maxScore = 0;

    submission.answers = submission.answers.map((ans) => {
      const origQ = questionMap.get(ans.questionId);
      const maxPts = Math.max(1, Number(ans.maxPoints || origQ?.points || 1));
      maxScore += maxPts;

      const g = gradeMap.get(ans.questionId);
      const rawPoints = Number(g?.awardedPoints ?? 0);
      const awarded = Math.max(0, Math.min(maxPts, Number.isFinite(rawPoints) ? rawPoints : 0));
      totalScore += awarded;

      const isCorrect =
        typeof g?.isCorrect === 'boolean' ? g.isCorrect : awarded >= maxPts;

      let defaultCorrectText = '';
      if (origQ) {
        if (
          (origQ.type === 'mcq' || origQ.type === 'true_false') &&
          typeof origQ.correctIndex === 'number' &&
          origQ.options?.[origQ.correctIndex]
        ) {
          defaultCorrectText = origQ.options[origQ.correctIndex];
        } else if (origQ.modelAnswer) {
          defaultCorrectText = origQ.modelAnswer;
        }
      }

      return {
        ...ans,
        awardedPoints: awarded,
        isCorrect,
        correctAnswerText:
          g?.correctAnswerText !== undefined
            ? String(g.correctAnswerText).trim().slice(0, 2000) || undefined
            : defaultCorrectText || ans.correctAnswerText,
        adminFeedback:
          g?.adminFeedback !== undefined
            ? String(g.adminFeedback).trim().slice(0, 1500) || undefined
            : ans.adminFeedback,
      };
    });

    submission.totalScore = Math.round(totalScore * 100) / 100;
    submission.maxScore = maxScore;
    submission.status = 'graded';
    submission.adminNote = adminNote?.trim() ? adminNote.trim().slice(0, 1500) : undefined;
    submission.gradedAt = new Date().toISOString();
    submission.gradedBy = req.currentUser!.name;

    db.save();

    pushNotification({
      title: `تم نشر درجتك في الامتحان الشامل: ${exam.subjectName}`,
      message: `حصلت على ${submission.totalScore} من ${submission.maxScore} وتم نشر النتيجة في ملفك الشخصي. اضغط لعرض الدرجة ومراجعة أخطائك.`,
      type: 'exam',
      targetSection: 'home',
      year: submission.studentYear,
      userId: submission.userId,
      comprehensiveExamId: exam.id,
      createdBy: req.currentUser!.name,
    });

    res.json({ submission });
  }
);

export default router;
