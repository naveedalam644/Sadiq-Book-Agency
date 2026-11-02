import React, { useState, useEffect } from 'react';
import { Sparkles } from 'lucide-react';
import { Modal } from '../common/Modal';
import { Input } from '../common/Input';
import { Select } from '../common/Select';
import { Button } from '../common/Button';
import type {
  ProductDocument,
  ItemClassification,
  CategoryDocument,
} from '../../types/database';
import {
  type CreateProductInput,
  generateSuggestedSku,
  checkSkuUnique,
} from '../../services/productService';

export interface ProductFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (input: CreateProductInput) => Promise<void>;
  initialData?: ProductDocument | null;
  categories: CategoryDocument[];
  isLoading?: boolean;
}

export const ProductFormModal: React.FC<ProductFormModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  initialData,
  categories,
  isLoading = false,
}) => {
  const [title, setTitle] = useState('');
  const [sku, setSku] = useState('');
  const [classification, setClassification] = useState<ItemClassification>('book');
  const [categoryId, setCategoryId] = useState('');
  const [authorOrPublisher, setAuthorOrPublisher] = useState('');
  const [edition, setEdition] = useState('');
  const [costPrice, setCostPrice] = useState<number | ''>(0);
  const [retailPrice, setRetailPrice] = useState<number | ''>(0);
  const [wholesalePrice, setWholesalePrice] = useState<number | ''>(0);
  const [currentStock, setCurrentStock] = useState<number | ''>(0);
  const [lowStockThreshold, setLowStockThreshold] = useState<number | ''>(5);
  const [unit, setUnit] = useState('piece');
  const [shelfLocation, setShelfLocation] = useState('');
  const [isActive, setIsActive] = useState(true);

  const [skuError, setSkuError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (initialData) {
      setTitle(initialData.title);
      setSku(initialData.sku);
      setClassification(initialData.classification || 'book');
      
      // Safely map category to one of the 6 core categories
      const matchedCat = categories.find(
        (c) =>
          c.id === initialData.categoryId ||
          c.name.toLowerCase() === initialData.categoryName?.toLowerCase()
      );
      if (matchedCat) {
        setCategoryId(matchedCat.id);
      } else {
        const othersCat = categories.find((c) => c.name.toLowerCase() === 'others');
        setCategoryId(othersCat ? othersCat.id : (categories[0]?.id || 'cat_primary'));
      }
      setAuthorOrPublisher(initialData.authorOrPublisher || '');
      setEdition(initialData.edition || '');
      setCostPrice(initialData.costPrice);
      setRetailPrice(initialData.retailPrice);
      setWholesalePrice(initialData.wholesalePrice);
      setCurrentStock(initialData.currentStock);
      setLowStockThreshold(initialData.lowStockThreshold);
      setUnit(initialData.unit || 'piece');
      setShelfLocation(initialData.shelfLocation || '');
      setIsActive(initialData.isActive);
    } else {
      // Default new product values
      setTitle('');
      setSku('');
      setClassification('book');
      setCategoryId(categories.length > 0 ? categories[0].id : 'cat_primary');
      setAuthorOrPublisher('');
      setEdition('');
      setCostPrice(0);
      setRetailPrice(0);
      setWholesalePrice(0);
      setCurrentStock(0);
      setLowStockThreshold(5);
      setUnit('piece');
      setShelfLocation('');
      setIsActive(true);
    }
    setSkuError(null);
    setFormError(null);
  }, [initialData, categories, isOpen]);

  const handleGenerateSku = () => {
    const suggested = generateSuggestedSku(classification, title || 'ITEM');
    setSku(suggested);
    setSkuError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSkuError(null);

    if (!title.trim()) {
      setFormError('Product name/title is required.');
      return;
    }

    if (!sku.trim()) {
      setSkuError('Unique Product SKU code is required.');
      return;
    }

    // Verify SKU uniqueness
    const isUnique = await checkSkuUnique(sku, initialData?.id);
    if (!isUnique) {
      setSkuError(`SKU "${sku}" is already assigned to another product.`);
      return;
    }

    const selectedCategory = categories.find((c) => c.id === categoryId);

    const payload: CreateProductInput = {
      title: title.trim(),
      sku: sku.trim().toUpperCase(),
      ...(initialData?.barcode ? { barcode: initialData.barcode } : {}),
      classification,
      categoryId,
      categoryName: selectedCategory ? selectedCategory.name : '',
      authorOrPublisher: authorOrPublisher.trim(),
      edition: edition.trim(),
      costPrice: Number(costPrice) || 0,
      retailPrice: Number(retailPrice) || 0,
      wholesalePrice: Number(wholesalePrice) || Number(retailPrice) || 0,
      currentStock: Number(currentStock) || 0,
      lowStockThreshold: Number(lowStockThreshold) || 5,
      unit,
      shelfLocation: shelfLocation.trim(),
      isActive,
    };

    try {
      await onSubmit(payload);
      onClose();
    } catch (err: any) {
      setFormError(err?.message || 'Failed to save product.');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={initialData ? 'Edit Product / Book' : 'Add New Book or Stationery Item'}
      description="Record product specifications, classification, purchase cost, and inventory thresholds."
      size="xl"
      footer={
        <div className="flex items-center justify-end gap-3 w-full">
          <Button variant="outline" type="button" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            variant="gold"
            type="submit"
            form="product-form"
            isLoading={isLoading}
            disabled={isLoading}
          >
            {initialData ? 'Save Product Changes' : 'Create & Register Product'}
          </Button>
        </div>
      }
    >
      <form id="product-form" onSubmit={handleSubmit} className="space-y-4">
        {formError && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-semibold">
            {formError}
          </div>
        )}

        {/* Section 1: Classification & Basic Identity */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select
            label="Item Classification *"
            value={classification}
            onChange={(e) => setClassification(e.target.value as ItemClassification)}
            options={[
              { value: 'book', label: 'Book (Syllabus, Textbooks, Novels)' },
              { value: 'notebook', label: 'Notebook / Register / Exercise Book' },
              { value: 'stationery', label: 'Stationery & Writing Materials' },
              { value: 'general', label: 'General / Office Item' },
            ]}
          />

          <Select
            label="Category *"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            options={categories.map((c) => ({ value: c.id, label: c.name }))}
          />
        </div>

        {/* Title */}
        <Input
          label="Product / Book Title *"
          placeholder="e.g. Oxford Progressive English 5 / College Register 200 Pgs"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />

        {/* SKU with Auto-generate */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-700">
              Product SKU / Code *
            </label>
            <button
              type="button"
              onClick={handleGenerateSku}
              className="text-[11px] font-bold text-[#071F49] hover:text-[#153F99] inline-flex items-center gap-1 bg-[#F5B51B]/20 hover:bg-[#F5B51B]/40 px-2 py-0.5 rounded transition"
            >
              <Sparkles className="w-3 h-3 text-[#071F49]" />
              Auto-Generate
            </button>
          </div>
          <Input
            placeholder="e.g. BK-ENG-1042"
            value={sku}
            onChange={(e) => {
              setSku(e.target.value.toUpperCase());
              setSkuError(null);
            }}
            error={skuError || undefined}
            required
          />
        </div>

        {/* Author/Publisher & Edition/Size */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label={classification === 'book' ? 'Author or Publishing House' : 'Brand or Manufacturer'}
            placeholder={classification === 'book' ? 'e.g. Oxford / Punjab Textbook Board' : 'e.g. Deer / Dollar / Piano'}
            value={authorOrPublisher}
            onChange={(e) => setAuthorOrPublisher(e.target.value)}
          />

          <Input
            label={classification === 'book' ? 'Edition / Class' : 'Size / Specification'}
            placeholder={classification === 'book' ? 'e.g. 2026 Edition / Class 9' : 'e.g. 160 Pages Ruled / Box of 12'}
            value={edition}
            onChange={(e) => setEdition(e.target.value)}
          />
        </div>

        {/* Pricing Tier: Cost Price, Retail Price, Wholesale Price */}
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
            Pricing Configuration (PKR)
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Input
              label="Purchase Unit Cost (PKR) *"
              type="number"
              min="0"
              step="any"
              value={costPrice}
              onChange={(e) => setCostPrice(e.target.value === '' ? '' : parseFloat(e.target.value))}
              helperText="Cost paid to supplier"
              required
            />

            <Input
              label="Retail Sale Price (Parchon) *"
              type="number"
              min="0"
              step="any"
              value={retailPrice}
              onChange={(e) => setRetailPrice(e.target.value === '' ? '' : parseFloat(e.target.value))}
              helperText="Default counter rate"
              required
            />

            <Input
              label="Wholesale Sale Price *"
              type="number"
              min="0"
              step="any"
              value={wholesalePrice}
              onChange={(e) => setWholesalePrice(e.target.value === '' ? '' : parseFloat(e.target.value))}
              helperText="Bulk wholesale client rate"
              required
            />
          </div>
        </div>

        {/* Stock & Threshold */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <Input
            label="Current Stock Quantity *"
            type="number"
            min="0"
            step="1"
            value={currentStock}
            onChange={(e) => setCurrentStock(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
            disabled={Boolean(initialData)} // In edit mode, stock adjustments must be tracked via adjustment logs or purchases
            helperText={initialData ? 'Use Stock Adjustment tab to modify' : 'Initial physical count'}
            required
          />

          <Input
            label="Low-Stock Alert Threshold *"
            type="number"
            min="0"
            step="1"
            value={lowStockThreshold}
            onChange={(e) => setLowStockThreshold(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
            helperText="Triggers reorder notice"
            required
          />

          <Select
            label="Stock Unit *"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            options={[
              { value: 'piece', label: 'Piece (Single)' },
              { value: 'bundle', label: 'Bundle' },
              { value: 'dozen', label: 'Dozen (12)' },
              { value: 'box', label: 'Box / Packet' },
            ]}
          />

          <Input
            label="Shelf / Rack Location"
            placeholder="e.g. Rack B-3, Shelf 2"
            value={shelfLocation}
            onChange={(e) => setShelfLocation(e.target.value)}
          />
        </div>

        {/* Active Toggle */}
        <div className="flex items-center gap-2 pt-1">
          <input
            type="checkbox"
            id="product-is-active"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="w-4 h-4 rounded text-[#071F49] focus:ring-[#F5B51B] border-slate-300"
          />
          <label htmlFor="product-is-active" className="text-xs font-semibold text-slate-700 cursor-pointer">
            Item is Active for Trading (Uncheck to hide without deleting)
          </label>
        </div>
      </form>
    </Modal>
  );
};
