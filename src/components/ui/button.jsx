import React from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '../../lib/utils';

/**
 * Button, in the web redesign's look (the phone app's): pill shape, Inter
 * Tight, amber primary with white text, grey "secondary" well, a dark pill
 * for a page's main action. Presses to 96%; hover changes colour only.
 *
 * Tokens resolve through index.css, so the shell, the dashboard and later
 * pages pick the look up from here instead of per-page classes.
 *
 *   variant: default (amber) | secondary (grey well) | dark | outline | ghost
 *            | destructive | link
 *   size:    default | sm | xs | lg | icon (round, 36px) | icon-sm (32px)
 */
const buttonVariants = cva(
  'm-press inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-pill font-tight font-semibold disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default:     'bg-amber text-white hover:bg-amber-hover',
        secondary:   'bg-well text-ink hover:bg-[#E8E8E7]',
        dark:        'bg-ink text-white hover:bg-[#2A2F35]',
        outline:     'bg-surface text-ink-2 shadow-[inset_0_0_0_1px_var(--color-line)] hover:bg-tile',
        ghost:       'text-ink-2 hover:bg-tile hover:text-ink',
        destructive: 'bg-bad text-white hover:bg-bad-text',
        link:        'text-amber-text hover:underline underline-offset-4',
      },
      size: {
        default:  'h-10 px-[18px] text-[13.5px]',
        sm:       'h-8 px-3.5 text-[13px]',
        xs:       'h-7 px-3 text-[12.5px]',
        lg:       'h-12 px-5 text-[15px]',
        icon:     'h-9 w-9 text-ink-2',
        'icon-sm': 'h-8 w-8 text-ink-2',
      },
    },
    compoundVariants: [
      { variant: 'default', size: ['icon', 'icon-sm'], class: 'text-white' },
    ],
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

const Button = React.forwardRef(({ className, variant, size, type = 'button', ...props }, ref) => (
  <button ref={ref} type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
));
Button.displayName = 'Button';

export { Button, buttonVariants };
