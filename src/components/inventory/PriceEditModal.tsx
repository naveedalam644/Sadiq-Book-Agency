import React, { useState, useEffect } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ShieldCheck,
  Building2,
  Layers,
} from 'lucide-react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import type { ProductDocument } from '../../types/database';
import { formatCurrency, formatNumber } from '../../utils/formatters';

export interface PriceEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: ProductDocument | null;
  onSave: (
    productId: string,
    updates: {
      retailPrice: number;
      publisherDiscountPercent?: number;
      wholesalePrice?: number;
      costPrice?: number;
    }
  ) => Promise<void>;
}

export const PriceEditModal: React.FC<PriceEditModalProps> = ({
  isOpen,
  onClose,
  product,
  onSave,
}) => {
  const [retailPrice, setRetailPrice] = useState<number>(0);
  const [publisherDiscountPercent, setPublisherDiscountPercent] = useState<number>(0);
  const [wholesalePrice, setWholesalePrice] = useState<number>(0);
  const [costPrice, setCostPrice] = useState<number>(0);
  const [isManualCost, setIsManualCost] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (product) {
      const mrp = Number(product.retailPrice || product.mrp || product.originalPrice) || 0;
      const pubDisc = typeof product.publisherDiscountPercent === 'number'
        ? product.publisherDiscountPercent
        : (mrp > 0 && product.costPrice > 0 ? Math.max(0, Math.round(((mrp - product.costPrice) / mrp) * 100)) : 0);
      const cost = Number(product.costPrice) || Math.round((mrp * (1 - pubDisc / 100)) * 100) / 100;
      const wholesale = Number(product.wholesalePrice) || mrp;

      setRetailPrice(mrp);
      setPublisherDiscountPercent(pubDisc);
      setCostPrice(cost);
      setWholesalePrice(wholesale);
      setIsManualCost(false);
      setValidationError(null);
    }
  }, [product, isOpen]);

  // Recalculate cost automatically when MRP or pub discount changes (if manual override is false)
  const handleRetailPriceChange = (val: number) => {
    setRetailPrice(val);
    if (!isManualCost) {
      const calcCost = Math.round((val * (1 - publisherDiscountPercent / 100)) * 100) / 100;
      setCostPrice(calcCost);
    }
  };

  const handlePubDiscountChange = (val: number) => {
    const disc = Math.max(0, Math.min(100, val));
    setPublisherDiscountPercent(disc);
    if (!isManualCost) {
      const calcCost = Math.round((retailPrice * (1 - disc / 100)) * 100) / 100;
      setCostPrice(calcCost);
    }
  };

  if (!product) return null;

  const currentStock = Number(product.currentStock) || 0;
  const oldMrp = Number(product.retailPrice || product.mrp || product.originalPrice) || 0;
  const oldCost = Number(product.costPrice) || 0;
  const oldWholesale = Number(product.wholesalePrice) || oldMrp;

  const priceDiff = retailPrice - oldMrp;
  const marginPerPiece = retailPrice - costPrice;
  const marginPercent = retailPrice > 0 ? Math.round((marginPerPiece / retailPrice) * 100) : 0;
  const valuationDelta = Math.round((currentStock * (costPrice - oldCost)) * 100) / 100;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (retailPrice < 0) {
      setValidationError('Retail Price (MRP) cannot be negative.');
      return;
    }
    if (publisherDiscountPercent < 0 || publisherDiscountPercent > 100) {
      setValidationError('Publisher discount must be between 0% and 100%.');
      return;
    }
    if (costPrice < 0) {
      setValidationError('Cost price cannot be negative.');
      return;
    }
    if (wholesalePrice < 0) {
      setValidationError('Wholesale price cannot be negative.');
      return;
    }

    setValidationError(null);
    setIsSubmitting(true);
    try {
      await onSave(product.id, {
        retailPrice,
        publisherDiscountPercent,
        wholesalePrice,
        costPrice,
      });
      onClose();
    } catch (err: any) {
      setValidationError(err?.message || 'Failed to update product price.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Quick Price Update / ریٹ تبدیل کریں"
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Product Header Information */}
        <div className="p-4 bg-slate-50 border border-slate-200/90 rounded-2xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="text-[11px] font-mono font-bold text-[#071F49] uppercase tracking-wider bg-white px-2 py-0.5 rounded border border-slate-200">
                {product.sku}
              </span>
              <h3 className="text-base font-bold text-slate-900 mt-1">
                {product.title}
              </h3>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mt-1">
                {product.publisherName && (
                  <span className="flex items-center gap-1 font-semibold text-slate-700">
                    <Building2 className="w-3.5 h-3.5 text-slate-400" />
                    {product.publisherName}
                  </span>
                )}
                {product.seriesName && (
                  <span className="flex items-center gap-1 text-slate-600">
                    <Layers className="w-3.5 h-3.5 text-slate-400" />
                    {product.seriesName}
                  </span>
                )}
                {(product.notebookSize || product.notebookSheets || product.notebookGrammage) && (
                  <span className="font-semibold text-amber-800">
                    {[product.notebookSize, product.notebookSheets ? `${product.notebookSheets} Sheets` : '', product.notebookGrammage].filter(Boolean).join(' • ')}
                  </span>
                )}
              </div>
            </div>

            <div className="text-right">
              <span className="text-xs text-slate-500 block">Stock on Hand</span>
              <span className="font-mono text-base font-black text-[#071F49]">
                {formatNumber(currentStock)} {product.unit}s
              </span>
            </div>
          </div>
        </div>

        {validationError && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{validationError}</span>
          </div>
        )}

        {/* Price Inputs Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Retail Price / MRP */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Retail Price / MRP (Rs.) <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <input
                type="number"
                min="0"
                step="any"
                value={retailPrice}
                onChange={(e) => handleRetailPriceChange(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 text-base font-mono font-bold text-slate-900 border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#071F49] focus:outline-none"
                required
              />
              <span className="absolute right-3 top-2.5 text-xs font-bold text-slate-400 font-mono">
                PKR
              </span>
            </div>
            <span className="text-[11px] text-slate-500 mt-1 block">
              Previous: {formatCurrency(oldMrp)}
              {priceDiff !== 0 && (
                <span className={`ml-1 font-bold ${priceDiff > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  ({priceDiff > 0 ? `+${formatCurrency(priceDiff)}` : formatCurrency(priceDiff)})
                </span>
              )}
            </span>
          </div>

          {/* Publisher Discount % */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Publisher Discount (%)
            </label>
            <div className="relative">
              <input
                type="number"
                min="0"
                max="100"
                step="any"
                value={publisherDiscountPercent}
                onChange={(e) => handlePubDiscountChange(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 text-base font-mono font-bold text-slate-900 border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#071F49] focus:outline-none"
              />
              <span className="absolute right-3 top-2.5 text-xs font-bold text-slate-400 font-mono">
                %
              </span>
            </div>
            <span className="text-[11px] text-slate-500 mt-1 block">
              Previous: {product.publisherDiscountPercent ?? 0}%
            </span>
          </div>

          {/* Actual Purchase Cost */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-bold text-slate-700">
                Purchase Cost Price (Rs.)
              </label>
              <button
                type="button"
                onClick={() => setIsManualCost(!isManualCost)}
                className="text-[11px] text-[#071F49] hover:underline font-semibold"
              >
                {isManualCost ? 'Auto calculate from Disc %' : 'Override manually'}
              </button>
            </div>
            <div className="relative">
              <input
                type="number"
                min="0"
                step="any"
                disabled={!isManualCost}
                value={costPrice}
                onChange={(e) => setCostPrice(parseFloat(e.target.value) || 0)}
                className={`w-full px-3 py-2 text-base font-mono font-bold border rounded-xl focus:ring-2 focus:ring-[#071F49] focus:outline-none ${
                  isManualCost
                    ? 'text-slate-900 border-slate-300 bg-white'
                    : 'text-slate-600 border-slate-200 bg-slate-50'
                }`}
                required
              />
              <span className="absolute right-3 top-2.5 text-xs font-bold text-slate-400 font-mono">
                PKR
              </span>
            </div>
            <span className="text-[11px] text-slate-500 mt-1 block">
              Previous: {formatCurrency(oldCost)}
            </span>
          </div>

          {/* Wholesale Price */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Wholesale / Trade Price (Rs.)
            </label>
            <div className="relative">
              <input
                type="number"
                min="0"
                step="any"
                value={wholesalePrice}
                onChange={(e) => setWholesalePrice(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 text-base font-mono font-bold text-slate-900 border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#071F49] focus:outline-none"
              />
              <span className="absolute right-3 top-2.5 text-xs font-bold text-slate-400 font-mono">
                PKR
              </span>
            </div>
            <span className="text-[11px] text-slate-500 mt-1 block">
              Previous: {formatCurrency(oldWholesale)}
            </span>
          </div>
        </div>

        {/* Financial Margins & Inventory Impact Breakdown */}
        <div className="p-3.5 bg-blue-50/70 border border-blue-100 rounded-xl grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
          <div>
            <span className="text-slate-500 block">Retail Margin:</span>
            <span className="font-mono font-black text-emerald-700 text-sm">
              {formatCurrency(marginPerPiece)} ({marginPercent}%)
            </span>
          </div>
          <div>
            <span className="text-slate-500 block">Wholesale Margin:</span>
            <span className="font-mono font-black text-slate-800 text-sm">
              {formatCurrency(wholesalePrice - costPrice)}
            </span>
          </div>
          <div>
            <span className="text-slate-500 block">Current Stock Value Impact:</span>
            <span className={`font-mono font-black text-sm ${valuationDelta >= 0 ? 'text-[#071F49]' : 'text-rose-600'}`}>
              {valuationDelta >= 0 ? `+${formatCurrency(valuationDelta)}` : formatCurrency(valuationDelta)}
            </span>
          </div>
        </div>

        {/* Historical Khata & Sale Protection Notice */}
        <div className="p-3 bg-amber-50/90 border border-amber-200 rounded-xl flex items-start gap-2.5 text-xs text-amber-900">
          <ShieldCheck className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold block">تاریخی کھاتہ و ادھار کا تحفظ (Past Udhar Guarantee):</span>
            <p className="mt-0.5 text-amber-800 leading-relaxed">
              جن گاہکوں نے ماضی میں ادھار لیا تھا، ان کا حساب سابقہ ریٹ پر ہی رہے گا اور کھاتہ تبدیل نہیں ہوگا۔ یہ نیا ریٹ دکان کے موجودہ فزیکل اسٹاک کی آئندہ فروخت اور نئے بلز پر نافذ ہوگا۔
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="gold"
            isLoading={isSubmitting}
            leftIcon={<CheckCircle2 className="w-4 h-4 text-[#071F49]" />}
          >
            Save & Assign New Price / نیا ریٹ محفوظ کریں
          </Button>
        </div>
      </form>
    </Modal>
  );
};
