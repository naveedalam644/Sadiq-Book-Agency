import React from 'react';
import { Barcode, MapPin, AlertTriangle, TrendingUp, Calendar, CheckCircle } from 'lucide-react';
import { Modal } from '../common/Modal';
import { Badge } from '../common/Badge';
import { Button } from '../common/Button';
import type { ProductDocument } from '../../types/database';
import { formatCurrency, formatNumber } from '../../utils/formatters';

export interface ProductDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: ProductDocument | null;
  onEdit?: (product: ProductDocument) => void;
}

export const ProductDetailModal: React.FC<ProductDetailModalProps> = ({
  isOpen,
  onClose,
  product,
  onEdit,
}) => {
  if (!product) return null;

  const isLowStock = product.currentStock <= product.lowStockThreshold;
  const valuation = product.currentStock * product.costPrice;
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
            Selling Rates & Gross Margin
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div>
              <span className="text-slate-500 block">Retail (Parchon) Price:</span>
              <span className="text-base font-bold text-slate-900 font-mono mt-0.5 block">
                {formatCurrency(product.retailPrice)}
              </span>
              <span className="text-[11px] text-emerald-600 font-medium">
                +{retailMarginPercent}% Markup ({formatCurrency(retailMargin)})
              </span>
            </div>

            <div>
              <span className="text-slate-500 block">Wholesale Rate:</span>
              <span className="text-base font-bold text-slate-900 font-mono mt-0.5 block">
                {formatCurrency(product.wholesalePrice)}
              </span>
              <span className="text-[11px] text-slate-500">Bulk buyers</span>
            </div>

            <div>
              <span className="text-slate-500 block">Shelf / Rack Location:</span>
              <span className="text-sm font-semibold text-slate-800 mt-1 block flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-slate-400" />
                {product.shelfLocation || 'Unassigned'}
              </span>
            </div>
          </div>
        </div>

        {/* Specification Details List */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="p-3 border border-slate-200 rounded-xl">
            <span className="text-slate-400 block mb-0.5">Author / Publishing House / Brand</span>
            <span className="font-semibold text-slate-800">
              {product.authorOrPublisher || 'Not specified'}
            </span>
          </div>

          <div className="p-3 border border-slate-200 rounded-xl">
            <span className="text-slate-400 block mb-0.5">Edition / Class / Specs</span>
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
      </div>
    </Modal>
  );
};
