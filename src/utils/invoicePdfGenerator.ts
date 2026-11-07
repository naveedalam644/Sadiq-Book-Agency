import type { SaleDocument } from '../types/database';
import { formatDate, formatCurrency, formatInvoiceDisplay } from './formatters.ts';
import { STORE_CONTACT_DETAILS } from './whatsappTemplates.ts';

/**
 * Escapes characters for PDF literal strings (parentheses and backslashes).
 */
function escapePdfText(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

/**
 * Generates standard PDF 1.4 specification string for an A4 commercial invoice.
 * Uses 100% native Web API (TextEncoder) - zero external npm libraries or Buffer dependencies.
 */
export function generateInvoicePdfRaw(sale: SaleDocument): string {
  const formattedInvoiceNo = formatInvoiceDisplay(sale.invoiceNo);
  const dateStr = formatDate(sale.saleDate);
  const customerName = sale.customerName || 'Valued Customer';
  const isCredit = sale.paymentMethod === 'credit' || (sale.balanceAddedToCredit || 0) > 0;

  // Build PDF content stream
  const lines: string[] = [];

  // Coordinate system: Origin (0,0) is bottom-left. A4 is 595 x 842 points.
  // Margins: left=40, right=555, top=802
  let y = 800;

  // Header Box (Navy banner: rectangle from (40, 720) to (555, 800))
  lines.push('0.027 0.122 0.286 rg'); // #071F49 navy
  lines.push(`40 730 515 70 re f`);

  // Header Title in Gold
  lines.push('0.961 0.710 0.106 rg'); // #F5B51B gold
  lines.push('BT /F1 18 Tf 55 770 Td (' + escapePdfText(STORE_CONTACT_DETAILS.name) + ') Tj ET');

  // Subtitle in White
  lines.push('1 1 1 rg'); // white
  lines.push('BT /F2 9 Tf 55 754 Td (' + escapePdfText(STORE_CONTACT_DETAILS.address + ' | ' + STORE_CONTACT_DETAILS.phones.join(', ')) + ') Tj ET');
  lines.push('BT /F1 12 Tf 430 754 Td (TAX INVOICE) Tj ET');

  // Reset to Dark Charcoal text
  lines.push('0.1 0.1 0.1 rg');

  // Invoice Metadata block (left: Invoice No, Date; right: Customer, Terms)
  y = 705;
  lines.push(`BT /F1 10 Tf 45 ${y} Td (Invoice No:) Tj /F2 10 Tf 115 ${y} Td (${escapePdfText(formattedInvoiceNo)}) Tj ET`);
  lines.push(`BT /F1 10 Tf 330 ${y} Td (Customer:) Tj /F2 10 Tf 395 ${y} Td (${escapePdfText(customerName)}) Tj ET`);

  y -= 16;
  lines.push(`BT /F1 10 Tf 45 ${y} Td (Date:) Tj /F2 10 Tf 115 ${y} Td (${escapePdfText(dateStr)}) Tj ET`);
  lines.push(`BT /F1 10 Tf 330 ${y} Td (Payment:) Tj /F2 10 Tf 395 ${y} Td (${escapePdfText(isCredit ? 'Credit Bill (Khata)' : 'Cash / Paid')}) Tj ET`);

  // Table Header bar
  y -= 25;
  lines.push('0.93 0.95 0.98 rg'); // Light slate fill
  lines.push(`40 ${y - 4} 515 20 re f`);
  lines.push('0.027 0.122 0.286 rg'); // Navy text
  lines.push(`BT /F1 9 Tf 48 ${y + 2} Td (Sr) Tj 75 ${y + 2} Td (Item Description) Tj 350 ${y + 2} Td (Qty) Tj 410 ${y + 2} Td (Unit Price) Tj 480 ${y + 2} Td (Line Total) Tj ET`);

  // Table Lines
  lines.push('0.15 0.15 0.15 rg');
  y -= 16;

  sale.items.forEach((item, idx) => {
    if (y < 120) return; // Prevent page overflow for standard single-page invoice
    const sr = String(idx + 1);
    const title = item.productName.length > 40 ? item.productName.substring(0, 37) + '...' : item.productName;
    const qty = String(item.quantity);
    const unitPrice = formatCurrency(item.unitPrice);
    const lineTotal = formatCurrency(item.lineTotal);

    // Light row divider line
    lines.push('0.85 0.85 0.85 RG');
    lines.push(`40 ${y - 2} m 555 ${y - 2} l S`);

    lines.push('0.1 0.1 0.1 rg');
    lines.push(`BT /F2 8.5 Tf 48 ${y + 2} Td (${escapePdfText(sr)}) Tj 75 ${y + 2} Td (${escapePdfText(title)}) Tj 355 ${y + 2} Td (${escapePdfText(qty)}) Tj 415 ${y + 2} Td (${escapePdfText(unitPrice)}) Tj 485 ${y + 2} Td (${escapePdfText(lineTotal)}) Tj ET`);
    y -= 15;
  });

  // Summary box
  y = Math.min(y - 10, 220);
  lines.push('0.97 0.97 0.97 rg');
  lines.push(`320 ${y - 85} 235 95 re f`);
  lines.push('0.027 0.122 0.286 RG');
  lines.push(`320 ${y - 85} 235 95 re s`);

  const subtotalStr = formatCurrency(sale.subtotal);
  const discountStr = formatCurrency(sale.totalDiscount);
  const grandTotalStr = formatCurrency(sale.grandTotal);
  const paidStr = formatCurrency(sale.paymentApplied || 0);
  const balanceStr = formatCurrency(sale.balanceAddedToCredit || 0);

  lines.push('0.1 0.1 0.1 rg');
  let sy = y - 4;
  lines.push(`BT /F2 9 Tf 330 ${sy} Td (Subtotal:) Tj 460 ${sy} Td (${escapePdfText(subtotalStr)}) Tj ET`);
  sy -= 15;
  lines.push(`BT /F2 9 Tf 330 ${sy} Td (Discount:) Tj 460 ${sy} Td (${escapePdfText(discountStr)}) Tj ET`);
  sy -= 17;
  lines.push('0.027 0.122 0.286 rg');
  lines.push(`BT /F1 11 Tf 330 ${sy} Td (Grand Total:) Tj 460 ${sy} Td (${escapePdfText(grandTotalStr)}) Tj ET`);
  sy -= 15;
  lines.push('0.1 0.1 0.1 rg');
  lines.push(`BT /F2 9 Tf 330 ${sy} Td (Amount Paid:) Tj 460 ${sy} Td (${escapePdfText(paidStr)}) Tj ET`);
  sy -= 15;
  if (isCredit) {
    lines.push('0.8 0.1 0.1 rg'); // Red
    lines.push(`BT /F1 9.5 Tf 330 ${sy} Td (Added to Khata:) Tj 460 ${sy} Td (${escapePdfText(balanceStr)}) Tj ET`);
  } else {
    lines.push('0.1 0.6 0.2 rg'); // Green
    lines.push(`BT /F1 9.5 Tf 330 ${sy} Td (Balance Owed:) Tj 460 ${sy} Td (PKR 0.00) Tj ET`);
  }

  // Footer notes
  lines.push('0.4 0.4 0.4 rg');
  lines.push('BT /F2 8 Tf 45 60 Td (Terms: Goods once sold will only be returned/exchanged within 7 days with original invoice.) Tj ET');
  lines.push('BT /F1 8 Tf 45 46 Td (Thank you for your patronage! Sadiq Book Agency - Swat) Tj ET');

  const streamContent = lines.join('\n');
  const encoder = new TextEncoder();
  const streamLength = encoder.encode(streamContent).length;

  // Assemble full PDF 1.4 objects
  const objects: string[] = [];
  objects.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj');
  objects.push('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj');
  objects.push('3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>\nendobj');
  objects.push(`4 0 obj\n<< /Length ${streamLength} >>\nstream\n${streamContent}\nendstream\nendobj`);
  objects.push('5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj');
  objects.push('6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj');

  let pdfText = '%PDF-1.4\n';
  const xrefOffsets: number[] = [0];

  for (const obj of objects) {
    xrefOffsets.push(encoder.encode(pdfText).length);
    pdfText += obj + '\n';
  }

  const xrefStart = encoder.encode(pdfText).length;
  pdfText += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) {
    const off = String(xrefOffsets[i]).padStart(10, '0');
    pdfText += `${off} 00000 n \n`;
  }

  pdfText += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return pdfText;
}

/**
 * Generates Uint8Array byte stream of the PDF invoice.
 */
export function generateInvoicePdfBytes(sale: SaleDocument): Uint8Array {
  return new TextEncoder().encode(generateInvoicePdfRaw(sale));
}

/**
 * Generates an in-memory PDF Blob for an invoice.
 */
export function generateInvoicePdfBlob(sale: SaleDocument): Blob {
  return new Blob([generateInvoicePdfRaw(sale)], { type: 'application/pdf' });
}

/**
 * Creates a File instance suitable for navigator.share({ files: [...] })
 */
export function generateInvoicePdfFile(sale: SaleDocument): File {
  const blob = generateInvoicePdfBlob(sale);
  const cleanInvoiceNo = sale.invoiceNo.replace(/[^A-Za-z0-9_-]/g, '_');
  const filename = `Invoice_${cleanInvoiceNo}.pdf`;
  return new File([blob], filename, { type: 'application/pdf' });
}

/**
 * Triggers an immediate browser download of the generated PDF invoice.
 */
export function downloadInvoicePdf(sale: SaleDocument): void {
  const blob = generateInvoicePdfBlob(sale);
  const cleanInvoiceNo = sale.invoiceNo.replace(/[^A-Za-z0-9_-]/g, '_');
  const filename = `Invoice_${cleanInvoiceNo}.pdf`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
