import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  limit,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type {
  CustomerDocument,
  SaleDocument,
  CustomerLedgerDocument,
  CustomerPortalDocument,
  CustomerPortalInvoiceSummary,
  CustomerPortalLedgerEntry,
} from '../types/database';
import { getCustomerById } from './customerService';
import { STORE_CONTACT_DETAILS } from '../utils/whatsappTemplates';

/**
 * Generates a clean, URL-safe portal code for a wholesale customer.
 * Format: wh-[8 hex/alphanumeric chars], e.g. "wh-9b4e81fa"
 */
export const generatePortalCode = (): string => {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let token = '';
  for (let i = 0; i < 8; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `wh-${token}`;
};

/**
 * Generates an easy-to-remember 6-digit numeric PIN for the customer.
 */
export const generateDefaultPortalPin = (): string => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * Fetches the public wholesale customer portal record by portalCode.
 */
export const getCustomerPortalData = async (
  portalCode: string
): Promise<CustomerPortalDocument | null> => {
  if (!db || !portalCode) return null;

  try {
    const cleanCode = portalCode.trim().toLowerCase();
    const portalRef = doc(db, 'customerPortals', cleanCode);
    const snap = await getDoc(portalRef);

    if (!snap.exists()) {
      return null;
    }

    return snap.data() as CustomerPortalDocument;
  } catch (err) {
    console.error(`Error loading customer portal for "${portalCode}":`, err);
    return null;
  }
};

/**
 * Verifies the customer's portal access password / PIN.
 */
export const verifyPortalPassword = async (
  portalCode: string,
  inputPassword: string
): Promise<{
  success: boolean;
  portalData?: CustomerPortalDocument;
  errorMessage?: string;
}> => {
  const data = await getCustomerPortalData(portalCode);
  if (!data) {
    return {
      success: false,
      errorMessage: 'Wholesale Khata Portal link not found. Please contact Sadiq Book Agency.',
    };
  }

  if (data.portalEnabled === false) {
    return {
      success: false,
      errorMessage: 'This customer Khata portal has been temporarily disabled by Sadiq Book Agency.',
    };
  }

  const expected = (data.portalPassword || '').trim();
  const actual = (inputPassword || '').trim();

  if (!expected || actual !== expected) {
    return {
      success: false,
      errorMessage: 'Incorrect Portal Password or PIN. Please enter the correct password sent to you.',
    };
  }

  return {
    success: true,
    portalData: data,
  };
};

/**
 * Fetches all invoices published to the customer's public portal.
 * Invoices are sorted by saleDate descending.
 */
export const getCustomerPortalInvoices = async (
  portalCode: string
): Promise<CustomerPortalInvoiceSummary[]> => {
  if (!db || !portalCode) return [];

  try {
    const cleanCode = portalCode.trim().toLowerCase();
    const invoicesRef = collection(db, 'customerPortals', cleanCode, 'invoices');
    const snap = await getDocs(invoicesRef);

    const invoices = snap.docs.map((d) => d.data() as CustomerPortalInvoiceSummary);
    invoices.sort((a, b) => (b.saleDate || '').localeCompare(a.saleDate || ''));
    return invoices;
  } catch (err) {
    console.error(`Error loading invoices for portal "${portalCode}":`, err);
    return [];
  }
};

/**
 * Fetches all ledger entries published to the customer's public portal.
 * Sorted chronologically descending.
 */
export const getCustomerPortalLedger = async (
  portalCode: string
): Promise<CustomerPortalLedgerEntry[]> => {
  if (!db || !portalCode) return [];

  try {
    const cleanCode = portalCode.trim().toLowerCase();
    const ledgerRef = collection(db, 'customerPortals', cleanCode, 'ledger');
    const snap = await getDocs(ledgerRef);

    const entries = snap.docs.map((d) => d.data() as CustomerPortalLedgerEntry);
    entries.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    return entries;
  } catch (err) {
    console.error(`Error loading ledger for portal "${portalCode}":`, err);
    return [];
  }
};

/**
 * Synchronizes a customer's profile, invoices, and ledger into their public read-only portal.
 * Strips internal cost prices / COGS to strictly safeguard business confidentiality.
 */
export const syncCustomerPortal = async (
  customerId: string
): Promise<{ portalCode: string; portalPassword: string } | null> => {
  if (!db || !customerId) return null;

  try {
    const customer = await getCustomerById(customerId);
    if (!customer) return null;

    let portalCode = customer.portalCode?.trim().toLowerCase();
    let portalPassword = customer.portalPassword?.trim();
    let needsCustUpdate = false;

    if (!portalCode) {
      portalCode = generatePortalCode();
      needsCustUpdate = true;
    }
    if (!portalPassword) {
      portalPassword = generateDefaultPortalPin();
      needsCustUpdate = true;
    }

    if (needsCustUpdate) {
      const custRef = doc(db, 'customers', customer.id);
      await updateDoc(custRef, {
        portalCode,
        portalPassword,
        portalEnabled: customer.portalEnabled !== false,
      });
      customer.portalCode = portalCode;
      customer.portalPassword = portalPassword;
      customer.portalEnabled = customer.portalEnabled !== false;
    }

    // 1. Fetch customer sales/invoices
    const salesQuery = query(
      collection(db, 'sales'),
      where('customerId', '==', customer.id),
      limit(250)
    );
    const salesSnap = await getDocs(salesQuery);
    const sales: SaleDocument[] = salesSnap.docs.map((d) => ({
      ...(d.data() as SaleDocument),
      id: d.id,
    }));

    // 2. Fetch customer ledger entries
    const ledgerQuery = query(
      collection(db, 'customerLedger'),
      where('customerId', '==', customer.id),
      limit(250)
    );
    const ledgerSnap = await getDocs(ledgerQuery);
    const ledger: CustomerLedgerDocument[] = ledgerSnap.docs.map((d) => ({
      ...(d.data() as CustomerLedgerDocument),
      id: d.id,
    }));

    // Calculate aggregated metrics
    const totalPurchases = Math.round(sales.reduce((sum, s) => sum + (Number(s.grandTotal) || 0), 0) * 100) / 100;
    const totalPaid = Math.round(
      (sales.reduce((sum, s) => sum + (Number(s.paymentApplied) || 0), 0) +
        ledger
          .filter((l) => l.entryType === 'credit')
          .reduce((sum, l) => sum + (Number(l.amount) || 0), 0)) * 100
    ) / 100;

    const netBaqaya = Math.round((totalPurchases - totalPaid) * 100) / 100;
    const effectiveBalance =
      typeof customer.currentBalance === 'number' && customer.currentBalance !== 0
        ? customer.currentBalance
        : netBaqaya;

    const now = new Date().toISOString();

    // 3. Write Root Portal Document
    const portalDoc: CustomerPortalDocument = {
      portalCode,
      customerId: customer.id,
      customerName: customer.name,
      shopName: customer.shopName || '',
      phone: customer.phone || '',
      city: customer.city || '',
      address: customer.address || '',
      currentBalance: effectiveBalance,
      totalPurchases,
      totalPaid,
      creditLimit: customer.creditLimit || 0,
      creditDays: customer.creditDays || 0,
      portalPassword,
      portalEnabled: customer.portalEnabled !== false,
      lastUpdated: now,
    };

    await setDoc(doc(db, 'customerPortals', portalCode), portalDoc);

    // 4. Sync Invoices (Safe item mapping without costPrice / FIFO batch depletion)
    for (const sale of sales) {
      const safeInvoice: CustomerPortalInvoiceSummary = {
        id: sale.id,
        invoiceNo: sale.invoiceNo,
        saleDate: sale.saleDate,
        createdAt: sale.createdAt || sale.sessionCreatedAt || undefined,
        dueDate: sale.dueDate,
        itemsCount: (sale.items || []).reduce((acc, i) => acc + (Number(i.quantity) || 0), 0),
        subtotal: sale.subtotal,
        totalDiscount: sale.totalDiscount || 0,
        grandTotal: sale.grandTotal,
        paymentStatus: sale.paymentStatus,
        paymentMethod: sale.paymentMethod,
        items: (sale.items || []).map((item) => ({
          productId: item.productId,
          productName: item.productName,
          sku: item.sku,
          publisherName: item.publisherName || '—',
          seriesName: item.seriesName || '—',
          targetClass: item.targetClass || '—',
          quantity: Number(item.quantity) || 0,
          mrp: Number(item.mrp ?? item.unitPrice ?? 0),
          discountPercent: Number(item.discountPercent ?? item.discountRate ?? 0),
          sellingPrice: Number(item.sellingPrice ?? item.effectivePrice ?? 0),
          lineTotal: Number(item.lineTotal) || 0,
        })),
      };

      await setDoc(
        doc(db, 'customerPortals', portalCode, 'invoices', sale.id),
        safeInvoice
      );
    }

    // 5. Sync Ledger Entries
    for (const entry of ledger) {
      const isDebit = entry.entryType === 'debit';
      const safeEntry: CustomerPortalLedgerEntry = {
        id: entry.id,
        date: entry.date,
        reference: entry.referenceInvoiceNo || entry.referenceReceiptNo || '—',
        entryType: entry.entryType,
        description: entry.description,
        debit: isDebit ? Number(entry.amount) || 0 : 0,
        credit: !isDebit ? Number(entry.amount) || 0 : 0,
        runningBalance: Number(entry.runningBalance) || 0,
      };

      await setDoc(
        doc(db, 'customerPortals', portalCode, 'ledger', entry.id),
        safeEntry
      );
    }

    return { portalCode, portalPassword };
  } catch (err) {
    console.error(`Error synchronizing customer portal for ${customerId}:`, err);
    return null;
  }
};

/**
 * Builds a professional WhatsApp message containing the Khata Portal Link and Password.
 */
export const buildCustomerPortalWhatsAppMessage = (params: {
  customer: CustomerDocument;
  portalUrl: string;
}): string => {
  const { customer, portalUrl } = params;
  const customerTitle = customer.shopName || customer.name || 'محترم کسٹمر';
  const balance = customer.currentBalance || 0;

  let msg = `السلام علیکم! محترم *${customerTitle}* صاحب،\n\n`;
  msg += `*${STORE_CONTACT_DETAILS.name}* کی طرف سے آپ کا آن لائن ہول سیل کھاتہ پورٹل لنک تیار ہے۔\n\n`;

  msg += `🔗 *پورٹل لنک (Khata Portal Link):*\n${portalUrl}\n\n`;
  msg += `🔑 *آپ کا سیکیورٹی پاس ورڈ / PIN:* *${customer.portalPassword || '123456'}*\n\n`;

  msg += `💳 *موجودہ کھاتہ بیلنس (Current Balance):* PKR ${balance.toLocaleString()}\n`;
  if (balance > 0) {
    msg += `(قابلِ ادا ادھار / Outstanding Balance)\n`;
  } else if (balance < 0) {
    msg += `(ایڈوانس جمع / Advance Balance)\n`;
  } else {
    msg += `(کھاتہ کلیئر ہے / Cleared)\n`;
  }

  msg += `\n📌 *ہدایت:* اس لنک کو کھول کر اپنا پاس ورڈ درج کریں، آپ اپنے تمام سابقہ بلز، کتابوں کی تفصیلات اور کھاتہ اسٹیٹمنٹ کسی بھی وقت دیکھ سکتے ہیں۔\n\n`;
  msg += `📍 *پتہ:* ${STORE_CONTACT_DETAILS.address}\n`;
  msg += `📞 *رابطہ نمبر:* ${STORE_CONTACT_DETAILS.phones.join(' | ')}\n\n`;
  msg += `شکریہ! *${STORE_CONTACT_DETAILS.name}*`;

  return msg;
};
