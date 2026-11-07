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
  limit,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type {
  NotebookAttributeDocument,
  NotebookAttributeType,
} from '../types/database';
import { logAuditEvent } from './auditService';

export interface CreateNotebookAttributeInput {
  type: NotebookAttributeType;
  value: string;
}

export interface UpdateNotebookAttributeInput {
  value?: string;
  isActive?: boolean;
}

export const DEFAULT_NOTEBOOK_ATTRIBUTES: Array<{
  type: NotebookAttributeType;
  value: string;
}> = [
  // Default Sizes
  { type: 'size', value: 'A4' },
  { type: 'size', value: 'A5' },
  { type: 'size', value: 'Foolscap' },
  { type: 'size', value: 'Small' },
  { type: 'size', value: 'Large' },

  // Default Sheet counts
  { type: 'sheets', value: '40' },
  { type: 'sheets', value: '80' },
  { type: 'sheets', value: '100' },
  { type: 'sheets', value: '120' },
  { type: 'sheets', value: '200' },

  // Default Grammages
  { type: 'grammage', value: '60 GSM' },
  { type: 'grammage', value: '68 GSM' },
  { type: 'grammage', value: '70 GSM' },
  { type: 'grammage', value: '75 GSM' },
  { type: 'grammage', value: '80 GSM' },
];

/**
 * Normalizes an attribute value for duplicate checking:
 * Trims whitespace, collapses internal consecutive spaces, and converts to lowercase.
 */
export function normalizeAttributeValue(val: string): string {
  return val.trim().toLowerCase().replace(/\s+/g, ' ');
}

// In-memory read cache to minimize Firestore billing reads
let cachedAttributes: NotebookAttributeDocument[] | null = null;
let lastCacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes TTL

export function invalidateNotebookAttributesCache(): void {
  cachedAttributes = null;
  lastCacheTime = 0;
}

/**
 * Retrieves notebook & register attributes, optionally filtered by type and active status.
 */
export async function getNotebookAttributes(
  type?: NotebookAttributeType,
  activeOnly = false,
  forceRefresh = false
): Promise<NotebookAttributeDocument[]> {
  const now = Date.now();
  if (!forceRefresh && cachedAttributes && now - lastCacheTime < CACHE_TTL) {
    let result = cachedAttributes;
    if (type) {
      result = result.filter((a) => a.type === type);
    }
    if (activeOnly) {
      result = result.filter((a) => a.isActive);
    }
    return result;
  }

  if (!db) {
    let fallback = DEFAULT_NOTEBOOK_ATTRIBUTES.map((item, idx) => ({
      id: `fallback_${item.type}_${idx}`,
      type: item.type,
      value: item.value,
      normalizedValue: normalizeAttributeValue(item.value),
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    if (type) fallback = fallback.filter((a) => a.type === type);
    if (activeOnly) fallback = fallback.filter((a) => a.isActive);
    return fallback;
  }

  try {
    const collRef = collection(db, 'notebookAttributes');
    const snapshot = await getDocs(collRef);

    if (snapshot.empty) {
      // Auto-seed default attributes on first access
      await seedInitialNotebookAttributesIfEmpty();
      return getNotebookAttributes(type, activeOnly, true);
    }

    const docs: NotebookAttributeDocument[] = snapshot.docs.map((docSnap) => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        type: data.type,
        value: data.value,
        normalizedValue: data.normalizedValue || normalizeAttributeValue(data.value || ''),
        isActive: data.isActive !== false,
        createdAt: data.createdAt || new Date().toISOString(),
        updatedAt: data.updatedAt || new Date().toISOString(),
        createdByUserId: data.createdByUserId,
        updatedByUserId: data.updatedByUserId,
      };
    });

    // Natural sort: numeric when possible, alphabetical otherwise
    docs.sort((a, b) => {
      const numA = parseFloat(a.value);
      const numB = parseFloat(b.value);
      if (!isNaN(numA) && !isNaN(numB) && a.value.trim() === String(numA) && b.value.trim() === String(numB)) {
        return numA - numB;
      }
      return a.value.localeCompare(b.value, undefined, { numeric: true, sensitivity: 'base' });
    });

    cachedAttributes = docs;
    lastCacheTime = now;

    let result = docs;
    if (type) {
      result = result.filter((a) => a.type === type);
    }
    if (activeOnly) {
      result = result.filter((a) => a.isActive);
    }
    return result;
  } catch (err) {
    console.error('Failed to load notebook attributes from Firestore:', err);
    if (cachedAttributes) {
      let result = cachedAttributes;
      if (type) result = result.filter((a) => a.type === type);
      if (activeOnly) result = result.filter((a) => a.isActive);
      return result;
    }
    return [];
  }
}

/**
 * Creates a new notebook or register attribute with duplicate checking.
 */
export async function createNotebookAttribute(
  input: CreateNotebookAttributeInput,
  userId = 'system',
  userEmail = 'admin@sadiqbookagency.com'
): Promise<NotebookAttributeDocument> {
  if (!db) throw new Error('Firestore not initialized');

  const trimmedValue = input.value?.trim();
  if (!trimmedValue) {
    throw new Error('Attribute value cannot be empty.');
  }

  const validTypes: NotebookAttributeType[] = ['size', 'sheets', 'grammage'];
  if (!validTypes.includes(input.type)) {
    throw new Error(`Invalid attribute type: "${input.type}". Must be size, sheets, or grammage.`);
  }

  const normalized = normalizeAttributeValue(trimmedValue);

  // Check duplicate within the same attribute type
  const collRef = collection(db, 'notebookAttributes');
  const dupQ = query(
    collRef,
    where('type', '==', input.type),
    where('normalizedValue', '==', normalized),
    limit(1)
  );
  const dupSnap = await getDocs(dupQ);

  if (!dupSnap.empty) {
    const existing = dupSnap.docs[0].data();
    throw new Error(
      `${input.type.toUpperCase()} option "${existing.value || trimmedValue}" already exists.`
    );
  }

  const now = new Date().toISOString();
  const docRef = doc(collRef);
  const newDoc: NotebookAttributeDocument = {
    id: docRef.id,
    type: input.type,
    value: trimmedValue,
    normalizedValue: normalized,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    createdByUserId: userId,
  };

  await setDoc(docRef, newDoc);
  invalidateNotebookAttributesCache();

  await logAuditEvent(
    'CREATE_NOTEBOOK_ATTRIBUTE',
    'notebookAttributes',
    `Created ${newDoc.type} attribute: "${newDoc.value}"`,
    newDoc.id,
    userId,
    userEmail
  );

  return newDoc;
}

/**
 * Updates an existing notebook attribute (rename or toggle active).
 */
export async function updateNotebookAttribute(
  id: string,
  updates: UpdateNotebookAttributeInput,
  userId = 'system',
  userEmail = 'admin@sadiqbookagency.com'
): Promise<NotebookAttributeDocument> {
  if (!db) throw new Error('Firestore not initialized');
  if (!id) throw new Error('Attribute ID is required.');

  const docRef = doc(db, 'notebookAttributes', id);
  const snap = await getDoc(docRef);
  if (!snap.exists()) {
    throw new Error(`Notebook attribute with ID "${id}" was not found.`);
  }

  const existing = snap.data() as NotebookAttributeDocument;
  const now = new Date().toISOString();
  const updatePayload: Partial<NotebookAttributeDocument> = {
    updatedAt: now,
    updatedByUserId: userId,
  };

  if (updates.value !== undefined) {
    const trimmed = updates.value.trim();
    if (!trimmed) {
      throw new Error('Attribute value cannot be empty.');
    }
    const normalized = normalizeAttributeValue(trimmed);

    // If changing name, check duplicate
    if (normalized !== existing.normalizedValue) {
      const collRef = collection(db, 'notebookAttributes');
      const dupQ = query(
        collRef,
        where('type', '==', existing.type),
        where('normalizedValue', '==', normalized),
        limit(2)
      );
      const dupSnap = await getDocs(dupQ);
      const isDuplicate = dupSnap.docs.some((d) => d.id !== id);
      if (isDuplicate) {
        throw new Error(
          `${existing.type.toUpperCase()} option "${trimmed}" already exists.`
        );
      }
    }

    updatePayload.value = trimmed;
    updatePayload.normalizedValue = normalized;
  }

  if (updates.isActive !== undefined) {
    updatePayload.isActive = Boolean(updates.isActive);
  }

  await updateDoc(docRef, updatePayload as any);
  invalidateNotebookAttributesCache();

  await logAuditEvent(
    'UPDATE_NOTEBOOK_ATTRIBUTE',
    'notebookAttributes',
    `Updated ${existing.type} attribute "${existing.value}"`,
    id,
    userId,
    userEmail
  );

  return {
    ...existing,
    ...updatePayload,
  };
}

/**
 * Checks whether an attribute value is currently assigned to any products.
 */
export async function checkAttributeInUse(
  type: NotebookAttributeType,
  value: string
): Promise<{ inUse: boolean; productCount: number }> {
  if (!db || !value) return { inUse: false, productCount: 0 };

  try {
    const fieldMap: Record<NotebookAttributeType, string> = {
      size: 'notebookSize',
      sheets: 'notebookSheets',
      grammage: 'notebookGrammage',
    };
    const fieldName = fieldMap[type];
    const q = query(
      collection(db, 'products'),
      where(fieldName, '==', value),
      limit(50)
    );
    const snap = await getDocs(q);
    return {
      inUse: !snap.empty,
      productCount: snap.size,
    };
  } catch (err) {
    console.warn(`Failed to check attribute usage for ${type}="${value}":`, err);
    return { inUse: false, productCount: 0 };
  }
}

/**
 * Permanently deletes an attribute only if NOT in use by existing products.
 * If in use, throws an informative error directing user to deactivate instead.
 */
export async function deleteNotebookAttribute(
  id: string,
  userId = 'system',
  userEmail = 'admin@sadiqbookagency.com'
): Promise<void> {
  if (!db) throw new Error('Firestore not initialized');
  const docRef = doc(db, 'notebookAttributes', id);
  const snap = await getDoc(docRef);
  if (!snap.exists()) {
    throw new Error('Attribute not found.');
  }

  const existing = snap.data() as NotebookAttributeDocument;
  const usage = await checkAttributeInUse(existing.type, existing.value);
  if (usage.inUse) {
    throw new Error(
      `Cannot permanently delete "${existing.value}" because it is currently assigned to ${usage.productCount} product(s). Please deactivate it instead so historical records are protected.`
    );
  }

  await deleteDoc(docRef);
  invalidateNotebookAttributesCache();

  await logAuditEvent(
    'DELETE_NOTEBOOK_ATTRIBUTE',
    'notebookAttributes',
    `Deleted ${existing.type} attribute: "${existing.value}"`,
    id,
    userId,
    userEmail
  );
}

/**
 * Auto-seeds default notebook & register attributes if collection is empty.
 */
export async function seedInitialNotebookAttributesIfEmpty(): Promise<void> {
  if (!db) return;
  try {
    const collRef = collection(db, 'notebookAttributes');
    const existingSnap = await getDocs(query(collRef, limit(1)));
    if (!existingSnap.empty) return; // already seeded

    const now = new Date().toISOString();
    for (const item of DEFAULT_NOTEBOOK_ATTRIBUTES) {
      const docRef = doc(collRef);
      await setDoc(docRef, {
        id: docRef.id,
        type: item.type,
        value: item.value,
        normalizedValue: normalizeAttributeValue(item.value),
        isActive: true,
        createdAt: now,
        updatedAt: now,
        createdByUserId: 'system_seed',
      });
    }
    invalidateNotebookAttributesCache();
  } catch (err) {
    console.warn('Auto-seed of notebook attributes skipped/failed:', err);
  }
}
