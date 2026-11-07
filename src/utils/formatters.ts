/**
 * Utility functions for date, currency, and role formatting across the bookstore app.
 */

export const formatCurrency = (amount: number, currency = 'PKR'): string => {
  return `${currency} ${(amount || 0).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
};

export const formatNumber = (num: number): string => {
  return (num || 0).toLocaleString('en-US');
};

export const formatDate = (isoString?: string): string => {
  if (!isoString) return '—';
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return isoString;
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
};

export const formatDateTime = (isoString?: string): string => {
  if (!isoString) return '—';
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return isoString;
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

export const getGreetingByTime = (): string => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 17) return 'Good Afternoon';
  return 'Good Evening';
};

/**
 * Converts numeric amount to Pakistani Rupee words for professional A4 invoices.
 * E.g., 5420.50 -> "Five Thousand Four Hundred Twenty Rupees and Fifty Paisas Only"
 */
export const amountToWords = (amount: number): string => {
  if (!amount || amount <= 0) return 'Zero Rupees Only';

  const ones = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
    'Seventeen', 'Eighteen', 'Nineteen'
  ];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  const convertChunk = (n: number): string => {
    let str = '';
    if (n >= 100) {
      str += ones[Math.floor(n / 100)] + ' Hundred ';
      n %= 100;
    }
    if (n >= 20) {
      str += tens[Math.floor(n / 10)] + ' ';
      n %= 10;
    }
    if (n > 0) {
      str += ones[n] + ' ';
    }
    return str.trim();
  };

  const integerPart = Math.floor(amount);
  const decimalPart = Math.round((amount - integerPart) * 100);

  let result = '';
  const crore = Math.floor(integerPart / 10000000);
  let rem = integerPart % 10000000;
  const lakh = Math.floor(rem / 100000);
  rem %= 100000;
  const thousand = Math.floor(rem / 1000);
  rem %= 1000;
  const rest = rem;

  if (crore > 0) result += convertChunk(crore) + ' Crore ';
  if (lakh > 0) result += convertChunk(lakh) + ' Lakh ';
  if (thousand > 0) result += convertChunk(thousand) + ' Thousand ';
  if (rest > 0) result += convertChunk(rest) + ' ';

  result = result.trim() + ' Rupees';
  if (decimalPart > 0) {
    result += ' and ' + convertChunk(decimalPart) + ' Paisas';
  }
  return result.trim() + ' Only';
};

/**
 * Formats an invoice number for display.
 * e.g., "INV-20261105-0001" -> "INV 20261105 0001"
 */
export const formatInvoiceDisplay = (invoiceNo: string): string => {
  if (!invoiceNo) return '';
  const match = invoiceNo.match(/^INV[- ]?(\d{8})[- ]?(\d{4})$/i);
  if (match) {
    return `INV ${match[1]} ${match[2]}`;
  }
  return invoiceNo;
};
