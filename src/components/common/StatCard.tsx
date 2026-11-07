import React from 'react';
import { Badge } from './Badge';

export interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  iconBgColor?: string;
  badgeText?: string;
  badgeVariant?: 'brand' | 'success' | 'warning' | 'info' | 'neutral';
  isPlaceholder?: boolean;
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  subtitle,
  icon,
  iconBgColor = 'bg-[#071F49]/10 text-[#071F49]',
  badgeText,
  badgeVariant = 'neutral',
  isPlaceholder = false,
}) => {
  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col justify-between group">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 truncate">
            {title}
          </p>
          <div className="mt-2 flex items-baseline gap-2">
            <span
              className={`text-2xl sm:text-3xl font-extrabold tracking-tight ${
                isPlaceholder ? 'text-slate-400 font-mono' : 'text-[#071F49]'
              }`}
            >
              {value}
            </span>
          </div>
        </div>
        <div className={`p-3 rounded-xl shrink-0 transition-transform group-hover:scale-105 ${iconBgColor}`}>
          {icon}
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
        <span className="truncate text-[11px] text-slate-500 font-medium">{subtitle || 'Live Store Record'}</span>
        {badgeText && (
          <Badge variant={badgeVariant} size="sm">
            {badgeText}
          </Badge>
        )}
      </div>
    </div>
  );
};
