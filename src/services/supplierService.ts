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
  startAfter,
  runTransaction,
  type QueryDocumentSnapshot,
  type DocumentData,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type { SupplierDocument, PurchaseDocument, PaymentDocument } from '../types/database';
import type { RecordSupplierPaymentInput } from '../types/reports';
import { logAuditEvent } from './auditService';
import { updateInventorySummaryDeltas } from './summaryService';

export interface SupplierFilters {
  status?: 'all' | 'active' | 'inactive';
  searchTerm?: string;
}

export interface PaginatedSuppliersResult {
  suppliers: SupplierDocument[];
  lastDoc: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
}

export const SUPPLIER_PAGE_SIZE = 25;

let cachedActiveSuppliers: SupplierDocument[] | null = null;
let lastSuppliersCacheTime = 0;
const SUPPLIERS_CACHE_TTL = 3 * 60 * 1000; // 3 mins

export const invalidateSuppliersCache = () => {
  cachedActiveSuppliers = null;
  lastSuppliersCacheTime = 0;
};

export const getActiveSuppliersForDropdown = async (forceRefresh = false): Promise<SupplierDocument[]> => {
  const now = Date.now();
  if (!forceRefresh && cachedActiveSuppliers && now - lastSuppliersCacheTime < SUPPLIERS_CACHE_TTL) {
    return cachedActiveSuppliers;
  }

  if (!db) return [];

  try {
    const q = query(collection(db, 'suppliers'), where('isActive', '==', true), limit(50));
    const snap = await getDocs(q);

    const suppliers: SupplierDocument[] = snap.docs.map((d) => ({
      ...(d.data() as SupplierDocument),
      id: d.id,
    }));

    suppliers.sort((a, b) => a.companyName.localeCompare(b.companyName));

    cachedActiveSuppliers = suppliers;
    lastSuppliersCacheTime = now;
    return suppliers;
  } catch (err) {
    console.error('Error fetching suppliers for dropdown:', err);
    return cachedActiveSuppliers || [];
  }
};

export const getSuppliersPaginated = async (
  filters: SupplierFilters = {},
  cursorDoc: QueryDocumentSnapshot<DocumentData> | null = null,
  pageSize = SUPPLIER_PAGE_SIZE
): Promise<PaginatedSuppliersResult> => {
  if (!db) {
    return { suppliers: [], lastDoc: null, hasMore: false };
  }

  try {
    const suppliersRef = collection(db, 'suppliers');
    let qConstraints: any[] = [];

    if (filters.status === 'active') {
      qConstraints.push(where('isActive', '==', true));
    } else if (filters.status === 'inactive') {
      qConstraints.push(where('isActive', '==', false));
    }

    if (cursorDoc) {
      qConstraints.push(startAfter(cursorDoc));
    }

    qConstraints.push(limit(pageSize + 1));

    const q = query(suppliersRef, ...qConstraints);
    const snap = await getDocs(q);

    let docs = snap.docs;
    const hasMore = docs.length > pageSize;
    if (hasMore) {
      docs = docs.slice(0, pageSize);
    }

    let suppliers: SupplierDocument[] = docs.map((d) => ({
      ...(d.data() as SupplierDocument),
      id: d.id,
    }));

    if (filters.searchTerm && filters.searchTerm.trim()) {
      const term = filters.searchTerm.trim().toLowerCase();
      suppliers = suppliers.filter(
        (s) =>
          s.companyName.toLowerCase().includes(term) ||
          s.contactPerson.toLowerCase().includes(term) ||
          s.phone.toLowerCase().includes(term) ||
          (s.email && s.email.toLowerCase().includes(term))
      );
    }

    const lastDoc = docs.length > 0 ? docs[docs.length - 1] : null;

    return {
      suppliers,
      lastDoc,
      hasMore,
    };
  } catch (err) {
    console.error('Error fetching paginated suppliers:', err);
    return { suppliers: [], lastDoc: null, hasMore: false };
  }
};

export const getSupplierById = async (id: string): Promise<SupplierDocument | null> => {
  if (!db || !id) return null;

  try {
    const docRef = doc(db, 'suppliers', id);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return null;
    return { ...(snap.data() as SupplierDocument), id: snap.id };
  } catch (err) {
    console.error(`Error fetching supplier ${id}:`, err);
    return null;
  }
};

export const getSupplierPurchases = async (
  supplierId: string,
  limitCount = 20
): Promise<PurchaseDocument[]> => {
  if (!db || !supplierId) return [];

  try {
    const q = query(
      collection(db, 'purchases'),
      where('supplierId', '==', supplierId),
      limit(limitCount)
    );
    const snap = await getDocs(q);

    const list: PurchaseDocument[] = snap.docs.map((d) => ({
      ...(d.data() as PurchaseDocument),
      id: d.id,
    }));

    list.sort((a, b) => new Date(b.purchaseDate).getTime() - new Date(a.purchaseDate).getTime());
    return list;
  } catch (err) {
    console.error('Error fetching supplier purchases:', err);
    return [];
  }
};

export interface CreateSupplierInput {
  companyName: string;
  contactPerson: string;
  phone: string;
  email?: string;
  address?: string;
  currentBalance?: number;
  isActive?: boolean;
}

export const createSupplier = async (
  input: CreateSupplierInput,
  userId = 'system',
  userEmail = 'admin@sadiqbookagency.com'
): Promise<SupplierDocument> => {
  if (!db) throw new Error('Firestore not initialized');

  const supRef = doc(collection(db, 'suppliers'));
  const now = new Date().toISOString();

  const newSupplier: SupplierDocument = {
    id: supRef.id,
    companyName: input.companyName.trim(),
    contactPerson: input.contactPerson.trim(),
    phone: input.phone.trim(),
    email: input.email?.trim() || '',
    address: input.address?.trim() || '',
    currentBalance: Number(input.currentBalance) || 0,
    isActive: input.isActive !== false,
    createdAt: now,
  };

  await setDoc(supRef, newSupplier);
  invalidateSuppliersCache();

  if (newSupplier.isActive) {
    await updateInventorySummaryDeltas({ suppliersDelta: 1 });
  }

  await logAuditEvent(
    'CREATE_SUPPLIER',
    'suppliers',
    `Created supplier: ${newSupplier.companyName} (${newSupplier.contactPerson})`,
    newSupplier.id,
    userId,
    userEmail
  );

  return newSupplier;
};

export const updateSupplier = async (
  id: string,
  updates: Partial<CreateSupplierInput>,
  userId = 'system',
  userEmail = 'admin@sadiqbookagency.com'
): Promise<SupplierDocument> => {
  if (!db) throw new Error('Firestore not initialized');

  const existing = await getSupplierById(id);
  if (!existing) throw new Error('Supplier not found');

  const supRef = doc(db, 'suppliers', id);
  const updatedData: Partial<SupplierDocument> = {
    ...updates,
    ...(updates.companyName && { companyName: updates.companyName.trim() }),
    ...(updates.contactPerson && { contactPerson: updates.contactPerson.trim() }),
    ...(updates.phone && { phone: updates.phone.trim() }),
    ...(updates.email !== undefined && { email: updates.email.trim() }),
    ...(updates.address !== undefined && { address: updates.address.trim() }),
    ...(updates.currentBalance !== undefined && { currentBalance: Number(updates.currentBalance) }),
  };

  await updateDoc(supRef, updatedData);
  invalidateSuppliersCache();

  await logAuditEvent(
    'UPDATE_SUPPLIER',
    'suppliers',
    `Updated supplier: ${updates.companyName || existing.companyName}`,
    id,
    userId,
    userEmail
  );

  return { ...existing, ...updatedData } as SupplierDocument;
};

export const toggleSupplierStatus = async (
  id: string,
  isActive: boolean,
  userId = 'system',
  userEmail = 'admin@sadiqbookagency.com'
): Promise<void> => {
  if (!db) return;

  const supRef = doc(db, 'suppliers', id);
  await updateDoc(supRef, { isActive });
  invalidateSuppliersCache();

  await updateInventorySummaryDeltas({
    suppliersDelta: isActive ? 1 : -1,
  });

  await logAuditEvent(
    'TOGGLE_SUPPLIER_STATUS',
    'suppliers',
    `Supplier ${id} marked as ${isActive ? 'Active' : 'Inactive'}`,
    id,
    userId,
    userEmail
  );
};

/**
 * ---------------------------------------------------------------------------------
 * FIRESTORE COST ACCOUNTING:
 * Operation: Record Supplier Khata / Settlement Payment
 * Transaction Reads: Exactly 1 document read (suppliers/{supplierId})
 * Transaction Writes: Exactly 2 writes (suppliers update + payments create)
 * Audit Logs: 1 write (asynchronous outside transaction)
 * Total Reads: 1 | Total Writes: 3
 * ---------------------------------------------------------------------------------
 */
export const recordSupplierPaymentTransaction = async (
  input: RecordSupplierPaymentInput,
  userId = 'system',
  userEmail = 'admin@sadiqbookagency.com'
): Promise<{
  newBalance: number;
  receiptNo: string;
  paymentId: string;
}> => {
  if (!db) throw new Error('Firestore not initialized');
  if (!input.supplierId) throw new Error('Supplier ID is required');

  const paymentAmount = Number(input.amount);
  if (isNaN(paymentAmount) || paymentAmount <= 0) {
    throw new Error('Payment amount must be a positive number');
  }

  const supplierRef = doc(db, 'suppliers', input.supplierId);
  const paymentRef = doc(collection(db, 'payments'));
  const now = new Date().toISOString();
  const paymentDate = input.paymentDate || now.split('T')[0];

  const receiptNo =
    input.receiptNo?.trim() ||
    `SUP-PAY-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

  let finalBalance = 0;
  let supplierName = 'Supplier';

  await runTransaction(db, async (transaction) => {
    const supplierSnap = await transaction.get(supplierRef);
    if (!supplierSnap.exists()) {
      throw new Error(`Supplier with ID ${input.supplierId} not found.`);
    }

    const supplierData = supplierSnap.data() as SupplierDocument;
    supplierName = supplierData.companyName;
    const previousBalance = Number(supplierData.currentBalance) || 0;

    // Supplier settlement payment decreases the debt owed to supplier
    finalBalance = Math.round((previousBalance - paymentAmount) * 100) / 100;

    // 1. Transaction Write: Decrement supplier payable balance
    transaction.update(supplierRef, {
      currentBalance: finalBalance,
    });

    // 2. Transaction Write: Append-only payment document
    const paymentDoc: PaymentDocument = {
      id: paymentRef.id,
      receiptNo,
      targetType: 'supplier_payable',
      referenceId: input.supplierId,
      partyName: supplierName,
      amount: paymentAmount,
      paymentMode: input.paymentMode,
      transactionReference: input.transactionReference?.trim() || '',
      receivedByUserId: userId,
      paymentDate,
      notes: input.notes?.trim() || '',
      createdAt: now,
    };
    transaction.set(paymentRef, paymentDoc);
  });

  invalidateSuppliersCache();

  try {
    const { invalidateFinancialReportsCache } = await import('./financialReportService');
    invalidateFinancialReportsCache();
  } catch {
    // Graceful fallback for non-browser or test runner environments
  }

  await logAuditEvent(
    'SUPPLIER_PAYMENT',
    'suppliers',
    `Recorded payment of PKR ${paymentAmount} to ${supplierName} (Receipt: ${receiptNo}, Mode: ${input.paymentMode})`,
    input.supplierId,
    userId,
    userEmail
  );

  return {
    newBalance: finalBalance,
    receiptNo,
    paymentId: paymentRef.id,
  };
};

