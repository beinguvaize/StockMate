import React from 'react';
import { cn } from '../../lib/utils';

/** Table set, web redesign: open rows, hairline separators, Inter Tight
 *  heads in the mute grey, tile hover. tabular-nums on cells — money columns
 *  must align (accounting app). Put `numeric` on a head/cell to right-align
 *  it in Inter Tight. */
const Table = React.forwardRef(({ className, wrapperClassName, ...props }, ref) => (
  <div className={cn('relative w-full overflow-x-auto', wrapperClassName)}>
    <table ref={ref} className={cn('w-full border-collapse text-[13.5px] text-ink', className)} {...props} />
  </div>
));
Table.displayName = 'Table';

const TableHeader = React.forwardRef(({ className, ...props }, ref) => (
  <thead ref={ref} className={className} {...props} />
));
TableHeader.displayName = 'TableHeader';

const TableBody = React.forwardRef(({ className, ...props }, ref) => (
  <tbody ref={ref} className={cn('[&_tr:last-child>td]:border-b-0', className)} {...props} />
));
TableBody.displayName = 'TableBody';

const TableFooter = React.forwardRef(({ className, ...props }, ref) => (
  <tfoot ref={ref} className={cn('border-t border-line font-tight font-semibold', className)} {...props} />
));
TableFooter.displayName = 'TableFooter';

const TableRow = React.forwardRef(({ className, ...props }, ref) => (
  <tr ref={ref} className={cn('group/row [&>td]:transition-colors [&>td]:duration-(--dur-press) hover:[&>td]:bg-tile data-[state=selected]:[&>td]:bg-amber-soft', className)} {...props} />
));
TableRow.displayName = 'TableRow';

const TableHead = React.forwardRef(({ className, numeric, ...props }, ref) => (
  <th ref={ref} className={cn('px-3.5 py-2.5 text-left align-middle font-tight text-[12px] font-semibold text-mute border-b border-line', numeric && 'text-right', className)} {...props} />
));
TableHead.displayName = 'TableHead';

const TableCell = React.forwardRef(({ className, numeric, ...props }, ref) => (
  <td ref={ref} className={cn('px-3.5 py-[11px] align-middle tabular-nums border-b border-sep', numeric && 'text-right font-tight font-medium', className)} {...props} />
));
TableCell.displayName = 'TableCell';

export { Table, TableHeader, TableBody, TableFooter, TableRow, TableHead, TableCell };
