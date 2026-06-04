// R3 KOT — print a kitchen ticket (thermal-slip style), grouped by station.
import { groupByStation } from '../hooks/useKOT';

const foodMark = (t) =>
  t === 'VEG' ? '🟢' : t === 'NONVEG' ? '🔴' : t === 'EGG' ? '🟡' : '';

export function printKOT(ticket) {
  const groups = groupByStation(ticket.items);
  const when = new Date(ticket.created_at || Date.now()).toLocaleString('en-IN', {
    hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short',
  });

  const sections = Object.entries(groups).map(([station, items]) => `
    <div class="station">${station}</div>
    ${items.map(it => `
      <div class="row">
        <span class="qty">${it.quantity}×</span>
        <span class="name">${foodMark(it.food_type)} ${it.name}</span>
      </div>
      ${it.notes ? `<div class="note">↳ ${it.notes}</div>` : ''}
    `).join('')}
  `).join('');

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>KOT #${ticket.ticket_no}</title>
  <style>
    @page { size: 80mm auto; margin: 4mm; }
    * { font-family: 'Courier New', monospace; }
    body { width: 72mm; margin: 0; color: #000; }
    .hd { text-align:center; border-bottom:2px dashed #000; padding-bottom:6px; margin-bottom:6px; }
    .hd .t { font-size: 20px; font-weight: 800; }
    .hd .m { font-size: 12px; }
    .station { font-weight:800; text-transform:uppercase; font-size:12px; margin:8px 0 2px; border-bottom:1px solid #000; }
    .row { display:flex; gap:8px; font-size:15px; font-weight:700; padding:2px 0; }
    .qty { min-width:28px; }
    .note { font-size:12px; font-style:italic; padding-left:36px; }
    .ft { text-align:center; border-top:2px dashed #000; margin-top:8px; padding-top:4px; font-size:11px; }
  </style></head>
  <body>
    <div class="hd">
      <div class="t">KOT #${ticket.ticket_no}</div>
      <div class="m">${ticket.table_label ? 'Table ' + ticket.table_label : 'Counter'} · ${when}</div>
    </div>
    ${sections}
    <div class="ft">** KITCHEN COPY **</div>
    <script>window.onload=function(){window.print();setTimeout(function(){window.close();},300);};</script>
  </body></html>`;

  const w = window.open('', '_blank', 'width=380,height=600');
  if (!w) return false;
  w.document.write(html);
  w.document.close();
  return true;
}
