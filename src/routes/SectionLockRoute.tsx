import React, { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useAdminLock } from '../contexts/AdminLockContext';
import { Lock, KeyRound, Eye, EyeOff, AlertTriangle, ShieldCheck, CheckCircle2 } from 'lucide-react';

export const SectionLockRoute: React.FC = () => {
  const location = useLocation();
  const { isLocked, unlockSection, openChangePasswordModal, defaultPinNotice } = useAdminLock();

  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberSession, setRememberSession] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  const locked = isLocked(location.pathname);

  if (!locked) {
    return <Outlet />;
  }

  // Section Name mapping for friendly display
  const getSectionName = (path: string): string => {
    switch (path) {
      case '/':
        return 'Dashboard & Store Overview';
      case '/inventory':
        return 'Inventory & Stock Management';
      case '/syllabus':
        return 'Syllabus & School Course Sets';
      case '/price-list':
        return 'Price List & Rate Catalog';
      case '/suppliers':
        return 'Suppliers & Vendors Directory';
      case '/purchases':
        return 'Purchases & Stock Intake';
      case '/customers':
        return 'Customers & Khata Ledger';
      case '/pos':
        return 'Billing & POS Register';
      case '/sales-history':
        return 'Sales History & Returns';
      case '/publisher-analytics':
        return 'Publisher Analytics & Reports';
      case '/reports':
        return 'Financial Reports & Accounting';
      case '/expenses':
        return 'Expenses & Daily Closing';
      case '/rough-bill':
        return 'Rough Bill & Quotations';
      default:
        return 'Confidential Store Section';
    }
  };

  const sectionName = getSectionName(location.pathname);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!password.trim()) {
      setError('Please enter Admin Password.');
      return;
    }

    const unlocked = unlockSection(location.pathname, password.trim(), rememberSession);
    if (unlocked) {
      setIsSuccess(true);
    } else {
      setError('Incorrect Admin Password. Please try again.');
      setPassword('');
    }
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-xl border border-slate-200 max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-[#071F49] text-white p-6 text-center border-b-2 border-[#F5B51B] relative">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-[#F5B51B] text-[#071F49] flex items-center justify-center shadow-lg mb-3">
            <Lock className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-black tracking-tight">Admin Password Required</h2>
          <p className="text-xs text-[#F5B51B] font-semibold mt-1">
            Protected Section — Authorization Required
          </p>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-5">
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-center space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Target Protected Section
            </span>
            <p className="text-base font-extrabold text-[#071F49]">{sectionName}</p>
            <p className="text-xs text-slate-500 pt-1">
              This section contains confidential store records. Enter the Admin Password to continue.
            </p>
          </div>

          {defaultPinNotice && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-900 flex items-center justify-between">
              <span>Default PIN: <strong className="font-mono font-bold">1234</strong></span>
              <button
                type="button"
                onClick={openChangePasswordModal}
                className="font-bold underline text-blue-700 hover:text-blue-900 cursor-pointer"
              >
                Change PIN
              </button>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-3.5 rounded-xl flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-800">
              Admin Password / PIN <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <KeyRound className="w-4 h-4" />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter Admin Password..."
                autoFocus
                disabled={isSuccess}
                className="w-full pl-10 pr-10 py-3 bg-white border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-[#071F49] focus:border-transparent outline-none transition-all font-mono tracking-wider shadow-sm"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <label className="flex items-center gap-2.5 text-xs text-slate-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={rememberSession}
              onChange={(e) => setRememberSession(e.target.checked)}
              className="w-4 h-4 text-[#071F49] rounded border-slate-300 focus:ring-[#071F49]"
            />
            <span>Keep unlocked for this browser session</span>
          </label>

          <button
            type="submit"
            disabled={isSuccess}
            className="w-full py-3 bg-[#071F49] hover:bg-[#0c2f6d] text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-lg active:scale-98 transition-all cursor-pointer disabled:opacity-50"
          >
            {isSuccess ? (
              <>
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                <span>Unlocked! Opening Section...</span>
              </>
            ) : (
              <>
                <ShieldCheck className="w-5 h-5 text-[#F5B51B]" />
                <span>Unlock & Open Section</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

