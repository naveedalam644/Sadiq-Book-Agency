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
import type {
  SaleDocument,
  SaleReturnDocument,
  ProductDocument,
  PurchaseDocument,
} from '../types/database';
import {
  getClassSortRank,
  compareProductsByClassSequence,
} from '../utils/purchaseFormHelpers';

export interface PublisherProductDetailMetrics {
  productId: string;
  productTitle: string;
  sku: string;
  seriesId?: string;
  seriesName?: string;
  targetClass?: string;
  className?: string;
  classRank: number;
  // Current Shop Stock on Hand ("hamare pas kitna para hai")
  stockOnHand: number;
  stockCostValue: number;
  stockRetailValue: number;
  costPrice: number;
  retailPrice: number;
  // Purchases Inflow in Period
  purchasedQty: number;
  purchasedAmount: number;
  // Sales Performance in Period ("kitan sold howa hai")
  soldQty: number;
  returnedQty: number;
  quantity: number; // Net Sold Units (backward compatible alias)
  grossSales: number;
  returnAmount: number;
  netAmount: number; // Net Sales PKR (backward compatible alias)
  // Financial Hisab (COGS, Profit, Margin)
  costOfGoodsSold: number;
  grossProfit: number;
  grossMarginPercent: number;
}

export interface PublisherSeriesMetrics {
  seriesId?: string;
  seriesName: string;
  totalProductsCount: number;
  // Current Shop Stock on Hand ("ye series ka mal hamare pas kitna para hai")
  stockQuantity: number;
  stockCostValue: number;
  stockRetailValue: number;
  // Purchases Inflow in Period
  purchasedQuantity: number;
  totalPurchasedAmount: number;
  // Sales Performance in Period ("kitan sold howa hai")
  salesQuantity: number;
  returnedQuantity: number;
  netSalesQuantity: number;
  grossSalesAmount: number;
  returnAmount: number;
  netSales: number;
  // Financial Hisab (COGS, Profit, Margin)
  costOfGoodsSold: number;
  grossProfit: number;
  grossMarginPercent: number;
  // Itemized Single Products under this series (sorted in class sequence PG -> 10th)
  products: PublisherProductDetailMetrics[];
}

export interface PublisherPeriodMetrics {
  publisherName: string;
  // Current Shop Stock on Hand ("kis publisher ka stock hamare pass kitne paiso ka para hai")
  currentStockQuantity: number;
  currentStockCostValue: number;
  currentStockRetailValue: number;
  // Purchases Inflow ("kitna us se purchase kia hai")
  purchasedQuantity: number;
  totalPurchasedAmount: number;
  // Sales Performance ("kitna sell hogaya hai")
  salesQuantity: number;
  grossSalesAmount: number;
  returnedQuantity: number;
  returnAmount: number;
  netSales: number;
  costOfGoodsSold: number;
  grossProfit: number;
  grossMarginPercent: number;
  // Series Breakdown ("publisher ke sat series ka be pata ho... pora hisab ho")
  seriesBreakdown: PublisherSeriesMetrics[];
  // Flat Top Products (backward compatible)
  topProducts: PublisherProductDetailMetrics[];
}

export interface PublisherAnalyticsReport {
  periodName: string;
  startDate: string;
  endDate: string;
  publishers: PublisherPeriodMetrics[];
  summary: {
    totalStockQuantity: number;
    totalStockCostValue: number;
    totalPurchasedQuantity: number;
    totalPurchasedAmount: number;
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
 * Generates Publisher Stock, Purchases, Sales & Profitability Analytics for any date range.
 * Answers:
 * 1. Current stock on hand in shop & PKR value ("kis publisher ka stock hamare pass kitne paiso ka para hai")
 * 2. Total purchased units and cost ("kitna us se purchase kia hai")
 * 3. Total sold units and net sales ("kitna sell hogaya hai")
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
        totalStockQuantity: 0,
        totalStockCostValue: 0,
        totalPurchasedQuantity: 0,
        totalPurchasedAmount: 0,
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
  interface ProductAgg {
    productId: string;
    title: string;
    sku: string;
    seriesId?: string;
    seriesName: string;
    targetClass?: string;
    className?: string;
    classRank: number;
    costPrice: number;
    retailPrice: number;
    stockOnHand: number;
    stockCostValue: number;
    stockRetailValue: number;
    purchasedQty: number;
    purchasedAmount: number;
    soldQty: number;
    returnedQty: number;
    grossSales: number;
    returnAmount: number;
    grossCogs: number;
    returnedCogs: number;
  }

  interface AggBucket {
    publisherName: string;
    currentStockQty: number;
    currentStockCostValue: number;
    currentStockRetailValue: number;
    purchasedQty: number;
    totalPurchasedAmount: number;
    salesQty: number;
    grossSales: number;
    returnedQty: number;
    returnAmount: number;
    grossCogs: number;
    returnedCogs: number;
    productsMap: Map<string, ProductAgg>;
  }

  const buckets = new Map<string, AggBucket>();

  const getBucket = (name?: string | null): AggBucket => {
    const norm = normalizePublisherName(name);
    if (!buckets.has(norm)) {
      buckets.set(norm, {
        publisherName: norm,
        currentStockQty: 0,
        currentStockCostValue: 0,
        currentStockRetailValue: 0,
        purchasedQty: 0,
        totalPurchasedAmount: 0,
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

  // Map product IDs to their authoritative ProductDocument & publisher name
  const productIdToProduct = new Map<string, ProductDocument>();
  const productIdToPublisher = new Map<string, string>();

  // 1. Fetch all products to calculate Current Shop Stock on Hand & Value per publisher
  try {
    const productsSnap = await getDocs(collection(db, 'products'));
    for (const docSnap of productsSnap.docs) {
      const prod = docSnap.data() as ProductDocument;
      productIdToProduct.set(docSnap.id, prod);
      const pubName = normalizePublisherName(prod.publisherName);
      productIdToPublisher.set(docSnap.id, pubName);

      const b = getBucket(pubName);
      const stock = Number(prod.currentStock) || 0;
      const cost = Number(prod.costPrice) || 0;
      const retail = Number(prod.retailPrice) || 0;

      b.currentStockQty += stock;
      b.currentStockCostValue += stock * cost;
      b.currentStockRetailValue += stock * retail;

      const pId = docSnap.id;
      const sName = (prod.seriesName || '').trim() || 'General / Standalone Books';
      if (!b.productsMap.has(pId)) {
        b.productsMap.set(pId, {
          productId: pId,
          title: prod.title,
          sku: prod.sku,
          seriesId: prod.seriesId,
          seriesName: sName,
          targetClass: prod.targetClass,
          className: prod.className,
          classRank: getClassSortRank(prod),
          costPrice: cost,
          retailPrice: retail,
          stockOnHand: stock,
          stockCostValue: stock * cost,
          stockRetailValue: stock * retail,
          purchasedQty: 0,
          purchasedAmount: 0,
          soldQty: 0,
          returnedQty: 0,
          grossSales: 0,
          returnAmount: 0,
          grossCogs: 0,
          returnedCogs: 0,
        });
      } else {
        const pEntry = b.productsMap.get(pId)!;
        pEntry.stockOnHand += stock;
        pEntry.stockCostValue += stock * cost;
        pEntry.stockRetailValue += stock * retail;
      }
    }
  } catch (err) {
    console.warn('Could not aggregate product stock for publisher analytics:', err);
  }

  // 2. Fetch purchases in the period to calculate Inflow & Purchase Costs per publisher
  try {
    const purchasesConstraints: any[] = [
      where('purchaseDate', '>=', cleanStart),
      where('purchaseDate', '<=', cleanEndBound),
      orderBy('purchaseDate', 'asc'),
      limit(500),
    ];
    const purchasesSnap = await getDocs(query(collection(db, 'purchases'), ...purchasesConstraints));
    for (const docSnap of purchasesSnap.docs) {
      const purchase = docSnap.data() as PurchaseDocument;
      for (const item of purchase.items || []) {
        const prod = item.productId ? productIdToProduct.get(item.productId) : undefined;
        let pubName = (item as any).publisherName;
        if (!pubName && item.productId) {
          pubName = productIdToPublisher.get(item.productId);
        }
        if (!pubName && prod) {
          pubName = prod.publisherName;
        }
        const b = getBucket(pubName);
        const itemQty = Number(item.quantity) || 0;
        const itemCost = Number(item.totalCost) || (itemQty * (Number(item.unitCost) || 0));

        b.purchasedQty += itemQty;
        b.totalPurchasedAmount += itemCost;

        const pId = item.productId || item.productName;
        const itemAny = item as any;
        const sName = (itemAny.seriesName || prod?.seriesName || '').trim() || 'General / Standalone Books';
        if (!b.productsMap.has(pId)) {
          b.productsMap.set(pId, {
            productId: pId,
            title: item.productName,
            sku: itemAny.sku || prod?.sku || '',
            seriesId: itemAny.seriesId || prod?.seriesId,
            seriesName: sName,
            targetClass: itemAny.targetClass || prod?.targetClass,
            className: prod?.className,
            classRank: getClassSortRank({ targetClass: itemAny.targetClass || prod?.targetClass, title: item.productName }),
            costPrice: Number(item.unitCost) || prod?.costPrice || 0,
            retailPrice: Number((item as any).mrp) || prod?.retailPrice || 0,
            stockOnHand: 0,
            stockCostValue: 0,
            stockRetailValue: 0,
            purchasedQty: itemQty,
            purchasedAmount: itemCost,
            soldQty: 0,
            returnedQty: 0,
            grossSales: 0,
            returnAmount: 0,
            grossCogs: 0,
            returnedCogs: 0,
          });
        } else {
          const pEntry = b.productsMap.get(pId)!;
          pEntry.purchasedQty += itemQty;
          pEntry.purchasedAmount += itemCost;
        }
      }
    }
  } catch (err) {
    console.warn('Could not aggregate purchases for publisher analytics:', err);
  }

  // 3. Fetch all matching Sales using cursor pagination (Batches of 500)
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
        const prod = item.productId ? productIdToProduct.get(item.productId) : undefined;
        let pubName = item.publisherName;
        if (!pubName && item.productId) {
          pubName = productIdToPublisher.get(item.productId);
        }
        if (!pubName && prod) {
          pubName = prod.publisherName;
        }
        const b = getBucket(pubName);
        b.salesQty += item.quantity;
        b.grossSales += item.lineTotal;
        const unitCost = Number((item as any).costPrice) || prod?.costPrice || 0;
        b.grossCogs += unitCost * item.quantity;

        // Product breakdown
        const pId = item.productId;
        const sName = (item.seriesName || prod?.seriesName || '').trim() || 'General / Standalone Books';
        if (!b.productsMap.has(pId)) {
          b.productsMap.set(pId, {
            productId: pId,
            title: item.productName,
            sku: item.sku,
            seriesId: prod?.seriesId,
            seriesName: sName,
            targetClass: item.targetClass || prod?.targetClass,
            className: prod?.className,
            classRank: getClassSortRank({ targetClass: item.targetClass || prod?.targetClass, title: item.productName }),
            costPrice: unitCost,
            retailPrice: item.unitPrice || prod?.retailPrice || 0,
            stockOnHand: 0,
            stockCostValue: 0,
            stockRetailValue: 0,
            purchasedQty: 0,
            purchasedAmount: 0,
            soldQty: item.quantity,
            returnedQty: 0,
            grossSales: item.lineTotal,
            returnAmount: 0,
            grossCogs: unitCost * item.quantity,
            returnedCogs: 0,
          });
        } else {
          const prodEntry = b.productsMap.get(pId)!;
          prodEntry.soldQty += item.quantity;
          prodEntry.grossSales += item.lineTotal;
          prodEntry.grossCogs += unitCost * item.quantity;
        }
      }
    }

    if (salesSnap.docs.length < 500) {
      hasMoreSales = false;
    } else {
      lastSalesDoc = salesSnap.docs[salesSnap.docs.length - 1];
    }
  }

  // 4. Fetch all matching Returns using cursor pagination (Batches of 200)
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
        const prod = item.productId ? productIdToProduct.get(item.productId) : undefined;
        let pubName = item.publisherName;
        if (!pubName && item.productId) {
          pubName = productIdToPublisher.get(item.productId);
        }
        if (!pubName && prod) {
          pubName = prod.publisherName;
        }
        const b = getBucket(pubName);
        b.returnedQty += item.quantity;
        b.returnAmount += item.refundLineTotal;
        const unitCost = Number(item.originalCostPrice) || prod?.costPrice || 0;
        b.returnedCogs += unitCost * item.quantity;

        // Deduct from product breakdown
        const pId = item.productId;
        if (b.productsMap.has(pId)) {
          const prodEntry = b.productsMap.get(pId)!;
          prodEntry.returnedQty += item.quantity;
          prodEntry.returnAmount += item.refundLineTotal;
          prodEntry.returnedCogs += unitCost * item.quantity;
        }
      }
    }

    if (returnsSnap.docs.length < 200) {
      hasMoreReturns = false;
    } else {
      lastReturnsDoc = returnsSnap.docs[returnsSnap.docs.length - 1];
    }
  }

  // 5. Calculate Metrics per Publisher
  const publisherList: PublisherPeriodMetrics[] = [];

  let totStockQty = 0;
  let totStockCostVal = 0;
  let totPurchasedQty = 0;
  let totPurchasedAmt = 0;
  let totSalesQty = 0;
  let totGross = 0;
  let totRetQty = 0;
  let totRetAmt = 0;
  let totNetSales = 0;
  let totNetCogs = 0;
  let totGrossProfit = 0;

  for (const b of buckets.values()) {
    // Only skip buckets that have 0 stock, 0 purchases, and 0 sales
    if (
      b.currentStockQty === 0 &&
      b.purchasedQty === 0 &&
      b.salesQty === 0 &&
      b.returnedQty === 0
    ) {
      continue;
    }

    const netSales = Math.round((b.grossSales - b.returnAmount) * 100) / 100;
    const netCogs = Math.round((b.grossCogs - b.returnedCogs) * 100) / 100;
    const grossProfit = Math.round((netSales - netCogs) * 100) / 100;
    const margin = netSales > 0 ? Math.round((grossProfit / netSales) * 1000) / 10 : 0;

    // Calculate Individual Product Metrics
    const productMetricsList: PublisherProductDetailMetrics[] = Array.from(b.productsMap.values()).map((p) => {
      const netSold = p.soldQty - p.returnedQty;
      const prodNetSales = Math.round((p.grossSales - p.returnAmount) * 100) / 100;
      const prodNetCogs = Math.round((p.grossCogs - p.returnedCogs) * 100) / 100;
      const prodProfit = Math.round((prodNetSales - prodNetCogs) * 100) / 100;
      const prodMargin = prodNetSales > 0 ? Math.round((prodProfit / prodNetSales) * 1000) / 10 : 0;

      return {
        productId: p.productId,
        productTitle: p.title,
        sku: p.sku,
        seriesId: p.seriesId,
        seriesName: p.seriesName,
        targetClass: p.targetClass,
        className: p.className,
        classRank: p.classRank || getClassSortRank({ targetClass: p.targetClass, className: p.className, title: p.title }),
        costPrice: p.costPrice,
        retailPrice: p.retailPrice,
        stockOnHand: p.stockOnHand,
        stockCostValue: Math.round(p.stockCostValue * 100) / 100,
        stockRetailValue: Math.round(p.stockRetailValue * 100) / 100,
        purchasedQty: p.purchasedQty,
        purchasedAmount: Math.round(p.purchasedAmount * 100) / 100,
        soldQty: p.soldQty,
        returnedQty: p.returnedQty,
        quantity: netSold, // Backward compatible
        grossSales: Math.round(p.grossSales * 100) / 100,
        returnAmount: Math.round(p.returnAmount * 100) / 100,
        netAmount: prodNetSales, // Backward compatible
        costOfGoodsSold: prodNetCogs,
        grossProfit: prodProfit,
        grossMarginPercent: prodMargin,
      };
    });

    // Group Products by Series
    const seriesMap = new Map<string, PublisherProductDetailMetrics[]>();
    for (const prod of productMetricsList) {
      const sName = prod.seriesName || 'General / Standalone Books';
      if (!seriesMap.has(sName)) {
        seriesMap.set(sName, []);
      }
      seriesMap.get(sName)!.push(prod);
    }

    const seriesBreakdown: PublisherSeriesMetrics[] = [];
    for (const [serName, seriesProds] of seriesMap.entries()) {
      // Sort single products strictly in natural academic class sequence!
      seriesProds.sort(compareProductsByClassSequence);

      let sStockQty = 0;
      let sStockCostVal = 0;
      let sStockRetailVal = 0;
      let sPurchasedQty = 0;
      let sPurchasedAmt = 0;
      let sSoldQty = 0;
      let sRetQty = 0;
      let sGrossSales = 0;
      let sRetAmt = 0;
      let sCogs = 0;

      for (const sp of seriesProds) {
        sStockQty += sp.stockOnHand;
        sStockCostVal += sp.stockCostValue;
        sStockRetailVal += sp.stockRetailValue;
        sPurchasedQty += sp.purchasedQty;
        sPurchasedAmt += sp.purchasedAmount;
        sSoldQty += sp.soldQty;
        sRetQty += sp.returnedQty;
        sGrossSales += sp.grossSales;
        sRetAmt += sp.returnAmount;
        sCogs += sp.costOfGoodsSold;
      }

      const sNetSold = sSoldQty - sRetQty;
      const sNetSales = Math.round((sGrossSales - sRetAmt) * 100) / 100;
      const sNetCogs = Math.round(sCogs * 100) / 100;
      const sProfit = Math.round((sNetSales - sNetCogs) * 100) / 100;
      const sMargin = sNetSales > 0 ? Math.round((sProfit / sNetSales) * 1000) / 10 : 0;

      seriesBreakdown.push({
        seriesId: seriesProds[0]?.seriesId,
        seriesName: serName,
        totalProductsCount: seriesProds.length,
        stockQuantity: sStockQty,
        stockCostValue: Math.round(sStockCostVal * 100) / 100,
        stockRetailValue: Math.round(sStockRetailVal * 100) / 100,
        purchasedQuantity: sPurchasedQty,
        totalPurchasedAmount: Math.round(sPurchasedAmt * 100) / 100,
        salesQuantity: sSoldQty,
        returnedQuantity: sRetQty,
        netSalesQuantity: sNetSold,
        grossSalesAmount: Math.round(sGrossSales * 100) / 100,
        returnAmount: Math.round(sRetAmt * 100) / 100,
        netSales: sNetSales,
        costOfGoodsSold: sNetCogs,
        grossProfit: sProfit,
        grossMarginPercent: sMargin,
        products: seriesProds,
      });
    }

    // Sort series: primarily by net sales descending, then stock cost value descending
    seriesBreakdown.sort((s1, s2) => {
      if (s2.netSales !== s1.netSales) return s2.netSales - s1.netSales;
      return s2.stockCostValue - s1.stockCostValue;
    });

    // Top products: sorted primarily by net sales descending, then stock on hand descending
    const topProducts = [...productMetricsList].sort((p1, p2) => {
      if (p2.netAmount !== p1.netAmount) return p2.netAmount - p1.netAmount;
      return p2.stockOnHand - p1.stockOnHand;
    });

    publisherList.push({
      publisherName: b.publisherName,
      currentStockQuantity: b.currentStockQty,
      currentStockCostValue: Math.round(b.currentStockCostValue * 100) / 100,
      currentStockRetailValue: Math.round(b.currentStockRetailValue * 100) / 100,
      purchasedQuantity: b.purchasedQty,
      totalPurchasedAmount: Math.round(b.totalPurchasedAmount * 100) / 100,
      salesQuantity: b.salesQty,
      grossSalesAmount: Math.round(b.grossSales * 100) / 100,
      returnedQuantity: b.returnedQty,
      returnAmount: Math.round(b.returnAmount * 100) / 100,
      netSales,
      costOfGoodsSold: netCogs,
      grossProfit,
      grossMarginPercent: margin,
      seriesBreakdown,
      topProducts,
    });

    totStockQty += b.currentStockQty;
    totStockCostVal += b.currentStockCostValue;
    totPurchasedQty += b.purchasedQty;
    totPurchasedAmt += b.totalPurchasedAmount;
    totSalesQty += b.salesQty;
    totGross += b.grossSales;
    totRetQty += b.returnedQty;
    totRetAmt += b.returnAmount;
    totNetSales += netSales;
    totNetCogs += netCogs;
    totGrossProfit += grossProfit;
  }

  // Sort primarily by net sales descending, secondarily by current stock cost value
  publisherList.sort((a, b) => {
    if (b.netSales !== a.netSales) return b.netSales - a.netSales;
    return b.currentStockCostValue - a.currentStockCostValue;
  });

  const avgMargin = totNetSales > 0 ? Math.round((totGrossProfit / totNetSales) * 1000) / 10 : 0;
  const warnings = detectFuzzyDuplicateWarnings(Array.from(buckets.keys()));

  const report: PublisherAnalyticsReport = {
    periodName: periodLabel,
    startDate,
    endDate,
    publishers: publisherList,
    summary: {
      totalStockQuantity: totStockQty,
      totalStockCostValue: Math.round(totStockCostVal * 100) / 100,
      totalPurchasedQuantity: totPurchasedQty,
      totalPurchasedAmount: Math.round(totPurchasedAmt * 100) / 100,
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
