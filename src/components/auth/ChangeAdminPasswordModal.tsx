import React, { useState } from 'react';
import { KeyRound, X, CheckCircle2, AlertTriangle, Lock } from 'lucide-react';
import { useAdminLock } from '../../contexts/AdminLockContext';

export interface ChangeAdminPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ChangeAdminPasswordModal: React.FC<ChangeAdminPasswordModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { changeAdminPassword } = useAdminLock();

  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (newPin.trim() !== confirmPin.trim()) {
      setError('New Password and Confirm Password do not match.');
      return;
    }

    if (newPin.trim().length < 4) {
      setError('New Password must be at least 4 characters long.');
      return;
    }

    const res = changeAdminPassword(currentPin, newPin);
    if (res.success) {
      setSuccess(res.message);
      setTimeout(() => {
        onClose();
        setCurrentPin('');
        setNewPin('');
        setConfirmPin('');
        setSuccess(null);
      }, 1200);
    } else {
      setError(res.message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-300 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="bg-[#071F49] text-white px-5 py-4 flex items-center justify-between border-b-2 border-[#F5B51B]">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#F5B51B] text-[#071F49] rounded-xl shadow-md">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base leading-tight">
                Change Admin Password
              </h3>
              <p className="text-[11px] text-[#F5B51B] font-medium">
                ایڈمن پاس ورڈ تبدیل کریں
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4 text-xs">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-xl flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-3 rounded-xl flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>{success}</span>
            </div>
          )}

          <div className="space-y-1">
            <label className="block font-bold text-slate-800">
              Current Admin Password / موجودہ پاس ورڈ <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              value={currentPin}
              onChange={(e) => setCurrentPin(e.target.value)}
              placeholder="e.g. 1234"
              required
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-mono focus:ring-2 focus:ring-[#071F49] outline-none"
            />
          </div>

          <div className="space-y-1">
            <label className="block font-bold text-slate-800">
              New Admin Password / نیا پاس ورڈ <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              value={newPin}
              onChange={(e) => setNewPin(e.target.value)}
              placeholder="Enter new private password/PIN..."
              required
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-mono focus:ring-2 focus:ring-[#071F49] outline-none"
            />
          </div>

          <div className="space-y-1">
            <label className="block font-bold text-slate-800">
              Confirm New Password / تصدیق نیا پاس ورڈ <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value)}
              placeholder="Re-enter new password..."
              required
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-mono focus:ring-2 focus:ring-[#071F49] outline-none"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 hover:bg-slate-100 font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-[#071F49] hover:bg-[#0c2f6d] text-white rounded-xl font-bold flex items-center gap-2 shadow-md active:scale-95 transition-all"
            >
              <Lock className="w-4 h-4 text-[#F5B51B]" />
              <span>Update Password</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

