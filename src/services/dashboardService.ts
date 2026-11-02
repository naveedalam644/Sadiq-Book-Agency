import { getInventorySummary } from './summaryService';
import { getRecentPurchases } from './purchaseService';
import { getLowStockProducts } from './stockService';
import type {
  InventorySummaryDocument,
  PurchaseDocument,
  ProductDocument,
} from '../types/database';

export interface DashboardData {
  summary: InventorySummaryDocument;
  recentPurchases: PurchaseDocument[];
  lowStockProducts: ProductDocument[];
  isLoading: boolean;
  error?: string | null;
}

export const fetchDashboardData = async (): Promise<{
  summary: InventorySummaryDocument;
  recentPurchases: PurchaseDocument[];
  lowStockProducts: ProductDocument[];
}> => {
  const [summary, recentPurchases, lowStockProducts] = await Promise.all([
    getInventorySummary(),
    getRecentPurchases(5),
    getLowStockProducts(5),
  ]);

  return {
    summary,
    recentPurchases,
    lowStockProducts,
  };
};

