import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { AuthProvider } from './context/AuthContext'
import { TenantProvider } from './context/TenantContext'
import { NotificationProvider } from './context/NotificationContext'
import { OfflineProvider } from './context/OfflineContext'
import App from './App.jsx'

// Chunk load failure = stale service worker after deploy. Reload forces SW to fetch fresh manifest.
window.addEventListener('vite:preloadError', () => window.location.reload());

// A deploy installs a new service worker, and skipWaiting/clientsClaim hand it
// this page straight away -- but the JavaScript already running is still the
// old build. Without this, a tab left open since before the deploy keeps
// serving the previous version, and the first reload often shows it again
// because the page loads from the precache before the new worker takes over.
// The handler above only catches the harder failure, where a lazy chunk has
// stopped existing.
//
// So reload on the handover -- but never under someone's hands. This is a
// billing app; reloading a half-typed invoice to pick up a CSS change would
// cost more than the stale build does. Wait until the tab is in the
// background, which is exactly the case this is for: the window that has been
// open since yesterday.
if ('serviceWorker' in navigator) {
  // Null on a first visit. Then the handover below is the worker installing
  // for the first time and there is nothing stale to replace.
  const hadController = !!navigator.serviceWorker.controller;
  let pending = false;

  const reloadWhenHidden = () => {
    if (document.hidden) { window.location.reload(); return; }
    if (pending) return;
    pending = true;
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) window.location.reload();
    });
  };

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return;
    reloadWhenHidden();
  });
}

// Prevent mouse scroll from changing number input values anywhere in the app.
document.addEventListener('wheel', (e) => {
  if (document.activeElement === e.target && e.target.type === 'number') {
    e.target.blur();
  }
}, { passive: true });

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <TenantProvider>
        <NotificationProvider>
          <OfflineProvider>
            <App />
          </OfflineProvider>
        </NotificationProvider>
      </TenantProvider>
    </AuthProvider>
  </StrictMode>,
)
