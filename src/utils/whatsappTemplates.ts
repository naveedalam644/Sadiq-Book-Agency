import type {
  SaleDocument,
  SaleReturnDocument,
  CustomerDocument,
  CustomerLedgerDocument,
  PaymentDocument,
} from '../types/database';
import { formatCurrency, formatDate, formatInvoiceDisplay } from './formatters.ts';

export const STORE_CONTACT_DETAILS = {
  name: 'Sadiq Book Agency',
  address: 'Udyana Market, Mingora, Swat',
  phones: ['0344-9633526', '0342-5822259', '0303-5822258'],
};

/**
 * Builds the professional invoice sharing text for WhatsApp.
 */
export function buildInvoiceWhatsAppMessage(params: {
  sale: SaleDocument;
  customer?: CustomerDocument | null;
}): string {
  const { sale, customer } = params;
  const isCreditSale = sale.paymentMethod === 'credit' || (sale.balanceAddedToCredit || 0) > 0;
  const totalQty = sale.items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
  const formattedInvoiceNo = formatInvoiceDisplay(sale.invoiceNo);
  const dateStr = formatDate(sale.saleDate);

  let msg = `Assalam-o-Alaikum *${sale.customerName || 'Valued Customer'}*,\n\n`;
  msg += `Thank you for shopping at *${STORE_CONTACT_DETAILS.name}*.\n`;
  msg += `Here is your invoice summary:\n\n`;

  msg += `📄 *Invoice No:* ${formattedInvoiceNo}\n`;
  msg += `📅 *Date:* ${dateStr}\n`;
  msg += `📚 *Total Items:* ${totalQty}\n`;
  msg += `💰 *Subtotal:* ${formatCurrency(sale.subtotal)}\n`;

  if (sale.totalDiscount > 0) {
    msg += `🏷️ *Discount:* ${formatCurrency(sale.totalDiscount)}\n`;
  }

  msg += `💵 *Grand Total:* ${formatCurrency(sale.grandTotal)}\n`;
  msg += `✅ *Amount Paid:* ${formatCurrency(sale.paymentApplied || 0)}\n`;

  if (isCreditSale) {
    msg += `⚠️ *Added to Khata:* ${formatCurrency(sale.balanceAddedToCredit || 0)}\n`;
    if (customer && typeof customer.currentBalance === 'number') {
      msg += `💳 *Total Khata Balance:* ${formatCurrency(customer.currentBalance)}\n`;
    }
    if (sale.dueDate) {
      msg += `⏰ *Payment Due Date:* ${formatDate(sale.dueDate)}\n`;
    }
  }

  msg += `\n📍 *Address:* ${STORE_CONTACT_DETAILS.address}\n`;
  msg += `📞 *Contact:* ${STORE_CONTACT_DETAILS.phones.join(' | ')}\n\n`;
  msg += `Thank you for your business!`;

  return msg;
}

/**
 * Builds a payment received voucher text for WhatsApp.
 */
export function buildPaymentReceivedWhatsAppMessage(params: {
  payment: PaymentDocument;
  customerName: string;
  updatedBalance?: number;
}): string {
  const { payment, customerName, updatedBalance } = params;
  const dateStr = formatDate(payment.paymentDate);

  let msg = `Assalam-o-Alaikum *${customerName || 'Valued Customer'}*,\n\n`;
  msg += `We have received your payment. Thank you for the settlement!\n\n`;

  msg += `🧾 *Receipt No:* ${payment.receiptNo}\n`;
  msg += `📅 *Payment Date:* ${dateStr}\n`;
  msg += `💵 *Amount Received:* ${formatCurrency(payment.amount)}\n`;
  msg += `💳 *Payment Mode:* ${payment.paymentMode.replace('_', ' ').toUpperCase()}\n`;

  if (payment.transactionReference) {
    msg += `🔖 *Reference:* ${payment.transactionReference}\n`;
  }

  if (typeof updatedBalance === 'number') {
    msg += `⚖️ *Updated Khata Balance:* ${formatCurrency(updatedBalance)}\n`;
  }

  msg += `\n📍 *Address:* ${STORE_CONTACT_DETAILS.address}\n`;
  msg += `📞 *Contact:* ${STORE_CONTACT_DETAILS.phones.join(' | ')}\n\n`;
  msg += `*${STORE_CONTACT_DETAILS.name}*`;

  return msg;
}

/**
 * Builds an outstanding balance and payment reminder message.
 */
export function buildOutstandingBalanceWhatsAppMessage(params: {
  customerName: string;
  currentBalance: number;
  dueDate?: string;
  creditDays?: number;
}): string {
  const { customerName, currentBalance, dueDate } = params;

  let msg = `Assalam-o-Alaikum *${customerName}*,\n\n`;
  msg += `This is a friendly statement update regarding your Khata balance with *${STORE_CONTACT_DETAILS.name}*.\n\n`;

  msg += `💳 *Current Outstanding Balance:* ${formatCurrency(currentBalance)}\n`;

  if (dueDate) {
    msg += `📅 *Payment Due Date:* ${formatDate(dueDate)}\n`;
  }

  msg += `\nPlease arrange payment at your earliest convenience.\n`;
  msg += `If payment has already been sent, please disregard this notice.\n\n`;

  msg += `📍 *Address:* ${STORE_CONTACT_DETAILS.address}\n`;
  msg += `📞 *Contact:* ${STORE_CONTACT_DETAILS.phones.join(' | ')}\n\n`;
  msg += `*${STORE_CONTACT_DETAILS.name}*`;

  return msg;
}

/**
 * Builds an account ledger statement message.
 */
export function buildAccountStatementWhatsAppMessage(params: {
  customerName: string;
  currentBalance: number;
  startDate?: string;
  endDate?: string;
  recentEntries: CustomerLedgerDocument[];
}): string {
  const { customerName, currentBalance, startDate, endDate, recentEntries } = params;

  let msg = `Assalam-o-Alaikum *${customerName}*,\n\n`;
  msg += `Here is your account statement from *${STORE_CONTACT_DETAILS.name}*:\n\n`;

  if (startDate && endDate) {
    msg += `🗓️ *Period:* ${formatDate(startDate)} to ${formatDate(endDate)}\n`;
  }

  msg += `💳 *Current Khata Balance:* ${formatCurrency(currentBalance)}\n\n`;

  if (recentEntries.length > 0) {
    msg += `*Recent Activity (Last ${Math.min(recentEntries.length, 5)} transactions):*\n`;
    const slice = recentEntries.slice(0, 5);
    for (const entry of slice) {
      const typeSign = entry.entryType === 'debit' ? '(+) Debit' : '(-) Credit';
      const ref = entry.referenceInvoiceNo || entry.referenceReceiptNo || 'Doc';
      msg += `• ${formatDate(entry.date)}: ${typeSign} ${formatCurrency(entry.amount)} [${ref}]\n`;
    }
    msg += '\n';
  }

  msg += `For complete ledger statement or bill queries:\n`;
  msg += `📞 *Contact:* ${STORE_CONTACT_DETAILS.phones.join(' | ')}\n\n`;
  msg += `*${STORE_CONTACT_DETAILS.name}*`;

  return msg;
}

/**
 * Builds a sales return / refund voucher message.
 */
export function buildSalesReturnWhatsAppMessage(params: {
  returnDoc: SaleReturnDocument;
  customerName?: string;
  updatedBalance?: number;
}): string {
  const { returnDoc, customerName, updatedBalance } = params;
  const name = customerName || returnDoc.customerName || 'Valued Customer';
  const totalUnits = returnDoc.items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);

  let msg = `Assalam-o-Alaikum *${name}*,\n\n`;
  msg += `Your return voucher has been processed at *${STORE_CONTACT_DETAILS.name}*:\n\n`;

  msg += `🔄 *Return Receipt No:* ${returnDoc.returnNo}\n`;
  msg += `📄 *Original Invoice:* ${returnDoc.originalInvoiceNo}\n`;
  msg += `📅 *Date:* ${formatDate(returnDoc.returnDate)}\n`;
  msg += `📦 *Total Returned Units:* ${totalUnits}\n`;
  msg += `💰 *Total Refund Amount:* ${formatCurrency(returnDoc.totalRefundAmount)}\n`;
  msg += `💵 *Refund Method:* ${returnDoc.refundMethod === 'credit_deduction' ? 'Khata Balance Deduction' : 'Cash Payout'}\n`;

  if (typeof updatedBalance === 'number') {
    msg += `💳 *Updated Khata Balance:* ${formatCurrency(updatedBalance)}\n`;
  }

  msg += `\n📍 *Address:* ${STORE_CONTACT_DETAILS.address}\n`;
  msg += `📞 *Contact:* ${STORE_CONTACT_DETAILS.phones.join(' | ')}\n\n`;
  msg += `*${STORE_CONTACT_DETAILS.name}*`;

  return msg;
}
