import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  BookOpen,
  Receipt,
  ArrowRight,
  AlertTriangle,
  Building2,
  Package,
  Coins,
  Plus,
  CheckCircle2,
  ShoppingCart,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { StatCard } from '../components/common/StatCard';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/common/Card';
import { ProductDetailModal } from '../components/inventory/ProductDetailModal';
import { fetchDashboardData, type DashboardData } from '../services/dashboardService';
import type { ProductDocument } from '../types/database';
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

  const [viewingProduct, setViewingProduct] = useState<ProductDocument | null>(null);

  const loadDashboardData = () => {
    fetchDashboardData()
      .then((data) => {
        setDashboardData({
          summary: data.summary,
          recentPurchases: data.recentPurchases,
          lowStockProducts: data.lowStockProducts,
          isLoading: false,
        });
      })
      .catch((err) => {
        console.error('Failed to load dashboard data:', err);
        setDashboardData((prev) => ({ ...prev, isLoading: false }));
      });
  };

  useEffect(() => {
    loadDashboardData();
  }, []);

  const { summary, lowStockProducts, isLoading } = dashboardData;

  return (
    <div className="space-y-6">
      {/* 1. SADIQ BOOK AGENCY ATTRACTIVE WELCOME BANNER */}
      <div className="relative overflow-hidden rounded-2xl bg-[#071F49] text-white shadow-xl border-b-4 border-[#F5B51B]">
        <div className="absolute -right-16 -top-16 w-64 h-64 rounded-full bg-[#F5B51B]/10 blur-3xl pointer-events-none" />
        <div className="absolute right-32 -bottom-20 w-48 h-48 rounded-full bg-[#1D53C2]/20 blur-2xl pointer-events-none" />

        <div className="relative p-5 sm:p-7 md:p-8 flex flex-col md:flex-row md:items-center justify-between gap-5 md:gap-6">
          <div className="flex items-center gap-3.5 sm:gap-5">
            <div className="w-14 h-14 sm:w-20 sm:h-20 rounded-2xl bg-white p-1.5 sm:p-2 shadow-lg ring-4 ring-[#F5B51B]/30 shrink-0 flex items-center justify-center">
              <img
                src="/images/sadiq-book-agency-logo.png"
                alt="Sadiq Book Agency Logo"
                className="w-full h-full object-contain"
              />
            </div>

            <div className="min-w-0">
              <span className="text-xs sm:text-sm font-semibold text-[#F5B51B] uppercase tracking-wider block mb-0.5">
                {greeting}, {currentUser?.displayName || 'Store Administrator'}
              </span>

              <h1 className="text-xl sm:text-3xl font-black text-white tracking-tight">
                SADIQ BOOK AGENCY
              </h1>
              <p className="text-xs sm:text-sm text-slate-300 font-medium mt-0.5 line-clamp-1 sm:line-clamp-none">
                Books • Notebooks • Registers • Stationery | Complete Inventory & Wholesale Accounting
              </p>
            </div>
          </div>

          {/* Quick Action Shortcuts */}
          <div className="flex items-center gap-2 sm:gap-2.5 shrink-0 flex-wrap">
            <Link
              to="/pos"
              className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-bold bg-[#F5B51B] text-[#071F49] hover:bg-[#F8CE4E] transition shadow-md shadow-[#F5B51B]/20 active:scale-95"
            >
              <ShoppingCart className="w-4 h-4 text-[#071F49]" />
              <span>Create Bill (POS)</span>
            </Link>

            <Link
              to="/inventory"
              className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-bold bg-white text-[#071F49] hover:bg-slate-100 transition shadow-md active:scale-95"
            >
              <Package className="w-4 h-4 text-[#071F49]" />
              <span>Catalog & Items</span>
            </Link>

            <Link
              to="/purchases"
              className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-bold bg-[#04122C]/70 hover:bg-[#04122C] text-slate-200 hover:text-white border border-[#0E2E70] transition shadow-md active:scale-95"
            >
              <Plus className="w-4 h-4 text-[#F5B51B]" />
              <span>New Purchase</span>
            </Link>
          </div>
        </div>
      </div>

      {/* 2. THREE CORE STATISTIC CARDS (LIVE CATALOG & ASSET SUMMARY) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
      </div>

      {/* 3. PRIMARY OPERATIONS & RESTOCK SECTION: BILLING & LOW-STOCK */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Billing & Counter POS Register (Primary Operations Launchpad) */}
        <Card className="lg:col-span-7 flex flex-col border border-slate-200/90 shadow-sm rounded-2xl bg-gradient-to-br from-white via-white to-amber-50/20">
          <CardHeader className="border-b border-slate-100 pb-3.5">
            <div className="flex items-center justify-between w-full flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-[#071F49] text-[#F5B51B] shadow-xs">
                  <Receipt className="w-5 h-5" />
                </div>
                <div>
                  <CardTitle className="text-base font-black text-[#071F49]">
                    Billing & Counter POS Register
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    Fast counter sales, customer billing & receipt printing
                  </CardDescription>
                </div>
              </div>

              <span className="text-[11px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full">
                Ready for Sales
              </span>
            </div>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col justify-between p-4 sm:p-5 space-y-4">
            <div className="space-y-3">
              <p className="text-xs text-slate-600 leading-relaxed">
                Create new sales invoices, search books and notebooks by barcode/SKU, apply counter discounts, and print professional A4/Thermal bills or share via WhatsApp.
              </p>

              {/* Main POS Launch CTA Button */}
              <Link
                to="/pos"
                className="w-full flex items-center justify-center gap-2.5 py-3 px-5 rounded-xl font-black text-sm text-[#071F49] bg-[#F5B51B] hover:bg-[#F8CE4E] shadow-md shadow-[#F5B51B]/25 hover:shadow-lg transition-all active:scale-[0.99]"
              >
                <ShoppingCart className="w-5 h-5 text-[#071F49]" />
                <span>Open POS Register / Create Bill &rarr;</span>
              </Link>
            </div>

            {/* Quick Operational Shortcuts */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-slate-100">
              <Link
                to="/pos"
                className="p-2.5 rounded-xl bg-slate-50 hover:bg-[#071F49]/5 border border-slate-200/80 transition flex flex-col justify-between group"
              >
                <span className="text-[11px] font-bold text-slate-800 group-hover:text-[#071F49] block">
                  Counter Sale
                </span>
                <span className="text-[10px] text-slate-500 mt-0.5">
                  Cash / Customer Billing
                </span>
              </Link>

              <Link
                to="/rough-bill"
                className="p-2.5 rounded-xl bg-slate-50 hover:bg-[#071F49]/5 border border-slate-200/80 transition flex flex-col justify-between group"
              >
                <span className="text-[11px] font-bold text-slate-800 group-hover:text-[#071F49] block">
                  Rough Bill
                </span>
                <span className="text-[10px] text-slate-500 mt-0.5">
                  Order / Estimate Draft
                </span>
              </Link>

              <Link
                to="/sales"
                className="p-2.5 rounded-xl bg-slate-50 hover:bg-[#071F49]/5 border border-slate-200/80 transition flex flex-col justify-between group"
              >
                <span className="text-[11px] font-bold text-slate-800 group-hover:text-[#071F49] block">
                  Sales Invoices
                </span>
                <span className="text-[10px] text-slate-500 mt-0.5">
                  History & Reprints
                </span>
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Low-Stock Reorder List Card */}
        <Card className="lg:col-span-5 flex flex-col border border-slate-200/90 shadow-sm rounded-2xl">
          <CardHeader className="border-b border-slate-100 pb-3">
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-amber-50 text-amber-700">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div>
                  <CardTitle className="text-sm font-bold text-[#071F49]">
                    Low-Stock Reorder List
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    Items near or below minimum count
                  </CardDescription>
                </div>
              </div>

              <Link
                to="/inventory"
                className="text-xs font-bold text-amber-800 hover:text-amber-950 inline-flex items-center gap-1"
              >
                <span>Stock</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
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

      {/* 4. QUICK SHORTCUTS & SYSTEM NAVIGATION */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
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
          to="/pos"
          className="flex items-center justify-between p-4 rounded-2xl bg-white border border-slate-200/90 hover:border-[#F5B51B] hover:shadow-md transition group"
        >
          <div className="flex items-center gap-3.5">
            <div className="p-3 rounded-xl bg-[#071F49] text-white group-hover:bg-[#F5B51B] group-hover:text-[#071F49] transition-colors">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-[#071F49]">
                Billing & POS Register
              </h4>
              <p className="text-xs text-slate-500">Fast counter sales, cart & receipts</p>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-[#F5B51B] group-hover:translate-x-1 transition" />
        </Link>
      </div>

      {/* Product Detail Modal for viewing details directly from dashboard */}
      <ProductDetailModal
        isOpen={Boolean(viewingProduct)}
        onClose={() => setViewingProduct(null)}
        product={viewingProduct}
      />
    </div>
  );
};
