import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, ChevronRight, AlertCircle } from 'lucide-react';
import SidePanel from '../ui/SidePanel';
import { Button } from '../ui/button';
import { useShellNotifications } from '../../hooks/useShellNotifications';
import { unreadOf, markAllRead, loadReadMap, saveReadMap } from '../../lib/shellNotifications';
import { formatShortDateTime, cn } from '../../lib/utils';

const TONE_DOT = { warn: 'bg-amber', bad: 'bg-bad', info: 'bg-info' };

/**
 * The bell in the top bar and its panel. Lines restate figures the Dashboard
 * already shows (see lib/shellNotifications); each opens its page. Read
 * state is kept per shop in this browser; the dot shows while any line's
 * current figure has not been seen. Opening the panel marks what it showed
 * as seen once it closes, so the lines are still marked new while open.
 */
export default function NotificationsBell({ tenantId, gates, basePath = '' }) {
  const navigate = useNavigate();
  const { list, failed, loading, refresh, checkedAt } = useShellNotifications({ tenantId, gates, basePath });
  const [open, setOpen] = useState(false);
  // Read state per shop; re-read from storage when the shop changes.
  const [readState, setReadState] = useState(() => ({ tenantId, map: loadReadMap(tenantId) }));
  const readMap = readState.tenantId === tenantId ? readState.map : loadReadMap(tenantId);
  const setReadMap = (map) => setReadState({ tenantId, map });
  // What was unread when the panel opened, so lines stay marked while it is open.
  const [freshIds, setFreshIds] = useState(() => new Set());

  const unread = useMemo(() => unreadOf(list, readMap), [list, readMap]);

  const openPanel = () => {
    setFreshIds(new Set(unread.map(n => n.id)));
    setOpen(true);
    refresh();
  };
  const closePanel = () => {
    setOpen(false);
    const next = markAllRead(list, readMap);
    setReadMap(next);
    saveReadMap(tenantId, next);
  };
  const follow = (n) => { closePanel(); navigate(n.to); };

  const label = unread.length ? `Notifications, ${unread.length} new` : 'Notifications';

  return (
    <>
      <Button variant="secondary" size="icon" onClick={openPanel} aria-label={label} title={label}
        aria-haspopup="dialog" aria-expanded={open} className="relative shrink-0" data-testid="notifications-bell">
        <Bell />
        {unread.length > 0 && (
          <span className="absolute top-[7px] right-[8px] size-2 rounded-full bg-amber ring-2 ring-well" aria-hidden="true" />
        )}
      </Button>

      <SidePanel open={open} onClose={closePanel} title="Notifications" trapFocus width={400}
        subtitle={checkedAt ? `Checked ${formatShortDateTime(checkedAt)}` : null}
        footer={<Button variant="secondary" className="w-full" onClick={refresh}>Check again</Button>}>
        {failed.length > 0 && (
          <p role="alert" className="mb-3 flex items-start gap-2 rounded-xl bg-bad-soft px-3 py-2.5 text-[13px] text-bad-text">
            <AlertCircle size={15} className="mt-px shrink-0" aria-hidden="true" />
            <span>Could not check {failed.join(' or ')}. Check the connection and press Check again.</span>
          </p>
        )}

        {list.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {list.map(n => (
              <li key={n.id}>
                <button type="button" data-card onClick={() => follow(n)}
                  className="m-press flex w-full items-start gap-3 rounded-xl border border-line bg-surface px-3.5 py-3 text-left hover:bg-tile">
                  <span className={cn('mt-[7px] size-2 shrink-0 rounded-full', TONE_DOT[n.tone] || 'bg-mute')} aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <b className="font-tight text-[14px] font-semibold text-ink">{n.title}</b>
                      {freshIds.has(n.id) && <span className="rounded-pill bg-amber-soft px-[7px] py-px font-tight text-[11px] font-semibold text-amber-text">New</span>}
                    </span>
                    <span className="mt-0.5 block text-[12.5px] text-body">{n.body}</span>
                    <span className="mt-1.5 inline-flex items-center gap-0.5 font-tight text-[12.5px] font-semibold text-amber-text">
                      {n.action}<ChevronRight size={13} aria-hidden="true" />
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : loading ? (
          <p className="py-10 text-center text-[13px] text-mute">Checking</p>
        ) : failed.length === 0 ? (
          // The phone's empty sheet, word for word.
          <div className="flex flex-col items-center py-10 text-center">
            <span className="grid size-[76px] place-items-center rounded-full bg-well text-mute"><Bell size={30} strokeWidth={1.7} aria-hidden="true" /></span>
            <b className="mt-4 font-tight text-[18px] font-bold tracking-[-0.02em] text-ink">No new notifications</b>
            <p className="mt-1.5 text-[13.5px] text-body">You are all caught up.</p>
          </div>
        ) : null}
      </SidePanel>
    </>
  );
}
