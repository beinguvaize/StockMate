import React from 'react';
import Barcode from 'react-barcode';
import { barcodeFormat } from '../../lib/labelPrint';

/**
 * The print sheet: what Print hands to the popup, as innerHTML.
 *
 * Moved out of LabelPrinting unchanged so the redesign could restyle the
 * screen without touching a single label that comes out of the printer.
 * LabelSheet.test.jsx holds a verbatim copy of the old inline markup and
 * fails if this drifts from it by one attribute: label sizes, barcode values,
 * symbology, bar width and height, the "MRP" line and its tax note.
 *
 * KNOWN DEFECT, kept on purpose (owner decision pending): the price line is
 * the product's SELLING price printed as "MRP", with "Incl. of all taxes"
 * under it. MRP is a separate legal figure (Legal Metrology rules) and the
 * selling price may be below it or exclusive of tax. Not fixed here.
 */
export const fieldStyle = (fields, k) => ({ fontSize: `${fields[k].size}pt`, fontWeight: fields[k].bold ? 800 : 500 });

export function LabelCell({ p, fields, template, bizName }) {
  const fs = (k) => fieldStyle(fields, k);
  return (
    <div className="label">
      {fields.biz.on && bizName && <div className="biz" style={fs('biz')}>{bizName}</div>}
      {fields.name.on && <div className="name" style={fs('name')}>{p.name}</div>}
      {fields.sku.on && p.sku && <div className="sku" style={fs('sku')}>{p.sku}</div>}
      {p.barcode ? (
        <div className="bc">
          <Barcode
            value={p.barcode}
            format={barcodeFormat(p.barcode)}
            width={1}
            height={template.label.h >= 30 ? 34 : 22}
            fontSize={8}
            margin={0}
            displayValue
          />
        </div>
      ) : (
        <div className="sku">no barcode</div>
      )}
      {fields.price.on && (
        <div className="price" style={fs('price')}>MRP ₹{Number(p.sellingPrice || 0).toFixed(2)}</div>
      )}
      {fields.tax.on && <div className="tax" style={fs('tax')}>Incl. of all taxes</div>}
    </div>
  );
}

/** pages: paginate(cells, template), each cell { p, key }. */
export default function LabelSheet({ pages, fields, template, bizName }) {
  return (
    <>
      {pages.map((page, pi) => (
        <div className="sheet" key={pi}>
          {page.map(({ p, key }) => <LabelCell key={key} p={p} fields={fields} template={template} bizName={bizName} />)}
        </div>
      ))}
    </>
  );
}
