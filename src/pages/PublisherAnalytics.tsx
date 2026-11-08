import React, { useState, useEffect, useCallback } from 'react';
import {
  BarChart3,
  AlertTriangle,
  RotateCcw,
  TrendingUp,
  DollarSign,
  Package,
  Layers,
  ChevronDown,
  ChevronUp,
  Store,
  ShoppingBag,
} from 'lucide-react';
import {
  getPublisherAnalyticsReport,
  invalidatePublisherAnalyticsCache,
  type PublisherAnalyticsReport,
} from '../services/publisherAnalyticsService';

export const PublisherAnalytics: React.FC = () => {
  const [periodPreset, setPeriodPreset] = useState<'this_month' | 'last_month' | 'this_year' | 'custom'>('this_month');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [report, setReport] = useState<PublisherAnalyticsReport | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedPublisher, setExpandedPublisher] = useState<string | null>(null);

  // Compute dates based on preset
  useEffect(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();

    if (periodPreset === 'this_month') {
      const start = new Date(y, m, 1).toISOString().split('T')[0];
      const end = new Date(y, m + 1, 0).toISOString().split('T')[0];
      setStartDate(start);
      setEndDate(end);
    } else if (periodPreset === 'last_month') {
      const start = new Date(y, m - 1, 1).toISOString().split('T')[0];
      const end = new Date(y, m, 0).toISOString().split('T')[0];
      setStartDate(start);
      setEndDate(end);
    } else if (periodPreset === 'this_year') {
      const start = new Date(y, 0, 1).toISOString().split('T')[0];
      const end = new Date(y, 11, 31).toISOString().split('T')[0];
      setStartDate(start);
      setEndDate(end);
    }
  }, [periodPreset]);

  const loadReport = useCallback(async (force = false) => {
    if (!startDate || !endDate) return;
    if (force) invalidatePublisherAnalyticsCache();

    setIsLoading(true);
    try {
      const cleanStart = startDate.split('T')[0];
      const cleanEnd = endDate.split('T')[0];
      const label =
        periodPreset === 'this_month'
          ? 'Current Month'
          : periodPreset === 'last_month'
          ? 'Previous Month'
          : periodPreset === 'this_year'
          ? 'Current Year'
          : 'Custom Range';

      const data = await getPublisherAnalyticsReport(cleanStart, cleanEnd, label);
      setReport(data);
    } catch (err) {
      console.error('Error generating publisher analytics:', err);
    } finally {
      setIsLoading(false);
    }
  }, [startDate, endDate, periodPreset]);

  useEffect(() => {
    if (startDate && endDate) {
      loadReport();
    }
  }, [startDate, endDate, loadReport]);

  const toggleExpand = (pubName: string) => {
    setExpandedPublisher((prev) => (prev === pubName ? null : pubName));
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
            <BarChart3 className="w-7 h-7 text-[#071F49]" />
            <span>Publisher Stock, Purchases & Sales Analytics</span>
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Comprehensive publisher stock valuation on hand, purchase history intake, net sales, and margins.
          </p>
        </div>

        <button
          type="button"
          onClick={() => loadReport(true)}
          disabled={isLoading}
          className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-2 self-start cursor-pointer"
        >
          <RotateCcw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Refresh Analytics</span>
        </button>
      </div>

      {/* Preset & Date Filter Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setPeriodPreset('this_month')}
            className={`px-3.5 py-1.5 rounded-xl font-bold text-xs transition-all cursor-pointer ${
              periodPreset === 'this_month'
                ? 'bg-[#071F49] text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            This Month
          </button>
          <button
            type="button"
            onClick={() => setPeriodPreset('last_month')}
            className={`px-3.5 py-1.5 rounded-xl font-bold text-xs transition-all cursor-pointer ${
              periodPreset === 'last_month'
                ? 'bg-[#071F49] text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            Last Month
          </button>
          <button
            type="button"
            onClick={() => setPeriodPreset('this_year')}
            className={`px-3.5 py-1.5 rounded-xl font-bold text-xs transition-all cursor-pointer ${
              periodPreset === 'this_year'
                ? 'bg-[#071F49] text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            This Year
          </button>
          <button
            type="button"
            onClick={() => setPeriodPreset('custom')}
            className={`px-3.5 py-1.5 rounded-xl font-bold text-xs transition-all cursor-pointer ${
              periodPreset === 'custom'
                ? 'bg-[#071F49] text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            Custom Range
          </button>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-500 font-medium">Period:</span>
          <input
            type="date"
            value={startDate}
            onChange={(e) => {
              setPeriodPreset('custom');
              setStartDate(e.target.value);
            }}
            className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs"
          />
          <span className="text-slate-400">to</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => {
              setPeriodPreset('custom');
              setEndDate(e.target.value);
            }}
            className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs"
          />
        </div>
      </div>

      {/* Fuzzy Duplicate Warnings */}
      {report && report.warnings.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl text-xs space-y-1">
          <div className="flex items-center gap-2 font-bold text-amber-800">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <span>Fuzzy Duplicate Warnings</span>
          </div>
          <ul className="list-disc list-inside text-amber-700 pl-1 space-y-0.5">
            {report.warnings.map((w, idx) => (
              <li key={idx}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Executive Summary Cards: 6-Card High Impact Overview */}
      {report && (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          {/* 1. Shop Stock on Hand */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-1">
            <div className="flex items-center gap-1.5 text-slate-500 text-xs font-semibold">
              <Store className="w-4 h-4 text-[#071F49]" />
              <span>Stock on Hand</span>
            </div>
            <div className="text-lg font-black text-[#071F49]">
              PKR {report.summary.totalStockCostValue.toLocaleString()}
            </div>
            <div className="text-[11px] text-slate-500 font-medium">
              {report.summary.totalStockQuantity.toLocaleString()} shop units
            </div>
          </div>

          {/* 2. Total Purchases Intake */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-1">
            <div className="flex items-center gap-1.5 text-slate-500 text-xs font-semibold">
              <ShoppingBag className="w-4 h-4 text-indigo-600" />
              <span>Purchases Intake</span>
            </div>
            <div className="text-lg font-black text-indigo-900">
              PKR {report.summary.totalPurchasedAmount.toLocaleString()}
            </div>
            <div className="text-[11px] text-slate-500 font-medium">
              {report.summary.totalPurchasedQuantity.toLocaleString()} purchased units
            </div>
          </div>

          {/* 3. Net Sales */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-1">
            <div className="flex items-center gap-1.5 text-slate-500 text-xs font-semibold">
              <DollarSign className="w-4 h-4 text-[#071F49]" />
              <span>Net Sales</span>
            </div>
            <div className="text-lg font-black text-slate-900">
              PKR {report.summary.totalNetSales.toLocaleString()}
            </div>
            <div className="text-[11px] text-slate-500">
              Gross: PKR {report.summary.totalGrossSales.toLocaleString()}
            </div>
          </div>

          {/* 4. Books Sold */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-1">
            <div className="flex items-center gap-1.5 text-slate-500 text-xs font-semibold">
              <Package className="w-4 h-4 text-blue-600" />
              <span>Books Sold</span>
            </div>
            <div className="text-lg font-black text-slate-900">
              {report.summary.totalSalesQuantity.toLocaleString()}{' '}
              <span className="text-xs font-normal text-slate-500">units</span>
            </div>
            <div className="text-[11px] text-slate-500">
              Returned: {report.summary.totalReturnedQuantity} units
            </div>
          </div>

          {/* 5. Gross Profit */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-1">
            <div className="flex items-center gap-1.5 text-slate-500 text-xs font-semibold">
              <TrendingUp className="w-4 h-4 text-emerald-600" />
              <span>Gross Profit</span>
            </div>
            <div className="text-lg font-black text-emerald-700">
              PKR {report.summary.totalGrossProfit.toLocaleString()}
            </div>
            <div className="text-[11px] text-slate-500">
              COGS: PKR {report.summary.totalCogs.toLocaleString()}
            </div>
          </div>

          {/* 6. Average Margin */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-1">
            <div className="flex items-center gap-1.5 text-slate-500 text-xs font-semibold">
              <Layers className="w-4 h-4 text-purple-600" />
              <span>Average Margin</span>
            </div>
            <div className="text-lg font-black text-purple-700">
              {report.summary.averageMarginPercent}%
            </div>
            <div className="text-[11px] text-slate-500">
              Across {report.publishers.length} active publishers
            </div>
          </div>
        </div>
      )}

      {/* Main Publisher Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
          <h3 className="font-bold text-sm text-slate-800">
            Publishers Performance Breakdown ({report?.publishers.length || 0})
          </h3>
          <span className="text-xs text-slate-500">Sorted by Net Sales & Stock Value</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100/70 text-slate-600 font-bold border-b border-slate-200">
                <th className="py-3 px-4">Publisher Name</th>
                <th className="py-3 px-4 text-right">Stock on Hand (Cost)</th>
                <th className="py-3 px-4 text-right">Purchased (Cost)</th>
                <th className="py-3 px-4 text-right">Sold Qty</th>
                <th className="py-3 px-4 text-right">Net Sales</th>
                <th className="py-3 px-4 text-right">COGS</th>
                <th className="py-3 px-4 text-right">Gross Profit</th>
                <th className="py-3 px-4 text-right">Margin</th>
                <th className="py-3 px-4 text-center">Breakdown</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    Aggregating publisher stock, purchases, and sales data...
                  </td>
                </tr>
              ) : !report || report.publishers.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    No publisher stock or transactions recorded in the selected period.
                  </td>
                </tr>
              ) : (
                report.publishers.map((pub) => {
                  const isExpanded = expandedPublisher === pub.publisherName;
                  return (
                    <React.Fragment key={pub.publisherName}>
                      <tr
                        className={`hover:bg-slate-50/80 transition-colors cursor-pointer ${
                          isExpanded ? 'bg-blue-50/40' : ''
                        }`}
                        onClick={() => toggleExpand(pub.publisherName)}
                      >
                        <td className="py-3 px-4 font-bold text-slate-900">
                          {pub.publisherName}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <span className="font-bold text-[#071F49] block">
                            PKR {pub.currentStockCostValue.toLocaleString()}
                          </span>
                          <span className="text-[11px] text-slate-500 font-medium block">
                            {pub.currentStockQuantity.toLocaleString()} units
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <span className="font-bold text-indigo-900 block">
                            PKR {pub.totalPurchasedAmount.toLocaleString()}
                          </span>
                          <span className="text-[11px] text-slate-500 font-medium block">
                            {pub.purchasedQuantity.toLocaleString()} units
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-medium text-slate-700">
                          {pub.salesQuantity.toLocaleString()}
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-slate-900">
                          PKR {pub.netSales.toLocaleString()}
                        </td>
                        <td className="py-3 px-4 text-right text-slate-600">
                          PKR {pub.costOfGoodsSold.toLocaleString()}
                        </td>
                        <td className="py-3 px-4 text-right font-black text-emerald-700">
                          PKR {pub.grossProfit.toLocaleString()}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <span
                            className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                              pub.grossMarginPercent >= 25
                                ? 'bg-emerald-100 text-emerald-800'
                                : pub.grossMarginPercent >= 15
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {pub.grossMarginPercent}%
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <button
                            type="button"
                            className="p-1 text-slate-400 hover:text-slate-700"
                          >
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </button>
                        </td>
                      </tr>

                      {/* Expanded Product Breakdown for this Publisher */}
                      {isExpanded && (
                        <tr>
                          <td colSpan={9} className="p-4 bg-slate-50 border-y border-slate-200">
                            <div className="max-w-5xl mx-auto space-y-2">
                              <h4 className="font-bold text-xs text-slate-700">
                                Product Breakdown for {pub.publisherName}:
                              </h4>
                              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                                <table className="w-full text-left text-xs">
                                  <thead className="bg-slate-100 text-slate-600 font-semibold">
                                    <tr>
                                      <th className="py-2.5 px-3">Title</th>
                                      <th className="py-2.5 px-3">SKU</th>
                                      <th className="py-2.5 px-3 text-right">Shop Stock on Hand</th>
                                      <th className="py-2.5 px-3 text-right">Purchased Intake</th>
                                      <th className="py-2.5 px-3 text-center">Net Sold</th>
                                      <th className="py-2.5 px-3 text-right">Net Sales</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100">
                                    {pub.topProducts.map((tp) => (
                                      <tr key={tp.productId} className="hover:bg-slate-50/60">
                                        <td className="py-2 px-3 font-medium text-slate-800">{tp.productTitle}</td>
                                        <td className="py-2 px-3 font-mono text-slate-500">{tp.sku}</td>
                                        <td className="py-2 px-3 text-right">
                                          <span className="font-bold text-[#071F49]">
                                            {tp.stockOnHand} units
                                          </span>
                                          <span className="text-[10px] text-slate-400 block">
                                            PKR {tp.stockCostValue.toLocaleString()}
                                          </span>
                                        </td>
                                        <td className="py-2 px-3 text-right">
                                          <span className="font-bold text-indigo-900">
                                            {tp.purchasedQty} units
                                          </span>
                                          <span className="text-[10px] text-slate-400 block">
                                            PKR {tp.purchasedAmount.toLocaleString()}
                                          </span>
                                        </td>
                                        <td className="py-2 px-3 text-center font-bold text-slate-900">
                                          {tp.quantity}
                                        </td>
                                        <td className="py-2 px-3 text-right font-black text-slate-900">
                                          PKR {tp.netAmount.toLocaleString()}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
