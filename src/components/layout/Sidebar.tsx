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

  const businessName =
    import.meta.env.VITE_BUSINESS_NAME || 'Bookstore & Stationers';

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
      enabled: false,
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
      name: 'Purchases & Suppliers',
      to: '/purchases',
      icon: Truck,
      phase: 'Phase 5',
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
      className={`flex flex-col h-full bg-slate-900 text-slate-300 w-64 select-none border-r border-slate-800 ${className}`}
    >
      {/* Brand Header */}
      <div className="p-5 border-b border-slate-800/80">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-600 flex items-center justify-center text-white shadow-md shadow-brand-600/30">
            <BookOpen className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold text-white tracking-tight truncate">
              {businessName}
            </h2>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                Phase 1 Active
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Links */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
          Core Modules
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
                  `flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all group ${
                    linkActive
                      ? 'bg-brand-600 text-white shadow-sm shadow-brand-600/20'
                      : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                  }`
                }
              >
                <div className="flex items-center gap-3">
                  <Icon
                    className={`w-4 h-4 transition-colors ${
                      isActive ? 'text-white' : 'text-slate-400 group-hover:text-white'
                    }`}
                  />
                  <span>{item.name}</span>
                </div>
                <ChevronRight
                  className={`w-3.5 h-3.5 opacity-60 ${
                    isActive ? 'opacity-100' : 'group-hover:translate-x-0.5 transition-transform'
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
              className="flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium text-slate-400 cursor-not-allowed opacity-75 hover:bg-slate-800/40"
            >
              <div className="flex items-center gap-3">
                <Icon className="w-4 h-4 text-slate-400" />
                <span className="text-slate-400">{item.name}</span>
              </div>
              <span className="text-[10px] font-semibold tracking-wide px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700/60">
                {item.phase}
              </span>
            </div>
          );
        })}
      </div>

      {/* Admin Profile & Logout Box */}
      <div className="p-3 border-t border-slate-800/80 bg-slate-950/40">
        <div className="flex items-center gap-3 p-2 rounded-lg bg-slate-800/50 mb-2 border border-slate-800">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-white truncate">
              {currentUser?.displayName || 'Administrator'}
            </p>
            <p className="text-[11px] text-slate-400 truncate">
              {currentUser?.email || 'admin@bookstore.local'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => logout()}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-rose-300 hover:bg-rose-500/10 hover:text-rose-200 transition-colors border border-rose-500/20"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Sign Out Admin</span>
        </button>
      </div>
    </aside>
  );
};
