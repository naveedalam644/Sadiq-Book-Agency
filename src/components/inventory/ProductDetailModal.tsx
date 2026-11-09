import React from 'react';
import { Barcode, AlertTriangle, TrendingUp, Calendar, CheckCircle, History, Layers } from 'lucide-react';
import { Modal } from '../common/Modal';
import { Badge } from '../common/Badge';
import { Button } from '../common/Button';
import type { ProductDocument, StockBatchDocument } from '../../types/database';
import { formatCurrency, formatNumber } from '../../utils/formatters';
import { getActiveBatchesForProduct, calculateProductValuationFromBatches } from '../../services/stockBatchService';

export interface ProductDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: ProductDocument | null;
  onEdit?: (product: ProductDocument) => void;
  onViewHistory?: (product: ProductDocument) => void;
}

export const ProductDetailModal: React.FC<ProductDetailModalProps> = ({
  isOpen,
  onClose,
  product,
  onEdit,
  onViewHistory,
}) => {
  const [activeBatches, setActiveBatches] = React.useState<StockBatchDocument[]>([]);

  React.useEffect(() => {
    if (isOpen && product?.id) {
      getActiveBatchesForProduct(product.id)
        .then((batches) => setActiveBatches(batches))
        .catch((err) => console.error('Error fetching batches:', err));
    } else {
      setActiveBatches([]);
    }
  }, [isOpen, product?.id]);

  const batchValuation = React.useMemo(() => {
    if (!product) return 0;
    return calculateProductValuationFromBatches(product, activeBatches);
  }, [product, activeBatches]);

  if (!product) return null;

  const isLowStock = product.currentStock <= product.lowStockThreshold;
  const valuation = batchValuation > 0 ? batchValuation : product.currentStock * product.costPrice;
  const retailMargin = product.retailPrice - product.costPrice;
  const retailMarginPercent = product.costPrice > 0 ? ((retailMargin / product.costPrice) * 100).toFixed(1) : '0';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={product.title}
      description={`SKU: ${product.sku} | Classification: ${product.classification.toUpperCase()}`}
      size="lg"
      footer={
        <div className="flex items-center justify-between w-full">
          <div className="text-xs text-slate-500 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5" />
            <span>Updated: {new Date(product.updatedAt).toLocaleDateString()}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Close
            </Button>
            {onViewHistory && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  onClose();
                  onViewHistory(product);
                }}
                className="text-[#071F49] border-[#071F49]/20 hover:bg-[#071F49]/5"
              >
                <History className="w-3.5 h-3.5 mr-1" />
                View History
              </Button>
            )}
            {onEdit && (
              <Button
                variant="gold"
                size="sm"
                onClick={() => {
                  onClose();
                  onEdit(product);
                }}
              >
                Edit Product
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        {/* Top Badges & Status Banner */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Badge variant="navy" size="md">
              {product.classification.toUpperCase()}
            </Badge>
            <Badge variant="neutral" size="md">
              {product.categoryName || 'General Category'}
            </Badge>
            {product.isActive ? (
              <Badge variant="success" size="md" dot>
                Active
              </Badge>
            ) : (
              <Badge variant="danger" size="md">
                Inactive
              </Badge>
            )}
          </div>

          {isLowStock ? (
            <Badge variant="warning" size="md">
              <AlertTriangle className="w-3.5 h-3.5 mr-1" />
              Low Stock Alert ({product.currentStock} left)
            </Badge>
          ) : (
            <Badge variant="brand" size="md">
              <CheckCircle className="w-3.5 h-3.5 mr-1" />
              Sufficient Stock
            </Badge>
          )}
        </div>

        {/* Stock & Valuation Highlight Card */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 bg-[#071F49] text-white rounded-2xl">
          <div className="p-3 bg-white/5 rounded-xl border border-white/10">
            <span className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider block mb-1">
              Current Stock
            </span>
            <div className="text-2xl font-black text-[#F5B51B] font-mono">
              {formatNumber(product.currentStock)}
              <span className="text-xs text-slate-300 ml-1.5 font-sans font-normal">
                {product.unit}s
              </span>
            </div>
            <span className="text-[10px] text-slate-400 mt-1 block">
              Min Threshold: {product.lowStockThreshold}
            </span>
          </div>

          <div className="p-3 bg-white/5 rounded-xl border border-white/10">
            <span className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider block mb-1">
              Purchase Cost (PKR)
            </span>
            <div className="text-2xl font-black text-white font-mono">
              {formatCurrency(product.costPrice)}
            </div>
            <span className="text-[10px] text-slate-400 mt-1 block">Per {product.unit}</span>
          </div>

          <div className="p-3 bg-white/5 rounded-xl border border-white/10">
            <span className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider block mb-1">
              Stock Valuation (Cost)
            </span>
            <div className="text-2xl font-black text-[#F5B51B] font-mono">
              {formatCurrency(valuation)}
            </div>
            <span className="text-[10px] text-slate-400 mt-1 block">Total asset value</span>
          </div>
        </div>

        {/* Pricing Breakdown Grid */}
        <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
          <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <TrendingUp className="w-4 h-4 text-[#071F49]" />
            Pricing & Valuation
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <span className="text-slate-500 block">Original Price / MRP:</span>
              <span className="text-base font-bold text-slate-900 font-mono mt-0.5 block">
                {formatCurrency(product.retailPrice)}
              </span>
              <span className="text-[11px] text-slate-500">Catalog / Counter rate</span>
            </div>

            <div>
              <span className="text-slate-500 block">Actual Purchase Cost:</span>
              <span className="text-base font-bold text-[#071F49] font-mono mt-0.5 block">
                {formatCurrency(product.costPrice)}
              </span>
              <span className="text-[11px] text-emerald-600 font-medium">
                +{retailMarginPercent}% Markup ({formatCurrency(retailMargin)})
              </span>
            </div>
          </div>
        </div>

        {/* Notebook & Register Dynamic Specifications (When applicable) */}
        {(product.classification === 'notebook' ||
          product.classification === 'register' ||
          product.notebookSize ||
          product.notebookSheets ||
          product.notebookGrammage) && (
          <div className="p-4 bg-amber-50/60 border border-amber-200/80 rounded-xl space-y-2">
            <h4 className="text-xs font-bold text-amber-950 uppercase tracking-wider flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-amber-700" />
              Notebook & Register Specifications
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="p-2.5 bg-white border border-amber-200/60 rounded-lg">
                <span className="text-slate-400 block text-[10px] uppercase font-semibold">Size</span>
                <span className="font-bold text-slate-800 text-sm">
                  {product.notebookSize || 'Not specified'}
                </span>
              </div>
              <div className="p-2.5 bg-white border border-amber-200/60 rounded-lg">
                <span className="text-slate-400 block text-[10px] uppercase font-semibold">Sheets</span>
                <span className="font-bold text-slate-800 text-sm">
                  {product.notebookSheets ? `${product.notebookSheets} Sheets` : 'Not specified'}
                </span>
              </div>
              <div className="p-2.5 bg-white border border-amber-200/60 rounded-lg">
                <span className="text-slate-400 block text-[10px] uppercase font-semibold">Grammage (Paper GSM)</span>
                <span className="font-bold text-slate-800 text-sm">
                  {product.notebookGrammage || 'Not specified'}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Specification Details List */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
          <div className="p-3 border border-slate-200 rounded-xl">
            <span className="text-slate-400 block mb-0.5">Publisher</span>
            <span className="font-semibold text-slate-800">
              {product.publisherName || 'Not specified'}
            </span>
          </div>

          <div className="p-3 border border-slate-200 rounded-xl">
            <span className="text-slate-400 block mb-0.5">Series</span>
            <span className="font-semibold text-slate-800">
              {product.seriesName || 'Unassigned / Standalone'}
            </span>
          </div>

          <div className="p-3 border border-slate-200 rounded-xl">
            <span className="text-slate-400 block mb-0.5">Author / Brand</span>
            <span className="font-semibold text-slate-800">
              {product.authorOrPublisher || 'Not specified'}
            </span>
          </div>

          <div className="p-3 border border-slate-200 rounded-xl">
            <span className="text-slate-400 block mb-0.5">Edition / Class</span>
            <span className="font-semibold text-slate-800">
              {product.edition || 'Standard'}
            </span>
          </div>

          <div className="p-3 border border-slate-200 rounded-xl">
            <span className="text-slate-400 block mb-0.5">Barcode (EAN / UPC)</span>
            <span className="font-semibold font-mono text-slate-800 flex items-center gap-1">
              <Barcode className="w-3.5 h-3.5 text-slate-400" />
              {product.barcode || 'None'}
            </span>
          </div>

          <div className="p-3 border border-slate-200 rounded-xl">
            <span className="text-slate-400 block mb-0.5">System Document ID</span>
            <span className="font-mono text-[11px] text-slate-600 truncate block">
              {product.id}
            </span>
          </div>
        </div>

        {/* Active FIFO Stock Batches */}
        {activeBatches.length > 0 && (
          <div className="p-4 bg-amber-50/50 border border-amber-200/60 rounded-xl space-y-2.5">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-amber-950 uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-amber-700" />
                Active Stock Batches (FIFO Costing)
              </h4>
              <span className="text-[11px] text-amber-800 font-medium">
                {activeBatches.length} batch{activeBatches.length > 1 ? 'es' : ''} in inventory
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="bg-amber-100/60 text-amber-900 font-semibold text-[11px] uppercase">
                  <tr>
                    <th className="px-2.5 py-1.5">Intake Date</th>
                    <th className="px-2.5 py-1.5">Invoice / Batch</th>
                    <th className="px-2.5 py-1.5 text-center">Remaining / Intake</th>
                    <th className="px-2.5 py-1.5 text-right">MRP</th>
                    <th className="px-2.5 py-1.5 text-right">Unit Cost</th>
                    <th className="px-2.5 py-1.5 text-right">Valuation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-amber-200/40">
                  {activeBatches.map((batch) => (
                    <tr key={batch.id} className="hover:bg-amber-100/30">
                      <td className="px-2.5 py-1.5 font-mono text-slate-600">
                        {batch.purchaseDate || batch.createdAt.split('T')[0]}
                      </td>
                      <td className="px-2.5 py-1.5 font-medium text-slate-800">
                        {batch.batchType === 'opening' ? 'Opening Legacy Stock' : batch.purchaseInvoiceNo}
                      </td>
                      <td className="px-2.5 py-1.5 text-center font-mono font-semibold text-slate-800">
                        {formatNumber(batch.remainingQuantity)} / {formatNumber(batch.quantityPurchased)}
                      </td>
                      <td className="px-2.5 py-1.5 text-right font-mono text-slate-600">
                        {batch.mrp > 0 ? formatCurrency(batch.mrp) : '—'}
                      </td>
                      <td className="px-2.5 py-1.5 text-right font-mono text-slate-700 font-semibold">
                        {formatCurrency(batch.unitCost)}
                      </td>
                      <td className="px-2.5 py-1.5 text-right font-mono font-bold text-slate-900">
                        {formatCurrency(batch.remainingQuantity * batch.unitCost)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};
