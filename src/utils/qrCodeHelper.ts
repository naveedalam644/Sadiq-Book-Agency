import QRCode from 'qrcode';

const qrCache = new Map<string, string>();

/**
 * Generates an official invoice verification URL for a given invoice number.
 */
export function getInvoiceVerificationUrl(invoiceNo: string): string {
  const origin = typeof window !== 'undefined' && window.location.origin ? window.location.origin : 'https://sadiqbookagency.com';
  return `${origin}/verify-invoice/${encodeURIComponent(invoiceNo.trim())}`;
}

/**
 * Generates a high-contrast black & white QR code PNG data URL for printing and digital display.
 * Results are cached in memory for zero-lag re-renders.
 */
export async function generateInvoiceQrDataUrl(
  textOrInvoiceNo: string,
  size = 200
): Promise<string> {
  const clean = textOrInvoiceNo.trim();
  const content = clean.startsWith('http://') || clean.startsWith('https://')
    ? clean
    : getInvoiceVerificationUrl(clean);

  const cacheKey = `${content}_${size}`;
  const cached = qrCache.get(cacheKey);
  if (cached) return cached;

  try {
    const dataUrl = await QRCode.toDataURL(content, {
      width: size,
      margin: 1,
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
      errorCorrectionLevel: 'M',
    });

    qrCache.set(cacheKey, dataUrl);
    return dataUrl;
  } catch (err) {
    console.error('Failed to generate QR Code:', err);
    return '';
  }
}

