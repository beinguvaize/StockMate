import React from 'react';
import { Link } from 'react-router-dom';
import { Download, FileSpreadsheet, FileCode2, Database, ChevronRight } from 'lucide-react';
import { buttonVariants } from '../../components/ui/button';
import { PanelHead, Stack, SCard } from './parts';
import { cn } from '../../lib/utils';

/**
 * Data tools (approved settings-12): what the Data tools page does, and the
 * way to the backup page, which until now was reachable only by typing
 * /backup. Both are links; nothing runs from here.
 */
const ROWS = [
  [Download, 'Export data', 'One list at a time, as CSV or JSON'],
  [FileSpreadsheet, 'Bulk import from Excel', 'Owner only'],
  [FileCode2, 'Export to Tally', 'Owner only. Vouchers for a date range'],
];

export default function DataPanel() {
  return (
    <div>
      <PanelHead title="Data tools" sub="Import, export and Tally." />
      <Stack>
        <SCard title="Data import and export" sub="Bring existing records in, or take a copy out as CSV or JSON. Products, clients, sales, expenses and employees."
          footer={<Link to="/data-tools" className={cn(buttonVariants({ variant: 'dark', size: 'sm' }))}>Open data tools<ChevronRight aria-hidden="true" /></Link>}>
          {ROWS.map(([Icon, t, s]) => (
            <div key={t} className="flex items-center gap-3 border-t border-sep py-3 first:border-t-0">
              <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[10px] bg-tile text-ink-2"><Icon size={16} aria-hidden="true" /></span>
              <div className="min-w-0">
                <b className="block font-tight text-[13.5px] font-semibold text-ink">{t}</b>
                <small className="block text-[12px] text-mute">{s}</small>
              </div>
            </div>
          ))}
        </SCard>
        <SCard pad title="Backup and restore" sub="A full copy of the shop, in a file you keep, and the way back to it."
          footer={<Link to="/backup" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}><Database aria-hidden="true" />Open backup and restore</Link>}>
          <p className="text-[13px] text-mute">Owner only. Restoring replaces the shop's data with the file's, so it asks you to type the shop's name first.</p>
        </SCard>
      </Stack>
    </div>
  );
}
