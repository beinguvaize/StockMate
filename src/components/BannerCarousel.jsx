import React, { useEffect, useMemo, useState } from 'react';
import { Megaphone, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useTenant } from '../context/TenantContext';
import { goHref } from '../lib/nav';

// Dashboard promo/announcement banners: a slim row, auto-rotate, per-banner
// dismiss (localStorage). Content managed in the `banners` table. The
// table's `gradient` column belonged to the old gradient card and is not
// drawn any more; it is left in place.

const DISMISS_KEY = 'dismissed_banners';
const dismissed = () => {
  try { return JSON.parse(localStorage.getItem(DISMISS_KEY)) || []; } catch { return []; }
};

const BannerCarousel = () => {
  const { currentTenant } = useTenant();
  const [banners, setBanners] = useState([]);
  const [idx, setIdx] = useState(0);
  const [hidden, setHidden] = useState(dismissed());

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('banners')
        .select('*')
        .order('sort');
      setBanners(data || []);
    })();
  }, []);

  const visible = useMemo(() => {
    const plan = (currentTenant?.plan || '').toUpperCase();
    return banners.filter(b =>
      !hidden.includes(b.id) &&
      (!b.audience_plan || b.audience_plan.toUpperCase() === plan));
  }, [banners, hidden, currentTenant?.plan]);

  useEffect(() => {
    if (visible.length < 2) return;
    const t = setInterval(() => setIdx(i => (i + 1) % visible.length), 6000);
    return () => clearInterval(t);
  }, [visible.length]);

  if (!visible.length) return null;
  const b = visible[Math.min(idx, visible.length - 1)];

  const dismiss = () => {
    const next = [...hidden, b.id];
    setHidden(next);
    localStorage.setItem(DISMISS_KEY, JSON.stringify(next));
    setIdx(0);
  };

  // Web redesign: one slim grey row (was a large gradient card). Same banners,
  // same rotation every 6s, same per-banner dismiss and button.
  return (
    <div className="flex items-center gap-3 min-w-0 rounded-xl bg-tile py-[11px] pl-3.5 pr-3 text-[13.5px]" data-testid="announcement">
      <span className="grid place-items-center size-7 shrink-0 rounded-lg bg-surface shadow-[0_0_0_1px_var(--color-line)] text-ink-2">
        {b.emoji ? <span className="text-[15px] leading-none" aria-hidden="true">{b.emoji}</span> : <Megaphone size={15} />}
      </span>
      <span className="min-w-0 flex-1 truncate text-ink-2" title={[b.title, b.subtitle].filter(Boolean).join(': ')}>
        <b className="font-tight font-semibold text-ink">{b.title}</b>
        {b.subtitle && <> {b.subtitle}</>}
      </span>
      {visible.length > 1 && (
        <span className="hidden sm:flex items-center gap-1 shrink-0" aria-label={`Announcement ${idx + 1} of ${visible.length}`}>
          {visible.map((v, i) => (
            <button key={v.id} type="button" onClick={() => setIdx(i)} aria-label={`Show announcement ${i + 1}`}
              className={`h-1.5 rounded-xl transition-colors ${i === idx ? 'w-3 bg-ink-2' : 'w-1.5 bg-faint'}`} />
          ))}
        </span>
      )}
      {b.cta_label && b.cta_url && (
        <button
          type="button"
          onClick={() => (b.cta_url.startsWith('http') ? window.open(b.cta_url, '_blank') : goHref(b.cta_url))}
          className="shrink-0 font-tight text-[13px] font-semibold text-amber-text hover:underline underline-offset-4"
        >
          {b.cta_label}
        </button>
      )}
      <button type="button" onClick={dismiss} aria-label="Dismiss" title="Dismiss"
        className="m-press grid place-items-center size-[26px] shrink-0 rounded-pill text-mute hover:bg-well hover:text-ink-2">
        <X size={14} />
      </button>
    </div>
  );
};

export default BannerCarousel;
