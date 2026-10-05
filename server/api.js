import { connectRepository, githubClient, syncPractical } from './github.js';
import { random, hash, seal, unseal, cookie, cookieHeader, originAllowed } from './security.js';
const json = (value, status = 200, headers = {}) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers } });
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const publicConnection = connection => connection && ({ owner: connection.owner, name: connection.name, url: connection.url, repoId: connection.repoId });
function configured(env) { return !!(env.DB && env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET && env.GITHUB_APP_ID && env.GITHUB_APP_SLUG && env.TOKEN_ENCRYPTION_KEY && env.APP_ORIGIN); }
function ownerOf(request, env) { return request.headers.get('x-user-id') || request.headers.get('oai-authenticated-user-id') || (env.LOCAL_DEV === true ? 'local-development-user' : null); }
async function body(request) { if (!request.headers.get('Content-Type')?.startsWith('application/json')) throw fail('Expected JSON', 415); const text = await request.text(); if (text.length > 2_000_000) throw fail('Practical is too large to sync.', 413); try { return JSON.parse(text); } catch { throw fail('Invalid JSON'); } }
function validatePractical(p) {
  if (!p || typeof p.id !== 'string' || !/^[\w-]{1,100}$/.test(p.id) || typeof p.title !== 'string' || p.title.length > 200 || typeof p.question !== 'string' || !p.files || !p.files['/src/App.jsx'] || Object.keys(p.files).length > 100 || !Array.isArray(p.folders)) throw fail('Invalid practical.');
  for (const [path, file] of Object.entries(p.files)) if (!path.startsWith('/src/') || path.split('/').some(part => !part || part === '.' || part === '..') && path.slice(1).split('/').some(part => !part || part === '.' || part === '..') || path.includes('\\') || typeof file?.code !== 'string') throw fail('Invalid practical file.');
  for (const folder of p.folders) if (folder !== '/src' && !folder.startsWith('/src/') || folder.slice(1).split('/').some(p => !p || p === '.' || p === '..') || folder.includes('\\')) throw fail('Invalid practical folder.');
}
async function session(request, env, owner) {
  const id = cookie(request, 'reactlab_session'); if (!id) return null;
  const row = await env.DB.prepare('SELECT * FROM github_sessions WHERE id = ? AND owner_id = ? AND expires_at > ?').bind(await hash(id), owner, Date.now()).first();
  if (!row) return null;
  return { ...row, token: (await unseal(row.token_cipher, env.TOKEN_ENCRYPTION_KEY, owner)).access_token };
}
async function account(env, owner) { const row = await env.DB.prepare('SELECT connection_json FROM github_accounts WHERE owner_id = ?').bind(owner).first(); return row ? JSON.parse(row.connection_json) : null; }
export async function verifyInstallation(token, env, connection, fetcher = fetch) {
  const api = githubClient(token, fetcher);
  // Do not accept a supplied installation id: discover only installations visible to this user.
  const result = await api('/user/installations?per_page=100');
  const installs = result.installations.filter(i => String(i.app_id) === String(env.GITHUB_APP_ID) && i.account.login === connection.owner);
  for (const install of installs) {
    if (install.repository_selection !== 'selected' || install.permissions?.contents !== 'write') continue;
    const accessible = await api(`/user/installations/${install.id}/repositories?per_page=100`);
    if (accessible.total_count === 1 && accessible.repositories[0]?.id === connection.repoId) return true;
  }
  return false;
}
export async function handleApi(request, env, fetcher = fetch) {
  const url = new URL(request.url); const path = url.pathname;
  try {
    if (!configured(env)) return json({ configured: false, connected: false, message: 'GitHub authorization is awaiting app setup by the ReactLab owner.' }, path.endsWith('/status') ? 200 : 503);
    const origin = new URL(env.APP_ORIGIN).origin;
    if (url.origin !== origin) throw fail('Unrecognized application origin.', 403);
    const owner = ownerOf(request, env); if (!owner) throw fail('Sign in to ReactLab before connecting GitHub.', 401);
    if (request.method !== 'GET' && !originAllowed(request, origin)) throw fail('Cross-site request rejected.', 403);
    const callback = `${origin}/api/github/callback`;
    if (path === '/api/github/start' && request.method === 'POST') {
      const { name } = await body(request); if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(name)) throw fail('Enter a valid repository name.');
      const state = random(); const verifier = random(); const browser = random();
      await env.DB.prepare('DELETE FROM github_oauth_states WHERE expires_at <= ?').bind(Date.now()).run();
      await env.DB.prepare('INSERT INTO github_oauth_states (id, owner_id, browser_hash, payload, expires_at) VALUES (?, ?, ?, ?, ?)').bind(await hash(state), owner, await hash(browser), await seal({ verifier, name }, env.TOKEN_ENCRYPTION_KEY, owner), Date.now() + 600000).run();
      const auth = new URL('https://github.com/login/oauth/authorize'); auth.search = new URLSearchParams({ client_id: env.GITHUB_CLIENT_ID, redirect_uri: callback, state, code_challenge: await hash(verifier), code_challenge_method: 'S256' }).toString();
      return json({ url: auth.href }, 200, { 'Set-Cookie': cookieHeader('reactlab_oauth', browser, 600, origin) });
    }
    if (path === '/api/github/callback' && request.method === 'GET') {
      const state = url.searchParams.get('state'); const browser = cookie(request, 'reactlab_oauth');
      if (!state || !browser) throw fail('Missing authorization state. Start again.');
      const pending = await env.DB.prepare('DELETE FROM github_oauth_states WHERE id = ? AND owner_id = ? AND browser_hash = ? AND expires_at > ? RETURNING payload').bind(await hash(state), owner, await hash(browser), Date.now()).first();
      if (!pending) throw fail('Authorization expired or was already used. Start again.');
      if (url.searchParams.has('error')) return new Response(null, { status: 303, headers: { Location: `${origin}/?github=denied`, 'Set-Cookie': cookieHeader('reactlab_oauth', '', 0, origin), 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
      const code = url.searchParams.get('code'); if (!code) throw fail('Missing authorization code.');
      const { verifier, name } = await unseal(pending.payload, env.TOKEN_ENCRYPTION_KEY, owner);
      const response = await fetcher('https://github.com/login/oauth/access_token', { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify({ client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET, code, redirect_uri: callback, code_verifier: verifier }), signal: AbortSignal.timeout(30000) });
      const tokens = await response.json(); if (!response.ok || !tokens.access_token || tokens.error) throw fail('GitHub authorization failed. Please reconnect.', 401);
      // Require expiring GitHub App user tokens. Never store refresh tokens or return credentials to the browser.
      if (!Number.isFinite(tokens.expires_in) || tokens.expires_in <= 0) throw fail('Enable expiring user access tokens in the GitHub App settings.', 503);
      const user = await githubClient(tokens.access_token, fetcher)('/user');
      const id = random(); const expires = Date.now() + Math.min(tokens.expires_in, 28800) * 1000;
      const tokenCipher = await seal({ access_token: tokens.access_token, repoName: name }, env.TOKEN_ENCRYPTION_KEY, owner);
      await env.DB.prepare('DELETE FROM github_sessions WHERE owner_id = ?').bind(owner).run();
      await env.DB.prepare('INSERT INTO github_sessions (id, owner_id, github_id, token_cipher, expires_at) VALUES (?, ?, ?, ?, ?)').bind(await hash(id), owner, String(user.id), tokenCipher, expires).run();
      const headers = new Headers({ Location: `${origin}/?github=authorized`, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }); headers.append('Set-Cookie', cookieHeader('reactlab_session', id, Math.floor((expires - Date.now()) / 1000), origin)); headers.append('Set-Cookie', cookieHeader('reactlab_oauth', '', 0, origin));
      return new Response(null, { status: 303, headers });
    }
    const current = await session(request, env, owner); const saved = await account(env, owner);
    if (path === '/api/github/status' && request.method === 'GET') {
      const connection = current && saved?.githubId === current.github_id ? saved : null;
      return json({ configured: true, authorized: !!current, connected: !!connection && await verifyInstallation(current.token, env, connection, fetcher), connection: publicConnection(connection), installUrl: `https://github.com/apps/${encodeURIComponent(env.GITHUB_APP_SLUG)}/installations/new` });
    }
    if (!current) throw fail('GitHub authorization expired. Connect again.', 401);
    if (path === '/api/github/disconnect' && request.method === 'POST') {
      await env.DB.prepare('DELETE FROM github_sessions WHERE owner_id = ?').bind(owner).run();
      // Revoke this user authorization token; no installations or repositories are deleted.
      const revoke = await fetcher(`https://api.github.com/applications/${encodeURIComponent(env.GITHUB_CLIENT_ID)}/token`, { method: 'DELETE', headers: { Authorization: `Basic ${btoa(`${env.GITHUB_CLIENT_ID}:${env.GITHUB_CLIENT_SECRET}`)}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' }, body: JSON.stringify({ access_token: current.token }), signal: AbortSignal.timeout(10000) }).catch(() => null);
      return json({ disconnected: true, revoked: !!revoke && (revoke.ok || revoke.status === 404) }, 200, { 'Set-Cookie': cookieHeader('reactlab_session', '', 0, origin) });
    }
    if (path === '/api/github/repository' && request.method === 'POST') {
      const { repoName } = await unseal(current.token_cipher, env.TOKEN_ENCRYPTION_KEY, owner);
      const connection = await connectRepository(current.token, repoName, saved?.githubId === current.github_id ? saved : null, fetcher);
      await env.DB.prepare('INSERT INTO github_accounts (owner_id, connection_json) VALUES (?, ?) ON CONFLICT(owner_id) DO UPDATE SET connection_json = excluded.connection_json').bind(owner, JSON.stringify({ ...connection, githubId: current.github_id })).run();
      return json({ connection: publicConnection(connection), installed: await verifyInstallation(current.token, env, connection, fetcher) });
    }
    if (path === '/api/github/sync' && request.method === 'POST') {
      if (!saved || saved.githubId !== current.github_id) throw fail('Create your practice repository first.', 409);
      const { practical } = await body(request); validatePractical(practical);
      if (!await verifyInstallation(current.token, env, saved, fetcher)) throw fail('Install ReactLab on only your practice repository, then retry.', 403);
      return json(await syncPractical(current.token, saved, practical, fetcher));
    }
    return json({ message: 'Not found' }, 404);
  } catch (error) {
    // Never return upstream response bodies or credentials to the browser.
    const status = Number.isInteger(error.status) ? error.status : 500;
    return json({ message: status >= 500 ? 'GitHub connection is unavailable. Retry or ask the ReactLab owner to check setup.' : error.message }, status);
  }
}
