import React, { useCallback, useEffect, useState } from 'react';
import { callAsk, setAskEnabled } from '../../lib/askClient';

/**
 * Owner's switch for Ask. Turning it on goes through the panel's consent
 * screen, which says what is sent and where; only turning off is direct.
 */
export default function AskSettingsCard() {
  const [on, setOn] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const read = useCallback(() => {
    callAsk({ action: 'list', lang: 'en' })
      .then((d) => setOn(d.state !== 'off'))
      .catch((e) => { console.error('[ask] settings read failed', e); setError(e.message); });
  }, []);

  useEffect(() => {
    read();
    window.addEventListener('ask:changed', read);
    return () => window.removeEventListener('ask:changed', read);
  }, [read]);

  const turnOff = async () => {
    setSaving(true); setError('');
    try { await setAskEnabled(false); setOn(false); }
    catch (e) { console.error('[ask] turn off failed', e); setError(e.message); }
    finally { setSaving(false); }
  };

  return (
    <section className="border border-border rounded-xl bg-card p-5" data-testid="ask-settings">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-[14px] font-semibold text-foreground" data-testid="ask-settings-state">
            {on === null ? 'Ask' : on ? 'Ask is on' : 'Ask is off'}
          </h2>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            {on
              ? 'Short AI explanations of your figures are on. Turn it off and nothing more is sent to the AI.'
              : 'Short AI explanations of your figures. When off, no shop data is sent to the AI.'}
          </p>
        </div>
        {on === null ? null : on
          ? <button type="button" disabled={saving} onClick={turnOff}
              className="h-8 px-3.5 rounded-pill text-[13px] font-semibold border border-border text-foreground hover:bg-muted disabled:opacity-50">Turn off</button>
          : <button type="button" onClick={() => window.dispatchEvent(new Event('ask:open'))}
              className="h-8 px-3.5 rounded-pill text-[13px] font-semibold border border-border text-foreground hover:bg-muted">Turn on</button>}
      </div>
      {error && <p className="text-[13px] text-[color:var(--color-neg)] mt-2" role="alert">{error}</p>}
    </section>
  );
}
