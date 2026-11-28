import React from 'react';
import { ChevronLeft, History } from 'lucide-react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Eyebrow } from '../ui/FigureStrip';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../ui/table';
import { Tile, Tiles, Box, money } from './parts';
import { historySummary, historyRows, dayLabel } from '../../lib/dayBookView';

/** Day Book History (mockup daybook-07). Clicking a day opens its ledger. */
export default function DayBookHistory({ dayBook, cy, today, selectedDate, onBack, onPick }) {
  const s = historySummary(dayBook);
  const rows = historyRows(dayBook, { today, selectedDate });
  const dash = <span className="text-faint">—</span>;
  const amt = (v) => (v == null ? dash : money(v, cy, { signed: true }));

  return (
    <div className="flex flex-col pb-16">
      <div className="m-rise mb-4 flex items-start gap-3">
        <Button variant="outline" size="icon" aria-label="Back to the Day Book" onClick={onBack}><ChevronLeft /></Button>
        <div className="min-w-0 flex-1">
          <h2 className="font-tight text-[22px] font-semibold leading-[1.15] tracking-[-0.02em]">Day Book History</h2>
          <p className="mt-[3px] text-[13px] text-body">Click any day to view its ledger</p>
        </div>
        <Eyebrow className="mt-2">{s.totalDays} records</Eyebrow>
      </div>

      <Tiles className="m-rise" style={{ '--i': 1 }}>
        <Tile label="Total Days" value={s.totalDays}
          sub={`${s.closedDays} closed · ${s.discrepDays > 0 ? `${s.discrepDays} discrepancies` : 'no discrepancies'}`} />
        <Tile label="All-Time Sales" tone="pos" value={money(s.totalSales, cy)} />
        <Tile label="All-Time Expenses" tone="neg" value={money(s.totalExp, cy)} />
        <Tile label="Net Flow" tone={s.net < 0 ? 'deficit' : 'dark'} value={money(s.net, cy, { signed: true })} />
      </Tiles>

      <Box className="m-rise" style={{ '--i': 2 }} title="All Days" icon={History} flush>
        {rows.length === 0 ? (
          <div className="border-t border-line px-5 py-14 text-center">
            <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-[14px] bg-tile text-mute"><History size={22} strokeWidth={1.8} /></div>
            <Eyebrow>No history yet</Eyebrow>
          </div>
        ) : (
          <Table wrapperClassName="border-t border-line">
            <TableHeader className="[&_th]:bg-tile [&_th]:whitespace-nowrap">
              <tr>
                <TableHead>Date</TableHead>
                <TableHead numeric>Opening</TableHead>
                <TableHead numeric>Sales</TableHead>
                <TableHead numeric>Expenses</TableHead>
                <TableHead numeric>Closing</TableHead>
                <TableHead numeric>Net</TableHead>
                <TableHead numeric>Discrepancy</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Closed At</TableHead>
              </tr>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.key} onClick={() => onPick(r.date)} data-state={r.isSelected ? 'selected' : undefined}
                  className="cursor-pointer" tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter') onPick(r.date); }}>
                  <TableCell className="whitespace-nowrap">
                    <b className="font-tight font-semibold">{dayLabel(r.date, { year: false })}</b>
                    {r.isToday && <Badge tone="warn" className="ml-1.5 px-[7px] py-0.5 text-[10.5px]">Today</Badge>}
                    {r.isSelected && !r.isToday && <Badge tone="neutral" className="ml-1.5 px-[7px] py-0.5 text-[10.5px]">Viewing</Badge>}
                  </TableCell>
                  <TableCell numeric className="whitespace-nowrap">{amt(r.opening)}</TableCell>
                  <TableCell numeric className="whitespace-nowrap">{amt(r.sales)}</TableCell>
                  <TableCell numeric className="whitespace-nowrap">{amt(r.expenses)}</TableCell>
                  <TableCell numeric className="whitespace-nowrap"><span className={r.closing < 0 ? 'text-bad-text' : ''}>{amt(r.closing)}</span></TableCell>
                  <TableCell numeric className="whitespace-nowrap">
                    {r.net == null ? dash : <span className={r.net < 0 ? 'text-bad-text' : 'text-good-text'}>{r.net < 0 ? '−' : '+'}{money(Math.abs(r.net), cy)}</span>}
                  </TableCell>
                  <TableCell numeric className="whitespace-nowrap">
                    {r.variance == null ? dash
                      : !r.hasDiscrep ? <span className="text-good-text">Balanced</span>
                        : <span className={r.variance > 0 ? 'text-info-text' : 'text-bad-text'}>{r.variance > 0 ? '+' : '−'}{money(Math.abs(r.variance), cy)}</span>}
                  </TableCell>
                  <TableCell>{r.isClosed ? <Badge tone="good">Closed</Badge> : <Badge tone="warn">Open</Badge>}</TableCell>
                  <TableCell className="whitespace-nowrap text-body">{r.closedAt || dash}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Box>
    </div>
  );
}
