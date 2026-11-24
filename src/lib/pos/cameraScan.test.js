import { describe, it, expect } from 'vitest';
import {
  cameraScanSupported, cameraScanUnavailableReason, supportedFormats,
  createScanGate, SCAN_FORMATS,
} from './cameraScan.js';

/**
 * Camera scanning: can we, and should we believe what we read?
 * ==========================================================================
 *
 * The camera itself cannot be tested here. What can — and what actually
 * decides whether this is safe at a till — is the capability check (so the
 * button is not offered where it cannot work) and the confirmation gate (so a
 * single bad frame does not put the wrong item on a bill).
 */

const win = (over = {}) => ({
  isSecureContext: true,
  navigator: { mediaDevices: { getUserMedia: () => {} } },
  BarcodeDetector: function BarcodeDetector() {},
  ...over,
});

describe('whether the camera can scan here', () => {
  it('is available with both a detector and a camera', () => {
    expect(cameraScanSupported(win())).toBe(true);
    expect(cameraScanUnavailableReason(win())).toBeNull();
  });

  it('is unavailable without BarcodeDetector, and names the way out', () => {
    const w = win({ BarcodeDetector: undefined });
    expect(cameraScanSupported(w)).toBe(false);
    // A cashier can act on this; "unsupported" alone is not a fix.
    expect(cameraScanUnavailableReason(w)).toMatch(/USB scanner|Chrome/i);
  });

  it('blames http rather than the browser when that is the cause', () => {
    // By far the most common cause in the field, and the only one with a
    // concrete fix the shop can apply.
    const w = win({ isSecureContext: false, navigator: { mediaDevices: undefined } });
    expect(cameraScanUnavailableReason(w)).toMatch(/https/i);
  });

  it('does not claim support with no window at all', () => {
    expect(cameraScanSupported(undefined)).toBe(false);
  });
});

describe('which symbologies are asked for', () => {
  it('asks only for formats the browser admits to', async () => {
    const w = win({
      BarcodeDetector: Object.assign(function () {}, {
        getSupportedFormats: async () => ['ean_13', 'qr_code'],
      }),
    });
    expect(await supportedFormats(w)).toEqual(['ean_13']);
  });

  it('falls back to the full list when the browser will not say', async () => {
    // A detector that cannot be interrogated is still worth trying; passing
    // it our list is better than refusing to scan.
    const w = win({
      BarcodeDetector: Object.assign(function () {}, {
        getSupportedFormats: async () => { throw new Error('nope'); },
      }),
    });
    expect(await supportedFormats(w)).toEqual(SCAN_FORMATS);
  });

  it('leaves out the symbologies that misread', () => {
    // ITF and CODABAR are prone to partial reads. A misread barcode at a till
    // is a wrong item on a bill, which is worse than a scan that does not take.
    expect(SCAN_FORMATS).not.toContain('itf');
    expect(SCAN_FORMATS).not.toContain('codabar');
    // The ones a shop actually buys and prints.
    expect(SCAN_FORMATS).toEqual(expect.arrayContaining(['ean_13', 'upc_a', 'code_128']));
  });
});

describe('the confirmation gate', () => {
  it('ignores a code seen only once', () => {
    // A camera decodes every frame. One angled or half-lit read can produce a
    // plausible wrong number; two agreeing reads cost about 100ms.
    const gate = createScanGate();
    expect(gate.offer('8901234567890')).toBeNull();
  });

  it('accepts a code seen twice in a row', () => {
    const gate = createScanGate();
    gate.offer('8901234567890');
    expect(gate.offer('8901234567890')).toBe('8901234567890');
  });

  it('restarts counting when a different code interrupts', () => {
    const gate = createScanGate();
    gate.offer('111');
    gate.offer('222');          // a different read breaks the run
    expect(gate.offer('111')).toBeNull();
    expect(gate.offer('111')).toBe('111');
  });

  it('does not re-fire the same code forever once accepted', () => {
    // After a hit the run resets, so holding the camera still adds the item
    // once and then needs two fresh frames — not one line per frame.
    const gate = createScanGate();
    gate.offer('555');
    expect(gate.offer('555')).toBe('555');
    expect(gate.offer('555')).toBeNull();
  });

  it('ignores blank reads', () => {
    const gate = createScanGate();
    expect(gate.offer('')).toBeNull();
    expect(gate.offer(null)).toBeNull();
    expect(gate.offer('  ')).toBeNull();
  });
});
