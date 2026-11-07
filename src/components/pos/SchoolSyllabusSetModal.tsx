import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Building,
  School,
  CheckSquare,
  Square,
  AlertTriangle,
  Receipt,
} from 'lucide-react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import type {
  EducationalBoardDocument,
  SchoolDocument,
  SyllabusSetDocument,
  ProductDocument,
} from '../../types/database';
import {
  getBoards,
  getSchools,
  getSyllabusSetForPOS,
  STANDARD_CLASSES,
} from '../../services/syllabusService';
import { formatCurrency } from '../../utils/formatters';

export interface SchoolSyllabusSetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoadItemsIntoCart: (items: Array<{ product: ProductDocument; quantity: number }>) => void;
}

export const SchoolSyllabusSetModal: React.FC<SchoolSyllabusSetModalProps> = ({
  isOpen,
  onClose,
  onLoadItemsIntoCart,
}) => {
  const [boards, setBoards] = useState<EducationalBoardDocument[]>([]);
  const [schools, setSchools] = useState<SchoolDocument[]>([]);
  const [selectedBoardId, setSelectedBoardId] = useState<string>('');
  const [selectedSchoolId, setSelectedSchoolId] = useState<string>('');
  const [selectedClass, setSelectedClass] = useState<string>('Class 1');

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [syllabusData, setSyllabusData] = useState<{
    set: SyllabusSetDocument;
    liveItems: Array<{
      product: ProductDocument;
      quantity: number;
      subject?: string;
      inStock: boolean;
      availableStock: number;
    }>;
  } | null>(null);

  // Set of selected product IDs (checked by default)
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());

  // Load Boards
  useEffect(() => {
    if (isOpen) {
      getBoards(true).then((bList) => {
        setBoards(bList);
        if (bList.length > 0 && !selectedBoardId) {
          setSelectedBoardId(bList[0].id);
        }
      });
    }
  }, [isOpen]);

  // Load Schools when board changes
  useEffect(() => {
    if (selectedBoardId) {
      getSchools(selectedBoardId, true).then((sList) => {
        setSchools(sList);
        if (sList.length > 0) {
          setSelectedSchoolId(sList[0].id);
        } else {
          setSelectedSchoolId('');
          setSyllabusData(null);
        }
      });
    } else {
      setSchools([]);
      setSelectedSchoolId('');
      setSyllabusData(null);
    }
  }, [selectedBoardId]);

  // Load live Syllabus Set for POS
  const loadSet = useCallback(async () => {
    if (!selectedSchoolId || !selectedClass) {
      setSyllabusData(null);
      setSelectedProductIds(new Set());
      return;
    }

    setIsLoading(true);
    try {
      const data = await getSyllabusSetForPOS(selectedSchoolId, selectedClass);
      setSyllabusData(data);
      if (data && data.liveItems.length > 0) {
        // Select all available items by default
        const allIds = new Set(data.liveItems.map((i) => i.product.id));
        setSelectedProductIds(allIds);
      } else {
        setSelectedProductIds(new Set());
      }
    } catch (err) {
      console.error('Failed to load syllabus set for POS:', err);
      setSyllabusData(null);
    } finally {
      setIsLoading(false);
    }
  }, [selectedSchoolId, selectedClass]);

  useEffect(() => {
    if (isOpen && selectedSchoolId && selectedClass) {
      loadSet();
    }
  }, [isOpen, selectedSchoolId, selectedClass, loadSet]);

  // Toggle selection for a single book
  const toggleItemSelection = (productId: string) => {
    setSelectedProductIds((prev) => {
      const copy = new Set(prev);
      if (copy.has(productId)) {
        copy.delete(productId);
      } else {
        copy.add(productId);
      }
      return copy;
    });
  };

  // Toggle select all
  const toggleSelectAll = () => {
    if (!syllabusData) return;
    if (selectedProductIds.size === syllabusData.liveItems.length) {
      setSelectedProductIds(new Set());
    } else {
      setSelectedProductIds(new Set(syllabusData.liveItems.map((i) => i.product.id)));
    }
  };

  // Compute selected totals
  const selectedTotals = useMemo(() => {
    if (!syllabusData) return { count: 0, totalPrice: 0 };
    let count = 0;
    let totalPrice = 0;

    for (const item of syllabusData.liveItems) {
      if (selectedProductIds.has(item.product.id)) {
        count += item.quantity;
        totalPrice += (Number(item.product.retailPrice || item.product.mrp || 0) * item.quantity);
      }
    }

    return { count, totalPrice };
  }, [syllabusData, selectedProductIds]);

  // Submit to POS
  const handleLoadIntoPOS = () => {
    if (!syllabusData || selectedProductIds.size === 0) return;

    const itemsToLoad: Array<{ product: ProductDocument; quantity: number }> = [];

    for (const item of syllabusData.liveItems) {
      if (selectedProductIds.has(item.product.id)) {
        itemsToLoad.push({
          product: item.product,
          quantity: item.quantity,
        });
      }
    }

    onLoadItemsIntoCart(itemsToLoad);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Load School Course Set into Bill"
      size="lg"
    >
      <div className="space-y-4">
        {/* Step 1 & 2: Board & School Selectors */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-slate-50 border border-slate-200/90 rounded-2xl">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
              <Building className="w-3.5 h-3.5 text-[#071F49]" />
              1. Select Board:
            </label>
            <select
              value={selectedBoardId}
              onChange={(e) => setSelectedBoardId(e.target.value)}
              className="w-full px-3 py-2 text-xs font-bold text-slate-800 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#071F49] focus:outline-none"
            >
              {boards.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
              <School className="w-3.5 h-3.5 text-[#071F49]" />
              2. Select School:
            </label>
            <select
              value={selectedSchoolId}
              onChange={(e) => setSelectedSchoolId(e.target.value)}
              disabled={schools.length === 0}
              className="w-full px-3 py-2 text-xs font-bold text-slate-800 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#071F49] focus:outline-none disabled:bg-slate-100"
            >
              {schools.length === 0 && <option value="">No schools for this board</option>}
              {schools.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Step 3: Fast Class Selector */}
        <div>
          <span className="text-xs font-bold text-slate-600 mb-1.5 block">
            3. Select Class:
          </span>
          <div className="flex items-center gap-1.5 flex-wrap">
            {STANDARD_CLASSES.map((cls) => {
              const isSelected = selectedClass === cls;
              return (
                <button
                  key={cls}
                  type="button"
                  onClick={() => setSelectedClass(cls)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-xl transition ${
                    isSelected
                      ? 'bg-[#071F49] text-[#F5B51B] shadow-xs'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {cls}
                </button>
              );
            })}
          </div>
        </div>

        {/* Live Course Set Books List */}
        <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-xs">
          {/* Header Bar */}
          <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={toggleSelectAll}
                className="flex items-center gap-1.5 text-xs font-bold text-[#071F49] hover:underline"
              >
                {syllabusData && selectedProductIds.size === syllabusData.liveItems.length ? (
                  <CheckSquare className="w-4 h-4 text-[#071F49]" />
                ) : (
                  <Square className="w-4 h-4 text-slate-400" />
                )}
                Select All Books ({syllabusData?.liveItems.length || 0})
              </button>
            </div>

            <div className="text-right">
              <span className="text-xs font-mono font-black text-[#071F49]">
                Selected: {selectedTotals.count} Books • {formatCurrency(selectedTotals.totalPrice)}
              </span>
            </div>
          </div>

          {/* Items Content */}
          <div className="max-h-64 overflow-y-auto divide-y divide-slate-100">
            {isLoading && (
              <div className="p-8 text-center text-xs text-slate-500">
                Loading course set from catalog...
              </div>
            )}

            {!isLoading && (!syllabusData || syllabusData.liveItems.length === 0) && (
              <div className="p-8 text-center text-xs text-slate-500">
                No course book set configured for {selectedClass}. You can configure it from the{' '}
                <strong>Syllabus</strong> page.
              </div>
            )}

            {!isLoading &&
              syllabusData &&
              syllabusData.liveItems.map((item) => {
                const isSelected = selectedProductIds.has(item.product.id);
                const isOutOfStock = !item.inStock;
                return (
                  <div
                    key={item.product.id}
                    onClick={() => toggleItemSelection(item.product.id)}
                    className={`p-3 flex items-center justify-between gap-3 cursor-pointer transition ${
                      isSelected ? 'bg-blue-50/40 hover:bg-blue-50/70' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      <div className="mt-0.5 shrink-0">
                        {isSelected ? (
                          <CheckSquare className="w-4 h-4 text-[#071F49]" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-300" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-[#071F49] bg-white px-1.5 py-0.5 rounded border border-slate-200">
                            {item.subject || 'General'}
                          </span>
                          <span className="font-bold text-xs text-slate-900 truncate">
                            {item.product.title}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                          {item.product.publisherName && (
                            <span className="font-semibold text-slate-700">
                              {item.product.publisherName} •{' '}
                            </span>
                          )}
                          {item.product.seriesName && <span>{item.product.seriesName} • </span>}
                          <span className="font-mono">Qty: {item.quantity}</span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="font-mono font-black text-xs text-[#071F49]">
                        {formatCurrency(
                          (item.product.retailPrice || item.product.mrp || 0) * item.quantity
                        )}
                      </div>
                      {isOutOfStock ? (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.2 rounded mt-0.5">
                          <AlertTriangle className="w-2.5 h-2.5" />
                          Stock: {item.availableStock}
                        </span>
                      ) : (
                        <span className="text-[10px] font-mono font-semibold text-emerald-700">
                          Stock: {item.availableStock}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-200">
          <div className="text-xs text-slate-500">
            Selected books will be loaded directly into your active POS bill.
          </div>

          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="gold"
              onClick={handleLoadIntoPOS}
              disabled={selectedProductIds.size === 0}
              leftIcon={<Receipt className="w-4 h-4 text-[#071F49]" />}
            >
              Load {selectedTotals.count} Books into Bill ({formatCurrency(selectedTotals.totalPrice)})
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};
