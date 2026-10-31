import React from 'react';
import { ShieldCheck } from 'lucide-react';

export const Footer: React.FC = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="mt-auto border-t border-slate-200 bg-white/90 py-4 px-4 sm:px-6 lg:px-8">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500 max-w-7xl mx-auto">
        <div className="flex items-center gap-2">
          <span className="font-bold text-[#071F49]">SADIQ BOOK AGENCY</span>
          <span className="text-slate-300">•</span>
          <span className="text-slate-500 hidden sm:inline">Notebooks • Registers • Stationery</span>
          <span className="text-slate-300">•</span>
          <span className="inline-flex items-center gap-1 text-[#071F49] bg-[#F5B51B]/20 px-2 py-0.5 rounded-md text-[11px] font-bold border border-[#F5B51B]/50">
            <ShieldCheck className="w-3 h-3 text-[#071F49]" />
            Phase 1 Foundation
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-slate-500">Authorized Admin Portal</span>
          <span>© {currentYear} Sadiq Book Agency</span>
        </div>
      </div>
    </footer>
  );
};
