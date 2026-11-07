import React, { useState, useEffect, useMemo } from 'react';
import { Search, Percent, DollarSign, AlertCircle, TrendingUp, X } from 'lucide-react';
import { Modal } from '../common/Modal';
import { Input } from '../common/Input';
import { Button } from '../common/Button';
import type {
  CustomerDocument,
  ProductDocument,
  CustomerDiscountDocument,
  CustomerDiscountType,
} from '../../types/database';
import {
  setCustomerProductDiscount,
  type SetCustomerDiscountInput,
} from '../../services/discountService';
import { getProductsPaginated } from '../../services/productService';
import { formatCurrency } from '../../utils/formatters';

export interface ProductDiscountModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: CustomerDocument | null;
  onSuccess: () => void;
  initialDiscount?: CustomerDiscountDocument | null;
}

export const ProductDiscountModal: React.FC<ProductDiscountModalProps> = ({
  isOpen,
  onClose,
  customer,
  onSuccess,
  initialDiscount,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [availableProducts, setAvailableProducts] = useState<ProductDocument[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<ProductDocument | null>(null);
  const [discountType, setDiscountType] = useState<CustomerDiscountType>('percentage');
  const [discountValue, setDiscountValue] = useState<number | ''>(20);
  const [basePriceType, setBasePriceType] = useState<'wholesale' | 'retail'>('retail');
  const [notes, setNotes] = useState('');
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Load initial products when modal opens
  useEffect(() => {
    if (isOpen) {
      setFormError(null);
      setIsSubmitting(false);

      if (initialDiscount) {
        setDiscountType(initialDiscount.discountType);
        setDiscountValue(initialDiscount.discountValue);
        setBasePriceType(initialDiscount.basePriceType);
        setNotes(initialDiscount.notes || '');
        setSelectedProduct({
          id: initialDiscount.productId,
          title: initialDiscount.productTitle,
          sku: initialDiscount.productSku,
          classification: initialDiscount.classification,
          categoryName: initialDiscount.categoryName,
          costPrice: 0,
          retailPrice: initialDiscount.standardPrice,
          wholesalePrice: initialDiscount.standardPrice,
          currentStock: 0,
          lowStockThreshold: 5,
          unit: 'piece',
          isActive: true,
          categoryId: '',
          createdAt: '',
          updatedAt: '',
        });
      } else {
        setSelectedProduct(null);
        setDiscountType('percentage');
        setDiscountValue(15);
        setBasePriceType(customer?.type === 'wholesaler' ? 'wholesale' : 'retail');
        setNotes('');
        setSearchTerm('');

        setIsLoadingProducts(true);
        getProductsPaginated({ status: 'active' }, null, 30)
          .then((res) => setAvailableProducts(res.products))
          .catch((err) => console.error('Failed to load products for discount modal:', err))
          .finally(() => setIsLoadingProducts(false));
      }
    }
  }, [isOpen, initialDiscount, customer]);

  // Debounced search to fetch matching products from Firestore if needed
  useEffect(() => {
    if (!isOpen || initialDiscount || !searchTerm.trim()) return;

    const timer = setTimeout(async () => {
      setIsLoadingProducts(true);
      try {
        const res = await getProductsPaginated(
          { status: 'active', searchTerm: searchTerm.trim() },
          null,
          20
        );
        if (res.products.length > 0) {
          setAvailableProducts((prev) => {
            const map = new Map<string, ProductDocument>();
            prev.forEach((p) => map.set(p.id, p));
            res.products.forEach((p) => map.set(p.id, p));
            return Array.from(map.values());
          });
        }
      } catch (err) {
        console.warn('Product search error:', err);
      } finally {
        setIsLoadingProducts(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [searchTerm, isOpen, initialDiscount]);

  // In-memory filtered products
  const filteredProducts = useMemo(() => {
    if (!searchTerm.trim()) return availableProducts.slice(0, 10);
    const q = searchTerm.trim().toLowerCase();
    return availableProducts.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        (p.barcode && p.barcode.toLowerCase().includes(q)) ||
        (p.authorOrPublisher && p.authorOrPublisher.toLowerCase().includes(q))
    );
  }, [availableProducts, searchTerm]);

  // Live price & profit calculations
  const calculation = useMemo(() => {
    if (!selectedProduct) return null;

    const standardBase =
      basePriceType === 'wholesale'
        ? selectedProduct.wholesalePrice || selectedProduct.retailPrice
        : selectedProduct.retailPrice;

    const cost = selectedProduct.costPrice || 0;
    let finalSellingPrice = 0;
    let effectiveDiscountPct = 0;

    if (discountType === 'percentage') {
      const pct = Math.max(0, Math.min(100, Number(discountValue) || 0));
      effectiveDiscountPct = pct;
      finalSellingPrice = Math.round(standardBase * (1 - pct / 100) * 100) / 100;
    } else {
      finalSellingPrice = Math.max(0, Number(discountValue) || 0);
      effectiveDiscountPct =
        standardBase > 0 ? Math.round(((standardBase - finalSellingPrice) / standardBase) * 1000) / 10 : 0;
    }

    const unitProfit = Math.round((finalSellingPrice - cost) * 100) / 100;
    const profitMarginPct = cost > 0 ? Math.round((unitProfit / cost) * 1000) / 10 : 0;
    const isBelowCost = cost > 0 && finalSellingPrice < cost;

    return {
      standardBase,
      cost,
      finalSellingPrice,
      effectiveDiscountPct,
      unitProfit,
      profitMarginPct,
      isBelowCost,
    };
  }, [selectedProduct, discountType, discountValue, basePriceType]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!customer) {
      setFormError('Customer is missing.');
      return;
    }

    if (!selectedProduct) {
      setFormError('Please select a product.');
      return;
    }

    const val = Number(discountValue);
    if (isNaN(val) || val < 0) {
      setFormError('Discount value must be a valid positive number.');
      return;
    }

    if (discountType === 'percentage' && val > 100) {
      setFormError('Discount percentage cannot exceed 100%.');
      return;
    }

    const standardPrice =
      basePriceType === 'wholesale'
        ? selectedProduct.wholesalePrice || selectedProduct.retailPrice
        : selectedProduct.retailPrice;

    const payload: SetCustomerDiscountInput = {
      customerId: customer.id,
      productId: selectedProduct.id,
      productTitle: selectedProduct.title,
      productSku: selectedProduct.sku,
      classification: selectedProduct.classification,
      categoryName: selectedProduct.categoryName,
      discountType,
      discountValue: val,
      basePriceType,
      standardPrice,
      notes: notes.trim() || undefined,
    };

    setIsSubmitting(true);
    try {
      await setCustomerProductDiscount(payload);
      onSuccess();
      onClose();
    } catch (err: any) {
      setFormError(err?.message || 'Failed to save customer product discount.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={initialDiscount ? 'Edit Product Discount Rule' : 'Assign Product-Specific Discount'}
      description={`Customer: ${customer?.shopName ? `${customer.shopName} (${customer.name})` : customer?.name || ''}`}
      size="lg"
      footer={
        <div className="flex items-center justify-between w-full">
          <div className="text-xs text-slate-500">
            {calculation && (
              <span>
                Net Rate: <strong className="text-[#071F49] font-mono text-sm">{formatCurrency(calculation.finalSellingPrice)}</strong>
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" type="button" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              variant="gold"
              type="submit"
              form="product-discount-form"
              isLoading={isSubmitting}
              disabled={isSubmitting || !selectedProduct}
            >
              {initialDiscount ? 'Update Discount' : 'Save Discount Rule'}
            </Button>
          </div>
        </div>
      }
    >
      <form id="product-discount-form" onSubmit={handleSubmit} className="space-y-4">
        {formError && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-semibold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{formError}</span>
          </div>
        )}

        {/* Product Selector Section */}
        {!initialDiscount ? (
          <div className="border border-slate-200 rounded-xl p-3 bg-slate-50 space-y-2.5">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              1. Select Product from Catalog *
            </label>

            {selectedProduct ? (
              <div className="p-2.5 bg-white border border-[#F5B51B] rounded-lg flex items-center justify-between gap-3 shadow-xs">
                <div>
                  <div className="font-bold text-xs text-slate-900">{selectedProduct.title}</div>
                  <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-0.5">
                    <span className="font-mono bg-slate-100 px-1 py-0.2 rounded border font-semibold">
                      {selectedProduct.sku}
                    </span>
                    <span>Retail: {formatCurrency(selectedProduct.retailPrice)}</span>
                    <span>•</span>
                    <span>Wholesale: {formatCurrency(selectedProduct.wholesalePrice || selectedProduct.retailPrice)}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedProduct(null)}
                  className="p-1 text-slate-400 hover:text-rose-600 rounded transition"
                  title="Choose different product"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search product by title, SKU, author, category..."
                    className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-slate-300 rounded-lg placeholder:text-slate-400 focus:outline-none focus:border-[#F5B51B]"
                  />
                </div>

                <div className="max-h-36 overflow-y-auto divide-y divide-slate-100 bg-white border border-slate-200 rounded-lg">
                  {isLoadingProducts ? (
                    <div className="p-3 text-center text-xs text-slate-400">Loading catalog...</div>
                  ) : filteredProducts.length === 0 ? (
                    <div className="p-3 text-center text-xs text-slate-400">No matching products found.</div>
                  ) : (
                    filteredProducts.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setSelectedProduct(p)}
                        className="w-full p-2 text-left hover:bg-slate-50 flex items-center justify-between text-xs transition"
                      >
                        <div className="truncate pr-2">
                          <span className="font-semibold text-slate-900 block truncate">{p.title}</span>
                          <span className="text-[10px] font-mono text-slate-400">{p.sku}</span>
                        </div>
                        <div className="text-right shrink-0 text-[11px]">
                          <span className="font-mono font-bold text-slate-700">
                            {formatCurrency(p.retailPrice)}
                          </span>
                          <span className="text-[10px] text-slate-400 block">
                            (WS: {formatCurrency(p.wholesalePrice || p.retailPrice)})
                          </span>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Target Product</span>
              <span className="font-bold text-xs text-slate-900">{selectedProduct?.title}</span>
              <span className="font-mono text-[10px] text-slate-500 ml-2">({selectedProduct?.sku})</span>
            </div>
            <span className="text-xs font-mono font-bold text-slate-700">
              Retail: {formatCurrency(selectedProduct?.retailPrice || 0)}
            </span>
          </div>
        )}

        {/* Discount Configuration Section */}
        <div className="space-y-3">
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
            2. Configure Discount Rule *
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Discount Mechanism
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setDiscountType('percentage')}
                  className={`p-2 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
                    discountType === 'percentage'
                      ? 'border-[#F5B51B] bg-[#071F49] text-white'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Percent className="w-3.5 h-3.5" />
                  <span>Percentage Off</span>
                </button>

                <button
                  type="button"
                  onClick={() => setDiscountType('fixed_rate')}
                  className={`p-2 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
                    discountType === 'fixed_rate'
                      ? 'border-[#F5B51B] bg-[#071F49] text-white'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <DollarSign className="w-3.5 h-3.5" />
                  <span>Fixed Selling Rate</span>
                </button>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Base Rate for Calculation
              </label>
              <select
                value={basePriceType}
                onChange={(e) => setBasePriceType(e.target.value as any)}
                className="w-full text-xs bg-white border border-slate-300 rounded-lg p-2 text-slate-800 focus:outline-none focus:border-[#F5B51B]"
              >
                <option value="retail">Retail Counter Price (Parchon rate)</option>
                <option value="wholesale">Wholesale Bulk Rate</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label={discountType === 'percentage' ? 'Discount Percentage (%) *' : 'Custom Selling Price (PKR) *'}
              type="number"
              min="0"
              max={discountType === 'percentage' ? 100 : undefined}
              step={discountType === 'percentage' ? '0.5' : 'any'}
              value={discountValue}
              onChange={(e) => setDiscountValue(e.target.value === '' ? '' : parseFloat(e.target.value))}
              required
            />

            <Input
              label="Admin Remarks / Deal Reference"
              placeholder="e.g. Special school season bundle price"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        {/* Live Margin & Price Preview */}
        {calculation && (
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-slate-700 uppercase tracking-wider">
              <span className="flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-[#071F49]" />
                Live Price & Profit Preview
              </span>
              <span className="text-[11px] font-mono text-slate-500">
                Base: {formatCurrency(calculation.standardBase)}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center pt-1">
              <div className="p-2 bg-white rounded-lg border border-slate-200">
                <span className="text-[10px] text-slate-400 uppercase font-semibold block">Effective Rate</span>
                <span className="font-mono font-bold text-xs text-[#071F49]">
                  {formatCurrency(calculation.finalSellingPrice)}
                </span>
                <span className="text-[9px] text-slate-500 block">
                  ({calculation.effectiveDiscountPct}% off)
                </span>
              </div>

              <div className="p-2 bg-white rounded-lg border border-slate-200">
                <span className="text-[10px] text-slate-400 uppercase font-semibold block">Unit Profit</span>
                <span
                  className={`font-mono font-bold text-xs ${
                    calculation.unitProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'
                  }`}
                >
                  {calculation.unitProfit >= 0 ? '+' : ''}
                  {formatCurrency(calculation.unitProfit)}
                </span>
                <span className="text-[9px] text-slate-500 block">per unit</span>
              </div>

              <div className="p-2 bg-white rounded-lg border border-slate-200">
                <span className="text-[10px] text-slate-400 uppercase font-semibold block">Gross Margin</span>
                <span
                  className={`font-mono font-bold text-xs ${
                    calculation.profitMarginPct >= 0 ? 'text-emerald-700' : 'text-rose-700'
                  }`}
                >
                  {calculation.profitMarginPct}%
                </span>
                <span className="text-[9px] text-slate-500 block">over cost</span>
              </div>
            </div>

            {calculation.isBelowCost && (
              <div className="p-2 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 mt-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>Notice: Selling rate is below purchase cost ({formatCurrency(calculation.cost)})!</span>
              </div>
            )}
          </div>
        )}
      </form>
    </Modal>
  );
};
