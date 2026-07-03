import { useEffect, useCallback } from 'react';
import { useTenant } from '../context/TenantContext';
import { supabase } from '../lib/supabase';

export const THEMES = [
  // Accent is the indigo brand constant across all themes; themes vary only by
  // canvas / dark background. (Hardcoded indigo UI means a non-indigo accent
  // would clash, so every theme shares the indigo accent.)
  { key: 'white',     label: 'Porcelain', accent: '#4F46E5', canvas: '#FFFFFF', dark: false },
  { key: 'signature', label: 'Linen',     accent: '#4F46E5', canvas: '#F5F5F0', dark: false },
  { key: 'amber',     label: 'Sand',      accent: '#4F46E5', canvas: '#FFFBF0', dark: false },
  { key: 'slate',     label: 'Graphite',  accent: '#4F46E5', canvas: '#F1F5F9', dark: false },
  { key: 'ocean',     label: 'Mist',      accent: '#4F46E5', canvas: '#F0F4FF', dark: false },
  { key: 'rose',      label: 'Blush',     accent: '#4F46E5', canvas: '#FFF5F7', dark: false },
  { key: 'dark',      label: 'Midnight',  accent: '#818CF8', canvas: '#0F0F0F', dark: true  },
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
