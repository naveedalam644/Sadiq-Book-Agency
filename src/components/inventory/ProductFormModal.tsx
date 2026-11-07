import React, { useState, useEffect } from 'react';
import { Sparkles, Building2, Layers, Plus, FileSpreadsheet } from 'lucide-react';
import { Modal } from '../common/Modal';
import { Input } from '../common/Input';
import { Select } from '../common/Select';
import { Button } from '../common/Button';
import type {
  ProductDocument,
  ItemClassification,
  CategoryDocument,
  PublisherDocument,
  SeriesDocument,
} from '../../types/database';
import {
  type CreateProductInput,
  generateSuggestedSku,
  checkSkuUnique,
} from '../../services/productService';
import { getActivePublishers, createPublisher } from '../../services/publisherService';
import { getActiveSeriesByPublisher, createSeries } from '../../services/seriesService';

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

  // Hierarchical Publisher & Series states
  const [publishersList, setPublishersList] = useState<PublisherDocument[]>([]);
  const [selectedPublisherId, setSelectedPublisherId] = useState('');
  const [publisherName, setPublisherName] = useState('');

  const [seriesList, setSeriesList] = useState<SeriesDocument[]>([]);
  const [selectedSeriesId, setSelectedSeriesId] = useState('');
  const [seriesName, setSeriesName] = useState('');

  // Notebook & Register Direct Specification states (Size, Sheets, Grammage)
  const [notebookSize, setNotebookSize] = useState('');
  const [notebookSheets, setNotebookSheets] = useState('');
  const [notebookGrammage, setNotebookGrammage] = useState('');

  // Quick inline add states
  const [isQuickAddingPub, setIsQuickAddingPub] = useState(false);
  const [quickPubName, setQuickPubName] = useState('');
  const [isQuickAddingSeries, setIsQuickAddingSeries] = useState(false);
  const [quickSeriesName, setQuickSeriesName] = useState('');

  const [authorOrPublisher, setAuthorOrPublisher] = useState('');
  const [edition, setEdition] = useState('');
  const [retailPrice, setRetailPrice] = useState<number | ''>(0); // Original Price / MRP
  const [publisherDiscountPercent, setPublisherDiscountPercent] = useState<number | ''>(0); // Publisher Discount %
  const [costPrice, setCostPrice] = useState<number | ''>(0); // Actual Purchase Cost (auto-calculated)
  const [wholesalePrice, setWholesalePrice] = useState<number | ''>(0); // Optional backward-compatible
  const [currentStock, setCurrentStock] = useState<number | ''>(0);
  const [lowStockThreshold, setLowStockThreshold] = useState<number | ''>(5);
  const [unit, setUnit] = useState('piece');
  const [shelfLocation, setShelfLocation] = useState('');
  const [isActive, setIsActive] = useState(true);

  const [skuError, setSkuError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Load Active Publishers when modal opens
  useEffect(() => {
    if (isOpen) {
      getActivePublishers()
        .then((pubs) => {
          setPublishersList(pubs);
        })
        .catch((err) => console.warn('Could not load publishers:', err));
    }
  }, [isOpen]);

  // Sync initialData
  useEffect(() => {
    if (initialData) {
      setTitle(initialData.title);
      setSku(initialData.sku);
      setClassification(initialData.classification || 'book');

      const matchedCat = categories.find(
        (c) =>
          c.id === initialData.categoryId ||
          c.name.toLowerCase() === initialData.categoryName?.toLowerCase()
      );
      if (matchedCat) {
        setCategoryId(matchedCat.id);
      } else {
        const othersCat = categories.find((c) => c.name.toLowerCase() === 'others');
        setCategoryId(othersCat ? othersCat.id : categories[0]?.id || 'cat_primary');
      }

      // Publisher & Series initialization
      const pubId = initialData.publisherId || '';
      const pubName = initialData.publisherName || '';
      setSelectedPublisherId(pubId);
      setPublisherName(pubName);

      const serId = initialData.seriesId || '';
      const serName = initialData.seriesName || '';
      setSelectedSeriesId(serId);
      setSeriesName(serName);

      // Load series for this publisher if present
      if (pubId) {
        getActiveSeriesByPublisher(pubId)
          .then((series) => {
            setSeriesList(series);
          })
          .catch((err) => console.warn('Could not load series for publisher:', err));
      } else {
        setSeriesList([]);
      }

      setAuthorOrPublisher(initialData.authorOrPublisher || '');
      setEdition(initialData.edition || '');
      setNotebookSize(initialData.notebookSize || '');
      setNotebookSheets(initialData.notebookSheets || '');
      setNotebookGrammage(initialData.notebookGrammage || '');
      const initialMrp = initialData.retailPrice ?? (initialData.originalPrice || 0);
      const initialPubDisc =
        typeof initialData.publisherDiscountPercent === 'number'
          ? initialData.publisherDiscountPercent
          : initialMrp > 0
          ? Math.max(0, Math.round(((initialMrp - initialData.costPrice) / initialMrp) * 1000) / 10)
          : 0;
      setRetailPrice(initialMrp);
      setPublisherDiscountPercent(initialPubDisc);
      setCostPrice(initialData.costPrice);
      setWholesalePrice(initialData.wholesalePrice || initialMrp);
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
      setSelectedPublisherId('');
      setPublisherName('');
      setSeriesList([]);
      setSelectedSeriesId('');
      setSeriesName('');
      setAuthorOrPublisher('');
      setEdition('');
      setNotebookSize('');
      setNotebookSheets('');
      setNotebookGrammage('');
      setRetailPrice(0);
      setPublisherDiscountPercent(0);
      setCostPrice(0);
      setWholesalePrice(0);
      setCurrentStock(0);
      setLowStockThreshold(5);
      setUnit('piece');
      setShelfLocation('');
      setIsActive(true);
    }
    setSkuError(null);
    setFormError(null);
    setIsQuickAddingPub(false);
    setIsQuickAddingSeries(false);
  }, [initialData, categories, isOpen]);

  // Cascading Dropdown Handler: Publisher Change
  const handlePublisherChange = async (pubId: string) => {
    setSelectedPublisherId(pubId);

    // Strictly clear selected series immediately
    setSelectedSeriesId('');
    setSeriesName('');

    if (pubId) {
      const pub = publishersList.find((p) => p.id === pubId);
      setPublisherName(pub ? pub.name : '');

      try {
        const series = await getActiveSeriesByPublisher(pubId);
        setSeriesList(series);
      } catch (err) {
        console.error('Failed to load series for publisher:', err);
        setSeriesList([]);
      }
    } else {
      setPublisherName('');
      setSeriesList([]);
    }
  };

  const handleSeriesChange = (serId: string) => {
    setSelectedSeriesId(serId);
    if (serId) {
      const ser = seriesList.find((s) => s.id === serId);
      setSeriesName(ser ? ser.name : '');
    } else {
      setSeriesName('');
    }
  };

  // Quick Inline Add Publisher
  const handleQuickAddPublisher = async () => {
    if (!quickPubName.trim()) return;
    try {
      const newPub = await createPublisher({ name: quickPubName.trim() });
      setPublishersList((prev) => [...prev, newPub].sort((a, b) => a.name.localeCompare(b.name)));
      await handlePublisherChange(newPub.id);
      setIsQuickAddingPub(false);
      setQuickPubName('');
    } catch (err: any) {
      setFormError(err?.message || 'Failed to create publisher.');
    }
  };

  // Quick Inline Add Series
  const handleQuickAddSeries = async () => {
    if (!selectedPublisherId || !quickSeriesName.trim()) return;
    try {
      const newSer = await createSeries({
        name: quickSeriesName.trim(),
        publisherId: selectedPublisherId,
      });
      setSeriesList((prev) => [...prev, newSer].sort((a, b) => a.name.localeCompare(b.name)));
      handleSeriesChange(newSer.id);
      setIsQuickAddingSeries(false);
      setQuickSeriesName('');
    } catch (err: any) {
      setFormError(err?.message || 'Failed to create series.');
    }
  };

  // Recalculate Actual Purchase Cost when MRP or Publisher Discount % changes
  const handleMrpChange = (val: number | '') => {
    setRetailPrice(val);
    const m = typeof val === 'number' ? val : 0;
    const d = typeof publisherDiscountPercent === 'number' ? publisherDiscountPercent : 0;
    setCostPrice(Math.round(m * (1 - d / 100) * 100) / 100);
    setWholesalePrice(m);
  };

  const handlePublisherDiscountChange = (newDisc: number | '') => {
    setPublisherDiscountPercent(newDisc);
    const m = typeof retailPrice === 'number' ? retailPrice : 0;
    const d = typeof newDisc === 'number' ? newDisc : 0;
    setCostPrice(Math.round(m * (1 - d / 100) * 100) / 100);
  };

  const handleAutoSku = () => {
    if (!title.trim()) {
      setSkuError('Enter title before auto-generating SKU.');
      return;
    }
    const suggested = generateSuggestedSku(classification, title);
    setSku(suggested);
    setSkuError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!title.trim()) {
      setFormError('Product title is required.');
      return;
    }

    if (!sku.trim()) {
      setSkuError('Unique Product SKU code is required.');
      return;
    }

    const isUnique = await checkSkuUnique(sku, initialData?.id);
    if (!isUnique) {
      setSkuError(`SKU "${sku}" is already assigned to another product.`);
      return;
    }

    const selectedCategory = categories.find((c) => c.id === categoryId);
    const categoryNameLower = (selectedCategory?.name || initialData?.categoryName || '').toLowerCase();
    const isNotebookOrRegister =
      classification === 'notebook' ||
      classification === 'register' ||
      categoryNameLower.includes('notebook') ||
      categoryNameLower.includes('register');

    // Cross-publisher series validation gate (strictly for books)
    if (!isNotebookOrRegister && selectedSeriesId) {
      if (!selectedPublisherId) {
        setFormError('A series cannot be assigned without selecting a publisher.');
        return;
      }
      const matchedSeries = seriesList.find((s) => s.id === selectedSeriesId);
      if (!matchedSeries || matchedSeries.publisherId !== selectedPublisherId) {
        setFormError('Selected series does not belong to the selected publisher.');
        return;
      }
    }

    const numMrp = Number(retailPrice) || 0;
    const numPubDisc =
      typeof publisherDiscountPercent === 'number'
        ? Math.max(0, Math.min(100, publisherDiscountPercent))
        : 0;
    const numActualCost = Math.round(numMrp * (1 - numPubDisc / 100) * 100) / 100;

    const payload: CreateProductInput = {
      title: title.trim(),
      sku: sku.trim().toUpperCase(),
      ...(initialData?.barcode ? { barcode: initialData.barcode } : {}),
      classification,
      categoryId,
      categoryName: selectedCategory ? selectedCategory.name : '',
      publisherId: isNotebookOrRegister ? undefined : (selectedPublisherId || undefined),
      publisherName: isNotebookOrRegister ? undefined : (publisherName.trim() || undefined),
      seriesId: isNotebookOrRegister ? undefined : (selectedSeriesId || undefined),
      seriesName: isNotebookOrRegister ? undefined : (seriesName.trim() || undefined),
      notebookSize: isNotebookOrRegister ? (notebookSize.trim() || undefined) : undefined,
      notebookSheets: isNotebookOrRegister ? (notebookSheets.trim() || undefined) : undefined,
      notebookGrammage: isNotebookOrRegister ? (notebookGrammage.trim() || undefined) : undefined,
      authorOrPublisher: authorOrPublisher.trim(),
      edition: edition.trim(),
      costPrice: numActualCost,
      retailPrice: numMrp,
      originalPrice: numMrp,
      mrp: numMrp,
      publisherDiscountPercent: numPubDisc,
      wholesalePrice: Number(wholesalePrice) || numMrp,
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

  // Classification and category check
  const selectedCategory = categories.find((c) => c.id === categoryId);
  const categoryNameLower = (selectedCategory?.name || initialData?.categoryName || '').toLowerCase();
  const isNotebookOrRegister =
    classification === 'notebook' ||
    classification === 'register' ||
    categoryNameLower.includes('notebook') ||
    categoryNameLower.includes('register');

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={initialData ? 'Edit Product / Book' : 'Add New Book or Stationery Item'}
      description="Record product specifications, publisher, series, purchase cost, and inventory thresholds."
      size="xl"
      footer={
        <div className="flex items-center justify-end gap-3 w-full">
          <Button variant="outline" type="button" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            form="product-form"
            isLoading={isLoading}
            disabled={isLoading}
          >
            {initialData ? 'Save Changes' : 'Create Product'}
          </Button>
        </div>
      }
    >
      <form id="product-form" onSubmit={handleSubmit} className="space-y-4">
        {formError && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-xs">
            {formError}
          </div>
        )}

        {/* Classification & Category */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select
            label="Item Classification"
            value={classification}
            onChange={(e) => setClassification(e.target.value as ItemClassification)}
            options={[
              { value: 'book', label: 'Book (Educational / General)' },
              { value: 'notebook', label: 'Notebook' },
              { value: 'register', label: 'Register' },
              { value: 'stationery', label: 'Stationery Item' },
              { value: 'general', label: 'General / Office Item' },
            ]}
            required
          />

          <Select
            label="Category"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            options={categories.map((c) => ({
              value: c.id,
              label: c.name,
            }))}
            required
          />
        </div>

        {/* Title */}
        <Input
          label={
            isNotebookOrRegister
              ? 'Notebook / Register Title (Product Name)'
              : 'Book Title / Product Name'
          }
          placeholder={
            isNotebookOrRegister
              ? 'e.g. Deer Soft Cover Register / Urdu Notebook 120 Pages'
              : 'e.g. English Progressive Class 9 / Oxford Urdu'
          }
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />

        {/* SKU with Auto-generate */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
              SKU (Stock Keeping Unit) <span className="text-rose-500">*</span>
            </label>
            <button
              type="button"
              onClick={handleAutoSku}
              className="text-xs text-[#071F49] hover:underline flex items-center gap-1 font-semibold"
            >
              <Sparkles className="w-3 h-3 text-[#071F49]" />
              Auto-Generate
            </button>
          </div>
          <Input
            placeholder={isNotebookOrRegister ? 'e.g. NB-A4-100' : 'e.g. BK-ENG-1042'}
            value={sku}
            onChange={(e) => {
              setSku(e.target.value.toUpperCase());
              setSkuError(null);
            }}
            error={skuError || undefined}
            required
          />
        </div>

        {/* Notebook & Register Direct Specifications (Size, Sheets, Grammage) */}
        {isNotebookOrRegister ? (
          <div className="p-3.5 bg-amber-50/50 border border-amber-200/80 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-950 flex items-center gap-1.5">
                <FileSpreadsheet className="w-4 h-4 text-amber-700" />
                Notebook & Register Specifications
              </span>
              <span className="text-[11px] text-amber-800 font-medium">
                Enter size, sheets count, and paper grammage directly
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Direct Writeable Size */}
              <div>
                <Input
                  label="Size"
                  placeholder="e.g. A4, A5, Foolscap, Large"
                  value={notebookSize}
                  onChange={(e) => setNotebookSize(e.target.value)}
                  list="notebook-size-suggestions"
                />
                <datalist id="notebook-size-suggestions">
                  <option value="A4" />
                  <option value="A5" />
                  <option value="Foolscap" />
                  <option value="Small" />
                  <option value="Large" />
                  <option value="Executive" />
                  <option value="B5" />
                </datalist>
              </div>

              {/* Direct Writeable Sheet Count */}
              <div>
                <Input
                  label="Sheets Count"
                  placeholder="e.g. 40, 80, 100, 120, 200"
                  value={notebookSheets}
                  onChange={(e) => setNotebookSheets(e.target.value)}
                  list="notebook-sheets-suggestions"
                />
                <datalist id="notebook-sheets-suggestions">
                  <option value="40" />
                  <option value="60" />
                  <option value="80" />
                  <option value="100" />
                  <option value="120" />
                  <option value="160" />
                  <option value="200" />
                  <option value="240" />
                  <option value="300" />
                </datalist>
              </div>

              {/* Direct Writeable Grammage */}
              <div>
                <Input
                  label="Grammage (GSM)"
                  placeholder="e.g. 60 GSM, 70 GSM, 80 GSM"
                  value={notebookGrammage}
                  onChange={(e) => setNotebookGrammage(e.target.value)}
                  list="notebook-grammage-suggestions"
                />
                <datalist id="notebook-grammage-suggestions">
                  <option value="60 GSM" />
                  <option value="68 GSM" />
                  <option value="70 GSM" />
                  <option value="75 GSM" />
                  <option value="80 GSM" />
                  <option value="90 GSM" />
                </datalist>
              </div>
            </div>
          </div>
        ) : (
          /* Book / Other Categories: Cascading Hierarchy: 1. Publisher -> 2. Series */
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <Building2 className="w-4 h-4 text-[#071F49]" />
                Publisher & Series Hierarchy
              </span>
              <span className="text-[11px] text-slate-500">
                Step 1: Select Publisher $\rightarrow$ Step 2: Select Series
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Step 1: Publisher Cascading Selector */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-slate-700">
                    Publisher / Organization
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsQuickAddingPub((prev) => !prev)}
                    className="text-[11px] text-[#071F49] hover:underline font-bold flex items-center gap-0.5 cursor-pointer"
                  >
                    <Plus className="w-3 h-3 text-[#F5B51B]" />
                    <span>{isQuickAddingPub ? 'Cancel' : '+ Add Publisher'}</span>
                  </button>
                </div>

                {isQuickAddingPub ? (
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={quickPubName}
                      onChange={(e) => setQuickPubName(e.target.value)}
                      placeholder="New Publisher name..."
                      className="flex-1 px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg outline-none"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={handleQuickAddPublisher}
                      className="px-2.5 py-1 bg-[#071F49] text-white text-xs font-bold rounded-lg shadow-xs"
                    >
                      Save
                    </button>
                  </div>
                ) : (
                  <select
                    value={selectedPublisherId}
                    onChange={(e) => handlePublisherChange(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:ring-1 focus:ring-[#071F49] outline-none"
                  >
                    <option value="">-- Select Publisher --</option>
                    {publishersList.map((pub) => (
                      <option key={pub.id} value={pub.id}>
                        {pub.name}
                      </option>
                    ))}
                    {publisherName && !publishersList.some((p) => p.id === selectedPublisherId) && (
                      <option value={selectedPublisherId || 'legacy'}>
                        {publisherName} (Legacy Record)
                      </option>
                    )}
                  </select>
                )}
              </div>

              {/* Step 2: Series Cascading Selector */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-slate-700 flex items-center gap-1">
                    <Layers className="w-3.5 h-3.5 text-[#071F49]" />
                    <span>Series</span>
                  </label>
                  {selectedPublisherId && (
                    <button
                      type="button"
                      onClick={() => setIsQuickAddingSeries((prev) => !prev)}
                      className="text-[11px] text-[#071F49] hover:underline font-bold flex items-center gap-0.5 cursor-pointer"
                    >
                      <Plus className="w-3 h-3 text-[#F5B51B]" />
                      <span>{isQuickAddingSeries ? 'Cancel' : '+ Add Series'}</span>
                    </button>
                  )}
                </div>

                {isQuickAddingSeries ? (
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={quickSeriesName}
                      onChange={(e) => setQuickSeriesName(e.target.value)}
                      placeholder="New Series name (e.g. Progressive)..."
                      className="flex-1 px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg outline-none"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={handleQuickAddSeries}
                      className="px-2.5 py-1 bg-[#071F49] text-white text-xs font-bold rounded-lg shadow-xs"
                    >
                      Save
                    </button>
                  </div>
                ) : (
                  <select
                    value={selectedSeriesId}
                    onChange={(e) => handleSeriesChange(e.target.value)}
                    disabled={!selectedPublisherId}
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:ring-1 focus:ring-[#071F49] outline-none disabled:bg-slate-100 disabled:text-slate-400 cursor-pointer disabled:cursor-not-allowed"
                  >
                    <option value="">
                      {!selectedPublisherId
                        ? '-- Select a publisher first --'
                        : seriesList.length === 0
                        ? '-- No series configured for this publisher --'
                        : '-- Select Series (Optional) --'}
                    </option>
                    {seriesList.map((ser) => (
                      <option key={ser.id} value={ser.id}>
                        {ser.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Author / Brand & Edition / Ruling */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label={
              classification === 'book'
                ? 'Author (Optional)'
                : isNotebookOrRegister
                ? 'Brand / Manufacturer'
                : 'Brand / Manufacturer'
            }
            placeholder={
              classification === 'book'
                ? 'e.g. Dr. Tariq / Sir David'
                : isNotebookOrRegister
                ? 'e.g. Deer / Dollar / SBA'
                : 'e.g. Deer / Dollar / Piano'
            }
            value={authorOrPublisher}
            onChange={(e) => setAuthorOrPublisher(e.target.value)}
          />

          <Input
            label={
              classification === 'book'
                ? 'Edition / Class'
                : isNotebookOrRegister
                ? 'Ruling / Pattern (Optional)'
                : 'Size / Specification'
            }
            placeholder={
              classification === 'book'
                ? 'e.g. 2026 Edition / Class 9'
                : isNotebookOrRegister
                ? 'e.g. Single Line / Four Line / Plain'
                : 'e.g. 160 Pages Ruled / Box of 12'
            }
            value={edition}
            onChange={(e) => setEdition(e.target.value)}
          />
        </div>

        {/* Pricing Section: MRP, Publisher Discount %, and Actual Purchase Cost */}
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Pricing & Publisher Cost (PKR)
            </h4>
            <span className="text-[11px] text-slate-500 font-medium">
              Formula: MRP × (1 − Publisher Disc % / 100)
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Input
                label="Original Price / MRP (PKR)"
                type="number"
                min="0"
                step="any"
                value={retailPrice}
                onChange={(e) =>
                  handleMrpChange(e.target.value === '' ? '' : parseFloat(e.target.value))
                }
                required
              />
            </div>

            <div>
              <Input
                label="Publisher Discount %"
                type="number"
                min="0"
                max="100"
                step="0.1"
                placeholder="e.g. 50"
                value={publisherDiscountPercent}
                onChange={(e) =>
                  handlePublisherDiscountChange(
                    e.target.value === '' ? '' : parseFloat(e.target.value)
                  )
                }
              />
            </div>

            <div>
              <Input
                label="Actual Purchase Cost (PKR)"
                type="number"
                value={costPrice}
                disabled
                helperText="Auto-computed purchase rate"
              />
            </div>
          </div>
        </div>

        {/* Inventory Stock & Shelf Location */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <Input
            label="Initial Stock"
            type="number"
            min="0"
            value={currentStock}
            onChange={(e) =>
              setCurrentStock(e.target.value === '' ? '' : parseInt(e.target.value, 10))
            }
            required
          />

          <Input
            label="Low Stock Alert"
            type="number"
            min="0"
            value={lowStockThreshold}
            onChange={(e) =>
              setLowStockThreshold(e.target.value === '' ? '' : parseInt(e.target.value, 10))
            }
            required
          />

          <Select
            label="Stock Unit"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            options={[
              { value: 'piece', label: 'Piece (Single Book)' },
              { value: 'bundle', label: 'Bundle' },
              { value: 'dozen', label: 'Dozen' },
              { value: 'box', label: 'Box' },
            ]}
          />

          <Input
            label="Shelf / Rack Location"
            placeholder="e.g. Rack B-3"
            value={shelfLocation}
            onChange={(e) => setShelfLocation(e.target.value)}
          />
        </div>
      </form>
    </Modal>
  );
};
