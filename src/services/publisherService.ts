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
import type { PublisherDocument } from '../types/database';
import { logAuditEvent } from './auditService';

export const PUBLISHERS_COLLECTION = 'publishers';

export interface CreatePublisherInput {
  name: string;
  description?: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
}

export interface UpdatePublisherInput {
  name?: string;
  description?: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
  isActive?: boolean;
}

// In-Memory Client Cache (5-Minute TTL per FIREBASE_COST_OPTIMIZATION.md)
let cachedPublishers: PublisherDocument[] | null = null;
let lastPublishersFetch = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

export const invalidatePublisherCache = (): void => {
  cachedPublishers = null;
  lastPublishersFetch = 0;
};

/**
 * Normalizes a publisher name: collapses whitespace and lowercases for duplicate detection.
 */
export const normalizePublisherName = (name: string): string => {
  return (name || '').replace(/\s+/g, ' ').trim().toLowerCase();
};

/**
 * Formats a clean display name with preserved casing and collapsed whitespace.
 */
export const formatPublisherDisplayName = (name: string): string => {
  return (name || '').replace(/\s+/g, ' ').trim();
};

/**
 * Fetches all publishers (active and inactive) with client-side caching.
 */
export const getPublishers = async (forceRefresh = false): Promise<PublisherDocument[]> => {
  if (!forceRefresh && cachedPublishers && Date.now() - lastPublishersFetch < CACHE_TTL_MS) {
    return cachedPublishers;
  }

  if (!db) return cachedPublishers || [];

  try {
    const snap = await getDocs(collection(db, PUBLISHERS_COLLECTION));
    const publishers: PublisherDocument[] = snap.docs.map((d) => ({
      ...(d.data() as PublisherDocument),
      id: d.id,
    }));

    // Sort alphabetically by name
    publishers.sort((a, b) => a.name.localeCompare(b.name));

    cachedPublishers = publishers;
    lastPublishersFetch = Date.now();
    return publishers;
  } catch (err) {
    console.error('Failed to fetch publishers:', err);
    return cachedPublishers || [];
  }
};

/**
 * Fetches only active publishers for standard dropdowns.
 */
export const getActivePublishers = async (forceRefresh = false): Promise<PublisherDocument[]> => {
  const all = await getPublishers(forceRefresh);
  return all.filter((p) => p.isActive);
};

/**
 * Fetches a single publisher by ID.
 */
export const getPublisherById = async (id: string): Promise<PublisherDocument | null> => {
  if (!id || !db) return null;

  // Check in-memory cache first (0 Firestore reads)
  if (cachedPublishers) {
    const found = cachedPublishers.find((p) => p.id === id);
    if (found) return found;
  }

  const snap = await getDoc(doc(db, PUBLISHERS_COLLECTION, id));
  if (!snap.exists()) return null;

  return {
    ...(snap.data() as PublisherDocument),
    id: snap.id,
  };
};

/**
 * Generates a deterministic document ID for a publisher based on normalized name.
 */
export const generatePublisherId = (name: string): string => {
  const slug = normalizePublisherName(name)
    .replace(/[^a-z0-9]/g, '_')
    .slice(0, 40);
  return `pub_${slug || 'general'}`;
};

/**
 * Creates a new Publisher with duplicate checking.
 */
export const createPublisher = async (
  input: CreatePublisherInput,
  userId = 'system',
  userEmail = 'admin@sadiqbookagency.com'
): Promise<PublisherDocument> => {
  if (!db) throw new Error('Firestore not initialized');

  const displayName = formatPublisherDisplayName(input.name);
  if (!displayName) {
    throw new Error('Publisher name is required.');
  }

  const normalized = normalizePublisherName(displayName);

  // Check for duplicates across existing publishers
  const existing = await getPublishers();
  const duplicate = existing.find((p) => p.normalizedName === normalized);
  if (duplicate) {
    throw new Error(`A publisher with name "${duplicate.name}" already exists.`);
  }

  let docId = generatePublisherId(displayName);
  // Ensure unique ID in case of slug clash
  if (existing.some((p) => p.id === docId)) {
    docId = `${docId}_${Date.now().toString(36)}`;
  }

  const now = new Date().toISOString();
  const newPublisher: PublisherDocument = {
    id: docId,
    name: displayName,
    normalizedName: normalized,
    description: input.description?.trim() || undefined,
    contactPerson: input.contactPerson?.trim() || undefined,
    phone: input.phone?.trim() || undefined,
    email: input.email?.trim() || undefined,
    address: input.address?.trim() || undefined,
    isActive: true,
    seriesCount: 0,
    productCount: 0,
    createdAt: now,
    updatedAt: now,
  };

  const pubRef = doc(db, PUBLISHERS_COLLECTION, docId);
  await setDoc(pubRef, newPublisher);

  invalidatePublisherCache();

  await logAuditEvent(
    'CREATE_PUBLISHER',
    PUBLISHERS_COLLECTION,
    `Created publisher: "${newPublisher.name}" (${newPublisher.id})`,
    newPublisher.id,
    userId,
    userEmail
  );

  return newPublisher;
};

/**
 * Updates an existing publisher with duplicate check on rename.
 */
export const updatePublisher = async (
  id: string,
  updates: UpdatePublisherInput,
  userId = 'system',
  userEmail = 'admin@sadiqbookagency.com'
): Promise<void> => {
  if (!db) throw new Error('Firestore not initialized');

  const current = await getPublisherById(id);
  if (!current) throw new Error(`Publisher with ID "${id}" not found.`);

  const updateData: Partial<PublisherDocument> = {
    updatedAt: new Date().toISOString(),
  };

  if (updates.name !== undefined) {
    const newDisplayName = formatPublisherDisplayName(updates.name);
    if (!newDisplayName) {
      throw new Error('Publisher name cannot be empty.');
    }
    const newNormalized = normalizePublisherName(newDisplayName);

    if (newNormalized !== current.normalizedName) {
      const existing = await getPublishers();
      const duplicate = existing.find((p) => p.id !== id && p.normalizedName === newNormalized);
      if (duplicate) {
        throw new Error(`Another publisher with name "${duplicate.name}" already exists.`);
      }
      updateData.name = newDisplayName;
      updateData.normalizedName = newNormalized;
    }
  }

  if (updates.description !== undefined) updateData.description = updates.description.trim() || undefined;
  if (updates.contactPerson !== undefined) updateData.contactPerson = updates.contactPerson.trim() || undefined;
  if (updates.phone !== undefined) updateData.phone = updates.phone.trim() || undefined;
  if (updates.email !== undefined) updateData.email = updates.email.trim() || undefined;
  if (updates.address !== undefined) updateData.address = updates.address.trim() || undefined;
  if (updates.isActive !== undefined) updateData.isActive = updates.isActive;

  const pubRef = doc(db, PUBLISHERS_COLLECTION, id);
  await updateDoc(pubRef, updateData as any);

  invalidatePublisherCache();

  await logAuditEvent(
    'UPDATE_PUBLISHER',
    PUBLISHERS_COLLECTION,
    `Updated publisher "${current.name}" (${id})`,
    id,
    userId,
    userEmail
  );
};

/**
 * Toggles publisher active status (soft deactivation).
 */
export const togglePublisherStatus = async (
  id: string,
  isActive: boolean,
  userId = 'system',
  userEmail = 'admin@sadiqbookagency.com'
): Promise<void> => {
  return updatePublisher(id, { isActive }, userId, userEmail);
};

/**
 * Safely deletes a publisher.
 * STRICT SAFETY RULE:
 * - Blocked if any Series exist under this publisherId.
 * - Blocked if any Products reference this publisherId or publisherName.
 * Recommends deactivation instead of permanent deletion.
 */
export const deletePublisher = async (
  id: string,
  userId = 'system',
  userEmail = 'admin@sadiqbookagency.com'
): Promise<{ success: boolean; message?: string }> => {
  if (!db) throw new Error('Firestore not initialized');

  const pub = await getPublisherById(id);
  if (!pub) return { success: false, message: 'Publisher not found.' };

  // 1. Check for linked series
  const seriesQuery = query(
    collection(db, 'series'),
    where('publisherId', '==', id),
    limit(1)
  );
  const seriesSnap = await getDocs(seriesQuery);
  if (!seriesSnap.empty) {
    return {
      success: false,
      message: `Cannot delete publisher "${pub.name}". There are series associated with this publisher. Please delete or reassign the series first, or deactivate this publisher instead.`,
    };
  }

  // 2. Check for linked products by publisherId
  const productsQueryById = query(
    collection(db, 'products'),
    where('publisherId', '==', id),
    limit(1)
  );
  const prodSnapById = await getDocs(productsQueryById);
  if (!prodSnapById.empty) {
    return {
      success: false,
      message: `Cannot delete publisher "${pub.name}". Products are currently assigned to this publisher. Please reassign the products or deactivate the publisher instead.`,
    };
  }

  // 3. Check for linked products by publisherName (legacy mapping protection)
  const productsQueryByName = query(
    collection(db, 'products'),
    where('publisherName', '==', pub.name),
    limit(1)
  );
  const prodSnapByName = await getDocs(productsQueryByName);
  if (!prodSnapByName.empty) {
    return {
      success: false,
      message: `Cannot delete publisher "${pub.name}". Historical product records depend on this publisher name. Please deactivate this publisher instead of deleting.`,
    };
  }

  // Safe to delete
  await deleteDoc(doc(db, PUBLISHERS_COLLECTION, id));
  invalidatePublisherCache();

  await logAuditEvent(
    'DELETE_PUBLISHER',
    PUBLISHERS_COLLECTION,
    `Permanently deleted unreferenced publisher: "${pub.name}" (${id})`,
    id,
    userId,
    userEmail
  );

  return { success: true };
};

