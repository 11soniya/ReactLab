import { build } from 'esbuild';
import { cp, mkdir } from 'node:fs/promises';
await build({ entryPoints: ['server/index.js'], bundle: true, format: 'esm', platform: 'browser', target: 'es2022', outfile: 'dist/server/index.js', loader: { '.html': 'text' } });
await mkdir('dist/.openai', { recursive: true });
await cp('.openai/hosting.json', 'dist/.openai/hosting.json');
await cp('drizzle', 'dist/.openai/drizzle', { recursive: true });
