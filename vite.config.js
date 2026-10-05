import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { githubDev } from './server/dev-plugin.js';
export default defineConfig({ plugins: [react(), tailwindcss(), githubDev()], build: { outDir: 'dist/client' } });
