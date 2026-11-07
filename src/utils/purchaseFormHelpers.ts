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
 * Filter helper matching products by:
 * 1. Classification Filter
 * 2. Category Filter
 * 3. Author / Publishing House Filter
 * 4. Text Search Query (Title, SKU, Barcode, Category, Classification, Author/Publisher)
 */
export const matchesProductSearch = (
  product: ProductDocument,
  searchTerm: string,
  categoryFilter: string,
  classificationFilter: string,
  authorOrPublisherFilter: string = 'all'
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

  // 3. Author / Publishing House Filter
  if (authorOrPublisherFilter !== 'all') {
    const targetAuthor = authorOrPublisherFilter.trim().toLowerCase();
    const prodAuthor = (product.authorOrPublisher || '').trim().toLowerCase();
    if (prodAuthor !== targetAuthor) {
      return false;
    }
  }

  // 4. Search Query: Product Name, SKU, Barcode, Category, Classification, Author/Publisher
  const query = searchTerm.trim().toLowerCase();
  if (!query) {
    return true;
  }

  const matchesName = (product.title || '').toLowerCase().includes(query);
  const matchesSku = (product.sku || '').toLowerCase().includes(query);
  const matchesBarcode = product.barcode ? product.barcode.toLowerCase().includes(query) : false;
  const matchesCategory = (product.categoryName || '').toLowerCase().includes(query);
  const matchesClassification = (product.classification || '').toLowerCase().includes(query);
  const matchesAuthorOrPublisher = (product.authorOrPublisher || '').toLowerCase().includes(query);

  return (
    matchesName ||
    matchesSku ||
    matchesBarcode ||
    matchesCategory ||
    matchesClassification ||
    matchesAuthorOrPublisher
  );
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
