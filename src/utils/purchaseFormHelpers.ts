import type {
  ProductDocument,
  ItemClassification,
} from '../types/database';

export interface PurchaseItemRow {
  productId: string;
  productName: string;
  sku?: string;
  categoryName?: string;
  classification?: ItemClassification;
  authorOrPublisher?: string;
  currentStock?: number;
  unit?: string;
  mrp: number | '';
  publisherDiscountPercent: number | '';
  quantity: number | '';
  unitCost: number | '';
  totalCost: number;
}

export const CORE_CATEGORIES = [
  'Primary',
  'Middle',
  'Matric',
  'Secondary',
  'Intermediate',
  'Others',
] as const;

export const ITEM_CLASSIFICATIONS: Array<{ value: ItemClassification; label: string }> = [
  { value: 'book', label: 'Book' },
  { value: 'notebook', label: 'Notebook' },
  { value: 'register', label: 'Register' },
  { value: 'stationery', label: 'Stationery' },
  { value: 'general', label: 'General' },
];

/**
 * Extracts unique, alphabetically sorted Author or Publishing House names
 * from existing product records. Ignores empty values and prevents duplicates.
 */
export const getUniqueAuthorsOrPublishers = (products: ProductDocument[]): string[] => {
  const seen = new Set<string>();
  const results: string[] = [];

  for (const p of products) {
    const val = (p.authorOrPublisher || '').trim();
    if (val) {
      const lower = val.toLowerCase();
      if (!seen.has(lower)) {
        seen.add(lower);
        results.push(val);
      }
    }
  }

  return results.sort((a, b) => a.localeCompare(b));
};

/**
 * Normalizes class strings for matching: strips spaces, slashes, and punctuation.
 * e.g. "Play Group" -> "playgroup", "Prep / KG" -> "prepkg"
 */
export const normalizeClassString = (val?: string): string => {
  if (!val) return '';
  return val.toLowerCase().replace(/[^a-z0-9]/g, '');
};

/**
 * Extracts academic class number (1 through 12) from string.
 * Strictly checks numbers 1 to 12 with word boundaries to avoid false positives (e.g. 100 pages).
 * e.g. "Class 9" -> 9, "9th" -> 9, "Class 10" -> 10, "10" -> 10
 */
export const extractClassNumber = (val?: string): number | null => {
  if (!val) return null;
  const match = val.match(/\b(?:class|grade)?\s*([1-9]|1[0-2])(?:st|nd|rd|th)?\b/i);
  return match ? parseInt(match[1], 10) : null;
};

/**
 * Intelligent class hierarchy matcher handling all common academic formats:
 * - "Play Group" vs "Playgroup" vs "PG"
 * - "Prep / KG" vs "Prep" vs "KG" vs "Kindergarten"
 * - "Nursery" vs "Nur"
 * - "Class 1" through "Class 10" (strictly preventing "Class 1" from falsely matching "Class 10")
 */
export const matchesClassHierarchy = (product: ProductDocument, targetClass?: string): boolean => {
  if (!targetClass || targetClass === 'all') return true;

  const targetNorm = normalizeClassString(targetClass);
  if (!targetNorm) return true;

  const candidates = [
    product.targetClass,
    product.className,
    product.edition,
    product.title,
  ].filter(Boolean) as string[];

  // 1. Exact or substring match on normalized string
  for (const c of candidates) {
    const cNorm = normalizeClassString(c);
    if (!cNorm) continue;
    if (cNorm === targetNorm || cNorm.includes(targetNorm) || targetNorm.includes(cNorm)) {
      return true;
    }
  }

  // 2. Play Group / PG normalization
  const isTargetPG = targetNorm.includes('playgroup') || targetNorm === 'pg';
  if (isTargetPG) {
    for (const c of candidates) {
      const cNorm = normalizeClassString(c);
      if (cNorm.includes('playgroup') || cNorm.includes('playgrp') || cNorm.includes('pg')) {
        return true;
      }
    }
  }

  // 3. Prep / KG normalization
  const isTargetPrep = targetNorm.includes('prep') || targetNorm.includes('kg');
  if (isTargetPrep) {
    for (const c of candidates) {
      const cNorm = normalizeClassString(c);
      if (cNorm.includes('prep') || cNorm.includes('kg') || cNorm.includes('kindergarten')) {
        return true;
      }
    }
  }

  // 4. Nursery normalization
  const isTargetNursery = targetNorm.includes('nursery') || targetNorm.includes('nur');
  if (isTargetNursery) {
    for (const c of candidates) {
      const cNorm = normalizeClassString(c);
      if (cNorm.includes('nursery') || cNorm.includes('nur')) {
        return true;
      }
    }
  }

  // 5. Numerical class matching (Class 1 to 12)
  const targetNum = extractClassNumber(targetClass);
  if (targetNum !== null) {
    for (const field of [product.targetClass, product.className, product.edition]) {
      if (!field) continue;
      const fieldNum = extractClassNumber(field);
      if (fieldNum === targetNum) return true;
    }
    if (product.title) {
      const titleMatches = product.title.match(new RegExp(`\\b(?:class|grade)?\\s*${targetNum}\\b`, 'i'));
      if (titleMatches) return true;
    }
  }

  return false;
};

/**
 * Extracts class sequence sorting rank for a product or class title.
 * Lower classes come first:
 * 1: Play Group / Playgroup / PG / Pre-Nursery
 * 2: Nursery / Nur
 * 3: Prep / KG / Kindergarten / Prep-KG
 * 10: Class 1 / 1st / One
 * 20: Class 2 / 2nd / Two
 * ...
 * 100: Class 10 / 10th / Matric
 * 110: Class 11 / 1st Year / Inter Part 1
 * 120: Class 12 / 2nd Year / Inter Part 2
 * 999: Non-class / General
 */
export const getClassSortRank = (item?: Partial<ProductDocument> | string | null): number => {
  if (!item) return 999;

  let targetClass = '';
  let className = '';
  let edition = '';
  let title = '';

  if (typeof item === 'string') {
    title = item;
  } else {
    targetClass = (item.targetClass || '').trim();
    className = (item.className || '').trim();
    edition = (item.edition || '').trim();
    title = (item.title || '').trim();
  }

  const rawCandidates = [targetClass, className, edition, title].filter(Boolean);
  if (rawCandidates.length === 0) return 999;

  const checkEarlyChildhood = (str: string): number | null => {
    const s = str.toLowerCase();
    // 1. Play Group / PG
    if (
      s.includes('playgroup') ||
      s.includes('play group') ||
      s.includes('playgrp') ||
      /\bpg\b/i.test(s) ||
      s.includes('pre-nursery')
    ) {
      return 1;
    }
    // 2. Nursery
    if (s.includes('nursery') || /\bnur\b/i.test(s)) {
      return 2;
    }
    // 3. Prep / KG
    if (
      s.includes('prep') ||
      s.includes('kindergarten') ||
      /\bkg\b/i.test(s) ||
      /\bk\.g\b/i.test(s)
    ) {
      return 3;
    }
    return null;
  };

  // 1. Check explicit targetClass / className first
  for (const c of [targetClass, className]) {
    if (c) {
      const early = checkEarlyChildhood(c);
      if (early !== null) return early;
      const num = extractClassNumber(c);
      if (num !== null && num >= 1 && num <= 12) {
        return num * 10;
      }
    }
  }

  // 2. Check title / edition for early childhood
  for (const c of [edition, title]) {
    if (c) {
      const early = checkEarlyChildhood(c);
      if (early !== null) return early;
    }
  }

  // 3. Check title / edition for numerical class (1 to 12)
  for (const c of [edition, title]) {
    if (!c) continue;
    const num = extractClassNumber(c);
    if (num !== null && num >= 1 && num <= 12) {
      return num * 10;
    }

    // Check English word numerals (e.g. "Urdu Book One", "Urdu Book Two")
    const lower = c.toLowerCase();
    if (/\b(?:class|grade|book|part)?\s*one\b/i.test(lower)) return 10;
    if (/\b(?:class|grade|book|part)?\s*two\b/i.test(lower)) return 20;
    if (/\b(?:class|grade|book|part)?\s*three\b/i.test(lower)) return 30;
    if (/\b(?:class|grade|book|part)?\s*four\b/i.test(lower)) return 40;
    if (/\b(?:class|grade|book|part)?\s*five\b/i.test(lower)) return 50;
    if (/\b(?:class|grade|book|part)?\s*six\b/i.test(lower)) return 60;
    if (/\b(?:class|grade|book|part)?\s*seven\b/i.test(lower)) return 70;
    if (/\b(?:class|grade|book|part)?\s*eight\b/i.test(lower)) return 80;
    if (/\b(?:class|grade|book|part)?\s*nine\b/i.test(lower)) return 90;
    if (/\b(?:class|grade|book|part)?\s*ten\b/i.test(lower)) return 100;
  }

  return 999;
};

/**
 * Compare two products by natural academic class sequence:
 * Playgroup -> Nursery -> Prep / KG -> Class 1 -> Class 2 -> ... -> Class 10.
 * Ties are broken by series name, then title, then SKU.
 */
export const compareProductsByClassSequence = (
  a: Partial<ProductDocument>,
  b: Partial<ProductDocument>
): number => {
  const rankA = getClassSortRank(a);
  const rankB = getClassSortRank(b);

  if (rankA !== rankB) {
    return rankA - rankB;
  }

  // Secondary sort by seriesName if available
  const seriesA = (a.seriesName || '').trim().toLowerCase();
  const seriesB = (b.seriesName || '').trim().toLowerCase();
  if (seriesA && seriesB && seriesA !== seriesB) {
    return seriesA.localeCompare(seriesB);
  }

  // Tertiary sort by title
  const titleA = (a.title || '').trim().toLowerCase();
  const titleB = (b.title || '').trim().toLowerCase();
  if (titleA !== titleB) {
    return titleA.localeCompare(titleB);
  }

  // Quaternary sort by SKU
  const skuA = (a.sku || '').trim().toLowerCase();
  const skuB = (b.sku || '').trim().toLowerCase();
  return skuA.localeCompare(skuB);
};

/**
 * Immutably sorts an array of products by academic class sequence.
 */
export const sortProductsByClassSequence = <T extends Partial<ProductDocument>>(products: T[]): T[] => {
  return [...products].sort(compareProductsByClassSequence);
};

/**
 * Intelligent publisher matcher supporting ID, dedicated publisherName,
 * and authorOrPublisher fallback across legacy and new catalog entries.
 */
export const matchesPublisherHierarchy = (
  product: ProductDocument,
  publisherFilter?: string,
  publisherName?: string
): boolean => {
  if (!publisherFilter || publisherFilter === 'all') return true;

  const targetId = publisherFilter.trim();
  const targetName = (publisherName || '').trim().toLowerCase();

  // 1. Direct ID match
  if (product.publisherId && (product.publisherId === targetId || product.publisherId.toLowerCase() === targetId.toLowerCase())) {
    return true;
  }

  const prodPubName = (product.publisherName || '').trim().toLowerCase();
  const prodAuthorPub = (product.authorOrPublisher || '').trim().toLowerCase();

  // 2. Direct name match from publisherName parameter
  if (targetName) {
    if (prodPubName && (prodPubName === targetName || prodPubName.includes(targetName) || targetName.includes(prodPubName))) {
      return true;
    }
    if (prodAuthorPub && (prodAuthorPub === targetName || prodAuthorPub.includes(targetName) || targetName.includes(prodAuthorPub))) {
      return true;
    }
  }

  // 3. Fallback: targetId is itself a publisher name (legacy or name-based filters)
  const targetIdLower = targetId.toLowerCase();
  if (prodPubName && (prodPubName === targetIdLower || prodPubName.includes(targetIdLower) || targetIdLower.includes(prodPubName))) {
    return true;
  }
  if (prodAuthorPub && (prodAuthorPub === targetIdLower || prodAuthorPub.includes(targetIdLower) || targetIdLower.includes(prodAuthorPub))) {
    return true;
  }

  // 4. Moon Light code detection in SKU (BK-MOO / MNL)
  if (targetName.includes('moon light') || targetName.includes('moonlight') || targetIdLower.includes('moon')) {
    if (product.sku && (product.sku.toUpperCase().includes('MOO') || product.sku.toUpperCase().includes('MNL'))) {
      return true;
    }
  }

  return false;
};

export const normalizeSeriesString = (val?: string): string => {
  if (!val) return '';
  return val.toLowerCase().replace(/[^a-z0-9]/g, '').replace(/oo/g, 'o');
};

/**
 * Intelligent series matcher supporting ID, seriesName, and title substring.
 */
export const matchesSeriesHierarchy = (
  product: ProductDocument,
  seriesFilter?: string,
  seriesName?: string
): boolean => {
  if (!seriesFilter || seriesFilter === 'all') return true;

  const targetId = seriesFilter.trim();
  const targetName = (seriesName || '').trim().toLowerCase();

  // 1. Direct ID match
  if (product.seriesId && (product.seriesId === targetId || product.seriesId.toLowerCase() === targetId.toLowerCase())) {
    return true;
  }

  const prodSerName = (product.seriesName || '').trim().toLowerCase();

  // 2. Name match (exact, substring, or normalized)
  if (targetName) {
    if (prodSerName && (prodSerName === targetName || prodSerName.includes(targetName) || targetName.includes(prodSerName))) {
      return true;
    }
    if (product.title && product.title.toLowerCase().includes(targetName)) {
      return true;
    }
    // Normalized comparison (handling typos like eSCHOLOFY vs Eschoolify)
    const targetNorm = normalizeSeriesString(targetName);
    const prodNorm = normalizeSeriesString(prodSerName);
    const titleNorm = normalizeSeriesString(product.title);
    if (prodNorm && (prodNorm === targetNorm || prodNorm.includes(targetNorm) || targetNorm.includes(prodNorm))) {
      return true;
    }
    if (titleNorm && (titleNorm.includes(targetNorm) || (targetNorm.length >= 4 && titleNorm.includes(targetNorm.slice(0, 5))))) {
      return true;
    }
  }

  // 3. Fallback: targetId is series name
  const targetIdLower = targetId.toLowerCase();
  if (prodSerName && (prodSerName === targetIdLower || prodSerName.includes(targetIdLower))) {
    return true;
  }
  if (product.title && product.title.toLowerCase().includes(targetIdLower)) {
    return true;
  }
  const targetIdNorm = normalizeSeriesString(targetId);
  const titleNorm = normalizeSeriesString(product.title);
  if (titleNorm && (titleNorm.includes(targetIdNorm) || (targetIdNorm.length >= 4 && titleNorm.includes(targetIdNorm.slice(0, 5))))) {
    return true;
  }

  return false;
};

/**
 * Multi-token substring search across all product properties:
 * Every word in the query must match title, SKU, barcode, publisher, series, edition, class, etc.
 * Supports spaced and unspaced matching (e.g. "Moonlight" matches "Moon Light", "Playgroup" matches "Play Group").
 */
export const matchesSearchTokens = (product: ProductDocument, searchTerm: string): boolean => {
  const clean = searchTerm.trim().toLowerCase();
  if (!clean) return true;

  const tokens = clean.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;

  const rawHaystack = [
    product.title,
    product.sku,
    product.barcode,
    product.publisherName,
    product.seriesName,
    product.authorOrPublisher,
    product.edition,
    product.targetClass,
    product.className,
    product.categoryName,
    product.classification,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  const compactHaystack = rawHaystack.replace(/[^a-z0-9]/g, '');

  return tokens.every((token) => {
    const compactToken = token.replace(/[^a-z0-9]/g, '');
    return (
      rawHaystack.includes(token) ||
      (compactToken.length >= 3 && compactHaystack.includes(compactToken))
    );
  });
};

/**
 * Filter helper matching products by:
 * 1. Classification Filter
 * 2. Category Filter
 * 3. Author / Publishing House Filter
 * 4. Dedicated Publisher Hierarchy (ID + Name)
 * 5. Dedicated Series Hierarchy (ID + Name)
 * 6. Academic Class Hierarchy (Playgroup, Nursery, Prep/KG, Class 1-10)
 * 7. Multi-token text search (Title, SKU, Barcode, Edition, etc.)
 */
export const matchesProductSearch = (
  product: ProductDocument,
  searchTerm: string,
  categoryFilter: string,
  classificationFilter: string,
  authorOrPublisherFilter: string = 'all',
  publisherFilter: string = 'all',
  seriesFilter: string = 'all',
  classFilter: string = 'all',
  publisherName?: string,
  seriesName?: string
): boolean => {
  // 1. Classification Filter
  if (classificationFilter !== 'all' && product.classification !== classificationFilter) {
    return false;
  }

  // 2. Category Filter
  if (categoryFilter !== 'all') {
    const targetCat = categoryFilter.toLowerCase();
    const prodCatName = (product.categoryName || '').toLowerCase();
    const prodCatId = (product.categoryId || '').toLowerCase();
    const isDirectMatch = prodCatName === targetCat || prodCatName.includes(targetCat);
    const isIdMatch = prodCatId.includes(targetCat) || prodCatId.replace('cat_', '') === targetCat;
    if (!isDirectMatch && !isIdMatch) {
      return false;
    }
  }

  // 3. Author / Publishing House Filter (Legacy)
  if (authorOrPublisherFilter !== 'all') {
    const targetAuthor = authorOrPublisherFilter.trim().toLowerCase();
    const prodAuthor = (product.authorOrPublisher || '').trim().toLowerCase();
    if (prodAuthor !== targetAuthor && !prodAuthor.includes(targetAuthor)) {
      return false;
    }
  }

  // 4. Dedicated Hierarchical Publisher Filter
  if (!matchesPublisherHierarchy(product, publisherFilter, publisherName)) {
    return false;
  }

  // 5. Dedicated Hierarchical Series Filter
  if (!matchesSeriesHierarchy(product, seriesFilter, seriesName)) {
    return false;
  }

  // 6. Dedicated Hierarchical Class Filter
  if (!matchesClassHierarchy(product, classFilter)) {
    return false;
  }

  // 7. Multi-token text search query
  if (!matchesSearchTokens(product, searchTerm)) {
    return false;
  }

  return true;
};

/**
 * Adds a product to invoice or increments quantity if already present.
 * Strictly prevents accidental duplicate rows.
 */
export const addOrIncrementPurchaseItem = (
  currentItems: PurchaseItemRow[],
  product: ProductDocument
): { updatedItems: PurchaseItemRow[]; isIncrement: boolean; updatedIndex: number } => {
  const existingIndex = currentItems.findIndex((item) => item.productId === product.id);

  if (existingIndex >= 0) {
    const updated = [...currentItems];
    const existing = { ...updated[existingIndex] };
    const currentQty = typeof existing.quantity === 'number' ? existing.quantity : 1;
    const newQty = currentQty + 1;
    const unitCost = typeof existing.unitCost === 'number' ? existing.unitCost : (product.costPrice || 0);
    const newTotal = Math.round(newQty * unitCost * 100) / 100;

    existing.quantity = newQty;
    existing.unitCost = unitCost;
    existing.totalCost = newTotal;
    updated[existingIndex] = existing;

    return { updatedItems: updated, isIncrement: true, updatedIndex: existingIndex };
  }

  const mrp = Number(product.retailPrice || product.originalPrice) || 0;
  const defaultPubDisc = typeof product.publisherDiscountPercent === 'number'
    ? product.publisherDiscountPercent
    : (mrp > 0 ? Math.max(0, Math.round(((mrp - product.costPrice) / mrp) * 1000) / 10) : 0);
  const defaultCost = mrp > 0
    ? Math.round(mrp * (1 - defaultPubDisc / 100) * 100) / 100
    : (Number(product.costPrice) || 0);

  const newItem: PurchaseItemRow = {
    productId: product.id,
    productName: product.title,
    sku: product.sku,
    categoryName: product.categoryName || '',
    classification: product.classification,
    authorOrPublisher: product.authorOrPublisher || '',
    currentStock: product.currentStock,
    unit: product.unit || 'piece',
    mrp: mrp || defaultCost,
    publisherDiscountPercent: defaultPubDisc,
    quantity: 1,
    unitCost: defaultCost,
    totalCost: defaultCost,
  };

  return { updatedItems: [...currentItems, newItem], isIncrement: false, updatedIndex: currentItems.length };
};

/**
 * Handles updating Quantity, MRP, Publisher Discount %, Unit Cost (Rate), or Total Amount in an invoice item row.
 * Keeps line totals and unit rates in exact sync.
 */
export const updatePurchaseItemField = (
  item: PurchaseItemRow,
  field: 'quantity' | 'mrp' | 'publisherDiscountPercent' | 'unitCost' | 'totalCost',
  value: number | ''
): PurchaseItemRow => {
  const updated = { ...item };

  if (field === 'quantity') {
    updated.quantity = value;
    const q = typeof value === 'number' ? value : 0;
    const rate = typeof updated.unitCost === 'number' ? updated.unitCost : 0;
    updated.totalCost = Math.round(q * rate * 100) / 100;
  } else if (field === 'mrp') {
    updated.mrp = value;
    const m = typeof value === 'number' ? value : 0;
    const disc = typeof updated.publisherDiscountPercent === 'number' ? updated.publisherDiscountPercent : 0;
    const cost = Math.round(m * (1 - disc / 100) * 100) / 100;
    updated.unitCost = cost;
    const q = typeof updated.quantity === 'number' ? updated.quantity : 0;
    updated.totalCost = Math.round(q * cost * 100) / 100;
  } else if (field === 'publisherDiscountPercent') {
    updated.publisherDiscountPercent = value;
    const m = typeof updated.mrp === 'number' ? updated.mrp : 0;
    const disc = typeof value === 'number' ? Math.max(0, Math.min(100, value)) : 0;
    const cost = Math.round(m * (1 - disc / 100) * 100) / 100;
    updated.unitCost = cost;
    const q = typeof updated.quantity === 'number' ? updated.quantity : 0;
    updated.totalCost = Math.round(q * cost * 100) / 100;
  } else if (field === 'unitCost') {
    updated.unitCost = value;
    const q = typeof updated.quantity === 'number' ? updated.quantity : 0;
    const rate = typeof value === 'number' ? value : 0;
    updated.totalCost = Math.round(q * rate * 100) / 100;
    const m = typeof updated.mrp === 'number' ? updated.mrp : 0;
    if (m > 0 && typeof value === 'number') {
      updated.publisherDiscountPercent = Math.max(0, Math.round(((m - value) / m) * 1000) / 10);
    }
  } else if (field === 'totalCost') {
    const total = typeof value === 'number' ? Math.max(0, value) : 0;
    updated.totalCost = total;
    const q = typeof updated.quantity === 'number' ? updated.quantity : 0;
    if (q > 0) {
      const calculatedUnit = Math.round((total / q) * 100) / 100;
      updated.unitCost = calculatedUnit;
      const m = typeof updated.mrp === 'number' ? updated.mrp : 0;
      if (m > 0) {
        updated.publisherDiscountPercent = Math.max(0, Math.round(((m - calculatedUnit) / m) * 1000) / 10);
      }
    }
  }

  return updated;
};
