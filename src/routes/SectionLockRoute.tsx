import React, { useState } from 'react';
import { Outlet, useLocation, Link, Navigate } from 'react-router-dom';
import { useAdminLock } from '../contexts/AdminLockContext';
import { Lock, Eye, EyeOff, CheckCircle2, Loader2, ShoppingCart, ShieldAlert } from 'lucide-react';

export const SectionLockRoute: React.FC = () => {
  const location = useLocation();
  const { isLocked, unlockWithFirebasePassword } = useAdminLock();

  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const locked = isLocked(location.pathname);

  if (!locked) {
    return <Outlet />;
  }

  // When locked (Cashier Mode), root '/' directs immediately to '/pos' so cashier never faces password prompt
  if (location.pathname === '/') {
    return <Navigate to="/pos" replace />;
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
      } else {
        setError(res.error || 'Incorrect Firebase Admin Password. Please try again.');
        setPassword('');
      }
    } catch (err: any) {
      setError(err?.message || 'Authentication error. Please try again.');
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-3xl shadow-xl border border-slate-200 max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-[#071F49] text-white p-5 sm:p-6 text-center border-b-2 border-[#F5B51B] relative">
          <div className="w-12 h-12 sm:w-14 sm:h-14 mx-auto rounded-2xl bg-[#F5B51B] text-[#071F49] flex items-center justify-center shadow-lg mb-3">
            <Lock className="w-6 h-6 sm:w-7 sm:h-7" />
          </div>
          <h2 className="text-lg sm:text-xl font-black tracking-tight">Admin Authorization Required</h2>
          <p className="text-xs text-[#F5B51B] font-semibold mt-1">
            Protected Section — Store Owner Password Required
          </p>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-5 sm:p-8 space-y-5">
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-center space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Restricted Area
            </span>
            <p className="text-base font-extrabold text-[#071F49]">{sectionName}</p>
            <p className="text-xs text-slate-500 pt-1">
              Cashiers have unrestricted access to Billing & POS. Enter your Firebase Admin Password to unlock management and financial sections.
            </p>
          </div>

          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 font-semibold flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {isSuccess && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-semibold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Admin access verified! Opening section...</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
              Firebase Admin Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter Firebase Admin Password..."
                disabled={isVerifying || isSuccess}
                autoFocus
                className="w-full pl-4 pr-12 py-3 font-mono text-sm border-2 border-slate-300 rounded-xl focus:border-[#071F49] focus:outline-none transition shadow-inner"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-3.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-2.5 pt-2">
            <button
              type="submit"
              disabled={isVerifying || isSuccess}
              className="w-full py-3 px-4 rounded-xl font-black text-sm text-[#071F49] bg-[#F5B51B] hover:bg-[#F8CE4E] shadow-md transition-all active:scale-[0.99] flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isVerifying ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-[#071F49]" />
                  <span>Verifying Password...</span>
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4" />
                  <span>Unlock Section</span>
                </>
              )}
            </button>

            <Link
              to="/pos"
              className="w-full py-2.5 px-4 rounded-xl font-bold text-xs text-slate-700 bg-slate-100 hover:bg-slate-200 transition flex items-center justify-center gap-2 text-center"
            >
              <ShoppingCart className="w-4 h-4 text-[#071F49]" />
              <span>Back to Billing & POS Register (Cashier Mode)</span>
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
};
