import React from 'react';
import { Download, Printer, FileText } from 'lucide-react';

export interface ExportReportBarProps {
  title: string;
  dateRangeLabel?: string;
  onExportCsv: () => void;
  onPrint?: () => void;
  isExporting?: boolean;
  recordCount?: number;
}

export const ExportReportBar: React.FC<ExportReportBarProps> = ({
  title,
  dateRangeLabel,
  onExportCsv,
  onPrint,
  isExporting = false,
  recordCount,
}) => {
  const handlePrint = () => {
    if (onPrint) {
      onPrint();
    } else if (typeof window !== 'undefined') {
      window.print();
    }
  };

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-slate-50 border border-slate-200 rounded-2xl print:hidden">
      <div className="flex items-center gap-2.5">
        <div className="p-2 bg-white rounded-xl border border-slate-200 text-[#071F49] shadow-xs">
          <FileText className="w-4 h-4" />
        </div>
        <div>
          <h4 className="text-xs font-bold text-slate-800 leading-tight">
            {title}
          </h4>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {dateRangeLabel ? `Period: ${dateRangeLabel}` : 'Complete Historical Dataset'}
            {typeof recordCount === 'number' && ` • ${recordCount} record${recordCount === 1 ? '' : 's'}`}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={handlePrint}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-xl text-xs font-bold shadow-xs transition active:scale-95 cursor-pointer"
        >
          <Printer className="w-3.5 h-3.5 text-slate-600" />
          <span>Print</span>
        </button>

        <button
          type="button"
          disabled={isExporting}
          onClick={onExportCsv}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-[#071F49] hover:bg-[#0c2f6d] text-white rounded-xl text-xs font-bold shadow-xs transition active:scale-95 disabled:opacity-50 cursor-pointer"
        >
          <Download className="w-3.5 h-3.5 text-white" />
          <span>{isExporting ? 'Exporting...' : 'Export CSV'}</span>
        </button>
      </div>
    </div>
  );
};

