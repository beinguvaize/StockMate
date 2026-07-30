import React, { useState } from 'react';
import { Check, Palette, Loader2 } from 'lucide-react';
import { useTheme, THEMES } from '../hooks/useTheme';

export default function ThemePicker() {
  const { currentTheme, setTheme } = useTheme();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSelect = async (key) => {
    if (key === currentTheme) return;
    setSaving(true); setSaved(false);
    await setTheme(key);
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="glass-panel !p-0 !rounded-bento overflow-hidden border border-black/5 shadow-premium bg-surface">
      {/* Header */}
      <div className="bg-ink-primary p-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Palette size={20} className="text-accent-signature" />
          <h2 className="text-base font-bold text-surface">App Theme</h2>
        </div>
        <div className="text-[9px] font-semibold text-accent-signature opacity-70 uppercase flex items-center gap-1">
          {saving && <Loader2 size={10} className="animate-spin" />}
          {saved && <Check size={10} />}
          {saving ? 'Saving…' : saved ? 'Saved' : THEMES.find(t => t.key === currentTheme)?.label || 'Signature'}
        </div>
      </div>

      {/* Theme grid */}
      <div className="p-6">
        <p className="text-[11px] font-bold text-ink-secondary leading-relaxed mb-4">
          Choose a colour theme for your workspace. Applies to all users in your tenant.
        </p>
        <div className="grid grid-cols-3 gap-3">
          {THEMES.map(theme => {
            const active = currentTheme === theme.key;
            return (
              <button
                key={theme.key}
                onClick={() => handleSelect(theme.key)}
                className={`relative flex flex-col items-center gap-2 p-3 rounded-2xl border-2 transition-all hover:scale-105 active:scale-95 ${
                  active
                    ? 'border-ink-primary shadow-md'
                    : 'border-transparent hover:border-black/10'
                }`}
              >
                {/* Preview swatch */}
                <div
                  className="w-full h-12 rounded-xl border border-black/10 overflow-hidden flex items-center justify-center gap-1"
                  style={{ background: theme.canvas }}
                >
                  <div className="w-4 h-4 rounded-full" style={{ background: theme.dark ? '#1A1A1A' : '#111111' }} />
                  <div className="w-8 h-3 rounded-full" style={{ background: theme.accent }} />
                </div>

                <span className={`text-xs font-bold ${active ? 'text-ink-primary' : 'text-muted-foreground'}`}>
                  {theme.label}
                </span>

                {/* Active tick */}
                {active && (
                  <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-ink-primary flex items-center justify-center">
                    <Check size={11} className="text-accent-signature" strokeWidth={3} />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
