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
import type { SeriesDocument } from '../types/database';
import { getPublisherById } from './publisherService';
import { logAuditEvent } from './auditService';

export const SERIES_COLLECTION = 'series';

export interface CreateSeriesInput {
  name: string;
  publisherId: string;
  description?: string;
}

export interface UpdateSeriesInput {
  name?: string;
  description?: string;
  isActive?: boolean;
  // Reassignment requires explicit opt-in confirmation
  reassignToPublisherId?: string;
}

// In-Memory Client Cache: publisherId -> SeriesDocument[] (5-Minute TTL per FIREBASE_COST_OPTIMIZATION.md)
const seriesByPublisherCache = new Map<string, { series: SeriesDocument[]; timestamp: number }>();
let allSeriesCache: { series: SeriesDocument[]; timestamp: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

export const invalidateSeriesCache = (publisherId?: string): void => {
  if (publisherId) {
    seriesByPublisherCache.delete(publisherId);
  } else {
    seriesByPublisherCache.clear();
  }
  allSeriesCache = null;
};

/**
 * Normalizes a series name: collapses extra whitespace and converts to lower case.
 */
export const normalizeSeriesName = (name: string): string => {
  return (name || '').replace(/\s+/g, ' ').trim().toLowerCase();
};

/**
 * Formats a clean display name with preserved casing and collapsed whitespace.
 */
export const formatSeriesDisplayName = (name: string): string => {
  return (name || '').replace(/\s+/g, ' ').trim();
};

/**
 * Generates a deterministic document ID for a series.
 */
export const generateSeriesId = (publisherId: string, name: string): string => {
  const pubSlug = publisherId.replace(/^pub_/, '').slice(0, 20);
  const serSlug = normalizeSeriesName(name)
    .replace(/[^a-z0-9]/g, '_')
    .slice(0, 25);
  return `ser_${pubSlug}_${serSlug || 'general'}`;
};

/**
 * Fetches all series belonging to a specific publisher with client-side caching.
 * Cost-optimized: 0 reads on cache hit.
 */
export const getSeriesByPublisher = async (
  publisherId: string,
  forceRefresh = false
): Promise<SeriesDocument[]> => {
  if (!publisherId) return [];

  const cached = seriesByPublisherCache.get(publisherId);
  if (!forceRefresh && cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.series;
  }

  if (!db) return cached?.series || [];

  try {
    const q = query(
      collection(db, SERIES_COLLECTION),
      where('publisherId', '==', publisherId)
    );
    const snap = await getDocs(q);
    const seriesList: SeriesDocument[] = snap.docs.map((d) => ({
      ...(d.data() as SeriesDocument),
      id: d.id,
    }));

    seriesList.sort((a, b) => a.name.localeCompare(b.name));

    seriesByPublisherCache.set(publisherId, {
      series: seriesList,
      timestamp: Date.now(),
    });

    return seriesList;
  } catch (err) {
    console.error(`Failed to fetch series for publisher "${publisherId}":`, err);
    return cached?.series || [];
  }
};

/**
 * Fetches only active series for a publisher (for dropdowns).
 */
export const getActiveSeriesByPublisher = async (
  publisherId: string,
  forceRefresh = false
): Promise<SeriesDocument[]> => {
  const all = await getSeriesByPublisher(publisherId, forceRefresh);
  return all.filter((s) => s.isActive);
};

/**
 * Fetches all series across all publishers with client caching.
 */
export const getAllSeries = async (forceRefresh = false): Promise<SeriesDocument[]> => {
  if (!forceRefresh && allSeriesCache && Date.now() - allSeriesCache.timestamp < CACHE_TTL_MS) {
    return allSeriesCache.series;
  }

  if (!db) return allSeriesCache?.series || [];

  try {
    const snap = await getDocs(collection(db, SERIES_COLLECTION));
    const list: SeriesDocument[] = snap.docs.map((d) => ({
      ...(d.data() as SeriesDocument),
      id: d.id,
    }));

    list.sort((a, b) => a.name.localeCompare(b.name));

    allSeriesCache = {
      series: list,
      timestamp: Date.now(),
    };

    return list;
  } catch (err) {
    console.error('Failed to fetch all series:', err);
    return allSeriesCache?.series || [];
  }
};

/**
 * Fetches a single series document by ID.
 */
export const getSeriesById = async (id: string): Promise<SeriesDocument | null> => {
  if (!id || !db) return null;

  // Check caches first (0 Firestore reads)
  if (allSeriesCache) {
    const found = allSeriesCache.series.find((s) => s.id === id);
    if (found) return found;
  }

  for (const { series } of seriesByPublisherCache.values()) {
    const found = series.find((s) => s.id === id);
    if (found) return found;
  }

  const snap = await getDoc(doc(db, SERIES_COLLECTION, id));
  if (!snap.exists()) return null;

  return {
    ...(snap.data() as SeriesDocument),
    id: snap.id,
  };
};

/**
 * Creates a new Series with scoped uniqueness under its parent publisher.
 */
export const createSeries = async (
  input: CreateSeriesInput,
  userId = 'system',
  userEmail = 'admin@sadiqbookagency.com'
): Promise<SeriesDocument> => {
  if (!db) throw new Error('Firestore not initialized');

  if (!input.publisherId || !input.publisherId.trim()) {
    throw new Error('Every series must be linked to a valid publisherId.');
  }

  const publisher = await getPublisherById(input.publisherId);
  if (!publisher) {
    throw new Error(`Publisher with ID "${input.publisherId}" does not exist.`);
  }

  const displayName = formatSeriesDisplayName(input.name);
  if (!displayName) {
    throw new Error('Series name is required.');
  }

  const normalized = normalizeSeriesName(displayName);

  // Scoped uniqueness: verify no other series under THIS publisher has the same name
  const existingSeries = await getSeriesByPublisher(input.publisherId, true);
  const duplicate = existingSeries.find((s) => s.normalizedName === normalized);
  if (duplicate) {
    throw new Error(
      `A series named "${duplicate.name}" already exists under publisher "${publisher.name}".`
    );
  }

  let docId = generateSeriesId(input.publisherId, displayName);
  if (existingSeries.some((s) => s.id === docId)) {
    docId = `${docId}_${Date.now().toString(36)}`;
  }

  const now = new Date().toISOString();
  const newSeries: SeriesDocument = {
    id: docId,
    name: displayName,
    normalizedName: normalized,
    publisherId: input.publisherId,
    publisherName: publisher.name,
    description: input.description?.trim() || undefined,
    isActive: true,
    productCount: 0,
    createdAt: now,
    updatedAt: now,
  };

  const seriesRef = doc(db, SERIES_COLLECTION, docId);
  await setDoc(seriesRef, newSeries);

  invalidateSeriesCache(input.publisherId);

  await logAuditEvent(
    'CREATE_SERIES',
    SERIES_COLLECTION,
    `Created series "${newSeries.name}" under publisher "${publisher.name}" (${newSeries.id})`,
    newSeries.id,
    userId,
    userEmail
  );

  return newSeries;
};

/**
 * Updates an existing series with scoped uniqueness and explicit reassignment validation.
 */
export const updateSeries = async (
  id: string,
  updates: UpdateSeriesInput,
  userId = 'system',
  userEmail = 'admin@sadiqbookagency.com'
): Promise<void> => {
  if (!db) throw new Error('Firestore not initialized');

  const current = await getSeriesById(id);
  if (!current) throw new Error(`Series with ID "${id}" not found.`);

  const updateData: Partial<SeriesDocument> = {
    updatedAt: new Date().toISOString(),
  };

  const targetPublisherId = updates.reassignToPublisherId || current.publisherId;
  let targetPublisherName = current.publisherName;

  // Handle explicit reassignment to another publisher
  if (updates.reassignToPublisherId && updates.reassignToPublisherId !== current.publisherId) {
    const targetPublisher = await getPublisherById(updates.reassignToPublisherId);
    if (!targetPublisher) {
      throw new Error(`Target publisher "${updates.reassignToPublisherId}" not found for reassignment.`);
    }
    targetPublisherName = targetPublisher.name;
    updateData.publisherId = targetPublisher.id;
    updateData.publisherName = targetPublisher.name;
  }

  // Handle name change or scoped duplicate validation
  const targetName = updates.name !== undefined ? formatSeriesDisplayName(updates.name) : current.name;
  if (!targetName) {
    throw new Error('Series name cannot be empty.');
  }

  const targetNormalized = normalizeSeriesName(targetName);

  if (targetNormalized !== current.normalizedName || updates.reassignToPublisherId) {
    const siblingSeries = await getSeriesByPublisher(targetPublisherId, true);
    const duplicate = siblingSeries.find((s) => s.id !== id && s.normalizedName === targetNormalized);
    if (duplicate) {
      throw new Error(
        `A series named "${duplicate.name}" already exists under publisher "${targetPublisherName}".`
      );
    }
    updateData.name = targetName;
    updateData.normalizedName = targetNormalized;
  }

  if (updates.description !== undefined) updateData.description = updates.description.trim() || undefined;
  if (updates.isActive !== undefined) updateData.isActive = updates.isActive;

  const seriesRef = doc(db, SERIES_COLLECTION, id);
  await updateDoc(seriesRef, updateData as any);

  invalidateSeriesCache(current.publisherId);
  if (targetPublisherId !== current.publisherId) {
    invalidateSeriesCache(targetPublisherId);
  }

  await logAuditEvent(
    'UPDATE_SERIES',
    SERIES_COLLECTION,
    `Updated series "${targetName}" (Publisher: "${targetPublisherName}", ID: ${id})`,
    id,
    userId,
    userEmail
  );
};

/**
 * Toggles series active status (soft deactivation).
 */
export const toggleSeriesStatus = async (
  id: string,
  isActive: boolean,
  userId = 'system',
  userEmail = 'admin@sadiqbookagency.com'
): Promise<void> => {
  return updateSeries(id, { isActive }, userId, userEmail);
};

/**
 * Safely deletes a series.
 * STRICT SAFETY RULE:
 * - Blocked if any products in 'products' have seriesId == id.
 * - Recommends deactivation instead of permanent deletion.
 */
export const deleteSeries = async (
  id: string,
  userId = 'system',
  userEmail = 'admin@sadiqbookagency.com'
): Promise<{ success: boolean; message?: string }> => {
  if (!db) throw new Error('Firestore not initialized');

  const series = await getSeriesById(id);
  if (!series) return { success: false, message: 'Series not found.' };

  // Check for linked products
  const productsQuery = query(
    collection(db, 'products'),
    where('seriesId', '==', id),
    limit(1)
  );
  const prodSnap = await getDocs(productsQuery);

  if (!prodSnap.empty) {
    return {
      success: false,
      message: `Cannot delete series "${series.name}". Products in the inventory are linked to this series. Please reassign the products or deactivate the series instead.`,
    };
  }

  // Safe to delete
  await deleteDoc(doc(db, SERIES_COLLECTION, id));
  invalidateSeriesCache(series.publisherId);

  await logAuditEvent(
    'DELETE_SERIES',
    SERIES_COLLECTION,
    `Permanently deleted unreferenced series: "${series.name}" (${id})`,
    id,
    userId,
    userEmail
  );

  return { success: true };
};

