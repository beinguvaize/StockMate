import React from 'react';
import { ChevronRight } from 'lucide-react';

export const Chevron = ({ open, size = 14, className = '' }) => (
  <ChevronRight size={size} data-open={open} className={`chevron-turn ${className}`} />
);

/** Animated height via grid rows. Children stay mounted so close is animated. */
export default function Expand({ open, children }) {
  return (
    <div className="expand-rows" data-open={!!open} aria-hidden={!open}>
      <div className="expand-inner"><div>{children}</div></div>
    </div>
  );
}
