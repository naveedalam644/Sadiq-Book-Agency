import React, { useState, useEffect } from 'react';
import {
  Trash2,
  AlertTriangle,
  RefreshCw,
  ShieldCheck,
  Check,
  Database,
  ArrowRight,
} from 'lucide-react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import {
  getTestingDataScan,
  executeClientHandoverPurge,
  type CollectionPurgeSummary,
  type PurgeResult,
} from '../../services/dataPurgeService';

interface ClientHandoverCleanupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCompleted?: () => void;
}

export const ClientHandoverCleanupModal: React.FC<ClientHandoverCleanupModalProps> = ({
  isOpen,
  onClose,
  onCompleted,
}) => {
  const { currentUser } = useAuth();
  const { success, error: toastError } = useToast();

  const [loadingScan, setLoadingScan] = useState(false);
  const [scanResults, setScanResults] = useState<CollectionPurgeSummary[]>([]);
  const [confirmationInput, setConfirmationInput] = useState('');
  const [isPurging, setIsPurging] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  const [progressPercent, setProgressPercent] = useState(0);
  const [purgeResult, setPurgeResult] = useState<PurgeResult | null>(null);

  const fetchScan = async () => {
    try {
      setLoadingScan(true);
      const res = await getTestingDataScan();
      setScanResults(res);
    } catch (err: any) {
      toastError('Failed to scan database document counts', 'Scan Error');
    } finally {
      setLoadingScan(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setConfirmationInput('');
      setPurgeResult(null);
      setProgressMsg('');
      setProgressPercent(0);
      fetchScan();
    }
  }, [isOpen]);

  const totalTestDocs = scanResults.reduce((sum, item) => sum + item.count, 0);

  const handleExecutePurge = async () => {
    if (confirmationInput.trim().toUpperCase() !== 'RESET') {
      return;
    }

    try {
      setIsPurging(true);
      setProgressMsg('Initializing clean handover purge...');
      setProgressPercent(5);

      const res = await executeClientHandoverPurge(
        currentUser?.uid || 'admin',
        (msg, pct) => {
          setProgressMsg(msg);
          setProgressPercent(pct);
        }
      );

      if (res.success) {
        setPurgeResult(res);
        success(`Successfully purged ${res.totalDeleted} testing documents!`, 'Database Cleaned');
        // Re-scan to show 0s
        await fetchScan();
        onCompleted?.();
      } else {
        toastError(res.error || 'Purge failed', 'Database Error');
      }
    } catch (err: any) {
      toastError(err.message || 'Purge operation failed', 'Error');
    } finally {
      setIsPurging(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        if (!isPurging) onClose();
      }}
      title="Client Handover — Purge Test Data"
      size="lg"
    >
      <div className="space-y-5">
        {/* Banner Alert */}
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3 text-amber-900 text-xs">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold text-sm text-amber-950">
              Clean All Testing Data for Client Delivery
            </p>
            <p className="text-amber-800 leading-relaxed">
              This administrative utility permanently deletes all dummy test products, stock intake, sales,
              customer ledgers, rough bills, syllabus sets, and expense logs.
            </p>
          </div>
        </div>

        {/* Success Screen after Purge */}
        {purgeResult && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 text-center space-y-3 animate-in fade-in zoom-in-95">
            <div className="w-12 h-12 bg-emerald-500 text-white rounded-full mx-auto flex items-center justify-center shadow-md">
              <Check className="w-7 h-7" />
            </div>
            <h3 className="text-base font-extrabold text-emerald-950">
              Website is 100% Clean & Ready for Handover!
            </h3>
            <p className="text-xs text-emerald-800 max-w-md mx-auto">
              Total <strong>{purgeResult.totalDeleted}</strong> testing records have been purged.
              All core categories are verified and counters have been reset to zero.
            </p>
            <div className="pt-2">
              <Button
                variant="primary"
                size="sm"
                onClick={onClose}
                rightIcon={<ArrowRight className="w-4 h-4" />}
              >
                Done & Return to Store
              </Button>
            </div>
          </div>
        )}

        {/* Safety Breakdown Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          {/* Will Be Deleted */}
          <div className="p-3.5 bg-rose-50/50 border border-rose-200 rounded-xl space-y-2">
            <div className="flex items-center gap-1.5 font-bold text-rose-900">
              <Trash2 className="w-4 h-4 text-rose-600" />
              <span>Will Be Permanently Cleared</span>
            </div>
            <ul className="text-[11px] text-rose-800 space-y-1 pl-4 list-disc">
              <li>Test Products, Stock Batches & Movements</li>
              <li>Suppliers, Customers & Khata Ledgers</li>
              <li>Sales, Returns & Cash Closings</li>
              <li>Rough Bills & Syllabus Sets</li>
              <li>Audit Logs & Test Messages</li>
            </ul>
          </div>

          {/* Will Be Preserved */}
          <div className="p-3.5 bg-emerald-50/50 border border-emerald-200 rounded-xl space-y-2">
            <div className="flex items-center gap-1.5 font-bold text-emerald-900">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Guaranteed Preserved & Protected</span>
            </div>
            <ul className="text-[11px] text-emerald-800 space-y-1 pl-4 list-disc">
              <li>Admin User Account & Credentials</li>
              <li>6 Standard Syllabus/Inventory Categories</li>
              <li>Inventory Summary Counter (Reset to 0)</li>
              <li>WhatsApp Configuration & Preferences</li>
              <li>Admin Lock PIN & Security Rules</li>
            </ul>
          </div>
        </div>

        {/* Live Document Scan Table */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-slate-800 flex items-center gap-1.5">
              <Database className="w-4 h-4 text-[#071F49]" />
              Current Firestore Database Status
            </span>
            <button
              type="button"
              onClick={fetchScan}
              disabled={loadingScan || isPurging}
              className="text-[#071F49] hover:underline flex items-center gap-1 text-[11px] font-semibold cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${loadingScan ? 'animate-spin' : ''}`} />
              Re-scan Database
            </button>
          </div>

          <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-xl bg-slate-50/50 p-2 text-xs divide-y divide-slate-200">
            {loadingScan ? (
              <div className="p-4 text-center text-slate-500 flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-[#071F49]" />
                <span>Scanning collections in Firestore...</span>
              </div>
            ) : scanResults.length === 0 ? (
              <div className="p-4 text-center text-slate-500">No collections scanned.</div>
            ) : (
              scanResults.map((item) => (
                <div key={item.collectionName} className="py-1.5 px-2 flex items-center justify-between">
                  <span className="font-mono text-slate-700 text-[11px]">{item.collectionName}</span>
                  <span
                    className={`font-mono text-xs font-bold px-2 py-0.5 rounded-full ${
                      item.count > 0 ? 'bg-amber-100 text-amber-800' : 'bg-slate-200/60 text-slate-500'
                    }`}
                  >
                    {item.count} {item.count === 1 ? 'doc' : 'docs'}
                  </span>
                </div>
              ))
            )}
          </div>
          <div className="text-right text-xs text-slate-600 font-semibold pr-1">
            Total Testing Records Detected:{' '}
            <span className="font-bold text-slate-900 font-mono">{totalTestDocs}</span>
          </div>
        </div>

        {/* Zero Records Clean Status Banner */}
        {totalTestDocs === 0 && !loadingScan && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-center space-y-1 animate-in fade-in">
            <p className="font-bold text-xs text-emerald-950 flex items-center justify-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              Database is 100% Clean! Zero Test Records
            </p>
            <p className="text-[11px] text-emerald-800">
              All testing data has been wiped. Inventory counters are at 0, admin account is protected, and all 6 core syllabus categories are intact and ready for your client!
            </p>
          </div>
        )}

        {/* Progress Bar during purge */}
        {isPurging && (
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-2xl space-y-2">
            <div className="flex items-center justify-between text-xs text-blue-900 font-bold">
              <span>{progressMsg}</span>
              <span>{progressPercent}%</span>
            </div>
            <div className="w-full bg-blue-200 h-2.5 rounded-full overflow-hidden">
              <div
                className="bg-[#071F49] h-full transition-all duration-300 rounded-full"
                style={{ width: `${progressPercent}%` }}
              ></div>
            </div>
          </div>
        )}

        {/* Confirmation Input and Action */}
        {!purgeResult && (
          <div className="p-4 border border-rose-200 bg-rose-50/30 rounded-2xl space-y-3">
            <label className="block text-xs font-bold text-slate-800">
              Type <span className="font-mono text-rose-600 font-extrabold bg-white px-1.5 py-0.5 rounded border border-rose-200">RESET</span> to confirm client handover clean:
            </label>
            <input
              type="text"
              value={confirmationInput}
              onChange={(e) => setConfirmationInput(e.target.value)}
              placeholder="Type RESET here..."
              disabled={isPurging}
              className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-sm font-mono tracking-wider focus:ring-2 focus:ring-rose-500 outline-none"
            />
            <div className="flex items-center justify-end gap-2 pt-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                disabled={isPurging}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={handleExecutePurge}
                isLoading={isPurging}
                disabled={confirmationInput.trim().toUpperCase() !== 'RESET' || isPurging}
                leftIcon={<Trash2 className="w-4 h-4" />}
              >
                Permanently Purge Testing Data
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};
