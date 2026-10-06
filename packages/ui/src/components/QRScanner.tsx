'use client';
import React, { useEffect, useRef, useState } from 'react';
import { Button } from './Button';

/**
 * Browser QR scanner using the device camera.
 *
 * Frame capture is implemented (getUserMedia + canvas). QR decoding goes
 * through `decodeQRFrame`, which is a clearly-marked DECODE STUB: swap it for
 * a real decoder (e.g. jsqr or @zxing/browser) without touching the camera
 * plumbing. The scanned payload is ALWAYS validated server-side — the token
 * in a customer QR is a short-lived signed redemption token, never raw IDs.
 */

// ---- DECODE STUB -----------------------------------------------------------
// Replace with a real decoder. Signature: (imageData) => decodedText | null.
export type QRDecoder = (imageData: ImageData) => string | null;
export const stubDecoder: QRDecoder = (_imageData) => {
  // DEV-ONLY stub: returns null (no QR detected). Plug in jsqr here:
  //   import jsqr from 'jsqr';
  //   export const jsqrDecoder: QRDecoder = (d) => jsqr(d.data, d.width, d.height)?.data ?? null;
  return null;
};
// ----------------------------------------------------------------------------

export function QRScanner({ onScan, onError, decoder = stubDecoder }: {
  onScan: (payload: string) => void; onError?: (msg: string) => void; decoder?: QRDecoder;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [active, setActive] = useState(false);
  const [error, setError] = useState('');
  const rafRef = useRef(0);
  const streamRef = useRef<MediaStream | null>(null);

  const stop = () => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setActive(false);
  };

  const tick = () => {
    const video = videoRef.current, canvas = canvasRef.current;
    if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        canvas.width = video.videoWidth; canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);
        try {
          const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const decoded = decoder(frame);
          if (decoded) { onScan(decoded); stop(); return; }
        } catch { /* keep scanning */ }
      }
    }
    rafRef.current = requestAnimationFrame(tick);
  };

  const start = async () => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
      setActive(true);
      rafRef.current = requestAnimationFrame(tick);
    } catch {
      const msg = 'Camera access was denied or is unavailable.';
      setError(msg); onError?.(msg);
    }
  };

  useEffect(() => () => stop(), []);

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-ink">
      <div className="relative aspect-[4/3] bg-black">
        <video ref={videoRef} playsInline muted className="h-full w-full object-cover" aria-label="Camera preview" />
        <canvas ref={canvasRef} className="hidden" />
        {!active && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
            <span className="text-5xl" aria-hidden>📷</span>
            <p className="text-sm text-white/80">Point the camera at the customer's redemption QR code.</p>
            <Button onClick={start} variant="accent">Start camera</Button>
          </div>
        )}
        {active && (
          <>
            <div className="pointer-events-none absolute inset-8 rounded-2xl border-2 border-accent" aria-hidden />
            <button onClick={stop} className="absolute right-3 top-3 rounded-lg bg-black/60 px-3 py-1.5 text-sm font-semibold text-white">Stop</button>
          </>
        )}
      </div>
      {error && <p className="bg-red-50 px-4 py-2 text-sm text-error" role="alert">{error}</p>}
    </div>
  );
}
