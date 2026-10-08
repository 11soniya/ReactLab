import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createProductionServer } from '../server/server.js';
import { random, hash } from '../server/security.js';

test('production server serves static assets, SPA routes, and handles GitHub API', async (t) => {
  const encryptionKey = random();
  const { server, settings } = createProductionServer({
    PORT: 0,
    APP_ORIGIN: 'http://127.0.0.1',
    GITHUB_CLIENT_ID: 'test-client-id',
    GITHUB_CLIENT_SECRET: 'test-client-secret',
    TOKEN_ENCRYPTION_KEY: encryptionKey
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  settings.APP_ORIGIN = baseUrl;

  t.after(() => {
    server.close();
  });

  // 1. Root route serves index.html (SPA)
  const rootRes = await fetch(`${baseUrl}/`);
  assert.equal(rootRes.status, 200);
  assert.match(rootRes.headers.get('content-type'), /text\/html/);
  const rootHtml = await rootRes.text();
  assert.match(rootHtml, /<!doctype html>/i);

  // 2. Direct SPA navigation route serves index.html
  const spaRes = await fetch(`${baseUrl}/?github=authorized`);
  assert.equal(spaRes.status, 200);
  assert.match(spaRes.headers.get('content-type'), /text\/html/);

  // 3. Path traversal is rejected
  const traversalRes = await fetch(`${baseUrl}/..%2f..%2fpackage.json`);
  assert(traversalRes.status === 403 || traversalRes.status === 404 || traversalRes.status === 200 && traversalRes.headers.get('content-type').includes('text/html'));

  // 4. API Status endpoint returns 200 and configured state
  const statusRes = await fetch(`${baseUrl}/api/github/status`);
  assert.equal(statusRes.status, 200);
  const statusData = await statusRes.json();
  assert.equal(statusData.configured, true);
  assert.equal(statusData.authorized, false);

  // 5. OAuth Start endpoint returns authorization URL and sets cookie
  const startRes = await fetch(`${baseUrl}/api/github/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: baseUrl
    },
    body: '{}'
  });
  assert.equal(startRes.status, 200);
  const startData = await startRes.json();
  assert.match(startData.url, /github\.com\/login\/oauth\/authorize/);
  const oauthCookie = startRes.headers.get('set-cookie');
  assert.match(oauthCookie, /reactlab_oauth=/);

  // 6. Health check endpoint returns 200 with status ok
  const healthRes = await fetch(`${baseUrl}/health`);
  assert.equal(healthRes.status, 200);
  assert.match(healthRes.headers.get('content-type'), /application\/json/);
  const healthData = await healthRes.json();
  assert.deepEqual(healthData, { status: 'ok' });

  // 7. Health check HEAD request returns 200
  const healthHeadRes = await fetch(`${baseUrl}/health`, { method: 'HEAD' });
  assert.equal(healthHeadRes.status, 200);

  // 8. Classroom API: Unauthenticated /auth/me returns user: null
  const classroomMeRes = await fetch(`${baseUrl}/api/classroom/auth/me`);
  assert.equal(classroomMeRes.status, 200);
  const classroomMeData = await classroomMeRes.json();
  assert.equal(classroomMeData.user, null);

  // 9. Classroom API: Student Signup over HTTP
  const signupRes = await fetch(`${baseUrl}/api/classroom/auth/signup`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: baseUrl
    },
    body: JSON.stringify({
      email: 'http_student@example.com',
      name: 'HTTP Student',
      password: 'password123',
      role: 'student'
    })
  });
  assert.equal(signupRes.status, 201);
  const signupData = await signupRes.json();
  assert.equal(signupData.user.email, 'http_student@example.com');
  const sessionCookie = signupRes.headers.get('set-cookie');
  assert.match(sessionCookie, /reactlab_classroom_session=/);
});
