import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Uma aba antiga pode pedir um chunk removido pelo deploy seguinte.
// Recupera uma vez por minuto, preservando sessão e rascunhos locais.
window.addEventListener('vite:preloadError', (event) => {
  if (!navigator.onLine) return;
  try {
    const ultima = Number(sessionStorage.getItem('essenza_chunk_reload') || 0);
    if (Date.now() - ultima < 60000) return;
    sessionStorage.setItem('essenza_chunk_reload', String(Date.now()));
    event.preventDefault();
    window.location.reload();
  } catch { /* deixa o ErrorBoundary oferecer a recuperação manual */ }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
