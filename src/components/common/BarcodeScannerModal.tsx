import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import {
  X,
  ScanBarcode,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Flashlight,
  Volume2,
} from 'lucide-react';
import { playScannerBeep } from '../../utils/soundEffects';

export interface BarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (barcode: string) => void | Promise<void>;
  title?: string;
  mode?: 'single' | 'continuous';
  instructions?: string;
}

export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({
  isOpen,
  onClose,
  onScan,
  title = 'Scan Barcode',
  mode = 'continuous',
  instructions = 'Point camera at the barcode printed on the book or stationery',
}) => {
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [lastScannedCode, setLastScannedCode] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState('');
  const [isTorchOn, setIsTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const lastScanTimeRef = useRef<{ [code: string]: number }>({});
  const isMountedRef = useRef(true);

  const scannerRegionId = 'html5-barcode-scanner-viewport';

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop();
        }
        scannerRef.current.clear();
      } catch (err) {
        console.warn('Error stopping barcode scanner:', err);
      } finally {
        scannerRef.current = null;
      }
    }
  }, []);

  const handleScanSuccess = useCallback(
    async (decodedText: string) => {
      const clean = decodedText.trim();
      if (!clean) return;

      const now = Date.now();
      const lastTime = lastScanTimeRef.current[clean] || 0;

      // In continuous mode, avoid duplicate scans of the exact same barcode within 1.5s
      if (mode === 'continuous' && now - lastTime < 1500) {
        return;
      }

      lastScanTimeRef.current[clean] = now;
      setLastScannedCode(clean);
      playScannerBeep();

      try {
        await onScan(clean);
      } catch (err) {
        console.error('Scan callback error:', err);
      }

      // If single-scan mode (e.g. inside Product Form), close modal immediately
      if (mode === 'single') {
        await stopScanner();
        onClose();
      }
    },
    [mode, onScan, onClose, stopScanner]
  );

  const startScanner = useCallback(async () => {
    setIsInitializing(true);
    setScannerError(null);

    // Make sure previous instance is cleaned up
    await stopScanner();

    try {
      const formatsToSupport = [
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.EAN_8,
        Html5QrcodeSupportedFormats.CODE_128,
        Html5QrcodeSupportedFormats.CODE_39,
        Html5QrcodeSupportedFormats.UPC_A,
        Html5QrcodeSupportedFormats.UPC_E,
        Html5QrcodeSupportedFormats.ITF,
        Html5QrcodeSupportedFormats.QR_CODE,
      ];

      const html5QrCode = new Html5Qrcode(scannerRegionId, {
        formatsToSupport,
        verbose: false,
      });
      scannerRef.current = html5QrCode;

      const config = {
        fps: 15,
        qrbox: { width: 280, height: 180 },
        aspectRatio: 1.333333,
      };

      await html5QrCode.start(
        { facingMode: 'environment' },
        config,
        handleScanSuccess,
        undefined // Ignore frame error callbacks
      );

      if (isMountedRef.current) {
        setIsInitializing(false);
        // Check if torch/flashlight is supported
        try {
          const track = (html5QrCode as any).getRunningTrackCameraCapabilities?.();
          if (track && track.torchFeature && track.torchFeature().isSupported()) {
            setHasTorch(true);
          }
        } catch {
          setHasTorch(false);
        }
      }
    } catch (err: any) {
      console.error('Failed to start camera barcode scanner:', err);
      if (isMountedRef.current) {
        setIsInitializing(false);
        setScannerError(
          err.message ||
            'Could not access camera. Please check camera permissions or use manual barcode entry below.'
        );
      }
    }
  }, [handleScanSuccess, stopScanner]);

  const toggleTorch = async () => {
    if (!scannerRef.current) return;
    try {
      const nextTorch = !isTorchOn;
      await scannerRef.current.applyVideoConstraints({
        advanced: [{ torch: nextTorch } as any],
      });
      setIsTorchOn(nextTorch);
    } catch (err) {
      console.warn('Torch toggle failed:', err);
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = manualCode.trim();
    if (!clean) return;

    playScannerBeep();
    onScan(clean);
    setLastScannedCode(clean);
    setManualCode('');

    if (mode === 'single') {
      stopScanner().then(() => onClose());
    }
  };

  useEffect(() => {
    isMountedRef.current = true;
    if (isOpen) {
      setLastScannedCode(null);
      setManualCode('');
      // Small delay to ensure modal DOM is mounted
      const timer = setTimeout(() => {
        startScanner();
      }, 150);
      return () => {
        clearTimeout(timer);
        stopScanner();
      };
    } else {
      stopScanner();
    }

    return () => {
      isMountedRef.current = false;
      stopScanner();
    };
  }, [isOpen, startScanner, stopScanner]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-300 flex flex-col my-auto">
        {/* Header */}
        <div className="px-4 py-3 bg-[#071F49] text-white flex items-center justify-between border-b-2 border-[#F5B51B]">
          <div className="flex items-center gap-2">
            <ScanBarcode className="w-5 h-5 text-[#F5B51B]" />
            <div>
              <h3 className="font-bold text-sm leading-tight text-white">{title}</h3>
              <p className="text-[10.5px] text-slate-300">
                {mode === 'continuous' ? 'Continuous POS Scanning Mode' : 'Single Item Scan'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {hasTorch && (
              <button
                type="button"
                onClick={toggleTorch}
                className={`p-1.5 rounded-lg border text-xs font-semibold flex items-center transition ${
                  isTorchOn
                    ? 'bg-amber-400 text-slate-900 border-amber-300'
                    : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                }`}
                title="Toggle Flashlight / Torch"
              >
                <Flashlight className="w-4 h-4" />
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                stopScanner().then(() => onClose());
              }}
              className="p-1 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Viewfinder Area */}
        <div className="p-3 bg-slate-900 flex flex-col items-center justify-center relative">
          <div className="w-full max-w-[340px] aspect-4/3 rounded-xl overflow-hidden bg-black relative border-2 border-slate-700 shadow-inner flex items-center justify-center">
            {/* HTML5 Camera Viewport */}
            <div id={scannerRegionId} className="w-full h-full" />

            {/* Target Reticle Overlay */}
            {!isInitializing && !scannerError && (
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="w-56 h-28 border-2 border-emerald-400/80 rounded-lg relative shadow-[0_0_15px_rgba(52,211,153,0.3)]">
                  {/* Corner markers */}
                  <div className="absolute -top-1 -left-1 w-4 h-4 border-t-4 border-l-4 border-emerald-400" />
                  <div className="absolute -top-1 -right-1 w-4 h-4 border-t-4 border-r-4 border-emerald-400" />
                  <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-4 border-l-4 border-emerald-400" />
                  <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-4 border-r-4 border-emerald-400" />
                  {/* Animated laser line */}
                  <div className="absolute left-2 right-2 top-1/2 -translate-y-1/2 h-0.5 bg-rose-500/90 shadow-[0_0_8px_rgba(244,63,94,0.9)] animate-pulse" />
                </div>
              </div>
            )}

            {isInitializing && (
              <div className="absolute inset-0 bg-slate-900/90 flex flex-col items-center justify-center text-white gap-2 text-xs">
                <RefreshCw className="w-6 h-6 animate-spin text-[#F5B51B]" />
                <span className="font-semibold">Starting camera scanner...</span>
              </div>
            )}

            {scannerError && (
              <div className="absolute inset-0 bg-slate-950 p-4 flex flex-col items-center justify-center text-center text-rose-300 gap-2">
                <AlertCircle className="w-8 h-8 text-rose-400" />
                <p className="text-xs font-semibold leading-relaxed">{scannerError}</p>
                <button
                  type="button"
                  onClick={startScanner}
                  className="mt-2 px-3 py-1 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-bold border border-slate-600 transition"
                >
                  Retry Camera
                </button>
              </div>
            )}
          </div>

          <div className="mt-2 text-center">
            <p className="text-[11px] text-slate-300 font-medium">{instructions}</p>
          </div>
        </div>

        {/* Last Scanned Banner */}
        {lastScannedCode && (
          <div className="px-4 py-2 bg-emerald-50 border-y border-emerald-200 flex items-center justify-between text-xs text-emerald-900">
            <div className="flex items-center gap-1.5 font-bold">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Scanned Code:</span>
              <span className="font-mono bg-white px-2 py-0.5 rounded border border-emerald-300 font-black">
                {lastScannedCode}
              </span>
            </div>
            <span className="text-[10.5px] text-emerald-700 font-semibold">
              <Volume2 className="w-3.5 h-3.5 inline mr-1" />
              Beep!
            </span>
          </div>
        )}

        {/* Manual Barcode / Hardware Gun Fallback Input */}
        <div className="p-3 bg-slate-50 border-t border-slate-200">
          <form onSubmit={handleManualSubmit} className="space-y-1">
            <label className="block text-[11px] font-bold text-slate-700">
              Manual Barcode / Scanner Gun Entry:
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                placeholder="Type or scan barcode with gun..."
                className="flex-1 px-3 py-1.5 text-xs font-mono font-bold text-slate-900 bg-white border border-slate-300 rounded-lg focus:ring-1 focus:ring-[#071F49] focus:outline-none"
              />
              <button
                type="submit"
                disabled={!manualCode.trim()}
                className="px-3 py-1.5 bg-[#071F49] hover:bg-[#0c2f6d] text-white text-xs font-bold rounded-lg transition disabled:opacity-50 cursor-pointer"
              >
                Submit
              </button>
            </div>
          </form>

          {/* Footer Close Button */}
          <div className="mt-3 flex items-center justify-between pt-2 border-t border-slate-200">
            <span className="text-[10px] text-slate-500 font-semibold">
              Tip: Handheld scanner guns also work automatically.
            </span>
            <button
              type="button"
              onClick={() => {
                stopScanner().then(() => onClose());
              }}
              className="px-3 py-1 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg text-xs font-bold transition cursor-pointer"
            >
              {mode === 'continuous' ? 'Done / Close' : 'Cancel'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
