import { defineConfig } from 'vite';
import { precachePlugin } from './scripts/precache-plugin.ts';

export default defineConfig({
  base: process.env.VITE_BASE ?? './',
  plugins: [precachePlugin()],
  build: { target: 'es2022', sourcemap: false },
});
