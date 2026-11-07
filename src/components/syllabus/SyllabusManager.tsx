import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  GraduationCap,
  Building,
  School,
  Plus,
  Edit,
  Trash2,
  Receipt,
  CheckCircle2,
  BookOpen,
  Sparkles,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../common/Button';
import { Table, type Column } from '../common/Table';
import { BoardModal } from './BoardModal';
import { SchoolModal } from './SchoolModal';
import { AddBookToSetModal } from './AddBookToSetModal';
import type {
  EducationalBoardDocument,
  SchoolDocument,
  SyllabusSetDocument,
  SyllabusBookItem,
} from '../../types/database';
import {
  getBoards,
  getSchools,
  getSyllabusSetBySchoolAndClass,
  saveSyllabusSet,
  STANDARD_CLASSES,
} from '../../services/syllabusService';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { formatCurrency, formatNumber } from '../../utils/formatters';

export const SyllabusManager: React.FC = () => {
  const { currentUser } = useAuth();
  const { success, error: toastError } = useToast();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<'sets' | 'boards' | 'schools'>('sets');

  // Boards & Schools state
  const [boards, setBoards] = useState<EducationalBoardDocument[]>([]);
  const [schools, setSchools] = useState<SchoolDocument[]>([]);
  const [selectedBoardId, setSelectedBoardId] = useState<string>('');
  const [selectedSchoolId, setSelectedSchoolId] = useState<string>('');
  const [selectedClass, setSelectedClass] = useState<string>('Class 1');

  // Current Course Set State
  const [currentSet, setCurrentSet] = useState<SyllabusSetDocument | null>(null);
  const [setItems, setSetItems] = useState<SyllabusBookItem[]>([]);
  const [isLoadingSet, setIsLoadingSet] = useState(false);
  const [isSavingSet, setIsSavingSet] = useState(false);

  // Modals
  const [isBoardModalOpen, setIsBoardModalOpen] = useState(false);
  const [editingBoard, setEditingBoard] = useState<EducationalBoardDocument | null>(null);
  const [isSchoolModalOpen, setIsSchoolModalOpen] = useState(false);
  const [editingSchool, setEditingSchool] = useState<SchoolDocument | null>(null);
  const [isAddBookModalOpen, setIsAddBookModalOpen] = useState(false);

  // Load Boards
  const loadBoards = useCallback(async () => {
    try {
      const bList = await getBoards();
      setBoards(bList);
      if (bList.length > 0 && !selectedBoardId) {
        setSelectedBoardId(bList[0].id);
      }
    } catch (err: any) {
      toastError(err?.message || 'Failed to load boards');
    }
  }, [selectedBoardId, toastError]);

  // Load Schools when selectedBoardId changes
  const loadSchools = useCallback(async () => {
    if (!selectedBoardId) {
      setSchools([]);
      setSelectedSchoolId('');
      return;
    }
    try {
      const sList = await getSchools(selectedBoardId);
      setSchools(sList);
      if (sList.length > 0) {
        setSelectedSchoolId(sList[0].id);
      } else {
        setSelectedSchoolId('');
      }
    } catch (err: any) {
      toastError(err?.message || 'Failed to load schools');
    }
  }, [selectedBoardId, toastError]);

  useEffect(() => {
    loadBoards();
  }, [loadBoards]);

  useEffect(() => {
    loadSchools();
  }, [loadSchools]);

  // Load Course Set when selectedSchoolId or selectedClass changes
  const loadCurrentSet = useCallback(async () => {
    if (!selectedSchoolId || !selectedClass) {
      setCurrentSet(null);
      setSetItems([]);
      return;
    }

    setIsLoadingSet(true);
    try {
      const setDoc = await getSyllabusSetBySchoolAndClass(selectedSchoolId, selectedClass);
      if (setDoc) {
        setCurrentSet(setDoc);
        setSetItems(setDoc.items || []);
      } else {
        setCurrentSet(null);
        setSetItems([]);
      }
    } catch (err: any) {
      console.error('Failed to load syllabus set:', err);
    } finally {
      setIsLoadingSet(false);
    }
  }, [selectedSchoolId, selectedClass]);

  useEffect(() => {
    loadCurrentSet();
  }, [loadCurrentSet]);

  // Current selected school object
  const currentSchool = useMemo(() => {
    return schools.find((s) => s.id === selectedSchoolId) || null;
  }, [schools, selectedSchoolId]);

  // Totals of current set in memory
  const setTotals = useMemo(() => {
    const totalBooks = setItems.reduce((acc, item) => acc + (Number(item.quantity) || 1), 0);
    const totalPrice = setItems.reduce(
      (acc, item) => acc + (Number(item.retailPrice) || 0) * (Number(item.quantity) || 1),
      0
    );
    return { totalBooks, totalPrice };
  }, [setItems]);

  // Handle adding book to set
  const handleAddBookToSet = (book: SyllabusBookItem) => {
    setSetItems((prev) => {
      // Check if already in set
      const existingIdx = prev.findIndex((b) => b.productId === book.productId);
      if (existingIdx >= 0) {
        const copy = [...prev];
        copy[existingIdx].quantity += book.quantity;
        return copy;
      }
      return [...prev, book];
    });
  };

  // Handle removing book from set
  const handleRemoveBook = (productId: string) => {
    setSetItems((prev) => prev.filter((b) => b.productId !== productId));
  };

  // Handle quantity change
  const handleQuantityChange = (productId: string, newQty: number) => {
    if (newQty < 1) return;
    setSetItems((prev) =>
      prev.map((b) => (b.productId === productId ? { ...b, quantity: newQty } : b))
    );
  };

  // Save the Syllabus Set to Firestore
  const handleSaveSet = async () => {
    if (!selectedBoardId || !selectedSchoolId || !selectedClass) {
      toastError('Please select Board, School and Class.');
      return;
    }

    setIsSavingSet(true);
    try {
      const saved = await saveSyllabusSet(
        {
          boardId: selectedBoardId,
          schoolId: selectedSchoolId,
          className: selectedClass,
          items: setItems,
        },
        currentUser?.uid || 'admin',
        currentUser?.email || 'admin@sadiqbookagency.com'
      );
      setCurrentSet(saved);
      success(`Course Set for ${saved.schoolName} (${saved.className}) saved successfully.`);
    } catch (err: any) {
      toastError(err?.message || 'Failed to save syllabus set');
    } finally {
      setIsSavingSet(false);
    }
  };

  // Handle Bill in POS: stores set info and redirects to POS with preload flag
  const handleBillInPOS = () => {
    if (setItems.length === 0) {
      toastError('Cannot bill an empty set. Please add books to this set first.');
      return;
    }

    try {
      sessionStorage.setItem(
        'sba_preload_syllabus_set',
        JSON.stringify({
          schoolId: selectedSchoolId,
          schoolName: currentSchool?.name || 'Selected School',
          className: selectedClass,
          items: setItems,
        })
      );
      navigate('/pos');
    } catch (err) {
      navigate('/pos');
    }
  };

  // Table Columns for Books in Course Set
  const bookColumns: Column<SyllabusBookItem>[] = [
    {
      key: 'subject',
      header: 'Subject',
      render: (row) => (
        <span className="font-bold text-xs text-[#071F49] bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">
          {row.subject || 'General'}
        </span>
      ),
    },
    {
      key: 'title',
      header: 'Book Title',
      render: (row) => (
        <div>
          <span className="font-bold text-sm text-slate-900 block">{row.title}</span>
          <div className="text-[11px] text-slate-500 mt-0.5">
            {row.publisherName && (
              <span className="font-semibold text-slate-700">{row.publisherName} • </span>
            )}
            {row.seriesName && <span>{row.seriesName} • </span>}
            <span className="font-mono text-slate-400">SKU: {row.sku}</span>
          </div>
        </div>
      ),
    },
    {
      key: 'quantity',
      header: 'Qty',
      align: 'center',
      render: (row) => (
        <div className="flex items-center justify-center gap-1">
          <button
            type="button"
            onClick={() => handleQuantityChange(row.productId, row.quantity - 1)}
            disabled={row.quantity <= 1}
            className="w-6 h-6 flex items-center justify-center rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs disabled:opacity-40"
          >
            -
          </button>
          <span className="font-mono font-bold text-xs w-6 text-center">
            {row.quantity}
          </span>
          <button
            type="button"
            onClick={() => handleQuantityChange(row.productId, row.quantity + 1)}
            className="w-6 h-6 flex items-center justify-center rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs"
          >
            +
          </button>
        </div>
      ),
    },
    {
      key: 'retailPrice',
      header: 'Price (MRP)',
      align: 'right',
      render: (row) => (
        <span className="font-mono text-xs font-semibold text-slate-700">
          {formatCurrency(row.retailPrice)}
        </span>
      ),
    },
    {
      key: 'lineTotal',
      header: 'Total (Rs.)',
      align: 'right',
      render: (row) => (
        <span className="font-mono text-xs font-black text-[#071F49]">
          {formatCurrency(row.retailPrice * row.quantity)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Action',
      align: 'center',
      render: (row) => (
        <button
          type="button"
          onClick={() => handleRemoveBook(row.productId)}
          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
          title="Remove from Set"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      {/* 1. Header Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200/90 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-[#071F49] text-[#F5B51B] rounded-xl shadow-xs">
            <GraduationCap className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-black text-[#071F49]">
              Syllabus & School Course Sets
            </h1>
            <p className="text-xs text-slate-500">
              Board &gt; School &gt; Class book sets with 1-click POS billing & automatic publisher stock deduction
            </p>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex rounded-xl bg-slate-100 p-1 border border-slate-200 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setActiveTab('sets')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition flex items-center gap-1.5 ${
              activeTab === 'sets'
                ? 'bg-white text-[#071F49] shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            Course Sets
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('boards')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition flex items-center gap-1.5 ${
              activeTab === 'boards'
                ? 'bg-white text-[#071F49] shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Building className="w-3.5 h-3.5" />
            Boards ({boards.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('schools')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition flex items-center gap-1.5 ${
              activeTab === 'schools'
                ? 'bg-white text-[#071F49] shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <School className="w-3.5 h-3.5" />
            Schools Directory
          </button>
        </div>
      </div>

      {/* 2. TAB 1: COURSE SETS BUILDER */}
      {activeTab === 'sets' && (
        <div className="space-y-4">
          {/* Cascading Filter Bar: Board > School > Class */}
          <div className="p-4 bg-white border border-slate-200/90 rounded-2xl shadow-xs space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
              {/* Step 1: Select Board */}
              <div className="sm:col-span-5">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                    <Building className="w-3.5 h-3.5 text-[#071F49]" />
                    1. Educational Board:
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingBoard(null);
                      setIsBoardModalOpen(true);
                    }}
                    className="text-[11px] font-bold text-[#071F49] hover:underline"
                  >
                    + Add Board
                  </button>
                </div>
                <select
                  value={selectedBoardId}
                  onChange={(e) => setSelectedBoardId(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-bold text-slate-800 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#071F49] focus:outline-none"
                >
                  {boards.length === 0 && <option value="">No boards added yet</option>}
                  {boards.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} {b.city ? `(${b.city})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Step 2: Select School */}
              <div className="sm:col-span-7">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                    <School className="w-3.5 h-3.5 text-[#071F49]" />
                    2. Affiliated School:
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingSchool(null);
                      setIsSchoolModalOpen(true);
                    }}
                    className="text-[11px] font-bold text-[#071F49] hover:underline"
                  >
                    + Add School
                  </button>
                </div>
                <select
                  value={selectedSchoolId}
                  onChange={(e) => setSelectedSchoolId(e.target.value)}
                  disabled={schools.length === 0}
                  className="w-full px-3 py-2 text-xs font-bold text-slate-800 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#071F49] focus:outline-none disabled:bg-slate-100 disabled:text-slate-400"
                >
                  {schools.length === 0 && (
                    <option value="">No schools registered under this board</option>
                  )}
                  {schools.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} {s.city ? `• ${s.city}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Step 3: Fast Class Selector Pills */}
            <div className="border-t border-slate-100 pt-3">
              <span className="text-xs font-bold text-slate-500 mb-2 block">
                3. Class (NUR, KG, 1ST, 2ND, 3RD...):
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
                          ? 'bg-[#071F49] text-[#F5B51B] shadow-sm scale-105'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {cls}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Active Course Set Workspace */}
          {selectedSchoolId ? (
            <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs overflow-hidden">
              {/* Set Title & Actions Banner */}
              <div className="bg-slate-50 border-b border-slate-200 px-5 py-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-[#071F49] bg-white px-2.5 py-0.5 rounded-md border border-slate-200">
                      {selectedClass}
                    </span>
                    <h2 className="text-base font-black text-slate-900">
                      {currentSchool?.name} Course Book Set
                    </h2>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {setItems.length} Subjects / Books configured • Session: {currentSet?.academicYear || `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`}
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setIsAddBookModalOpen(true)}
                    leftIcon={<Plus className="w-3.5 h-3.5 text-[#071F49]" />}
                  >
                    Add Book to Set
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleSaveSet}
                    isLoading={isSavingSet}
                    leftIcon={<CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
                  >
                    Save Course Set
                  </Button>

                  <Button
                    type="button"
                    variant="gold"
                    size="sm"
                    onClick={handleBillInPOS}
                    disabled={setItems.length === 0}
                    leftIcon={<Receipt className="w-3.5 h-3.5 text-[#071F49]" />}
                  >
                    Bill this Set in POS
                  </Button>
                </div>
              </div>

              {/* Set Totals Summary Indicators */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-4 bg-slate-50/50 border-b border-slate-200">
                <div className="p-3 bg-white border border-slate-200 rounded-xl">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Total Books in Set
                  </span>
                  <div className="text-xl font-black text-[#071F49] font-mono mt-0.5">
                    {formatNumber(setTotals.totalBooks)} Books
                  </div>
                </div>

                <div className="p-3 bg-[#071F49] text-white rounded-xl shadow-xs">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">
                    Complete Set Price (Rs.)
                  </span>
                  <div className="text-xl font-black text-[#F5B51B] font-mono mt-0.5">
                    {formatCurrency(setTotals.totalPrice)}
                  </div>
                </div>

                <div className="col-span-2 sm:col-span-1 p-3 bg-white border border-slate-200 rounded-xl flex items-center justify-between">
                  <div>
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      POS Direct Billing
                    </span>
                    <span className="text-xs text-slate-600 font-bold block mt-0.5">
                      1-Click Instant Cart Fill
                    </span>
                  </div>
                  <Sparkles className="w-5 h-5 text-amber-500" />
                </div>
              </div>

              {/* Books Table */}
              <Table
                columns={bookColumns}
                data={setItems}
                keyExtractor={(item) => item.productId}
                isLoading={isLoadingSet}
                emptyMessage="No books added to this course set yet. Click 'Add Book to Set' to add books from different publishers."
              />
            </div>
          ) : (
            <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 text-slate-500">
              Please register or select a school above to manage its class syllabus book sets.
            </div>
          )}
        </div>
      )}

      {/* 3. TAB 2: EDUCATIONAL BOARDS DIRECTORY */}
      {activeTab === 'boards' && (
        <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h2 className="text-base font-black text-[#071F49]">
                Educational Boards Directory
              </h2>
              <p className="text-xs text-slate-500">
                Boards with which schools in your area are affiliated
              </p>
            </div>
            <Button
              variant="gold"
              size="sm"
              onClick={() => {
                setEditingBoard(null);
                setIsBoardModalOpen(true);
              }}
              leftIcon={<Plus className="w-3.5 h-3.5 text-[#071F49]" />}
            >
              Add New Board
            </Button>
          </div>

          <div className="divide-y divide-slate-100">
            {boards.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs">
                No educational boards registered yet. Click &apos;Add New Board&apos; above.
              </div>
            ) : (
              boards.map((b) => (
                <div key={b.id} className="p-4 flex items-center justify-between hover:bg-slate-50">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-sm text-slate-900">{b.name}</h3>
                      {b.code && (
                        <span className="text-[10px] font-mono font-bold text-[#071F49] bg-slate-100 px-1.5 py-0.5 rounded">
                          {b.code}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {b.city ? `City: ${b.city}` : ''} {b.description ? `• ${b.description}` : ''}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditingBoard(b);
                        setIsBoardModalOpen(true);
                      }}
                      leftIcon={<Edit className="w-3.5 h-3.5" />}
                    >
                      Edit
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* 4. TAB 3: SCHOOLS DIRECTORY */}
      {activeTab === 'schools' && (
        <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-black text-[#071F49]">
                Registered Schools Directory
              </h2>
              <p className="text-xs text-slate-500">
                Schools organized by their affiliated educational boards
              </p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={selectedBoardId}
                onChange={(e) => setSelectedBoardId(e.target.value)}
                className="px-3 py-1.5 text-xs font-bold text-slate-800 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#071F49] focus:outline-none"
              >
                {boards.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>

              <Button
                variant="gold"
                size="sm"
                onClick={() => {
                  setEditingSchool(null);
                  setIsSchoolModalOpen(true);
                }}
                leftIcon={<Plus className="w-3.5 h-3.5 text-[#071F49]" />}
              >
                Add School
              </Button>
            </div>
          </div>

          <div className="divide-y divide-slate-100">
            {schools.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs">
                No schools found for this board. Click &apos;Add School&apos; above.
              </div>
            ) : (
              schools.map((s) => (
                <div key={s.id} className="p-4 flex items-center justify-between hover:bg-slate-50">
                  <div>
                    <h3 className="font-bold text-sm text-slate-900">{s.name}</h3>
                    <div className="text-xs text-slate-500 mt-0.5">
                      Board: <span className="font-semibold text-slate-700">{s.boardName}</span>
                      {s.city ? ` • City: ${s.city}` : ''}
                      {s.contactPerson ? ` • Contact: ${s.contactPerson}` : ''}
                      {s.phone ? ` • Phone: ${s.phone}` : ''}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setSelectedSchoolId(s.id);
                        setActiveTab('sets');
                      }}
                      leftIcon={<BookOpen className="w-3.5 h-3.5" />}
                    >
                      Manage Sets
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEditingSchool(s);
                        setIsSchoolModalOpen(true);
                      }}
                      leftIcon={<Edit className="w-3.5 h-3.5" />}
                    >
                      Edit
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* 5. Modals */}
      <BoardModal
        isOpen={isBoardModalOpen}
        onClose={() => {
          setIsBoardModalOpen(false);
          setEditingBoard(null);
        }}
        editingBoard={editingBoard}
        onSaved={loadBoards}
      />

      <SchoolModal
        isOpen={isSchoolModalOpen}
        onClose={() => {
          setIsSchoolModalOpen(false);
          setEditingSchool(null);
        }}
        boards={boards}
        initialBoardId={selectedBoardId}
        editingSchool={editingSchool}
        onSaved={loadSchools}
      />

      <AddBookToSetModal
        isOpen={isAddBookModalOpen}
        onClose={() => setIsAddBookModalOpen(false)}
        className={selectedClass}
        schoolName={currentSchool?.name || 'Selected School'}
        onAddBook={handleAddBookToSet}
      />
    </div>
  );
};
