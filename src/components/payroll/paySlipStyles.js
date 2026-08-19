/**
 * Slip styling, kept out of the component so the same rules serve screen,
 * print, and the offline render that proves the layout still assembles. Plain
 * CSS rather than Tailwind: this is a fixed-size paper document measured in
 * millimetres, not a responsive screen.
 *
 * A6 landscape -- 210 x 74mm, four to an A4 sheet. A true quarter is 74.25mm,
 * and four of those is exactly 297mm: no slack at all, so sub-pixel rounding in
 * the renderer is enough to push the fourth slip onto a second page. 74mm
 * leaves 1mm across the sheet, which is invisible on paper and cannot round
 * the wrong way. At that
 * height a stacked layout cannot hold the content, so the slip runs in three
 * columns: identity, the money, and the totals rail. Type is small by design;
 * it is set in Plex at 6-9px, which is sharp on any 300dpi office printer, and
 * every figure is tabular so the columns still line up.
 */
const SHEET = `
  /* Owns its own box model. Without this the sheet is height + padding tall --
     82mm instead of 74.25mm -- and four of them overrun an A4 by 31mm, pushing
     the fourth slip onto a second page. It only looked right because Tailwind's
     preflight happens to set border-box globally in the app; the print stylesheet
     must not depend on a reset it does not ship with. Caught by measuring
     clientHeight in a browser, not by reading the CSS. */
  .payslip-sheet, .payslip-sheet *{box-sizing:border-box;}
  .payslip-sheet{
    --ps-ink:#0f1319; --ps-ink2:#6b7480; --ps-ink3:#98a1ac; --ps-hair:#e4e7ec;
    width:210mm; height:74mm; background:#fff; color:var(--ps-ink);
    padding:4.5mm 6mm 3.5mm; display:flex; flex-direction:column;
    font-family:"IBM Plex Sans",ui-sans-serif,system-ui,sans-serif;
    -webkit-font-smoothing:antialiased; overflow:hidden;
  }
  .payslip-sheet .ps-mono,.payslip-sheet .ps-a,.payslip-sheet .ps-net-a,
  .payslip-sheet .ps-mtd-big{
    font-family:"IBM Plex Mono",ui-monospace,monospace;font-variant-numeric:tabular-nums;
  }

  /* band 1 — masthead */
  .ps-mast{display:flex;justify-content:space-between;align-items:baseline;gap:6mm;}
  .ps-co{font-size:9.5px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;
         white-space:nowrap;}
  .ps-co-sub{font-size:6px;color:var(--ps-ink2);margin-top:1px;line-height:1.35;}
  .ps-doc{text-align:right;white-space:nowrap;}
  .ps-doc-t{font-size:6px;letter-spacing:.2em;text-transform:uppercase;color:var(--ps-ink3);}
  .ps-doc-p{font-size:9.5px;font-weight:600;margin-top:.5px;}
  .ps-hr{height:.8px;background:var(--ps-ink);margin-top:2mm;}

  /* band 2 — three columns */
  .ps-body{display:grid;grid-template-columns:52mm 1fr 46mm;gap:5mm;flex:1;min-height:0;
           padding-top:2.2mm;}
  .ps-col-sep{border-left:1px solid var(--ps-hair);padding-left:5mm;}

  .ps-nmrow{display:flex;align-items:baseline;gap:2.5mm;}
  .ps-nm{font-size:11px;font-weight:600;letter-spacing:-.012em;line-height:1.1;}
  /* The employee number reads as an identifier, not as part of the name. */
  .ps-code{font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:6.5px;
           letter-spacing:.06em;color:var(--ps-ink2);border:.7px solid var(--ps-hair);
           padding:.3mm 1.1mm;border-radius:1px;white-space:nowrap;}
  .ps-rl{font-size:6.5px;color:var(--ps-ink2);margin-top:1px;line-height:1.35;}
  .ps-ids{margin-top:1.8mm;display:grid;grid-template-columns:auto 1fr;gap:.6mm 2.5mm;
          font-size:6.5px;line-height:1.3;}
  .ps-ids dt{color:var(--ps-ink3);white-space:nowrap;}
  .ps-ids dd{margin:0;font-weight:500;}

  /* the money column */
  .ps-sec-h{font-size:5.5px;letter-spacing:.15em;text-transform:uppercase;color:var(--ps-ink3);
            border-bottom:1px solid var(--ps-hair);padding-bottom:.6mm;}
  .ps-sec + .ps-sec{margin-top:1.6mm;}
  .ps-ln{display:flex;justify-content:space-between;align-items:baseline;gap:5px;
         padding:.85mm 0;font-size:7.5px;line-height:1.25;}
  .ps-d{color:var(--ps-ink3);font-size:6px;}
  .ps-a{font-weight:450;white-space:nowrap;}
  .ps-sum{border-top:1px solid var(--ps-hair);font-weight:600;padding-top:.9mm;}
  .ps-none{color:var(--ps-ink3);font-style:italic;}

  /* totals rail */
  .ps-rail{display:flex;flex-direction:column;}
  .ps-net{border-top:1.6px solid var(--ps-ink);padding-top:1.4mm;}
  .ps-net-k{font-size:5.5px;letter-spacing:.15em;text-transform:uppercase;color:var(--ps-ink2);}
  .ps-net-a{font-weight:500;font-size:17px;letter-spacing:-.02em;line-height:1;margin-top:.7mm;}
  .ps-net-w{font-size:6px;color:var(--ps-ink2);margin-top:1mm;line-height:1.3;font-style:italic;}
  .ps-mtd{margin-top:auto;background:#f5f6f8;padding:1.3mm 1.8mm;}
  .ps-mtd-k{font-size:5.5px;letter-spacing:.13em;text-transform:uppercase;color:var(--ps-ink3);}
  .ps-mtd-row{display:flex;justify-content:space-between;align-items:baseline;margin-top:.5mm;}
  .ps-mtd-big{font-weight:500;font-size:9.5px;}
  .ps-mtd-d{font-size:6px;color:var(--ps-ink2);}
  .ps-mtd-n{font-size:5.5px;color:var(--ps-ink3);margin-top:.4mm;line-height:1.3;}
  .ps-plist{margin-top:.6mm;}
  .ps-pln{display:flex;justify-content:space-between;gap:4px;font-size:6px;line-height:1.5;
          color:var(--ps-ink2);}
  .ps-mtd-tot{border-top:1px solid #dcdfe4;margin-top:.9mm;padding-top:.7mm;}

  /* nil */
  .ps-nil{grid-column:2 / span 2;display:flex;flex-direction:column;align-items:center;
          justify-content:center;text-align:center;background:#f5f6f8;padding:2mm;}
  .ps-nil-h{font-size:9px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;
            color:var(--ps-ink2);}
  .ps-nil p{margin:1mm 6mm 0;font-size:6.5px;line-height:1.45;color:var(--ps-ink2);}

  .ps-warn{margin-top:1.2mm;border:.8px solid var(--ps-ink);padding:1mm 1.6mm;font-size:6px;}

  /* band 3 — foot */
  .ps-foot{display:flex;justify-content:space-between;align-items:flex-end;gap:6mm;
           margin-top:2mm;padding-top:1.4mm;border-top:1px solid var(--ps-hair);}
  .ps-gen{font-size:5.5px;color:var(--ps-ink3);line-height:1.4;}
  .ps-sigs{display:flex;gap:9mm;}
  .ps-sigs div{width:33mm;border-top:.8px solid var(--ps-ink2);padding-top:.6mm;font-size:5.5px;
               color:var(--ps-ink3);text-align:center;letter-spacing:.04em;}
`;

export const SLIP_CSS = {
  screen: `${SHEET}
    .payslip-sheet{margin:0 auto 10px;box-shadow:0 12px 30px -14px rgba(15,19,25,.5);}
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
    /* Four slips to an A4 sheet, cut into quarters. The break falls after every
       fourth slip -- never mid-slip, and never a trailing blank page. */
    .payslip-sheet{margin:0!important;box-shadow:none!important;
      break-inside:avoid;page-break-inside:avoid;}
    .payslip-sheet:nth-of-type(4n){break-after:page;page-break-after:always;}
    .payslip-sheet:last-of-type{break-after:auto;page-break-after:auto;}
  }`,
};

export default SLIP_CSS;
