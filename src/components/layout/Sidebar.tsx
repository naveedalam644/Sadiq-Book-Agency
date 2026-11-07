import React from 'react';
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
  ShieldCheck,
  Building2,
  Clock,
  Lock,
  Unlock,
  KeyRound,
  Tag,
  GraduationCap,
  FileText,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useAdminLock } from '../../contexts/AdminLockContext';
import { AdminSectionLockModal } from '../auth/AdminSectionLockModal';
import { ChangeAdminPasswordModal } from '../auth/ChangeAdminPasswordModal';

export interface SidebarProps {
  onNavigate?: () => void;
  className?: string;
}

interface NavItem {
  name: string;
  to: string;
  icon: React.ElementType;
  phase: string;
  enabled: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({ onNavigate, className = '' }) => {
  const { logout, currentUser } = useAuth();
  const {
    isLocked,
    lockAll,
    activeLockModal,
    openLockModal,
    closeLockModal,
    isChangePasswordModalOpen,
    openChangePasswordModal,
    closeChangePasswordModal,
    isSessionUnlocked,
  } = useAdminLock();

  const location = useLocation();
  const navigate = useNavigate();

  // 1. Core Store Operations
  const mainNavItems: NavItem[] = [
    {
      name: 'Dashboard',
      to: '/',
      icon: LayoutDashboard,
      phase: 'Phase 1',
      enabled: true,
    },
    {
      name: 'Billing & POS',
      to: '/pos',
      icon: Receipt,
      phase: 'Phase 4',
      enabled: true,
    },
    {
      name: 'Sales History & Returns',
      to: '/sales-history',
      icon: Clock,
      phase: 'Phase 4',
      enabled: true,
    },
    {
      name: 'Inventory & Items',
      to: '/inventory',
      icon: BookOpen,
      phase: 'Phase 2',
      enabled: true,
    },
    {
      name: 'Customers & Khata',
      to: '/customers',
      icon: Users,
      phase: 'Phase 3',
      enabled: true,
    },
    {
      name: 'Purchases & Intake',
      to: '/purchases',
      icon: Truck,
      phase: 'Phase 2',
      enabled: true,
    },
    {
      name: 'Suppliers & Vendors',
      to: '/suppliers',
      icon: Building2,
      phase: 'Phase 2',
      enabled: true,
    },
  ];

  // 2. Analytics & Financial Management
  const financeNavItems: NavItem[] = [
    {
      name: 'Publisher Analytics',
      to: '/publisher-analytics',
      icon: BarChart3,
      phase: 'Phase 5',
      enabled: true,
    },
    {
      name: 'Financial Reports',
      to: '/reports',
      icon: BarChart3,
      phase: 'Phase 6',
      enabled: true,
    },
    {
      name: 'Expenses & Closing',
      to: '/expenses',
      icon: Wallet,
      phase: 'Phase 6',
      enabled: true,
    },
  ];

  // 3. Grouped: Academic, Catalog & Rough Bills (Syllabus, Price List, Rough Bill)
  const catalogNavItems: NavItem[] = [
    {
      name: 'Syllabus',
      to: '/syllabus',
      icon: GraduationCap,
      phase: 'Phase 2',
      enabled: true,
    },
    {
      name: 'Price List',
      to: '/price-list',
      icon: Tag,
      phase: 'Phase 2',
      enabled: true,
    },
    {
      name: 'Rough Bill',
      to: '/rough-bill',
      icon: FileText,
      phase: 'Phase 2',
      enabled: true,
    },
  ];

  const handleItemClick = (e: React.MouseEvent, item: NavItem) => {
    const locked = isLocked(item.to);
    if (locked) {
      e.preventDefault();
      openLockModal(item.to, item.name);
    } else {
      onNavigate?.();
    }
  };

  const renderNavItem = (item: NavItem) => {
    const Icon = item.icon;
    const isActive = location.pathname === item.to;
    const locked = isLocked(item.to);

    if (item.enabled) {
      return (
        <NavLink
          key={item.name}
          to={item.to}
          onClick={(e) => handleItemClick(e, item)}
          className={({ isActive: linkActive }) =>
            `flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-150 group ${
              linkActive && !locked
                ? 'bg-[#F5B51B] text-[#071F49] shadow-lg shadow-[#F5B51B]/25 font-bold'
                : 'text-slate-200 hover:bg-[#0A255B] hover:text-white'
            }`
          }
        >
          <div className="flex items-center gap-3 min-w-0">
            <Icon
              className={`w-4 h-4 shrink-0 transition-colors ${
                isActive && !locked ? 'text-[#071F49]' : 'text-[#F5B51B] group-hover:text-white'
              }`}
            />
            <span className="truncate">{item.name}</span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0 ml-1">
            {locked ? (
              <span
                title="Protected by Admin Password"
                className="p-1 rounded-md bg-amber-500/20 text-amber-300 border border-amber-400/40"
              >
                <Lock className="w-3 h-3" />
              </span>
            ) : (
              <ChevronRight
                className={`w-3.5 h-3.5 transition-transform ${
                  isActive
                    ? 'text-[#071F49] opacity-100'
                    : 'text-slate-400 opacity-60 group-hover:translate-x-0.5 group-hover:opacity-100'
                }`}
              />
            )}
          </div>
        </NavLink>
      );
    }

    // Upcoming phases disabled item
    return (
      <div
        key={item.name}
        title={`Scheduled for development in ${item.phase}`}
        className="flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium text-slate-400 cursor-not-allowed opacity-75 hover:bg-[#0A255B]/40 transition"
      >
        <div className="flex items-center gap-3">
          <Icon className="w-4 h-4 text-slate-400" />
          <span className="text-slate-300">{item.name}</span>
        </div>
        <span className="text-[10px] font-semibold tracking-wide px-2 py-0.5 rounded-md bg-[#04122C] text-slate-300 border border-[#0E2E70]/80">
          {item.phase}
        </span>
      </div>
    );
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
              <div className="flex items-center gap-1.5 mt-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                <p className="text-[10px] font-semibold text-slate-300 uppercase tracking-wider">
                  Phase 2 Active
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Navigation Links */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-3">
          {/* Main Navigation Section */}
          <div>
            <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-[#F5B51B]/80 flex items-center justify-between">
              <span>Main Operations</span>
              <div className="flex items-center gap-1.5 text-[9px]">
                {isSessionUnlocked ? (
                  <span className="text-emerald-400 font-bold flex items-center gap-0.5">
                    <Unlock className="w-3 h-3" /> Unlocked
                  </span>
                ) : (
                  <span className="text-amber-400 font-bold flex items-center gap-0.5">
                    <Lock className="w-3 h-3" /> Protected
                  </span>
                )}
              </div>
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

        {/* Admin Profile & Lock Controls Box */}
        <div className="p-3 border-t border-[#0E2E70] bg-[#04122C]/80 space-y-2">
          {/* Quick Lock / Unlock Status Bar */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => lockAll()}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 text-[11px] font-bold border border-amber-500/30 transition-all cursor-pointer"
              title="Lock all confidential sections immediately"
            >
              <Lock className="w-3 h-3" />
              <span>Lock Sections</span>
            </button>

            <button
              type="button"
              onClick={() => openChangePasswordModal()}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-all cursor-pointer"
              title="Change Admin Password / PIN"
            >
              <KeyRound className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* User Profile Card */}
          <div className="flex items-center gap-3 p-2 rounded-xl bg-[#071F49]/80 border border-[#0E2E70]">
            <div className="w-7 h-7 rounded-lg bg-[#F5B51B]/20 border border-[#F5B51B]/40 flex items-center justify-center text-[#F5B51B] shrink-0 font-bold">
              <ShieldCheck className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-white truncate">
                {currentUser?.displayName || 'Administrator'}
              </p>
              <p className="text-[10px] text-slate-300 truncate">
                {currentUser?.email || 'admin@sadiqbookagency.com'}
              </p>
            </div>
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

      {/* Password Unlock Modal (Opened when clicking any locked sidebar item) */}
      {activeLockModal && (
        <AdminSectionLockModal
          isOpen={true}
          onClose={closeLockModal}
          targetPath={activeLockModal.path}
          targetName={activeLockModal.name}
          onSuccess={() => {
            closeLockModal();
            navigate(activeLockModal.path);
            onNavigate?.();
          }}
        />
      )}

      {/* Change Password Modal */}
      <ChangeAdminPasswordModal
        isOpen={isChangePasswordModalOpen}
        onClose={closeChangePasswordModal}
      />
    </>
  );
};
