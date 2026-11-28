import React, { useCallback, useEffect, useState } from 'react';
import { callAsk, setAskEnabled } from '../../lib/askClient';
import { Button } from '../ui/button';

/**
 * Owner's switch for Ask. Turning it on goes through the panel's consent
 * screen, which says what is sent and where; only turning off is direct.
 * Drawn as a Settings card (approved settings-01).
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
    <section className="overflow-hidden rounded-[14px] border border-line bg-surface" data-testid="ask-settings">
      <div className="border-b border-sep px-5 pb-3.5 pt-4">
        <h4 className="font-tight text-[15px] font-semibold text-ink">Ask</h4>
        <p className="mt-0.5 text-[13px] text-body">Short AI explanations of your figures. When off, no shop data is sent to the AI.</p>
      </div>
      <div className="grid items-start gap-1.5 px-5 py-3.5 sm:grid-cols-[200px_minmax(0,1fr)] sm:gap-6">
        <div>
          <b className="block font-tight text-[13.5px] font-semibold text-ink" data-testid="ask-settings-state">
            {on === null ? 'Ask' : on ? 'Ask is on' : 'Ask is off'}
          </b>
          <small className="mt-0.5 block text-[12px] text-mute">
            {on ? 'Turn it off and nothing more is sent to the AI.' : 'Turning it on shows what is sent, and where, first.'}
          </small>
        </div>
        <span className="pt-0.5 text-[12.5px] text-mute">Shown to the owner only, when Ask is offered for this shop.</span>
      </div>
      {error && <p className="px-5 pb-3 text-[13px] text-bad-text" role="alert">{error}</p>}
      {on !== null && (
        <div className="flex justify-end border-t border-sep bg-tile px-5 py-3">
          {on
            ? <Button variant="outline" size="sm" disabled={saving} onClick={turnOff}>Turn off</Button>
            : <Button variant="outline" size="sm" onClick={() => window.dispatchEvent(new Event('ask:open'))}>Turn on</Button>}
        </div>
      )}
    </section>
  );
}
