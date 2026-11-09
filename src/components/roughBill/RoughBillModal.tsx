import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Trash2,
  AlertCircle,
  CheckCircle2,
  Plus,
  BookOpen,
  Layers,
  Package,
} from 'lucide-react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { SearchInput } from '../common/SearchInput';
import { WhatsAppIcon } from '../common/WhatsAppIcon';
import type {
  ProductDocument,
  RoughBillDocument,
  RoughBillItem,
  RoughBillType,
  PublisherDocument,
  SeriesDocument,
} from '../../types/database';
import { saveRoughBill } from '../../services/roughBillService';
import { getPriceListProducts } from '../../services/priceListService';
import { getActivePublishers } from '../../services/publisherService';
import { getActiveSeriesByPublisher } from '../../services/seriesService';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { formatCurrency } from '../../utils/formatters';

export interface RoughBillModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingBill?: RoughBillDocument | null;
  onSaved: () => void;
}

const COMMON_SHEET_PRESETS = ['All', '40', '60', '80', '100', '120', '160', '200', '240', '300'];
const COMMON_SIZE_PRESETS = ['All', 'A4', 'A5', 'Foolscap', 'Large', 'Small', 'Executive', 'B5'];

export const RoughBillModal: React.FC<RoughBillModalProps> = ({
  isOpen,
  onClose,
  editingBill,
  onSaved,
}) => {
  const { currentUser } = useAuth();
  const { success, error: toastError } = useToast();

  const [billType, setBillType] = useState<RoughBillType>('customer_quotation');
  const [partyName, setPartyName] = useState('');
  const [phone, setPhone] = useState('');
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<RoughBillItem[]>([]);

  // Selection Mode: 'hierarchy' (Publisher > Series > Product) vs 'quick_search'
  const [selectionMode, setSelectionMode] = useState<'hierarchy' | 'quick_search'>('hierarchy');
  const [itemCategory, setItemCategory] = useState<'book' | 'notebook' | 'register' | 'all'>('book');

  // Hierarchy States
  const [publishersList, setPublishersList] = useState<PublisherDocument[]>([]);
  const [selectedPublisherId, setSelectedPublisherId] = useState<string>('');
  const [seriesList, setSeriesList] = useState<SeriesDocument[]>([]);
  const [selectedSeriesId, setSelectedSeriesId] = useState<string>('all');
  const [availableProducts, setAvailableProducts] = useState<ProductDocument[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);

  // Notebook Specific Filters
  const [selectedSheetCount, setSelectedSheetCount] = useState<string>('All');
  const [selectedNbSize, setSelectedNbSize] = useState<string>('All');

  // Currently Selected Product for adding
  const [selectedProduct, setSelectedProduct] = useState<ProductDocument | null>(null);
  const [addQuantity, setAddQuantity] = useState<number>(1);
  const [addUnitPrice, setAddUnitPrice] = useState<number>(0);
  const [addDiscountPercent, setAddDiscountPercent] = useState<number>(0);

  // Quick Search State
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<ProductDocument[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Load Active Publishers on mount
  useEffect(() => {
    getActivePublishers()
      .then(setPublishersList)
      .catch((err) => console.warn('Failed to load publishers for rough bill:', err));
  }, []);

  // Sync editingBill state
  useEffect(() => {
    if (editingBill) {
      setBillType(editingBill.billType);
      setPartyName(editingBill.partyName);
      setPhone(editingBill.phone || '');
      setTitle(editingBill.title || '');
      setNotes(editingBill.notes || '');
      setItems(editingBill.items || []);
    } else {
      setBillType('customer_quotation');
      setPartyName('');
      setPhone('');
      setTitle('');
      setNotes('');
      setItems([]);
    }
    setSearchTerm('');
    setSearchResults([]);
    setSelectedProduct(null);
    setValidationError(null);
  }, [editingBill, isOpen]);

  // Load series when publisher changes
  useEffect(() => {
    if (!selectedPublisherId || selectedPublisherId === 'all') {
      setSeriesList([]);
      setSelectedSeriesId('all');
      return;
    }

    getActiveSeriesByPublisher(selectedPublisherId)
      .then((series) => {
        setSeriesList(series);
        setSelectedSeriesId('all');
      })
      .catch((err) => console.warn('Failed to load series for publisher:', err));
  }, [selectedPublisherId]);

  // Load products based on Publisher > Series or Notebook Filters
  const loadFilteredProducts = useCallback(async () => {
    setIsLoadingProducts(true);
    try {
      if (itemCategory === 'book') {
        if (!selectedPublisherId) {
          setAvailableProducts([]);
          setIsLoadingProducts(false);
          return;
        }

        const prods = await getPriceListProducts({
          publisherId: selectedPublisherId,
          seriesId: selectedSeriesId !== 'all' ? selectedSeriesId : undefined,
          classification: 'book',
          onlyActive: true,
        });
        setAvailableProducts(prods);
      } else if (itemCategory === 'notebook' || itemCategory === 'register') {
        const prods = await getPriceListProducts({
          classification: itemCategory,
          onlyActive: true,
        });

        let filtered = prods;
        if (selectedSheetCount !== 'All') {
          filtered = filtered.filter((p) => String(p.notebookSheets || '').trim() === selectedSheetCount);
        }
        if (selectedNbSize !== 'All') {
          filtered = filtered.filter((p) => (p.notebookSize || '').toLowerCase() === selectedNbSize.toLowerCase());
        }
        setAvailableProducts(filtered);
      } else {
        // All categories
        const prods = await getPriceListProducts({ onlyActive: true });
        setAvailableProducts(prods.slice(0, 50));
      }
    } catch (err) {
      console.error('Failed to load stock products for rough bill:', err);
    } finally {
      setIsLoadingProducts(false);
    }
  }, [itemCategory, selectedPublisherId, selectedSeriesId, selectedSheetCount, selectedNbSize]);

  useEffect(() => {
    loadFilteredProducts();
  }, [loadFilteredProducts]);

  // Quick Search
  const handleQuickSearch = useCallback(async (term: string) => {
    if (!term || !term.trim()) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    try {
      const prods = await getPriceListProducts({
        searchTerm: term,
        onlyActive: true,
      });
      setSearchResults(prods.slice(0, 15));
    } catch (err) {
      console.error('Failed to search products:', err);
    } finally {
      setIsSearching(false);
    }
  }, []);

  // When a product is selected from dropdown or search
  const handleSelectProduct = (prod: ProductDocument | null) => {
    setSelectedProduct(prod);
    if (!prod) {
      setAddQuantity(1);
      setAddUnitPrice(0);
      setAddDiscountPercent(0);
      return;
    }

    // Default rate depends on customer quotation vs publisher order
    const defaultRate = billType === 'publisher_order'
      ? (prod.costPrice || prod.wholesalePrice || prod.retailPrice || 0)
      : (prod.retailPrice || prod.mrp || 0);

    // Publisher discount % is strictly confidential trade secret; never leak to bill default
    const defaultDisc = 0;

    setAddQuantity(1);
    setAddUnitPrice(defaultRate);
    setAddDiscountPercent(defaultDisc);
  };

  // Add selected product with specified quantity into items list
  const handleAddSelectedProductToBill = () => {
    if (!selectedProduct) return;
    const qty = Math.max(1, Number(addQuantity) || 1);
    const rate = Math.max(0, Number(addUnitPrice) || 0);
    const disc = Math.max(0, Math.min(100, Number(addDiscountPercent) || 0));
    const discAmt = Math.round((rate * (disc / 100)) * 100) / 100;
    const lineTotal = Math.round((rate - discAmt) * qty * 100) / 100;

    const newItem: RoughBillItem = {
      productId: selectedProduct.id,
      title: selectedProduct.title,
      sku: selectedProduct.sku,
      publisherName: selectedProduct.publisherName || selectedProduct.authorOrPublisher || 'Standard',
      seriesName: selectedProduct.seriesName,
      quantity: qty,
      unitPrice: rate,
      discountPercent: disc,
      costPrice: selectedProduct.costPrice,
      lineTotal,
    };

    setItems((prev) => {
      const existingIdx = prev.findIndex((i) => i.productId === selectedProduct.id);
      if (existingIdx >= 0) {
        const copy = [...prev];
        const newTotalQty = copy[existingIdx].quantity + qty;
        const currentRate = copy[existingIdx].unitPrice;
        const currentDisc = copy[existingIdx].discountPercent || 0;
        const currentDiscAmt = Math.round((currentRate * (currentDisc / 100)) * 100) / 100;
        copy[existingIdx].quantity = newTotalQty;
        copy[existingIdx].lineTotal = Math.round((currentRate - currentDiscAmt) * newTotalQty * 100) / 100;
        return copy;
      }
      return [...prev, newItem];
    });

    // Reset selection ready for next product
    setSelectedProduct(null);
    setAddQuantity(1);
  };

  // Update item field directly in table
  const handleItemChange = (index: number, field: keyof RoughBillItem, val: any) => {
    setItems((prev) => {
      const copy = [...prev];
      const target = { ...copy[index], [field]: val };

      const qty = Math.max(1, Number(target.quantity) || 1);
      const rate = Math.max(0, Number(target.unitPrice) || 0);
      const disc = Math.max(0, Math.min(100, Number(target.discountPercent) || 0));
      const discAmt = Math.round((rate * (disc / 100)) * 100) / 100;
      target.lineTotal = Math.round((rate - discAmt) * qty * 100) / 100;

      copy[index] = target;
      return copy;
    });
  };

  // Remove item
  const handleRemoveItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  // Summary Totals
  const totals = useMemo(() => {
    return items.reduce(
      (acc, i) => {
        acc.subtotal += i.unitPrice * i.quantity;
        acc.grandTotal += i.lineTotal;
        acc.totalQuantity += i.quantity;
        return acc;
      },
      { subtotal: 0, grandTotal: 0, totalQuantity: 0 }
    );
  }, [items]);

  const totalDiscount = Math.max(0, Math.round((totals.subtotal - totals.grandTotal) * 100) / 100);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!partyName.trim()) {
      setValidationError('Party Name / Customer or Publisher Name is required.');
      return;
    }

    if (items.length === 0) {
      setValidationError('Please add at least one product from shop stock.');
      return;
    }

    setValidationError(null);
    setIsSubmitting(true);

    try {
      await saveRoughBill(
        {
          id: editingBill?.id,
          billType,
          title: title.trim() || (billType === 'publisher_order' ? 'Publisher Order Draft' : 'Customer Quotation'),
          partyName: partyName.trim(),
          phone: phone.trim() || undefined,
          items,
          notes: notes.trim() || undefined,
        },
        currentUser?.uid || 'admin',
        currentUser?.email || 'admin@sadiqbookagency.com'
      );

      success(
        billType === 'publisher_order'
          ? 'Publisher order draft saved successfully.'
          : 'Customer quotation saved successfully.'
      );
      onSaved();
      onClose();
    } catch (err: any) {
      const msg = err?.message || 'Failed to save rough bill.';
      setValidationError(msg);
      toastError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editingBill ? 'Edit Rough Bill' : 'Create Rough Bill'}
      size="xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Bill Type Switcher */}
        <div className="flex items-center gap-2 p-1.5 bg-slate-100 rounded-xl border border-slate-200">
          <button
            type="button"
            onClick={() => setBillType('customer_quotation')}
            className={`flex-1 py-2 px-3 text-xs font-bold rounded-lg transition ${
              billType === 'customer_quotation'
                ? 'bg-[#071F49] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            📋 Customer / School Estimate
          </button>
          <button
            type="button"
            onClick={() => setBillType('publisher_order')}
            className={`flex-1 py-2 px-3 text-xs font-bold rounded-lg transition ${
              billType === 'publisher_order'
                ? 'bg-[#071F49] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            📦 Publisher Order List
          </button>
        </div>

        {validationError && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{validationError}</span>
          </div>
        )}

        {/* Basic Party Details */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-slate-50/80 border border-slate-200 rounded-xl">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              {billType === 'publisher_order' ? 'Publisher / Supplier Name *' : 'Party / Customer / School Name *'}
            </label>
            <input
              type="text"
              required
              value={partyName}
              onChange={(e) => setPartyName(e.target.value)}
              placeholder={billType === 'publisher_order' ? 'e.g. Oxford University Press' : 'e.g. City School Cantt / Tariq Sb'}
              className="w-full px-3 py-2 text-xs text-slate-800 border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#071F49] focus:outline-none bg-white font-medium"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
              <WhatsAppIcon className="w-3.5 h-3.5" />
              <span>Phone / WhatsApp (Optional)</span>
            </label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="03xx-xxxxxxx"
              className="w-full px-3 py-2 text-xs text-slate-800 border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#071F49] focus:outline-none bg-white"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Estimate Title / Description
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Class 5 Syllabus Books or Monthly Order"
              className="w-full px-3 py-2 text-xs text-slate-800 border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#071F49] focus:outline-none bg-white"
            />
          </div>
        </div>

        {/* ========================================================================= */}
        {/* GUIDED PRODUCT SELECTION FROM SHOP STOCK (Publisher > Series > Product) */}
        {/* ========================================================================= */}
        <div className="p-4 bg-white border-2 border-[#071F49]/20 rounded-2xl space-y-3 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#F5B51B]"></span>
              <h3 className="text-xs font-extrabold text-[#071F49] uppercase tracking-wider">
                Select Products From Shop Stock
              </h3>
            </div>

            {/* Mode Switcher */}
            <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-[11px] font-bold">
              <button
                type="button"
                onClick={() => setSelectionMode('hierarchy')}
                className={`px-2.5 py-1 rounded-md transition ${
                  selectionMode === 'hierarchy' ? 'bg-[#071F49] text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Publisher → Series Flow
              </button>
              <button
                type="button"
                onClick={() => setSelectionMode('quick_search')}
                className={`px-2.5 py-1 rounded-md transition ${
                  selectionMode === 'quick_search' ? 'bg-[#071F49] text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Quick Search
              </button>
            </div>
          </div>

          {/* Category Tabs: Book vs Notebook vs Register vs All */}
          {selectionMode === 'hierarchy' && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => {
                  setItemCategory('book');
                  setSelectedProduct(null);
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition border ${
                  itemCategory === 'book'
                    ? 'bg-[#071F49] text-white border-[#071F49]'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>Books</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setItemCategory('notebook');
                  setSelectedProduct(null);
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition border ${
                  itemCategory === 'notebook'
                    ? 'bg-[#071F49] text-white border-[#071F49]'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Notebooks</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setItemCategory('register');
                  setSelectedProduct(null);
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition border ${
                  itemCategory === 'register'
                    ? 'bg-[#071F49] text-white border-[#071F49]'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <Package className="w-3.5 h-3.5" />
                <span>Registers</span>
              </button>
            </div>
          )}

          {/* 1. HIERARCHY FLOW: BOOKS (Publisher -> Series -> Product) */}
          {selectionMode === 'hierarchy' && itemCategory === 'book' && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
              {/* Step 1: Publisher Dropdown */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  1. Publisher *
                </label>
                <select
                  value={selectedPublisherId}
                  onChange={(e) => {
                    setSelectedPublisherId(e.target.value);
                    setSelectedProduct(null);
                  }}
                  className="w-full px-2.5 py-1.5 text-xs text-slate-800 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#071F49] bg-white font-medium"
                >
                  <option value="">-- Select Publisher --</option>
                  {publishersList.map((pub) => (
                    <option key={pub.id} value={pub.id}>
                      {pub.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Step 2: Series Dropdown */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  2. Series
                </label>
                <select
                  disabled={!selectedPublisherId}
                  value={selectedSeriesId}
                  onChange={(e) => {
                    setSelectedSeriesId(e.target.value);
                    setSelectedProduct(null);
                  }}
                  className="w-full px-2.5 py-1.5 text-xs text-slate-800 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#071F49] bg-white disabled:bg-slate-100 disabled:text-slate-400 font-medium"
                >
                  <option value="all">All Series</option>
                  {seriesList.map((ser) => (
                    <option key={ser.id} value={ser.id}>
                      {ser.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Step 3: Product (Book) Dropdown from Stock */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  3. Select Book *
                </label>
                <select
                  disabled={!selectedPublisherId || isLoadingProducts}
                  value={selectedProduct?.id || ''}
                  onChange={(e) => {
                    const found = availableProducts.find((p) => p.id === e.target.value);
                    handleSelectProduct(found || null);
                  }}
                  className="w-full px-2.5 py-1.5 text-xs text-slate-800 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#071F49] bg-white disabled:bg-slate-100 disabled:text-slate-400 font-bold"
                >
                  <option value="">
                    {isLoadingProducts
                      ? 'Loading books from stock...'
                      : !selectedPublisherId
                      ? 'First select a publisher above'
                      : availableProducts.length === 0
                      ? 'No books found for this series'
                      : `-- Select Book (${availableProducts.length} in stock) --`}
                  </option>
                  {availableProducts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title} (Stock: {p.currentStock ?? 0} pcs • Rs. {p.retailPrice})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* 2. HIERARCHY FLOW: NOTEBOOKS / REGISTERS (Size & Sheets -> Product) */}
          {selectionMode === 'hierarchy' && (itemCategory === 'notebook' || itemCategory === 'register') && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Size
                </label>
                <select
                  value={selectedNbSize}
                  onChange={(e) => {
                    setSelectedNbSize(e.target.value);
                    setSelectedProduct(null);
                  }}
                  className="w-full px-2.5 py-1.5 text-xs text-slate-800 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#071F49] bg-white"
                >
                  {COMMON_SIZE_PRESETS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Sheet Count
                </label>
                <select
                  value={selectedSheetCount}
                  onChange={(e) => {
                    setSelectedSheetCount(e.target.value);
                    setSelectedProduct(null);
                  }}
                  className="w-full px-2.5 py-1.5 text-xs text-slate-800 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#071F49] bg-white"
                >
                  {COMMON_SHEET_PRESETS.map((sh) => (
                    <option key={sh} value={sh}>{sh === 'All' ? 'All Sheets' : `${sh} Sheets`}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Select {itemCategory === 'notebook' ? 'Notebook' : 'Register'} *
                </label>
                <select
                  value={selectedProduct?.id || ''}
                  onChange={(e) => {
                    const found = availableProducts.find((p) => p.id === e.target.value);
                    handleSelectProduct(found || null);
                  }}
                  className="w-full px-2.5 py-1.5 text-xs text-slate-800 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#071F49] bg-white font-bold"
                >
                  <option value="">
                    {isLoadingProducts
                      ? 'Loading stock...'
                      : availableProducts.length === 0
                      ? 'No items found matching filters'
                      : `-- Select Product (${availableProducts.length} items) --`}
                  </option>
                  {availableProducts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title} (Stock: {p.currentStock ?? 0} pcs • Rs. {p.retailPrice})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* 3. QUICK SEARCH MODE */}
          {selectionMode === 'quick_search' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-slate-700">
                  Search item from store stock by Title, SKU, or Publisher:
                </label>
                {isSearching && (
                  <span className="text-[11px] text-slate-500 font-medium">Searching shop catalog...</span>
                )}
              </div>
              <SearchInput
                value={searchTerm}
                onSearch={(term) => {
                  setSearchTerm(term);
                  handleQuickSearch(term);
                }}
                placeholder="Type book name, notebook size, publisher..."
                className="w-full"
              />

              {searchResults.length > 0 && (
                <div className="border border-slate-200 rounded-xl max-h-40 overflow-y-auto divide-y divide-slate-100 bg-white">
                  {searchResults.map((p) => (
                    <div
                      key={p.id}
                      onClick={() => {
                        handleSelectProduct(p);
                        setSearchResults([]);
                      }}
                      className="p-2 hover:bg-slate-50 cursor-pointer flex items-center justify-between text-xs transition"
                    >
                      <div className="min-w-0">
                        <span className="font-bold text-slate-900">{p.title}</span>
                        <span className="text-[10px] text-slate-500 ml-2">
                          {p.publisherName ? `${p.publisherName} • ` : ''}
                          SKU: {p.sku} • Stock: <strong>{p.currentStock ?? 0} pcs</strong>
                        </span>
                      </div>
                      <span className="font-mono font-bold text-[#071F49]">
                        Rs. {p.retailPrice}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ACTIVE PRODUCT CONFIGURATION & QUANTITY ADDITION PANEL */}
          {selectedProduct && (
            <div className="p-3 bg-amber-50/70 border border-amber-300/80 rounded-xl space-y-3 mt-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h4 className="text-xs font-black text-[#071F49]">
                    {selectedProduct.title}
                  </h4>
                  <p className="text-[10px] text-slate-600 mt-0.5">
                    {selectedProduct.publisherName && <span>Publisher: <strong>{selectedProduct.publisherName}</strong> • </span>}
                    {selectedProduct.seriesName && <span>Series: <strong>{selectedProduct.seriesName}</strong> • </span>}
                    <span>SKU: {selectedProduct.sku}</span>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-md text-[11px] font-bold border border-emerald-300">
                    In Shop Stock: {selectedProduct.currentStock ?? 0} units
                  </span>
                  <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded-md text-[11px] font-semibold border border-blue-300">
                    Retail: Rs. {selectedProduct.retailPrice || 0}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end pt-1 border-t border-amber-200">
                {/* Quantity to add */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Quantity *
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={addQuantity}
                    onChange={(e) => setAddQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full px-2.5 py-1.5 text-center text-xs font-mono font-bold border border-slate-300 rounded-lg bg-white"
                  />
                </div>

                {/* Rate */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Rate (Rs)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={addUnitPrice}
                    onChange={(e) => setAddUnitPrice(Math.max(0, parseFloat(e.target.value) || 0))}
                    className="w-full px-2.5 py-1.5 text-right text-xs font-mono font-bold border border-slate-300 rounded-lg bg-white"
                  />
                </div>

                {/* Discount % */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Disc %
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={addDiscountPercent}
                    onChange={(e) => setAddDiscountPercent(Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)))}
                    className="w-full px-2.5 py-1.5 text-center text-xs font-mono border border-slate-300 rounded-lg bg-white"
                  />
                </div>

                {/* Add to Bill Button */}
                <div>
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={handleAddSelectedProductToBill}
                    className="w-full bg-[#071F49] hover:bg-[#0E2E70] text-white font-bold text-xs py-2 shadow-xs"
                    leftIcon={<Plus className="w-3.5 h-3.5 text-[#F5B51B]" />}
                  >
                    + Add to Bill
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ========================================================================= */}
        {/* SELECTED ITEMS TABLE */}
        {/* ========================================================================= */}
        <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-xs">
          <div className="bg-slate-100 px-3 py-2 border-b border-slate-200 flex items-center justify-between text-xs font-bold text-slate-700">
            <span>Rough Bill Items List</span>
            <span className="text-[11px] text-slate-500 font-medium">
              Total Items: {items.length} ({totals.totalQuantity} units)
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                  <th className="p-2 w-8 text-center">#</th>
                  <th className="p-2">Item Title & SKU</th>
                  <th className="p-2 w-28">Publisher / Brand</th>
                  <th className="p-2 w-20 text-center">Qty</th>
                  <th className="p-2 w-24 text-right">Rate (Rs)</th>
                  <th className="p-2 w-16 text-center">Disc %</th>
                  <th className="p-2 w-24 text-right">Total (Rs)</th>
                  <th className="p-2 w-10 text-center"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-slate-400">
                      No items added yet. Select products from the shop stock flow above.
                    </td>
                  </tr>
                ) : (
                  items.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50">
                      <td className="p-2 text-center text-slate-400 font-mono">{idx + 1}</td>
                      <td className="p-2 font-bold text-slate-900">
                        <div>{item.title}</div>
                        <div className="text-[10px] text-slate-400 font-mono font-normal">
                          SKU: {item.sku}
                        </div>
                      </td>
                      <td className="p-2 text-slate-600 text-[11px]">
                        {item.publisherName || 'Standard'}
                      </td>
                      <td className="p-2">
                        <input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => handleItemChange(idx, 'quantity', parseInt(e.target.value) || 1)}
                          className="w-16 px-1.5 py-1 text-center font-mono font-bold text-xs border border-slate-300 rounded"
                        />
                      </td>
                      <td className="p-2 text-right">
                        <input
                          type="number"
                          min="0"
                          value={item.unitPrice}
                          onChange={(e) => handleItemChange(idx, 'unitPrice', parseFloat(e.target.value) || 0)}
                          className="w-20 px-1.5 py-1 text-right font-mono font-bold text-xs border border-slate-300 rounded"
                        />
                      </td>
                      <td className="p-2 text-center">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={item.discountPercent || 0}
                          onChange={(e) => handleItemChange(idx, 'discountPercent', parseFloat(e.target.value) || 0)}
                          className="w-14 px-1.5 py-1 text-center font-mono text-xs border border-slate-300 rounded"
                        />
                      </td>
                      <td className="p-2 text-right font-mono font-bold text-[#071F49]">
                        {formatCurrency(item.lineTotal)}
                      </td>
                      <td className="p-2 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(idx)}
                          className="text-slate-400 hover:text-rose-600 p-1 transition"
                          title="Remove item"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {items.length > 0 && (
                <tfoot className="border-t-2 border-slate-200 bg-slate-50/80 font-bold">
                  <tr>
                    <td colSpan={6} className="p-2.5 text-right text-xs text-slate-700">
                      Subtotal:
                    </td>
                    <td className="p-2.5 text-right font-mono text-xs text-slate-800">
                      {formatCurrency(totals.subtotal)}
                    </td>
                    <td></td>
                  </tr>
                  {totalDiscount > 0 && (
                    <tr>
                      <td colSpan={6} className="p-1.5 text-right text-xs text-emerald-700">
                        Total Discount:
                      </td>
                      <td className="p-1.5 text-right font-mono text-xs text-emerald-700">
                        -{formatCurrency(totalDiscount)}
                      </td>
                      <td></td>
                    </tr>
                  )}
                  <tr className="border-t border-slate-200 bg-slate-100">
                    <td colSpan={6} className="p-2.5 text-right text-xs font-black text-slate-900">
                      Grand Total ({items.length} Items, {totals.totalQuantity} Qty):
                    </td>
                    <td className="p-2.5 text-right font-mono font-black text-sm text-[#071F49]">
                      {formatCurrency(totals.grandTotal)}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">
            Notes / Terms (Optional)
          </label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Rate valid for 10 days, delivery within 2 days..."
            className="w-full px-3 py-2 text-xs text-slate-800 border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#071F49] focus:outline-none bg-white"
          />
        </div>

        {/* Crucial Zero-Side-Effects Safety Banner */}
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">Store Inventory & Ledger Notice:</p>
            <p className="text-[11px] text-emerald-800 mt-0.5">
              This is an informal estimate/order list. Saving it will strictly not deduct store inventory or affect customer Khata balances.
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
          <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="gold"
            disabled={isSubmitting || items.length === 0}
            isLoading={isSubmitting}
            leftIcon={<CheckCircle2 className="w-4 h-4 text-[#071F49]" />}
          >
            {editingBill ? 'Update Rough Bill' : 'Save Rough Bill'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
