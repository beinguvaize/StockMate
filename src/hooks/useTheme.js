import { useEffect, useCallback } from 'react';
import { useTenant } from '../context/TenantContext';
import { supabase } from '../lib/supabase';

export const THEMES = [
  { key: 'signature', label: 'Signature',  accent: '#6366F1', canvas: '#F5F5F0', dark: false },
  { key: 'white',     label: 'White',      accent: '#111111', canvas: '#FFFFFF', dark: false },
  { key: 'ocean',     label: 'Ocean',      accent: '#3B82F6', canvas: '#F0F4FF', dark: false },
  { key: 'rose',      label: 'Rose',       accent: '#F43F5E', canvas: '#FFF5F7', dark: false },
  { key: 'amber',     label: 'Amber',      accent: '#F59E0B', canvas: '#FFFBF0', dark: false },
  { key: 'slate',     label: 'Slate',      accent: '#6366F1', canvas: '#F1F5F9', dark: false },
  { key: 'dark',      label: 'Dark',       accent: '#6366F1', canvas: '#0F0F0F', dark: true  },
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

  const currentTheme = businessProfile?.theme || 'signature';

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
