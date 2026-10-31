import React from 'react';
import { ShieldCheck } from 'lucide-react';

export const Footer: React.FC = () => {
  const currentYear = new Date().getFullYear();
  const appName =
    import.meta.env.VITE_APP_NAME || 'Bookstore Management System';

  return (
    <footer className="mt-auto border-t border-slate-200/80 bg-white/60 py-4 px-4 sm:px-6 lg:px-8">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
        <div className="flex items-center gap-2">
          <span className="font-medium text-slate-700">{appName}</span>
          <span>•</span>
          <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded text-[11px] font-medium border border-emerald-200/60">
            <ShieldCheck className="w-3 h-3" />
            Phase 1 Foundation
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span>Protected Admin Portal</span>
          <span>© {currentYear}</span>
        </div>
      </div>
    </footer>
  );
};
