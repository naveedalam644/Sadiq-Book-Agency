import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  limit,
  orderBy,
  startAfter,
  type QueryDocumentSnapshot,
  type DocumentData,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type {
  WhatsAppMessageDocument,
  WhatsAppMessageType,
  WhatsAppDeliveryStatus,
  WhatsAppSettingsState,
} from '../types/database';
import { normalizePakistaniPhone, buildWhatsAppShareUrl } from '../utils/phoneNormalizer';

export const WHATSAPP_MESSAGES_COLLECTION = 'whatsappMessages';
export const WHATSAPP_SETTINGS_DOC_ID = 'whatsapp_config';

export const DEFAULT_WHATSAPP_SETTINGS: WhatsAppSettingsState = {
  manualSharingEnabled: true,
  cloudApiConfigured: false,
  businessPhoneNumber: '923449633526',
  webhookStatus: 'inactive',
};

/**
 * Checks if the user's browser/device supports Web Share API with file attachments.
 */
export function isNativeFileShareSupported(): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') {
    return false;
  }

  try {
    const dummyFile = new File(['test'], 'test.pdf', { type: 'application/pdf' });
    return navigator.canShare({ files: [dummyFile] });
  } catch {
    return false;
  }
}

/**
 * Shares a PDF file and formatted text message using the native device share sheet (e.g. Android/iOS WhatsApp).
 */
export async function shareViaDeviceNativeSheet(params: {
  file: File;
  title: string;
  text: string;
}): Promise<boolean> {
  if (!isNativeFileShareSupported()) return false;

  try {
    await navigator.share({
      title: params.title,
      text: params.text,
      files: [params.file],
    });
    return true;
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      // User dismissed share dialog
      return false;
    }
    console.warn('Native Web Share error:', err);
    return false;
  }
}

/**
 * Opens WhatsApp Web or WhatsApp Desktop app via standard wa.me protocol.
 */
export function openWhatsAppWebChat(phone: string, messageText: string): { success: boolean; error?: string } {
  const res = buildWhatsAppShareUrl(phone, messageText);
  if (!res.url || res.error) {
    return { success: false, error: res.error || 'Invalid phone number' };
  }

  window.open(res.url, '_blank', 'noopener,noreferrer');
  return { success: true };
}

/**
 * Logs a customer WhatsApp communication record in Firestore.
 * Strictly non-blocking: network issues logging audit history never fail POS or sales transactions.
 */
export async function logWhatsAppCommunication(params: {
  customerId?: string;
  customerName: string;
  phone: string;
  messageType: WhatsAppMessageType;
  messageText: string;
  relatedInvoiceNo?: string;
  relatedReturnNo?: string;
  status: WhatsAppDeliveryStatus;
  userId?: string;
  userEmail?: string;
}): Promise<WhatsAppMessageDocument | null> {
  if (!db) return null;

  try {
    const norm = normalizePakistaniPhone(params.phone);
    const colRef = collection(db, WHATSAPP_MESSAGES_COLLECTION);
    const newDocRef = doc(colRef);
    const now = new Date().toISOString();

    const record: WhatsAppMessageDocument = {
      id: newDocRef.id,
      customerId: params.customerId || undefined,
      customerNameSnapshot: params.customerName || 'Customer',
      phoneNumberSnapshot: norm.normalizedNumber || params.phone,
      messageType: params.messageType,
      sendingMethod: 'manual',
      messageText: params.messageText,
      relatedInvoiceNo: params.relatedInvoiceNo,
      relatedReturnNo: params.relatedReturnNo,
      status: params.status,
      sentByUserId: params.userId || 'system',
      sentByEmail: params.userEmail || 'staff@sadiqbookagency.com',
      sentAt: now,
      createdAt: now,
      updatedAt: now,
    };

    await setDoc(newDocRef, record);
    return record;
  } catch (err) {
    console.warn('WhatsApp communication logging notice (non-blocking):', err);
    return null;
  }
}

/**
 * Fetches WhatsApp message history for a customer with bounded Firestore reads.
 */
export async function getCustomerWhatsAppMessagesPaginated(
  customerId: string,
  cursorDoc: QueryDocumentSnapshot<DocumentData> | null = null,
  limitCount = 20
): Promise<{ messages: WhatsAppMessageDocument[]; lastDoc: QueryDocumentSnapshot<DocumentData> | null; hasMore: boolean }> {
  if (!db || !customerId) {
    return { messages: [], lastDoc: null, hasMore: false };
  }

  try {
    const colRef = collection(db, WHATSAPP_MESSAGES_COLLECTION);
    const queryConstraints: any[] = [
      where('customerId', '==', customerId),
      orderBy('createdAt', 'desc'),
      limit(limitCount + 1),
    ];

    if (cursorDoc) {
      queryConstraints.push(startAfter(cursorDoc));
    }

    const q = query(colRef, ...queryConstraints);
    const snap = await getDocs(q);

    let docs = snap.docs;
    const hasMore = docs.length > limitCount;
    if (hasMore) {
      docs = docs.slice(0, limitCount);
    }

    const messages = docs.map((d) => d.data() as WhatsAppMessageDocument);
    const lastDoc = docs.length > 0 ? docs[docs.length - 1] : null;

    return { messages, lastDoc, hasMore };
  } catch (err) {
    console.error(`Error loading WhatsApp messages for customer ${customerId}:`, err);
    return { messages: [], lastDoc: null, hasMore: false };
  }
}

/**
 * Loads the current WhatsApp system settings (Admin only write, Staff read).
 */
export async function getWhatsAppSettings(): Promise<WhatsAppSettingsState> {
  if (!db) return DEFAULT_WHATSAPP_SETTINGS;

  try {
    const docRef = doc(db, 'settings', WHATSAPP_SETTINGS_DOC_ID);
    const snap = await getDoc(docRef);
    if (!snap.exists()) {
      return DEFAULT_WHATSAPP_SETTINGS;
    }
    return { ...DEFAULT_WHATSAPP_SETTINGS, ...(snap.data() as WhatsAppSettingsState) };
  } catch {
    return DEFAULT_WHATSAPP_SETTINGS;
  }
}

/**
 * Updates WhatsApp configuration (Admin only).
 */
export async function saveWhatsAppSettings(
  settings: Partial<WhatsAppSettingsState>,
  userId: string
): Promise<void> {
  if (!db) throw new Error('Firestore not initialized');

  const docRef = doc(db, 'settings', WHATSAPP_SETTINGS_DOC_ID);
  await setDoc(docRef, {
    ...settings,
    updatedAt: new Date().toISOString(),
    updatedByUserId: userId,
  }, { merge: true });
}

