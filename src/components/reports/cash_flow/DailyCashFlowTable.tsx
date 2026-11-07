import React from 'react';
import type { DailyCashFlowBreakdown } from '../../../types/reports';
import { formatCurrency, formatNumber } from '../../../utils/money';
import { formatDate } from '../../../utils/formatters';

interface DailyCashFlowTableProps {
  data: DailyCashFlowBreakdown[];
}

export const DailyCashFlowTable: React.FC<DailyCashFlowTableProps> = ({ data }) => {
  if (!data || data.length === 0) {
    return (
      <div className="p-8 text-center bg-slate-50 border border-slate-200 rounded-2xl">
        <p className="text-sm font-semibold text-slate-500">
          No cash or bank transactions recorded for this period.
        </p>
      </div>
    );
  }

  const totals = data.reduce(
    (acc, row) => ({
      cashInflows: acc.cashInflows + row.cashInflows,
      cashOutflows: acc.cashOutflows + row.cashOutflows,
      netCash: acc.netCash + row.netCash,
      bankInflows: acc.bankInflows + row.bankInflows,
      bankOutflows: acc.bankOutflows + row.bankOutflows,
      netBank: acc.netBank + row.netBank,
      totalInflows: acc.totalInflows + row.totalInflows,
      totalOutflows: acc.totalOutflows + row.totalOutflows,
      netCombined: acc.netCombined + row.netCombined,
      transactionCount: acc.transactionCount + row.transactionCount,
    }),
    {
      cashInflows: 0,
      cashOutflows: 0,
      netCash: 0,
      bankInflows: 0,
      bankOutflows: 0,
      netBank: 0,
      totalInflows: 0,
      totalOutflows: 0,
      netCombined: 0,
      transactionCount: 0,
    }
  );

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-xs">
      <table className="w-full text-left text-xs">
        <thead className="bg-[#071F49] text-white uppercase text-[11px] tracking-wider">
          <tr>
            <th className="py-3 px-3.5">Date</th>
            <th className="py-3 px-3.5 text-center">Txns</th>
            <th className="py-3 px-3.5 text-right">Cash Inflows</th>
            <th className="py-3 px-3.5 text-right">Cash Outflows</th>
            <th className="py-3 px-3.5 text-right">Net Drawer Cash</th>
            <th className="py-3 px-3.5 text-right">Bank Inflows</th>
            <th className="py-3 px-3.5 text-right">Bank Outflows</th>
            <th className="py-3 px-3.5 text-right">Net Bank Flow</th>
            <th className="py-3 px-3.5 text-right">Combined Net</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
          {data.map((row) => {
            const isCashNetPositive = row.netCash >= 0;
            const isBankNetPositive = row.netBank >= 0;
            const isCombinedPositive = row.netCombined >= 0;

            return (
              <tr key={row.date} className="hover:bg-slate-50/80 transition-colors">
                <td className="py-3 px-3.5 font-bold text-slate-800 whitespace-nowrap">
                  {formatDate(row.date)}
                </td>
                <td className="py-3 px-3.5 text-center font-semibold text-slate-500 whitespace-nowrap">
                  {formatNumber(row.transactionCount)}
                </td>
                <td className="py-3 px-3.5 text-right font-semibold text-emerald-700 whitespace-nowrap">
                  {row.cashInflows > 0 ? `+${formatCurrency(row.cashInflows)}` : 'PKR 0'}
                </td>
                <td className="py-3 px-3.5 text-right font-semibold text-rose-600 whitespace-nowrap">
                  {row.cashOutflows > 0 ? `-${formatCurrency(row.cashOutflows)}` : 'PKR 0'}
                </td>
                <td className={`py-3 px-3.5 text-right font-extrabold whitespace-nowrap ${
                  isCashNetPositive ? 'text-emerald-700' : 'text-rose-600'
                }`}>
                  {formatCurrency(row.netCash)}
                </td>
                <td className="py-3 px-3.5 text-right font-semibold text-blue-700 whitespace-nowrap">
                  {row.bankInflows > 0 ? `+${formatCurrency(row.bankInflows)}` : 'PKR 0'}
                </td>
                <td className="py-3 px-3.5 text-right font-semibold text-indigo-600 whitespace-nowrap">
                  {row.bankOutflows > 0 ? `-${formatCurrency(row.bankOutflows)}` : 'PKR 0'}
                </td>
                <td className={`py-3 px-3.5 text-right font-extrabold whitespace-nowrap ${
                  isBankNetPositive ? 'text-blue-700' : 'text-rose-600'
                }`}>
                  {formatCurrency(row.netBank)}
                </td>
                <td className={`py-3 px-3.5 text-right font-black whitespace-nowrap ${
                  isCombinedPositive ? 'text-slate-900' : 'text-rose-700'
                }`}>
                  {formatCurrency(row.netCombined)}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot className="bg-slate-100/90 font-bold text-slate-900 border-t-2 border-slate-300">
          <tr>
            <td className="py-3.5 px-3.5 uppercase text-[11px] tracking-wider">Totals</td>
            <td className="py-3.5 px-3.5 text-center">{formatNumber(totals.transactionCount)}</td>
            <td className="py-3.5 px-3.5 text-right text-emerald-700">
              +{formatCurrency(totals.cashInflows)}
            </td>
            <td className="py-3.5 px-3.5 text-right text-rose-600">
              -{formatCurrency(totals.cashOutflows)}
            </td>
            <td className={`py-3.5 px-3.5 text-right font-black ${
              totals.netCash >= 0 ? 'text-emerald-800' : 'text-rose-700'
            }`}>
              {formatCurrency(totals.netCash)}
            </td>
            <td className="py-3.5 px-3.5 text-right text-blue-700">
              +{formatCurrency(totals.bankInflows)}
            </td>
            <td className="py-3.5 px-3.5 text-right text-indigo-600">
              -{formatCurrency(totals.bankOutflows)}
            </td>
            <td className={`py-3.5 px-3.5 text-right font-black ${
              totals.netBank >= 0 ? 'text-blue-800' : 'text-rose-700'
            }`}>
              {formatCurrency(totals.netBank)}
            </td>
            <td className={`py-3.5 px-3.5 text-right font-black ${
              totals.netCombined >= 0 ? 'text-slate-900' : 'text-rose-800'
            }`}>
              {formatCurrency(totals.netCombined)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
};

