import React, { useEffect, useState } from 'react';
import { callAsk, setAskEnabled } from '../../lib/askClient';

/** Owner's switch for Ask. Off means no shop data goes to the AI at all. */
export default function AskSettingsCard() {
  const [on, setOn] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    callAsk({ action: 'list', lang: 'en' })
      .then((d) => { if (live) setOn(d.state !== 'off'); })
      .catch((e) => { console.error('[ask] settings read failed', e); if (live) setError(e.message); });
    return () => { live = false; };
  }, []);

  const toggle = async () => {
    setSaving(true); setError('');
    try { await setAskEnabled(!on); setOn(!on); }
    catch (e) { console.error('[ask] switch failed', e); setError(e.message); }
    finally { setSaving(false); }
  };

  return (
    <section className="border border-border rounded-xl bg-card p-5" data-testid="ask-settings">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-[14px] font-semibold text-foreground">Ask</h2>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            Short AI explanations of your figures. When off, no shop data is sent to the AI.
          </p>
        </div>
        <button type="button" disabled={on === null || saving} onClick={toggle} aria-pressed={!!on}
          className="h-8 px-3.5 rounded-pill text-[13px] font-semibold border border-border text-foreground hover:bg-muted disabled:opacity-50">
          {on === null ? '…' : on ? 'Turn off' : 'Turn on'}
        </button>
      </div>
      {error && <p className="text-[13px] text-[color:var(--color-neg)] mt-2" role="alert">{error}</p>}
    </section>
  );
}
