import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  limit,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type {
  EducationalBoardDocument,
  SchoolDocument,
  SyllabusSetDocument,
  SyllabusBookItem,
  ProductDocument,
} from '../types/database';
import { logAuditEvent } from './auditService';

export const BOARDS_COLLECTION = 'boards';
export const SCHOOLS_COLLECTION = 'schools';
export const SYLLABUS_SETS_COLLECTION = 'syllabusSets';

export const STANDARD_CLASSES = [
  'Play Group',
  'Nursery',
  'Prep / KG',
  'Class 1',
  'Class 2',
  'Class 3',
  'Class 4',
  'Class 5',
  'Class 6',
  'Class 7',
  'Class 8',
  'Class 9',
  'Class 10',
] as const;

export const COMMON_SUBJECTS = [
  'Urdu',
  'English',
  'Mathematics',
  'General Science',
  'Islamiat',
  'Social Studies / Pak Studies',
  'Computer Science',
  'General Knowledge',
  'Drawing / Art',
  'Arabic',
  'Other / Supplementary',
] as const;

// ---------------------------------------------------------------------------------
// 1. EDUCATIONAL BOARDS MANAGEMENT
// ---------------------------------------------------------------------------------

export interface CreateBoardInput {
  name: string;
  code?: string;
  city?: string;
  description?: string;
}

export interface UpdateBoardInput {
  name?: string;
  code?: string;
  city?: string;
  description?: string;
  isActive?: boolean;
}

export const normalizeName = (name: string): string => {
  return (name || '').replace(/\s+/g, ' ').trim().toLowerCase();
};

/**
 * Fetches all educational boards.
 */
export const getBoards = async (onlyActive = false): Promise<EducationalBoardDocument[]> => {
  if (!db) return [];

  try {
    const q = onlyActive
      ? query(collection(db, BOARDS_COLLECTION), where('isActive', '==', true))
      : query(collection(db, BOARDS_COLLECTION));
    const snap = await getDocs(q);

    const boards: EducationalBoardDocument[] = snap.docs.map((d) => ({
      ...(d.data() as EducationalBoardDocument),
      id: d.id,
    }));

    boards.sort((a, b) => a.name.localeCompare(b.name));
    return boards;
  } catch (err) {
    console.error('Failed to fetch boards:', err);
    return [];
  }
};

/**
 * Creates a new educational board.
 */
export const createBoard = async (
  input: CreateBoardInput,
  userId = 'system',
  userEmail = 'admin@sadiqbookagency.com'
): Promise<EducationalBoardDocument> => {
  if (!db) throw new Error('Firestore not initialized');
  if (!input.name || !input.name.trim()) {
    throw new Error('Board name is required.');
  }

  const cleanName = input.name.trim();
  const normalized = normalizeName(cleanName);

  // Check duplicates
  const existing = await getBoards();
  if (existing.some((b) => normalizeName(b.name) === normalized)) {
    throw new Error(`An educational board named "${cleanName}" already exists.`);
  }

  const boardRef = doc(collection(db, BOARDS_COLLECTION));
  const now = new Date().toISOString();

  const newBoard: EducationalBoardDocument = {
    id: boardRef.id,
    name: cleanName,
    code: input.code?.trim().toUpperCase() || undefined,
    city: input.city?.trim() || undefined,
    description: input.description?.trim() || undefined,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    createdByUserId: userId,
  };

  await setDoc(boardRef, newBoard);

  await logAuditEvent(
    'BOARD_CREATED',
    BOARDS_COLLECTION,
    JSON.stringify({ boardId: boardRef.id, name: cleanName }),
    boardRef.id,
    userId,
    userEmail
  );

  return newBoard;
};

/**
 * Updates an educational board.
 */
export const updateBoard = async (
  id: string,
  updates: UpdateBoardInput,
  userId = 'system',
  userEmail = 'admin@sadiqbookagency.com'
): Promise<void> => {
  if (!db) throw new Error('Firestore not initialized');

  const boardRef = doc(db, BOARDS_COLLECTION, id);
  const snap = await getDoc(boardRef);
  if (!snap.exists()) {
    throw new Error('Educational board not found.');
  }

  const now = new Date().toISOString();
  const updateData: any = {
    ...updates,
    updatedAt: now,
  };

  if (updates.name) updateData.name = updates.name.trim();
  if (updates.code) updateData.code = updates.code.trim().toUpperCase();

  await updateDoc(boardRef, updateData);

  await logAuditEvent(
    'BOARD_UPDATED',
    BOARDS_COLLECTION,
    JSON.stringify({ boardId: id, updates }),
    id,
    userId,
    userEmail
  );
};

// ---------------------------------------------------------------------------------
// 2. SCHOOLS MANAGEMENT
// ---------------------------------------------------------------------------------

export interface CreateSchoolInput {
  boardId: string;
  name: string;
  phone?: string;
  address?: string;
  city?: string;
  contactPerson?: string;
}

export interface UpdateSchoolInput {
  name?: string;
  phone?: string;
  address?: string;
  city?: string;
  contactPerson?: string;
  isActive?: boolean;
}

/**
 * Fetches schools, optionally filtered by board.
 */
export const getSchools = async (
  boardId?: string,
  onlyActive = false
): Promise<SchoolDocument[]> => {
  if (!db) return [];

  try {
    const constraints: any[] = [];
    if (boardId && boardId !== 'all') {
      constraints.push(where('boardId', '==', boardId));
    }
    if (onlyActive) {
      constraints.push(where('isActive', '==', true));
    }

    const q = constraints.length > 0
      ? query(collection(db, SCHOOLS_COLLECTION), ...constraints)
      : query(collection(db, SCHOOLS_COLLECTION));

    const snap = await getDocs(q);
    const schools: SchoolDocument[] = snap.docs.map((d) => ({
      ...(d.data() as SchoolDocument),
      id: d.id,
    }));

    schools.sort((a, b) => a.name.localeCompare(b.name));
    return schools;
  } catch (err) {
    console.error('Failed to fetch schools:', err);
    return [];
  }
};

/**
 * Creates a new school under a specific board.
 */
export const createSchool = async (
  input: CreateSchoolInput,
  userId = 'system',
  userEmail = 'admin@sadiqbookagency.com'
): Promise<SchoolDocument> => {
  if (!db) throw new Error('Firestore not initialized');
  if (!input.boardId) throw new Error('Board selection is required.');
  if (!input.name || !input.name.trim()) throw new Error('School name is required.');

  // Verify board exists
  const boardRef = doc(db, BOARDS_COLLECTION, input.boardId);
  const boardSnap = await getDoc(boardRef);
  if (!boardSnap.exists()) {
    throw new Error('Selected educational board does not exist.');
  }
  const boardData = boardSnap.data() as EducationalBoardDocument;

  const cleanName = input.name.trim();
  const normalized = normalizeName(cleanName);

  // Check duplicate school under same board
  const existing = await getSchools(input.boardId);
  if (existing.some((s) => normalizeName(s.name) === normalized)) {
    throw new Error(`A school named "${cleanName}" already exists under ${boardData.name}.`);
  }

  const schoolRef = doc(collection(db, SCHOOLS_COLLECTION));
  const now = new Date().toISOString();

  const newSchool: SchoolDocument = {
    id: schoolRef.id,
    boardId: input.boardId,
    boardName: boardData.name,
    name: cleanName,
    phone: input.phone?.trim() || undefined,
    address: input.address?.trim() || undefined,
    city: input.city?.trim() || boardData.city || undefined,
    contactPerson: input.contactPerson?.trim() || undefined,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    createdByUserId: userId,
  };

  await setDoc(schoolRef, newSchool);

  await logAuditEvent(
    'SCHOOL_CREATED',
    SCHOOLS_COLLECTION,
    JSON.stringify({ schoolId: schoolRef.id, name: cleanName, boardId: input.boardId }),
    schoolRef.id,
    userId,
    userEmail
  );

  return newSchool;
};

/**
 * Updates a school.
 */
export const updateSchool = async (
  id: string,
  updates: UpdateSchoolInput,
  userId = 'system',
  userEmail = 'admin@sadiqbookagency.com'
): Promise<void> => {
  if (!db) throw new Error('Firestore not initialized');

  const schoolRef = doc(db, SCHOOLS_COLLECTION, id);
  const snap = await getDoc(schoolRef);
  if (!snap.exists()) {
    throw new Error('School not found.');
  }

  const now = new Date().toISOString();
  const updateData: any = {
    ...updates,
    updatedAt: now,
  };

  if (updates.name) updateData.name = updates.name.trim();

  await updateDoc(schoolRef, updateData);

  await logAuditEvent(
    'SCHOOL_UPDATED',
    SCHOOLS_COLLECTION,
    JSON.stringify({ schoolId: id, updates }),
    id,
    userId,
    userEmail
  );
};

// ---------------------------------------------------------------------------------
// 3. SYLLABUS / COURSE SETS MANAGEMENT
// ---------------------------------------------------------------------------------

export interface SaveSyllabusSetInput {
  boardId: string;
  schoolId: string;
  className: string;
  academicYear?: string;
  items: SyllabusBookItem[];
  notes?: string;
}

/**
 * Generates a deterministic ID for a school syllabus set.
 */
export const generateSyllabusSetId = (schoolId: string, className: string): string => {
  const cleanClass = className.toLowerCase().replace(/[^a-z0-9]/g, '_');
  return `syl_${schoolId}_${cleanClass}`;
};

/**
 * Fetches syllabus sets with optional filters.
 */
export const getSyllabusSets = async (filters: {
  boardId?: string;
  schoolId?: string;
  className?: string;
  onlyActive?: boolean;
} = {}): Promise<SyllabusSetDocument[]> => {
  if (!db) return [];

  try {
    const constraints: any[] = [];
    if (filters.boardId && filters.boardId !== 'all') {
      constraints.push(where('boardId', '==', filters.boardId));
    }
    if (filters.schoolId && filters.schoolId !== 'all') {
      constraints.push(where('schoolId', '==', filters.schoolId));
    }
    if (filters.className && filters.className !== 'all') {
      constraints.push(where('className', '==', filters.className));
    }
    if (filters.onlyActive) {
      constraints.push(where('isActive', '==', true));
    }

    const q = constraints.length > 0
      ? query(collection(db, SYLLABUS_SETS_COLLECTION), ...constraints)
      : query(collection(db, SYLLABUS_SETS_COLLECTION));

    const snap = await getDocs(q);
    const sets: SyllabusSetDocument[] = snap.docs.map((d) => ({
      ...(d.data() as SyllabusSetDocument),
      id: d.id,
    }));

    return sets;
  } catch (err) {
    console.error('Failed to fetch syllabus sets:', err);
    return [];
  }
};

/**
 * Fetches a single syllabus set by schoolId and className.
 */
export const getSyllabusSetBySchoolAndClass = async (
  schoolId: string,
  className: string
): Promise<SyllabusSetDocument | null> => {
  if (!db || !schoolId || !className) return null;

  try {
    const setId = generateSyllabusSetId(schoolId, className);
    const setRef = doc(db, SYLLABUS_SETS_COLLECTION, setId);
    const snap = await getDoc(setRef);

    if (snap.exists()) {
      return snap.data() as SyllabusSetDocument;
    }

    // Fallback query if id was custom
    const q = query(
      collection(db, SYLLABUS_SETS_COLLECTION),
      where('schoolId', '==', schoolId),
      where('className', '==', className),
      limit(1)
    );
    const qSnap = await getDocs(q);
    if (!qSnap.empty) {
      return qSnap.docs[0].data() as SyllabusSetDocument;
    }

    return null;
  } catch (err) {
    console.error('Failed to fetch syllabus set:', err);
    return null;
  }
};

/**
 * Saves (creates or updates) a complete Syllabus / Course Set for a School & Class.
 */
export const saveSyllabusSet = async (
  input: SaveSyllabusSetInput,
  userId = 'system',
  userEmail = 'admin@sadiqbookagency.com'
): Promise<SyllabusSetDocument> => {
  if (!db) throw new Error('Firestore not initialized');
  if (!input.boardId) throw new Error('Board is required.');
  if (!input.schoolId) throw new Error('School is required.');
  if (!input.className || !input.className.trim()) throw new Error('Class name is required.');

  // Fetch school details
  const schoolRef = doc(db, SCHOOLS_COLLECTION, input.schoolId);
  const schoolSnap = await getDoc(schoolRef);
  if (!schoolSnap.exists()) throw new Error('School not found.');
  const schoolData = schoolSnap.data() as SchoolDocument;

  // Compute set totals
  const totalBooks = (input.items || []).reduce((acc, item) => acc + (Number(item.quantity) || 1), 0);
  const totalSetPrice = (input.items || []).reduce(
    (acc, item) => acc + (Number(item.retailPrice) || 0) * (Number(item.quantity) || 1),
    0
  );

  const setId = generateSyllabusSetId(input.schoolId, input.className.trim());
  const setRef = doc(db, SYLLABUS_SETS_COLLECTION, setId);
  const now = new Date().toISOString();

  const docData: SyllabusSetDocument = {
    id: setId,
    boardId: input.boardId,
    boardName: schoolData.boardName,
    schoolId: input.schoolId,
    schoolName: schoolData.name,
    className: input.className.trim(),
    academicYear: input.academicYear?.trim() || `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`,
    items: input.items || [],
    totalBooks,
    totalSetPrice: Math.round(totalSetPrice * 100) / 100,
    notes: input.notes?.trim() || undefined,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    createdByUserId: userId,
  };

  await setDoc(setRef, docData, { merge: true });

  await logAuditEvent(
    'SYLLABUS_SET_SAVED',
    SYLLABUS_SETS_COLLECTION,
    JSON.stringify({
      setId,
      schoolName: schoolData.name,
      className: input.className,
      totalBooks,
      totalSetPrice,
    }),
    setId,
    userId,
    userEmail
  );

  return docData;
};

/**
 * Loads a syllabus set and refreshes live catalog prices & stock for POS cart billing.
 */
export const getSyllabusSetForPOS = async (
  schoolId: string,
  className: string
): Promise<{
  set: SyllabusSetDocument;
  liveItems: Array<{
    product: ProductDocument;
    quantity: number;
    subject?: string;
    inStock: boolean;
    availableStock: number;
  }>;
} | null> => {
  if (!db) return null;

  const setDocData = await getSyllabusSetBySchoolAndClass(schoolId, className);
  if (!setDocData || !setDocData.items || setDocData.items.length === 0) {
    return null;
  }

  // Load fresh product documents from 'products' collection
  const liveItems: Array<{
    product: ProductDocument;
    quantity: number;
    subject?: string;
    inStock: boolean;
    availableStock: number;
  }> = [];

  for (const item of setDocData.items) {
    try {
      const prodRef = doc(db, 'products', item.productId);
      const prodSnap = await getDoc(prodRef);
      if (prodSnap.exists()) {
        const prod = prodSnap.data() as ProductDocument;
        const available = Number(prod.currentStock) || 0;
        liveItems.push({
          product: { ...prod, id: prodSnap.id },
          quantity: item.quantity || 1,
          subject: item.subject,
          inStock: available >= (item.quantity || 1),
          availableStock: available,
        });
      }
    } catch (err) {
      console.warn(`Failed to load product ${item.productId} for POS set:`, err);
    }
  }

  return {
    set: setDocData,
    liveItems,
  };
};
