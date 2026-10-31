import React from 'react';
import { PackageOpen } from 'lucide-react';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
  phaseBadge?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  phaseBadge,
}) => {
  return (
    <div className="flex flex-col items-center justify-center text-center p-8 sm:p-12 rounded-xl border border-dashed border-slate-200 bg-slate-50/50">
      <div className="p-3.5 rounded-2xl bg-white border border-slate-200 shadow-sm text-slate-400 mb-3.5">
        {icon || <PackageOpen className="w-8 h-8" />}
      </div>

      <div className="flex items-center gap-2 mb-1">
        <h4 className="text-base font-semibold text-slate-800">{title}</h4>
        {phaseBadge && (
          <span className="text-[11px] font-medium bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full">
            {phaseBadge}
          </span>
        )}
      </div>

      <p className="text-xs sm:text-sm text-slate-500 max-w-sm mb-4 leading-relaxed">
        {description}
      </p>

      {action && <div>{action}</div>}
    </div>
  );
};
