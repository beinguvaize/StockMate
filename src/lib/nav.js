/**
 * lib/nav.js
 * Router-aware hard-navigation helper.
 *
 * Web (BrowserRouter) → `window.location.href = path` (server resolves path).
 * Electron (HashRouter, file://) → set `window.location.hash = "#" + path`
 *   then reload so providers re-init cleanly against the new route.
 *
 * Use this anywhere a full reload-style navigation is needed
 * (impersonation switch, post-onboarding, hard logout, error fallback).
 */

const isHashRouter = () =>
  typeof window !== 'undefined' && !!window.electron?.isElectron;

export function goHref(path) {
  if (typeof window === 'undefined') return;
  if (isHashRouter()) {
    window.location.hash = `#${path.startsWith('/') ? path : '/' + path}`;
    window.location.reload();
  } else {
    window.location.href = path;
  }
}
