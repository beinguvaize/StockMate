import { useEffect, useCallback } from 'react';
import { useTenant } from '../context/TenantContext';
import { supabase } from '../lib/supabase';

export const THEMES = [
  // Accent is the amber brand constant across all themes; themes vary only by
  // canvas / dark background. (Hardcoded amber UI means a non-amber accent
  // would clash, so every theme shares the amber accent.)
  { key: 'white',     label: 'Porcelain', accent: '#D97706', canvas: '#FFFFFF', dark: false },
  // 'signature' removes data-theme and falls through to the @theme default
  // canvas (#F8F9FC) — the swatch must show what the app actually renders,
  // not the warmer #F5F5F0 it previously previewed.
  { key: 'signature', label: 'Linen',     accent: '#D97706', canvas: '#F8F9FC', dark: false },
  { key: 'amber',     label: 'Sand',      accent: '#D97706', canvas: '#FFFBF0', dark: false },
  { key: 'slate',     label: 'Graphite',  accent: '#D97706', canvas: '#F1F5F9', dark: false },
  // shadcn/ui look — zinc neutrals with a near-black primary (only
  // non-amber accent; safe now that accent usage is tokenized).
  { key: 'shadcn',    label: 'Zinc',      accent: '#18181B', canvas: '#FAFAFA', dark: false },
  { key: 'ocean',     label: 'Mist',      accent: '#D97706', canvas: '#F0F4FF', dark: false },
  { key: 'rose',      label: 'Blush',     accent: '#D97706', canvas: '#FFF5F7', dark: false },
];

// 'dark' (Midnight) is withdrawn from the picker, not deleted.
//
// Its tokens are correct — the canvas, the ink scale, even a WCAG lift on muted
// text. What is missing is adoption: roughly 850 colour classes across the app
// are hardcoded and do not follow the theme, including 524 bg-white and 211
// text-gray-700/800/900. On a #0F0F0F canvas that renders white panels and
// near-black text on a near-black page. Offering a theme that does not work is
// worse than not offering it.
//
// The seven light themes are unaffected because they all sit on near-white
// canvases, so a hardcoded bg-white happens to look right on every one of them.
//
// To restore: convert those classes to tokens (bg-white -> bg-card,
// text-gray-800 -> text-foreground, and so on), then move this entry back into
// THEMES. Note that conversion also changes the light themes, since those
// classes resolve per-theme — so it needs a look at every screen, not just dark.
const WITHDRAWN_THEMES = [
  { key: 'dark', label: 'Midnight', accent: '#F59E0B', canvas: '#0F0F0F', dark: true },
];

/** Every theme the app can render, including ones no longer offered. */
export const ALL_THEMES = [...THEMES, ...WITHDRAWN_THEMES];

const applyTheme = (key) => {
  const theme = key && key !== 'signature' ? key : null;
  if (theme) {
    document.documentElement.setAttribute('data-theme', theme);
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
};

export const useTheme = () => {
  const { currentTenantId, businessProfile, updateBusinessProfile } = useTenant();

  // A tenant already saved on a withdrawn theme must not be stranded in it —
  // in dark mode much of the UI is unreadable, including the theme picker they
  // would need to escape with. Fall back to the default and let the next save
  // persist it.
  const saved = businessProfile?.theme || 'amber';
  const currentTheme = THEMES.some(t => t.key === saved) ? saved : 'amber';

  // Apply on mount + whenever businessProfile changes
  useEffect(() => {
    applyTheme(currentTheme);
  }, [currentTheme]);

  const setTheme = useCallback(async (key) => {
    applyTheme(key); // instant preview — no wait
    await updateBusinessProfile({ ...(businessProfile || {}), theme: key });
  }, [businessProfile, updateBusinessProfile]);

  return { currentTheme, setTheme, themes: THEMES };
};
