import React, { useState, useEffect, useCallback } from 'react';
import { Plus, AlertCircle, Filter } from 'lucide-react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { SearchInput } from '../common/SearchInput';
import type { ProductDocument, SyllabusBookItem, PublisherDocument, SeriesDocument } from '../../types/database';
import { getPriceListProducts } from '../../services/priceListService';
import { getActivePublishers } from '../../services/publisherService';
import { getActiveSeriesByPublisher } from '../../services/seriesService';
import { STANDARD_CLASSES } from '../../services/syllabusService';
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
  // Cascading Filter States: Publisher > Series > Class
  const [selectedPublisher, setSelectedPublisher] = useState<string>('all');
  const [selectedSeries, setSelectedSeries] = useState<string>('all');
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [publishersList, setPublishersList] = useState<PublisherDocument[]>([]);
  const [seriesList, setSeriesList] = useState<SeriesDocument[]>([]);

  const [searchTerm, setSearchTerm] = useState<string>('');
  const [products, setProducts] = useState<ProductDocument[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ProductDocument | null>(null);
  const [quantity, setQuantity] = useState<number>(1);
  const [error, setError] = useState<string | null>(null);

  // Search and filter catalog products
  const handleSearchProducts = useCallback(
    async (term: string, pubId: string, serId: string, cls: string) => {
      setIsSearching(true);
      try {
        const items = await getPriceListProducts({
          searchTerm: term,
          publisherId: pubId !== 'all' ? pubId : undefined,
          seriesId: serId !== 'all' ? serId : undefined,
          onlyActive: true,
        });

        let filtered = items;
        if (cls !== 'all') {
          const target = cls.trim().toLowerCase();
          filtered = filtered.filter((p) => {
            const itemClass = (p.targetClass || p.className || '').trim().toLowerCase();
            return itemClass === target;
          });
        }

        // Limit to top 30 matches for fast selection
        setProducts(filtered.slice(0, 30));
      } catch (err: any) {
        console.error('Failed to search products:', err);
      } finally {
        setIsSearching(false);
      }
    },
    []
  );

  // Load active publishers when modal opens
  useEffect(() => {
    if (isOpen) {
      getActivePublishers()
        .then(setPublishersList)
        .catch((err) => console.warn('Failed to load publishers:', err));
    }
  }, [isOpen]);

  // Reset modal state on open
  useEffect(() => {
    if (isOpen) {
      setSelectedProduct(null);
      setSearchTerm('');
      setSelectedPublisher('all');
      setSelectedSeries('all');
      setSelectedClass('all');
      setSeriesList([]);
      setQuantity(1);
      setError(null);
      handleSearchProducts('', 'all', 'all', 'all');
    }
  }, [isOpen, handleSearchProducts]);

  // Publisher filter change handler
  const handlePublisherChange = async (pubId: string) => {
    setSelectedPublisher(pubId);
    setSelectedSeries('all');
    if (pubId !== 'all') {
      try {
        const series = await getActiveSeriesByPublisher(pubId);
        setSeriesList(series);
      } catch (err) {
        console.warn('Failed to load series for publisher:', err);
        setSeriesList([]);
      }
    } else {
      setSeriesList([]);
    }
    handleSearchProducts(searchTerm, pubId, 'all', selectedClass);
  };

  // Series filter change handler
  const handleSeriesChange = (serId: string) => {
    setSelectedSeries(serId);
    handleSearchProducts(searchTerm, selectedPublisher, serId, selectedClass);
  };

  // Class filter change handler
  const handleClassChange = (cls: string) => {
    setSelectedClass(cls);
    handleSearchProducts(searchTerm, selectedPublisher, selectedSeries, cls);
  };

  // Search input handler
  const handleSearchChange = (term: string) => {
    setSearchTerm(term);
    handleSearchProducts(term, selectedPublisher, selectedSeries, selectedClass);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) {
      setError('Please search and select a book from the catalog.');
      return;
    }

    const bookClass = selectedProduct.targetClass || selectedProduct.className || className || 'General';

    const bookItem: SyllabusBookItem = {
      productId: selectedProduct.id,
      title: selectedProduct.title,
      sku: selectedProduct.sku,
      publisherId: selectedProduct.publisherId,
      publisherName: selectedProduct.publisherName || selectedProduct.authorOrPublisher || 'Standard',
      seriesId: selectedProduct.seriesId,
      seriesName: selectedProduct.seriesName,
      targetClass: bookClass,
      subject: bookClass,
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

        {/* 1. Cascading Filters: Publisher > Series > Class */}
        <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
            <Filter className="w-3.5 h-3.5 text-[#071F49]" />
            <span>Filter Books (Publisher &gt; Series &gt; Class):</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div>
              <label className="block text-[10.5px] font-semibold text-slate-600 mb-0.5">
                Publisher
              </label>
              <select
                value={selectedPublisher}
                onChange={(e) => handlePublisherChange(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs font-semibold text-slate-800 bg-white border border-slate-300 rounded-lg focus:ring-1 focus:ring-[#071F49] focus:outline-none"
              >
                <option value="all">All Publishers</option>
                {publishersList.map((pub) => (
                  <option key={pub.id} value={pub.id}>
                    {pub.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10.5px] font-semibold text-slate-600 mb-0.5">
                Series
              </label>
              <select
                value={selectedSeries}
                disabled={selectedPublisher === 'all'}
                onChange={(e) => handleSeriesChange(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs font-semibold text-slate-800 bg-white border border-slate-300 rounded-lg focus:ring-1 focus:ring-[#071F49] focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <option value="all">
                  {selectedPublisher === 'all' ? 'All Series (Select Pub)' : 'All Series'}
                </option>
                {seriesList.map((ser) => (
                  <option key={ser.id} value={ser.id}>
                    {ser.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10.5px] font-semibold text-slate-600 mb-0.5">
                Class
              </label>
              <select
                value={selectedClass}
                onChange={(e) => handleClassChange(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs font-semibold text-slate-800 bg-white border border-slate-300 rounded-lg focus:ring-1 focus:ring-[#071F49] focus:outline-none"
              >
                <option value="all">All Classes</option>
                {STANDARD_CLASSES.map((cls) => (
                  <option key={cls} value={cls}>
                    {cls}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* 2. Keyword Search & Quantity */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
          <div className="sm:col-span-3">
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Search Book from Catalog:
            </label>
            <SearchInput
              value={searchTerm}
              onSearch={handleSearchChange}
              placeholder="Search by book title, SKU, publisher, series..."
              className="w-full"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Quantity (Per Set) <span className="text-rose-500">*</span>
            </label>
            <input
              type="number"
              min="1"
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-full px-3 py-2 text-sm font-mono font-bold text-slate-800 border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#071F49] focus:outline-none bg-white"
              required
            />
          </div>
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
              <div className="text-xs text-slate-600 mt-0.5 flex items-center gap-1.5 flex-wrap">
                {selectedProduct.publisherName && (
                  <span className="font-semibold text-slate-700">{selectedProduct.publisherName} • </span>
                )}
                {selectedProduct.seriesName && (
                  <span>{selectedProduct.seriesName} • </span>
                )}
                <span className="font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200/60 text-[10.5px]">
                  Class: {selectedProduct.targetClass || selectedProduct.className || 'General'}
                </span>
                <span className="font-bold text-[#071F49]">
                  • Price: {formatCurrency(selectedProduct.retailPrice || selectedProduct.mrp || 0)}
                </span>
                <span className="ml-1 text-slate-500">
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
                No matching books found. Please adjust search query or filters.
              </div>
            )}
            {!isSearching &&
              products.map((p) => {
                const itemClass = p.targetClass || p.className;
                return (
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
                      <div className="text-[11px] text-slate-500 truncate mt-0.5 flex items-center gap-1.5 flex-wrap">
                        {p.publisherName ? <span>{p.publisherName} •</span> : ''}
                        {p.seriesName ? <span>{p.seriesName} •</span> : ''}
                        {itemClass ? (
                          <span className="font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200/60 text-[10px]">
                            Class: {itemClass}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[10px]">Class: General</span>
                        )}
                        <span className="font-semibold text-slate-700">
                          • {formatCurrency(p.retailPrice || p.mrp || 0)}
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
                );
              })}
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
            Add to Course Set
          </Button>
        </div>
      </form>
    </Modal>
  );
};
