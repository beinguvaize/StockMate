/**
 * Scanning with the camera, where there is no scanner gun.
 * ==========================================================================
 *
 * The POS search box has always accepted a scan, because a USB or Bluetooth
 * scanner is a keyboard: it types the code and presses Enter. On a phone or a
 * tablet at the counter there is no such keyboard, and the barcode icon beside
 * the box was `pointer-events-none` -- it looked like a button and was
 * decoration.
 *
 * WHY NO LIBRARY
 *
 * The browser can do this. BarcodeDetector is native in Chrome, Edge and
 * Android WebView, which is what the counter tablets in this market run. A
 * JS decoder (ZXing, Quagga) would add roughly 200 KB to the bundle that every
 * desktop till downloads and never uses, to serve Safari -- so this uses the
 * native API and says plainly when it is unavailable rather than opening a
 * camera that cannot read anything.
 *
 * The capability check and the format list are here, apart from the React, so
 * they can be tested without a camera.
 */

/**
 * The symbologies a shop actually prints and buys.
 *
 * EAN-13 and UPC-A are what manufacturers put on packaged goods; EAN-8 is the
 * small-pack form; CODE128 and CODE39 are what this app's own label printer
 * produces (see lib/labelPrint.js) and what weighing scales emit. ITF and
 * CODABAR are deliberately absent: they are prone to partial reads, and a
 * misread barcode at a till is a wrong item on a bill.
 */
export const SCAN_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39'];

/** Is camera scanning possible in this browser at all? */
export function cameraScanSupported(win = typeof window !== 'undefined' ? window : undefined) {
  if (!win) return false;
  const hasDetector = typeof win.BarcodeDetector === 'function';
  const hasCamera = !!win.navigator?.mediaDevices?.getUserMedia;
  return hasDetector && hasCamera;
}

/**
 * Why it is not available, in words a shopkeeper can act on.
 *
 * Returns null when it IS available. Never "unsupported" alone: the fix is
 * different for each cause and the cashier is the one who has to apply it.
 */
export function cameraScanUnavailableReason(win = typeof window !== 'undefined' ? window : undefined) {
  if (!win) return 'Camera scanning needs a browser.';
  if (!win.navigator?.mediaDevices?.getUserMedia) {
    // The usual cause by far, and the one with a concrete fix.
    const insecure = win.isSecureContext === false;
    return insecure
      ? 'Camera scanning needs a secure (https) connection.'
      : 'This browser will not share the camera with the app.';
  }
  if (typeof win.BarcodeDetector !== 'function') {
    return 'This browser cannot read barcodes. Chrome on Android, or a USB scanner, will work.';
  }
  return null;
}

/**
 * Which of our formats this browser will actually decode.
 *
 * Asked rather than assumed: a browser that has BarcodeDetector does not
 * necessarily support every symbology, and passing it one it does not know
 * throws instead of degrading. Falls back to the full list if the query
 * itself fails, because a detector that cannot be interrogated is still worth
 * trying.
 */
export async function supportedFormats(win = typeof window !== 'undefined' ? window : undefined) {
  try {
    const all = await win.BarcodeDetector.getSupportedFormats();
    const usable = SCAN_FORMATS.filter((f) => all.includes(f));
    return usable.length ? usable : SCAN_FORMATS;
  } catch {
    return SCAN_FORMATS;
  }
}

/**
 * Accept a code only when the same value is read twice in a row.
 *
 * A camera frame is not a scanner trigger: it decodes continuously, and a
 * partially-lit or angled barcode can decode to something plausible for one
 * frame. Two agreeing reads costs about 100ms and is the difference between
 * scanning an item and billing a different one.
 *
 * Stateful by design, one per open scanner.
 */
export function createScanGate({ confirmations = 2 } = {}) {
  let last = null;
  let count = 0;
  return {
    /** Returns the code once it is confirmed, else null. */
    offer(code) {
      const v = String(code ?? '').trim();
      if (!v) return null;
      if (v === last) count += 1;
      else { last = v; count = 1; }
      if (count >= confirmations) {
        last = null;
        count = 0;
        return v;
      }
      return null;
    },
    reset() { last = null; count = 0; },
  };
}
