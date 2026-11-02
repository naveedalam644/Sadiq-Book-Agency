import {
  collection,
  doc,
  getDocs,
  setDoc,
  query,
  where,
  limit,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type { CategoryDocument, ItemClassification } from '../types/database';
import { logAuditEvent } from './auditService';

export const DEFAULT_BOOKSTORE_CATEGORIES: Array<{
  id: string;
  name: string;
  classification: ItemClassification;
  description: string;
}> = [
  { id: 'cat_primary', name: 'Primary', classification: 'book', description: 'Primary grade books, notebooks, and learning materials (Class 1-5)' },
  { id: 'cat_middle', name: 'Middle', classification: 'book', description: 'Middle school textbooks, exercise books, and materials (Class 6-8)' },
  { id: 'cat_matric', name: 'Matric', classification: 'book', description: 'Matric board textbooks, practical journals, and guides (Class 9-10)' },
  { id: 'cat_secondary', name: 'Secondary', classification: 'book', description: 'Secondary school curriculum, literature, and reference books' },
  { id: 'cat_intermediate', name: 'Intermediate', classification: 'book', description: 'Intermediate college textbooks, registers, and supplies (Class 11-12)' },
  { id: 'cat_others', name: 'Others', classification: 'general', description: 'General stationery, office supplies, registers, and other items' },
];

export const getFallbackCoreCategories = (): CategoryDocument[] => {
  return DEFAULT_BOOKSTORE_CATEGORIES.map((c) => ({
    id: c.id,
    name: c.name,
    classification: c.classification,
    description: c.description,
    isActive: true,
    createdAt: new Date().toISOString(),
  }));
};

let cachedCategories: CategoryDocument[] | null = null;
let lastCacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes TTL

export const getCategories = async (forceRefresh = false): Promise<CategoryDocument[]> => {
  const now = Date.now();
  if (!forceRefresh && cachedCategories && now - lastCacheTime < CACHE_TTL) {
    return cachedCategories;
  }

  if (!db) {
    return getFallbackCoreCategories();
  }

  try {
    const categoriesRef = collection(db, 'categories');
    const q = query(categoriesRef, where('isActive', '==', true), limit(50));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      // Auto-seed default categories on first launch
      const seeded = await seedDefaultCategories();
      cachedCategories = seeded;
      lastCacheTime = now;
      return seeded;
    }

    const coreOrder = ['Primary', 'Middle', 'Matric', 'Secondary', 'Intermediate', 'Others'] as const;
    const matchedDocsByName = new Map<string, CategoryDocument>();

    snapshot.forEach((docSnap) => {
      const data = docSnap.data() as CategoryDocument;
      const cleanName = data.name?.trim();
      const matchedName = coreOrder.find(
        (target) => target.toLowerCase() === cleanName?.toLowerCase()
      );
      if (matchedName && !matchedDocsByName.has(matchedName)) {
        matchedDocsByName.set(matchedName, { ...data, id: docSnap.id, name: matchedName });
      }
    });

    // Build the final list containing EXCLUSIVELY the six core categories in exact order
    const categories: CategoryDocument[] = coreOrder.map((catName) => {
      const found = matchedDocsByName.get(catName);
      if (found) {
        return found;
      }
      const defaultDef = DEFAULT_BOOKSTORE_CATEGORIES.find((d) => d.name === catName)!;
      return {
        id: defaultDef.id,
        name: defaultDef.name,
        classification: defaultDef.classification,
        description: defaultDef.description,
        isActive: true,
        createdAt: new Date().toISOString(),
      };
    });

    cachedCategories = categories;
    lastCacheTime = now;
    return categories;
  } catch (error) {
    console.error('Error fetching categories:', error);
    return cachedCategories || getFallbackCoreCategories();
  }
};

export const seedDefaultCategories = async (): Promise<CategoryDocument[]> => {
  if (!db) return getFallbackCoreCategories();
  const seededList: CategoryDocument[] = [];

  for (const cat of DEFAULT_BOOKSTORE_CATEGORIES) {
    const newDocRef = doc(db, 'categories', cat.id);
    const categoryDoc: CategoryDocument = {
      id: cat.id,
      name: cat.name,
      classification: cat.classification,
      description: cat.description,
      isActive: true,
      createdAt: new Date().toISOString(),
    };
    await setDoc(newDocRef, categoryDoc, { merge: true });
    seededList.push(categoryDoc);
  }

  await logAuditEvent('SEED_CATEGORIES', 'categories', `Initialized 6 core bookstore categories`);
  return seededList;
};

export const createCategory = async (
  name: string,
  classification: ItemClassification,
  description?: string,
  userId = 'system',
  userEmail = 'admin@sadiqbookagency.com'
): Promise<CategoryDocument> => {
  if (!db) throw new Error('Firestore not initialized');

  const newDocRef = doc(collection(db, 'categories'));
  const newCat: CategoryDocument = {
    id: newDocRef.id,
    name: name.trim(),
    classification,
    description: description?.trim() || '',
    isActive: true,
    createdAt: new Date().toISOString(),
  };

  await setDoc(newDocRef, newCat);
  cachedCategories = null;

  await logAuditEvent('CREATE_CATEGORY', 'categories', `Created category: ${newCat.name}`, newCat.id, userId, userEmail);
  return newCat;
};
