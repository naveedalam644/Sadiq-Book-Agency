import { useEffect, useRef } from 'react';

export interface UseBarcodeScannerOptions {
  onScan: (barcode: string) => void;
  enabled?: boolean;
  minBarcodeLength?: number;
  maxInterKeyTimeoutMs?: number;
  preventInputPollution?: boolean;
}

/**
 * Custom hook to detect and capture hardware USB/Bluetooth barcode scanner gun input.
 * Hardware barcode scanners emit rapid keyboard sequences (< 60-80ms apart)
 * terminating with an 'Enter' key.
 */
export const useBarcodeScanner = ({
  onScan,
  enabled = true,
  minBarcodeLength = 3,
  maxInterKeyTimeoutMs = 80,
  preventInputPollution = true,
}: UseBarcodeScannerOptions) => {
  const bufferRef = useRef<string>('');
  const lastKeyTimeRef = useRef<number>(0);
  const onScanRef = useRef(onScan);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore functional modifier keys except Enter
      if (e.ctrlKey || e.altKey || e.metaKey) return;

      const now = Date.now();
      const timeDiff = now - lastKeyTimeRef.current;

      if (e.key === 'Enter') {
        const barcode = bufferRef.current.replace(/[\r\n\x02\x03]/g, '').trim();
        // If buffer has minimum length and was typed rapidly by scanner gun
        if (barcode.length >= minBarcodeLength && timeDiff <= maxInterKeyTimeoutMs * 2) {
          e.preventDefault();
          e.stopPropagation();

          // Prevent barcode scanner keystrokes from leaking into focused non-barcode inputs (e.g. Title, Price)
          if (preventInputPollution && typeof document !== 'undefined') {
            const activeEl = document.activeElement;
            if (activeEl && (activeEl instanceof HTMLInputElement || activeEl instanceof HTMLTextAreaElement)) {
              const isBarcodeField =
                activeEl.getAttribute('data-barcode-field') === 'true' ||
                activeEl.id === 'product-barcode-input' ||
                activeEl.name === 'barcode';
              if (!isBarcodeField && activeEl.value && activeEl.value.endsWith(barcode)) {
                activeEl.value = activeEl.value.slice(0, -barcode.length);
                activeEl.dispatchEvent(new Event('input', { bubbles: true }));
                activeEl.dispatchEvent(new Event('change', { bubbles: true }));
              }
            }
          }

          onScanRef.current(barcode);
        }
        bufferRef.current = '';
        lastKeyTimeRef.current = 0;
        return;
      }

      // Check for single printable character
      if (e.key.length === 1) {
        // If delay between keystrokes was too long, reset buffer (user was likely typing slowly by hand)
        if (lastKeyTimeRef.current > 0 && timeDiff > maxInterKeyTimeoutMs) {
          bufferRef.current = '';
        }

        bufferRef.current += e.key;
        lastKeyTimeRef.current = now;
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [enabled, minBarcodeLength, maxInterKeyTimeoutMs, preventInputPollution]);
};

