import React, { useState, useEffect } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  BookOpen,
  Users,
  Receipt,
  Truck,
  Wallet,
  BarChart3,
  LogOut,
  ChevronRight,
  ChevronDown,
  ShieldCheck,
  Building2,
  Clock,
  Tag,
  GraduationCap,
  FileText,
  Sparkles,
  Lock,
  Unlock,
  Plus,
  Package,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useAdminLock } from '../../contexts/AdminLockContext';
import { useToast } from '../../hooks/useToast';
import { AdminSectionLockModal } from '../auth/AdminSectionLockModal';
import { ProductFormModal } from '../inventory/ProductFormModal';
import { getCategories } from '../../services/categoryService';
import { createProduct, type CreateProductInput } from '../../services/productService';
import type { CategoryDocument } from '../../types/database';

export interface SidebarProps {
  onNavigate?: () => void;
  className?: string;
}

interface NavItem {
  name: string;
  to: string;
  icon: React.ElementType;
  enabled: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({ onNavigate, className = '' }) => {
  const { logout, currentUser } = useAuth();
  const { isSessionUnlocked, lockAll } = useAdminLock();
  const { success, error: toastError } = useToast();
  const location = useLocation();
  const navigate = useNavigate();

  // State for Add Product & Admin Unlock modals
  const [isAddProductModalOpen, setIsAddProductModalOpen] = useState(false);
  const [categories, setCategories] = useState<CategoryDocument[]>([]);
  const [isUnlockModalOpen, setIsUnlockModalOpen] = useState(false);
  const [unlockTarget, setUnlockTarget] = useState<{ path: string; name: string }>({
    path: '',
    name: 'Admin Protected Sections',
  });

  // State for dropdown list of locked sections in Cashier Mode
  const [isLockedDropdownOpen, setIsLockedDropdownOpen] = useState(true);

  // Load categories for product adding modal
  useEffect(() => {
    getCategories()
      .then(setCategories)
      .catch((err) => console.warn('Categories load notice in sidebar:', err));
  }, []);

  // 1. Core Store Operations
  const mainNavItems: NavItem[] = [
    {
      name: 'Dashboard',
      to: '/',
      icon: LayoutDashboard,
      enabled: true,
    },
    {
      name: 'Billing & POS',
      to: '/pos',
      icon: Receipt,
      enabled: true,
    },
    {
      name: 'Sales History & Returns',
      to: '/sales-history',
      icon: Clock,
      enabled: true,
    },
    {
      name: 'Inventory & Items',
      to: '/inventory',
      icon: BookOpen,
      enabled: true,
    },
    {
      name: 'Customers & Khata',
      to: '/customers',
      icon: Users,
      enabled: true,
    },
    {
      name: 'Purchases & Intake',
      to: '/purchases',
      icon: Truck,
      enabled: true,
    },
    {
      name: 'Suppliers & Vendors',
      to: '/suppliers',
      icon: Building2,
      enabled: true,
    },
  ];

  // 2. Analytics & Financial Management
  const financeNavItems: NavItem[] = [
    {
      name: 'Publisher Analytics',
      to: '/publisher-analytics',
      icon: BarChart3,
      enabled: true,
    },
    {
      name: 'Financial Reports',
      to: '/reports',
      icon: BarChart3,
      enabled: true,
    },
    {
      name: 'Expenses & Closing',
      to: '/expenses',
      icon: Wallet,
      enabled: true,
    },
  ];

  // 3. Grouped: Academic, Catalog & Rough Bills (Syllabus, Price List, Rough Bill)
  const catalogNavItems: NavItem[] = [
    {
      name: 'Syllabus',
      to: '/syllabus',
      icon: GraduationCap,
      enabled: true,
    },
    {
      name: 'Price List',
      to: '/price-list',
      icon: Tag,
      enabled: true,
    },
    {
      name: 'Rough Bill',
      to: '/rough-bill',
      icon: FileText,
      enabled: true,
    },
  ];

  // All locked sections in Cashier Mode
  const lockedSectionsList = [
    { name: 'Dashboard', to: '/', icon: LayoutDashboard },
    { name: 'Sales History & Returns', to: '/sales-history', icon: Clock },
    { name: 'Inventory & Items', to: '/inventory', icon: BookOpen },
    { name: 'Customers & Khata', to: '/customers', icon: Users },
    { name: 'Purchases & Intake', to: '/purchases', icon: Truck },
    { name: 'Suppliers & Vendors', to: '/suppliers', icon: Building2 },
    { name: 'Publisher Analytics', to: '/publisher-analytics', icon: BarChart3 },
    { name: 'Financial Reports', to: '/reports', icon: BarChart3 },
    { name: 'Expenses & Closing', to: '/expenses', icon: Wallet },
    { name: 'Syllabus', to: '/syllabus', icon: GraduationCap },
    { name: 'Price List', to: '/price-list', icon: Tag },
    { name: 'Rough Bill', to: '/rough-bill', icon: FileText },
  ];

  const handleItemClick = () => {
    onNavigate?.();
  };

  // Open unlock modal for a specific section
  const handleLockedItemClick = (item: { name: string; to: string }) => {
    setUnlockTarget({ path: item.to, name: item.name });
    setIsUnlockModalOpen(true);
  };

  // Cashier quick product adding submission
  const handleSaveProduct = async (payload: CreateProductInput) => {
    try {
      await createProduct(
        payload,
        currentUser?.uid || 'admin',
        currentUser?.email || 'admin@sadiqbookagency.com'
      );
      success(`Product "${payload.title}" added to catalog.`);
      setIsAddProductModalOpen(false);
    } catch (err: any) {
      toastError(err?.message || 'Failed to save product');
      throw err;
    }
  };

  // 1-Click Lock for Cashier
  const handleLockForCashier = () => {
    lockAll();
    navigate('/pos');
    success('System locked into Cashier Mode. Only Billing & POS is open.');
  };

  const renderNavItem = (item: NavItem) => {
    const Icon = item.icon;
    const isActive = location.pathname === item.to;

    if (item.enabled) {
      return (
        <NavLink
          key={item.name}
          to={item.to}
          onClick={handleItemClick}
          className={({ isActive: linkActive }) =>
            `flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-150 group ${
              linkActive
                ? 'bg-[#F5B51B] text-[#071F49] shadow-lg shadow-[#F5B51B]/25 font-bold'
                : 'text-slate-200 hover:bg-[#0A255B] hover:text-white'
            }`
          }
        >
          <div className="flex items-center gap-3 min-w-0">
            <Icon
              className={`w-4 h-4 shrink-0 transition-colors ${
                isActive ? 'text-[#071F49]' : 'text-[#F5B51B] group-hover:text-white'
              }`}
            />
            <span className="truncate">{item.name}</span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0 ml-1">
            <ChevronRight
              className={`w-3.5 h-3.5 transition-transform ${
                isActive
                  ? 'text-[#071F49] opacity-100'
                  : 'text-slate-400 opacity-60 group-hover:translate-x-0.5 group-hover:opacity-100'
              }`}
            />
          </div>
        </NavLink>
      );
    }

    return null;
  };

  return (
    <>
      <aside
        className={`flex flex-col h-full bg-[#071F49] text-slate-200 w-64 select-none border-r border-[#0E2E70] shadow-xl ${className}`}
      >
        {/* Brand Header with Sadiq Book Agency Logo */}
        <div className="p-4 border-b border-[#0E2E70]/90 bg-[#04122C]/40">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-white p-1 flex items-center justify-center shrink-0 shadow-md ring-2 ring-[#F5B51B]/40">
              <img
                src="/images/sadiq-book-agency-logo.png"
                alt="Sadiq Book Agency Logo"
                className="w-full h-full object-contain"
              />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-extrabold text-white tracking-tight leading-tight truncate">
                SADIQ BOOK AGENCY
              </h2>
              <p className="text-[10px] font-medium text-[#F5B51B] tracking-wide mt-0.5 truncate">
                Notebooks • Registers • Stationery
              </p>
            </div>
          </div>
        </div>

        {/* Navigation Area */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
          {/* ========================================================================= */}
          {/* CASE 1: LOCKED / CASHIER MODE */}
          {/* ========================================================================= */}
          {!isSessionUnlocked ? (
            <div className="space-y-3">
              {/* Cashier Open Operations */}
              <div>
                <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-[#F5B51B]/90 flex items-center justify-between">
                  <span>Cashier Operations</span>
                  <span className="text-[9px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-1.5 py-0.2 rounded font-mono font-bold">
                    Open
                  </span>
                </div>

                <div className="space-y-1.5">
                  {/* Billing & POS Register (Always Open) */}
                  <NavLink
                    to="/pos"
                    onClick={handleItemClick}
                    className={({ isActive: linkActive }) =>
                      `flex items-center justify-between px-3.5 py-3 rounded-xl text-sm font-black transition-all shadow-md ${
                        linkActive
                          ? 'bg-[#F5B51B] text-[#071F49] shadow-lg shadow-[#F5B51B]/30'
                          : 'bg-[#0E2E70] text-white hover:bg-[#153e96]'
                      }`
                    }
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Receipt className="w-5 h-5 text-[#071F49] shrink-0" />
                      <span className="truncate">Billing & POS</span>
                    </div>
                    <span className="text-[10px] bg-[#071F49] text-[#F5B51B] px-2 py-0.5 rounded-full font-bold">
                      Counter
                    </span>
                  </NavLink>

                  {/* Cashier Product Adding Button (Always Accessible) */}
                  <button
                    type="button"
                    onClick={() => setIsAddProductModalOpen(true)}
                    className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold bg-[#04122C]/70 hover:bg-[#0A255B] text-slate-200 hover:text-white border border-[#0E2E70] hover:border-[#F5B51B]/40 transition shadow-xs cursor-pointer active:scale-98"
                  >
                    <div className="flex items-center gap-2.5">
                      <Plus className="w-4 h-4 text-[#F5B51B]" />
                      <span>+ Add New Product</span>
                    </div>
                    <Package className="w-3.5 h-3.5 text-slate-400" />
                  </button>
                </div>
              </div>

              {/* Locked Sections Dropdown Accordion */}
              <div className="pt-1">
                {/* Dropdown Header Trigger */}
                <button
                  type="button"
                  onClick={() => setIsLockedDropdownOpen(!isLockedDropdownOpen)}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-[#04122C]/90 hover:bg-[#0A255B] text-left border border-[#0E2E70] transition cursor-pointer"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Lock className="w-4 h-4 text-rose-400 shrink-0" />
                    <span className="text-xs font-bold text-slate-200 truncate">
                      Admin Sections
                    </span>
                    <span className="text-[10px] bg-rose-500/20 text-rose-300 border border-rose-500/30 px-1.5 py-0.2 rounded font-bold shrink-0">
                      Locked
                    </span>
                  </div>

                  <div className="flex items-center gap-1 shrink-0 text-slate-400">
                    {isLockedDropdownOpen ? (
                      <ChevronDown className="w-4 h-4" />
                    ) : (
                      <ChevronRight className="w-4 h-4" />
                    )}
                  </div>
                </button>

                {/* Collapsible List of Locked Sections */}
                {isLockedDropdownOpen && (
                  <div className="mt-2 p-1.5 rounded-2xl bg-[#04122C]/50 border border-[#0E2E70] space-y-1 shadow-inner animate-in fade-in duration-150">
                    <div className="px-2.5 py-1 text-[10px] text-slate-400 flex items-center justify-between border-b border-[#0E2E70]/60 mb-1">
                      <span>Owner Password Required</span>
                      <button
                        type="button"
                        onClick={() => {
                          setUnlockTarget({ path: '/', name: 'All Admin Sections' });
                          setIsUnlockModalOpen(true);
                        }}
                        className="text-[10px] text-[#F5B51B] hover:underline font-bold cursor-pointer"
                      >
                        Unlock All &rarr;
                      </button>
                    </div>

                    {lockedSectionsList.map((item) => {
                      const ItemIcon = item.icon;
                      return (
                        <button
                          key={item.name}
                          type="button"
                          onClick={() => handleLockedItemClick(item)}
                          className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium text-slate-300 hover:text-white hover:bg-[#0A255B]/80 transition text-left cursor-pointer group"
                        >
                          <div className="flex items-center gap-2.5 truncate">
                            <ItemIcon className="w-3.5 h-3.5 text-slate-400 group-hover:text-[#F5B51B] shrink-0" />
                            <span className="truncate">{item.name}</span>
                          </div>
                          <Lock className="w-3 h-3 text-slate-500 group-hover:text-rose-400 shrink-0" />
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* ========================================================================= */
            /* CASE 2: UNLOCKED / FULL ADMIN MODE (PEHLE KI TARA COMPACT & ORGANIZED) */
            /* ========================================================================= */
            <div className="space-y-3">
              {/* Quick Lock Bar */}
              <div className="px-1">
                <button
                  type="button"
                  onClick={handleLockForCashier}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-[#F5B51B] border border-[#F5B51B]/40 hover:border-[#F5B51B] text-xs font-bold transition shadow-xs cursor-pointer active:scale-98"
                  title="Lock management sections into Cashier Mode"
                >
                  <div className="flex items-center gap-2">
                    <Lock className="w-3.5 h-3.5 text-[#F5B51B]" />
                    <span>Lock for Cashier</span>
                  </div>
                  <span className="text-[10px] bg-[#071F49] text-[#F5B51B] px-1.5 py-0.2 rounded font-mono font-bold">
                    Admin
                  </span>
                </button>
              </div>

              {/* Main Operations Section */}
              <div>
                <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-[#F5B51B]/80 flex items-center justify-between">
                  <span>Main Operations</span>
                </div>
                <div className="space-y-1">
                  {mainNavItems.map(renderNavItem)}
                </div>
              </div>

              {/* Analytics & Reports Section */}
              <div className="pt-1">
                <div className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                  <span>Financials & Reports</span>
                </div>
                <div className="space-y-1">
                  {financeNavItems.map(renderNavItem)}
                </div>
              </div>

              {/* Grouped Section: Academic & Quotations (Syllabus, Price List, Rough Bill) */}
              <div className="pt-1">
                <div className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-[#F5B51B] flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3 text-[#F5B51B]" />
                  <span>Catalog & Estimates</span>
                </div>
                <div className="p-1.5 rounded-2xl bg-[#04122C]/70 border border-[#0E2E70] space-y-1 shadow-inner">
                  {catalogNavItems.map(renderNavItem)}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Area: User Profile & Security Lock / Sign Out */}
        <div className="p-3 border-t border-[#0E2E70] bg-[#04122C]/80 space-y-2 shrink-0">
          {/* User Profile Card */}
          <div className="flex items-center justify-between gap-2 p-2 rounded-xl bg-[#071F49]/80 border border-[#0E2E70]">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="w-7 h-7 rounded-lg bg-[#F5B51B]/20 border border-[#F5B51B]/40 flex items-center justify-center text-[#F5B51B] shrink-0 font-bold">
                <ShieldCheck className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-white truncate">
                  {currentUser?.displayName || 'Administrator'}
                </p>
                <p className="text-[10px] text-slate-300 truncate">
                  {isSessionUnlocked ? 'Full Admin Access' : 'Cashier Mode Active'}
                </p>
              </div>
            </div>

            {/* Lock / Unlock Toggle Button in Profile */}
            {isSessionUnlocked ? (
              <button
                type="button"
                onClick={handleLockForCashier}
                className="p-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-[#F5B51B] border border-amber-500/40 transition cursor-pointer shrink-0"
                title="Lock System (Cashier Mode)"
              >
                <Lock className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setUnlockTarget({ path: '/', name: 'All Admin Sections' });
                  setIsUnlockModalOpen(true);
                }}
                className="p-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 transition cursor-pointer shrink-0"
                title="Unlock Admin Sections with Password"
              >
                <Unlock className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Sign Out Button */}
          <button
            type="button"
            onClick={() => logout()}
            className="w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold text-rose-300 hover:bg-rose-500/15 hover:text-white transition-colors border border-rose-500/30 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out Admin</span>
          </button>
        </div>
      </aside>

      {/* Admin Section Password Unlock Modal */}
      <AdminSectionLockModal
        isOpen={isUnlockModalOpen}
        onClose={() => setIsUnlockModalOpen(false)}
        targetPath={unlockTarget.path}
        targetName={unlockTarget.name}
        onSuccess={() => {
          setIsUnlockModalOpen(false);
          success('Admin sections successfully unlocked!');
          if (unlockTarget.path && unlockTarget.path !== '/pos') {
            navigate(unlockTarget.path);
          }
        }}
      />

      {/* Product Form Modal (Available for Cashier to register new books/notebooks) */}
      <ProductFormModal
        isOpen={isAddProductModalOpen}
        onClose={() => setIsAddProductModalOpen(false)}
        onSubmit={handleSaveProduct}
        categories={categories}
      />
    </>
  );
};
