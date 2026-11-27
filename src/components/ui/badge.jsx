import React from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '../../lib/utils';

/**
 * Status pill, web redesign: soft fill, darker text of the same hue.
 *   tone: good (green) | warn (amber) | bad (red) | info (blue) | neutral
 * `variant` kept for the shadcn names (default/secondary/destructive/outline).
 */
const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-pill px-[9px] py-[3px] font-tight text-[11.5px] font-semibold leading-tight whitespace-nowrap tabular-nums',
  {
    variants: {
      tone: {
        good:    'bg-good-soft text-good-text',
        warn:    'bg-amber-soft text-amber-text',
        bad:     'bg-bad-soft text-bad-text',
        info:    'bg-info-soft text-info-text',
        neutral: 'bg-well text-body',
        dark:    'bg-ink text-white',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

const VARIANT_TONE = { default: 'warn', secondary: 'neutral', destructive: 'bad', outline: 'neutral' };

function Badge({ className, tone, variant, ...props }) {
  return <span className={cn(badgeVariants({ tone: tone || VARIANT_TONE[variant] || 'neutral' }), className)} {...props} />;
}

export { Badge, badgeVariants };
