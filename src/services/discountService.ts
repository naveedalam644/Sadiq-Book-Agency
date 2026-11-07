import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  where,
  limit,
  startAfter,
  type QueryDocumentSnapshot,
  type DocumentData,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type {
  CustomerDiscountDocument,
  CustomerDiscountType,
  CustomerDocument,
  ProductDocument,
} from '../types/database';
import { logAuditEvent } from './auditService';

export const getCustomerDiscountDocId = (customerId: string, productId: string): string =>
  `${customerId}_${productId}`;

export interface SetCustomerDiscountInput {
  customerId: string;
  productId: string;
  productTitle: string;
  productSku: string;
  classification: ProductDocument['classification'];
  categoryName?: string;
  discountType: CustomerDiscountType;
  discountValue: number;
  basePriceType: 'wholesale' | 'retail';
  standardPrice: number;
  notes?: string;
}

export interface PaginatedDiscountsResult {
  discounts: CustomerDiscountDocument[];
  lastDoc: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
}

/**
 * Pure pricing calculation engine implementing the 3-step discount hierarchy:
 * 1. Product-Wise Custom Customer Discount
 * 2. Customer Base Store Discount (Marketshop)
 * 3. Standard Customer Type Price (Wholesale vs Retail)
 */
export const resolveEffectivePrice = (
  product: ProductDocument,
  customer: CustomerDocument,
  customDiscount?: CustomerDiscountDocument | null
): {
  effectivePrice: number;
  appliedRuleType:
    | 'custom_fixed'
    | 'custom_percentage'
    | 'customer_base'
    | 'standard_wholesale'
    | 'standard_retail';
  discountRatePercent: number;
  savingsPerUnit: number;
  basePrice: number;
} => {
  const standardRetail = Number(product.retailPrice) || 0;
  const standardWholesale = Number(product.wholesalePrice) || standardRetail;

  // 1. Customer-Specific Product Discount Rule
  if (customDiscount) {
    if (customDiscount.discountType === 'fixed_rate') {
      const fixedRate = Math.max(0, Number(customDiscount.discountValue) || 0);
      const base = customDiscount.basePriceType === 'wholesale' ? standardWholesale : standardRetail;
      const savings = Math.max(0, base - fixedRate);
      const pct = base > 0 ? Math.round((savings / base) * 1000) / 10 : 0;

      return {
        effectivePrice: fixedRate,
        appliedRuleType: 'custom_fixed',
        discountRatePercent: pct,
        savingsPerUnit: savings,
        basePrice: base,
      };
    }

    if (customDiscount.discountType === 'percentage') {
      const pct = Math.max(0, Math.min(100, Number(customDiscount.discountValue) || 0));
      const base = customDiscount.basePriceType === 'wholesale' ? standardWholesale : standardRetail;
      const calculatedRate = Math.round(base * (1 - pct / 100) * 100) / 100;
      const savings = Math.max(0, base - calculatedRate);

      return {
        effectivePrice: calculatedRate,
        appliedRuleType: 'custom_percentage',
        discountRatePercent: pct,
        savingsPerUnit: savings,
        basePrice: base,
      };
    }
  }

  // 2. Agreed Base Customer Discount (Marketshop)
  if (customer.type === 'marketshop' && (customer.discountPercentage || 0) > 0) {
    const basePct = Math.min(100, Math.max(0, customer.discountPercentage || 0));
    const base = standardRetail;
    const discountedRate = Math.round(base * (1 - basePct / 100) * 100) / 100;
    const savings = Math.max(0, base - discountedRate);

    return {
      effectivePrice: discountedRate,
      appliedRuleType: 'customer_base',
      discountRatePercent: basePct,
      savingsPerUnit: savings,
      basePrice: base,
    };
  }

  // 3. Customer Type Default Rate
  if (customer.type === 'wholesaler') {
    const savings = Math.max(0, standardRetail - standardWholesale);
    const pct = standardRetail > 0 ? Math.round((savings / standardRetail) * 1000) / 10 : 0;
    return {
      effectivePrice: standardWholesale,
      appliedRuleType: 'standard_wholesale',
      discountRatePercent: pct,
      savingsPerUnit: savings,
      basePrice: standardRetail,
    };
  }

  // Parchon / General retail walk-in
  return {
    effectivePrice: standardRetail,
    appliedRuleType: 'standard_retail',
    discountRatePercent: 0,
    savingsPerUnit: 0,
    basePrice: standardRetail,
  };
};

/**
 * Fetch all custom discounts for a customer (paginated, 25 at a time)
 */
export const getCustomerDiscountsPaginated = async (
  customerId: string,
  cursorDoc: QueryDocumentSnapshot<DocumentData> | null = null,
  pageSize = 25
): Promise<PaginatedDiscountsResult> => {
  if (!db || !customerId) {
    return { discounts: [], lastDoc: null, hasMore: false };
  }

  try {
    const discountsRef = collection(db, 'customerDiscounts');
    let qConstraints: any[] = [
      where('customerId', '==', customerId),
      limit(pageSize + 1),
    ];

    if (cursorDoc) {
      qConstraints.push(startAfter(cursorDoc));
    }

    const q = query(discountsRef, ...qConstraints);
    const snap = await getDocs(q);

    let docs = snap.docs;
    const hasMore = docs.length > pageSize;
    if (hasMore) {
      docs = docs.slice(0, pageSize);
    }

    const discounts: CustomerDiscountDocument[] = docs.map((d) => ({
      ...(d.data() as CustomerDiscountDocument),
      id: d.id,
    }));

    const lastDoc = docs.length > 0 ? docs[docs.length - 1] : null;

    return {
      discounts,
      lastDoc,
      hasMore,
    };
  } catch (err) {
    console.error(`Error fetching discounts for customer ${customerId}:`, err);
    return { discounts: [], lastDoc: null, hasMore: false };
  }
};

/**
 * Direct O(1) single-document read for a specific customer-product pair.
 * Costs exactly 1 Firestore read.
 */
export const getCustomerProductDiscount = async (
  customerId: string,
  productId: string
): Promise<CustomerDiscountDocument | null> => {
  if (!db || !customerId || !productId) return null;

  try {
    const docId = getCustomerDiscountDocId(customerId, productId);
    const docRef = doc(db, 'customerDiscounts', docId);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return null;
    return { ...(snap.data() as CustomerDiscountDocument), id: snap.id };
  } catch (err) {
    console.error(`Error reading discount ${customerId}_${productId}:`, err);
    return null;
  }
};

/**
 * Creates or updates a product-specific discount for a customer.
 * Uses deterministic ID `${customerId}_${productId}` to guarantee uniqueness.
 * Single standard write (0 reads, 1 write).
 */
export const setCustomerProductDiscount = async (
  input: SetCustomerDiscountInput,
  userId = 'system',
  userEmail = 'admin@sadiqbookagency.com'
): Promise<CustomerDiscountDocument> => {
  if (!db) throw new Error('Firestore not initialized');

  const docId = getCustomerDiscountDocId(input.customerId, input.productId);
  const docRef = doc(db, 'customerDiscounts', docId);
  const now = new Date().toISOString();

  // Compute final effective price based on discount type
  let effectivePrice: number;
  if (input.discountType === 'fixed_rate') {
    effectivePrice = Math.max(0, Number(input.discountValue) || 0);
  } else {
    const pct = Math.max(0, Math.min(100, Number(input.discountValue) || 0));
    effectivePrice = Math.round(input.standardPrice * (1 - pct / 100) * 100) / 100;
  }

  const record: CustomerDiscountDocument = {
    id: docId,
    customerId: input.customerId,
    productId: input.productId,
    productTitle: input.productTitle,
    productSku: input.productSku,
    classification: input.classification,
    categoryName: input.categoryName || '',
    discountType: input.discountType,
    discountValue: Number(input.discountValue) || 0,
    basePriceType: input.basePriceType,
    standardPrice: input.standardPrice,
    effectivePrice,
    notes: input.notes?.trim() || '',
    createdAt: now,
    updatedAt: now,
    createdByUserId: userId,
  };

  await setDoc(docRef, record);

  await logAuditEvent(
    'SET_CUSTOMER_DISCOUNT',
    'customerDiscounts',
    `Set discount for customer ${input.customerId} on product ${input.productTitle} (${input.discountType}: ${input.discountValue})`,
    docId,
    userId,
    userEmail
  );

  return record;
};

/**
 * Removes a custom product discount for a customer.
 * Costs 0 reads, 1 delete.
 */
export const deleteCustomerProductDiscount = async (
  customerId: string,
  productId: string,
  userId = 'system',
  userEmail = 'admin@sadiqbookagency.com'
): Promise<void> => {
  if (!db) throw new Error('Firestore not initialized');

  const docId = getCustomerDiscountDocId(customerId, productId);
  const docRef = doc(db, 'customerDiscounts', docId);

  await deleteDoc(docRef);

  await logAuditEvent(
    'DELETE_CUSTOMER_DISCOUNT',
    'customerDiscounts',
    `Removed custom discount for customer ${customerId} on product ${productId}`,
    docId,
    userId,
    userEmail
  );
};

