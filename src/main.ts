import './ui/style.css';
import { start } from './ui/app.ts';

const el = document.getElementById('app');
if (el) void start(el);
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => { void navigator.serviceWorker.register('./sw.js'); });
}
