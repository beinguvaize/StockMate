import React, { useEffect, useRef, useState } from 'react';
import { X, ScanBarcode } from 'lucide-react';
import {
  cameraScanSupported, cameraScanUnavailableReason, supportedFormats, createScanGate,
} from '../../lib/pos/cameraScan';

/**
 * The camera, as a scanner.
 *
 * Opens the back camera, decodes continuously, and hands the first CONFIRMED
 * code back to the caller — which then does exactly what a typed-and-Entered
 * code does. The two paths share the commit, so a scan and a keystroke can
 * never resolve to different products.
 *
 * It stays open after a hit. A counter scans a basket, not an item: closing
 * after one would make the cashier reopen it per line, which is slower than
 * typing and would get it switched off.
 */
const ScanSheet = ({ open, onClose, onCode }) => {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [error, setError] = useState(null);
  const [lastHit, setLastHit] = useState(null);

  useEffect(() => {
    if (!open) return undefined;

    let cancelled = false;
    let raf = null;
    const gate = createScanGate();

    const stop = () => {
      cancelled = true;
      if (raf) cancelAnimationFrame(raf);
      // Release the camera. Without this the light stays on after close,
      // which users read -- correctly -- as the app still watching them.
      streamRef.current?.getTracks?.().forEach((t) => t.stop());
      streamRef.current = null;
    };

    (async () => {
      const why = cameraScanUnavailableReason();
      if (why) { setError(why); return; }

      try {
        const formats = await supportedFormats();
        const detector = new window.BarcodeDetector({ formats });

        const stream = await navigator.mediaDevices.getUserMedia({
          // The back camera, and a resolution high enough to resolve the thin
          // bars of an EAN-13 at arm's length.
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }

        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        video.setAttribute('playsinline', 'true');   // iOS: don't go fullscreen
        await video.play().catch(() => {});

        const tick = async () => {
          if (cancelled) return;
          try {
            const found = await detector.detect(video);
            for (const b of found) {
              const confirmed = gate.offer(b.rawValue);
              if (confirmed) {
                setLastHit(confirmed);
                onCode(confirmed);
                break;
              }
            }
          } catch {
            // One bad frame is not a failure; the next one usually decodes.
          }
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      } catch (err) {
        // Say which of these it is. "Camera could not start: Not supported" is
        // what the browser offers and tells a shopkeeper nothing -- each of
        // these has a different fix, and only one of them is theirs to make.
        const name = err?.name || '';
        if (name === 'NotAllowedError' || name === 'SecurityError') {
          setError('Camera permission was refused. Allow it in the browser’s site settings to scan.');
        } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
          setError('No camera found on this device.');
        } else if (name === 'NotReadableError') {
          setError('The camera is in use by another app. Close it and try again.');
        } else {
          setError(`This device cannot open the camera${err?.message ? ` (${err.message})` : ''}.`);
        }
      }
    })();

    return stop;
  }, [open, onCode]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] bg-black/80 flex items-end sm:items-center justify-center p-0 sm:p-6">
      <div className="bg-card w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl overflow-hidden shadow-xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2 font-bold text-foreground">
            <ScanBarcode size={18} /> Scan a barcode
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close scanner"
            className="w-9 h-9 grid place-items-center rounded-xl hover:bg-canvas
                       transition-[background-color,transform] duration-150 active:scale-[0.96]"
          >
            <X size={18} />
          </button>
        </div>

        {error ? (
          <div className="p-6 text-sm text-muted-foreground">
            <p className="font-semibold text-foreground mb-1">Cannot scan here</p>
            <p>{error}</p>
            <p className="mt-3">A USB or Bluetooth scanner works everywhere — it types into the
              search box, so nothing else needs setting up.</p>
          </div>
        ) : (
          <>
            <div className="relative bg-black aspect-[4/3]">
              {/* muted + playsinline so phones neither autoplay audio nor go
                  fullscreen over the till. */}
              <video ref={videoRef} muted playsInline className="w-full h-full object-cover" />
              {/* A frame to aim with. Decoration, so it is hidden from
                  assistive tech rather than announced as content. */}
              <div className="absolute inset-0 grid place-items-center" aria-hidden="true">
                <div className="w-[70%] h-[28%] border-2 border-white/80 rounded-xl shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
              </div>
            </div>
            <div className="px-4 py-3 text-[13px] text-muted-foreground" aria-live="polite">
              {lastHit
                ? <>Added <span className="font-semibold text-foreground tabular-nums">{lastHit}</span> — keep scanning.</>
                : 'Point the camera at the barcode.'}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ScanSheet;
