import React from 'react';
import { Menu, LogOut, Shield, Sparkles } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { Badge } from '../common/Badge';

export interface HeaderProps {
  onToggleMobileNav: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onToggleMobileNav }) => {
  const { currentUser, logout, isFirebaseReady } = useAuth();
  const businessName =
    import.meta.env.VITE_BUSINESS_NAME || 'Bookstore & Stationers';

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-slate-200/90 shadow-xs backdrop-blur-md">
      <div className="px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Left side: Mobile Hamburger & Store Branding */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onToggleMobileNav}
            className="lg:hidden p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition focus:outline-none focus:ring-2 focus:ring-brand-500"
            aria-label="Open mobile navigation"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-900 text-sm sm:text-base tracking-tight hidden sm:inline">
              {businessName}
            </span>
            <Badge variant="brand" size="sm" className="hidden md:inline-flex">
              <Sparkles className="w-3 h-3 mr-1 text-brand-600" />
              Phase 1
            </Badge>
          </div>
        </div>

        {/* Right side: Firebase Status & Admin User Control */}
        <div className="flex items-center gap-3 sm:gap-4">
          {/* Firebase Connection Pill */}
          <div className="hidden sm:flex items-center">
            {isFirebaseReady ? (
              <Badge variant="success" size="sm" dot>
                Firebase Connected
              </Badge>
            ) : (
              <Badge variant="warning" size="sm" dot>
                Firebase Unconfigured (.env)
              </Badge>
            )}
          </div>

          {/* Admin User Chip */}
          <div className="flex items-center gap-2.5 pl-2 sm:pl-3 border-l border-slate-200">
            <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-300 flex items-center justify-center text-slate-700 font-bold text-xs uppercase shadow-xs">
              {currentUser?.displayName?.charAt(0) || <Shield className="w-4 h-4 text-slate-600" />}
            </div>

            <div className="hidden md:block text-left">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-slate-800 leading-none">
                  {currentUser?.displayName || 'Administrator'}
                </span>
                <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded uppercase font-bold tracking-wider">
                  Admin
                </span>
              </div>
              <span className="text-[11px] text-slate-400 block mt-0.5 leading-none truncate max-w-[160px]">
                {currentUser?.email}
              </span>
            </div>

            <button
              type="button"
              onClick={() => logout()}
              title="Sign Out"
              className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors ml-1"
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
