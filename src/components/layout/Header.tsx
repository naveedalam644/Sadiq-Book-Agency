import React from 'react';
import { Menu, LogOut, Shield } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

export interface HeaderProps {
  onToggleMobileNav: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onToggleMobileNav }) => {
  const { currentUser, logout } = useAuth();

  const businessName =
    import.meta.env.VITE_BUSINESS_NAME || 'Sadiq Book Agency';

  return (
    <header className="sticky top-0 z-30 bg-[#071F49] text-white border-b-2 border-[#F5B51B] shadow-md">
      <div className="px-3 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-3 sm:gap-4">
        {/* Left side: Mobile Hamburger & Store Branding */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button
            type="button"
            onClick={onToggleMobileNav}
            className="lg:hidden p-2 rounded-lg text-slate-300 hover:text-white hover:bg-[#0A255B] transition focus:outline-none focus:ring-2 focus:ring-[#F5B51B] shrink-0"
            aria-label="Open mobile navigation"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2 min-w-0">
            <span className="font-extrabold text-white text-sm sm:text-base tracking-tight truncate">
              {businessName}
              <span className="hidden sm:inline text-xs font-normal text-slate-300 ml-1.5">
                | Management System
              </span>
            </span>
          </div>
        </div>

        {/* Right side: Admin User Control */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {/* Admin User Chip */}
          <div className="flex items-center gap-2.5 pl-2 sm:pl-3 border-l border-[#0E2E70]">
            <div className="w-8 h-8 rounded-full bg-[#F5B51B] border-2 border-white/20 flex items-center justify-center text-[#071F49] font-extrabold text-xs uppercase shadow-xs">
              {currentUser?.displayName?.charAt(0) || <Shield className="w-4 h-4 text-[#071F49]" />}
            </div>

            <div className="hidden md:block text-left">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-white leading-none">
                  {currentUser?.displayName || 'Administrator'}
                </span>
                <span className="text-[10px] bg-[#F5B51B] text-[#071F49] px-1.5 py-0.2 rounded font-bold uppercase tracking-wider">
                  Admin
                </span>
              </div>
              <span className="text-[11px] text-slate-300 block mt-0.5 leading-none truncate max-w-[160px]">
                {currentUser?.email}
              </span>
            </div>

            <button
              type="button"
              onClick={() => logout()}
              title="Sign Out"
              className="p-2 text-slate-300 hover:text-rose-300 hover:bg-rose-500/20 rounded-lg transition-colors ml-1 cursor-pointer"
              aria-label="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
