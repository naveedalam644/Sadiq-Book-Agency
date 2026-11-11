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
 * Supports multi-page pagination for invoices with high item counts (e.g. 25-100+ items).
 * Uses 100% native Web API (TextEncoder) - zero external npm libraries or Buffer dependencies.
 */
export function generateInvoicePdfRaw(sale: SaleDocument): string {
  const formattedInvoiceNo = formatInvoiceDisplay(sale.invoiceNo);
  const dateStr = formatDate(sale.saleDate);
  const customerName = sale.customerName || 'Valued Customer';
  const isCredit = sale.paymentMethod === 'credit' || (sale.balanceAddedToCredit || 0) > 0;

  const pages: string[][] = [];
  let currentLines: string[] = [];

  function startPage(isFirst: boolean): number {
    if (currentLines.length > 0) {
      pages.push(currentLines);
      currentLines = [];
    }

    let y = 800;
    if (isFirst) {
      // Header Box (Navy banner: rectangle from (40, 730) to (555, 800))
      currentLines.push('0.027 0.122 0.286 rg'); // #071F49 navy
      currentLines.push(`40 730 515 70 re f`);

      // Header Title in Gold
      currentLines.push('0.961 0.710 0.106 rg'); // #F5B51B gold
      currentLines.push(`BT /F1 18 Tf 55 770 Td (${escapePdfText(STORE_CONTACT_DETAILS.name)}) Tj ET`);

      // Subtitle in White
      currentLines.push('1 1 1 rg'); // white
      currentLines.push(
        `BT /F2 9 Tf 55 754 Td (${escapePdfText(
          STORE_CONTACT_DETAILS.address + ' | ' + STORE_CONTACT_DETAILS.phones.join(', ')
        )}) Tj ET`
      );
      currentLines.push(`BT /F1 12 Tf 430 754 Td (TAX INVOICE) Tj ET`);

      // Reset to Dark Charcoal text
      currentLines.push('0.1 0.1 0.1 rg');

      // Invoice Metadata block
      y = 705;
      currentLines.push(
        `BT /F1 10 Tf 45 ${y} Td (Invoice No:) Tj /F2 10 Tf 115 ${y} Td (${escapePdfText(
          formattedInvoiceNo
        )}) Tj ET`
      );
      currentLines.push(
        `BT /F1 10 Tf 330 ${y} Td (Customer:) Tj /F2 10 Tf 395 ${y} Td (${escapePdfText(
          customerName
        )}) Tj ET`
      );

      y -= 16;
      currentLines.push(
        `BT /F1 10 Tf 45 ${y} Td (Date:) Tj /F2 10 Tf 115 ${y} Td (${escapePdfText(dateStr)}) Tj ET`
      );
      currentLines.push(
        `BT /F1 10 Tf 330 ${y} Td (Payment:) Tj /F2 10 Tf 395 ${y} Td (${escapePdfText(
          isCredit ? 'Credit Bill (Khata)' : 'Cash / Paid'
        )}) Tj ET`
      );

      // Table Header bar
      y -= 25;
      currentLines.push('0.93 0.95 0.98 rg'); // Light slate fill
      currentLines.push(`40 ${y - 4} 515 20 re f`);
      currentLines.push('0.027 0.122 0.286 rg'); // Navy text
      currentLines.push(
        `BT /F1 8 Tf 45 ${y + 2} Td (SNo) Tj 68 ${y + 2} Td (Book Title / Description) Tj 225 ${
          y + 2
        } Td (Publisher / Series / Class) Tj 350 ${y + 2} Td (Qty) Tj 382 ${
          y + 2
        } Td (MRP) Tj 435 ${y + 2} Td (D.Price) Tj 495 ${y + 2} Td (Total) Tj ET`
      );

      y -= 16;
      return y;
    } else {
      // Continuation Header for Subsequent Pages
      currentLines.push('0.027 0.122 0.286 rg');
      currentLines.push(`40 785 515 30 re f`);
      currentLines.push('0.961 0.710 0.106 rg');
      currentLines.push(
        `BT /F1 11 Tf 55 797 Td (${escapePdfText(
          STORE_CONTACT_DETAILS.name
        )} - TAX INVOICE CONTINUATION) Tj ET`
      );
      currentLines.push('1 1 1 rg');
      currentLines.push(
        `BT /F2 9 Tf 330 797 Td (Invoice: ${escapePdfText(
          formattedInvoiceNo
        )} | Customer: ${escapePdfText(customerName)}) Tj ET`
      );

      y = 760;
      currentLines.push('0.93 0.95 0.98 rg');
      currentLines.push(`40 ${y - 4} 515 20 re f`);
      currentLines.push('0.027 0.122 0.286 rg');
      currentLines.push(
        `BT /F1 8 Tf 45 ${y + 2} Td (SNo) Tj 68 ${y + 2} Td (Book Title / Description) Tj 225 ${
          y + 2
        } Td (Publisher / Series / Class) Tj 350 ${y + 2} Td (Qty) Tj 382 ${
          y + 2
        } Td (MRP) Tj 435 ${y + 2} Td (D.Price) Tj 495 ${y + 2} Td (Total) Tj ET`
      );

      y -= 16;
      return y;
    }
  }

  let y = startPage(true);

  // Table Lines
  sale.items.forEach((item, idx) => {
    // If getting too close to bottom margin, start a new page
    if (y < 60) {
      y = startPage(false);
    }

    const sr = String(idx + 1);
    const title =
      item.productName.length > 27 ? item.productName.substring(0, 25) + '..' : item.productName;
    const hierarchyInfo = [
      item.publisherName && item.publisherName !== 'Unknown' ? item.publisherName : '',
      item.seriesName,
      item.targetClass,
    ]
      .filter(Boolean)
      .join('/') || item.publisherName || '-';
    const hierarchy =
      hierarchyInfo.length > 22 ? hierarchyInfo.substring(0, 20) + '..' : hierarchyInfo;
    const qty = String(item.quantity);
    const mrp = formatCurrency(item.unitPrice || 0);
    const dPrice = formatCurrency(
      typeof item.effectivePrice === 'number'
        ? item.effectivePrice
        : item.quantity > 0
        ? item.lineTotal / item.quantity
        : item.sellingPrice || item.unitPrice || 0
    );
    const lineTotal = formatCurrency(item.lineTotal);

    // Light row divider line
    currentLines.push('0.85 0.85 0.85 RG');
    currentLines.push(`40 ${y - 2} m 555 ${y - 2} l S`);

    currentLines.push('0.1 0.1 0.1 rg');
    currentLines.push(
      `BT /F2 8 Tf 45 ${y + 2} Td (${escapePdfText(sr)}) Tj 68 ${y + 2} Td (${escapePdfText(
        title
      )}) Tj 225 ${y + 2} Td (${escapePdfText(hierarchy)}) Tj 350 ${y + 2} Td (${escapePdfText(
        qty
      )}) Tj 382 ${y + 2} Td (${escapePdfText(mrp)}) Tj 435 ${y + 2} Td (${escapePdfText(
        dPrice
      )}) Tj 495 ${y + 2} Td (${escapePdfText(lineTotal)}) Tj ET`
    );
    y -= 15;
  });

  // Summary box needs at least 150 points (summary + footer notes)
  if (y < 155) {
    y = startPage(false);
  }

  // Position Summary Box
  y = Math.min(y - 10, 720);
  currentLines.push('0.97 0.97 0.97 rg');
  currentLines.push(`320 ${y - 85} 235 95 re f`);
  currentLines.push('0.027 0.122 0.286 RG');
  currentLines.push(`320 ${y - 85} 235 95 re s`);

  const subtotalStr = formatCurrency(sale.subtotal);
  const discountStr = formatCurrency(sale.totalDiscount);
  const grandTotalStr = formatCurrency(sale.grandTotal);
  const paidStr = formatCurrency(sale.paymentApplied || 0);
  const balanceStr = formatCurrency(sale.balanceAddedToCredit || 0);

  currentLines.push('0.1 0.1 0.1 rg');
  let sy = y - 4;
  currentLines.push(`BT /F2 9 Tf 330 ${sy} Td (Subtotal:) Tj 460 ${sy} Td (${escapePdfText(subtotalStr)}) Tj ET`);
  sy -= 15;
  currentLines.push(`BT /F2 9 Tf 330 ${sy} Td (Discount:) Tj 460 ${sy} Td (${escapePdfText(discountStr)}) Tj ET`);
  sy -= 17;
  currentLines.push('0.027 0.122 0.286 rg');
  currentLines.push(`BT /F1 11 Tf 330 ${sy} Td (Grand Total:) Tj 460 ${sy} Td (${escapePdfText(grandTotalStr)}) Tj ET`);
  sy -= 15;
  currentLines.push('0.1 0.1 0.1 rg');
  currentLines.push(`BT /F2 9 Tf 330 ${sy} Td (Amount Paid:) Tj 460 ${sy} Td (${escapePdfText(paidStr)}) Tj ET`);
  sy -= 15;
  if (isCredit) {
    currentLines.push('0.8 0.1 0.1 rg'); // Red
    currentLines.push(`BT /F1 9.5 Tf 330 ${sy} Td (Added to Khata:) Tj 460 ${sy} Td (${escapePdfText(balanceStr)}) Tj ET`);
  } else {
    currentLines.push('0.1 0.6 0.2 rg'); // Green
    currentLines.push(`BT /F1 9.5 Tf 330 ${sy} Td (Balance Owed:) Tj 460 ${sy} Td (PKR 0.00) Tj ET`);
  }

  // Footer notes
  currentLines.push('0.4 0.4 0.4 rg');
  currentLines.push(
    'BT /F2 8 Tf 45 60 Td (Terms: Goods once sold will only be returned/exchanged within 7 days with original invoice.) Tj ET'
  );
  currentLines.push(
    `BT /F1 8 Tf 45 46 Td (Thank you for your patronage! ${escapePdfText(
      STORE_CONTACT_DETAILS.name
    )} - Swat) Tj ET`
  );

  pages.push(currentLines);

  // Assemble full PDF 1.4 objects
  const numPages = pages.length;
  const encoder = new TextEncoder();
  const objects: string[] = [];

  // Object 1: Catalog
  objects.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj');

  // Object 2: Pages root
  const pageIds: string[] = [];
  for (let i = 0; i < numPages; i++) {
    pageIds.push(`${5 + i * 2} 0 R`);
  }
  objects.push(`2 0 obj\n<< /Type /Pages /Kids [${pageIds.join(' ')}] /Count ${numPages} >>\nendobj`);

  // Shared font definitions
  // Object 3: Helvetica-Bold
  objects.push('3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj');
  // Object 4: Helvetica
  objects.push('4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj');

  // Pages and Content streams (Objects 5, 6, 7, 8, ...)
  for (let i = 0; i < numPages; i++) {
    const pageObjNum = 5 + i * 2;
    const contentObjNum = pageObjNum + 1;
    const pageStream = pages[i].join('\n');
    const pageStreamLen = encoder.encode(pageStream).length;

    objects.push(
      `${pageObjNum} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents ${contentObjNum} 0 R /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> >>\nendobj`
    );
    objects.push(
      `${contentObjNum} 0 obj\n<< /Length ${pageStreamLen} >>\nstream\n${pageStream}\nendstream\nendobj`
    );
  }

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
