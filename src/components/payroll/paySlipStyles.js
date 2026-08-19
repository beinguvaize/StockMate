/**
 * Slip styling, kept out of the component so the same rules render on screen,
 * on paper, and in the offline snapshot test that proves the layout still
 * assembles. Plain CSS rather than Tailwind: this is a fixed-size paper
 * document in millimetres, not a responsive screen.
 */
const SHEET = `
  .payslip-sheet{
    --ps-ink:#0f1319; --ps-ink2:#6b7480; --ps-ink3:#98a1ac; --ps-hair:#e4e7ec;
    width:210mm; height:148.5mm; background:#fff; color:var(--ps-ink);
    padding:11mm 12mm 8mm; display:flex; flex-direction:column;
    font-family:"IBM Plex Sans",ui-sans-serif,system-ui,sans-serif;
    -webkit-font-smoothing:antialiased;
  }
  .payslip-sheet .ps-mono,
  .payslip-sheet .ps-a,
  .payslip-sheet .ps-net-a,
  .payslip-sheet .ps-mtd-big{
    font-family:"IBM Plex Mono",ui-monospace,monospace;
    font-variant-numeric:tabular-nums;
  }

  .ps-mast{display:flex;justify-content:space-between;align-items:flex-start;}
  .ps-co{font-size:13px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;}
  .ps-co-sub{font-size:8px;color:var(--ps-ink2);margin-top:3px;line-height:1.5;}
  .ps-doc{text-align:right;}
  .ps-doc-t{font-size:8px;letter-spacing:.22em;text-transform:uppercase;color:var(--ps-ink2);}
  .ps-doc-p{font-size:14px;font-weight:600;margin-top:2px;letter-spacing:-.01em;}
  .ps-hr{height:1px;background:var(--ps-ink);margin-top:5mm;}

  .ps-who{display:flex;justify-content:space-between;align-items:flex-end;padding:4mm 0 4.5mm;}
  .ps-nm{font-size:16px;font-weight:600;letter-spacing:-.015em;line-height:1.1;}
  .ps-rl{font-size:9px;color:var(--ps-ink2);margin-top:3px;}
  .ps-facts{display:flex;gap:9mm;text-align:right;}
  .ps-fact-k{font-size:7px;letter-spacing:.13em;text-transform:uppercase;color:var(--ps-ink3);}
  .ps-fact-v{font-size:9.5px;font-weight:500;margin-top:2px;}

  .ps-body{display:grid;grid-template-columns:1fr 62mm;gap:9mm;flex:1;min-height:0;}
  .ps-sec + .ps-sec{margin-top:4.5mm;}
  .ps-sec-h{font-size:7px;letter-spacing:.16em;text-transform:uppercase;color:var(--ps-ink3);
            padding-bottom:2mm;border-bottom:1px solid var(--ps-hair);}
  .ps-ln{display:flex;justify-content:space-between;align-items:baseline;gap:8px;
         padding:2.6mm 0;border-bottom:1px solid var(--ps-hair);font-size:10.5px;}
  .ps-d{font-size:8px;color:var(--ps-ink3);margin-top:1.5px;}
  .ps-a{font-weight:450;white-space:nowrap;}
  .ps-sum{border-bottom:0;padding-top:2.4mm;font-weight:600;}
  .ps-sum .ps-a{font-weight:500;}
  .ps-none{color:var(--ps-ink3);font-style:italic;}

  .ps-rail{display:flex;flex-direction:column;}
  .ps-net{border-top:2px solid var(--ps-ink);padding-top:3mm;}
  .ps-net-k{font-size:7px;letter-spacing:.16em;text-transform:uppercase;color:var(--ps-ink2);}
  .ps-net-a{font-weight:500;font-size:27px;letter-spacing:-.02em;margin-top:1.5mm;line-height:1;}
  .ps-net-w{font-size:8px;color:var(--ps-ink2);margin-top:2.5mm;line-height:1.45;font-style:italic;}

  .ps-mtd{margin-top:auto;background:#f7f8fa;padding:3mm 3.5mm;}
  .ps-mtd-k{font-size:7px;letter-spacing:.14em;text-transform:uppercase;color:var(--ps-ink3);}
  .ps-mtd-row{display:flex;justify-content:space-between;align-items:baseline;margin-top:2mm;}
  .ps-mtd-big{font-weight:500;font-size:14px;letter-spacing:-.01em;}
  .ps-mtd-d{font-size:8px;color:var(--ps-ink2);}
  .ps-mtd-n{font-size:7.5px;color:var(--ps-ink3);margin-top:1.5mm;}

  .ps-nil{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;
          text-align:center;background:#f7f8fa;padding:6mm;}
  .ps-nil-h{font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;
            color:var(--ps-ink2);}
  .ps-nil p{margin:5px 14mm 0;font-size:9px;line-height:1.55;color:var(--ps-ink2);}

  .ps-warn{margin-top:3mm;border:1px solid var(--ps-ink);padding:2mm 3mm;font-size:8.5px;}

  .ps-foot{display:flex;justify-content:space-between;align-items:flex-end;
           margin-top:5mm;padding-top:3mm;border-top:1px solid var(--ps-hair);}
  .ps-gen{font-size:6.5px;color:var(--ps-ink3);line-height:1.5;}
  .ps-sigs{display:flex;gap:16mm;}
  .ps-sigs div{width:40mm;border-top:1px solid var(--ps-ink2);padding-top:2px;font-size:7px;
               color:var(--ps-ink3);text-align:center;letter-spacing:.05em;}
`;

export const SLIP_CSS = {
  screen: `${SHEET}
    .payslip-sheet{margin:0 auto 18px;box-shadow:0 18px 44px -20px rgba(15,19,25,.5);}
  `,
  print: `@media print{
    @page{size:A4 portrait;margin:0;}
    html,body{background:#fff!important;margin:0!important;padding:0!important;
      -webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;}
    body > *:not(#payslip-portal){display:none!important;}
    #payslip-portal{position:static!important;background:#fff!important;overflow:visible!important;
      display:block!important;padding:0!important;margin:0!important;height:auto!important;}
    #payslip-portal .print-hidden{display:none!important;}
    ${SHEET}
    /* Two slips to an A4 sheet, cut across the middle. A page break every
       second slip -- never mid-slip, and never a trailing blank page. */
    .payslip-sheet{margin:0!important;box-shadow:none!important;
      break-inside:avoid;page-break-inside:avoid;}
    .payslip-sheet:nth-of-type(even){break-after:page;page-break-after:always;}
    .payslip-sheet:last-of-type{break-after:auto;page-break-after:auto;}
  }`,
};

export default SLIP_CSS;
