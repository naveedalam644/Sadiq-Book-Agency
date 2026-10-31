import React from 'react';
import { AlertCircle, CheckCircle2, Info, AlertTriangle, X } from 'lucide-react';

export type AlertVariant = 'info' | 'warning' | 'error' | 'success';

export interface AlertBannerProps {
  variant?: AlertVariant;
  title?: string;
  message: React.ReactNode;
  action?: React.ReactNode;
  onDismiss?: () => void;
  className?: string;
}

export const AlertBanner: React.FC<AlertBannerProps> = ({
  variant = 'info',
  title,
  message,
  action,
  onDismiss,
  className = '',
}) => {
  const styles = {
    info: {
      bg: 'bg-blue-50/90 border-blue-200 text-blue-900',
      icon: Info,
      iconColor: 'text-blue-600',
    },
    warning: {
      bg: 'bg-amber-50/90 border-amber-200 text-amber-900',
      icon: AlertTriangle,
      iconColor: 'text-amber-600',
    },
    error: {
      bg: 'bg-rose-50/90 border-rose-200 text-rose-900',
      icon: AlertCircle,
      iconColor: 'text-rose-600',
    },
    success: {
      bg: 'bg-emerald-50/90 border-emerald-200 text-emerald-900',
      icon: CheckCircle2,
      iconColor: 'text-emerald-600',
    },
  }[variant];

  const Icon = styles.icon;

  return (
    <div
      className={`flex items-start gap-3.5 p-4 rounded-xl border ${styles.bg} ${className}`}
      role="alert"
    >
      <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${styles.iconColor}`} />
      <div className="flex-1 min-w-0">
        {title && <h5 className="font-semibold text-sm leading-tight mb-1">{title}</h5>}
        <div className="text-xs sm:text-sm leading-relaxed">{message}</div>
        {action && <div className="mt-2.5">{action}</div>}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 p-1 text-slate-400 hover:text-slate-600 rounded-md transition"
          aria-label="Dismiss alert"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};

