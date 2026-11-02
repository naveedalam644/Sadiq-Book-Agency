import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  BookOpen,
  Receipt,
  Server,
  ArrowRight,
  Sparkles,
  Layers,
  AlertTriangle,
  Building2,
  Package,
  Coins,
  Plus,
  CheckCircle2,
  Eye,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { StatCard } from '../components/common/StatCard';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/common/Card';
import { Badge } from '../components/common/Badge';
import { AlertBanner } from '../components/feedback/AlertBanner';
import { EmptyState } from '../components/feedback/EmptyState';
import { PurchaseDetailModal } from '../components/purchases/PurchaseDetailModal';
import { ProductDetailModal } from '../components/inventory/ProductDetailModal';
import { fetchDashboardData, type DashboardData } from '../services/dashboardService';
import type { PurchaseDocument, ProductDocument } from '../types/database';
import { getGreetingByTime, formatCurrency, formatNumber } from '../utils/formatters';

export const Dashboard: React.FC = () => {
  const { currentUser } = useAuth();
  const greeting = getGreetingByTime();

  const [dashboardData, setDashboardData] = useState<DashboardData>({
    summary: {
      id: 'inventory_summary',
      totalProducts: 0,
      totalStockQuantity: 0,
      totalStockValue: 0,
      totalSuppliers: 0,
      lowStockCount: 0,
      updatedAt: new Date().toISOString(),
    },
    recentPurchases: [],
    lowStockProducts: [],
    isLoading: true,
  });

  const [viewingPurchase, setViewingPurchase] = useState<PurchaseDocument | null>(null);
  const [viewingProduct, setViewingProduct] = useState<ProductDocument | null>(null);

  useEffect(() => {
    let isMounted = true;
    fetchDashboardData()
      .then((data) => {
        if (isMounted) {
          setDashboardData({
            summary: data.summary,
            recentPurchases: data.recentPurchases,
            lowStockProducts: data.lowStockProducts,
            isLoading: false,
          });
        }
      })
      .catch((err) => {
        console.error('Failed to load dashboard data:', err);
        if (isMounted) {
          setDashboardData((prev) => ({ ...prev, isLoading: false }));
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const { summary, recentPurchases, lowStockProducts, isLoading } = dashboardData;

  return (
    <div className="space-y-6">
      {/* 1. SADIQ BOOK AGENCY ATTRACTIVE WELCOME BANNER */}
      <div className="relative overflow-hidden rounded-2xl bg-[#071F49] text-white shadow-xl border-b-4 border-[#F5B51B]">
        <div className="absolute -right-16 -top-16 w-64 h-64 rounded-full bg-[#F5B51B]/10 blur-3xl pointer-events-none" />
        <div className="absolute right-32 -bottom-20 w-48 h-48 rounded-full bg-[#1D53C2]/20 blur-2xl pointer-events-none" />

        <div className="relative p-6 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
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
                  Phase 2 Active
                </span>
              </div>

              <h1 className="text-xl sm:text-3xl font-black text-white tracking-tight">
                SADIQ BOOK AGENCY
              </h1>
              <p className="text-xs sm:text-sm text-slate-300 font-medium mt-0.5">
                Books • Notebooks • Registers • Stationery | Complete Inventory & Wholesale Accounting
              </p>
            </div>
          </div>

          {/* Quick Action Shortcuts */}
          <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
            <Link
              to="/inventory"
              className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-bold bg-[#F5B51B] text-[#071F49] hover:bg-[#F8CE4E] transition shadow-md shadow-[#F5B51B]/20 active:scale-95"
            >
              <Package className="w-4 h-4 text-[#071F49]" />
              <span>Catalog & Items</span>
            </Link>

            <Link
              to="/purchases"
              className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-bold bg-white text-[#071F49] hover:bg-slate-100 transition shadow-md active:scale-95"
            >
              <Plus className="w-4 h-4 text-[#071F49]" />
              <span>New Purchase</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Low-Stock Alert Warning Banner if any items triggered */}
      {summary.lowStockCount > 0 && (
        <AlertBanner
          variant="warning"
          title={`Low-Stock Reorder Notice: ${summary.lowStockCount} items need attention`}
          message={
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span>
                One or more products have reached or fallen below their minimum stock threshold. Review the low-stock inventory list below or initiate a purchase order.
              </span>
              <Link
                to="/inventory"
                className="underline font-bold text-amber-900 hover:text-amber-950 text-xs ml-auto"
              >
                View Low-Stock Catalog →
              </Link>
            </div>
          }
        />
      )}

      {/* 2. FOUR CORE STATISTIC CARDS (LIVE FIRESTORE DATA) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Active Products Catalog"
          value={isLoading ? '...' : formatNumber(summary.totalProducts)}
          subtitle="Books, Registers & Stationery items"
          icon={<BookOpen className="w-5 h-5 text-[#071F49]" />}
          iconBgColor="bg-[#071F49]/10 text-[#071F49]"
          badgeText="Active"
          badgeVariant="brand"
        />

        <StatCard
          title="Total Stock on Hand"
          value={isLoading ? '...' : formatNumber(summary.totalStockQuantity)}
          subtitle="Physical units in store & warehouse"
          icon={<Package className="w-5 h-5 text-[#071F49]" />}
          iconBgColor="bg-[#F5B51B]/20 text-[#071F49]"
          badgeText="In Stock"
          badgeVariant="warning"
        />

        <StatCard
          title="Inventory Valuation"
          value={isLoading ? '...' : formatCurrency(summary.totalStockValue)}
          subtitle="Total asset value at purchase cost"
          icon={<Coins className="w-5 h-5 text-emerald-700" />}
          iconBgColor="bg-emerald-50 text-emerald-700"
          badgeText="PKR Cost"
          badgeVariant="success"
        />

        <StatCard
          title="Registered Suppliers"
          value={isLoading ? '...' : formatNumber(summary.totalSuppliers)}
          subtitle="Publishers & Paper Mills"
          icon={<Building2 className="w-5 h-5 text-[#071F49]" />}
          iconBgColor="bg-blue-50 text-blue-700"
          badgeText="Vendors"
          badgeVariant="info"
        />
      </div>

      {/* 3. RECENT PURCHASES & LOW-STOCK ALERTS SECTIONS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Purchases Section (2 cols) */}
        <Card className="lg:col-span-2 flex flex-col border border-slate-200/90 shadow-sm rounded-2xl">
          <CardHeader>
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-[#071F49]/10 text-[#071F49]">
                  <Receipt className="w-5 h-5" />
                </div>
                <div>
                  <CardTitle className="text-base font-bold text-[#071F49]">
                    Recent Stock Intake & Purchases
                  </CardTitle>
                  <CardDescription>
                    Latest supplier shipments and inventory additions
                  </CardDescription>
                </div>
              </div>

              <Link
                to="/purchases"
                className="text-xs font-bold text-[#071F49] hover:text-[#153F99] inline-flex items-center gap-1"
              >
                <span>All Purchases</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col pt-2">
            {recentPurchases.length === 0 ? (
              <EmptyState
                icon={<Receipt className="w-8 h-8 text-[#071F49]" />}
                title="No Purchases Recorded Yet"
                description="Record your first supplier stock intake to populate purchase orders, update inventory quantities, and log immutable movement records."
                phaseBadge="Phase 2 Ready"
              />
            ) : (
              <div className="divide-y divide-slate-100 overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-500 uppercase font-semibold">
                    <tr>
                      <th className="px-3.5 py-2">Invoice #</th>
                      <th className="px-3.5 py-2">Supplier</th>
                      <th className="px-3.5 py-2 text-center">Items</th>
                      <th className="px-3.5 py-2 text-right">Grand Total</th>
                      <th className="px-3.5 py-2 text-center">Payment</th>
                      <th className="px-3.5 py-2 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {recentPurchases.map((pur) => (
                      <tr key={pur.id} className="hover:bg-slate-50/60">
                        <td className="px-3.5 py-3 font-mono font-bold text-[#071F49]">
                          {pur.purchaseInvoiceNo}
                        </td>
                        <td className="px-3.5 py-3 font-medium text-slate-800 truncate max-w-[150px]">
                          {pur.supplierName}
                        </td>
                        <td className="px-3.5 py-3 text-center text-slate-600">
                          {pur.items.length} titles
                        </td>
                        <td className="px-3.5 py-3 text-right font-mono font-bold text-slate-900">
                          {formatCurrency(pur.grandTotal)}
                        </td>
                        <td className="px-3.5 py-3 text-center">
                          <Badge
                            variant={pur.paymentMethod === 'cash' ? 'success' : 'warning'}
                            size="sm"
                          >
                            {pur.paymentMethod.toUpperCase()}
                          </Badge>
                        </td>
                        <td className="px-3.5 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => setViewingPurchase(pur)}
                            className="p-1 text-slate-400 hover:text-[#071F49] hover:bg-slate-100 rounded transition"
                            title="View Invoice"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Low-Stock Alert Card (1 col) */}
        <Card className="lg:col-span-1 flex flex-col border border-slate-200/90 shadow-sm rounded-2xl">
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-amber-50 text-amber-700">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <div>
                <CardTitle className="text-sm font-bold text-[#071F49]">
                  Low-Stock Reorder List
                </CardTitle>
                <CardDescription>Items near or below minimum count</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col pt-2">
            {lowStockProducts.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400 flex flex-col items-center justify-center flex-1">
                <CheckCircle2 className="w-8 h-8 text-emerald-500 mb-2" />
                <p className="font-semibold text-slate-700">Stock Levels Healthy</p>
                <p className="mt-1">No products are currently at or below their reorder threshold.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
                {lowStockProducts.map((p) => (
                  <div
                    key={p.id}
                    className="py-2.5 px-2 hover:bg-slate-50 transition rounded-lg flex items-center justify-between text-xs cursor-pointer"
                    onClick={() => setViewingProduct(p)}
                  >
                    <div className="min-w-0 flex-1 pr-2">
                      <span className="font-bold text-slate-800 truncate block">
                        {p.title}
                      </span>
                      <span className="text-[11px] text-slate-400 font-mono">
                        SKU: {p.sku}
                      </span>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="font-mono font-bold text-amber-700 block">
                        {p.currentStock} {p.unit}s
                      </span>
                      <span className="text-[10px] text-slate-400">
                        Min: {p.lowStockThreshold}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 4. QUICK SHORTCUTS & SYSTEM HEALTH */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link
          to="/inventory"
          className="flex items-center justify-between p-4 rounded-2xl bg-white border border-slate-200/90 hover:border-[#F5B51B] hover:shadow-md transition group"
        >
          <div className="flex items-center gap-3.5">
            <div className="p-3 rounded-xl bg-[#071F49] text-white group-hover:bg-[#F5B51B] group-hover:text-[#071F49] transition-colors">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-[#071F49]">
                Manage Inventory & Stock
              </h4>
              <p className="text-xs text-slate-500">Add books, edit prices, adjust counts</p>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-[#F5B51B] group-hover:translate-x-1 transition" />
        </Link>

        <Link
          to="/suppliers"
          className="flex items-center justify-between p-4 rounded-2xl bg-white border border-slate-200/90 hover:border-[#F5B51B] hover:shadow-md transition group"
        >
          <div className="flex items-center gap-3.5">
            <div className="p-3 rounded-xl bg-[#071F49] text-white group-hover:bg-[#F5B51B] group-hover:text-[#071F49] transition-colors">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-[#071F49]">
                Suppliers & Publishers
              </h4>
              <p className="text-xs text-slate-500">Manage vendors & purchase history</p>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-[#F5B51B] group-hover:translate-x-1 transition" />
        </Link>

        <Link
          to="/system-status"
          className="flex items-center justify-between p-4 rounded-2xl bg-white border border-slate-200/90 hover:border-[#F5B51B] hover:shadow-md transition group"
        >
          <div className="flex items-center gap-3.5">
            <div className="p-3 rounded-xl bg-[#071F49] text-white group-hover:bg-[#F5B51B] group-hover:text-[#071F49] transition-colors">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-[#071F49]">
                Diagnostics & Rules
              </h4>
              <p className="text-xs text-slate-500">Zero-trust security & indexes</p>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-[#F5B51B] group-hover:translate-x-1 transition" />
        </Link>
      </div>

      {/* 5. SADIQ BOOK AGENCY IMPLEMENTATION ROADMAP */}
      <Card className="rounded-2xl border border-slate-200/90 shadow-sm">
        <CardHeader>
          <div className="flex items-center gap-2.5">
            <Layers className="w-5 h-5 text-[#071F49]" />
            <div>
              <CardTitle className="text-base font-bold text-[#071F49]">
                Sadiq Book Agency Phased Architecture
              </CardTitle>
              <CardDescription>
                Designed for high-precision books, notebooks, registers, and customer Khata accounting
              </CardDescription>
            </div>
          </div>
          <Badge variant="gold" size="sm">Phase 2 Active</Badge>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            <div className="p-3.5 rounded-xl bg-white border border-slate-200">
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-bold text-slate-800">Phase 1: Foundation</span>
                <span className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full font-semibold">
                  Complete
                </span>
              </div>
              <p className="text-slate-500 text-[11px] leading-relaxed">
                Branding + Firebase Auth + Security Rules + Responsive Shell.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-[#071F49] text-white border border-[#0E2E70]">
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-bold text-white">Phase 2: Inventory</span>
                <span className="text-[10px] font-bold bg-[#F5B51B] text-[#071F49] px-2 py-0.5 rounded-full">
                  Active
                </span>
              </div>
              <p className="text-slate-300 text-[11px] leading-relaxed">
                Books, Notebooks, Registers, Suppliers, Purchases, and Stock Logs.
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
                Wholesaler, Parchon, Marketshop (% discounts) & Udhaar ledger.
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
                Thermal POS billing, daily cash closing, P&L statements, and backups.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Modals for viewing details directly from dashboard */}
      <PurchaseDetailModal
        isOpen={Boolean(viewingPurchase)}
        onClose={() => setViewingPurchase(null)}
        purchase={viewingPurchase}
      />

      <ProductDetailModal
        isOpen={Boolean(viewingProduct)}
        onClose={() => setViewingProduct(null)}
        product={viewingProduct}
      />
    </div>
  );
};
