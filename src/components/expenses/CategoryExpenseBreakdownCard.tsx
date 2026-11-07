import React from 'react';
import type { CategoryExpenseSummary } from '../../types/reports';
import { formatCurrency, formatNumber } from '../../utils/money';

interface CategoryExpenseBreakdownCardProps {
  categories: CategoryExpenseSummary[];
  totalExpenses: number;
}

export const CategoryExpenseBreakdownCard: React.FC<CategoryExpenseBreakdownCardProps> = ({
  categories,
  totalExpenses,
}) => {
  if (!categories || categories.length === 0) {
    return null;
  }

  return (
    <div className="p-5 bg-white border border-slate-200 rounded-3xl shadow-xs">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
            Expense Breakdown by Category
          </h3>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Operational spending share across active budget heads
          </p>
        </div>
        <span className="text-xs font-extrabold text-[#071F49] bg-blue-50 px-3 py-1 rounded-full border border-blue-200/60">
          Total: {formatCurrency(totalExpenses)}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {categories.map((c) => (
          <div key={c.category} className="p-3.5 bg-slate-50/80 border border-slate-200/80 rounded-2xl">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-bold text-slate-800">{c.label}</span>
              <span className="text-xs font-extrabold text-[#071F49]">{c.percentage}%</span>
            </div>

            {/* Progress bar */}
            <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden mb-2">
              <div
                className="bg-[#071F49] h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(2, c.percentage))}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-500">{formatNumber(c.count)} transaction{c.count === 1 ? '' : 's'}</span>
              <span className="font-bold text-slate-900">{formatCurrency(c.totalAmount)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

