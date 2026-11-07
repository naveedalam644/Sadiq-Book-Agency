import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type {
  RoughBillDocument,
  RoughBillItem,
  RoughBillType,
} from '../types/database';
import { logAuditEvent } from './auditService';

export const ROUGH_BILLS_COLLECTION = 'roughBills';

export interface CreateRoughBillInput {
  id?: string;
  billType: RoughBillType;
  title: string;
  partyName: string;
  phone?: string;
  date?: string;
  items: RoughBillItem[];
  notes?: string;
}

export interface RoughBillFilters {
  billType?: RoughBillType | 'all';
  status?: string;
  searchTerm?: string;
}

/**
 * Generates sequential daily rough bill number.
 * e.g., EST-261107-001 (Customer Estimate) or ORD-261107-001 (Publisher Order)
 */
export const generateRoughBillNumber = (type: RoughBillType): string => {
  const prefix = type === 'publisher_order' ? 'ORD' : 'EST';
  const d = new Date();
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${yy}${mm}${dd}-${rand}`;
};

/**
 * Fetches rough bills with optional filtering.
 */
export const getRoughBills = async (
  filters: RoughBillFilters = {}
): Promise<RoughBillDocument[]> => {
  if (!db) return [];

  try {
    const coll = collection(db, ROUGH_BILLS_COLLECTION);
    const constraints: any[] = [];

    if (filters.billType && filters.billType !== 'all') {
      constraints.push(where('billType', '==', filters.billType));
    }

    const q = constraints.length > 0 ? query(coll, ...constraints) : query(coll);
    const snap = await getDocs(q);

    let bills: RoughBillDocument[] = snap.docs.map((d) => ({
      ...(d.data() as RoughBillDocument),
      id: d.id,
    }));

    // In-memory filter for search
    if (filters.searchTerm && filters.searchTerm.trim()) {
      const term = filters.searchTerm.trim().toLowerCase();
      bills = bills.filter((b) => {
        return (
          (b.billNo || '').toLowerCase().includes(term) ||
          (b.title || '').toLowerCase().includes(term) ||
          (b.partyName || '').toLowerCase().includes(term) ||
          (b.phone || '').includes(term)
        );
      });
    }

    // Sort by date descending
    bills.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return bills;
  } catch (err) {
    console.error('Failed to fetch rough bills:', err);
    return [];
  }
};

/**
 * Fetches a single rough bill by ID.
 */
export const getRoughBillById = async (id: string): Promise<RoughBillDocument | null> => {
  if (!db || !id) return null;

  try {
    const snap = await getDoc(doc(db, ROUGH_BILLS_COLLECTION, id));
    if (snap.exists()) {
      return { ...(snap.data() as RoughBillDocument), id: snap.id };
    }
    return null;
  } catch (err) {
    console.error('Failed to fetch rough bill:', err);
    return null;
  }
};

/**
 * Authoritatively saves (creates or updates) a rough bill.
 *
 * CRITICAL INVARIANTS:
 * 1. Physical shop inventory ('currentStock') is NEVER deducted.
 * 2. Customer Khata / balance is NEVER debited or altered.
 * 3. Financial accounting and daily closing are completely unaffected.
 */
export const saveRoughBill = async (
  input: CreateRoughBillInput,
  userId = 'system',
  userEmail = 'admin@sadiqbookagency.com'
): Promise<RoughBillDocument> => {
  if (!db) throw new Error('Firestore not initialized');
  if (!input.partyName || !input.partyName.trim()) {
    throw new Error('Customer or Publisher name is required.');
  }
  if (!input.items || input.items.length === 0) {
    throw new Error('Rough bill must contain at least one item.');
  }

  // Calculate totals
  let subtotal = 0;
  let totalDiscount = 0;

  const processedItems: RoughBillItem[] = input.items.map((item) => {
    const qty = Math.max(1, Number(item.quantity) || 1);
    const unitPrice = Math.max(0, Number(item.unitPrice) || 0);
    const discPercent = Math.max(0, Math.min(100, Number(item.discountPercent) || 0));
    const discAmount = Math.round((unitPrice * (discPercent / 100)) * 100) / 100;
    const effectiveRate = Math.max(0, unitPrice - discAmount);
    const lineTotal = Math.round(effectiveRate * qty * 100) / 100;

    subtotal += Math.round(unitPrice * qty * 100) / 100;
    totalDiscount += Math.round(discAmount * qty * 100) / 100;

    return {
      productId: item.productId,
      title: item.title,
      sku: item.sku,
      publisherName: item.publisherName,
      seriesName: item.seriesName,
      quantity: qty,
      unitPrice,
      discountPercent: discPercent,
      costPrice: item.costPrice,
      lineTotal,
    };
  });

  const grandTotal = Math.max(0, Math.round((subtotal - totalDiscount) * 100) / 100);
  const now = new Date().toISOString();
  const billDate = input.date || now.split('T')[0];

  const docId = input.id || doc(collection(db, ROUGH_BILLS_COLLECTION)).id;
  const billRef = doc(db, ROUGH_BILLS_COLLECTION, docId);

  const billNo = input.id ? (await getRoughBillById(input.id))?.billNo || generateRoughBillNumber(input.billType) : generateRoughBillNumber(input.billType);

  const docData: RoughBillDocument = {
    id: docId,
    billNo,
    billType: input.billType,
    title: input.title?.trim() || (input.billType === 'publisher_order' ? `Order for ${input.partyName}` : `Quotation for ${input.partyName}`),
    partyName: input.partyName.trim(),
    phone: input.phone?.trim() || undefined,
    date: billDate,
    items: processedItems,
    subtotal: Math.round(subtotal * 100) / 100,
    totalDiscount: Math.round(totalDiscount * 100) / 100,
    grandTotal,
    notes: input.notes?.trim() || undefined,
    status: 'draft',
    createdAt: now,
    updatedAt: now,
    createdByUserId: userId,
  };

  await setDoc(billRef, docData, { merge: true });

  await logAuditEvent(
    'ROUGH_BILL_SAVED',
    ROUGH_BILLS_COLLECTION,
    JSON.stringify({
      billNo,
      partyName: docData.partyName,
      billType: docData.billType,
      grandTotal: docData.grandTotal,
      itemCount: docData.items.length,
    }),
    docId,
    userId,
    userEmail
  );

  return docData;
};

/**
 * Deletes a rough bill.
 */
export const deleteRoughBill = async (
  id: string,
  userId = 'system',
  userEmail = 'admin@sadiqbookagency.com'
): Promise<void> => {
  if (!db || !id) return;

  const billRef = doc(db, ROUGH_BILLS_COLLECTION, id);
  await deleteDoc(billRef);

  await logAuditEvent(
    'ROUGH_BILL_DELETED',
    ROUGH_BILLS_COLLECTION,
    JSON.stringify({ billId: id }),
    id,
    userId,
    userEmail
  );
};

/**
 * Marks a rough bill as converted into an authoritative POS sale.
 */
export const markRoughBillAsConverted = async (
  id: string,
  saleInvoiceNo: string,
  userId = 'system',
  userEmail = 'admin@sadiqbookagency.com'
): Promise<void> => {
  if (!db || !id) return;

  const billRef = doc(db, ROUGH_BILLS_COLLECTION, id);
  const now = new Date().toISOString();

  await updateDoc(billRef, {
    status: 'converted',
    convertedSaleInvoiceNo: saleInvoiceNo,
    updatedAt: now,
  });

  await logAuditEvent(
    'ROUGH_BILL_CONVERTED_TO_SALE',
    ROUGH_BILLS_COLLECTION,
    JSON.stringify({ billId: id, saleInvoiceNo }),
    id,
    userId,
    userEmail
  );
};
