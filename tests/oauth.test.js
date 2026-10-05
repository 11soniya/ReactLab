import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { handleApi, verifyInstallation } from '../server/api.js';
import { random, hash, seal, unseal } from '../server/security.js';
function environment() {
  const sqlite = new DatabaseSync(':memory:'); sqlite.exec(readFileSync(new URL('../drizzle/0000_github_oauth.sql', import.meta.url), 'utf8'));
  const DB = { prepare(sql) { return { bind(...values) { return { first: async () => sqlite.prepare(sql).get(...values) || null, run: async () => sqlite.prepare(sql).run(...values) }; } }; } };
  return { DB, sqlite, APP_ORIGIN: 'https://reactlab.test', GITHUB_CLIENT_ID: 'Iv1.test', GITHUB_CLIENT_SECRET: 'server-only-secret', GITHUB_APP_ID: '42', GITHUB_APP_SLUG: 'reactlab-test', TOKEN_ENCRYPTION_KEY: random() };
}
function request(path, options = {}) { return new Request(`https://reactlab.test/api/github/${path}`, { ...options, headers: { 'oai-authenticated-user-id': 'student-1', ...(options.method === 'POST' ? { Origin: 'https://reactlab.test', 'Content-Type': 'application/json' } : {}), ...options.headers } }); }
test('AES-GCM protects credentials and binds them to one Site user', async () => {
  const key = random(); const encrypted = await seal({ access_token: 'secret-token' }, key, 'one');
  assert(!encrypted.includes('secret-token')); assert.equal((await unseal(encrypted, key, 'one')).access_token, 'secret-token');
  await assert.rejects(unseal(encrypted, key, 'two')); await assert.rejects(unseal(encrypted, random(), 'one'));
});
test('OAuth flow uses PKCE, server-side exchange, secure cookie and single-use callback', async () => {
  const env = environment(); const start = await handleApi(request('start', { method: 'POST', body: JSON.stringify({ name: 'reactlab-practicals' }) }), env);
  assert.equal(start.status, 200); const auth = new URL((await start.json()).url); assert.equal(auth.origin, 'https://github.com'); assert.equal(auth.searchParams.get('code_challenge_method'), 'S256'); assert.equal(auth.searchParams.get('scope'), null);
  const flowCookie = start.headers.get('set-cookie').split(';')[0]; assert.match(start.headers.get('set-cookie'), /HttpOnly; SameSite=Lax/); assert.match(start.headers.get('set-cookie'), /Secure/);
  const callback = request(`callback?code=temporary&state=${auth.searchParams.get('state')}`, { headers: { Cookie: flowCookie } });
  let exchanges = 0;
  const fetcher = async (url, options) => {
    if (url.includes('access_token')) { exchanges++; const body = JSON.parse(options.body); assert.equal(await hash(body.code_verifier), auth.searchParams.get('code_challenge')); assert.equal(body.client_secret, env.GITHUB_CLIENT_SECRET); return Response.json({ access_token: 'ghu_test-secret', expires_in: 28800, refresh_token: 'unused' }); }
    assert.equal(url, 'https://api.github.com/user'); return Response.json({ id: 123, login: 'student' });
  };
  const result = await handleApi(callback, env, fetcher); assert.equal(result.status, 303); assert.equal(result.headers.get('location'), 'https://reactlab.test/?github=authorized'); assert(![...result.headers].flat().join('').includes('ghu_test-secret'));
  const stored = env.sqlite.prepare('SELECT * FROM github_sessions').get(); assert(!stored.token_cipher.includes('ghu_test-secret')); assert.equal(stored.owner_id, 'student-1');
  const replay = await handleApi(callback, env, fetcher); assert.equal(replay.status, 400); assert.equal(exchanges, 1);
});
test('missing configuration never starts OAuth or accepts a token', async () => {
  const status = await handleApi(request('status'), {}); assert.equal((await status.json()).configured, false);
  const start = await handleApi(request('start', { method: 'POST', body: '{}' }), {}); assert.equal(start.status, 503);
});
test('cross-site requests and anonymous users cannot start authorization', async () => {
  const env = environment(); assert.equal((await handleApi(request('start', { method: 'POST', headers: { Origin: 'https://evil.test' }, body: '{}' }), env)).status, 403);
  assert.equal((await handleApi(new Request('https://reactlab.test/api/github/status'), env)).status, 401);
});
test('callback rejects different browser and expired state before token exchange', async () => {
  const env = environment(); const start = await handleApi(request('start', { method: 'POST', body: '{"name":"practice"}' }), env); const auth = new URL((await start.json()).url);
  const wrongBrowser = await handleApi(request(`callback?code=test&state=${auth.searchParams.get('state')}`, { headers: { Cookie: 'reactlab_oauth=wrong' } }), env, () => assert.fail('No token exchange expected'));
  assert.equal(wrongBrowser.status, 400);
  env.sqlite.prepare('UPDATE github_oauth_states SET expires_at = 0').run();
  const expired = await handleApi(request(`callback?code=test&state=${auth.searchParams.get('state')}`, { headers: { Cookie: start.headers.get('set-cookie').split(';')[0] } }), env, () => assert.fail('No token exchange expected'));
  assert.equal(expired.status, 400);
});
test('installation permits only the dedicated repository and correct GitHub App', async () => {
  const connection = { owner: 'student', repoId: 7 };
  const check = (selection, count, app = 42) => verifyInstallation('server-token', { GITHUB_APP_ID: '42' }, connection, async url => Response.json(url.includes('/repositories') ? { total_count: count, repositories: [{ id: 7 }, ...(count > 1 ? [{ id: 8 }] : [])] } : { installations: [{ id: 2, app_id: app, account: { login: 'student' }, repository_selection: selection, permissions: { contents: 'write' } }] }));
  assert.equal(await check('all', 1), false); assert.equal(await check('selected', 2), false); assert.equal(await check('selected', 1, 99), false); assert.equal(await check('selected', 1), true);
});
