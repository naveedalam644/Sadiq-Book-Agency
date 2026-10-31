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
  Info,
  Layers,
  Database,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { PageHeader } from '../components/common/PageHeader';
import { StatCard } from '../components/common/StatCard';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/common/Card';
import { Badge } from '../components/common/Badge';
import { EmptyState } from '../components/feedback/EmptyState';
import { AlertBanner } from '../components/feedback/AlertBanner';
import { getGreetingByTime } from '../utils/formatters';

export const Dashboard: React.FC = () => {
  const { currentUser, isFirebaseReady } = useAuth();
  const businessName =
    import.meta.env.VITE_BUSINESS_NAME || 'Bookstore & Stationers';
  const greeting = getGreetingByTime();

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title={`${greeting}, ${currentUser?.displayName || 'Store Administrator'}`}
        description={`Welcome to ${businessName}. Your Phase 1 foundation, authentication, and database schemas are configured and active.`}
        badge={
          <Badge variant="brand" size="md">
            <Sparkles className="w-3.5 h-3.5 mr-1" />
            Phase 1 Foundation
          </Badge>
        }
        actions={
          <Link
            to="/system-status"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 transition shadow-xs"
          >
            <Server className="w-4 h-4 text-brand-600" />
            <span>Check Firebase & System</span>
          </Link>
        }
      />

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

      {/* 4 Empty Metric Cards (Strict Rule: No fake sales, profits, or balances) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Products"
          value="0"
          subtitle="Books & Stationery catalog"
          icon={<BookOpen className="w-5 h-5" />}
          iconBgColor="bg-blue-50 text-blue-600"
          badgeText="Phase 2"
          badgeVariant="info"
          isPlaceholder
        />

        <StatCard
          title="Registered Customers"
          value="0"
          subtitle="Wholesale, Parchon, Marketshop"
          icon={<Users className="w-5 h-5" />}
          iconBgColor="bg-emerald-50 text-emerald-600"
          badgeText="Phase 3"
          badgeVariant="success"
          isPlaceholder
        />

        <StatCard
          title="Today's Sales Invoices"
          value="0"
          subtitle="Counter POS & receipts"
          icon={<Receipt className="w-5 h-5" />}
          iconBgColor="bg-purple-50 text-purple-600"
          badgeText="Phase 4"
          badgeVariant="neutral"
          isPlaceholder
        />

        <StatCard
          title="Customer Khata (Udhaar)"
          value="PKR 0"
          subtitle="Outstanding credit balance"
          icon={<Wallet className="w-5 h-5" />}
          iconBgColor="bg-amber-50 text-amber-600"
          badgeText="Phase 3"
          badgeVariant="warning"
          isPlaceholder
        />
      </div>

      {/* Main Grid: Quick Actions & Recent Activity Placeholder */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quick Actions (1 column) */}
        <Card className="lg:col-span-1 flex flex-col">
          <CardHeader>
            <div>
              <CardTitle>Phase 1 Quick Actions</CardTitle>
              <CardDescription>Administrative controls & readiness</CardDescription>
            </div>
            <Badge variant="brand" size="sm">Active</Badge>
          </CardHeader>
          <CardContent className="space-y-3 flex-1">
            <Link
              to="/system-status"
              className="flex items-center justify-between p-3 rounded-lg border border-slate-200/80 hover:border-brand-500 hover:bg-brand-50/40 transition group"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-slate-100 text-slate-700 group-hover:bg-brand-100 group-hover:text-brand-700 transition">
                  <Server className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs sm:text-sm font-semibold text-slate-800">
                    Verify Firebase Connection
                  </h4>
                  <p className="text-[11px] text-slate-500">Inspect credentials & status</p>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-brand-600 group-hover:translate-x-0.5 transition" />
            </Link>

            <div className="p-3 rounded-lg border border-slate-200/80 bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-emerald-100 text-emerald-700">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs sm:text-sm font-semibold text-slate-800">
                    Firestore Security Rules
                  </h4>
                  <p className="text-[11px] text-slate-500">Configured in firestore.rules</p>
                </div>
              </div>
            </div>

            <div className="p-3 rounded-lg border border-slate-200/80 bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-100 text-blue-700">
                  <Database className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs sm:text-sm font-semibold text-slate-800">
                    13 Collections Architecture
                  </h4>
                  <p className="text-[11px] text-slate-500">Documented & type-safe</p>
                </div>
              </div>
            </div>

            <div className="mt-4 p-3 rounded-lg bg-slate-100/70 border border-slate-200 text-slate-600 text-xs">
              <div className="flex items-center gap-1.5 font-semibold text-slate-800 mb-1">
                <Info className="w-3.5 h-3.5 text-brand-600" />
                <span>Strict Phase 1 Boundary</span>
              </div>
              Business transaction modules (purchases, POS sales, and Khata ledger) will unlock in Phase 2 through Phase 7.
            </div>
          </CardContent>
        </Card>

        {/* Recent Activity Placeholder (2 columns) */}
        <Card className="lg:col-span-2 flex flex-col">
          <CardHeader>
            <div>
              <CardTitle>Recent Activity Log</CardTitle>
              <CardDescription>Real-time audit records of system and business events</CardDescription>
            </div>
            <div className="flex items-center gap-1 text-xs text-slate-400">
              <Clock className="w-3.5 h-3.5" />
              <span>Real-time</span>
            </div>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col justify-center">
            {/* Empty State placeholder - strictly no fake data */}
            <EmptyState
              icon={<Clock className="w-8 h-8 text-slate-400" />}
              title="No Recent Activity Yet"
              description="System initialized in Phase 1. As you authenticate and subsequent phases add products, customers, and sales, live audit events will populate here."
              phaseBadge="Phase 1 Ready"
            />
          </CardContent>
        </Card>
      </div>

      {/* Implementation Roadmap Overview Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-brand-600" />
            <div>
              <CardTitle>Bookstore Project Phased Roadmap</CardTitle>
              <CardDescription>
                Architected for high precision inventory, customer categories, and accounting
              </CardDescription>
            </div>
          </div>
          <Badge variant="brand" size="sm">Phase 1 Completed</Badge>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            <div className="p-3 rounded-lg bg-brand-50/60 border border-brand-200">
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-brand-900">Phase 1: Foundation</span>
                <span className="text-[10px] font-bold text-brand-700 bg-brand-200/60 px-1.5 py-0.5 rounded">Active</span>
              </div>
              <p className="text-slate-600 text-[11px] leading-relaxed">
                Vite + React + Tailwind + Firebase Auth + Security Rules + Responsive Shell.
              </p>
            </div>

            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-slate-800">Phase 2: Inventory</span>
                <span className="text-[10px] text-slate-500 bg-slate-200 px-1.5 py-0.5 rounded">Upcoming</span>
              </div>
              <p className="text-slate-500 text-[11px] leading-relaxed">
                Books, Notebooks, barcodes, categories, and stock movement logs.
              </p>
            </div>

            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-slate-800">Phase 3: Customer Khata</span>
                <span className="text-[10px] text-slate-500 bg-slate-200 px-1.5 py-0.5 rounded">Upcoming</span>
              </div>
              <p className="text-slate-500 text-[11px] leading-relaxed">
                Wholesaler, Parchon, Marketshop (custom discounts) & Udhaar balance.
              </p>
            </div>

            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-slate-800">Phase 4-7: POS & Reports</span>
                <span className="text-[10px] text-slate-500 bg-slate-200 px-1.5 py-0.5 rounded">Upcoming</span>
              </div>
              <p className="text-slate-500 text-[11px] leading-relaxed">
                Thermal billing, purchases, expenses, daily cash closing, P&L, and backups.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
