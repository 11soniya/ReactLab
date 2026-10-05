import { build } from 'esbuild';

await build({
  entryPoints: ['server/server.js'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  outfile: 'dist/server/index.js',
  packages: 'external'
});
