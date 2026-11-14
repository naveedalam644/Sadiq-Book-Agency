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
  BookOpen,
  Search,
  X,
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

  // Series and single products interaction states
  const [expandedSeries, setExpandedSeries] = useState<Record<string, boolean>>({});
  const [publisherTab, setPublisherTab] = useState<Record<string, 'series' | 'all_products'>>({});
  const [innerSearch, setInnerSearch] = useState<string>('');

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

                      {/* Expanded Series & Single Product Breakdown for this Publisher */}
                      {isExpanded && (() => {
                        const q = innerSearch.trim().toLowerCase();
                        const currentSubTab = publisherTab[pub.publisherName] || 'series';

                        // Filter Series based on inner search
                        const filteredSeries = (pub.seriesBreakdown || []).filter((ser) => {
                          if (!q) return true;
                          if (ser.seriesName.toLowerCase().includes(q)) return true;
                          return (ser.products || []).some(
                            (p) =>
                              p.productTitle.toLowerCase().includes(q) ||
                              p.sku.toLowerCase().includes(q) ||
                              (p.targetClass && p.targetClass.toLowerCase().includes(q))
                          );
                        });

                        // Filter All Products based on inner search
                        const filteredAllProducts = (pub.topProducts || []).filter((p) => {
                          if (!q) return true;
                          return (
                            p.productTitle.toLowerCase().includes(q) ||
                            p.sku.toLowerCase().includes(q) ||
                            (p.seriesName && p.seriesName.toLowerCase().includes(q)) ||
                            (p.targetClass && p.targetClass.toLowerCase().includes(q))
                          );
                        });

                        return (
                          <tr>
                            <td colSpan={9} className="p-4 sm:p-6 bg-slate-50/90 border-y-2 border-indigo-200">
                              <div className="max-w-6xl mx-auto space-y-4">
                                {/* Top Header of Expanded Section */}
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-[11px] font-black uppercase text-indigo-900 tracking-wider">
                                        Publisher Analytics & Hierarchy
                                      </span>
                                      <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-900 font-bold text-[10px]">
                                        {pub.seriesBreakdown?.length || 0} Series • {pub.topProducts?.length || 0} Total Books
                                      </span>
                                    </div>
                                    <h4 className="text-base sm:text-lg font-black text-[#071F49] mt-0.5">
                                      {pub.publisherName} — Series & Individual Product Hisab
                                    </h4>
                                  </div>

                                  {/* Sub-Tabs: Series View vs All Products View */}
                                  <div className="flex items-center gap-2">
                                    <div className="flex bg-slate-200/90 p-1 rounded-xl text-xs font-bold">
                                      <button
                                        type="button"
                                        onClick={() => setPublisherTab((prev) => ({ ...prev, [pub.publisherName]: 'series' }))}
                                        className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                                          currentSubTab === 'series'
                                            ? 'bg-[#071F49] text-white shadow-xs'
                                            : 'text-slate-600 hover:text-slate-900'
                                        }`}
                                      >
                                        <Layers className="w-3.5 h-3.5 text-[#F5B51B]" />
                                        <span>Series Breakdown ({pub.seriesBreakdown?.length || 0})</span>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setPublisherTab((prev) => ({ ...prev, [pub.publisherName]: 'all_products' }))}
                                        className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                                          currentSubTab === 'all_products'
                                            ? 'bg-[#071F49] text-white shadow-xs'
                                            : 'text-slate-600 hover:text-slate-900'
                                        }`}
                                      >
                                        <BookOpen className="w-3.5 h-3.5 text-[#F5B51B]" />
                                        <span>All Single Products ({pub.topProducts?.length || 0})</span>
                                      </button>
                                    </div>
                                  </div>
                                </div>

                                {/* Filter & Action Bar within Publisher */}
                                <div className="flex items-center justify-between gap-3 flex-wrap">
                                  <div className="relative flex-1 max-w-md">
                                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                    <input
                                      type="text"
                                      value={innerSearch}
                                      onChange={(e) => setInnerSearch(e.target.value)}
                                      placeholder={`Filter series or books in ${pub.publisherName}...`}
                                      className="w-full pl-9 pr-8 py-2 bg-white rounded-xl border border-slate-300 text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#071F49]"
                                    />
                                    {innerSearch && (
                                      <button
                                        type="button"
                                        onClick={() => setInnerSearch('')}
                                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                                      >
                                        <X className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </div>

                                  {currentSubTab === 'series' && (
                                    <div className="flex items-center gap-2 text-xs">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const newExpanded = { ...expandedSeries };
                                          (pub.seriesBreakdown || []).forEach((s) => {
                                            newExpanded[`${pub.publisherName}:${s.seriesName}`] = true;
                                          });
                                          setExpandedSeries(newExpanded);
                                        }}
                                        className="px-2.5 py-1.5 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg text-[11px] font-bold text-slate-700 transition cursor-pointer"
                                      >
                                        Expand All Series
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const newExpanded = { ...expandedSeries };
                                          (pub.seriesBreakdown || []).forEach((s) => {
                                            newExpanded[`${pub.publisherName}:${s.seriesName}`] = false;
                                          });
                                          setExpandedSeries(newExpanded);
                                        }}
                                        className="px-2.5 py-1.5 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg text-[11px] font-bold text-slate-700 transition cursor-pointer"
                                      >
                                        Collapse All
                                      </button>
                                    </div>
                                  )}
                                </div>

                                {/* VIEW 1: SERIES BREAKDOWN WITH COLLAPSIBLE SINGLE PRODUCTS */}
                                {currentSubTab === 'series' && (
                                  <div className="space-y-3">
                                    {filteredSeries.length === 0 ? (
                                      <div className="bg-white p-6 rounded-2xl border border-slate-200 text-center text-slate-400 text-xs">
                                        No series matching "{innerSearch}" found for {pub.publisherName}.
                                      </div>
                                    ) : (
                                      filteredSeries.map((ser) => {
                                        const serKey = `${pub.publisherName}:${ser.seriesName}`;
                                        const isSeriesOpen = Boolean(expandedSeries[serKey]);

                                        return (
                                          <div
                                            key={ser.seriesName}
                                            className="bg-white border border-slate-200/90 rounded-2xl shadow-xs overflow-hidden transition-all"
                                          >
                                            {/* Series Header Row */}
                                            <div
                                              onClick={() =>
                                                setExpandedSeries((prev) => ({
                                                  ...prev,
                                                  [serKey]: !prev[serKey],
                                                }))
                                              }
                                              className="p-4 bg-slate-50/70 hover:bg-slate-100/70 cursor-pointer flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-100 transition"
                                            >
                                              <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-lg bg-[#071F49] text-[#F5B51B] flex items-center justify-center shrink-0 font-black">
                                                  <Layers className="w-4 h-4" />
                                                </div>
                                                <div>
                                                  <div className="flex items-center gap-2">
                                                    <span className="font-black text-sm text-[#071F49]">
                                                      {ser.seriesName}
                                                    </span>
                                                    <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-900 border border-amber-200 text-[10.5px] font-bold">
                                                      {ser.totalProductsCount} {ser.totalProductsCount === 1 ? 'Book' : 'Books'}
                                                    </span>
                                                  </div>
                                                  <span className="text-[11px] text-slate-500">
                                                    Click to {isSeriesOpen ? 'hide' : 'view'} itemized single product hisab
                                                  </span>
                                                </div>
                                              </div>

                                              {/* Series Financial Metrics Strip */}
                                              <div className="flex flex-wrap items-center gap-4 sm:gap-6 text-xs">
                                                {/* Stock on Hand ("hamare pas kitna para hai") */}
                                                <div className="text-left sm:text-right">
                                                  <span className="text-[10px] uppercase font-bold text-slate-400 block">
                                                    Stock on Hand
                                                  </span>
                                                  <span className="font-bold text-[#071F49]">
                                                    {ser.stockQuantity.toLocaleString()} units
                                                  </span>
                                                  <span className="text-[10px] text-slate-500 block font-mono">
                                                    PKR {ser.stockCostValue.toLocaleString()}
                                                  </span>
                                                </div>

                                                {/* Purchases Intake */}
                                                <div className="text-left sm:text-right">
                                                  <span className="text-[10px] uppercase font-bold text-slate-400 block">
                                                    Purchased Intake
                                                  </span>
                                                  <span className="font-bold text-indigo-900">
                                                    {ser.purchasedQuantity.toLocaleString()} units
                                                  </span>
                                                  <span className="text-[10px] text-slate-500 block font-mono">
                                                    PKR {ser.totalPurchasedAmount.toLocaleString()}
                                                  </span>
                                                </div>

                                                {/* Sold Qty & Net Sales ("kitan sold howa hai") */}
                                                <div className="text-left sm:text-right">
                                                  <span className="text-[10px] uppercase font-bold text-slate-400 block">
                                                    Sold & Net Sales
                                                  </span>
                                                  <span className="font-bold text-slate-900">
                                                    {ser.netSalesQuantity.toLocaleString()} sold
                                                  </span>
                                                  <span className="text-[10.5px] font-black text-slate-900 block font-mono">
                                                    PKR {ser.netSales.toLocaleString()}
                                                  </span>
                                                </div>

                                                {/* Profit & Margin */}
                                                <div className="text-left sm:text-right">
                                                  <span className="text-[10px] uppercase font-bold text-slate-400 block">
                                                    Gross Profit
                                                  </span>
                                                  <span className="font-black text-emerald-700 block font-mono">
                                                    PKR {ser.grossProfit.toLocaleString()}
                                                  </span>
                                                  <span
                                                    className={`inline-block px-1.5 py-0.2 rounded text-[9.5px] font-bold ${
                                                      ser.grossMarginPercent >= 25
                                                        ? 'bg-emerald-100 text-emerald-800'
                                                        : ser.grossMarginPercent >= 15
                                                        ? 'bg-blue-100 text-blue-800'
                                                        : 'bg-amber-100 text-amber-800'
                                                    }`}
                                                  >
                                                    {ser.grossMarginPercent}% Margin
                                                  </span>
                                                </div>

                                                <div className="shrink-0 text-slate-400">
                                                  {isSeriesOpen ? (
                                                    <ChevronUp className="w-5 h-5 text-[#071F49]" />
                                                  ) : (
                                                    <ChevronDown className="w-5 h-5" />
                                                  )}
                                                </div>
                                              </div>
                                            </div>

                                            {/* Single Product Table inside Series (Sorted in Class Sequence!) */}
                                            {isSeriesOpen && (
                                              <div className="p-3 sm:p-4 bg-white overflow-x-auto">
                                                <table className="w-full text-left border-collapse text-xs">
                                                  <thead>
                                                    <tr className="bg-slate-100 text-slate-600 font-bold text-[11px] border-b border-slate-200">
                                                      <th className="py-2 px-2.5 w-10 text-center">#</th>
                                                      <th className="py-2 px-2.5 w-16 text-center">Class</th>
                                                      <th className="py-2 px-2.5">Book Title & SKU</th>
                                                      <th className="py-2 px-2.5 text-right">Shop Stock on Hand</th>
                                                      <th className="py-2 px-2.5 text-right">Purchased Intake</th>
                                                      <th className="py-2 px-2.5 text-center">Net Sold</th>
                                                      <th className="py-2 px-2.5 text-right">Net Sales (PKR)</th>
                                                      <th className="py-2 px-2.5 text-right">Gross Profit</th>
                                                      <th className="py-2 px-2.5 text-right">Margin</th>
                                                    </tr>
                                                  </thead>
                                                  <tbody className="divide-y divide-slate-100">
                                                    {ser.products.map((p, idx) => (
                                                      <tr key={p.productId} className="hover:bg-slate-50/70 transition">
                                                        <td className="py-2 px-2.5 text-center text-slate-400 font-mono text-[11px]">
                                                          {idx + 1}
                                                        </td>
                                                        <td className="py-2 px-2.5 text-center">
                                                          {p.targetClass || p.className ? (
                                                            <span className="px-1.5 py-0.5 rounded bg-blue-50 text-[#071F49] font-bold text-[10px] border border-blue-200 whitespace-nowrap">
                                                              {p.targetClass || p.className}
                                                            </span>
                                                          ) : (
                                                            <span className="text-slate-300 text-[10px]">—</span>
                                                          )}
                                                        </td>
                                                        <td className="py-2 px-2.5">
                                                          <span className="font-bold text-slate-900 block">
                                                            {p.productTitle}
                                                          </span>
                                                          <span className="font-mono text-[10px] text-slate-400 block">
                                                            {p.sku}
                                                          </span>
                                                        </td>
                                                        <td className="py-2 px-2.5 text-right">
                                                          <span className="font-bold text-[#071F49] block">
                                                            {p.stockOnHand.toLocaleString()} units
                                                          </span>
                                                          <span className="text-[10px] text-slate-500 font-mono block">
                                                            PKR {p.stockCostValue.toLocaleString()}
                                                          </span>
                                                        </td>
                                                        <td className="py-2 px-2.5 text-right">
                                                          <span className="font-bold text-indigo-900 block">
                                                            {p.purchasedQty.toLocaleString()} units
                                                          </span>
                                                          <span className="text-[10px] text-slate-500 font-mono block">
                                                            PKR {p.purchasedAmount.toLocaleString()}
                                                          </span>
                                                        </td>
                                                        <td className="py-2 px-2.5 text-center font-bold text-slate-900">
                                                          {p.quantity.toLocaleString()}
                                                        </td>
                                                        <td className="py-2 px-2.5 text-right font-black text-slate-900 font-mono">
                                                          PKR {p.netAmount.toLocaleString()}
                                                        </td>
                                                        <td className="py-2 px-2.5 text-right font-bold text-emerald-700 font-mono">
                                                          PKR {p.grossProfit.toLocaleString()}
                                                        </td>
                                                        <td className="py-2 px-2.5 text-right font-bold">
                                                          <span
                                                            className={`px-1.5 py-0.2 rounded text-[9.5px] ${
                                                              p.grossMarginPercent >= 25
                                                                ? 'bg-emerald-100 text-emerald-800'
                                                                : p.grossMarginPercent >= 15
                                                                ? 'bg-blue-100 text-blue-800'
                                                                : 'bg-amber-100 text-amber-800'
                                                            }`}
                                                          >
                                                            {p.grossMarginPercent}%
                                                          </span>
                                                        </td>
                                                      </tr>
                                                    ))}
                                                  </tbody>
                                                </table>
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })
                                    )}
                                  </div>
                                )}

                                {/* VIEW 2: ALL SINGLE PRODUCTS TABLE VIEW (CLASS SEQUENCE SORTED) */}
                                {currentSubTab === 'all_products' && (
                                  <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
                                    <div className="p-3 bg-slate-100/70 border-b border-slate-200 flex items-center justify-between text-xs">
                                      <span className="font-bold text-slate-700 flex items-center gap-1.5">
                                        <BookOpen className="w-3.5 h-3.5 text-[#071F49]" />
                                        <span>All Products for {pub.publisherName} (Sequence: Lower → Higher Class)</span>
                                      </span>
                                      <span className="text-slate-500 font-medium">
                                        {filteredAllProducts.length} items
                                      </span>
                                    </div>
                                    <div className="overflow-x-auto">
                                      <table className="w-full text-left text-xs">
                                        <thead className="bg-slate-100 text-slate-600 font-bold text-[11px] border-b border-slate-200">
                                          <tr>
                                            <th className="py-2 px-3 w-10 text-center">#</th>
                                            <th className="py-2 px-3 w-16 text-center">Class</th>
                                            <th className="py-2 px-3">Title & SKU</th>
                                            <th className="py-2 px-3">Series</th>
                                            <th className="py-2 px-3 text-right">Shop Stock on Hand</th>
                                            <th className="py-2 px-3 text-right">Purchases Intake</th>
                                            <th className="py-2 px-3 text-center">Net Sold</th>
                                            <th className="py-2 px-3 text-right">Net Sales</th>
                                            <th className="py-2 px-3 text-right">Profit</th>
                                            <th className="py-2 px-3 text-right">Margin</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                          {filteredAllProducts.map((tp, idx) => (
                                            <tr key={tp.productId} className="hover:bg-slate-50/70 transition">
                                              <td className="py-2 px-3 text-center text-slate-400 font-mono text-[11px]">{idx + 1}</td>
                                              <td className="py-2 px-3 text-center">
                                                {tp.targetClass || tp.className ? (
                                                  <span className="px-1.5 py-0.5 rounded bg-blue-50 text-[#071F49] font-bold text-[10px] border border-blue-200">
                                                    {tp.targetClass || tp.className}
                                                  </span>
                                                ) : (
                                                  <span className="text-slate-300 text-[10px]">—</span>
                                                )}
                                              </td>
                                              <td className="py-2 px-3">
                                                <span className="font-bold text-slate-900 block">{tp.productTitle}</span>
                                                <span className="font-mono text-[10px] text-slate-400 block">{tp.sku}</span>
                                              </td>
                                              <td className="py-2 px-3 text-slate-700 font-medium">
                                                {tp.seriesName || 'General'}
                                              </td>
                                              <td className="py-2 px-3 text-right">
                                                <span className="font-bold text-[#071F49] block">{tp.stockOnHand.toLocaleString()} units</span>
                                                <span className="text-[10px] text-slate-500 font-mono block">PKR {tp.stockCostValue.toLocaleString()}</span>
                                              </td>
                                              <td className="py-2 px-3 text-right">
                                                <span className="font-bold text-indigo-900 block">{tp.purchasedQty.toLocaleString()} units</span>
                                                <span className="text-[10px] text-slate-500 font-mono block">PKR {tp.purchasedAmount.toLocaleString()}</span>
                                              </td>
                                              <td className="py-2 px-3 text-center font-bold text-slate-900">{tp.quantity}</td>
                                              <td className="py-2 px-3 text-right font-black text-slate-900 font-mono">PKR {tp.netAmount.toLocaleString()}</td>
                                              <td className="py-2 px-3 text-right font-bold text-emerald-700 font-mono">PKR {tp.grossProfit.toLocaleString()}</td>
                                              <td className="py-2 px-3 text-right font-bold">
                                                <span className={`px-1.5 py-0.2 rounded text-[9.5px] ${
                                                  tp.grossMarginPercent >= 25 ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'
                                                }`}>
                                                  {tp.grossMarginPercent}%
                                                </span>
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })()}
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
