import React, { useState, useEffect, useCallback } from 'react';
import { Plus, AlertCircle } from 'lucide-react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { SearchInput } from '../common/SearchInput';
import type { ProductDocument, SyllabusBookItem } from '../../types/database';
import { getPriceListProducts } from '../../services/priceListService';
import { COMMON_SUBJECTS } from '../../services/syllabusService';
import { formatCurrency } from '../../utils/formatters';

export interface AddBookToSetModalProps {
  isOpen: boolean;
  onClose: () => void;
  className: string;
  schoolName: string;
  onAddBook: (book: SyllabusBookItem) => void;
}

export const AddBookToSetModal: React.FC<AddBookToSetModalProps> = ({
  isOpen,
  onClose,
  className,
  schoolName,
  onAddBook,
}) => {
  const [subject, setSubject] = useState<string>('Urdu');
  const [customSubject, setCustomSubject] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [products, setProducts] = useState<ProductDocument[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ProductDocument | null>(null);
  const [quantity, setQuantity] = useState<number>(1);
  const [error, setError] = useState<string | null>(null);

  // Search catalog products
  const handleSearchProducts = useCallback(async (term: string) => {
    setIsSearching(true);
    try {
      const items = await getPriceListProducts({
        searchTerm: term,
        onlyActive: true,
      });
      // Limit to top 20 matches for fast selection
      setProducts(items.slice(0, 20));
    } catch (err: any) {
      console.error('Failed to search products:', err);
    } finally {
      setIsSearching(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      setSelectedProduct(null);
      setSearchTerm('');
      setQuantity(1);
      setError(null);
      handleSearchProducts('');
    }
  }, [isOpen, handleSearchProducts]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) {
      setError('Please search and select a book from the catalog.');
      return;
    }

    const effectiveSubject = subject === 'Other / Supplementary' && customSubject.trim()
      ? customSubject.trim()
      : subject;

    const bookItem: SyllabusBookItem = {
      productId: selectedProduct.id,
      title: selectedProduct.title,
      sku: selectedProduct.sku,
      publisherId: selectedProduct.publisherId,
      publisherName: selectedProduct.publisherName || selectedProduct.authorOrPublisher || 'Standard',
      seriesId: selectedProduct.seriesId,
      seriesName: selectedProduct.seriesName,
      subject: effectiveSubject,
      quantity: Math.max(1, Number(quantity) || 1),
      retailPrice: Number(selectedProduct.retailPrice || selectedProduct.mrp || 0),
      costPrice: Number(selectedProduct.costPrice || 0),
    };

    onAddBook(bookItem);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Add Book to Course Set • ${schoolName} (${className})`}
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Subject Selection */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Subject / مضمون <span className="text-rose-500">*</span>
            </label>
            <select
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full px-3 py-2 text-sm text-slate-800 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#071F49] focus:outline-none"
            >
              {COMMON_SUBJECTS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          {subject === 'Other / Supplementary' && (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Custom Subject Name
              </label>
              <input
                type="text"
                value={customSubject}
                onChange={(e) => setCustomSubject(e.target.value)}
                placeholder="e.g. Activity Workbook, Nazra Quran"
                className="w-full px-3 py-2 text-sm text-slate-800 border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#071F49] focus:outline-none"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Quantity (Per Set) <span className="text-rose-500">*</span>
            </label>
            <input
              type="number"
              min="1"
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-full px-3 py-2 text-sm font-mono font-bold text-slate-800 border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#071F49] focus:outline-none"
              required
            />
          </div>
        </div>

        {/* Product Search from Master Catalog */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">
            Search Book from Catalog / کتاب تلاش کریں:
          </label>
          <SearchInput
            value={searchTerm}
            onSearch={(term) => {
              setSearchTerm(term);
              handleSearchProducts(term);
            }}
            placeholder="Search by book title, SKU, publisher, series..."
            className="w-full"
          />
        </div>

        {/* Selected Product Highlight Card */}
        {selectedProduct && (
          <div className="p-3 bg-emerald-50/80 border border-emerald-300 rounded-xl flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 bg-white px-2 py-0.5 rounded border border-emerald-200">
                Selected: {selectedProduct.sku}
              </span>
              <h4 className="font-bold text-sm text-slate-900 mt-1">
                {selectedProduct.title}
              </h4>
              <div className="text-xs text-slate-600 mt-0.5">
                {selectedProduct.publisherName && (
                  <span className="font-semibold text-slate-700">{selectedProduct.publisherName} • </span>
                )}
                {selectedProduct.seriesName && (
                  <span>{selectedProduct.seriesName} • </span>
                )}
                <span className="font-bold text-[#071F49]">
                  Price: {formatCurrency(selectedProduct.retailPrice || selectedProduct.mrp || 0)}
                </span>
                <span className="ml-2 text-slate-500">
                  (Stock: {selectedProduct.currentStock} {selectedProduct.unit}s)
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSelectedProduct(null)}
              className="text-xs font-semibold text-slate-500 hover:text-rose-600 px-2 py-1"
            >
              Change
            </button>
          </div>
        )}

        {/* Matched Products List */}
        {!selectedProduct && (
          <div className="border border-slate-200 rounded-xl max-h-56 overflow-y-auto divide-y divide-slate-100 bg-white">
            {isSearching && (
              <div className="p-4 text-center text-xs text-slate-500">Searching catalog...</div>
            )}
            {!isSearching && products.length === 0 && (
              <div className="p-4 text-center text-xs text-slate-500">
                No matching books found. Please adjust search query.
              </div>
            )}
            {!isSearching &&
              products.map((p) => (
                <div
                  key={p.id}
                  onClick={() => setSelectedProduct(p)}
                  className="p-2.5 hover:bg-slate-50 cursor-pointer flex items-center justify-between gap-2 transition"
                >
                  <div className="min-w-0">
                    <span className="text-[10px] font-mono font-bold text-[#071F49] bg-slate-100 px-1.5 py-0.5 rounded">
                      {p.sku}
                    </span>
                    <span className="ml-2 text-xs font-bold text-slate-900 truncate">
                      {p.title}
                    </span>
                    <div className="text-[11px] text-slate-500 truncate mt-0.5">
                      {p.publisherName ? `${p.publisherName} • ` : ''}
                      {p.seriesName ? `${p.seriesName} • ` : ''}
                      <span className="font-semibold text-slate-700">
                        {formatCurrency(p.retailPrice || p.mrp || 0)}
                      </span>
                    </div>
                  </div>

                  <div className="shrink-0 text-right">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="text-xs py-1 px-2.5"
                    >
                      Select
                    </Button>
                  </div>
                </div>
              ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="gold"
            disabled={!selectedProduct}
            leftIcon={<Plus className="w-4 h-4 text-[#071F49]" />}
          >
            Add to Course Set / سیٹ میں شامل کریں
          </Button>
        </div>
      </form>
    </Modal>
  );
};
