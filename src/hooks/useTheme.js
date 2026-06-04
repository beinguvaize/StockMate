import { useEffect, useCallback } from 'react';
import { useTenant } from '../context/TenantContext';
import { supabase } from '../lib/supabase';

export const THEMES = [
  // Accent is the amber brand constant across all themes; themes vary only by
  // canvas / dark background. (Hardcoded amber UI means a non-amber accent
  // would clash, so every theme shares the amber accent.)
  { key: 'amber',     label: 'Amber',      accent: '#D97706', canvas: '#FFFBF0', dark: false },
  { key: 'signature', label: 'Classic',    accent: '#D97706', canvas: '#F5F5F0', dark: false },
  { key: 'white',     label: 'White',      accent: '#D97706', canvas: '#FFFFFF', dark: false },
  { key: 'ocean',     label: 'Cool',       accent: '#D97706', canvas: '#F0F4FF', dark: false },
  { key: 'rose',      label: 'Warm',       accent: '#D97706', canvas: '#FFF5F7', dark: false },
  { key: 'slate',     label: 'Slate',      accent: '#D97706', canvas: '#F1F5F9', dark: false },
  { key: 'dark',      label: 'Dark',       accent: '#F59E0B', canvas: '#0F0F0F', dark: true  },
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
