import React from 'react';

export interface LoadingSpinnerProps {
  fullScreen?: boolean;
  message?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  fullScreen = false,
  message = 'Loading Sadiq Book Agency...',
  size = 'md',
}) => {
  const spinnerSizes = {
    sm: 'w-8 h-8 border-2',
    md: 'w-12 h-12 border-3',
    lg: 'w-16 h-16 border-4',
  }[size];

  const content = (
    <div className="flex flex-col items-center justify-center gap-3">
      <div className="relative flex items-center justify-center">
        <div
          className={`${spinnerSizes} rounded-full border-slate-200 border-t-[#F5B51B] animate-spin`}
        />
        <div className="w-6 h-6 rounded-md bg-white p-0.5 shadow-xs absolute flex items-center justify-center">
          <img
            src="/images/sadiq-book-agency-logo.png"
            alt="Sadiq Book Agency"
            className="w-full h-full object-contain"
          />
        </div>
      </div>
      {message && (
        <p className="text-xs sm:text-sm font-bold text-[#071F49] tracking-tight animate-pulse">
          {message}
        </p>
      )}
    </div>
  );

  if (fullScreen) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#F4F7FB]/95 backdrop-blur-sm">
        {content}
      </div>
    );
  }

  return <div className="py-12 flex items-center justify-center w-full">{content}</div>;
};
