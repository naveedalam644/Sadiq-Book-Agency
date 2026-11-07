import React from 'react';
import { formatCurrency, formatNumber } from '../../utils/money';

export interface ReportSummaryCardProps {
  title: string;
  value: number | string;
  subtitle?: string;
  icon?: React.ReactNode;
  variant?: 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';
  isCurrency?: boolean;
  loading?: boolean;
}

const VARIANT_STYLES: Record<string, { iconBg: string; textHighlight: string; border: string }> = {
  brand: {
    iconBg: 'bg-[#071F49]/10 text-[#071F49]',
    textHighlight: 'text-[#071F49]',
    border: 'border-slate-200/90',
  },
  success: {
    iconBg: 'bg-emerald-50 text-emerald-700',
    textHighlight: 'text-emerald-700',
    border: 'border-emerald-200/60',
  },
  warning: {
    iconBg: 'bg-amber-50 text-amber-700',
    textHighlight: 'text-amber-800',
    border: 'border-amber-200/60',
  },
  danger: {
    iconBg: 'bg-rose-50 text-rose-700',
    textHighlight: 'text-rose-700',
    border: 'border-rose-200/60',
  },
  info: {
    iconBg: 'bg-blue-50 text-blue-700',
    textHighlight: 'text-blue-800',
    border: 'border-blue-200/60',
  },
  neutral: {
    iconBg: 'bg-slate-100 text-slate-700',
    textHighlight: 'text-slate-900',
    border: 'border-slate-200',
  },
};

export const ReportSummaryCard: React.FC<ReportSummaryCardProps> = ({
  title,
  value,
  subtitle,
  icon,
  variant = 'brand',
  isCurrency = true,
  loading = false,
}) => {
  const styles = VARIANT_STYLES[variant] || VARIANT_STYLES.brand;

  const displayValue = () => {
    if (loading) return '...';
    if (typeof value === 'number') {
      return isCurrency ? formatCurrency(value) : formatNumber(value);
    }
    return value;
  };

  return (
    <div
      className={`p-4 bg-white rounded-2xl border ${styles.border} shadow-xs flex flex-col justify-between transition-all hover:shadow-md`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 truncate">
            {title}
          </p>
          <h3
            className={`text-xl sm:text-2xl font-black tracking-tight mt-1 truncate ${styles.textHighlight}`}
          >
            {displayValue()}
          </h3>
        </div>

        {icon && (
          <div className={`p-2.5 rounded-xl shrink-0 ${styles.iconBg}`}>
            {icon}
          </div>
        )}
      </div>

      {subtitle && (
        <p className="text-xs text-slate-500 font-medium mt-2 pt-2 border-t border-slate-100 truncate">
          {subtitle}
        </p>
      )}
    </div>
  );
};

