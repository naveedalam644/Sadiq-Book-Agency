import React from 'react';
import { Menu, LogOut, Shield, Sparkles, Lock, Unlock } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useAdminLock } from '../../contexts/AdminLockContext';

export interface HeaderProps {
  onToggleMobileNav: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onToggleMobileNav }) => {
  const { currentUser, logout, isFirebaseReady } = useAuth();
  const { isSessionUnlocked, lockAll } = useAdminLock();

  const businessName =
    import.meta.env.VITE_BUSINESS_NAME || 'Sadiq Book Agency';

  return (
    <header className="sticky top-0 z-30 bg-[#071F49] text-white border-b-2 border-[#F5B51B] shadow-md">
      <div className="px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Left side: Mobile Hamburger & Store Branding */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onToggleMobileNav}
            className="lg:hidden p-2 rounded-lg text-slate-300 hover:text-white hover:bg-[#0A255B] transition focus:outline-none focus:ring-2 focus:ring-[#F5B51B]"
            aria-label="Open mobile navigation"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2.5">
            <span className="font-extrabold text-white text-sm sm:text-base tracking-tight flex items-center gap-2">
              <span className="text-white">{businessName}</span>
              <span className="hidden sm:inline text-xs font-normal text-slate-300">
                | Management System
              </span>
            </span>
            <span className="hidden md:inline-flex items-center gap-1 text-[11px] font-bold bg-[#F5B51B] text-[#071F49] px-2 py-0.5 rounded-full shadow-xs">
              <Sparkles className="w-3 h-3 text-[#071F49]" />
              Phase 2
            </span>
          </div>
        </div>

        {/* Right side: Firebase Status, Lock Toggle & Admin User Control */}
        <div className="flex items-center gap-3 sm:gap-4">
          {/* Firebase Connection Pill */}
          <div className="hidden sm:flex items-center">
            {isFirebaseReady ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-300 bg-emerald-950/60 px-2.5 py-1 rounded-full border border-emerald-500/40">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>Firebase Connected</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-300 bg-amber-950/60 px-2.5 py-1 rounded-full border border-amber-500/40">
                <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                <span>Firebase Pending</span>
              </span>
            )}
          </div>

          {/* Quick Lock Button */}
          <button
            type="button"
            onClick={() => lockAll()}
            title={
              isSessionUnlocked
                ? 'Confidential Sections Unlocked (Click to lock all)'
                : 'Confidential Sections are Password-Locked'
            }
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
              isSessionUnlocked
                ? 'bg-amber-500/20 text-amber-300 border-amber-400/40 hover:bg-amber-500/30'
                : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
            }`}
          >
            {isSessionUnlocked ? (
              <>
                <Unlock className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden md:inline">Lock Now</span>
              </>
            ) : (
              <>
                <Lock className="w-3.5 h-3.5 text-emerald-400" />
                <span className="hidden md:inline">Locked</span>
              </>
            )}
          </button>

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
