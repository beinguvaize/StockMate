import React from 'react';
import { cn } from '../../lib/utils';

/** Input, web redesign: 36px field, hairline ring, 10px corners (form
 *  controls are never pills; index.css enforces a small radius). */
const Input = React.forwardRef(({ className, type, ...props }, ref) => (
  <input
    type={type}
    ref={ref}
    className={cn(
      'flex h-9 w-full rounded-[10px] bg-surface px-3 text-[13.5px] text-ink tabular-nums shadow-[inset_0_0_0_1px_var(--color-line)] transition-shadow duration-(--dur-press) placeholder:text-mute focus-visible:outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--color-ink)] disabled:cursor-not-allowed disabled:opacity-50 file:border-0 file:bg-transparent file:text-sm file:font-medium',
      className,
    )}
    {...props}
  />
));
Input.displayName = 'Input';

export { Input };
