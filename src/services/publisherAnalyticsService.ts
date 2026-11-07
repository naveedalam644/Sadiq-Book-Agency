import {
  collection,
  query,
  where,
  getDocs,
  limit,
  orderBy,
  startAfter,
  type QueryDocumentSnapshot,
  type DocumentData,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type { SaleDocument, SaleReturnDocument } from '../types/database';

export interface PublisherPeriodMetrics {
  publisherName: string;
  salesQuantity: number;
  grossSalesAmount: number;
  returnedQuantity: number;
  returnAmount: number;
  netSales: number;
  costOfGoodsSold: number;
  grossProfit: number;
  grossMarginPercent: number;
  topProducts: {
    productId: string;
    productTitle: string;
    sku: string;
    quantity: number;
    netAmount: number;
  }[];
}

export interface PublisherAnalyticsReport {
  periodName: string;
  startDate: string;
  endDate: string;
  publishers: PublisherPeriodMetrics[];
  summary: {
    totalSalesQuantity: number;
    totalGrossSales: number;
    totalReturnedQuantity: number;
    totalReturnAmount: number;
    totalNetSales: number;
    totalCogs: number;
    totalGrossProfit: number;
    averageMarginPercent: number;
  };
  warnings: string[];
}

/**
 * Normalizes publisher name according to strict specification:
 * - Collapses repeated spaces to a single space.
 * - Trims leading and trailing whitespace.
 * - Preserves official spelling, case and acronyms.
 * - Missing or blank becomes literal 'Unknown'.
 * - NEVER falls back to author or authorOrPublisher.
 */
export const normalizePublisherName = (raw?: string | null): string => {
  if (!raw || typeof raw !== 'string') return 'Unknown';
  const collapsed = raw.replace(/\s+/g, ' ').trim();
  return collapsed.length > 0 ? collapsed : 'Unknown';
};

/**
 * Checks for potential fuzzy duplicates across publisher names
 * (e.g. Case mismatch or trailing period) to warn the accountant.
 */
export const detectFuzzyDuplicateWarnings = (publisherNames: string[]): string[] => {
  const warnings: string[] = [];
  const lowerMap = new Map<string, string[]>();

  for (const name of publisherNames) {
    const key = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!lowerMap.has(key)) {
      lowerMap.set(key, []);
    }
    const list = lowerMap.get(key)!;
    if (!list.includes(name)) {
      list.push(name);
    }
  }

  for (const [_, list] of lowerMap.entries()) {
    if (list.length > 1) {
      warnings.push(
        `Potential duplicate publisher names detected: [${list.join(', ')}]. Kept separate per policy.`
      );
    }
  }

  return warnings;
};

// In-Memory Analytics Cache (TTL: 5 minutes)
const analyticsCache = new Map<string, { report: PublisherAnalyticsReport; timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

export const invalidatePublisherAnalyticsCache = (): void => {
  analyticsCache.clear();
};

/**
 * Generates Publisher Sales & Profitability Analytics for any date range.
 * Cost Protection:
 * - Queries are bounded with limit(500) per period.
 * - In-memory aggregation across immutable sale and return snapshots.
 * - Cached for 5 minutes.
 */
export const getPublisherAnalyticsReport = async (
  startDate: string,
  endDate: string,
  periodLabel = 'Custom Period'
): Promise<PublisherAnalyticsReport> => {
  const cacheKey = `${startDate}_${endDate}_${periodLabel}`;
  const cached = analyticsCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.report;
  }

  if (!db) {
    return {
      periodName: periodLabel,
      startDate,
      endDate,
      publishers: [],
      summary: {
        totalSalesQuantity: 0,
        totalGrossSales: 0,
        totalReturnedQuantity: 0,
        totalReturnAmount: 0,
        totalNetSales: 0,
        totalCogs: 0,
        totalGrossProfit: 0,
        averageMarginPercent: 0,
      },
      warnings: [],
    };
  }

  const cleanStart = startDate.split('T')[0];
  const cleanEnd = endDate.split('T')[0];
  const cleanEndBound = cleanEnd + '\uf8ff';

  // Publisher Aggregation Buckets
  interface AggBucket {
    publisherName: string;
    salesQty: number;
    grossSales: number;
    returnedQty: number;
    returnAmount: number;
    grossCogs: number;
    returnedCogs: number;
    productsMap: Map<string, { title: string; sku: string; qty: number; netAmount: number }>;
  }

  const buckets = new Map<string, AggBucket>();

  const getBucket = (name?: string | null): AggBucket => {
    const norm = normalizePublisherName(name);
    if (!buckets.has(norm)) {
      buckets.set(norm, {
        publisherName: norm,
        salesQty: 0,
        grossSales: 0,
        returnedQty: 0,
        returnAmount: 0,
        grossCogs: 0,
        returnedCogs: 0,
        productsMap: new Map(),
      });
    }
    return buckets.get(norm)!;
  };

  // 1. Fetch all matching Sales using cursor pagination (Unlimited, Bounded by Batches of 500)
  let lastSalesDoc: QueryDocumentSnapshot<DocumentData> | null = null;
  let hasMoreSales = true;

  while (hasMoreSales) {
    const salesConstraints: any[] = [
      where('saleDate', '>=', cleanStart),
      where('saleDate', '<=', cleanEndBound),
      orderBy('saleDate', 'asc'),
      limit(500),
    ];
    if (lastSalesDoc) {
      salesConstraints.push(startAfter(lastSalesDoc));
    }

    const salesSnap = await getDocs(query(collection(db, 'sales'), ...salesConstraints));
    if (salesSnap.empty) break;

    for (const doc of salesSnap.docs) {
      const sale = doc.data() as SaleDocument;
      for (const item of sale.items) {
        const b = getBucket(item.publisherName);
        b.salesQty += item.quantity;
        b.grossSales += item.lineTotal;
        const unitCost = Number((item as any).costPrice) || 0;
        b.grossCogs += unitCost * item.quantity;

        // Product breakdown
        const pId = item.productId;
        if (!b.productsMap.has(pId)) {
          b.productsMap.set(pId, { title: item.productName, sku: item.sku, qty: 0, netAmount: 0 });
        }
        const prodEntry = b.productsMap.get(pId)!;
        prodEntry.qty += item.quantity;
        prodEntry.netAmount += item.lineTotal;
      }
    }

    if (salesSnap.docs.length < 500) {
      hasMoreSales = false;
    } else {
      lastSalesDoc = salesSnap.docs[salesSnap.docs.length - 1];
    }
  }

  // 2. Fetch all matching Returns using cursor pagination (Unlimited, Bounded by Batches of 200)
  let lastReturnsDoc: QueryDocumentSnapshot<DocumentData> | null = null;
  let hasMoreReturns = true;

  while (hasMoreReturns) {
    const returnsConstraints: any[] = [
      where('returnDate', '>=', cleanStart),
      where('returnDate', '<=', cleanEndBound),
      orderBy('returnDate', 'asc'),
      limit(200),
    ];
    if (lastReturnsDoc) {
      returnsConstraints.push(startAfter(lastReturnsDoc));
    }

    const returnsSnap = await getDocs(query(collection(db, 'salesReturns'), ...returnsConstraints));
    if (returnsSnap.empty) break;

    for (const doc of returnsSnap.docs) {
      const ret = doc.data() as SaleReturnDocument;
      for (const item of ret.items) {
        const b = getBucket(item.publisherName);
        b.returnedQty += item.quantity;
        b.returnAmount += item.refundLineTotal;
        const unitCost = Number(item.originalCostPrice) || 0;
        b.returnedCogs += unitCost * item.quantity;

        // Deduct from product breakdown
        const pId = item.productId;
        if (b.productsMap.has(pId)) {
          const prodEntry = b.productsMap.get(pId)!;
          prodEntry.qty -= item.quantity;
          prodEntry.netAmount -= item.refundLineTotal;
        }
      }
    }

    if (returnsSnap.docs.length < 200) {
      hasMoreReturns = false;
    } else {
      lastReturnsDoc = returnsSnap.docs[returnsSnap.docs.length - 1];
    }
  }

  // Calculate Metrics per Publisher
  const publisherList: PublisherPeriodMetrics[] = [];

  let totSalesQty = 0;
  let totGross = 0;
  let totRetQty = 0;
  let totRetAmt = 0;
  let totNetSales = 0;
  let totNetCogs = 0;
  let totGrossProfit = 0;

  for (const b of buckets.values()) {
    const netSales = Math.round((b.grossSales - b.returnAmount) * 100) / 100;
    const netCogs = Math.round((b.grossCogs - b.returnedCogs) * 100) / 100;
    const grossProfit = Math.round((netSales - netCogs) * 100) / 100;
    const margin = netSales > 0 ? Math.round((grossProfit / netSales) * 1000) / 10 : 0;

    const topProducts = Array.from(b.productsMap.entries())
      .map(([id, val]) => ({
        productId: id,
        productTitle: val.title,
        sku: val.sku,
        quantity: val.qty,
        netAmount: Math.round(val.netAmount * 100) / 100,
      }))
      .sort((p1, p2) => p2.netAmount - p1.netAmount);

    publisherList.push({
      publisherName: b.publisherName,
      salesQuantity: b.salesQty,
      grossSalesAmount: Math.round(b.grossSales * 100) / 100,
      returnedQuantity: b.returnedQty,
      returnAmount: Math.round(b.returnAmount * 100) / 100,
      netSales,
      costOfGoodsSold: netCogs,
      grossProfit,
      grossMarginPercent: margin,
      topProducts,
    });

    totSalesQty += b.salesQty;
    totGross += b.grossSales;
    totRetQty += b.returnedQty;
    totRetAmt += b.returnAmount;
    totNetSales += netSales;
    totNetCogs += netCogs;
    totGrossProfit += grossProfit;
  }

  // Sort by net sales descending
  publisherList.sort((a, b) => b.netSales - a.netSales);

  const avgMargin = totNetSales > 0 ? Math.round((totGrossProfit / totNetSales) * 1000) / 10 : 0;
  const warnings = detectFuzzyDuplicateWarnings(Array.from(buckets.keys()));

  const report: PublisherAnalyticsReport = {
    periodName: periodLabel,
    startDate,
    endDate,
    publishers: publisherList,
    summary: {
      totalSalesQuantity: totSalesQty,
      totalGrossSales: Math.round(totGross * 100) / 100,
      totalReturnedQuantity: totRetQty,
      totalReturnAmount: Math.round(totRetAmt * 100) / 100,
      totalNetSales: Math.round(totNetSales * 100) / 100,
      totalCogs: Math.round(totNetCogs * 100) / 100,
      totalGrossProfit: Math.round(totGrossProfit * 100) / 100,
      averageMarginPercent: avgMargin,
    },
    warnings,
  };

  analyticsCache.set(cacheKey, { report, timestamp: Date.now() });
  return report;
};
