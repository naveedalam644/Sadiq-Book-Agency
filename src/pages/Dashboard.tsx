import React from 'react';
import { Link } from 'react-router-dom';
import {
  BookOpen,
  Users,
  Receipt,
  Wallet,
  Server,
  ShieldCheck,
  ArrowRight,
  Clock,
  Sparkles,
  Layers,
  Database,
  TrendingUp,
  CreditCard,
  Banknote,
  CheckCircle2,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { StatCard } from '../components/common/StatCard';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/common/Card';
import { Badge } from '../components/common/Badge';
import { EmptyState } from '../components/feedback/EmptyState';
import { AlertBanner } from '../components/feedback/AlertBanner';
import { getGreetingByTime } from '../utils/formatters';

export const Dashboard: React.FC = () => {
  const { currentUser, isFirebaseReady } = useAuth();
  const greeting = getGreetingByTime();

  return (
    <div className="space-y-6">
      {/* 1. SADIQ BOOK AGENCY ATTRACTIVE WELCOME BANNER */}
      <div className="relative overflow-hidden rounded-2xl bg-[#071F49] text-white shadow-xl border-b-4 border-[#F5B51B]">
        {/* Subtle decorative background gradient accents */}
        <div className="absolute -right-16 -top-16 w-64 h-64 rounded-full bg-[#F5B51B]/10 blur-3xl pointer-events-none" />
        <div className="absolute right-32 -bottom-20 w-48 h-48 rounded-full bg-[#1D53C2]/20 blur-2xl pointer-events-none" />

        <div className="relative p-6 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
          {/* Logo & Welcome text */}
          <div className="flex items-center gap-4 sm:gap-5">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-white p-2 shadow-lg ring-4 ring-[#F5B51B]/30 shrink-0 flex items-center justify-center">
              <img
                src="/images/sadiq-book-agency-logo.png"
                alt="Sadiq Book Agency Logo"
                className="w-full h-full object-contain"
              />
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="text-xs sm:text-sm font-semibold text-[#F5B51B] uppercase tracking-wider">
                  {greeting}, {currentUser?.displayName || 'Store Administrator'}
                </span>
                <span className="inline-flex items-center gap-1 text-[11px] font-bold bg-[#F5B51B] text-[#071F49] px-2 py-0.5 rounded-full">
                  <Sparkles className="w-3 h-3 text-[#071F49]" />
                  Phase 1 Active
                </span>
              </div>

              <h1 className="text-xl sm:text-3xl font-black text-white tracking-tight">
                SADIQ BOOK AGENCY
              </h1>
              <p className="text-xs sm:text-sm text-slate-300 font-medium mt-0.5">
                Notebooks • Registers • Stationery | Complete Accounting & Management Portal
              </p>
            </div>
          </div>

          {/* Quick status pill buttons */}
          <div className="flex items-center gap-3 shrink-0 flex-wrap">
            <Link
              to="/system-status"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-[#F5B51B] text-[#071F49] hover:bg-[#F8CE4E] transition-all shadow-md shadow-[#F5B51B]/20 active:scale-95"
            >
              <Server className="w-4 h-4 text-[#071F49]" />
              <span>System & Firebase Status</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Firebase Status Alert if unconfigured */}
      {!isFirebaseReady && (
        <AlertBanner
          variant="warning"
          title="Firebase Connection Action Required"
          message={
            <span>
              The application is running with default development placeholder settings. To connect to your live Firebase project, please populate your credentials in <code className="bg-amber-100 px-1 py-0.5 rounded font-mono text-xs">.env</code>. See <Link to="/system-status" className="underline font-semibold">Firebase & System Status</Link> for detailed steps.
            </span>
          }
        />
      )}

      {/* 2. FOUR CLEAN WHITE STATISTIC CARDS (Genuine zero values - Strict no fake data) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Products Catalog"
          value="0"
          subtitle="Books, Registers & Stationery items"
          icon={<BookOpen className="w-5 h-5 text-[#071F49]" />}
          iconBgColor="bg-[#071F49]/10 text-[#071F49]"
          badgeText="Phase 2"
          badgeVariant="info"
          isPlaceholder
        />

        <StatCard
          title="Registered Customers"
          value="0"
          subtitle="Wholesale, Parchon & Marketshops"
          icon={<Users className="w-5 h-5 text-[#071F49]" />}
          iconBgColor="bg-[#F5B51B]/20 text-[#071F49]"
          badgeText="Phase 3"
          badgeVariant="warning"
          isPlaceholder
        />

        <StatCard
          title="Today's Sales Invoices"
          value="0"
          subtitle="Counter POS & thermal receipts"
          icon={<Receipt className="w-5 h-5 text-[#071F49]" />}
          iconBgColor="bg-blue-50 text-blue-700"
          badgeText="Phase 4"
          badgeVariant="neutral"
          isPlaceholder
        />

        <StatCard
          title="Customer Khata (Udhaar)"
          value="PKR 0"
          subtitle="Outstanding credit receivable"
          icon={<Wallet className="w-5 h-5 text-amber-700" />}
          iconBgColor="bg-amber-50 text-amber-700"
          badgeText="Phase 3"
          badgeVariant="warning"
          isPlaceholder
        />
      </div>

      {/* 3. SALES OVERVIEW & RECENT ACTIVITY SECTIONS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sales Overview Section (2 columns on desktop) */}
        <Card className="lg:col-span-2 flex flex-col border border-slate-200/90 shadow-sm rounded-2xl">
          <CardHeader>
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-[#071F49]/10 text-[#071F49]">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div>
                <CardTitle className="text-base font-bold text-[#071F49]">
                  Sales & POS Counter Overview
                </CardTitle>
                <CardDescription>
                  Daily turnover breakdown across Wholesaler, Parchon, and Marketshop sales
                </CardDescription>
              </div>
            </div>
            <span className="text-[11px] font-bold text-[#071F49] bg-[#F5B51B]/20 border border-[#F5B51B]/50 px-2.5 py-1 rounded-lg">
              Phase 4 Module
            </span>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col justify-between pt-4">
            {/* 3 Metric Pills */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
              <div className="p-3.5 rounded-xl bg-[#F4F7FB] border border-slate-200/80">
                <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold mb-1">
                  <Banknote className="w-4 h-4 text-[#071F49]" />
                  <span>Today's Cash Sales</span>
                </div>
                <div className="text-lg font-bold text-slate-400 font-mono">PKR 0.00</div>
                <div className="text-[10px] text-slate-400 mt-0.5">Parchon walk-in tender</div>
              </div>

              <div className="p-3.5 rounded-xl bg-[#F4F7FB] border border-slate-200/80">
                <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold mb-1">
                  <CreditCard className="w-4 h-4 text-[#F5B51B]" />
                  <span>Credit Sales (Udhaar)</span>
                </div>
                <div className="text-lg font-bold text-slate-400 font-mono">PKR 0.00</div>
                <div className="text-[10px] text-slate-400 mt-0.5">Wholesale & Marketshops</div>
              </div>

              <div className="p-3.5 rounded-xl bg-[#F4F7FB] border border-slate-200/80">
                <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold mb-1">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Completed Bills</span>
                </div>
                <div className="text-lg font-bold text-slate-400 font-mono">0 Invoices</div>
                <div className="text-[10px] text-slate-400 mt-0.5">Thermal printed today</div>
              </div>
            </div>

            {/* Empty State placeholder explaining Phase 4 */}
            <EmptyState
              icon={<TrendingUp className="w-8 h-8 text-[#071F49]" />}
              title="Awaiting Point-of-Sale Activation"
              description="Real-time sales charts, category trends, and daily turnover will populate automatically when counter billing is activated in Phase 4."
              phaseBadge="Phase 4 Upcoming"
            />
          </CardContent>
        </Card>

        {/* Recent Activity & Audit Log Section (1 column on desktop) */}
        <Card className="lg:col-span-1 flex flex-col border border-slate-200/90 shadow-sm rounded-2xl">
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-[#071F49]/10 text-[#071F49]">
                <Clock className="w-4 h-4" />
              </div>
              <div>
                <CardTitle className="text-sm font-bold text-[#071F49]">
                  Recent Activity Log
                </CardTitle>
                <CardDescription>System and administrative audit events</CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-400">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span>Live</span>
            </div>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col justify-center pt-2">
            <EmptyState
              icon={<Clock className="w-7 h-7 text-slate-400" />}
              title="No Recent Activity Yet"
              description="System initialized for Sadiq Book Agency. Authenticated operations and future catalog events will record here."
              phaseBadge="Phase 1 Ready"
            />
          </CardContent>
        </Card>
      </div>

      {/* 4. QUICK ACTIONS & ARCHITECTURAL CHECKS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link
          to="/system-status"
          className="flex items-center justify-between p-4 rounded-2xl bg-white border border-slate-200/90 hover:border-[#F5B51B] hover:shadow-md transition-all group"
        >
          <div className="flex items-center gap-3.5">
            <div className="p-3 rounded-xl bg-[#071F49] text-white group-hover:bg-[#F5B51B] group-hover:text-[#071F49] transition-colors">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-[#071F49] group-hover:text-[#071F49]">
                Verify Firebase Diagnostics
              </h4>
              <p className="text-xs text-slate-500">Inspect project credentials & status</p>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-[#F5B51B] group-hover:translate-x-1 transition-all" />
        </Link>

        <div className="flex items-center gap-3.5 p-4 rounded-2xl bg-white border border-slate-200/90 shadow-xs">
          <div className="p-3 rounded-xl bg-emerald-50 text-emerald-700">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-800">
              Firestore Zero-Trust Rules
            </h4>
            <p className="text-xs text-slate-500">Active via firestore.rules</p>
          </div>
        </div>

        <div className="flex items-center gap-3.5 p-4 rounded-2xl bg-white border border-slate-200/90 shadow-xs">
          <div className="p-3 rounded-xl bg-blue-50 text-blue-700">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-800">
              13 Collections Architecture
            </h4>
            <p className="text-xs text-slate-500">Documented & cost-optimized</p>
          </div>
        </div>
      </div>

      {/* 5. SADIQ BOOK AGENCY IMPLEMENTATION ROADMAP */}
      <Card className="rounded-2xl border border-slate-200/90 shadow-sm">
        <CardHeader>
          <div className="flex items-center gap-2.5">
            <Layers className="w-5 h-5 text-[#071F49]" />
            <div>
              <CardTitle className="text-base font-bold text-[#071F49]">
                Sadiq Book Agency Phased Roadmap
              </CardTitle>
              <CardDescription>
                Designed for high-precision books, notebooks, registers, and customer Khata accounting
              </CardDescription>
            </div>
          </div>
          <Badge variant="brand" size="sm">Phase 1 Complete</Badge>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            <div className="p-3.5 rounded-xl bg-[#071F49] text-white border border-[#0E2E70]">
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-bold text-white">Phase 1: Foundation</span>
                <span className="text-[10px] font-bold bg-[#F5B51B] text-[#071F49] px-2 py-0.5 rounded-full">
                  Active
                </span>
              </div>
              <p className="text-slate-300 text-[11px] leading-relaxed">
                Sadiq Book Agency theme + Firebase Auth + Security Rules + Responsive Shell.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-white border border-slate-200">
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-bold text-slate-800">Phase 2: Inventory</span>
                <span className="text-[10px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full font-semibold">
                  Upcoming
                </span>
              </div>
              <p className="text-slate-500 text-[11px] leading-relaxed">
                Books, Notebooks, Registers, barcodes, SKU generator, and stock logs.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-white border border-slate-200">
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-bold text-slate-800">Phase 3: Customer Khata</span>
                <span className="text-[10px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full font-semibold">
                  Upcoming
                </span>
              </div>
              <p className="text-slate-500 text-[11px] leading-relaxed">
                Wholesaler, Parchon, Marketshop (individual % discounts) & Udhaar ledger.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-white border border-slate-200">
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-bold text-slate-800">Phase 4-7: POS & Reports</span>
                <span className="text-[10px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full font-semibold">
                  Upcoming
                </span>
              </div>
              <p className="text-slate-500 text-[11px] leading-relaxed">
                Thermal billing, supplier intake, daily cash closing, P&L, and backups.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
