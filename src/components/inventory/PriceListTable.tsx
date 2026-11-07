import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Tag,
  Building2,
  Layers,
  Edit,
  Printer,
  RefreshCw,
  Coins,
  Package,
  Percent,
  SlidersHorizontal,
  BookOpen,
} from 'lucide-react';
import { Table, type Column } from '../common/Table';
import { Button } from '../common/Button';
import { SearchInput } from '../common/SearchInput';
import { PriceEditModal } from './PriceEditModal';
import type {
  ProductDocument,
  PublisherDocument,
  SeriesDocument,
  ItemClassification,
} from '../../types/database';
import {
  getPriceListProducts,
  updateProductPrice,
  groupProductsByPublisherAndSeries,
  type PublisherGroupedPriceList,
} from '../../services/priceListService';
import { getActivePublishers } from '../../services/publisherService';
import { getActiveSeriesByPublisher } from '../../services/seriesService';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { formatCurrency, formatNumber } from '../../utils/formatters';

export interface PriceListTableProps {
  initialPublisherId?: string;
  initialSeriesId?: string;
  onPriceUpdated?: () => void;
}

export const PriceListTable: React.FC<PriceListTableProps> = ({
  initialPublisherId,
  initialSeriesId,
  onPriceUpdated,
}) => {
  const { currentUser } = useAuth();
  const { success, error: toastError } = useToast();

  // Filters state
  const [selectedClassification, setSelectedClassification] = useState<ItemClassification | 'all'>('all');
  const [publishers, setPublishers] = useState<PublisherDocument[]>([]);
  const [selectedPublisherId, setSelectedPublisherId] = useState<string>(initialPublisherId || 'all');
  const [seriesList, setSeriesList] = useState<SeriesDocument[]>([]);
  const [selectedSeriesId, setSelectedSeriesId] = useState<string>(initialSeriesId || 'all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [viewMode, setViewMode] = useState<'table' | 'grouped'>('table');

  // Products state
  const [products, setProducts] = useState<ProductDocument[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Edit Modal State
  const [editingProduct, setEditingProduct] = useState<ProductDocument | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);

  // Load Publishers once
  useEffect(() => {
    getActivePublishers()
      .then((data) => setPublishers(data))
      .catch((err) => console.error('Failed to load publishers for price list:', err));
  }, []);

  // When selectedPublisherId changes, load its series
  useEffect(() => {
    if (selectedPublisherId && selectedPublisherId !== 'all') {
      getActiveSeriesByPublisher(selectedPublisherId)
        .then((series) => {
          setSeriesList(series);
          // If current selectedSeriesId doesn't belong to this publisher, reset to 'all'
          if (selectedSeriesId !== 'all' && !series.some((s) => s.id === selectedSeriesId)) {
            setSelectedSeriesId('all');
          }
        })
        .catch((err) => console.error('Failed to load series for publisher:', err));
    } else {
      setSeriesList([]);
      setSelectedSeriesId('all');
    }
  }, [selectedPublisherId]);

  // Load Products
  const loadProducts = useCallback(async () => {
    setIsLoading(true);
    try {
      const items = await getPriceListProducts({
        classification: selectedClassification,
        publisherId: selectedPublisherId,
        seriesId: selectedSeriesId,
        searchTerm,
        onlyActive: true,
      });
      setProducts(items);
    } catch (err: any) {
      toastError(err?.message || 'Failed to load price list items');
    } finally {
      setIsLoading(false);
    }
  }, [selectedClassification, selectedPublisherId, selectedSeriesId, searchTerm, toastError]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  // Summary indicators
  const stats = useMemo(() => {
    const totalCount = products.length;
    let totalStockValuation = 0;
    let totalMrpSum = 0;
    let discWeightedSum = 0;

    for (const p of products) {
      const stock = Number(p.currentStock) || 0;
      const cost = Number(p.costPrice) || 0;
      const mrp = Number(p.retailPrice || p.mrp || p.originalPrice) || 0;
      const disc = Number(p.publisherDiscountPercent) || 0;

      totalStockValuation += stock * cost;
      totalMrpSum += mrp;
      discWeightedSum += disc;
    }

    const avgDisc = totalCount > 0 ? Math.round(discWeightedSum / totalCount) : 0;

    return {
      totalCount,
      totalStockValuation,
      avgDisc,
    };
  }, [products]);

  // Grouped products
  const groupedData: PublisherGroupedPriceList[] = useMemo(() => {
    if (viewMode !== 'grouped') return [];
    return groupProductsByPublisherAndSeries(products);
  }, [products, viewMode]);

  // Handler for saving edited price
  const handleSavePrice = async (
    productId: string,
    updates: {
      retailPrice: number;
      publisherDiscountPercent?: number;
      wholesalePrice?: number;
      costPrice?: number;
    }
  ) => {
    try {
      const updated = await updateProductPrice(
        productId,
        updates,
        currentUser?.uid || 'admin',
        currentUser?.email || 'admin@sadiqbookagency.com'
      );

      // Update state locally
      setProducts((prev) =>
        prev.map((p) => (p.id === productId ? { ...p, ...updated } : p))
      );

      success(`Price for "${updated.title}" updated successfully.`);
      if (onPriceUpdated) onPriceUpdated();
    } catch (err: any) {
      toastError(err?.message || 'Failed to update price');
      throw err;
    }
  };

  // Printable Price List Generation
  const handlePrintPriceList = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Pop-up was blocked. Please allow pop-ups for this site to print the price list.');
      return;
    }

    const publisherNameStr = selectedPublisherId !== 'all'
      ? (publishers.find((p) => p.id === selectedPublisherId)?.name || 'Selected Publisher')
      : 'All Publishers';

    const seriesNameStr = selectedSeriesId !== 'all'
      ? (seriesList.find((s) => s.id === selectedSeriesId)?.name || 'Selected Series')
      : '';

    const currentDateStr = new Date().toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });

    const rowsHtml = products
      .map(
        (p, idx) => `
        <tr style="border-bottom: 1px solid #e2e8f0; font-size: 11px;">
          <td style="padding: 6px 8px; text-align: center; color: #64748b;">${idx + 1}</td>
          <td style="padding: 6px 8px; font-weight: bold; color: #0f172a;">
            ${p.title}
            <div style="font-size: 10px; color: #64748b; font-weight: normal;">
              ${[p.publisherName, p.seriesName, p.notebookSize, p.notebookSheets ? `${p.notebookSheets} Sh` : '', p.notebookGrammage].filter(Boolean).join(' • ')}
            </div>
          </td>
          <td style="padding: 6px 8px; font-family: monospace; font-size: 10px; color: #334155;">${p.sku}</td>
          <td style="padding: 6px 8px; text-align: right; font-family: monospace; font-weight: bold; color: #071F49;">
            Rs. ${Number(p.retailPrice || p.mrp || 0).toLocaleString()}
          </td>
          <td style="padding: 6px 8px; text-align: center; font-weight: bold; color: #047857;">
            ${p.publisherDiscountPercent ?? 0}%
          </td>
          <td style="padding: 6px 8px; text-align: right; font-family: monospace; color: #334155;">
            Rs. ${Number(p.costPrice || 0).toLocaleString()}
          </td>
          <td style="padding: 6px 8px; text-align: right; font-family: monospace; font-weight: bold; color: #b45309;">
            Rs. ${Number(p.wholesalePrice || p.retailPrice || 0).toLocaleString()}
          </td>
        </tr>
      `
      )
      .join('');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Price List — Sadiq Book Agency</title>
          <style>
            @page { size: A4; margin: 12mm; }
            body { font-family: system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0f172a; margin: 0; padding: 10px; }
            .header { text-align: center; border-bottom: 2px solid #071F49; padding-bottom: 8px; margin-bottom: 12px; }
            .title { font-size: 20px; font-weight: 900; color: #071F49; letter-spacing: 0.5px; margin: 0; }
            .subtitle { font-size: 12px; color: #64748b; margin-top: 2px; }
            .meta { display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 10px; font-weight: 600; color: #334155; }
            table { width: 100%; border-collapse: collapse; text-align: left; }
            th { background: #071F49; color: #ffffff; padding: 6px 8px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; }
            .footer { margin-top: 15px; border-top: 1px solid #cbd5e1; padding-top: 6px; font-size: 9px; color: #64748b; text-align: center; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1 class="title">SADIQ BOOK AGENCY</h1>
            <div class="subtitle">Complete Price List & Trade Rate Catalog</div>
          </div>
          <div class="meta">
            <div>
              <span>Publisher / Category: <strong>${publisherNameStr}</strong></span>
              ${seriesNameStr ? `<span style="margin-left: 15px;">Series: <strong>${seriesNameStr}</strong></span>` : ''}
            </div>
            <div>
              <span>Date: <strong>${currentDateStr}</strong></span>
              <span style="margin-left: 15px;">Items Count: <strong>${products.length}</strong></span>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th style="width: 30px; text-align: center;">#</th>
                <th>Item / Book Title</th>
                <th style="width: 90px;">SKU</th>
                <th style="width: 80px; text-align: right;">MRP (Rs.)</th>
                <th style="width: 60px; text-align: center;">Pub Disc</th>
                <th style="width: 80px; text-align: right;">Cost (Rs.)</th>
                <th style="width: 85px; text-align: right;">Wholesale</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>

          <div class="footer">
            Printed from Sadiq Book Agency Management System • Prices subject to change without prior notice.
          </div>
          <script>
            window.onload = function() {
              window.print();
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  // Table Columns Definition
  const columns: Column<ProductDocument>[] = [
    {
      key: 'title',
      header: 'Product / Item Title',
      render: (row) => (
        <div className="max-w-xs sm:max-w-sm">
          <div className="font-bold text-slate-900 truncate hover:text-[#071F49]">
            {row.title}
          </div>
          <div className="text-[11px] text-slate-500 truncate mt-0.5">
            {row.publisherName ? (
              <span className="font-semibold text-slate-700">{row.publisherName}</span>
            ) : row.authorOrPublisher ? (
              <span>{row.authorOrPublisher}</span>
            ) : null}
            {row.seriesName && (
              <span className="text-slate-500"> • {row.seriesName}</span>
            )}
            {(row.notebookSize || row.notebookSheets || row.notebookGrammage) && (
              <span className="text-amber-800 font-semibold ml-1">
                • {[row.notebookSize, row.notebookSheets ? `${row.notebookSheets} Sh` : '', row.notebookGrammage].filter(Boolean).join(' ')}
              </span>
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'sku',
      header: 'SKU / Barcode',
      render: (row) => (
        <div>
          <span className="font-mono font-semibold text-xs text-[#071F49] block">
            {row.sku}
          </span>
          {row.barcode && (
            <span className="font-mono text-[10px] text-slate-400 block truncate">
              {row.barcode}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'retailPrice',
      header: 'Retail MRP (Rs.)',
      align: 'right',
      render: (row) => {
        const mrp = Number(row.retailPrice || row.mrp || row.originalPrice) || 0;
        return (
          <span className="font-mono text-sm font-black text-[#071F49]">
            {formatCurrency(mrp)}
          </span>
        );
      },
    },
    {
      key: 'publisherDiscount',
      header: 'Pub. Disc %',
      align: 'center',
      render: (row) => {
        const disc = typeof row.publisherDiscountPercent === 'number'
          ? row.publisherDiscountPercent
          : (row.retailPrice > 0 ? Math.max(0, Math.round(((row.retailPrice - row.costPrice) / row.retailPrice) * 100)) : 0);
        return (
          <span className="inline-flex items-center text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full">
            {disc}%
          </span>
        );
      },
    },
    {
      key: 'costPrice',
      header: 'Cost Price (Rs.)',
      align: 'right',
      render: (row) => (
        <span className="font-mono text-xs font-semibold text-slate-600">
          {formatCurrency(row.costPrice)}
        </span>
      ),
    },
    {
      key: 'wholesalePrice',
      header: 'Wholesale (Rs.)',
      align: 'right',
      render: (row) => {
        const wholesale = Number(row.wholesalePrice) || Number(row.retailPrice) || 0;
        return (
          <span className="font-mono text-xs font-bold text-amber-900 bg-amber-50/80 px-2 py-0.5 rounded border border-amber-200/80">
            {formatCurrency(wholesale)}
          </span>
        );
      },
    },
    {
      key: 'currentStock',
      header: 'Shop Stock',
      align: 'center',
      render: (row) => (
        <span className="font-mono text-xs font-bold text-slate-800">
          {formatNumber(row.currentStock)} {row.unit}s
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Action',
      align: 'center',
      render: (row) => (
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setEditingProduct(row);
            setIsEditModalOpen(true);
          }}
          className="text-xs py-1 px-2.5 text-[#071F49] border-[#071F49]/30 hover:bg-[#071F49]/5"
          leftIcon={<Edit className="w-3.5 h-3.5 text-[#071F49]" />}
        >
          Edit Price
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {/* 1. Header with Title, Actions & View Switcher */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200/90 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-[#071F49] text-[#F5B51B] rounded-xl">
              <Tag className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-[#071F49]">
                Price List & Rate Catalog
              </h2>
              <p className="text-xs text-slate-500">
                Publisher &gt; Series structured prices with instant shop stock assignment & historical khata protection
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
          {/* View mode toggle */}
          <div className="flex rounded-xl bg-slate-100 p-0.5 border border-slate-200">
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition ${
                viewMode === 'table'
                  ? 'bg-white text-[#071F49] shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Flat Table
            </button>
            <button
              type="button"
              onClick={() => setViewMode('grouped')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition ${
                viewMode === 'grouped'
                  ? 'bg-white text-[#071F49] shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Grouped by Series
            </button>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={loadProducts}
            isLoading={isLoading}
            leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
          >
            Refresh
          </Button>

          <Button
            variant="gold"
            size="sm"
            onClick={handlePrintPriceList}
            disabled={products.length === 0}
            leftIcon={<Printer className="w-3.5 h-3.5 text-[#071F49]" />}
          >
            Print Price List
          </Button>
        </div>
      </div>

      {/* 2. Top Summary Indicators */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-3.5 bg-white border border-slate-200/90 rounded-2xl shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Items in Price List
            </span>
            <div className="text-xl font-black text-[#071F49] font-mono mt-0.5">
              {formatNumber(stats.totalCount)}
            </div>
          </div>
          <div className="p-2.5 bg-slate-100 text-[#071F49] rounded-xl">
            <Package className="w-4 h-4" />
          </div>
        </div>

        <div className="p-3.5 bg-white border border-slate-200/90 rounded-2xl shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Avg. Publisher Discount
            </span>
            <div className="text-xl font-black text-emerald-700 font-mono mt-0.5">
              {stats.avgDisc}%
            </div>
          </div>
          <div className="p-2.5 bg-emerald-50 text-emerald-700 rounded-xl">
            <Percent className="w-4 h-4" />
          </div>
        </div>

        <div className="p-3.5 bg-[#071F49] text-white rounded-2xl shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">
              Stock Asset Value
            </span>
            <div className="text-xl font-black text-[#F5B51B] font-mono mt-0.5">
              {formatCurrency(stats.totalStockValuation)}
            </div>
          </div>
          <div className="p-2.5 bg-white/10 text-[#F5B51B] rounded-xl">
            <Coins className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* 3. Cascading Hierarchy Filters Bar */}
      <div className="p-4 bg-white border border-slate-200/90 rounded-2xl shadow-xs space-y-3">
        {/* Category Tabs: Books vs Notebooks vs All */}
        <div className="flex items-center gap-1.5 flex-wrap border-b border-slate-100 pb-3">
          <span className="text-xs font-bold text-slate-500 mr-2 flex items-center gap-1">
            <SlidersHorizontal className="w-3.5 h-3.5" />
            Category:
          </span>
          <button
            type="button"
            onClick={() => setSelectedClassification('all')}
            className={`px-3 py-1 text-xs font-bold rounded-lg transition ${
              selectedClassification === 'all'
                ? 'bg-[#071F49] text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            All Categories
          </button>
          <button
            type="button"
            onClick={() => setSelectedClassification('book')}
            className={`px-3 py-1 text-xs font-bold rounded-lg transition flex items-center gap-1.5 ${
              selectedClassification === 'book'
                ? 'bg-[#071F49] text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            Books (Publisher &gt; Series)
          </button>
          <button
            type="button"
            onClick={() => setSelectedClassification('notebook')}
            className={`px-3 py-1 text-xs font-bold rounded-lg transition ${
              selectedClassification === 'notebook'
                ? 'bg-[#071F49] text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            Notebooks
          </button>
          <button
            type="button"
            onClick={() => setSelectedClassification('register')}
            className={`px-3 py-1 text-xs font-bold rounded-lg transition ${
              selectedClassification === 'register'
                ? 'bg-[#071F49] text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            Registers
          </button>
        </div>

        {/* Cascading Publisher > Series Selectors & Search */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
          {/* Step 1: Publisher Selector */}
          <div className="sm:col-span-4">
            <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
              <Building2 className="w-3.5 h-3.5 text-[#071F49]" />
              1. Publisher:
            </label>
            <select
              value={selectedPublisherId}
              onChange={(e) => setSelectedPublisherId(e.target.value)}
              className="w-full px-3 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#071F49] focus:outline-none"
            >
              <option value="all">All Publishers</option>
              {publishers.map((pub) => (
                <option key={pub.id} value={pub.id}>
                  {pub.name}
                </option>
              ))}
            </select>
          </div>

          {/* Step 2: Series Selector */}
          <div className="sm:col-span-4">
            <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
              <Layers className="w-3.5 h-3.5 text-[#071F49]" />
              2. Series:
            </label>
            <select
              value={selectedSeriesId}
              onChange={(e) => setSelectedSeriesId(e.target.value)}
              disabled={selectedPublisherId === 'all'}
              className="w-full px-3 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#071F49] focus:outline-none disabled:bg-slate-100 disabled:text-slate-400"
            >
              <option value="all">
                {selectedPublisherId === 'all'
                  ? 'First select a publisher'
                  : 'All Series in Publisher'}
              </option>
              {seriesList.map((ser) => (
                <option key={ser.id} value={ser.id}>
                  {ser.name}
                </option>
              ))}
            </select>
          </div>

          {/* Step 3: Instant Search */}
          <div className="sm:col-span-4">
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Search by Title, SKU or Specs:
            </label>
            <SearchInput
              value={searchTerm}
              onSearch={setSearchTerm}
              placeholder="Search books, SKU, specs..."
              className="w-full"
            />
          </div>
        </div>
      </div>

      {/* 4. Content Area: Flat Table or Grouped by Series */}
      {viewMode === 'table' ? (
        <Table
          columns={columns}
          data={products}
          keyExtractor={(item) => item.id}
          isLoading={isLoading}
          emptyMessage="No products match the selected publisher, series, or search criteria."
        />
      ) : (
        /* Grouped Hierarchy View: Publisher > Series > Products */
        <div className="space-y-6">
          {groupedData.length === 0 && !isLoading && (
            <div className="p-8 text-center bg-white rounded-2xl border border-slate-200 text-slate-500">
              No products match the selected publisher, series, or search criteria.
            </div>
          )}

          {groupedData.map((pubGroup) => (
            <div
              key={pubGroup.publisherId}
              className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden"
            >
              {/* Publisher Banner Header */}
              <div className="bg-[#071F49] text-white px-5 py-3.5 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Building2 className="w-5 h-5 text-[#F5B51B]" />
                  <div>
                    <h3 className="text-base font-black tracking-wide text-white">
                      {pubGroup.publisherName}
                    </h3>
                    <span className="text-xs text-slate-300">
                      {pubGroup.totalProducts} Total Items in Catalog
                    </span>
                  </div>
                </div>
              </div>

              {/* Series Sub-Groups */}
              <div className="p-4 space-y-4">
                {pubGroup.seriesGroups.map((serGroup) => (
                  <div
                    key={serGroup.seriesId}
                    className="border border-slate-200 rounded-xl overflow-hidden"
                  >
                    <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Layers className="w-4 h-4 text-[#071F49]" />
                        <span className="font-bold text-sm text-[#071F49]">
                          Series: {serGroup.seriesName}
                        </span>
                        <span className="text-xs text-slate-500">
                          ({serGroup.products.length} books)
                        </span>
                      </div>
                    </div>
                    <Table
                      columns={columns}
                      data={serGroup.products}
                      keyExtractor={(item) => item.id}
                      isLoading={false}
                    />
                  </div>
                ))}

                {/* Direct Products without explicit Series */}
                {pubGroup.directProducts.length > 0 && (
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 text-xs font-bold text-slate-700">
                      Standard / Non-Series Items ({pubGroup.directProducts.length})
                    </div>
                    <Table
                      columns={columns}
                      data={pubGroup.directProducts}
                      keyExtractor={(item) => item.id}
                      isLoading={false}
                    />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 5. Quick Price Edit Modal */}
      <PriceEditModal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setEditingProduct(null);
        }}
        product={editingProduct}
        onSave={handleSavePrice}
      />
    </div>
  );
};
