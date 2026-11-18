import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, test } from 'node:test';

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mvia-session-persist-'));
process.env.MVIA_DB_FILE = path.join(TMP_DIR, 'db.json');
process.env.MVIA_UPLOADS_DIR = path.join(TMP_DIR, 'uploads');
process.env.SESSION_SECRET = 'test-deploy-persistent-secret-key';

const { db, hashPassword } = await import('../server/db.js');
const {
  createPersistentSession,
  resolveUserByToken,
  revokeNonAdminSessions,
  revokeSessionToken,
  verifySessionJwt,
} = await import('../server/auth.js');

after(() => {
  if (fs.existsSync(TMP_DIR)) {
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
  }
});

describe('MVIA Persistent JWT & Deploy-Resilient Sessions', () => {
  test('1. Issued tokens are signed JWTs that survive in-memory session array loss', async () => {
    const store = db.get();
    const studentId = 'user-persist-student-1';
    store.users.push({
      id: studentId,
      name: 'Persistent Student',
      email: 'persist.student@test.edu',
      phone: '01999999901',
      passwordHash: hashPassword('password123'),
      year: 2,
      role: 'student',
      isProtected: false,
      points: 10,
      quizzesCompleted: 1,
      createdAt: new Date().toISOString(),
    });
    db.save();

    const token = await createPersistentSession(studentId);
    const jwt = verifySessionJwt(token);
    assert.ok(jwt, 'Token should be a valid signed JWT');
    assert.equal(jwt.sub, studentId);

    // Simulate a cold deploy / concurrent snapshot where store.sessions lost the entry
    store.sessions = [];
    const resolved = await resolveUserByToken(token);
    assert.ok(resolved, 'Signed JWT must resolve the user even if store.sessions was cleared');
    assert.equal(resolved.id, studentId);
  });

  test('2. Explicit logout revokes even a valid signed JWT immediately', async () => {
    const store = db.get();
    const studentId = 'user-persist-student-2';
    store.users.push({
      id: studentId,
      name: 'Logout Student',
      email: 'logout.student@test.edu',
      phone: '01999999902',
      passwordHash: hashPassword('password123'),
      year: 1,
      role: 'student',
      isProtected: false,
      points: 0,
      quizzesCompleted: 0,
      createdAt: new Date().toISOString(),
    });
    db.save();

    const token = await createPersistentSession(studentId);
    assert.ok(await resolveUserByToken(token));

    await revokeSessionToken(token);
    const afterLogout = await resolveUserByToken(token);
    assert.equal(afterLogout, undefined, 'Revoked token must no longer authenticate');
  });

  test('3. Revoking non-admin sessions invalidates student JWTs while keeping admin JWTs valid', async () => {
    const store = db.get();
    const adminId = 'user-persist-admin-1';
    const studentId = 'user-persist-student-3';

    store.users.push(
      {
        id: adminId,
        name: 'Persist Admin',
        email: 'persist.admin@test.edu',
        phone: '01999999903',
        passwordHash: hashPassword('password123'),
        year: 4,
        role: 'admin',
        adminRankId: 'rank-super-admin',
        isProtected: true,
        points: 0,
        quizzesCompleted: 0,
        createdAt: new Date().toISOString(),
      },
      {
        id: studentId,
        name: 'Bulk Revoke Student',
        email: 'bulk.student@test.edu',
        phone: '01999999904',
        passwordHash: hashPassword('password123'),
        year: 3,
        role: 'student',
        isProtected: false,
        points: 0,
        quizzesCompleted: 0,
        createdAt: new Date().toISOString(),
      }
    );
    db.save();

    const adminToken = await createPersistentSession(adminId);
    const studentToken = await createPersistentSession(studentId);
    await new Promise((r) => setTimeout(r, 5));

    await revokeNonAdminSessions(new Set([adminId]));

    assert.ok(await resolveUserByToken(adminToken), 'Admin token must stay valid');
    assert.equal(
      await resolveUserByToken(studentToken),
      undefined,
      'Non-admin token must be invalidated'
    );

    // Re-login immediately afterwards must work cleanly
    await new Promise((r) => setTimeout(r, 5));
    const freshStudentToken = await createPersistentSession(studentId);
    assert.ok(
      await resolveUserByToken(freshStudentToken),
      'Student should be able to sign back in immediately after revocation'
    );
  });
});
