import React, { useLayoutEffect, useRef, useState } from 'react';

/** Segmented control with one sliding indicator. items: [{key,label,icon?}] */
export default function SegmentedTabs({ items, value, onChange, className = '', indicatorClass = 'bg-white shadow-sm', activeClass = 'text-ink-primary', trackClass = 'bg-black/[0.04]' }) {
  const refs = useRef({});
  const [box, setBox] = useState(null);
  useLayoutEffect(() => {
    const el = refs.current[value];
    if (el) setBox({ x: el.offsetLeft, w: el.offsetWidth });
  }, [value, items.length]);
  return (
    <div role="tablist" className={`relative inline-flex items-center gap-1 p-1 rounded-pill ${trackClass} ${className}`}>
      {box && (
        <span aria-hidden="true" className={`seg-indicator absolute top-1 bottom-1 left-0 rounded-pill ${indicatorClass}`}
          style={{ width: box.w, transform: `translateX(${box.x}px)` }} />
      )}
      {items.map(({ key, label, icon: Icon }) => (
        <button key={key} ref={(el) => { refs.current[key] = el; }} type="button" role="tab" aria-selected={value === key}
          onClick={() => onChange(key)}
          className={`relative z-10 inline-flex items-center gap-1.5 px-4 h-8 rounded-pill text-xs font-bold transition-[color,transform] duration-(--dur-press) active:scale-[0.97] ${value === key ? activeClass : 'text-muted-foreground hover:text-ink-primary'}`}>
          {Icon && <Icon size={14} />}{label}
        </button>
      ))}
    </div>
  );
}
