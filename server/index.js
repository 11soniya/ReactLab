import { handleApi } from './api.js';
import indexHtml from '../dist/client/index.html';
export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (path.startsWith('/api/github/')) return handleApi(request, env);
    if (path === '/' && request.method === 'GET') return new Response(indexHtml, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', 'Referrer-Policy': 'same-origin' } });
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response('Not found', { status: 404 });
  }
};
