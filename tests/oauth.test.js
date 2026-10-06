import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { handleApi, verifyInstallation } from '../server/api.js';
import { random, hash, seal, unseal } from '../server/security.js';
import { createPractical } from '../src/utils/practicals.js';

function environment() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../drizzle/0000_github_oauth.sql', import.meta.url), 'utf8'));
  const DB = {
    prepare(sql) {
      return {
        bind(...values) {
          return {
            first: async () => sqlite.prepare(sql).get(...values) || null,
            run: async () => sqlite.prepare(sql).run(...values)
          };
        }
      };
    }
  };
  return {
    DB,
    sqlite,
    APP_ORIGIN: 'https://reactlab.test',
    GITHUB_CLIENT_ID: 'Iv1.test',
    GITHUB_CLIENT_SECRET: 'server-only-secret',
    GITHUB_APP_ID: '42',
    GITHUB_APP_SLUG: 'reactlab-test',
    TOKEN_ENCRYPTION_KEY: random()
  };
}

function request(path, options = {}) {
  return new Request(`https://reactlab.test/api/github/${path}`, {
    ...options,
    headers: {
      'x-user-id': 'student-1',
      ...(options.method === 'POST' ? { Origin: 'https://reactlab.test', 'Content-Type': 'application/json' } : {}),
      ...options.headers
    }
  });
}

test('AES-GCM protects credentials and binds them to one user', async () => {
  const key = random();
  const encrypted = await seal({ access_token: 'secret-token' }, key, 'one');
  assert(!encrypted.includes('secret-token'));
  assert.equal((await unseal(encrypted, key, 'one')).access_token, 'secret-token');
  await assert.rejects(unseal(encrypted, key, 'two'));
  await assert.rejects(unseal(encrypted, random(), 'one'));
});

test('OAuth flow uses PKCE, server-side exchange, secure cookie and single-use callback', async () => {
  const env = environment();
  const start = await handleApi(request('start', { method: 'POST', body: '{}' }), env);
  assert.equal(start.status, 200);

  const auth = new URL((await start.json()).url);
  assert.equal(auth.origin, 'https://github.com');
  assert.equal(auth.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(auth.searchParams.get('scope'), 'repo');

  const flowCookie = start.headers.get('set-cookie').split(';')[0];
  assert.match(start.headers.get('set-cookie'), /HttpOnly; SameSite=Lax/);
  assert.match(start.headers.get('set-cookie'), /Secure/);

  const callback = request(`callback?code=temporary&state=${auth.searchParams.get('state')}`, {
    headers: { Cookie: flowCookie }
  });

  let exchanges = 0;
  const fetcher = async (url, options) => {
    if (url.includes('access_token')) {
      exchanges++;
      const body = JSON.parse(options.body);
      assert.equal(await hash(body.code_verifier), auth.searchParams.get('code_challenge'));
      assert.equal(body.client_secret, env.GITHUB_CLIENT_SECRET);
      return Response.json({ access_token: 'ghu_test-secret', expires_in: 28800, refresh_token: 'unused' });
    }
    assert.equal(url, 'https://api.github.com/user');
    return Response.json({ id: 123, login: 'student', name: 'Student' });
  };

  const result = await handleApi(callback, env, fetcher);
  assert.equal(result.status, 303);
  assert.equal(result.headers.get('location'), 'https://reactlab.test/?github=authorized');
  assert(![...result.headers].flat().join('').includes('ghu_test-secret'));

  const sessionCookie = result.headers.get('set-cookie').split(';')[0];
  const stored = env.sqlite.prepare('SELECT * FROM github_sessions').get();
  assert(!stored.token_cipher.includes('ghu_test-secret'));
  assert.equal(stored.owner_id, 'student-1');

  // Verify status returns user identity
  const statusRes = await handleApi(request('status', { headers: { Cookie: sessionCookie } }), env);
  const statusData = await statusRes.json();
  assert.equal(statusData.authorized, true);
  assert.equal(statusData.user.login, 'student');

  // Replay callback fails
  const replay = await handleApi(callback, env, fetcher);
  assert.equal(replay.status, 400);
  assert.equal(exchanges, 1);
});

test('missing configuration never starts OAuth or accepts a token', async () => {
  const status = await handleApi(request('status'), {});
  assert.equal((await status.json()).configured, false);
  const start = await handleApi(request('start', { method: 'POST', body: '{}' }), {});
  assert.equal(start.status, 503);
});

test('cross-site requests and anonymous users cannot start authorization', async () => {
  const env = environment();
  assert.equal(
    (await handleApi(request('start', { method: 'POST', headers: { Origin: 'https://evil.test' }, body: '{}' }), env)).status,
    403
  );
  assert.equal(
    (await handleApi(new Request('https://reactlab.test/api/github/status'), env)).status,
    401
  );
});

test('callback rejects different browser and expired state before token exchange', async () => {
  const env = environment();
  const start = await handleApi(request('start', { method: 'POST', body: '{}' }), env);
  const auth = new URL((await start.json()).url);

  const wrongBrowser = await handleApi(
    request(`callback?code=test&state=${auth.searchParams.get('state')}`, {
      headers: { Cookie: 'reactlab_oauth=wrong' }
    }),
    env,
    () => assert.fail('No token exchange expected')
  );
  assert.equal(wrongBrowser.status, 400);

  env.sqlite.prepare('UPDATE github_oauth_states SET expires_at = 0').run();
  const expired = await handleApi(
    request(`callback?code=test&state=${auth.searchParams.get('state')}`, {
      headers: { Cookie: start.headers.get('set-cookie').split(';')[0] }
    }),
    env,
    () => assert.fail('No token exchange expected')
  );
  assert.equal(expired.status, 400);
});

test('installation permits only the dedicated repository and correct GitHub App', async () => {
  const connection = { owner: 'student', repoId: 7 };
  const check = (selection, count, app = 42) =>
    verifyInstallation(
      'server-token',
      { GITHUB_APP_ID: '42' },
      connection,
      async url =>
        Response.json(
          url.includes('/repositories')
            ? { total_count: count, repositories: [{ id: 7 }, ...(count > 1 ? [{ id: 8 }] : [])] }
            : {
                installations: [
                  {
                    id: 2,
                    app_id: app,
                    account: { login: 'student' },
                    repository_selection: selection,
                    permissions: { contents: 'write' }
                  }
                ]
              }
        )
    );
  assert.equal(await check('all', 1), false);
  assert.equal(await check('selected', 2), false);
  assert.equal(await check('selected', 1, 99), false);
  assert.equal(await check('selected', 1), true);
});

test('standalone production OAuth lifecycle without x-user-id header works end-to-end', async () => {
  const env = { ...environment(), STANDALONE: true };

  // 1. Start OAuth in standalone mode (no x-user-id header)
  const startReq = new Request('https://reactlab.test/api/github/start', {
    method: 'POST',
    headers: { Origin: 'https://reactlab.test', 'Content-Type': 'application/json' },
    body: '{}'
  });
  const start = await handleApi(startReq, env);
  assert.equal(start.status, 200);

  const auth = new URL((await start.json()).url);
  const flowCookie = start.headers.get('set-cookie').split(';')[0];
  assert.match(flowCookie, /reactlab_oauth=/);

  const fetcher = async (url, options) => {
    if (url.includes('access_token')) {
      const body = JSON.parse(options.body);
      assert.equal(await hash(body.code_verifier), auth.searchParams.get('code_challenge'));
      return Response.json({ access_token: 'ghu_prod-secret', expires_in: 28800 });
    }
    assert.equal(url, 'https://api.github.com/user');
    return Response.json({ id: 456, login: 'developer', name: 'Developer' });
  };

  // 2. Callback in standalone mode with cookie
  const callbackReq = new Request(
    `https://reactlab.test/api/github/callback?code=prod-code&state=${auth.searchParams.get('state')}`,
    { headers: { Cookie: flowCookie } }
  );
  const callbackRes = await handleApi(callbackReq, env, fetcher);
  assert.equal(callbackRes.status, 303);
  assert.equal(callbackRes.headers.get('location'), 'https://reactlab.test/?github=authorized');

  const sessionCookie = callbackRes.headers.get('set-cookie').split(';')[0];
  assert.match(sessionCookie, /reactlab_session=/);

  // 3. Status check with session cookie
  const statusReq = new Request('https://reactlab.test/api/github/status', {
    headers: { Cookie: sessionCookie }
  });
  const statusRes = await handleApi(statusReq, env);
  assert.equal(statusRes.status, 200);
  const statusData = await statusRes.json();
  assert.equal(statusData.authorized, true);
  assert.equal(statusData.user.login, 'developer');
});

test('slow authorization delays (0s, 30s, 2m, 5m) succeed, while expired transactions (>10m) fail', async () => {
  const delays = [
    { name: 'immediate (0s)', elapsedMs: 0, shouldSucceed: true },
    { name: '30s delay', elapsedMs: 30_000, shouldSucceed: true },
    { name: '2m delay', elapsedMs: 120_000, shouldSucceed: true },
    { name: '5m delay', elapsedMs: 300_000, shouldSucceed: true },
    { name: 'expired (>10m)', elapsedMs: 601_000, shouldSucceed: false }
  ];

  for (const { name, elapsedMs, shouldSucceed } of delays) {
    const env = { ...environment(), STANDALONE: true };

    const startReq = new Request('https://reactlab.test/api/github/start', {
      method: 'POST',
      headers: { Origin: 'https://reactlab.test', 'Content-Type': 'application/json' },
      body: '{}'
    });
    const start = await handleApi(startReq, env);
    assert.equal(start.status, 200);

    const auth = new URL((await start.json()).url);
    const flowCookie = start.headers.get('set-cookie').split(';')[0];
    const state = auth.searchParams.get('state');

    // Simulate time passage by adjusting expires_at in the database
    if (elapsedMs > 0) {
      env.sqlite.prepare('UPDATE github_oauth_states SET expires_at = expires_at - ?').run(elapsedMs);
    }

    const fetcher = async (url) => {
      if (url.includes('access_token')) {
        return Response.json({ access_token: 'ghu_delay_token', expires_in: 28800 });
      }
      return Response.json({ id: 789, login: 'slow-user' });
    };

    const callbackReq = new Request(
      `https://reactlab.test/api/github/callback?code=delay-code&state=${state}`,
      { headers: { Cookie: flowCookie } }
    );
    const res = await handleApi(callbackReq, env, fetcher);

    if (shouldSucceed) {
      assert.equal(res.status, 303, `Expected ${name} to succeed with 303 redirect`);
    } else {
      assert.equal(res.status, 400, `Expected ${name} to fail with 400`);
      const body = await res.json();
      assert.match(body.message, /Authorization expired/);
    }
  }
});

test('callback rejects missing state, wrong state, and missing browser cookie', async () => {
  const env = { ...environment(), STANDALONE: true };

  const startReq = new Request('https://reactlab.test/api/github/start', {
    method: 'POST',
    headers: { Origin: 'https://reactlab.test', 'Content-Type': 'application/json' },
    body: '{}'
  });
  const start = await handleApi(startReq, env);
  const auth = new URL((await start.json()).url);
  const flowCookie = start.headers.get('set-cookie').split(';')[0];
  const state = auth.searchParams.get('state');

  // 1. Missing state param
  const noState = await handleApi(
    new Request('https://reactlab.test/api/github/callback?code=c1', { headers: { Cookie: flowCookie } }),
    env
  );
  assert.equal(noState.status, 400);

  // 2. Missing cookie
  const noCookie = await handleApi(
    new Request(`https://reactlab.test/api/github/callback?code=c1&state=${state}`),
    env
  );
  assert.equal(noCookie.status, 400);

  // 3. Wrong state param
  const wrongState = await handleApi(
    new Request('https://reactlab.test/api/github/callback?code=c1&state=wrong-state-value', {
      headers: { Cookie: flowCookie }
    }),
    env
  );
  assert.equal(wrongState.status, 400);
});
