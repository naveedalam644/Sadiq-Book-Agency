import React from 'react';
import type { DailyProfitLossBreakdown } from '../../../types/reports';
import { formatCurrency, formatNumber } from '../../../utils/money';
import { formatDate } from '../../../utils/formatters';

interface DailyProfitLossTableProps {
  data: DailyProfitLossBreakdown[];
}

export const DailyProfitLossTable: React.FC<DailyProfitLossTableProps> = ({ data }) => {
  if (!data || data.length === 0) {
    return (
      <div className="p-8 text-center bg-slate-50 border border-slate-200 rounded-2xl">
        <p className="text-sm font-semibold text-slate-500">
          No financial or operating activity recorded for this period.
        </p>
      </div>
    );
  }

  const totals = data.reduce(
    (acc, row) => ({
      invoices: acc.invoices + row.invoicesCount,
      returns: acc.returns + row.returnsCount,
      grossSales: acc.grossSales + row.grossSales,
      salesReturns: acc.salesReturns + row.salesReturns,
      netSales: acc.netSales + row.netSales,
      grossCOGS: acc.grossCOGS + row.grossCOGS,
      returnedCOGS: acc.returnedCOGS + row.returnedCOGS,
      netCOGS: acc.netCOGS + row.netCOGS,
      grossProfit: acc.grossProfit + row.grossProfit,
      operatingExpenses: acc.operatingExpenses + row.operatingExpenses,
      operatingProfit: acc.operatingProfit + row.operatingProfit,
    }),
    {
      invoices: 0,
      returns: 0,
      grossSales: 0,
      salesReturns: 0,
      netSales: 0,
      grossCOGS: 0,
      returnedCOGS: 0,
      netCOGS: 0,
      grossProfit: 0,
      operatingExpenses: 0,
      operatingProfit: 0,
    }
  );

  const totalGrossMargin =
    totals.netSales > 0
      ? Number(((totals.grossProfit / totals.netSales) * 100).toFixed(2))
      : 0;

  const totalOperatingMargin =
    totals.netSales > 0
      ? Number(((totals.operatingProfit / totals.netSales) * 100).toFixed(2))
      : 0;

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-xs">
      <table className="w-full text-left text-xs">
        <thead className="bg-[#071F49] text-white uppercase text-[11px] tracking-wider">
          <tr>
            <th className="py-3 px-3.5">Date</th>
            <th className="py-3 px-3.5 text-center">Inv / Ret</th>
            <th className="py-3 px-3.5 text-right">Gross Sales</th>
            <th className="py-3 px-3.5 text-right">Sales Returns</th>
            <th className="py-3 px-3.5 text-right">Net Sales</th>
            <th className="py-3 px-3.5 text-right">Net COGS</th>
            <th className="py-3 px-3.5 text-right">Gross Profit</th>
            <th className="py-3 px-3.5 text-right">Operating Exp.</th>
            <th className="py-3 px-3.5 text-right">Operating Profit</th>
            <th className="py-3 px-3.5 text-center">Op. Margin</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
          {data.map((row) => {
            const isProfitPositive = row.operatingProfit >= 0;
            return (
              <tr key={row.date} className="hover:bg-slate-50/80 transition-colors">
                <td className="py-3 px-3.5 font-bold text-slate-800 whitespace-nowrap">
                  {formatDate(row.date)}
                </td>
                <td className="py-3 px-3.5 text-center text-slate-500 font-semibold whitespace-nowrap">
                  {formatNumber(row.invoicesCount)} / {formatNumber(row.returnsCount)}
                </td>
                <td className="py-3 px-3.5 text-right font-semibold text-slate-900 whitespace-nowrap">
                  {formatCurrency(row.grossSales)}
                </td>
                <td className="py-3 px-3.5 text-right font-semibold text-rose-600 whitespace-nowrap">
                  {row.salesReturns > 0 ? `-${formatCurrency(row.salesReturns)}` : 'PKR 0'}
                </td>
                <td className="py-3 px-3.5 text-right font-bold text-[#071F49] whitespace-nowrap">
                  {formatCurrency(row.netSales)}
                </td>
                <td className="py-3 px-3.5 text-right font-semibold text-slate-700 whitespace-nowrap">
                  {formatCurrency(row.netCOGS)}
                </td>
                <td className={`py-3 px-3.5 text-right font-bold whitespace-nowrap ${
                  row.grossProfit >= 0 ? 'text-emerald-700' : 'text-rose-600'
                }`}>
                  {formatCurrency(row.grossProfit)}
                </td>
                <td className="py-3 px-3.5 text-right font-semibold text-amber-700 whitespace-nowrap">
                  {row.operatingExpenses > 0 ? `-${formatCurrency(row.operatingExpenses)}` : 'PKR 0'}
                </td>
                <td className={`py-3 px-3.5 text-right font-extrabold whitespace-nowrap ${
                  isProfitPositive ? 'text-emerald-700' : 'text-rose-600'
                }`}>
                  {formatCurrency(row.operatingProfit)}
                </td>
                <td className="py-3 px-3.5 text-center whitespace-nowrap">
                  <span className={`inline-block px-2 py-0.5 rounded-md font-bold text-[10px] ${
                    isProfitPositive
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-rose-100 text-rose-800'
                  }`}>
                    {row.operatingProfitMargin}%
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot className="bg-slate-100/90 font-bold text-slate-900 border-t-2 border-slate-300">
          <tr>
            <td className="py-3.5 px-3.5 uppercase text-[11px] tracking-wider">Totals</td>
            <td className="py-3.5 px-3.5 text-center">
              {formatNumber(totals.invoices)} / {formatNumber(totals.returns)}
            </td>
            <td className="py-3.5 px-3.5 text-right">{formatCurrency(totals.grossSales)}</td>
            <td className="py-3.5 px-3.5 text-right text-rose-600">
              {totals.salesReturns > 0 ? `-${formatCurrency(totals.salesReturns)}` : 'PKR 0'}
            </td>
            <td className="py-3.5 px-3.5 text-right text-[#071F49] font-extrabold">
              {formatCurrency(totals.netSales)}
            </td>
            <td className="py-3.5 px-3.5 text-right">{formatCurrency(totals.netCOGS)}</td>
            <td className={`py-3.5 px-3.5 text-right ${
              totals.grossProfit >= 0 ? 'text-emerald-700' : 'text-rose-600'
            }`}>
              <div>{formatCurrency(totals.grossProfit)}</div>
              <div className="text-[10px] font-semibold text-slate-500">Margin: {totalGrossMargin}%</div>
            </td>
            <td className="py-3.5 px-3.5 text-right text-amber-700">
              {totals.operatingExpenses > 0 ? `-${formatCurrency(totals.operatingExpenses)}` : 'PKR 0'}
            </td>
            <td className={`py-3.5 px-3.5 text-right font-black ${
              totals.operatingProfit >= 0 ? 'text-emerald-800' : 'text-rose-700'
            }`}>
              {formatCurrency(totals.operatingProfit)}
            </td>
            <td className="py-3.5 px-3.5 text-center">
              <span className={`inline-block px-2 py-0.5 rounded-md font-black text-[10px] ${
                totals.operatingProfit >= 0
                  ? 'bg-emerald-200 text-emerald-900'
                  : 'bg-rose-200 text-rose-900'
              }`}>
                {totalOperatingMargin}%
              </span>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
};
