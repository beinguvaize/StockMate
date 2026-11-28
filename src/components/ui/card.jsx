import React from 'react';
import { cn } from '../../lib/utils';

/**
 * Card set, web redesign: white, 1px hairline, 14px corners, no shadow.
 * CardHeader lays the title on the left and an optional `aside` (legend,
 * "Last 7 days", a link) on the right, as every dashboard card does.
 */
const Card = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('rounded-[14px] border border-line bg-surface text-ink px-5 py-[18px]', className)} {...props} />
));
Card.displayName = 'Card';

const CardHeader = React.forwardRef(({ className, title, aside, children, ...props }, ref) => (
  <div ref={ref} className={cn('flex items-center justify-between gap-3 min-w-0', className)} {...props}>
    {title !== undefined ? <CardTitle>{title}</CardTitle> : null}
    {children}
    {aside !== undefined && aside !== null ? <div className="flex items-center gap-3.5 shrink-0 text-[12.5px] text-mute">{aside}</div> : null}
  </div>
));
CardHeader.displayName = 'CardHeader';

const CardTitle = React.forwardRef(({ className, as: Tag = 'h3', ...props }, ref) => (
  <Tag ref={ref} className={cn('font-tight text-[15px] font-semibold leading-tight text-ink truncate', className)} {...props} />
));
CardTitle.displayName = 'CardTitle';

const CardDescription = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('text-[12.5px] text-mute', className)} {...props} />
));
CardDescription.displayName = 'CardDescription';

const CardContent = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('mt-3.5', className)} {...props} />
));
CardContent.displayName = 'CardContent';

/** The ruled strip at the bottom of a list card: count on the left, a link or total on the right. */
const CardFooter = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('flex items-center justify-between gap-3 pt-3 mt-0.5 border-t border-line text-[12.5px] text-mute', className)} {...props} />
));
CardFooter.displayName = 'CardFooter';

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter };
