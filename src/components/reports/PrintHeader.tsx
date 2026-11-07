import React from 'react';

export interface PrintHeaderProps {
  title: string;
  dateRangeLabel?: string;
  recordCount?: number;
}

export const PrintHeader: React.FC<PrintHeaderProps> = ({
  title,
  dateRangeLabel,
  recordCount,
}) => {
  const printedAt = new Date().toLocaleString('en-PK', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="hidden print:block mb-6 pb-4 border-b-2 border-slate-900 break-inside-avoid">
      {/* Business Branding */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-black text-slate-950 uppercase tracking-tight">
            SADIQ BOOK AGENCY
          </h1>
          <p className="text-xs font-semibold text-slate-700">
            Wholesale & Retail Booksellers, Publishers & Stationers
          </p>
          <p className="text-[11px] text-slate-600 font-medium pt-0.5">
            Address: Udyana Market Mingora Swat | Contact No: 03449633526 , 03425822259, 03035822258
          </p>
        </div>
        <div className="text-right">
          <span className="inline-block px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider bg-slate-100 border border-slate-300 text-slate-800 rounded">
            Official Financial Record
          </span>
          <p className="text-[10px] text-slate-500 mt-1">Generated: {printedAt}</p>
        </div>
      </div>

      {/* Report Specific Details */}
      <div className="mt-3 pt-3 border-t border-slate-200 flex items-center justify-between text-xs">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500 block">
            Report Name
          </span>
          <span className="text-sm font-extrabold text-slate-900">{title}</span>
        </div>

        {dateRangeLabel && (
          <div className="text-center">
            <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500 block">
              Reporting Period
            </span>
            <span className="font-bold text-slate-800">{dateRangeLabel}</span>
          </div>
        )}

        {recordCount !== undefined && (
          <div className="text-right">
            <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500 block">
              Items Evaluated
            </span>
            <span className="font-bold text-slate-800">{recordCount} records</span>
          </div>
        )}
      </div>
    </div>
  );
};

