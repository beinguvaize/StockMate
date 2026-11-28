import React from 'react';
import { ArrowUpRight } from 'lucide-react';
import { cn } from '../../lib/utils';

/**
 * Plain figure strip (web redesign): key figures in a row with hairline
 * dividers, no boxes. A figure with `onClick` is a tappable tile: tile-grey
 * on hover, an arrow appears, presses to 96%.
 *
 *   <FigureStrip cols={6}>
 *     <Figure label="Sales today" value="₹18,420" sub={<Badge tone="good">+12%</Badge>} onClick={...} />
 *   </FigureStrip>
 */
const COLS = { 2: 'md:grid-cols-2', 3: 'md:grid-cols-3', 4: 'md:grid-cols-4', 5: 'md:grid-cols-3 xl:grid-cols-5', 6: 'md:grid-cols-3 xl:grid-cols-6' };

export function FigureStrip({ cols = 4, className, children, ...props }) {
  return (
    <div className={cn('grid grid-cols-2 -mx-2.5', COLS[cols] || COLS[4], className)} {...props}>
      {children}
    </div>
  );
}

export const Eyebrow = ({ className, ...props }) => (
  <span className={cn('font-tight text-[11px] font-semibold uppercase tracking-[0.07em] text-mute', className)} {...props} />
);

export function Figure({ label, value, sub, cap, onClick, title, className }) {
  const body = (
    <>
      <Eyebrow>{label}</Eyebrow>
      <b className="block mt-1.5 mb-1 font-tight text-[23px] font-semibold leading-[1.15] tracking-[-0.02em] tabular-nums whitespace-nowrap text-ink">{value}</b>
      {sub !== undefined && sub !== null && (
        <small className="flex items-center gap-1.5 text-[12px] text-body whitespace-nowrap">{sub}</small>
      )}
      {cap && <span className="mt-1 block text-[11.5px] text-mute whitespace-nowrap">{cap}</span>}
    </>
  );
  const base = 'relative block text-left px-3 py-2.5 rounded-xl min-w-0 [&+&]:before:content-[""] [&+&]:before:absolute [&+&]:before:left-0 [&+&]:before:top-3.5 [&+&]:before:bottom-3.5 [&+&]:before:w-px [&+&]:before:bg-sep';
  if (!onClick) return <div className={cn(base, className)}>{body}</div>;
  return (
    <div role="button" tabIndex={0} title={title}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(e); } }}
      className={cn(base, 'group/fig m-press cursor-pointer hover:bg-tile', className)}>
      {body}
      <ArrowUpRight size={14} aria-hidden="true"
        className="absolute right-2.5 top-2.5 text-faint opacity-0 transition-opacity duration-(--dur-press) group-hover/fig:opacity-100" />
    </div>
  );
}

export default FigureStrip;
