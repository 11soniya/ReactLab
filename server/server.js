import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { handleApi } from './api.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const clientDistDir = path.resolve(rootDir, 'dist/client');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.eot': 'application/vnd.ms-fontobject',
  '.otf': 'font/otf',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json'
};

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  try {
    const content = fs.readFileSync(filePath, 'utf8');
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

export function initDatabase(dbPath) {
  const sqlite = dbPath ? new DatabaseSync(dbPath) : new DatabaseSync(':memory:');
  const migrationPath = path.resolve(rootDir, 'drizzle/0000_github_oauth.sql');
  if (fs.existsSync(migrationPath)) {
    sqlite.exec(fs.readFileSync(migrationPath, 'utf8'));
  }
  return {
    prepare(sql) {
      return {
        bind(...values) {
          return {
            first: async () => sqlite.prepare(sql).get(...values) || null,
            run: async () => sqlite.prepare(sql).run(...values)
          };
        }
      };
    },
    _sqlite: sqlite
  };
}

export function loadProductionSettings() {
  const dotEnv = parseEnvFile(path.resolve(rootDir, '.env'));
  const dotEnvLocal = parseEnvFile(path.resolve(rootDir, '.env.local'));

  const merged = {
    ...dotEnv,
    ...dotEnvLocal,
    ...process.env
  };

  const port = parseInt(merged.PORT || '3000', 10);
  const appOrigin = merged.APP_ORIGIN || `http://127.0.0.1:${port}`;

  const db = initDatabase(merged.DATABASE_PATH);

  return {
    DB: db,
    PORT: port,
    HOST: merged.HOST || '0.0.0.0',
    APP_ORIGIN: appOrigin,
    GITHUB_CLIENT_ID: merged.GITHUB_CLIENT_ID || '',
    GITHUB_CLIENT_SECRET: merged.GITHUB_CLIENT_SECRET || '',
    GITHUB_APP_ID: merged.GITHUB_APP_ID || '',
    GITHUB_APP_SLUG: merged.GITHUB_APP_SLUG || '',
    TOKEN_ENCRYPTION_KEY: merged.TOKEN_ENCRYPTION_KEY || '',
    STANDALONE: true,
    LOCAL_DEV: false
  };
}

export function createProductionServer(customSettings = {}) {
  const settings = {
    ...loadProductionSettings(),
    ...customSettings
  };

  const server = http.createServer(async (req, res) => {
    try {
      const origin = settings.APP_ORIGIN ? new URL(settings.APP_ORIGIN).origin : `http://${req.headers.host || '127.0.0.1:3000'}`;
      const url = new URL(req.url, origin);

      // 1. API routes (/api/github/*)
      if (url.pathname.startsWith('/api/github/')) {
        let bodyBuffer = undefined;
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          const chunks = [];
          for await (const chunk of req) {
            chunks.push(chunk);
          }
          bodyBuffer = Buffer.concat(chunks);
        }

        const fetchHeaders = new Headers();
        for (const [key, val] of Object.entries(req.headers)) {
          if (val !== undefined) {
            if (Array.isArray(val)) {
              for (const v of val) fetchHeaders.append(key, v);
            } else {
              fetchHeaders.set(key, val);
            }
          }
        }

        const requestObj = new Request(url.href, {
          method: req.method,
          headers: fetchHeaders,
          body: bodyBuffer && bodyBuffer.length > 0 ? bodyBuffer : undefined,
          duplex: bodyBuffer && bodyBuffer.length > 0 ? 'half' : undefined
        });

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
        return;
      }

      // 2. Reject non-GET / non-HEAD requests for static assets
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.statusCode = 405;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ message: 'Method Not Allowed' }));
        return;
      }

      // 3. Static Files & SPA Routing
      const sanitizedPath = path.normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[\/\\])+/, '');
      let filePath = path.join(clientDistDir, sanitizedPath);

      // Verify path stays within clientDistDir
      if (!filePath.startsWith(clientDistDir)) {
        res.statusCode = 403;
        res.setHeader('Content-Type', 'text/plain');
        res.end('Forbidden');
        return;
      }

      let isFile = false;
      try {
        if (fs.existsSync(filePath)) {
          const stat = fs.statSync(filePath);
          if (stat.isFile()) {
            isFile = true;
          }
        }
      } catch {
        isFile = false;
      }

      // If specific static file exists, serve it
      if (isFile) {
        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        res.statusCode = 200;
        res.setHeader('Content-Type', contentType);

        if (url.pathname.startsWith('/assets/')) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        } else {
          res.setHeader('Cache-Control', 'public, max-age=3600');
        }

        if (req.method === 'HEAD') {
          res.end();
          return;
        }

        const stream = fs.createReadStream(filePath);
        stream.pipe(res);
        return;
      }

      // SPA Fallback: serve index.html
      const indexHtmlPath = path.join(clientDistDir, 'index.html');
      if (fs.existsSync(indexHtmlPath)) {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Referrer-Policy', 'same-origin');

        if (req.method === 'HEAD') {
          res.end();
          return;
        }

        const stream = fs.createReadStream(indexHtmlPath);
        stream.pipe(res);
        return;
      }

      // Build not found
      res.statusCode = 503;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end('<h1>ReactLab</h1><p>Frontend build not found. Please run <code>npm run build</code> first.</p>');
    } catch (err) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ message: err.message || 'Internal Server Error' }));
    }
  });

  return { server, settings };
}

// Auto-start if invoked directly via `node server/server.js` or `node server/index.js`
const isMain = process.argv[1] && (
  path.resolve(process.argv[1]) === path.resolve(__filename) ||
  path.resolve(process.argv[1]) === path.resolve(rootDir, 'server/index.js')
);

if (isMain) {
  const { server, settings } = createProductionServer();
  server.listen(settings.PORT, settings.HOST, () => {
    console.log(`ReactLab production server listening on http://${settings.HOST}:${settings.PORT}`);
    console.log(`Configured APP_ORIGIN: ${settings.APP_ORIGIN}`);
    console.log(`GitHub App configured: ${Boolean(settings.GITHUB_CLIENT_ID && settings.GITHUB_CLIENT_SECRET)}`);
  });
}
