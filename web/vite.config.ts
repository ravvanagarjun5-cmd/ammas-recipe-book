import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' so the app works from any address, including https://<name>.github.io/<repo>/
export default defineConfig({ root: 'web', base: './', plugins: [react()], build: { outDir: 'dist', emptyOutDir: true } });
