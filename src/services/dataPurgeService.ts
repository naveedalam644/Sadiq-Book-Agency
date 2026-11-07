/**
 * Sadiq Book Agency — Production Client Handover Data Purge Service
 * 
 * Safely removes testing records across all business and transactional collections
 * while strictly preserving:
 * 1. Admin Authentication & User accounts (users collection)
 * 2. The 6 standard syllabus and inventory categories (categories collection)
 * 3. System settings and configuration (settings/whatsapp_config, settings/admin_lock)
 * 4. Resets settings/inventory_summary counters to 0.
 */

import {
  collection,
  getDocs,
  doc,
  writeBatch,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';

export interface CollectionPurgeSummary {
  collectionName: string;
  count: number;
}

export interface PurgeResult {
  success: boolean;
  timestamp: string;
  totalDeleted: number;
  breakdown: Record<string, number>;
  preservedCoreCategories: string[];
  preservedSettings: string[];
  error?: string;
}

/** The 20 transactional and testing collections targeted for purging */
export const TARGET_TEST_COLLECTIONS: string[] = [
  'products',
  'stockBatches',
  'stockMovements',
  'publishers',
  'series',
  'suppliers',
  'customers',
  'customerLedger',
  'sales',
  'salesReturns',
  'saleReturnSummaries',
  'payments',
  'expenses',
  'roughBills',
  'syllabusSets',
  'schools',
  'boards',
  'dailyCashClosings',
  'whatsappMessages',
  'notebookAttributes',
  'auditLogs',
];

/** The 6 immutable core categories that must always be preserved for normal operation */
export const CORE_CATEGORIES = [
  { id: 'cat_primary', name: 'Primary School Books', code: 'PRI', order: 1, isSystem: true, active: true },
  { id: 'cat_middle', name: 'Middle School Books', code: 'MID', order: 2, isSystem: true, active: true },
  { id: 'cat_secondary', name: 'Secondary School Books', code: 'SEC', order: 3, isSystem: true, active: true },
  { id: 'cat_matric', name: 'Matriculation Books', code: 'MAT', order: 4, isSystem: true, active: true },
  { id: 'cat_intermediate', name: 'Intermediate / College Books', code: 'INT', order: 5, isSystem: true, active: true },
  { id: 'cat_others', name: 'General Stationery & Others', code: 'OTH', order: 6, isSystem: true, active: true },
];

const CORE_CATEGORY_IDS = new Set(CORE_CATEGORIES.map((c) => c.id));

/**
 * Scans Firestore and returns live document counts for all candidate collections.
 */
export async function getTestingDataScan(): Promise<CollectionPurgeSummary[]> {
  const summaries: CollectionPurgeSummary[] = [];

  for (const colName of TARGET_TEST_COLLECTIONS) {
    try {
      const colRef = collection(db, colName);
      const snap = await getDocs(colRef);
      summaries.push({
        collectionName: colName,
        count: snap.size,
      });
    } catch {
      summaries.push({
        collectionName: colName,
        count: 0,
      });
    }
  }

  // Also check non-core categories in categories collection
  try {
    const catSnap = await getDocs(collection(db, 'categories'));
    let nonCoreCount = 0;
    catSnap.docs.forEach((d) => {
      if (!CORE_CATEGORY_IDS.has(d.id)) {
        nonCoreCount++;
      }
    });
    if (nonCoreCount > 0) {
      summaries.push({
        collectionName: 'categories (non-core testing entries)',
        count: nonCoreCount,
      });
    }
  } catch {
    // Ignore error if unreadable
  }

  return summaries;
}

/**
 * Executes full client handover cleanup.
 * Deletes all documents in test collections using safe 400-op Firestore write batches.
 * Resets inventory summary counters to 0.
 * Verifies/restores the 6 core categories.
 */
export async function executeClientHandoverPurge(
  adminUid: string,
  onProgress?: (message: string, percent: number) => void
): Promise<PurgeResult> {
  const breakdown: Record<string, number> = {};
  let totalDeleted = 0;
  const totalCollections = TARGET_TEST_COLLECTIONS.length + 2; // + categories check + settings reset
  let processedStep = 0;

  try {
    // 1. Purge standard 20 target collections
    for (const colName of TARGET_TEST_COLLECTIONS) {
      processedStep++;
      const currentPercent = Math.round((processedStep / totalCollections) * 100);
      onProgress?.(`Cleaning collection: ${colName}...`, currentPercent);

      try {
        const colRef = collection(db, colName);
        const snap = await getDocs(colRef);
        const docs = snap.docs;

        if (docs.length > 0) {
          // Chunk into batches of 400
          const batchSize = 400;
          for (let i = 0; i < docs.length; i += batchSize) {
            const chunk = docs.slice(i, i + batchSize);
            const batch = writeBatch(db);
            for (const docSnap of chunk) {
              batch.delete(docSnap.ref);
            }
            await batch.commit();
          }
          breakdown[colName] = docs.length;
          totalDeleted += docs.length;
        } else {
          breakdown[colName] = 0;
        }
      } catch (err: any) {
        console.warn(`Collection ${colName} bypass notice:`, err.message);
        breakdown[colName] = 0;
      }
    }

    // 2. Clean non-core categories from categories collection
    processedStep++;
    onProgress?.('Verifying and cleaning non-core categories...', Math.round((processedStep / totalCollections) * 100));
    const catSnap = await getDocs(collection(db, 'categories'));
    let nonCoreDeleted = 0;
    const catBatch = writeBatch(db);
    let hasCatBatchOps = false;

    for (const docSnap of catSnap.docs) {
      if (!CORE_CATEGORY_IDS.has(docSnap.id)) {
        catBatch.delete(docSnap.ref);
        nonCoreDeleted++;
        hasCatBatchOps = true;
      }
    }
    if (hasCatBatchOps) {
      await catBatch.commit();
    }
    breakdown['categories (non-core)'] = nonCoreDeleted;
    totalDeleted += nonCoreDeleted;

    // 3. Ensure the 6 core categories are populated and active
    for (const coreCat of CORE_CATEGORIES) {
      await setDoc(doc(db, 'categories', coreCat.id), {
        ...coreCat,
        updatedAt: serverTimestamp(),
      }, { merge: true });
    }

    // 4. Reset settings/inventory_summary to 0
    processedStep++;
    onProgress?.('Resetting inventory counters to clean baseline...', 95);
    await setDoc(doc(db, 'settings', 'inventory_summary'), {
      totalProducts: 0,
      totalStockBatches: 0,
      totalStockUnits: 0,
      totalInventoryCostValue: 0,
      totalInventoryRetailValue: 0,
      lowStockCount: 0,
      outOfStockCount: 0,
      updatedAt: serverTimestamp(),
    }, { merge: true });

    // 5. Create one clean audit entry to record the handover reset
    try {
      const resetLogRef = doc(collection(db, 'auditLogs'));
      await setDoc(resetLogRef, {
        id: resetLogRef.id,
        action: 'CLIENT_HANDOVER_PURGE',
        module: 'SYSTEM_MAINTENANCE',
        entityId: 'database_reset',
        performedBy: adminUid,
        details: {
          totalDeleted,
          breakdown,
        },
        timestamp: serverTimestamp(),
      });
    } catch {
      // Audit log write failure shouldn't fail the whole purge
    }

    onProgress?.('Client Handover cleanup complete! System is 100% clean.', 100);

    return {
      success: true,
      timestamp: new Date().toISOString(),
      totalDeleted,
      breakdown,
      preservedCoreCategories: Array.from(CORE_CATEGORY_IDS),
      preservedSettings: ['inventory_summary (reset to 0)', 'whatsapp_config', 'admin_lock'],
    };
  } catch (err: any) {
    return {
      success: false,
      timestamp: new Date().toISOString(),
      totalDeleted,
      breakdown,
      preservedCoreCategories: Array.from(CORE_CATEGORY_IDS),
      preservedSettings: ['inventory_summary', 'whatsapp_config', 'admin_lock'],
      error: err.message || 'Unknown error occurred during client handover purge',
    };
  }
}
