import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Server,
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
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

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
  const location = useLocation();

  const navItems: NavItem[] = [
    {
      name: 'Dashboard',
      to: '/',
      icon: LayoutDashboard,
      phase: 'Phase 1',
      enabled: true,
    },
    {
      name: 'Firebase & System',
      to: '/system-status',
      icon: Server,
      phase: 'Phase 1',
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
      name: 'Suppliers & Vendors',
      to: '/suppliers',
      icon: Building2,
      phase: 'Phase 2',
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
      name: 'Customers & Khata',
      to: '/customers',
      icon: Users,
      phase: 'Phase 3',
      enabled: false,
    },
    {
      name: 'Billing & POS',
      to: '/billing',
      icon: Receipt,
      phase: 'Phase 4',
      enabled: false,
    },
    {
      name: 'Expenses & Closing',
      to: '/expenses',
      icon: Wallet,
      phase: 'Phase 6',
      enabled: false,
    },
    {
      name: 'Reports & P&L',
      to: '/reports',
      icon: BarChart3,
      phase: 'Phase 7',
      enabled: false,
    },
  ];

  return (
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
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-[#F5B51B]/80 flex items-center justify-between">
          <span>Main Navigation</span>
          <span className="text-[9px] text-slate-400 font-normal">v2.0</span>
        </div>

        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.to;

          if (item.enabled) {
            return (
              <NavLink
                key={item.name}
                to={item.to}
                onClick={onNavigate}
                className={({ isActive: linkActive }) =>
                  `flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-150 group ${
                    linkActive
                      ? 'bg-[#F5B51B] text-[#071F49] shadow-lg shadow-[#F5B51B]/25 font-bold'
                      : 'text-slate-200 hover:bg-[#0A255B] hover:text-white'
                  }`
                }
              >
                <div className="flex items-center gap-3">
                  <Icon
                    className={`w-4 h-4 transition-colors ${
                      isActive ? 'text-[#071F49]' : 'text-[#F5B51B] group-hover:text-white'
                    }`}
                  />
                  <span>{item.name}</span>
                </div>
                <ChevronRight
                  className={`w-3.5 h-3.5 transition-transform ${
                    isActive
                      ? 'text-[#071F49] opacity-100'
                      : 'text-slate-400 opacity-60 group-hover:translate-x-0.5 group-hover:opacity-100'
                  }`}
                />
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
        })}
      </div>

      {/* Admin Profile & Logout Box */}
      <div className="p-3 border-t border-[#0E2E70] bg-[#04122C]/80">
        <div className="flex items-center gap-3 p-2.5 rounded-xl bg-[#071F49]/80 mb-2 border border-[#0E2E70]">
          <div className="w-8 h-8 rounded-lg bg-[#F5B51B]/20 border border-[#F5B51B]/40 flex items-center justify-center text-[#F5B51B] shrink-0 font-bold">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-white truncate">
              {currentUser?.displayName || 'Administrator'}
            </p>
            <p className="text-[11px] text-slate-300 truncate">
              {currentUser?.email || 'admin@sadiqbookagency.com'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => logout()}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-rose-300 hover:bg-rose-500/15 hover:text-white transition-colors border border-rose-500/30"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Sign Out Admin</span>
        </button>
      </div>
    </aside>
  );
};
