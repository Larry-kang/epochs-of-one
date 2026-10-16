import './ui/style.css';
import { start, showUpdatePrompt } from './ui/app.ts';
import { watchForUpdate } from './ui/update.ts';

const el = document.getElementById('app');
if (el) void start(el);
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('./sw.js').then((reg) => watchForUpdate(reg, navigator.serviceWorker, (w) => showUpdatePrompt(w))).catch(() => {});
  });
}
