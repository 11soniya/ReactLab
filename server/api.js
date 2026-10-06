import { connectRepository, githubClient, listUserRepositories, syncPractical } from './github.js';
import { random, hash, seal, unseal, cookie, cookieHeader, originAllowed } from './security.js';

const json = (value, status = 200, headers = {}) =>
  new Response(JSON.stringify(value), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...headers
    }
  });

const fail = (message, status = 400) => Object.assign(new Error(message), { status });

const publicConnection = connection =>
  connection && {
    owner: connection.owner,
    name: connection.name,
    url: connection.url,
    repoId: connection.repoId,
    branch: connection.branch || 'main',
    isDedicated: connection.isDedicated !== false,
    rootDir: connection.rootDir || '',
    githubUsername: connection.githubUsername || connection.owner
  };

function configured(env) {
  return !!(env.DB && env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET && env.TOKEN_ENCRYPTION_KEY && env.APP_ORIGIN);
}

function ownerOf(request, env) {
  const explicit =
    request.headers.get('x-user-id') ||
    request.headers.get('oai-authenticated-user-id');
  if (explicit) return explicit;

  if (env.LOCAL_DEV === true) return 'local-development-user';

  const uid = cookie(request, 'reactlab_uid');
  if (uid) return uid;

  if (env.STANDALONE === true || env.STANDALONE_WEB === true) {
    return 'reactlab-user';
  }

  return null;
}

async function body(request) {
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) {
    throw fail('Expected JSON', 415);
  }
  const text = await request.text();
  if (text.length > 2_000_000) {
    throw fail('Practical is too large to sync.', 413);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw fail('Invalid JSON');
  }
}

function validatePractical(p) {
  if (
    !p ||
    typeof p.id !== 'string' ||
    !/^[\w-]{1,100}$/.test(p.id) ||
    typeof p.title !== 'string' ||
    p.title.length > 200 ||
    typeof p.question !== 'string' ||
    !p.files ||
    !p.files['/src/App.jsx'] ||
    Object.keys(p.files).length > 100 ||
    !Array.isArray(p.folders)
  ) {
    throw fail('Invalid practical.');
  }
  for (const [path, file] of Object.entries(p.files)) {
    if (
      !path.startsWith('/src/') ||
      (path.split('/').some(part => !part || part === '.' || part === '..') &&
        path.slice(1).split('/').some(part => !part || part === '.' || part === '..')) ||
      path.includes('\\') ||
      typeof file?.code !== 'string'
    ) {
      throw fail('Invalid practical file.');
    }
  }
  for (const folder of p.folders) {
    if (
      (folder !== '/src' && !folder.startsWith('/src/')) ||
      folder.slice(1).split('/').some(p => !p || p === '.' || p === '..') ||
      folder.includes('\\')
    ) {
      throw fail('Invalid practical folder.');
    }
  }
}

async function session(request, env, owner) {
  const id = cookie(request, 'reactlab_session');
  if (!id) return null;
  const row = await env.DB.prepare(
    'SELECT * FROM github_sessions WHERE id = ? AND owner_id = ? AND expires_at > ?'
  )
    .bind(await hash(id), owner, Date.now())
    .first();
  if (!row) return null;
  try {
    const payload = await unseal(row.token_cipher, env.TOKEN_ENCRYPTION_KEY, owner);
    return {
      ...row,
      token: payload.access_token,
      user: payload.user || { login: row.github_id, id: row.github_id }
    };
  } catch {
    return null;
  }
}

async function account(env, owner) {
  const row = await env.DB.prepare('SELECT connection_json FROM github_accounts WHERE owner_id = ?')
    .bind(owner)
    .first();
  return row ? JSON.parse(row.connection_json) : null;
}

export async function verifyInstallation(token, env, connection, fetcher = fetch) {
  if (!env.GITHUB_APP_ID) return true;
  const api = githubClient(token, fetcher);
  try {
    const result = await api('/user/installations?per_page=100');
    if (!result || !Array.isArray(result.installations)) return true;
    const installs = result.installations.filter(
      i => String(i.app_id) === String(env.GITHUB_APP_ID) && i.account?.login === connection.owner
    );
    for (const install of installs) {
      if (install.repository_selection !== 'selected' || install.permissions?.contents !== 'write') continue;
      const accessible = await api(`/user/installations/${install.id}/repositories?per_page=100`);
      if (accessible.total_count === 1 && accessible.repositories[0]?.id === connection.repoId) return true;
    }
    return false;
  } catch {
    return true;
  }
}

export async function handleApi(request, env, fetcher = fetch) {
  const url = new URL(request.url);
  const path = url.pathname;

  try {
    if (!configured(env)) {
      return json(
        {
          configured: false,
          connected: false,
          message: 'GitHub authorization is awaiting app setup by the ReactLab owner.'
        },
        path.endsWith('/status') ? 200 : 503
      );
    }

    const origin = new URL(env.APP_ORIGIN).origin;
    if (url.origin !== origin && env.LOCAL_DEV !== true) {
      throw fail('Unrecognized application origin.', 403);
    }

    const owner = ownerOf(request, env);
    if (!owner) throw fail('Sign in to ReactLab before connecting GitHub.', 401);

    if (request.method !== 'GET' && env.LOCAL_DEV !== true && !originAllowed(request, origin)) {
      throw fail('Cross-site request rejected.', 403);
    }

    const callback = `${origin}/api/github/callback`;

    // 1. Start OAuth Flow
    if (path === '/api/github/start' && request.method === 'POST') {
      const state = random();
      const verifier = random();
      const browser = random();

      await env.DB.prepare('DELETE FROM github_oauth_states WHERE expires_at <= ?')
        .bind(Date.now())
        .run();

      await env.DB.prepare(
        'INSERT INTO github_oauth_states (id, owner_id, browser_hash, payload, expires_at) VALUES (?, ?, ?, ?, ?)'
      )
        .bind(
          await hash(state),
          owner,
          await hash(browser),
          await seal({ verifier }, env.TOKEN_ENCRYPTION_KEY, owner),
          Date.now() + 600000
        )
        .run();

      console.log('OAuth start created: true');

      const auth = new URL('https://github.com/login/oauth/authorize');
      auth.search = new URLSearchParams({
        client_id: env.GITHUB_CLIENT_ID,
        redirect_uri: callback,
        state,
        code_challenge: await hash(verifier),
        code_challenge_method: 'S256',
        scope: 'repo'
      }).toString();

      return json(
        { url: auth.href },
        200,
        { 'Set-Cookie': cookieHeader('reactlab_oauth', browser, 600, origin) }
      );
    }

    // 2. OAuth Callback
    if (path === '/api/github/callback' && request.method === 'GET') {
      const state = url.searchParams.get('state');
      const browser = cookie(request, 'reactlab_oauth');
      if (!state || !browser) {
        console.log('OAuth callback state received: false');
        throw fail('Missing authorization state. Start again.');
      }
      console.log('OAuth callback state received: true');

      const stateHash = await hash(state);
      const browserHash = await hash(browser);
      const now = Date.now();

      const pending = await env.DB.prepare(
        'DELETE FROM github_oauth_states WHERE id = ? AND owner_id = ? AND browser_hash = ? AND expires_at > ? RETURNING payload'
      )
        .bind(stateHash, owner, browserHash, now)
        .first();

      if (!pending) {
        const existing = await env.DB.prepare('SELECT expires_at FROM github_oauth_states WHERE id = ?')
          .bind(stateHash)
          .first()
          .catch(() => null);
        if (existing && existing.expires_at <= now) {
          console.log('OAuth transaction expired: true');
        } else {
          console.log('OAuth transaction expired: false');
        }
        console.log('OAuth transaction found: false');
        throw fail('Authorization expired or was already used. Start again.');
      }

      console.log('OAuth transaction found: true');

      if (url.searchParams.has('error')) {
        return new Response(null, {
          status: 303,
          headers: {
            Location: `${origin}/?github=denied`,
            'Set-Cookie': cookieHeader('reactlab_oauth', '', 0, origin),
            'Cache-Control': 'no-store',
            'Referrer-Policy': 'no-referrer'
          }
        });
      }

      const code = url.searchParams.get('code');
      if (!code) throw fail('Missing authorization code.');

      const { verifier } = await unseal(pending.payload, env.TOKEN_ENCRYPTION_KEY, owner);
      console.log('PKCE verifier found: ' + Boolean(verifier));

      const response = await fetcher('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: env.GITHUB_CLIENT_ID,
          client_secret: env.GITHUB_CLIENT_SECRET,
          code,
          redirect_uri: callback,
          code_verifier: verifier
        }),
        signal: AbortSignal.timeout(30000)
      });

      const tokens = await response.json();
      if (!response.ok || !tokens.access_token || tokens.error) {
        console.log('Token exchange succeeded: false');
        throw fail('GitHub authorization failed. Please reconnect.', 401);
      }
      console.log('Token exchange succeeded: true');

      const user = await githubClient(tokens.access_token, fetcher)('/user');
      const id = random();
      const expires = Date.now() + (tokens.expires_in ? Math.min(tokens.expires_in, 86400 * 30) : 86400 * 30) * 1000;

      const tokenCipher = await seal(
        {
          access_token: tokens.access_token,
          user: { login: user.login, id: user.id, name: user.name || user.login }
        },
        env.TOKEN_ENCRYPTION_KEY,
        owner
      );

      await env.DB.prepare('DELETE FROM github_sessions WHERE owner_id = ?').bind(owner).run();
      await env.DB.prepare(
        'INSERT INTO github_sessions (id, owner_id, github_id, token_cipher, expires_at) VALUES (?, ?, ?, ?, ?)'
      )
        .bind(await hash(id), owner, String(user.id), tokenCipher, expires)
        .run();

      console.log('Session created: true');

      const headers = new Headers({
        Location: `${origin}/?github=authorized`,
        'Cache-Control': 'no-store',
        'Referrer-Policy': 'no-referrer'
      });
      headers.append(
        'Set-Cookie',
        cookieHeader('reactlab_session', id, Math.floor((expires - Date.now()) / 1000), origin)
      );
      headers.append('Set-Cookie', cookieHeader('reactlab_oauth', '', 0, origin));
      return new Response(null, { status: 303, headers });
    }

    const current = await session(request, env, owner);
    const saved = await account(env, owner);

    // 3. Status Endpoint
    if (path === '/api/github/status' && request.method === 'GET') {
      const connection = current && saved?.githubId === String(current.user?.id || current.github_id) ? saved : null;
      return json({
        configured: true,
        authorized: !!current,
        connected: !!connection && (await verifyInstallation(current.token, env, connection, fetcher)),
        user: current?.user ? { login: current.user.login, name: current.user.name, id: current.user.id } : null,
        connection: publicConnection(connection),
        installUrl: env.GITHUB_APP_SLUG ? `https://github.com/apps/${encodeURIComponent(env.GITHUB_APP_SLUG)}/installations/new` : null
      });
    }

    if (!current) throw fail('GitHub authorization expired. Connect again.', 401);

    // 4. Fetch User Repositories (for existing repo selection)
    if (path === '/api/github/repos' && request.method === 'GET') {
      const repositories = await listUserRepositories(current.token, fetcher);
      return json({ repositories });
    }

    // 5. Connect/Select Repository (Create new OR Select existing)
    if (path === '/api/github/repository' && request.method === 'POST') {
      const payload = await body(request);
      const connection = await connectRepository(
        current.token,
        payload,
        saved?.githubId === String(current.user?.id || current.github_id) ? saved : null,
        fetcher
      );

      await env.DB.prepare(
        'INSERT INTO github_accounts (owner_id, connection_json) VALUES (?, ?) ON CONFLICT(owner_id) DO UPDATE SET connection_json = excluded.connection_json'
      )
        .bind(owner, JSON.stringify({ ...connection, githubId: String(current.user?.id || current.github_id) }))
        .run();

      return json({
        connection: publicConnection(connection),
        installed: await verifyInstallation(current.token, env, connection, fetcher)
      });
    }

    // 6. Manual Update on GitHub (Sync Practical)
    if (path === '/api/github/sync' && request.method === 'POST') {
      if (!saved || String(saved.githubId) !== String(current.user?.id || current.github_id)) {
        throw fail('Choose where to store your practicals first.', 409);
      }
      const { practical } = await body(request);
      validatePractical(practical);

      if (!(await verifyInstallation(current.token, env, saved, fetcher))) {
        throw fail('ReactLab does not have permission on the selected repository. Reconnect and retry.', 403);
      }

      const result = await syncPractical(current.token, saved, practical, fetcher);
      return json(result);
    }

    // 7. Disconnect GitHub
    if (path === '/api/github/disconnect' && request.method === 'POST') {
      await env.DB.prepare('DELETE FROM github_sessions WHERE owner_id = ?').bind(owner).run();
      await env.DB.prepare('DELETE FROM github_accounts WHERE owner_id = ?').bind(owner).run();

      // Revoke token with GitHub if possible
      if (env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET && current.token) {
        await fetcher(
          `https://api.github.com/applications/${encodeURIComponent(env.GITHUB_CLIENT_ID)}/token`,
          {
            method: 'DELETE',
            headers: {
              Authorization: `Basic ${btoa(`${env.GITHUB_CLIENT_ID}:${env.GITHUB_CLIENT_SECRET}`)}`,
              Accept: 'application/vnd.github+json',
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ access_token: current.token }),
            signal: AbortSignal.timeout(10000)
          }
        ).catch(() => null);
      }

      return json(
        { disconnected: true },
        200,
        { 'Set-Cookie': cookieHeader('reactlab_session', '', 0, origin) }
      );
    }

    return json({ message: 'Not found' }, 404);
  } catch (error) {
    const status = Number.isInteger(error.status) ? error.status : 500;
    return json(
      {
        message: error.message || (status >= 500 ? 'GitHub connection is unavailable. Retry or check your configuration.' : 'Request failed.')
      },
      status
    );
  }
}
