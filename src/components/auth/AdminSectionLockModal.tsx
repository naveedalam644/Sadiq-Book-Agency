import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Eye, EyeOff, ShieldAlert, KeyRound, AlertTriangle, X, CheckCircle2 } from 'lucide-react';
import { useAdminLock } from '../../contexts/AdminLockContext';

export interface AdminSectionLockModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetPath: string;
  targetName: string;
  onSuccess?: () => void;
}

export const AdminSectionLockModal: React.FC<AdminSectionLockModalProps> = ({
  isOpen,
  onClose,
  targetPath,
  targetName,
  onSuccess,
}) => {
  const { unlockSection, openChangePasswordModal, defaultPinNotice } = useAdminLock();
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberSession, setRememberSession] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  // Auto focus input on modal open
  useEffect(() => {
    if (isOpen) {
      setPassword('');
      setError(null);
      setIsSuccess(false);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!password.trim()) {
      setError('Please enter Admin Password');
      return;
    }

    const unlocked = unlockSection(targetPath, password.trim(), rememberSession);

    if (unlocked) {
      setIsSuccess(true);
      setTimeout(() => {
        onClose();
        if (onSuccess) {
          onSuccess();
        } else if (targetPath) {
          navigate(targetPath);
        }
      }, 250);
    } else {
      setError('Ghalat Admin Password! (Incorrect Password). Please try again.');
      setPassword('');
      inputRef.current?.focus();
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
                Confidential Store Section — Authorized Personnel Only
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

        {/* Content Body */}
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4">
          {/* Target Section Badge */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs">
              <p className="text-slate-600">Target Confidential Section:</p>
              <p className="font-black text-slate-900 text-sm mt-0.5">{targetName}</p>
              <p className="text-slate-500 mt-1 leading-relaxed">
                Is section mein confidential financial data, accounts aur record hain. Access karne ke liye Admin Password darj karein.
              </p>
            </div>
          </div>

          {/* Default PIN Alert */}
          {defaultPinNotice && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5 text-[11px] text-blue-900 flex items-center justify-between">
              <span>Default PIN: <strong className="font-mono font-bold">1234</strong></span>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  openChangePasswordModal();
                }}
                className="font-bold underline text-blue-700 hover:text-blue-900 cursor-pointer"
              >
                Change PIN
              </button>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-3 rounded-xl flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
              <span>{error}</span>
            </div>
          )}

          {/* Password Input */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-800">
              Admin Password / PIN <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <KeyRound className="w-4 h-4" />
              </div>
              <input
                ref={inputRef}
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter Admin Password..."
                disabled={isSuccess}
                className="w-full pl-9 pr-10 py-2.5 bg-white border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-[#071F49] focus:border-transparent outline-none transition-all font-mono tracking-wider"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Session remember option */}
          <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={rememberSession}
              onChange={(e) => setRememberSession(e.target.checked)}
              className="w-4 h-4 text-[#071F49] rounded border-slate-300 focus:ring-[#071F49]"
            />
            <span>Keep unlocked for this session</span>
          </label>

          {/* Action Buttons */}
          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={() => {
                onClose();
                openChangePasswordModal();
              }}
              className="text-xs text-slate-500 hover:text-[#071F49] font-medium underline cursor-pointer"
            >
              Change Password
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-slate-300 rounded-xl text-slate-700 hover:bg-slate-100 font-semibold text-xs sm:text-sm transition-colors cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={isSuccess}
                className="px-5 py-2 bg-[#071F49] hover:bg-[#0c2f6d] text-white rounded-xl font-bold text-xs sm:text-sm flex items-center gap-2 shadow-md active:scale-95 transition-all cursor-pointer disabled:opacity-50"
              >
                {isSuccess ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>Unlocked!</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-4 h-4 text-[#F5B51B]" />
                    <span>Unlock Section</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

