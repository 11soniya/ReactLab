import { loadEnv } from 'vite';
import { handleApi } from './api.js';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

let localSqlite = null;
let localDB = null;

function getLocalDB(rootDir = process.cwd()) {
  if (globalThis.__reactlab_db) return globalThis.__reactlab_db;
  if (localDB) return localDB;

  const dbFile = path.join(rootDir, '.dev.sqlite');
  localSqlite = new DatabaseSync(dbFile);
  const migrationPath = new URL('../drizzle/0000_github_oauth.sql', import.meta.url);
  if (existsSync(migrationPath)) {
    localSqlite.exec(readFileSync(migrationPath, 'utf8'));
  }
  localDB = {
    prepare(sql) {
      return {
        bind(...values) {
          return {
            first: async () => localSqlite.prepare(sql).get(...values) || null,
            run: async () => localSqlite.prepare(sql).run(...values)
          };
        }
      };
    }
  };
  globalThis.__reactlab_db = localDB;
  return localDB;
}

function parseEnvFile(filePath) {
  if (!existsSync(filePath)) return {};
  try {
    const content = readFileSync(filePath, 'utf8');
    const result = {};
    for (const rawLine of content.split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eqIdx = line.indexOf('=');
      if (eqIdx === -1) continue;
      const key = line.slice(0, eqIdx).trim();
      let val = line.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      result[key] = val;
    }
    return result;
  } catch {
    return {};
  }
}

export function loadDevSettings(root = process.cwd()) {
  const viteEnv = loadEnv('development', root, '');
  const dotEnv = parseEnvFile(path.join(root, '.env'));
  const dotEnvLocal = parseEnvFile(path.join(root, '.env.local'));
  const devVars = parseEnvFile(path.join(root, '.dev.vars'));

  const merged = {
    ...process.env,
    ...viteEnv,
    ...dotEnv,
    ...dotEnvLocal,
    ...devVars
  };

  return {
    DB: getLocalDB(root),
    APP_ORIGIN: merged.APP_ORIGIN || 'http://127.0.0.1:5173',
    GITHUB_CLIENT_ID: merged.GITHUB_CLIENT_ID || '',
    GITHUB_CLIENT_SECRET: merged.GITHUB_CLIENT_SECRET || '',
    GITHUB_APP_ID: merged.GITHUB_APP_ID || '',
    GITHUB_APP_SLUG: merged.GITHUB_APP_SLUG || '',
    TOKEN_ENCRYPTION_KEY: merged.TOKEN_ENCRYPTION_KEY || 'dGVzdC1lbmNyeXB0aW9uLWtleS0zMi1ieXRlcw==',
    LOCAL_DEV: true,
    ...merged
  };
}

export function githubDev() {
  return {
    name: 'reactlab-github-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !req.url.startsWith('/api/github/')) return next();

        const rootDir = server.config.root || process.cwd();
        const settings = loadDevSettings(rootDir);

        let bodyBuffer = Buffer.alloc(0);
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          bodyBuffer = await new Promise(resolve => {
            const chunks = [];
            req.on('data', chunk => chunks.push(chunk));
            req.on('end', () => resolve(Buffer.concat(chunks)));
          });
        }

        const host = req.headers.host || '127.0.0.1:5173';
        const fullUrl = `http://${host}${req.url}`;
        const fetchHeaders = new Headers();
        for (const [key, val] of Object.entries(req.headers)) {
          if (val !== undefined) {
            if (Array.isArray(val)) val.forEach(v => fetchHeaders.append(key, v));
            else fetchHeaders.set(key, val);
          }
        }

        const requestObj = new Request(fullUrl, {
          method: req.method,
          headers: fetchHeaders,
          body: bodyBuffer.length > 0 ? bodyBuffer : undefined,
          duplex: bodyBuffer.length > 0 ? 'half' : undefined
        });

        try {
          const result = await handleApi(requestObj, settings);
          res.statusCode = result.status;

          if (typeof result.headers.getSetCookie === 'function') {
            const cookies = result.headers.getSetCookie();
            if (cookies && cookies.length > 0) {
              res.setHeader('Set-Cookie', cookies);
            }
          } else {
            const setCookie = result.headers.get('set-cookie');
            if (setCookie) {
              res.setHeader('Set-Cookie', setCookie);
            }
          }

          for (const [key, value] of result.headers.entries()) {
            if (key.toLowerCase() === 'set-cookie') continue;
            res.setHeader(key, value);
          }

          const arrayBuffer = await result.arrayBuffer();
          res.end(Buffer.from(arrayBuffer));
        } catch (e) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ message: e.message || 'Internal server error' }));
        }
      });
    }
  };
}
