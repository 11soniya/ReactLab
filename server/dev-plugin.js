import { loadEnv } from 'vite';
import { handleApi } from './api.js';
export function githubDev() {
  return { name: 'reactlab-github-api', configureServer(server) {
    const settings = loadEnv('development', process.cwd(), '');
    server.middlewares.use(async (req, res, next) => {
      if (!req.url.startsWith('/api/github/')) return next();
      // Local Vite preview intentionally fails closed until a D1-backed Worker is used.
      const result = await handleApi(new Request(`http://127.0.0.1${req.url}`), settings);
      res.statusCode = result.status; result.headers.forEach((value, key) => res.setHeader(key, value)); res.end(await result.text());
    });
  } };
}
