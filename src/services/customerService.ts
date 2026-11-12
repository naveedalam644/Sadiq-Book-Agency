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
  type QueryDocumentSnapshot,
  type DocumentData,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type { CustomerDocument, CustomerType } from '../types/database';
import { logAuditEvent } from './auditService';
import { setCustomerOpeningBalanceTransaction } from './ledgerService';
import {
  generatePortalCode,
  generateDefaultPortalPin,
  syncCustomerPortal,
} from './customerPortalService';

export interface CustomerFilters {
  type?: CustomerType | 'all';
  status?: 'all' | 'active' | 'inactive';
  balanceStatus?: 'all' | 'has_balance' | 'zero_balance' | 'advance';
  searchTerm?: string;
}

export interface PaginatedCustomersResult {
  customers: CustomerDocument[];
  lastDoc: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
}

export const CUSTOMER_PAGE_SIZE = 25;

// In-memory cache for POS customer selection dropdowns
let cachedActiveCustomers: CustomerDocument[] | null = null;
let lastCustomerCacheTime = 0;
const CUSTOMER_CACHE_TTL = 3 * 60 * 1000; // 3 minutes TTL

export const invalidateCustomerCache = () => {
  cachedActiveCustomers = null;
  lastCustomerCacheTime = 0;
};

export const getActiveCustomersForDropdown = async (
  forceRefresh = false,
  type?: CustomerType
): Promise<CustomerDocument[]> => {
  const now = Date.now();
  if (!forceRefresh && cachedActiveCustomers && now - lastCustomerCacheTime < CUSTOMER_CACHE_TTL) {
    if (type) {
      return cachedActiveCustomers.filter((c) => c.type === type);
    }
    return cachedActiveCustomers;
  }

  if (!db) return [];

  try {
    const q = query(
      collection(db, 'customers'),
      where('isActive', '==', true),
      limit(100)
    );
    const snap = await getDocs(q);

    const customers: CustomerDocument[] = snap.docs.map((d) => ({
      ...(d.data() as CustomerDocument),
      id: d.id,
    }));

    customers.sort((a, b) => (a.shopName || a.name).localeCompare(b.shopName || b.name));

    cachedActiveCustomers = customers;
    lastCustomerCacheTime = now;

    if (type) {
      return customers.filter((c) => c.type === type);
    }
    return customers;
  } catch (err) {
    console.error('Error fetching customers for dropdown:', err);
    return cachedActiveCustomers || [];
  }
};

export const checkCustomerPhoneUnique = async (
  phone: string,
  excludeCustomerId?: string
): Promise<boolean> => {
  if (!db || !phone.trim()) return true;

  try {
    const q = query(
      collection(db, 'customers'),
      where('phone', '==', phone.trim()),
      limit(2)
    );
    const snap = await getDocs(q);

    if (snap.empty) return true;
    if (excludeCustomerId && snap.docs.length === 1 && snap.docs[0].id === excludeCustomerId) {
      return true;
    }
    return false;
  } catch (err) {
    console.error('Error checking customer phone uniqueness:', err);
    return true;
  }
};

export const getCustomersPaginated = async (
  filters: CustomerFilters = {},
  cursorDoc: QueryDocumentSnapshot<DocumentData> | null = null,
  pageSize = CUSTOMER_PAGE_SIZE
): Promise<PaginatedCustomersResult> => {
  if (!db) {
    return { customers: [], lastDoc: null, hasMore: false };
  }

  try {
    const customersRef = collection(db, 'customers');
    let qConstraints: any[] = [];

    // Filter by Active Status
    if (filters.status === 'active') {
      qConstraints.push(where('isActive', '==', true));
    } else if (filters.status === 'inactive') {
      qConstraints.push(where('isActive', '==', false));
    }

    // Filter by Customer Archetype
    if (filters.type && filters.type !== 'all') {
      qConstraints.push(where('type', '==', filters.type));
    }

    // Cursor pagination
    if (cursorDoc) {
      qConstraints.push(startAfter(cursorDoc));
    }

    // Fetch pageSize + 1 to detect hasMore without count queries
    qConstraints.push(limit(pageSize + 1));

    const q = query(customersRef, ...qConstraints);
    const snap = await getDocs(q);

    let docs = snap.docs;
    const hasMore = docs.length > pageSize;
    if (hasMore) {
      docs = docs.slice(0, pageSize);
    }

    let customers: CustomerDocument[] = docs.map((docSnap) => ({
      ...(docSnap.data() as CustomerDocument),
      id: docSnap.id,
    }));

    // In-memory filter for balance status
    if (filters.balanceStatus && filters.balanceStatus !== 'all') {
      customers = customers.filter((c) => {
        const bal = c.currentBalance || 0;
        if (filters.balanceStatus === 'has_balance') return bal > 0;
        if (filters.balanceStatus === 'zero_balance') return bal === 0;
        if (filters.balanceStatus === 'advance') return bal < 0;
        return true;
      });
    }

    // In-memory filter for client search term
    if (filters.searchTerm && filters.searchTerm.trim()) {
      const term = filters.searchTerm.trim().toLowerCase();
      customers = customers.filter((c) =>
        (c.name && c.name.toLowerCase().includes(term)) ||
        (c.shopName && c.shopName.toLowerCase().includes(term)) ||
        (c.phone && c.phone.toLowerCase().includes(term)) ||
        (c.secondaryPhone && c.secondaryPhone.toLowerCase().includes(term)) ||
        (c.city && c.city.toLowerCase().includes(term)) ||
        (c.address && c.address.toLowerCase().includes(term))
      );
    }

    const lastDoc = docs.length > 0 ? docs[docs.length - 1] : null;

    return {
      customers,
      lastDoc,
      hasMore,
    };
  } catch (err) {
    console.error('Error fetching paginated customers:', err);
    return { customers: [], lastDoc: null, hasMore: false };
  }
};

export const getCustomerById = async (id: string): Promise<CustomerDocument | null> => {
  if (!db || !id) return null;

  try {
    const docRef = doc(db, 'customers', id);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return null;
    return { ...(snap.data() as CustomerDocument), id: snap.id };
  } catch (err) {
    console.error(`Error fetching customer ${id}:`, err);
    return null;
  }
};

export interface CreateCustomerInput {
  name: string;
  type: CustomerType;
  phone: string;
  secondaryPhone?: string;
  shopName?: string;
  address?: string;
  city?: string;
  discountPercentage?: number;
  creditLimit?: number;
  creditDays?: number;
  initialBalance?: number; // Opening balance from paper registers
  notes?: string;
  portalCode?: string;
  portalPassword?: string;
  portalEnabled?: boolean;
}

export const createCustomer = async (
  input: CreateCustomerInput,
  userId = 'system',
  userEmail = 'admin@sadiqbookagency.com'
): Promise<CustomerDocument> => {
  if (!db) throw new Error('Firestore not initialized');

  // Validate phone uniqueness if phone is provided
  if (input.phone.trim()) {
    const isUnique = await checkCustomerPhoneUnique(input.phone);
    if (!isUnique) {
      throw new Error(`A customer with phone number "${input.phone}" is already registered.`);
    }
  }

  const custRef = doc(collection(db, 'customers'));
  const now = new Date().toISOString();
  const initBal = Number(input.initialBalance) || 0;

  const portalCode = input.portalCode?.trim().toLowerCase() || generatePortalCode();
  const portalPassword = input.portalPassword?.trim() || generateDefaultPortalPin();
  const portalEnabled = input.portalEnabled !== false;

  const newCustomer: CustomerDocument = {
    id: custRef.id,
    name: input.name.trim() || (input.type === 'parchon' ? 'Walk-in Retail Customer' : 'Customer'),
    type: input.type,
    phone: input.phone.trim(),
    secondaryPhone: input.secondaryPhone?.trim() || '',
    shopName: input.shopName?.trim() || '',
    address: input.address?.trim() || '',
    city: input.city?.trim() || '',
    discountPercentage:
      input.type === 'marketshop' ? Math.max(0, Math.min(100, Number(input.discountPercentage) || 0)) : 0,
    creditLimit:
      input.type === 'parchon' ? Math.max(0, Number(input.creditLimit) || 0) : Math.max(0, Number(input.creditLimit) || 50000),
    creditDays: input.creditDays ? Math.max(0, Number(input.creditDays)) : 0,
    currentBalance: 0, // Initialized to 0; opening balance set via transaction below
    isActive: true,
    notes: input.notes?.trim() || '',
    portalCode,
    portalPassword,
    portalEnabled,
    createdAt: now,
    updatedAt: now,
  };

  // Standard non-transactional write for customer record
  await setDoc(custRef, newCustomer);
  invalidateCustomerCache();

  // If opening balance > 0 or < 0, record opening balance via double-entry transaction
  if (initBal !== 0) {
    try {
      await setCustomerOpeningBalanceTransaction(newCustomer.id, initBal, userId, userEmail);
      newCustomer.currentBalance = initBal;
    } catch (ledgerErr) {
      console.warn('Customer created but opening balance ledger record failed:', ledgerErr);
    }
  }

  // Asynchronously initialize the public Khata portal in the background
  syncCustomerPortal(newCustomer.id).catch((portalErr) =>
    console.warn('Initial portal sync notice:', portalErr)
  );

  await logAuditEvent(
    'CREATE_CUSTOMER',
    'customers',
    `Created customer: ${newCustomer.name} (${newCustomer.shopName || newCustomer.type}) with balance ${newCustomer.currentBalance}`,
    newCustomer.id,
    userId,
    userEmail
  );

  return newCustomer;
};

export const updateCustomer = async (
  id: string,
  updates: Partial<CreateCustomerInput>,
  userId = 'system',
  userEmail = 'admin@sadiqbookagency.com'
): Promise<CustomerDocument> => {
  if (!db) throw new Error('Firestore not initialized');

  const existing = await getCustomerById(id);
  if (!existing) throw new Error('Customer not found');

  if (updates.phone && updates.phone.trim() !== existing.phone) {
    const isUnique = await checkCustomerPhoneUnique(updates.phone, id);
    if (!isUnique) {
      throw new Error(`A customer with phone number "${updates.phone}" is already registered.`);
    }
  }

  const payload: Partial<CustomerDocument> = {
    updatedAt: new Date().toISOString(),
  };

  if (updates.name !== undefined) payload.name = updates.name.trim();
  if (updates.type !== undefined) payload.type = updates.type;
  if (updates.phone !== undefined) payload.phone = updates.phone.trim();
  if (updates.secondaryPhone !== undefined) payload.secondaryPhone = updates.secondaryPhone.trim() || '';
  if (updates.shopName !== undefined) payload.shopName = updates.shopName.trim() || '';
  if (updates.address !== undefined) payload.address = updates.address.trim() || '';
  if (updates.city !== undefined) payload.city = updates.city.trim() || '';
  if (updates.discountPercentage !== undefined) {
    payload.discountPercentage = Math.max(0, Math.min(100, Number(updates.discountPercentage) || 0));
  }
  if (updates.creditLimit !== undefined) {
    payload.creditLimit = Math.max(0, Number(updates.creditLimit) || 0);
  }
  if (updates.creditDays !== undefined) {
    payload.creditDays = updates.creditDays ? Math.max(0, Number(updates.creditDays)) : 0;
  }
  if (updates.notes !== undefined) payload.notes = updates.notes.trim() || '';
  if (updates.portalCode !== undefined) payload.portalCode = updates.portalCode.trim().toLowerCase();
  if (updates.portalPassword !== undefined) payload.portalPassword = updates.portalPassword.trim();
  if (updates.portalEnabled !== undefined) payload.portalEnabled = updates.portalEnabled;

  const docRef = doc(db, 'customers', id);
  await updateDoc(docRef, payload);
  invalidateCustomerCache();

  // Asynchronously synchronize Khata portal
  syncCustomerPortal(id).catch((portalErr) =>
    console.warn('Customer update portal sync notice:', portalErr)
  );

  await logAuditEvent(
    'UPDATE_CUSTOMER',
    'customers',
    `Updated customer: ${existing.name} (${existing.shopName || id})`,
    id,
    userId,
    userEmail
  );

  return { ...existing, ...payload };
};

export const toggleCustomerStatus = async (
  id: string,
  isActive: boolean,
  userId = 'system',
  userEmail = 'admin@sadiqbookagency.com'
): Promise<void> => {
  if (!db) throw new Error('Firestore not initialized');

  const docRef = doc(db, 'customers', id);
  const now = new Date().toISOString();

  await updateDoc(docRef, {
    isActive,
    updatedAt: now,
  });
  invalidateCustomerCache();

  await logAuditEvent(
    isActive ? 'ACTIVATE_CUSTOMER' : 'DEACTIVATE_CUSTOMER',
    'customers',
    `${isActive ? 'Activated' : 'Deactivated'} customer ${id}`,
    id,
    userId,
    userEmail
  );
};

