import { build } from 'esbuild';

await build({
  entryPoints: ['server/index.js'],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  outfile: 'dist/server/index.js',
  loader: { '.html': 'text' }
});

