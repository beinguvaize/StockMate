import React, { useEffect, useRef, useState } from 'react';
import { ChefHat, Clock, Check, WifiOff, X } from 'lucide-react';
import { useTenant } from '../context/TenantContext';
import { useNotifications } from '../context/NotificationContext';
import { useKDS } from '../hooks/useKOT';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { failWords } from '../components/estimates/parts';
import { getAppTimezone } from '../lib/utils';
import {
  COLUMNS, LATE_MIN, POLL_SECONDS, ticketStatus, ageMinutes, isLate, ticketNo, tableLine, stationGroups,
  foodMark, statusCounts, byColumn, liveLine, activeLine, servedTitle, wallClock,
} from '../lib/kitchenView';

/**
 * Kitchen display (approved mockups kitchen-01 to 06): live kitchen order
 * tickets, oldest first, polled every 8 s. One tap moves a ticket on
 * (Start → Ready → Served), the same status write as before; Served can be
 * undone for a few seconds by writing the status back. A ticket is only a
 * slip for the cooks: no sale, stock or money is touched here.
 *
 * Built to be read from across a kitchen: big numbers, no motion on refresh
 * (tickets are not animated in or out; only the "updated" words change).
 */

/** Re-render once a second for the ages and "updated N s ago"; no animation. */
function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}

const FoodMark = ({ type }) => {
  const m = foodMark(type);
  if (!m) return <span aria-hidden="true" />;
  const color = m === 'v' ? 'var(--color-good)' : m === 'nv' ? 'var(--color-bad-text)' : '#CA8A04';
  const label = m === 'v' ? 'Veg' : m === 'nv' ? 'Non-veg' : 'Egg';
  return (
    <span role="img" aria-label={label} title={label}
      className="inline-grid h-3.5 w-3.5 translate-y-px place-items-center rounded-[3px] border-[1.5px]" style={{ borderColor: color }}>
      {m === 'nv'
        ? <i className="h-0 w-0 border-x-4 border-b-[7px] border-x-transparent" style={{ borderBottomColor: color }} />
        : <i className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />}
    </span>
  );
};

const Ticket = ({ tk, now, wall, stale, onBump }) => {
  const s = ticketStatus(tk);
  const mins = ageMinutes(tk.created_at, now);
  const late = isLate(mins);
  return (
    <article aria-label={`Ticket ${ticketNo(tk)} ${tableLine(tk)}`}
      className={`flex flex-col overflow-hidden rounded-2xl border bg-surface shadow-[0_1px_2px_rgba(17,20,24,0.05)] ${late ? 'border-[#F5C2C2] shadow-[0_0_0_2px_#F5C2C2]' : 'border-line'} ${stale ? 'opacity-60' : ''}`}>
      <div className="h-1.5" style={{ background: s.bar }} />
      <div className="flex items-baseline gap-2.5 border-b border-sep px-[18px] pt-3.5 pb-2.5">
        <b className={`font-tight font-bold leading-none tracking-[-0.02em] tabular-nums ${wall ? 'text-[32px]' : 'text-[26px]'}`}>{ticketNo(tk)}</b>
        {tableLine(tk) && <span className="font-tight text-[17px] font-semibold text-body">{tableLine(tk)}</span>}
        <span className={`ml-auto inline-flex items-center gap-[5px] font-tight text-[17px] font-semibold tabular-nums ${late ? 'text-bad-text' : 'text-body'}`}>
          <Clock size={16} strokeWidth={2.2} /> {mins}m
        </span>
      </div>
      <div className="flex-1 px-[18px] pt-3 pb-1.5">
        {stationGroups(tk.items).map(({ station, items }) => (
          <div key={station}>
            <div className="mt-1 mb-1.5 font-tight text-[11.5px] font-semibold uppercase tracking-[0.08em] text-mute">{station}</div>
            {items.map((it, i) => (
              <div key={i} className={`grid items-baseline gap-2 py-1 font-tight font-semibold leading-[1.3] text-ink ${wall ? 'grid-cols-[48px_18px_1fr] text-[22px]' : 'grid-cols-[40px_16px_1fr] text-[18px]'}`}>
                <span className="tabular-nums text-amber-text">{it.quantity}×</span>
                <FoodMark type={it.food_type} />
                <span>{it.name}</span>
                {it.notes && <span className={`col-start-3 -mt-0.5 font-sans font-medium text-body ${wall ? 'text-[16px]' : 'text-[14px]'}`}>↳ {it.notes}</span>}
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2.5 pt-3 pr-3.5 pb-3.5 pl-[18px]">
        <Badge tone={s.tone} className="px-2.5 py-1 text-[12.5px]">{s.label}</Badge>
        <button type="button" onClick={() => onBump(tk)}
          className={`m-press ml-auto inline-flex items-center gap-2 rounded-pill font-tight font-semibold text-white ${s.key === 'READY' ? 'bg-good hover:bg-good-text' : 'bg-ink hover:bg-[#2A2F35]'} ${wall ? 'px-[26px] py-3.5 text-[18px]' : 'px-[22px] py-3 text-[16px]'}`}>
          {s.action}
        </button>
      </div>
    </article>
  );
};

const LiveChip = ({ live }) => (
  <span role="status" className={`inline-flex items-center gap-[7px] rounded-pill px-3 py-1.5 font-tight text-[12.5px] font-semibold ${live.off ? 'bg-bad-soft text-bad-text' : 'bg-tile text-body'}`}>
    <i className={`h-2 w-2 rounded-full ${live.off ? 'bg-bad' : 'bg-good'}`} />{live.text}
  </span>
);

const KDS = () => {
  const { currentTenantId } = useTenant();
  const { addNotification } = useNotifications();
  const { tickets, loading, error, lastOkAt, refresh, updateStatus } = useKDS(currentTenantId);
  const now = useNow();
  const [wall, setWall] = useState(false);
  const [served, setServed] = useState(null);   // { tk, prev } for Undo
  const servedTimer = useRef(null);
  useEffect(() => () => clearTimeout(servedTimer.current), []);

  const failing = !!error;
  const counts = statusCounts(tickets);

  const bump = async (tk) => {
    const s = ticketStatus(tk);
    const res = await updateStatus(tk.id, s.next);
    if (res?.error) { addNotification(failWords(res.error, 'ticket change'), 'error', 9000); return; }
    if (s.next === 'SERVED') {
      clearTimeout(servedTimer.current);
      setServed({ tk, prev: s.key });
      servedTimer.current = setTimeout(() => setServed(null), 8000);
    }
  };

  // Undo writes the status it had back, with the same call.
  const undo = async () => {
    const u = served;
    if (!u) return;
    clearTimeout(servedTimer.current);
    setServed(null);
    const res = await updateStatus(u.tk.id, u.prev);
    if (res?.error) addNotification(failWords(res.error, 'undo'), 'error', 9000);
  };

  const toast = served && (
    <div role="status" className="fixed bottom-7 left-1/2 z-[170] flex max-w-[560px] -translate-x-1/2 items-start gap-2.5 rounded-[14px] bg-ink py-3 pr-3.5 pl-4 text-[13px] leading-[1.45] text-white shadow-[0_18px_40px_-16px_rgba(17,20,24,0.5)]">
      <Check size={18} className="mt-px shrink-0 text-[#86EFAC]" />
      <div>
        <b className="block font-tight text-[13.5px] font-semibold">{servedTitle(served.tk)}</b>
        <span className="text-white/80">Taken off the board.</span>
      </div>
      <button type="button" onClick={undo} className="ml-2 self-center whitespace-nowrap font-tight text-[13px] font-semibold text-[#FFC46B] hover:underline underline-offset-4">Undo</button>
      <button type="button" aria-label="Dismiss" onClick={() => setServed(null)} className="self-center text-white/60 hover:text-white"><X size={16} /></button>
    </div>
  );

  const offBar = failing && (
    <div role="alert" className="mb-3.5 flex flex-wrap items-center gap-3 rounded-[14px] bg-bad-soft px-4 py-3 text-[13.5px] text-bad-text">
      <WifiOff size={20} className="shrink-0" />
      <div className="min-w-0 flex-1">
        <b className="font-tight text-[14px] font-semibold text-[#991b1b]">Not connected. These tickets may be out of date.</b><br />
        New orders will not appear, and a Start / Ready / Served tap may not save, until the connection is back.
        <span className="mt-0.5 block break-words text-[12.5px] opacity-80">{String(error?.message || error)}</span>
      </div>
      <Button variant="outline" size="sm" className="bg-white text-[#991b1b]" onClick={refresh}>Try again</Button>
    </div>
  );

  const first = loading && !tickets.length && !lastOkAt && !failing;

  if (wall) {
    const cols = byColumn(tickets);
    return (
      <div className="fixed inset-0 z-[150] flex flex-col gap-[18px] overflow-y-auto bg-canvas px-[26px] py-[22px] text-ink">
        <div className="flex flex-wrap items-center gap-4">
          <ChefHat size={26} className="text-amber" />
          <h1 className="font-tight text-[26px] font-semibold tracking-[-0.02em]">Kitchen</h1>
          <span className="flex-1" />
          <LiveChip live={liveLine({ lastOkAt, failing, now, wall: true })} />
          <span className="font-tight text-[30px] font-semibold tracking-[-0.02em] tabular-nums">{wallClock(new Date(now), getAppTimezone())}</span>
          <Button variant="secondary" onClick={() => setWall(false)}>Exit wall mode</Button>
        </div>
        {offBar}
        <div className="grid flex-1 grid-cols-1 items-start gap-[18px] md:grid-cols-3">
          {COLUMNS.map((c) => (
            <section key={c.key} aria-label={c.label}>
              <div className="mb-3 flex items-center gap-2.5 font-tight text-[20px] font-semibold">
                <i className="h-3 w-3 rounded-full" style={{ background: c.bar }} />{c.label}
                <b className="rounded-pill bg-surface px-2.5 py-0.5 text-[15px] font-semibold text-body tabular-nums">{cols[c.key].length}</b>
              </div>
              <div className="grid gap-3.5">
                {cols[c.key].map((tk) => <Ticket key={tk.id} tk={tk} now={now} wall stale={failing} onBump={bump} />)}
              </div>
            </section>
          ))}
        </div>
        {toast}
      </div>
    );
  }

  return (
    <div className="flex flex-col pb-12">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {first ? (
          <span className="font-tight text-[15px] font-semibold">Loading kitchen…</span>
        ) : (
          <>
            <span className="font-tight text-[15px] font-semibold">
              {activeLine(tickets.length)}<small className="ml-2 font-sans text-[13px] font-medium text-mute">oldest first · refreshes every {POLL_SECONDS} s</small>
            </span>
            <span className="flex-1" />
            <div className="flex flex-wrap gap-2">
              {COLUMNS.map((c) => (
                <span key={c.key} className="inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 font-tight text-[13px] font-semibold tabular-nums shadow-[inset_0_0_0_1px_var(--color-line)]">
                  <i className="h-2 w-2 rounded-full" style={{ background: c.bar }} />{c.label} {counts[c.key]}
                </span>
              ))}
            </div>
            <LiveChip live={liveLine({ lastOkAt, failing, now })} />
            <Button variant="secondary" onClick={() => setWall(true)}>Wall mode</Button>
          </>
        )}
      </div>

      {offBar}

      {first ? (
        <div className="grid grid-cols-1 items-start gap-3.5 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="overflow-hidden rounded-2xl border border-dashed border-line bg-surface">
              <div className="h-1.5 bg-well" />
              <div className="p-[18px]">
                {['40%', '85%', '70%', '55%'].map((w, j) => <div key={j} className="my-2.5 rounded-[7px] bg-well" style={{ width: w, height: j ? 14 : 22 }} />)}
              </div>
            </div>
          ))}
        </div>
      ) : tickets.length === 0 ? (
        !failing && (
          <div className="rounded-2xl border border-dashed border-line bg-surface px-6 py-[90px] text-center">
            <span className="mx-auto mb-3.5 grid h-[52px] w-[52px] place-items-center rounded-2xl bg-tile text-ink-2"><ChefHat size={24} strokeWidth={1.7} /></span>
            <h3 className="font-tight text-[17px] font-semibold">No active tickets</h3>
            <p className="mx-auto mt-1.5 max-w-[52ch] text-[13.5px] text-body">New KOTs from the floor appear here.</p>
          </div>
        )
      ) : (
        <>
          <div className="grid grid-cols-1 items-start gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
            {tickets.map((tk) => <Ticket key={tk.id} tk={tk} now={now} stale={failing} onBump={bump} />)}
          </div>
          <div className="mt-3.5 flex flex-wrap items-center gap-4 text-[12.5px] text-body">
            <span className="inline-flex items-center gap-1.5"><FoodMark type="VEG" />Veg</span>
            <span className="inline-flex items-center gap-1.5"><FoodMark type="NONVEG" />Non-veg</span>
            <span className="inline-flex items-center gap-1.5"><FoodMark type="EGG" />Egg</span>
            <span className="ml-auto">A ticket turns red after {LATE_MIN} minutes.</span>
          </div>
        </>
      )}
      {toast}
    </div>
  );
};

export default KDS;
