import React, { useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { Modal } from '../common/Modal';
import { Input } from '../common/Input';
import { Select } from '../common/Select';
import { Button } from '../common/Button';
import type { ProductDocument } from '../../types/database';
import { adjustStockTransaction, type StockAdjustmentInput } from '../../services/stockService';

export interface StockAdjustmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: ProductDocument[];
  onSuccess: () => void;
  selectedProductId?: string;
}

export const StockAdjustmentModal: React.FC<StockAdjustmentModalProps> = ({
  isOpen,
  onClose,
  products,
  onSuccess,
  selectedProductId,
}) => {
  const [productId, setProductId] = useState(selectedProductId || (products[0]?.id || ''));
  const [adjustmentType, setAdjustmentType] = useState<'add' | 'subtract'>('add');
  const [quantity, setQuantity] = useState<number | ''>(1);
  const [reason, setReason] = useState<'adjustment' | 'damage'>('adjustment');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync selected product
  React.useEffect(() => {
    if (selectedProductId) {
      setProductId(selectedProductId);
    } else if (products.length > 0 && !productId) {
      setProductId(products[0].id);
    }
  }, [selectedProductId, products, productId]);

  const currentProduct = products.find((p) => p.id === productId);
  const currentPhysicalStock = currentProduct ? currentProduct.currentStock : 0;
  const numQty = Number(quantity) || 0;
  const resultingStock =
    adjustmentType === 'add'
      ? currentPhysicalStock + numQty
      : currentPhysicalStock - numQty;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!productId) {
      setError('Please select a product.');
      return;
    }

    if (numQty <= 0) {
      setError('Quantity must be greater than zero.');
      return;
    }

    if (adjustmentType === 'subtract' && resultingStock < 0) {
      setError(
        `Cannot subtract ${numQty}. Current stock is only ${currentPhysicalStock}. Negative stock is prevented.`
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: StockAdjustmentInput = {
        productId,
        adjustmentType,
        quantity: numQty,
        reason,
        notes: notes.trim() || undefined,
      };

      await adjustStockTransaction(payload);
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to adjust stock.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Manual Stock Adjustment"
      description="Record physical count corrections, damage write-offs, or manual intake. An immutable audit movement will be logged."
      size="md"
      footer={
        <div className="flex items-center justify-end gap-3 w-full">
          <Button variant="outline" type="button" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            variant="gold"
            type="submit"
            form="stock-adjust-form"
            isLoading={isSubmitting}
            disabled={isSubmitting || (adjustmentType === 'subtract' && resultingStock < 0)}
          >
            Confirm & Update Stock
          </Button>
        </div>
      }
    >
      <form id="stock-adjust-form" onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-semibold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <Select
          label="Select Target Product *"
          value={productId}
          onChange={(e) => setProductId(e.target.value)}
          options={products.map((p) => ({
            value: p.id,
            label: `${p.title} (${p.sku}) — Stock: ${p.currentStock}`,
          }))}
          required
        />

        <div className="grid grid-cols-2 gap-4">
          <Select
            label="Adjustment Type *"
            value={adjustmentType}
            onChange={(e) => setAdjustmentType(e.target.value as 'add' | 'subtract')}
            options={[
              { value: 'add', label: '+ Add Stock (Inflow)' },
              { value: 'subtract', label: '- Reduce Stock (Outflow)' },
            ]}
          />

          <Select
            label="Reason *"
            value={reason}
            onChange={(e) => setReason(e.target.value as 'adjustment' | 'damage')}
            options={[
              { value: 'adjustment', label: 'Physical Count Adjustment' },
              { value: 'damage', label: 'Damaged / Water / Transport' },
            ]}
          />
        </div>

        <Input
          label="Quantity To Adjust *"
          type="number"
          min="1"
          step="1"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
          required
        />

        {/* Live Calculation Preview */}
        {currentProduct && (
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1.5">
            <div className="flex justify-between text-slate-600">
              <span>Current Stock on Hand:</span>
              <span className="font-semibold">{currentPhysicalStock} {currentProduct.unit}s</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Adjustment Delta:</span>
              <span className={`font-semibold ${adjustmentType === 'add' ? 'text-emerald-600' : 'text-rose-600'}`}>
                {adjustmentType === 'add' ? `+${numQty}` : `-${numQty}`} {currentProduct.unit}s
              </span>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-1.5 font-bold text-slate-800">
              <span>New Stock Level After Adjustment:</span>
              <span className={`font-mono text-sm ${resultingStock < 0 ? 'text-rose-600' : 'text-slate-900'}`}>
                {resultingStock} {currentProduct.unit}s
              </span>
            </div>
          </div>
        )}

        <Input
          label="Audit Remarks / Reference Note"
          placeholder="e.g. Annual stocktaking audit / carton soaked in rain"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </form>
    </Modal>
  );
};
