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
  { key: 'dark',      label: 'Midnight',  accent: '#F59E0B', canvas: '#0F0F0F', dark: true  },
];

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

  const currentTheme = businessProfile?.theme || 'amber';

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
