import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useTenant } from '../context/TenantContext';
import { goHref } from '../lib/nav';

// Dashboard promo/announcement banners — designed gradient cards, auto-rotate,
// per-banner dismiss (localStorage). Content managed in the `banners` table.

const GRADIENTS = {
  amber:   'from-accent-signature via-orange-500 to-accent-signature',
  indigo:  'from-indigo-500 via-violet-500 to-indigo-600',
  emerald: 'from-emerald-500 via-teal-500 to-emerald-600',
  slate:   'from-slate-700 via-slate-800 to-slate-900',
  rose:    'from-rose-500 via-pink-500 to-rose-600',
};

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
  const grad = GRADIENTS[b.gradient] || GRADIENTS.amber;

  const dismiss = () => {
    const next = [...hidden, b.id];
    setHidden(next);
    localStorage.setItem(DISMISS_KEY, JSON.stringify(next));
    setIdx(0);
  };

  return (
    <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-r ${grad} text-white mb-5 shadow-lg`}>
      {/* decorative orbs */}
      <div className="absolute -top-10 -right-10 w-44 h-44 rounded-full bg-white/10 pointer-events-none" />
      <div className="absolute -bottom-14 right-24 w-32 h-32 rounded-full bg-white/10 pointer-events-none" />

      <div className="relative flex items-center gap-4 px-5 py-4 md:px-7 md:py-5">
        {b.emoji && <div className="text-3xl md:text-4xl shrink-0">{b.emoji}</div>}
        <div className="flex-1 min-w-0">
          <div className="text-[15px] md:text-[17px] font-extrabold leading-tight">{b.title}</div>
          {b.subtitle && (
            <div className="text-[12px] md:text-[13px] text-white/85 mt-0.5 line-clamp-2">{b.subtitle}</div>
          )}
        </div>
        {b.cta_label && b.cta_url && (
          <button
            onClick={() => (b.cta_url.startsWith('http') ? window.open(b.cta_url, '_blank') : goHref(b.cta_url))}
            className="shrink-0 hidden sm:flex items-center gap-1.5 px-4 py-2 rounded-full bg-white text-foreground text-[12px] font-extrabold hover:scale-[1.03] active:scale-95 transition-transform"
          >
            {b.cta_label} <ArrowRight size={13} />
          </button>
        )}
        <button onClick={dismiss} aria-label="Dismiss"
          className="shrink-0 w-7 h-7 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center transition-colors">
          <X size={13} />
        </button>
      </div>

      {visible.length > 1 && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
          {visible.map((v, i) => (
            <button key={v.id} onClick={() => setIdx(i)}
              className={`h-1.5 rounded-full transition-all ${i === idx ? 'w-5 bg-white' : 'w-1.5 bg-white/40'}`} />
          ))}
        </div>
      )}
    </div>
  );
};

export default BannerCarousel;
