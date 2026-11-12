import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import {
  Lock,
  Eye,
  EyeOff,
  ShieldCheck,
  FileText,
  Receipt,
  Printer,
  Phone,
  MapPin,
  Calendar,
  Wallet,
  AlertCircle,
  RefreshCw,
  X,
  Clock,
  BookOpen,
  Search,
  CheckCircle2,
  ChevronRight,
  Store,
  LogOut,
  ArrowDownLeft,
  ArrowUpRight,
  Sparkles,
  Filter,
  RotateCcw,
} from 'lucide-react';
import {
  getCustomerPortalData,
  verifyPortalPassword,
  getCustomerPortalInvoices,
  getCustomerPortalLedger,
} from '../services/customerPortalService';
import type {
  CustomerPortalDocument,
  CustomerPortalInvoiceSummary,
  CustomerPortalLedgerEntry,
} from '../types/database';
import { STORE_CONTACT_DETAILS } from '../utils/whatsappTemplates';
import {
  formatCurrency,
  formatDate,
  formatInvoiceDisplayDateTime,
} from '../utils/formatters';

export const CustomerKhataPortal: React.FC = () => {
  const { portalCode } = useParams<{ portalCode: string }>();

  // Authentication State
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isUnlocked, setIsUnlocked] = useState(false);

  // Portal Data State
  const [portalData, setPortalData] = useState<CustomerPortalDocument | null>(null);
  const [invoices, setInvoices] = useState<CustomerPortalInvoiceSummary[]>([]);
  const [ledgerEntries, setLedgerEntries] = useState<CustomerPortalLedgerEntry[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [activeTab, setActiveTab] = useState<'invoices' | 'ledger'>('invoices');

  // Search & Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Selected Invoice Modal State
  const [selectedInvoice, setSelectedInvoice] = useState<CustomerPortalInvoiceSummary | null>(null);

  const sessionKey = portalCode ? `sba_portal_session_${portalCode.toLowerCase()}` : '';

  // Initial Load & Session Check
  useEffect(() => {
    if (!portalCode) return;

    const savedAuth = sessionStorage.getItem(sessionKey);
    getCustomerPortalData(portalCode).then((data) => {
      setPortalData(data);
      if (savedAuth === 'true' && data && data.portalEnabled !== false) {
        setIsUnlocked(true);
      }
    });
  }, [portalCode, sessionKey]);

  // Load Invoices and Ledger once unlocked
  const loadPortalContent = useCallback(async () => {
    if (!portalCode) return;
    setIsLoadingData(true);
    try {
      const [invs, ledger] = await Promise.all([
        getCustomerPortalInvoices(portalCode),
        getCustomerPortalLedger(portalCode),
      ]);
      setInvoices(invs);
      setLedgerEntries(ledger);
    } catch (err) {
      console.error('Error loading portal content:', err);
    } finally {
      setIsLoadingData(false);
    }
  }, [portalCode]);

  useEffect(() => {
    if (isUnlocked) {
      loadPortalContent();
    }
  }, [isUnlocked, loadPortalContent]);

  // Handle Password Submission
  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!portalCode || !password.trim()) {
      setAuthError('Please enter your portal password or PIN.');
      return;
    }

    setIsVerifying(true);
    setAuthError(null);

    try {
      const res = await verifyPortalPassword(portalCode, password.trim());
      if (res.success && res.portalData) {
        setPortalData(res.portalData);
        setIsUnlocked(true);
        sessionStorage.setItem(sessionKey, 'true');
      } else {
        setAuthError(res.errorMessage || 'Invalid password or PIN. Please try again.');
      }
    } catch (err: any) {
      setAuthError(err?.message || 'Authentication error. Please check your connection.');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleLock = () => {
    setIsUnlocked(false);
    setPassword('');
    sessionStorage.removeItem(sessionKey);
  };

  const handlePrint = () => {
    window.print();
  };

  // Filter Quick Action Handlers
  const handleClearFilters = () => {
    setSearchQuery('');
    setStartDate('');
    setEndDate('');
  };

  const handleThisMonthPreset = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const firstDay = `${year}-${month}-01`;
    const today = now.toISOString().split('T')[0];
    setStartDate(firstDay);
    setEndDate(today);
  };

  const handleLast30DaysPreset = () => {
    const now = new Date();
    const prior30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const today = now.toISOString().split('T')[0];
    setStartDate(prior30);
    setEndDate(today);
  };

  const hasActiveFilters = Boolean(searchQuery.trim() || startDate || endDate);

  // ---------------------------------------------------------------------------
  // FINANCIAL CALCULATIONS (ACCURATE KHATA BAQAYA)
  // ---------------------------------------------------------------------------
  const totalPurchases = Number(portalData?.totalPurchases) || 0;
  const totalPaid = Number(portalData?.totalPaid) || 0;
  const calculatedNetBaqaya = Math.round((totalPurchases - totalPaid) * 100) / 100;

  // Use explicit currentBalance if set and non-zero; fallback to net calculated baqaya
  const totalKhataBaqaya =
    typeof portalData?.currentBalance === 'number' && portalData.currentBalance !== 0
      ? portalData.currentBalance
      : calculatedNetBaqaya;

  const isDebtDue = totalKhataBaqaya > 0;
  const isAdvance = totalKhataBaqaya < 0;

  // Filtered Invoices (Text Search + Date Range [From Date -> To Date])
  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      // 1. Text Search Filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesText =
          inv.invoiceNo.toLowerCase().includes(q) ||
          (inv.saleDate && inv.saleDate.includes(q)) ||
          (inv.items || []).some(
            (it) =>
              it.productName.toLowerCase().includes(q) ||
              (it.publisherName && it.publisherName.toLowerCase().includes(q)) ||
              (it.seriesName && it.seriesName.toLowerCase().includes(q))
          );
        if (!matchesText) return false;
      }

      // 2. Date Range Filter (From Date -> To Date)
      const invDate = inv.saleDate || (inv.createdAt ? inv.createdAt.split('T')[0] : '');
      if (startDate && invDate && invDate < startDate) {
        return false;
      }
      if (endDate && invDate && invDate > endDate) {
        return false;
      }

      return true;
    });
  }, [invoices, searchQuery, startDate, endDate]);

  // Filtered Ledger (Text Search + Date Range)
  const filteredLedger = useMemo(() => {
    return ledgerEntries.filter((entry) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesText =
          entry.reference.toLowerCase().includes(q) ||
          entry.description.toLowerCase().includes(q) ||
          (entry.date && entry.date.includes(q));
        if (!matchesText) return false;
      }

      const entryDate = entry.date ? entry.date.split('T')[0] : '';
      if (startDate && entryDate && entryDate < startDate) {
        return false;
      }
      if (endDate && entryDate && entryDate > endDate) {
        return false;
      }

      return true;
    });
  }, [ledgerEntries, searchQuery, startDate, endDate]);

  // ---------------------------------------------------------------------------
  // VIEW 1: INVALID PORTAL LINK
  // ---------------------------------------------------------------------------
  if (!portalCode) {
    return (
      <div className="min-h-screen bg-[#F4F6FA] flex items-center justify-center p-4 font-sans">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center border border-slate-200">
          <div className="w-14 h-14 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-inner">
            <AlertCircle className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-slate-900">Invalid Portal Link</h2>
          <p className="text-sm text-slate-600 mt-2 leading-relaxed">
            No portal code was found in this address. Please use the complete WhatsApp link sent by Sadiq Book Agency.
          </p>
          <div className="mt-6 pt-4 border-t border-slate-100 text-xs text-slate-500">
            Helpline: {STORE_CONTACT_DETAILS.phones[0]}
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // VIEW 2: BRANDED, CLEAN, ATTRACTIVE LOGIN SCREEN
  // ---------------------------------------------------------------------------
  if (!isUnlocked) {
    const customerTitle = portalData?.shopName || portalData?.customerName || 'Valued Wholesale Client';

    return (
      <div className="min-h-screen bg-[#F4F6FA] flex flex-col justify-between font-sans text-slate-900">
        {/* Branded Top Navbar */}
        <header
          className="border-b-2 border-[#F5B51B] py-3 px-4 shadow-md text-white"
          style={{ background: 'linear-gradient(135deg, #071F49 0%, #0E2E70 100%)' }}
        >
          <div className="max-w-md mx-auto flex items-center justify-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-400 text-[#071F49] flex items-center justify-center font-black shadow-xs">
              <Store className="w-5 h-5" />
            </div>
            <div className="text-left">
              <h1 className="font-black text-sm text-white tracking-wide leading-tight">
                {STORE_CONTACT_DETAILS.name}
              </h1>
              <span className="text-[10.5px] text-amber-300 font-semibold block">
                Wholesale Customer Khata Portal
              </span>
            </div>
          </div>
        </header>

        {/* Clean Login Card */}
        <main className="max-w-md w-full mx-auto p-4 my-auto">
          <div className="bg-white rounded-3xl shadow-xl p-6 sm:p-8 border border-slate-200/80 relative overflow-hidden">
            {/* Top Branded Accent Stripe */}
            <div
              className="absolute top-0 left-0 right-0 h-1.5"
              style={{ background: 'linear-gradient(90deg, #071F49 0%, #F5B51B 50%, #071F49 100%)' }}
            />

            {/* Customer Greeting */}
            <div className="border-b border-slate-100 pb-4 mb-5 pt-1">
              <span className="text-[11px] font-bold text-amber-700 uppercase tracking-wider block">
                Protected Wholesale Portal
              </span>
              <h2 className="text-lg font-black text-[#071F49] mt-0.5 truncate">
                {customerTitle}
              </h2>
              <span className="inline-block px-2.5 py-0.5 rounded-md bg-slate-100 text-[11px] font-mono font-bold text-slate-600 mt-1.5">
                Ref: {portalCode}
              </span>
            </div>

            {/* Error Message */}
            {authError && (
              <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-semibold flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{authError}</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleUnlock} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Enter Password / PIN
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter 4-6 digit PIN"
                    className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 text-base font-mono font-bold tracking-wider text-slate-900 focus:outline-none focus:border-[#071F49] focus:ring-2 focus:ring-[#071F49]/10 pr-11 bg-slate-50/50"
                    autoFocus
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                    title={showPassword ? 'Hide Password' : 'Show Password'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[11px] text-slate-400 mt-1.5">
                  Enter the password provided in the WhatsApp message sent to you.
                </p>
              </div>

              <button
                type="submit"
                disabled={isVerifying || !password.trim()}
                className="w-full py-3.5 bg-[#071F49] hover:bg-[#0c2f6d] active:scale-[0.99] text-[#F5B51B] font-black text-sm rounded-xl transition shadow-md flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                {isVerifying ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-[#F5B51B]" />
                    <span>Verifying Access...</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-4 h-4 text-[#F5B51B]" />
                    <span>Open Khata Portal</span>
                  </>
                )}
              </button>
            </form>

            {/* Helpline / WhatsApp Assistance */}
            <div className="mt-6 pt-4 border-t border-slate-100 text-center">
              <span className="text-xs text-slate-500 block font-medium">
                Need your password? Contact Sadiq Book Agency:
              </span>
              <div className="mt-2.5 flex items-center justify-center gap-2">
                <a
                  href={`tel:${STORE_CONTACT_DETAILS.phones[0]}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold font-mono transition"
                >
                  <Phone className="w-3.5 h-3.5 text-slate-600" />
                  {STORE_CONTACT_DETAILS.phones[0]}
                </a>
                <a
                  href={`https://wa.me/${STORE_CONTACT_DETAILS.phones[0].replace(/[^0-9]/g, '')}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold transition border border-emerald-200"
                >
                  WhatsApp Help
                </a>
              </div>
            </div>
          </div>
        </main>

        {/* Footer */}
        <footer className="text-center pb-4 text-xs text-slate-400">
          Official Sadiq Book Agency Wholesale Portal • Strictly Read-Only
        </footer>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // VIEW 3: ATTRACTIVE, BRANDED, HIGH-CONTRAST DASHBOARD
  // ---------------------------------------------------------------------------
  const customerName = portalData?.shopName || portalData?.customerName || 'Customer';

  return (
    <div className="min-h-screen bg-[#F4F6FA] flex flex-col font-sans text-slate-900">
      {/* 1. Branded Deep Navy Top Navbar */}
      <header
        className="text-white border-b-2 border-[#F5B51B] sticky top-0 z-30 shadow-md"
        style={{ background: 'linear-gradient(135deg, #071F49 0%, #0E2E70 100%)' }}
      >
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[#F5B51B] text-[#071F49] flex items-center justify-center shrink-0 shadow-sm font-black">
              <Store className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h1 className="font-black text-sm sm:text-base text-white truncate leading-tight tracking-wide">
                {STORE_CONTACT_DETAILS.name}
              </h1>
              <span className="text-xs text-amber-300 font-semibold block truncate">
                Customer Khata & Invoices Portal
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handlePrint}
              className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer border border-white/20"
              title="Print Statement"
            >
              <Printer className="w-3.5 h-3.5 text-[#F5B51B]" />
              <span className="hidden sm:inline">Print</span>
            </button>

            <button
              type="button"
              onClick={handleLock}
              className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-xs"
              title="Lock and Log Out"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Exit</span>
            </button>
          </div>
        </div>
      </header>

      {/* 2. Main Content Container */}
      <main className="max-w-6xl w-full mx-auto px-4 py-6 flex-1 space-y-6">
        {/* Customer Profile Header Card */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-sm relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Subtle top branded accent line */}
          <div
            className="absolute top-0 left-0 right-0 h-1"
            style={{ background: 'linear-gradient(90deg, #071F49 0%, #F5B51B 50%, #071F49 100%)' }}
          />

          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-md bg-amber-50 text-amber-900 border border-amber-300 text-[11px] font-bold inline-flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-amber-700" />
                Verified Wholesale Account
              </span>
              <span className="text-xs font-mono font-semibold text-slate-500">
                Ref: {portalData?.portalCode}
              </span>
            </div>

            <h2 className="text-2xl sm:text-3xl font-black text-[#071F49] mt-1.5 tracking-tight">
              {customerName}
            </h2>

            {portalData?.shopName && portalData.customerName && portalData.shopName !== portalData.customerName && (
              <p className="text-xs text-slate-600 mt-0.5 font-medium">
                Contact: <span className="font-bold text-slate-800">{portalData.customerName}</span>
              </p>
            )}

            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 mt-2 font-medium">
              {portalData?.phone && (
                <span className="flex items-center gap-1">
                  <Phone className="w-3.5 h-3.5 text-amber-600" />
                  <span className="font-mono font-bold text-slate-800">{portalData.phone}</span>
                </span>
              )}
              {portalData?.city && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-amber-600" />
                  <span className="font-bold text-slate-800">{portalData.city}</span>
                </span>
              )}
            </div>
          </div>

          {/* Quick Contact Shop button */}
          <div className="shrink-0">
            <a
              href={`https://wa.me/${STORE_CONTACT_DETAILS.phones[0].replace(/[^0-9]/g, '')}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl text-xs font-bold transition shadow-sm"
            >
              <Phone className="w-4 h-4" />
              <span>Contact Sadiq Book Agency</span>
            </a>
          </div>
        </div>

        {/* =================================================================== */}
        {/* HERO TOTAL KHATA BAQAYA CARD (RICH BRANDED, BARA OUR BOLD)         */}
        {/* =================================================================== */}
        <div
          className="rounded-3xl shadow-lg border border-slate-200 overflow-hidden text-white"
          style={{
            background: 'linear-gradient(135deg, #071F49 0%, #0E2E70 50%, #071F49 100%)',
          }}
        >
          <div className="p-6 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
            {/* Left: Huge Bold Baqaya Amount */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-amber-400 text-slate-950 flex items-center justify-center font-black">
                  <Wallet className="w-4 h-4" />
                </div>
                <span className="text-xs sm:text-sm font-black uppercase tracking-wider text-amber-300">
                  Total Khata Balance (Baqaya)
                </span>
              </div>

              {/* BARA OUR BOLD AMOUNT */}
              <div className="text-4xl sm:text-5xl md:text-6xl font-black font-mono tracking-tight text-white drop-shadow-md pt-1">
                {formatCurrency(Math.abs(totalKhataBaqaya))}
              </div>

              {/* Status Badge */}
              <div className="pt-2">
                <span
                  className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold shadow-xs ${
                    isDebtDue
                      ? 'bg-rose-600 text-white font-black'
                      : isAdvance
                      ? 'bg-sky-500 text-slate-950 font-black'
                      : 'bg-emerald-500 text-white font-black'
                  }`}
                >
                  {isDebtDue ? (
                    <>
                      <AlertCircle className="w-4 h-4" />
                      <span>Total Outstanding Debt Due</span>
                    </>
                  ) : isAdvance ? (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>Advance Deposit Available</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Account Fully Settled (No Dues)</span>
                    </>
                  )}
                </span>
              </div>
            </div>

            {/* Right: Transparent 3-Way Reconciliation Breakdown */}
            <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 sm:p-5 border border-white/20 space-y-3 text-xs min-w-[280px]">
              <div className="flex justify-between items-center text-slate-200">
                <span className="font-medium">Total Purchases:</span>
                <span className="font-mono font-bold text-white text-sm">
                  {formatCurrency(totalPurchases)}
                </span>
              </div>

              <div className="flex justify-between items-center text-slate-200">
                <span className="font-medium">Total Payments Settled:</span>
                <span className="font-mono font-bold text-emerald-300 text-sm">
                  {formatCurrency(totalPaid)}
                </span>
              </div>

              <div className="flex justify-between items-center pt-2.5 border-t border-white/20 font-bold text-white text-sm">
                <span>Remaining Khata Due:</span>
                <span className="font-mono font-black text-amber-300 text-base">
                  {formatCurrency(Math.max(0, totalKhataBaqaya))}
                </span>
              </div>
            </div>
          </div>

          {/* Quick Meta Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-slate-100 bg-white text-xs text-center border-t border-slate-200 text-slate-900">
            <div className="p-3.5">
              <span className="text-[11px] text-slate-500 font-semibold block">Total Invoices</span>
              <span className="font-mono font-black text-[#071F49] text-sm mt-0.5 block">
                {invoices.length} Bills
              </span>
            </div>
            <div className="p-3.5">
              <span className="text-[11px] text-slate-500 font-semibold block">Credit Terms</span>
              <span className="font-mono font-black text-indigo-900 text-sm mt-0.5 block">
                {portalData?.creditDays ? `${portalData.creditDays} Days` : 'Standard'}
              </span>
            </div>
            <div className="p-3.5">
              <span className="text-[11px] text-slate-500 font-semibold block">Account Status</span>
              <span className="font-black text-emerald-700 text-sm mt-0.5 block">
                {portalData?.portalEnabled !== false ? 'Active' : 'Suspended'}
              </span>
            </div>
            <div className="p-3.5">
              <span className="text-[11px] text-slate-500 font-semibold block">Last Synced</span>
              <span className="font-medium text-slate-600 text-xs mt-0.5 block">
                {portalData?.lastUpdated ? formatDate(portalData.lastUpdated) : 'Realtime'}
              </span>
            </div>
          </div>
        </div>

        {/* =================================================================== */}
        {/* 3. NAVIGATION TABS & DUAL SEARCH / DATE-RANGE FILTER CONTROLS      */}
        {/* =================================================================== */}
        <div className="space-y-3">
          {/* Top Row: Branded Tab Pills */}
          <div className="flex bg-slate-200/80 p-1 rounded-xl gap-1.5 text-xs font-bold w-fit">
            <button
              type="button"
              onClick={() => setActiveTab('invoices')}
              className={`px-4 py-2.5 rounded-lg transition flex items-center gap-2 cursor-pointer ${
                activeTab === 'invoices'
                  ? 'bg-[#071F49] text-white shadow-sm'
                  : 'text-slate-700 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              <Receipt className={`w-4 h-4 ${activeTab === 'invoices' ? 'text-[#F5B51B]' : 'text-slate-500'}`} />
              <span>Invoices & Bills ({invoices.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('ledger')}
              className={`px-4 py-2.5 rounded-lg transition flex items-center gap-2 cursor-pointer ${
                activeTab === 'ledger'
                  ? 'bg-[#071F49] text-white shadow-sm'
                  : 'text-slate-700 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              <Wallet className={`w-4 h-4 ${activeTab === 'ledger' ? 'text-[#F5B51B]' : 'text-slate-500'}`} />
              <span>Khata Ledger ({ledgerEntries.length})</span>
            </button>
          </div>

          {/* Bottom Filter Box: Dual Options (Text Search + Date Range [From Date -> To Date]) */}
          <div className="bg-white p-3.5 rounded-2xl border border-slate-200/90 shadow-xs space-y-3">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              {/* Option 1: Search by Invoice #, Book Title, or Publisher */}
              <div className="relative flex-1 min-w-[220px]">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Option 1: Search by Invoice #, Book, or Publisher..."
                  className="w-full pl-9 pr-8 py-2 bg-slate-50/70 hover:bg-slate-50 focus:bg-white rounded-xl border border-slate-300 text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#071F49] focus:border-transparent transition"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-0.5 cursor-pointer"
                    title="Clear text search"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Option 2: Date Range Filter [From Date -> To Date] */}
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <div className="flex items-center gap-1 text-xs bg-slate-50 px-2.5 py-1.5 rounded-xl border border-slate-200">
                  <Calendar className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span className="font-bold text-slate-600 text-[11px]">From:</span>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="bg-transparent text-xs font-semibold text-slate-800 focus:outline-none cursor-pointer"
                    title="Filter invoices starting from this date"
                  />
                </div>

                <div className="flex items-center gap-1 text-xs bg-slate-50 px-2.5 py-1.5 rounded-xl border border-slate-200">
                  <Calendar className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span className="font-bold text-slate-600 text-[11px]">To:</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="bg-transparent text-xs font-semibold text-slate-800 focus:outline-none cursor-pointer"
                    title="Filter invoices up to this date"
                  />
                </div>

                {/* Quick Presets */}
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={handleThisMonthPreset}
                    className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[11px] font-bold transition cursor-pointer"
                    title="Show bills from 1st of this month"
                  >
                    This Month
                  </button>
                  <button
                    type="button"
                    onClick={handleLast30DaysPreset}
                    className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[11px] font-bold transition cursor-pointer"
                    title="Show bills from the last 30 days"
                  >
                    Last 30d
                  </button>

                  {hasActiveFilters && (
                    <button
                      type="button"
                      onClick={handleClearFilters}
                      className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg text-[11px] font-bold transition flex items-center gap-1 cursor-pointer border border-rose-200"
                      title="Reset all search filters"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Reset</span>
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Active Filter Summary Bar */}
            {hasActiveFilters && (
              <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-100">
                <span className="flex items-center gap-1.5 font-medium">
                  <Filter className="w-3 h-3 text-[#071F49]" />
                  <span>
                    Showing filtered results: <strong>{activeTab === 'invoices' ? filteredInvoices.length : filteredLedger.length}</strong> matching records
                  </span>
                </span>
                <button
                  type="button"
                  onClick={handleClearFilters}
                  className="text-rose-600 hover:text-rose-800 font-bold hover:underline cursor-pointer"
                >
                  Clear all filters
                </button>
              </div>
            )}
          </div>
        </div>

        {/* =================================================================== */}
        {/* 4. TAB 1: INVOICES (WITH 12-HOUR FORMAT DATE & TIME)                */}
        {/* =================================================================== */}
        {activeTab === 'invoices' && (
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm text-[#071F49]">Official Sales Invoices</h3>
                <p className="text-xs text-slate-500">
                  Click on any invoice to view its itemized books, rates, discounts, and print bill.
                </p>
              </div>

              <button
                type="button"
                onClick={loadPortalContent}
                className="p-1.5 text-slate-500 hover:text-[#071F49] rounded-lg hover:bg-slate-200 transition cursor-pointer"
                title="Refresh Invoices"
              >
                <RefreshCw className={`w-4 h-4 ${isLoadingData ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {filteredInvoices.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs">
                {hasActiveFilters
                  ? 'No invoices match your selected search or date range.'
                  : 'No invoices recorded for this customer account.'}
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {filteredInvoices.map((inv) => {
                  const isPaid = inv.paymentStatus === 'paid';
                  const isPartial = inv.paymentStatus === 'partial';

                  return (
                    <div
                      key={inv.id}
                      onClick={() => setSelectedInvoice(inv)}
                      className={`p-4 sm:p-5 hover:bg-slate-50/80 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer group border-l-4 ${
                        isPaid
                          ? 'border-l-emerald-500'
                          : isPartial
                          ? 'border-l-amber-500'
                          : 'border-l-rose-500'
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono font-black text-sm sm:text-base text-[#071F49] group-hover:underline">
                            {inv.invoiceNo}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                              isPaid
                                ? 'bg-emerald-100 text-emerald-800'
                                : isPartial
                                ? 'bg-amber-100 text-amber-900'
                                : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {isPaid ? 'Paid' : isPartial ? 'Partial Paid' : 'Unpaid (Khata)'}
                          </span>
                        </div>

                        {/* DATE & TIME IN 12-HOUR FORMAT (09:16 AM/PM) */}
                        <div className="flex flex-wrap items-center gap-2.5 text-xs text-slate-500">
                          <span className="flex items-center gap-1 font-bold text-slate-800">
                            <Calendar className="w-3.5 h-3.5 text-amber-600" />
                            <span>{formatInvoiceDisplayDateTime(inv.saleDate, inv.createdAt)}</span>
                          </span>
                          <span>•</span>
                          <span className="flex items-center gap-1 font-medium">
                            <BookOpen className="w-3.5 h-3.5 text-slate-400" />
                            {inv.itemsCount} Items
                          </span>
                          {inv.dueDate && (
                            <>
                              <span>•</span>
                              <span className="flex items-center gap-1 text-amber-800 font-semibold">
                                <Clock className="w-3.5 h-3.5" />
                                Due: {formatDate(inv.dueDate)}
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-4 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                        <div className="text-left sm:text-right">
                          <span className="text-[10px] text-slate-400 font-semibold block uppercase">
                            Grand Total
                          </span>
                          <div className="font-mono font-bold text-base text-slate-900">
                            {formatCurrency(inv.grandTotal)}
                          </div>
                          {inv.totalDiscount > 0 && (
                            <span className="text-[10.5px] text-emerald-700 font-medium block">
                              Saved {formatCurrency(inv.totalDiscount)} discount
                            </span>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedInvoice(inv);
                          }}
                          className="px-3.5 py-1.5 bg-[#071F49] hover:bg-[#0c2f6d] active:scale-95 text-white text-xs font-bold rounded-lg transition shadow-xs flex items-center gap-1.5 cursor-pointer shrink-0"
                        >
                          <FileText className="w-3.5 h-3.5 text-[#F5B51B]" />
                          <span>View Bill</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* =================================================================== */}
        {/* 5. TAB 2: KHATA LEDGER STATEMENT                                   */}
        {/* =================================================================== */}
        {activeTab === 'ledger' && (
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm text-[#071F49]">Complete Khata Ledger Statement</h3>
                <p className="text-xs text-slate-500">
                  Chronological record of all purchases, payments, and running balance.
                </p>
              </div>

              <button
                type="button"
                onClick={loadPortalContent}
                className="p-1.5 text-slate-500 hover:text-[#071F49] rounded-lg hover:bg-slate-200 transition cursor-pointer"
                title="Refresh Ledger"
              >
                <RefreshCw className={`w-4 h-4 ${isLoadingData ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {filteredLedger.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs">
                {hasActiveFilters
                  ? 'No ledger transactions match your selected search or date range.'
                  : 'No ledger transactions recorded yet.'}
              </div>
            ) : (
              <div>
                {/* Mobile Cards (< 640px) */}
                <div className="divide-y divide-slate-100 sm:hidden">
                  {filteredLedger.map((entry) => {
                    const isDebit = entry.debit > 0;
                    return (
                      <div key={entry.id} className="p-4 space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-mono font-bold text-[#071F49]">
                            {entry.reference}
                          </span>
                          <span className="font-mono text-slate-500 text-[11px]">
                            {formatDate(entry.date)}
                          </span>
                        </div>

                        <p className="text-xs text-slate-800 font-medium">
                          {entry.description}
                        </p>

                        <div className="flex items-center justify-between pt-1">
                          <div>
                            {isDebit ? (
                              <span className="inline-flex items-center gap-1 text-xs font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                                <ArrowUpRight className="w-3.5 h-3.5" />
                                Debit: {formatCurrency(entry.debit)}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                <ArrowDownLeft className="w-3.5 h-3.5" />
                                Paid: {formatCurrency(entry.credit)}
                              </span>
                            )}
                          </div>

                          <div className="text-right">
                            <span className="text-[10px] text-slate-400 block font-semibold">Balance:</span>
                            <span className="font-mono font-bold text-xs text-slate-900">
                              {formatCurrency(entry.runningBalance)}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Desktop Table (>= 640px) */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-100 text-slate-700 uppercase font-bold tracking-wider text-[11px] border-b border-slate-200">
                        <th className="py-3 px-4">Date</th>
                        <th className="py-3 px-4">Reference</th>
                        <th className="py-3 px-4">Description</th>
                        <th className="py-3 px-4 text-right">Debit (Purchases)</th>
                        <th className="py-3 px-4 text-right">Credit (Payments)</th>
                        <th className="py-3 px-4 text-right">Running Balance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredLedger.map((entry) => (
                        <tr key={entry.id} className="hover:bg-slate-50 transition">
                          <td className="py-3 px-4 font-mono text-slate-600 whitespace-nowrap">
                            {formatDate(entry.date)}
                          </td>
                          <td className="py-3 px-4 font-mono font-bold text-[#071F49] whitespace-nowrap">
                            {entry.reference}
                          </td>
                          <td className="py-3 px-4 font-medium text-slate-800">
                            {entry.description}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-rose-700 whitespace-nowrap">
                            {entry.debit > 0 ? formatCurrency(entry.debit) : '—'}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-emerald-700 whitespace-nowrap">
                            {entry.credit > 0 ? formatCurrency(entry.credit) : '—'}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-black text-slate-900 whitespace-nowrap">
                            {formatCurrency(entry.runningBalance)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* =================================================================== */}
      {/* 6. INVOICE DETAILS MODAL (WITH 12-HOUR FORMAT DATE & TIME)          */}
      {/* =================================================================== */}
      {selectedInvoice && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[92vh] flex flex-col border border-slate-200 overflow-hidden my-auto">
            {/* Modal Header */}
            <div
              className="px-5 py-4 text-white flex items-center justify-between shrink-0"
              style={{ background: 'linear-gradient(135deg, #071F49 0%, #0E2E70 100%)' }}
            >
              <div className="flex items-center gap-2.5">
                <FileText className="w-5 h-5 text-[#F5B51B]" />
                <div>
                  <h3 className="font-bold text-sm text-white leading-tight">
                    Invoice Details • {selectedInvoice.invoiceNo}
                  </h3>
                  <span className="text-[11px] text-amber-200">
                    Official Sadiq Book Agency Sales Invoice
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePrint}
                  className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer border border-white/20"
                >
                  <Printer className="w-3.5 h-3.5 text-[#F5B51B]" />
                  <span>Print</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedInvoice(null)}
                  className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Content */}
            <div className="p-5 overflow-y-auto space-y-4 text-xs">
              {/* Meta Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Customer</span>
                  <span className="font-bold text-slate-900">{customerName}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Date & Time</span>
                  <span className="font-bold text-slate-900">
                    {formatInvoiceDisplayDateTime(selectedInvoice.saleDate, selectedInvoice.createdAt)}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Payment Mode</span>
                  <span className="font-bold text-slate-900 uppercase">{selectedInvoice.paymentMethod}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Status</span>
                  <span className="font-bold text-emerald-700 uppercase">{selectedInvoice.paymentStatus}</span>
                </div>
              </div>

              {/* Items List (Mobile) */}
              <div className="sm:hidden space-y-2">
                {(selectedInvoice.items || []).map((item, idx) => (
                  <div key={idx} className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="font-bold text-slate-900 text-xs block">
                          {idx + 1}. {item.productName}
                        </span>
                        <div className="flex items-center gap-2 text-[10.5px] text-slate-500 mt-0.5">
                          <span>{item.publisherName || '—'}</span>
                          {item.seriesName && item.seriesName !== '—' && (
                            <>
                              <span>•</span>
                              <span>{item.seriesName}</span>
                            </>
                          )}
                          {item.targetClass && item.targetClass !== '—' && (
                            <span className="px-1.5 py-0.2 rounded bg-amber-100 text-amber-900 font-bold text-[9px]">
                              {item.targetClass}
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="font-mono font-bold text-xs text-slate-900 shrink-0">
                        {formatCurrency(item.lineTotal)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-slate-200 text-[10.5px] text-slate-600 font-mono">
                      <span>Qty: <strong className="text-slate-900">{item.quantity}</strong></span>
                      <span>MRP: {formatCurrency(item.mrp)}</span>
                      {item.discountPercent > 0 && (
                        <span className="text-amber-800 font-bold">-{item.discountPercent}%</span>
                      )}
                      <span>Rate: <strong>{formatCurrency(item.sellingPrice)}</strong></span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Items Table (Desktop) */}
              <div className="hidden sm:block border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-[#071F49] text-white text-[11px] font-bold">
                      <th className="py-2.5 px-3 w-10 text-center">#</th>
                      <th className="py-2.5 px-3">Book Title / Item Description</th>
                      <th className="py-2.5 px-3">Publisher & Series</th>
                      <th className="py-2.5 px-3 text-center">Class</th>
                      <th className="py-2.5 px-3 text-center">Qty</th>
                      <th className="py-2.5 px-3 text-right">MRP (Rs)</th>
                      <th className="py-2.5 px-3 text-center">Disc %</th>
                      <th className="py-2.5 px-3 text-right">Rate (Rs)</th>
                      <th className="py-2.5 px-3 text-right">Amount (Rs)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {(selectedInvoice.items || []).map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50 transition">
                        <td className="py-2 px-3 text-center font-mono text-slate-400 font-bold">
                          {idx + 1}
                        </td>
                        <td className="py-2 px-3 font-bold text-slate-900">
                          {item.productName}
                          <span className="block font-mono text-[10px] text-slate-400 font-normal">
                            SKU: {item.sku}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-slate-700">
                          {item.publisherName || '—'}
                          {item.seriesName && item.seriesName !== '—' && (
                            <span className="text-slate-500 text-[10.5px] block">
                              {item.seriesName}
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-center">
                          {item.targetClass && item.targetClass !== '—' ? (
                            <span className="px-1.5 py-0.5 rounded bg-slate-100 font-bold text-slate-800 text-[10px]">
                              {item.targetClass}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="py-2 px-3 text-center font-mono font-bold text-slate-900">
                          {item.quantity}
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-slate-600">
                          {formatCurrency(item.mrp)}
                        </td>
                        <td className="py-2 px-3 text-center font-mono font-bold text-amber-700">
                          {item.discountPercent ? `${item.discountPercent}%` : '0%'}
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-slate-800">
                          {formatCurrency(item.sellingPrice)}
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-black text-slate-900">
                          {formatCurrency(item.lineTotal)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Financial Calculation Box */}
              <div className="flex justify-end pt-1">
                <div className="w-full sm:w-72 space-y-1.5 p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                  <div className="flex justify-between text-slate-600">
                    <span>Gross MRP Subtotal:</span>
                    <span className="font-mono">{formatCurrency(selectedInvoice.subtotal)}</span>
                  </div>
                  {selectedInvoice.totalDiscount > 0 && (
                    <div className="flex justify-between text-emerald-700 font-bold">
                      <span>Total Discount Saved:</span>
                      <span className="font-mono">-{formatCurrency(selectedInvoice.totalDiscount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-base font-black text-[#071F49] pt-2 border-t border-slate-200">
                    <span>Grand Total:</span>
                    <span className="font-mono">{formatCurrency(selectedInvoice.grandTotal)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs shrink-0">
              <span className="text-slate-400 text-[11px] font-medium hidden sm:inline">
                Verified Sadiq Book Agency Sales Invoice • Strictly Read-Only
              </span>
              <button
                type="button"
                onClick={() => setSelectedInvoice(null)}
                className="w-full sm:w-auto px-5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded-xl transition cursor-pointer"
              >
                Close Bill
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. Footer */}
      <footer className="bg-white border-t border-slate-200 py-4 px-4 text-center text-xs text-slate-500 mt-auto">
        <p className="font-bold text-slate-800">
          {STORE_CONTACT_DETAILS.name} • {STORE_CONTACT_DETAILS.address}
        </p>
        <p className="text-[11px] text-slate-400 mt-0.5">
          Phone: {STORE_CONTACT_DETAILS.phones.join(' | ')}
        </p>
      </footer>
    </div>
  );
};
