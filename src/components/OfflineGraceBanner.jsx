import React from 'react';
import { WifiOff } from 'lucide-react';
import { useOfflineGrace } from '../lib/offline/useOfflineGrace.js';

/** Desktop: warns when the offline grace window is nearly used up. */
export default function OfflineGraceBanner() {
  const g = useOfflineGrace();
  if (!g || g.daysLeft > 7) return null;
  const showBackup = g.pendingCount > 0 && g.daysOffline >= 3;
  return (
    <div className="bg-accent-signature text-white rounded-xl px-4 py-2.5 mb-4 flex items-start gap-3" role="status">
      <WifiOff size={16} className="mt-0.5 flex-shrink-0" />
      <div className="text-[13px] font-semibold">
        <p>Offline for {g.daysOffline} days. Connect within {g.daysLeft} days to keep billing.</p>
        {showBackup && (
          <p className="font-medium opacity-90">
            {g.pendingCount} sales are only on this computer — connect to back them up.
          </p>
        )}
      </div>
    </div>
  );
}
