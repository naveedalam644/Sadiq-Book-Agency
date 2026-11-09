import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Eye, EyeOff, X, CheckCircle2, Loader2, ArrowRight } from 'lucide-react';
import { useAdminLock } from '../../contexts/AdminLockContext';

export interface AdminSectionLockModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetPath?: string;
  targetName?: string;
  onSuccess?: () => void;
}

export const AdminSectionLockModal: React.FC<AdminSectionLockModalProps> = ({
  isOpen,
  onClose,
  targetPath = '',
  targetName = 'Admin Protected Section',
  onSuccess,
}) => {
  const { unlockWithFirebasePassword } = useAdminLock();
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  // Auto focus input on modal open
  useEffect(() => {
    if (isOpen) {
      setPassword('');
      setError(null);
      setIsSuccess(false);
      setIsVerifying(false);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmed = password.trim();
    if (!trimmed) {
      setError('Please enter Admin Password.');
      return;
    }

    setIsVerifying(true);

    try {
      const res = await unlockWithFirebasePassword(trimmed);
      if (res.success) {
        setIsSuccess(true);
        setTimeout(() => {
          onClose();
          if (onSuccess) {
            onSuccess();
          } else if (targetPath && targetPath !== '/pos') {
            navigate(targetPath);
          }
        }, 300);
      } else {
        setError(res.error || 'Incorrect Firebase Admin Password. Please try again.');
        setPassword('');
        inputRef.current?.focus();
      }
    } catch (err: any) {
      setError(err?.message || 'Authentication error. Please try again.');
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4">
      {/* Modal Dialog Card */}
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-300 animate-in fade-in zoom-in-95 duration-150">
        {/* Top Header */}
        <div className="bg-[#071F49] text-white px-5 py-4 flex items-center justify-between border-b-2 border-[#F5B51B]">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#F5B51B] text-[#071F49] rounded-xl shadow-md">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base leading-tight">
                Admin Password Required
              </h3>
              <p className="text-[11px] text-[#F5B51B] font-medium">
                Store Owner Authorization Required
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4">
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-center">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
              Accessing
            </span>
            <span className="text-sm font-extrabold text-[#071F49] block">
              {targetName}
            </span>
            <p className="text-[11px] text-slate-500 mt-1">
              Enter your Firebase store administrator password to unlock all management and financial sections.
            </p>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 font-semibold flex items-center gap-2">
              <Lock className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {isSuccess && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 font-semibold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Admin access granted! Unlocking sections...</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Admin Password
            </label>
            <div className="relative">
              <input
                ref={inputRef}
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter Firebase Admin Password..."
                disabled={isVerifying || isSuccess}
                className="w-full pl-3.5 pr-11 py-2.5 text-sm font-mono border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#071F49] focus:outline-none transition"
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isVerifying}
              className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition cursor-pointer"
            >
              Cancel (Return to POS)
            </button>

            <button
              type="submit"
              disabled={isVerifying || isSuccess}
              className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold text-[#071F49] bg-[#F5B51B] hover:bg-[#F8CE4E] shadow-md transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isVerifying ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-[#071F49]" />
                  <span>Verifying...</span>
                </>
              ) : isSuccess ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-[#071F49]" />
                  <span>Unlocked!</span>
                </>
              ) : (
                <>
                  <span>Unlock Admin Access</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
