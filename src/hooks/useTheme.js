import { useEffect, useCallback } from 'react';
import { useTenant } from '../context/TenantContext';
import { supabase } from '../lib/supabase';

export const THEMES = [
  { key: 'white', label: 'Porcelain', accent: '#D97706', canvas: '#FFFFFF', dark: false },
];

// The workspace is white-only by decision. The other themes' CSS is still in
// index.css and their entries are kept here so nothing is lost — but only one is
// offered, and applyTheme always lands on it, so a tenant carrying an older
// saved value (signature, amber, dark) renders white like everyone else rather
// than being stranded on a theme no one maintains.
const RETIRED_THEMES = [
  { key: 'signature', label: 'Linen',    accent: '#D97706', canvas: '#F8F9FC', dark: false },
  { key: 'amber',     label: 'Sand',     accent: '#D97706', canvas: '#FFFBF0', dark: false },
  { key: 'slate',     label: 'Graphite', accent: '#D97706', canvas: '#F1F5F9', dark: false },
  { key: 'shadcn',    label: 'Zinc',     accent: '#18181B', canvas: '#FAFAFA', dark: false },
  { key: 'ocean',     label: 'Mist',     accent: '#D97706', canvas: '#F0F4FF', dark: false },
  { key: 'rose',      label: 'Blush',    accent: '#D97706', canvas: '#FFF5F7', dark: false },
  { key: 'dark',      label: 'Midnight', accent: '#F59E0B', canvas: '#0F0F0F', dark: true  },
];

/** Every theme whose CSS still exists, offered or not. */
export const ALL_THEMES = [...THEMES, ...RETIRED_THEMES];

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

  // Ignore whatever is stored: white is the only theme the app ships. The saved
  // value is left untouched rather than migrated, so re-enabling a picker later
  // restores each tenant's previous choice.
  const currentTheme = 'white';

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
