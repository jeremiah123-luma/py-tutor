import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/app.css';
import App from './App';
import { unlockSfx } from './ui/sfx';

// Browsers allow sound only after a tap; unlock interface sounds on the first one.
for (const t of ['pointerup', 'touchend', 'keydown']) window.addEventListener(t, unlockSfx, { capture: true, once: true, passive: true });

const theme = new URLSearchParams(location.search).get('theme');
if (theme === 'dark' || theme === 'light') document.documentElement.dataset.theme = theme;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
