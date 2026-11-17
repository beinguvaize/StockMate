import React, { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';
import { probeConnectivity } from '../lib/supabase';

/** Desktop: shown instead of the app when the offline window has run out. Never clears data. */
export default function OfflineLockScreen({ lock }) {
  const [pending, setPending] = useState(0);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { pendingCount } = await import('../lib/offline/outbox.js');
        setPending(await pendingCount());
      } catch (err) {
        console.warn('[OfflineLockScreen] could not count pending sales:', err);
      }
    })();
  }, []);

  const tryAgain = async () => {
    setBusy(true); setMsg('');
    try {
      if (await probeConnectivity()) { window.location.reload(); return; }
      setMsg('Still no internet.');
    } catch (err) {
      console.warn('[OfflineLockScreen] connectivity probe failed:', err);
      setMsg('Still no internet.');
    }
    setBusy(false);
  };

  return (
    <div className="min-h-screen bg-canvas font-inter flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-surface rounded-2xl border border-black/5 shadow-xl p-8 text-center">
        <WifiOff size={32} className="mx-auto mb-4 text-muted-foreground" />
        <h1 className="text-xl font-bold text-ink-primary mb-2">Connect to the internet to continue</h1>
        <p className="text-sm text-ink-secondary mb-3">
          {lock?.reason === 'clock'
            ? "This computer's date looks wrong. Fix the date and time, then try again."
            : `This computer has been offline for ${lock?.daysOffline ?? 0} days. Your plan allows ${lock?.graceDays ?? 7} days without internet.`}
        </p>
        {pending > 0 && (
          <p className="text-sm text-ink-secondary mb-3">
            {pending} sales and payments are saved on this computer and will send when you reconnect.
          </p>
        )}
        <button
          onClick={tryAgain}
          disabled={busy}
          className="mt-2 bg-ink-primary text-white text-sm font-semibold rounded-pill px-5 py-2.5 disabled:opacity-60"
        >
          Try again
        </button>
        {msg && <p className="text-sm text-ink-secondary mt-3" role="status">{msg}</p>}
      </div>
    </div>
  );
}
