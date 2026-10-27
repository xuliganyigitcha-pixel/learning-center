const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const { randomInt } = require('node:crypto');
const { existsSync, rmSync } = require('node:fs');
const { resolve } = require('node:path');

const backendDirectory = resolve(__dirname, '..');
const databasePath = resolve(backendDirectory, 'prisma', 'smoke.db');
const databaseUrl = 'file:./smoke.db';
const port = randomInt(41000, 49000);
const apiUrl = `http://127.0.0.1:${port}/api`;
const environment = {
  ...process.env,
  DATABASE_URL: databaseUrl,
  JWT_ACCESS_SECRET: 'smoke-test-access-secret-32-characters-minimum',
  JWT_REFRESH_SECRET: 'smoke-test-refresh-secret-32-characters-minimum',
  PORT: String(port),
  FRONTEND_URL: 'http://localhost:3000',
};
let server;

function runPrisma(...args) {
  const result = spawnSync(
    process.execPath,
    [resolve(backendDirectory, 'node_modules', 'prisma', 'build', 'index.js'), ...args],
    { cwd: backendDirectory, env: environment, stdio: 'inherit' },
  );
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `prisma ${args.join(' ')} failed`);
}

async function request(path, { method = 'GET', body, token, cookie } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (token) headers.authorization = `Bearer ${token}`;
  if (cookie) headers.cookie = cookie;
  return fetch(`${apiUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function expectStatus(response, status, message) {
  const body = await response.text();
  assert.equal(response.status, status, `${message}: ${response.status} ${body}`);
  return body ? JSON.parse(body) : undefined;
}

function cookieFrom(response) {
  const cookie = response.headers
    .getSetCookie()
    .find((value) => value.startsWith('refreshToken='));
  assert.ok(cookie, 'refresh cookie was not set');
  return cookie.split(';')[0];
}

async function waitForServer() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`API exited with code ${server.exitCode}`);
    try {
      if ((await fetch(`${apiUrl}/health`)).ok) return;
    } catch {
      await new Promise((resolveWait) => setTimeout(resolveWait, 300));
    }
  }
  throw new Error('API did not start within 30 seconds');
}

async function main() {
  for (const suffix of ['', '-journal', '-shm', '-wal']) {
    const file = `${databasePath}${suffix}`;
    if (existsSync(file)) rmSync(file);
  }
  runPrisma('migrate', 'deploy');
  runPrisma('db', 'seed');
  server = spawn(process.execPath, [resolve(backendDirectory, 'dist', 'main.js')], {
    cwd: backendDirectory,
    env: environment,
    stdio: 'ignore',
  });

  try {
    await waitForServer();
    await expectStatus(await request('/health'), 200, 'health endpoint');

    let response = await request('/auth/login', {
      method: 'POST',
      body: { login: 'SUPERADMIN', password: 'Admin123!' },
    });
    const initialLogin = await expectStatus(response, 201, 'initial login');
    let token = initialLogin.accessToken;
    let cookie = cookieFrom(response);
    assert.equal(initialLogin.user.mustChangePw, true);
    await expectStatus(await request('/dashboard/stats', { token }), 403, 'forced password change');
    await expectStatus(
      await request('/auth/change-password', {
        method: 'POST',
        body: { oldPassword: 'Admin123!', newPassword: 'LearningCenter2026!' },
        token,
        cookie,
      }),
      201,
      'password change',
    );

    response = await request('/auth/login', {
      method: 'POST',
      body: { login: 'superadmin', password: 'LearningCenter2026!' },
    });
    const adminLogin = await expectStatus(response, 201, 'admin login');
    token = adminLogin.accessToken;
    cookie = cookieFrom(response);
    const adminId = adminLogin.user.id;
    assert.equal(adminLogin.user.mustChangePw, false);

    const previousAccessToken = token;
    response = await request('/auth/refresh', { method: 'POST', cookie });
    const refreshed = await expectStatus(response, 201, 'refresh rotation');
    const rotatedCookie = cookieFrom(response);
    assert.notEqual(rotatedCookie, cookie);
    token = refreshed.accessToken;
    await expectStatus(
      await request('/dashboard/stats', { token: previousAccessToken }),
      401,
      'access token revoked during refresh rotation',
    );
    await expectStatus(await request('/dashboard/stats', { token }), 200, 'dashboard');

    const invalidPayload = await request('/students', {
      method: 'POST',
      token,
      body: { firstName: 'No', lastName: 'Extra', passwordHash: 'nope' },
    });
    await expectStatus(invalidPayload, 400, 'unknown request field rejected');

    const group = await expectStatus(
      await request('/groups', { method: 'POST', token, body: { name: 'API test group' } }),
      201,
      'group create',
    );
    const student = await expectStatus(
      await request('/students', {
        method: 'POST',
        token,
        body: { firstName: 'Sinov', lastName: 'Oquvchi', groupId: group.id, monthlyFee: 450000 },
      }),
      201,
      'student create',
    );
    const lesson = await expectStatus(
      await request('/lessons', {
        method: 'POST',
        token,
        body: { groupId: group.id, date: new Date().toISOString(), topic: 'Smoke test' },
      }),
      201,
      'lesson create',
    );
    await expectStatus(
      await request(`/attendance/${lesson.id}`, {
        method: 'POST',
        token,
        body: { records: [{ studentId: student.id, status: 'PRESENT' }] },
      }),
      201,
      'attendance create',
    );
    await expectStatus(
      await request(`/grades/${lesson.id}`, {
        method: 'POST',
        token,
        body: { records: [{ studentId: student.id, score: 95 }] },
      }),
      201,
      'grade create',
    );
    const grades = await expectStatus(
      await request(`/grades/lesson/${lesson.id}`, { token }),
      200,
      'grade retrieval',
    );
    assert.equal(grades[0].score, 95);
    await expectStatus(
      await request('/payments', {
        method: 'POST',
        token,
        body: { studentId: student.id, amount: 450000, periodMonth: '2026-10', method: 'CASH' },
      }),
      201,
      'payment create',
    );
    const debt = await expectStatus(
      await request(`/payments/debt/${student.id}`, { token }),
      200,
      'payment debt',
    );
    assert.equal(debt.debt, 0);

    const teacher = await expectStatus(
      await request('/users', {
        method: 'POST',
        token,
        body: {
          login: 'teacher-test',
          fullName: 'Test teacher',
          role: 'TEACHER',
          password: 'TeacherTemp2026!',
        },
      }),
      201,
      'teacher create',
    );
    const teacherGroup = await expectStatus(
      await request('/groups', {
        method: 'POST',
        token,
        body: { name: 'Teacher group', teacherId: teacher.id },
      }),
      201,
      'teacher group create',
    );
    response = await request('/auth/login', {
      method: 'POST',
      body: { login: 'teacher-test', password: 'TeacherTemp2026!' },
    });
    const teacherLogin = await expectStatus(response, 201, 'teacher login');
    const teacherToken = teacherLogin.accessToken;
    const teacherCookie = cookieFrom(response);
    await expectStatus(await request('/payments', { token: teacherToken }), 403, 'teacher role restriction');
    await expectStatus(
      await request('/auth/change-password', {
        method: 'POST',
        body: { oldPassword: 'TeacherTemp2026!', newPassword: 'TeacherSecure2026!' },
        token: teacherToken,
        cookie: teacherCookie,
      }),
      201,
      'teacher password change',
    );
    response = await request('/auth/login', {
      method: 'POST',
      body: { login: 'teacher-test', password: 'TeacherSecure2026!' },
    });
    const activeTeacherToken = (await expectStatus(response, 201, 'teacher relogin')).accessToken;
    const scopedGroups = await expectStatus(
      await request('/groups', { token: activeTeacherToken }),
      200,
      'teacher group scope',
    );
    assert.deepEqual(scopedGroups.map((item) => item.id), [teacherGroup.id]);
    await expectStatus(
      await request(`/lessons`, {
        method: 'POST',
        token: activeTeacherToken,
        body: { groupId: group.id, date: new Date().toISOString() },
      }),
      403,
      'teacher cannot create lesson in another group',
    );
    await expectStatus(
      await request(`/users/${teacher.id}`, {
        method: 'PATCH',
        token,
        body: { isActive: false },
      }),
      200,
      'deactivate teacher',
    );
    await expectStatus(
      await request('/groups', { token: activeTeacherToken }),
      401,
      'deactivated teacher token revoked immediately',
    );
    await expectStatus(
      await request(`/users/${adminId}`, {
        method: 'PATCH',
        token,
        body: { isActive: false },
      }),
      400,
      'self-deactivation prevented',
    );
    const audit = await expectStatus(await request('/audit', { token }), 200, 'audit log');
    assert.equal(JSON.stringify(audit).includes('LearningCenter2026!'), false);
    response = await request('/auth/login', {
      method: 'POST',
      body: { login: 'superadmin', password: 'LearningCenter2026!' },
    });
    const logoutLogin = await expectStatus(response, 201, 'logout login');
    const logoutCookie = cookieFrom(response);
    await expectStatus(await request('/auth/logout', { method: 'POST', cookie: logoutCookie }), 201, 'logout');
    await expectStatus(
      await request('/dashboard/stats', { token: logoutLogin.accessToken }),
      401,
      'logout revokes access token',
    );
    console.log('Smoke tests passed: auth, forced password rotation, session rotation/revocation, validation, CRUD, roles, payments, and audit redaction.');
  } finally {
    if (server && server.exitCode === null) {
      server.kill('SIGTERM');
      await new Promise((resolveWait) => server.once('exit', resolveWait));
    }
    for (const suffix of ['', '-journal', '-shm', '-wal']) {
      const file = `${databasePath}${suffix}`;
      if (existsSync(file)) rmSync(file);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
