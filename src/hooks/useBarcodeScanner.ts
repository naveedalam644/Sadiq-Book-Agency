import { useEffect, useRef } from 'react';

export interface UseBarcodeScannerOptions {
  onScan: (barcode: string) => void;
  enabled?: boolean;
  minBarcodeLength?: number;
  maxInterKeyTimeoutMs?: number;
}

/**
 * Custom hook to detect and capture hardware USB/Bluetooth barcode scanner gun input.
 * Hardware barcode scanners emit rapid keyboard sequences (< 50-60ms apart)
 * terminating with an 'Enter' key.
 */
export const useBarcodeScanner = ({
  onScan,
  enabled = true,
  minBarcodeLength = 3,
  maxInterKeyTimeoutMs = 60,
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
      // Ignore functional keys except Enter
      if (e.ctrlKey || e.altKey || e.metaKey) return;

      const now = Date.now();
      const timeDiff = now - lastKeyTimeRef.current;

      if (e.key === 'Enter') {
        const barcode = bufferRef.current.trim();
        // If buffer has minimum length and was typed rapidly by scanner gun
        if (barcode.length >= minBarcodeLength && timeDiff <= maxInterKeyTimeoutMs * 2) {
          e.preventDefault();
          e.stopPropagation();
          onScanRef.current(barcode);
        }
        bufferRef.current = '';
        lastKeyTimeRef.current = 0;
        return;
      }

      // Check for single printable character
      if (e.key.length === 1) {
        // If delay between keystrokes was too long, reset buffer (user was likely typing slowly)
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
  }, [enabled, minBarcodeLength, maxInterKeyTimeoutMs]);
};

