import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';

const TEST_PORT = 3201;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
const TMP_DIR = path.resolve('/tmp', `mvia-vercel-run-${Date.now()}`);
const TMP_DB = path.join(TMP_DIR, 'db.json');
const TMP_UPLOADS = path.join(TMP_DIR, 'uploads');
const TEST_ADMIN_SECRET = 'TEST-VERCEL-ADMIN-SECRET';

let serverProc: ReturnType<typeof spawn> | null = null;

async function waitForServer(url: string, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // Wait for server boot
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('Test server did not become ready in time');
}

async function api<T = Record<string, unknown>>(
  endpoint: string,
  options: RequestInit & { token?: string } = {}
): Promise<{ status: number; data: T }> {
  const headers = new Headers(options.headers || {});
  if (options.token) {
    headers.set('Authorization', `Bearer ${options.token}`);
  }
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });
  const data = (await res.json().catch(() => ({}))) as T;
  return { status: res.status, data };
}

before(async () => {
  fs.mkdirSync(TMP_UPLOADS, { recursive: true });
  serverProc = spawn('node', ['server.ts'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(TEST_PORT),
      MVIA_DB_FILE: TMP_DB,
      MVIA_UPLOADS_DIR: TMP_UPLOADS,
      MVIA_DISABLE_AUTO_BACKUP: '1',
      ADMIN_SECRET_CODE: TEST_ADMIN_SECRET,
      RESEND_API_KEY: 're_test_without_sender',
      EMAIL_FROM: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  await waitForServer(`${BASE_URL}/api/health`);
});

after(async () => {
  if (serverProc && !serverProc.killed) {
    serverProc.kill('SIGTERM');
    await new Promise((r) => setTimeout(r, 300));
  }
  if (fs.existsSync(TMP_DIR)) {
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
  }
});

describe('MVIA Admin Session Revocation, REST Chat & Vercel Adapter Suite', () => {
  test('1. Admin can revoke all non-admin sessions while preserving every admin session', async () => {
    const admin1Reg = await api<{ token: string; user: { id: string; role: string } }>(
      '/api/auth/register',
      {
        method: 'POST',
        body: JSON.stringify({
          name: 'Primary Admin',
          email: 'admin1.sessions@test.edu',
          phone: '01777777701',
          password: 'password123',
          year: 4,
          adminCode: TEST_ADMIN_SECRET,
          acceptedTerms: true,
        }),
      }
    );
    assert.equal(admin1Reg.status, 201);

    const admin2Reg = await api<{ token: string; user: { id: string; role: string } }>(
      '/api/auth/register',
      {
        method: 'POST',
        body: JSON.stringify({
          name: 'Peer Admin',
          email: 'admin2.sessions@test.edu',
          phone: '01777777702',
          password: 'password123',
          year: 4,
          adminCode: TEST_ADMIN_SECRET,
          acceptedTerms: true,
        }),
      }
    );
    assert.equal(admin2Reg.status, 201);

    const studentReg = await api<{ token: string; user: { id: string; role: string } }>(
      '/api/auth/register',
      {
        method: 'POST',
        body: JSON.stringify({
          name: 'Session Student',
          email: 'student.sessions@test.edu',
          phone: '01777777703',
          password: 'password123',
          year: 2,
          acceptedTerms: true,
        }),
      }
    );
    assert.equal(studentReg.status, 201);

    const teacherCreate = await api<{ user: { id: string; role: string } }>(
      '/api/admin/users',
      {
        method: 'POST',
        token: admin1Reg.data.token,
        body: JSON.stringify({
          name: 'Session Teacher',
          email: 'teacher.sessions@test.edu',
          phone: '01777777704',
          password: 'password123',
          year: 4,
          role: 'teacher',
        }),
      }
    );
    assert.equal(teacherCreate.status, 201);
    assert.equal(teacherCreate.data.user.role, 'teacher');

    const teacherLogin = await api<{ token: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        identifier: 'teacher.sessions@test.edu',
        password: 'password123',
      }),
    });
    assert.equal(teacherLogin.status, 200);

    // Non-admin and unauthenticated callers are strictly rejected
    const unauthRevoke = await api('/api/admin/sessions/revoke-non-admins', {
      method: 'POST',
    });
    assert.equal(unauthRevoke.status, 401);

    const studentRevoke = await api('/api/admin/sessions/revoke-non-admins', {
      method: 'POST',
      token: studentReg.data.token,
    });
    assert.equal(studentRevoke.status, 403);

    const teacherRevoke = await api('/api/admin/sessions/revoke-non-admins', {
      method: 'POST',
      token: teacherLogin.data.token,
    });
    assert.equal(teacherRevoke.status, 403);

    // Admin triggers global non-admin session revocation
    const revokeRes = await api<{
      ok: boolean;
      revokedSessionsCount: number;
      affectedUsersCount: number;
      keptAdminSessionsCount: number;
    }>('/api/admin/sessions/revoke-non-admins', {
      method: 'POST',
      token: admin1Reg.data.token,
    });
    assert.equal(revokeRes.status, 200);
    assert.equal(revokeRes.data.ok, true);
    assert.ok(revokeRes.data.revokedSessionsCount >= 2);
    assert.ok(revokeRes.data.affectedUsersCount >= 2);
    assert.ok(revokeRes.data.keptAdminSessionsCount >= 2);

    // Both student and teacher tokens are now invalidated (must sign in again)
    const studentAfter = await api('/api/auth/me', { token: studentReg.data.token });
    assert.equal(studentAfter.status, 401);

    const teacherAfter = await api('/api/auth/me', { token: teacherLogin.data.token });
    assert.equal(teacherAfter.status, 401);

    // Both admins (caller AND peer admin) remain signed in untouched
    const admin1After = await api('/api/auth/me', { token: admin1Reg.data.token });
    assert.equal(admin1After.status, 200);

    const admin2After = await api('/api/auth/me', { token: admin2Reg.data.token });
    assert.equal(admin2After.status, 200);

    // Student can sign back in cleanly afterwards
    const studentRelogin = await api<{ token: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        identifier: 'student.sessions@test.edu',
        password: 'password123',
      }),
    });
    assert.equal(studentRelogin.status, 200);
    assert.ok(studentRelogin.data.token);

    // Audit log captured the bulk revocation event
    const auditRes = await api<{ logs: Array<{ action: string }> }>(
      '/api/admin/audit-logs',
      { token: admin1Reg.data.token }
    );
    assert.equal(auditRes.status, 200);
    assert.ok(
      auditRes.data.logs.some((l) => l.action === 'sessions.revoke_non_admins'),
      'Expected sessions.revoke_non_admins audit entry'
    );
  });

  test('2. Community batch chat works over REST fallback for Vercel Serverless', async () => {
    const loginRes = await api<{ token: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        identifier: 'student.sessions@test.edu',
        password: 'password123',
      }),
    });
    assert.equal(loginRes.status, 200);
    const token = loginRes.data.token;

    const emptyMsg = await api('/api/community/chat/general', {
      method: 'POST',
      token,
      body: JSON.stringify({ text: '   ' }),
    });
    assert.equal(emptyMsg.status, 400);

    const postMsg = await api<{
      message: { id: string; text: string; room: string; userRole: string };
    }>('/api/community/chat/general', {
      method: 'POST',
      token,
      body: JSON.stringify({ text: 'رسالة اختبار عبر REST لمنصة Vercel' }),
    });
    assert.equal(postMsg.status, 201);
    assert.equal(postMsg.data.message.room, 'general');
    assert.equal(postMsg.data.message.userRole, 'student');
    assert.equal(postMsg.data.message.text, 'رسالة اختبار عبر REST لمنصة Vercel');

    const adminLogin = await api<{ token: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        identifier: 'admin1.sessions@test.edu',
        password: 'password123',
      }),
    });
    assert.equal(adminLogin.status, 200);

    const adminPostMsg = await api<{
      message: { id: string; text: string; rankBadge?: { labelAr?: string } };
    }>('/api/community/chat/general', {
      method: 'POST',
      token: adminLogin.data.token,
      body: JSON.stringify({ text: 'رسالة أدمن عبر REST' }),
    });
    assert.equal(adminPostMsg.status, 201);
    assert.ok(adminPostMsg.data.message.rankBadge, 'Admin REST message should carry rankBadge');

    const listRes = await api<{
      messages: Array<{ id: string; text: string; rankBadge?: unknown }>;
    }>('/api/community/chat/general', { token });
    assert.equal(listRes.status, 200);
    assert.ok(
      listRes.data.messages.some((m) => m.id === postMsg.data.message.id),
      'Posted REST message must appear in GET history'
    );
    const hydratedAdminMsg = listRes.data.messages.find(
      (m) => m.id === adminPostMsg.data.message.id
    );
    assert.ok(hydratedAdminMsg?.rankBadge, 'GET chat history must hydrate rankBadge');
  });

  test('3. Vercel API adapter normalizes rewrite paths and serves requests under VERCEL=1 without EROFS', async () => {
    const prevVercel = process.env.VERCEL;
    const prevDbFile = process.env.MVIA_DB_FILE;
    const prevUploadsDir = process.env.MVIA_UPLOADS_DIR;
    const prevAutoBackup = process.env.MVIA_DISABLE_AUTO_BACKUP;

    process.env.VERCEL = '1';
    delete process.env.MVIA_DB_FILE;
    delete process.env.MVIA_UPLOADS_DIR;
    process.env.MVIA_DISABLE_AUTO_BACKUP = '1';

    let serverlessHttp: http.Server | null = null;
    try {
      const vercelMod = await import('../api/index.ts');
      const { normalizeVercelApiUrl, default: handler } = vercelMod;

      assert.equal(
        normalizeVercelApiUrl('/api?__mvia_path=auth/login'),
        '/api/auth/login'
      );
      assert.equal(
        normalizeVercelApiUrl('/api?__mvia_path=admin/users&page=2&role=student'),
        '/api/admin/users?page=2&role=student'
      );
      assert.equal(normalizeVercelApiUrl('/api/health?check=1'), '/api/health?check=1');

      serverlessHttp = http.createServer((req, res) => {
        void handler(req, res);
      });

      await new Promise<void>((resolve) => serverlessHttp!.listen(0, '127.0.0.1', resolve));
      const addr = serverlessHttp.address();
      assert.ok(addr && typeof addr === 'object');
      const serverlessBase = `http://127.0.0.1:${addr.port}`;

      const healthRes = await fetch(`${serverlessBase}/api?__mvia_path=health`);
      assert.equal(healthRes.status, 200);
      const healthBody = (await healthRes.json()) as {
        ok: boolean;
        runtime?: string;
      };
      assert.equal(healthBody.ok, true);
      assert.equal(healthBody.runtime, 'vercel');

      const statusRes = await fetch(`${serverlessBase}/api?__mvia_path=status`);
      assert.equal(statusRes.status, 200);
      const statusBody = (await statusRes.json()) as {
        services?: { websocket?: string };
      };
      assert.equal(statusBody.services?.websocket, 'polling');

      const loginRes = await fetch(`${serverlessBase}/api?__mvia_path=auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: 'nonexistent@test.edu', password: 'wrong' }),
      });
      assert.equal(loginRes.status, 401);
      const loginJson = (await loginRes.json()) as { error?: string };
      assert.ok(loginJson.error, 'JSON error response must be returned through Vercel rewrite');
    } finally {
      if (serverlessHttp) {
        await new Promise<void>((resolve) => serverlessHttp!.close(() => resolve()));
      }
      if (prevVercel === undefined) delete process.env.VERCEL;
      else process.env.VERCEL = prevVercel;
      if (prevDbFile === undefined) delete process.env.MVIA_DB_FILE;
      else process.env.MVIA_DB_FILE = prevDbFile;
      if (prevUploadsDir === undefined) delete process.env.MVIA_UPLOADS_DIR;
      else process.env.MVIA_UPLOADS_DIR = prevUploadsDir;
      if (prevAutoBackup === undefined) delete process.env.MVIA_DISABLE_AUTO_BACKUP;
      else process.env.MVIA_DISABLE_AUTO_BACKUP = prevAutoBackup;
    }
  });

  test('4. Clean seed has no demo users or admin123 password and blocks non-admin privilege escalation', async () => {
    // 1) Hardcoded legacy demo password 'admin123' must not log in as founder
    const legacyLogin = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        identifier: '01000000000',
        password: 'admin123',
      }),
    });
    assert.equal(legacyLogin.status, 401);

    // 2) Registration with invalid adminCode is strictly rejected (403)
    const fakeAdminReg = await api('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Attempt Escalation',
        email: 'escalate@test.edu',
        phone: '01777777799',
        password: 'password123',
        year: 1,
        adminCode: 'WRONG-SECRET',
        acceptedTerms: true,
      }),
    });
    assert.equal(fakeAdminReg.status, 403);

    // 3) Regular student cannot access admin endpoints or self-promote
    const studentLogin = await api<{ token: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        identifier: 'student.sessions@test.edu',
        password: 'password123',
      }),
    });
    assert.equal(studentLogin.status, 200);
    const sToken = studentLogin.data.token;

    const activateWrong = await api('/api/account/activate-admin', {
      method: 'POST',
      token: sToken,
      body: JSON.stringify({ password: 'wrong-activation-pass' }),
    });
    assert.equal(activateWrong.status, 403);

    const profileEmailEdit = await api('/api/account/profile', {
      method: 'PATCH',
      token: sToken,
      body: JSON.stringify({ email: 'hijack@test.edu' }),
    });
    assert.equal(profileEmailEdit.status, 403);

    const createOfficial = await api('/api/admin/officials', {
      method: 'POST',
      token: sToken,
      body: JSON.stringify({ userId: 'target-admin-id', rankId: 'rank-super-admin' }),
    });
    assert.equal(createOfficial.status, 403);

    const editRank = await api('/api/admin/ranks/rank-student-affairs', {
      method: 'PATCH',
      token: sToken,
      body: JSON.stringify({ permissions: ['manage_ranks'] }),
    });
    assert.equal(editRank.status, 403);

    const createAdminUser = await api('/api/admin/users', {
      method: 'POST',
      token: sToken,
      body: JSON.stringify({
        name: 'Rogue Admin',
        email: 'rogue@test.edu',
        phone: '01777777798',
        password: 'password123',
        year: 4,
        role: 'admin',
      }),
    });
    assert.equal(createAdminUser.status, 403);

    // 4) Seeded DB must not contain legacy fake demo students or pre-seeded founder accounts
    const adminLogin = await api<{ token: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        identifier: 'admin1.sessions@test.edu',
        password: 'password123',
      }),
    });
    assert.equal(adminLogin.status, 200);

    const usersList = await api<{ users: Array<{ id: string; email?: string }> }>(
      '/api/admin/users?limit=100',
      { token: adminLogin.data.token }
    );
    assert.equal(usersList.status, 200);
    const disallowedSeedIds = new Set([
      'user-founder-admin',
      'user-std-1',
      'user-std-2',
      'user-std-3',
      'user-std-4',
      'user-std-5',
      'user-std-6',
    ]);
    assert.equal(
      usersList.data.users.some((u) => disallowedSeedIds.has(u.id)),
      false,
      'Fresh seeded DB must not contain any prior/demo accounts'
    );
  });

  test('5. Persistent session cookie restores user across visits without re-registering and clears on logout', async () => {
    const rawReg = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Returning Cookie Student',
        email: 'returning.cookie@test.edu',
        phone: '01777777755',
        password: 'password123',
        year: 3,
        acceptedTerms: true,
      }),
    });
    assert.equal(rawReg.status, 201);
    const setCookieHeader = rawReg.headers.get('set-cookie') || '';
    assert.ok(setCookieHeader.includes('mvia_session='), 'Register must issue persistent mvia_session cookie');
    assert.ok(setCookieHeader.includes('Max-Age=31536000'), 'Session cookie should persist for 1 year');

    const cookiePair = setCookieHeader.split(';')[0].trim();

    // Subsequent visit with ONLY cookie (no Bearer header, e.g. localStorage cleared)
    const meWithCookie = await fetch(`${BASE_URL}/api/auth/me`, {
      headers: { Cookie: cookiePair },
    });
    assert.equal(meWithCookie.status, 200);
    const meData = (await meWithCookie.json()) as {
      token?: string;
      user: { email: string; name: string };
    };
    assert.equal(meData.user.email, 'returning.cookie@test.edu');
    assert.ok(meData.token, '/api/auth/me should return session token to re-sync client storage');

    // Explicit logout clears cookie and revokes server session
    const logoutRes = await fetch(`${BASE_URL}/api/auth/logout`, {
      method: 'POST',
      headers: { Cookie: cookiePair },
    });
    assert.equal(logoutRes.status, 200);
    const clearedCookie = logoutRes.headers.get('set-cookie') || '';
    assert.ok(clearedCookie.includes('Max-Age=0'), 'Logout must clear mvia_session cookie');

    const meAfterLogout = await fetch(`${BASE_URL}/api/auth/me`, {
      headers: { Cookie: cookiePair },
    });
    assert.equal(meAfterLogout.status, 401);
  });

  test('6. Registered users and active sessions survive server restarts and platform updates', async () => {
    const rawReg = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Update Resilient Student',
        email: 'resilient.student@test.edu',
        phone: '01777777766',
        password: 'password123',
        year: 2,
        acceptedTerms: true,
      }),
    });
    assert.equal(rawReg.status, 201);
    const regData = (await rawReg.json()) as { token: string; user: { id: string; email: string } };
    const setCookie = rawReg.headers.get('set-cookie') || '';
    const cookiePair = setCookie.split(';')[0].trim();
    assert.ok(regData.token);
    assert.ok(cookiePair.startsWith('mvia_session='));

    // Simulate a server restart / platform code update on the same persistent DB
    if (serverProc && !serverProc.killed) {
      serverProc.kill('SIGTERM');
      await new Promise((r) => setTimeout(r, 400));
    }

    serverProc = spawn('node', ['server.ts'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: 'production',
        PORT: String(TEST_PORT),
        MVIA_DB_FILE: TMP_DB,
        MVIA_UPLOADS_DIR: TMP_UPLOADS,
        MVIA_DISABLE_AUTO_BACKUP: '1',
        ADMIN_SECRET_CODE: TEST_ADMIN_SECRET,
        RESEND_API_KEY: 're_test_without_sender',
        EMAIL_FROM: '',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    await waitForServer(`${BASE_URL}/api/health`);

    // Returning with existing cookie still works immediately without re-login
    const meCookieAfterRestart = await fetch(`${BASE_URL}/api/auth/me`, {
      headers: { Cookie: cookiePair },
    });
    assert.equal(meCookieAfterRestart.status, 200);
    const refreshedCookie = meCookieAfterRestart.headers.get('set-cookie') || '';
    assert.ok(
      refreshedCookie.includes('Max-Age=31536000'),
      'GET /api/auth/me must issue rolling 1-year cookie refresh'
    );
    const cookieBody = (await meCookieAfterRestart.json()) as {
      token?: string;
      user: { id: string; email: string };
    };
    assert.equal(cookieBody.user.id, regData.user.id);
    assert.equal(cookieBody.user.email, 'resilient.student@test.edu');

    // Returning with existing Bearer token also works immediately
    const meTokenAfterRestart = await api<{ user: { id: string } }>('/api/auth/me', {
      token: regData.token,
    });
    assert.equal(meTokenAfterRestart.status, 200);
    assert.equal(meTokenAfterRestart.data.user.id, regData.user.id);
  });

  test('7. Comprehensive Exam: Admin-only creation (MCQ/TF/Essay), active banner, pending grading, deactivation, and manual grading with mistakes', async () => {
    const adminLogin = await api<{ token: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        identifier: 'admin1.sessions@test.edu',
        password: 'password123',
      }),
    });
    assert.equal(adminLogin.status, 200);
    const adminToken = adminLogin.data.token;

    const studentLogin = await api<{ token: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        identifier: 'resilient.student@test.edu',
        password: 'password123',
      }),
    });
    assert.equal(studentLogin.status, 200);
    const studentToken = studentLogin.data.token;

    const peerStudentLogin = await api<{ token: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        identifier: 'student.sessions@test.edu',
        password: 'password123',
      }),
    });
    assert.equal(peerStudentLogin.status, 200);
    const peerToken = peerStudentLogin.data.token;

    // 1) Student strictly blocked from admin comprehensive exam routes
    const studentAdminGet = await api('/api/admin/comprehensive-exams', {
      token: studentToken,
    });
    assert.equal(studentAdminGet.status, 403);

    const studentAdminPost = await api('/api/admin/comprehensive-exams', {
      method: 'POST',
      token: studentToken,
      body: JSON.stringify({
        subjectName: 'Unauthorized Exam',
        durationMinutes: 20,
        questions: [{ type: 'essay', question: 'Q', points: 5 }],
      }),
    });
    assert.equal(studentAdminPost.status, 403);

    // 2) Admin creates comprehensive exam with MCQ, True/False, and Essay
    const createRes = await api<{
      exam: {
        id: string;
        subjectName: string;
        durationMinutes: number;
        isActive: boolean;
        questions: Array<{ id: string; type: string; points: number }>;
      };
    }>('/api/admin/comprehensive-exams', {
      method: 'POST',
      token: adminToken,
      body: JSON.stringify({
        subjectName: 'نظم المعلومات الجغرافية الشامل',
        durationMinutes: 45,
        targetYear: 0,
        questions: [
          {
            type: 'mcq',
            question: 'أي صيغة تمثل البيانات المكانية الاتجاهية على الويب؟',
            points: 5,
            options: ['GeoJSON', 'MP3', 'PNG', 'WAV'],
            correctIndex: 0,
            modelAnswer: 'GeoJSON هي الصيغة القياسية لتمثيل المعالم المكانية.',
          },
          {
            type: 'true_false',
            question: 'نظام WGS84 هو المرجع الجيوديسي العالمي القياسي لـ GPS.',
            points: 2,
            correctIndex: 0,
          },
          {
            type: 'essay',
            question: 'اشرح الفرق بين بيانات Vector و Raster مع مثال.',
            points: 10,
            modelAnswer: 'Vector يمثل النقاط والخطوط والمضلعات؛ Raster يمثل البكسلات المستمرة.',
          },
        ],
      }),
    });
    assert.equal(createRes.status, 201);
    const exam = createRes.data.exam;
    assert.equal(exam.isActive, true);
    assert.equal(exam.questions.length, 3);

    // 3) Student sees exam in active top-banner endpoint without answer keys leaked
    const activeRes = await api<{
      exams: Array<{
        id: string;
        subjectName: string;
        mySubmissionStatus: string | null;
        questions: Array<{ id: string; correctIndex?: number; modelAnswer?: string }>;
      }>;
    }>('/api/comprehensive-exams/active', { token: studentToken });
    assert.equal(activeRes.status, 200);
    const foundActive = activeRes.data.exams.find((e) => e.id === exam.id);
    assert.ok(foundActive, 'Active comprehensive exam must appear for students');
    assert.equal(foundActive.mySubmissionStatus, null);
    for (const q of foundActive.questions) {
      assert.equal(q.correctIndex, undefined, 'correctIndex must never leak before grading');
      assert.equal(q.modelAnswer, undefined, 'modelAnswer must never leak before grading');
    }

    // 4) Student submits answers -> enters pending_grading ('في انتظار التصحيح')
    const [qMcq, qTf, qEssay] = exam.questions;
    const submitRes = await api<{
      submission: { id: string; status: string; totalScore: number };
    }>(`/api/comprehensive-exams/${exam.id}/submit`, {
      method: 'POST',
      token: studentToken,
      body: JSON.stringify({
        timeSpentSeconds: 320,
        responses: [
          { questionId: qMcq.id, selectedIndex: 2 }, // wrong pick (PNG)
          { questionId: qTf.id, selectedIndex: 0 }, // correct pick (صح)
          { questionId: qEssay.id, essayAnswer: 'Vector للنقاط والخطوط و Raster للصور الشبكية.' },
        ],
      }),
    });
    assert.equal(submitRes.status, 201);
    assert.equal(submitRes.data.submission.status, 'pending_grading');
    const subId = submitRes.data.submission.id;

    // 5) Admin removes/deactivates exam -> top banner disappears immediately while submissions stay
    const deactivateRes = await api<{ exam: { isActive: boolean } }>(
      `/api/admin/comprehensive-exams/${exam.id}/deactivate`,
      { method: 'POST', token: adminToken }
    );
    assert.equal(deactivateRes.status, 200);
    assert.equal(deactivateRes.data.exam.isActive, false);

    const activeAfterRemove = await api<{ exams: Array<{ id: string }> }>(
      '/api/comprehensive-exams/active',
      { token: studentToken }
    );
    assert.equal(
      activeAfterRemove.data.exams.some((e) => e.id === exam.id),
      false,
      'Deactivated exam must disappear from active top news banner'
    );

    // 6) Admin manually grades submission and sends score + mistake feedback
    const gradeRes = await api<{
      submission: {
        status: string;
        totalScore: number;
        maxScore: number;
        answers: Array<{
          questionId: string;
          isCorrect?: boolean;
          awardedPoints?: number;
          correctAnswerText?: string;
          adminFeedback?: string;
        }>;
      };
    }>(`/api/admin/comprehensive-exams/${exam.id}/submissions/${subId}/grade`, {
      method: 'POST',
      token: adminToken,
      body: JSON.stringify({
        adminNote: 'أحسنت في المقالي، راجع صيغ الويب الجغرافية.',
        grades: [
          {
            questionId: qMcq.id,
            awardedPoints: 0,
            isCorrect: false,
            correctAnswerText: 'GeoJSON',
            adminFeedback: 'PNG صورة عادية وليست صيغة بيانات اتجاهية للويب.',
          },
          {
            questionId: qTf.id,
            awardedPoints: 2,
            isCorrect: true,
            correctAnswerText: 'صح',
          },
          {
            questionId: qEssay.id,
            awardedPoints: 9,
            isCorrect: true,
            correctAnswerText: 'Vector يمثل المعالم الهندسية و Raster يمثل الخلايا المستمرة.',
            adminFeedback: 'شرح ممتاز وينقصه مثال تطبيقي.',
          },
        ],
      }),
    });
    assert.equal(gradeRes.status, 200);
    assert.equal(gradeRes.data.submission.status, 'graded');
    assert.equal(gradeRes.data.submission.totalScore, 11);
    assert.equal(gradeRes.data.submission.maxScore, 17);

    // Student sees sent grade and exact mistakes
    const mySubsRes = await api<{
      submissions: Array<{
        id: string;
        status: string;
        totalScore: number;
        maxScore: number;
        answers: Array<{
          questionId: string;
          isCorrect?: boolean;
          correctAnswerText?: string;
          adminFeedback?: string;
        }>;
      }>;
    }>('/api/comprehensive-exams/my-submissions', { token: studentToken });
    assert.equal(mySubsRes.status, 200);
    const gradedSub = mySubsRes.data.submissions.find((s) => s.id === subId);
    assert.ok(gradedSub);
    assert.equal(gradedSub.status, 'graded');
    assert.equal(gradedSub.totalScore, 11);
    const wrongItem = gradedSub.answers.find((a) => a.questionId === qMcq.id);
    assert.equal(wrongItem?.isCorrect, false);
    assert.equal(wrongItem?.correctAnswerText, 'GeoJSON');
    assert.ok(wrongItem?.adminFeedback?.includes('PNG'));

    // Private score notification delivered only to the graded student (not peer student)
    const studentNotifs = await api<{ notifications: Array<{ title: string; userId?: string }> }>(
      '/api/notifications',
      { token: studentToken }
    );
    assert.ok(
      studentNotifs.data.notifications.some((n) => n.userId && n.title.includes('نظم المعلومات الجغرافية')),
      'Graded student must receive private grade notification'
    );

    const peerNotifs = await api<{ notifications: Array<{ title: string; userId?: string }> }>(
      '/api/notifications',
      { token: peerToken }
    );
    assert.equal(
      peerNotifs.data.notifications.some((n) => n.userId && n.title.includes('تم تصحيح امتحانك الشامل')),
      false,
      'Other students must NOT see private grade notifications'
    );
  });
});



