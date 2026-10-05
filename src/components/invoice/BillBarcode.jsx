import React from 'react';
import Barcode from 'react-barcode';

/**
 * The bill's own number, as a barcode.
 *
 * A printed bill that comes back over the counter — a return, a part payment, a
 * "what did I buy last Tuesday" — has to be found again, and the only handle on
 * it is a number someone reads off paper and keys in. The scanner at that
 * counter is already there for products.
 *
 * CODE128, not EAN-13. An invoice number is `INV-0163` or a sale id's tail:
 * alphanumeric, variable length, and not a product code. EAN-13 would refuse it
 * — react-barcode draws nothing at all when a value does not fit the symbology,
 * which is a blank space on a bill rather than an error anybody sees. CODE128
 * encodes any of it.
 *
 * Rendered as inline SVG so it survives the print pipeline: the receipt and the
 * A4 invoice are both printed by writing markup into a popup, where an <img>
 * with a blob URL may not have loaded by the time print() fires.
 */
const BillBarcode = ({
  value,
  width = 1.6,      // bar width in px — 1.6 keeps 80mm thermal legible
  height = 38,
  fontSize = 10,
  className = '',
}) => {
  const text = String(value ?? '').trim();
  // Nothing to encode is not an error: a quotation or an unsaved draft has no
  // number yet, and a bill should print without one rather than not print.
  if (!text) return null;

  return (
    <div className={`flex justify-center ${className}`} aria-hidden="true">
      <Barcode
        value={text}
        format="CODE128"
        width={width}
        height={height}
        fontSize={fontSize}
        margin={0}
        displayValue
        background="#ffffff"
        lineColor="#000000"
      />
    </div>
  );
};

export default BillBarcode;
