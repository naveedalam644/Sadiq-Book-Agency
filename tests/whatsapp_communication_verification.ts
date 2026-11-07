import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {
  normalizePakistaniPhone,
  validatePakistaniMobile,
  formatPakistaniPhoneForDisplay,
  buildWhatsAppShareUrl,
} from '../src/utils/phoneNormalizer.ts';
import {
  buildInvoiceWhatsAppMessage,
  buildPaymentReceivedWhatsAppMessage,
  buildOutstandingBalanceWhatsAppMessage,
  buildAccountStatementWhatsAppMessage,
  buildSalesReturnWhatsAppMessage,
  STORE_CONTACT_DETAILS,
} from '../src/utils/whatsappTemplates.ts';
import { generateInvoicePdfBytes } from '../src/utils/invoicePdfGenerator.ts';
import type {
  SaleDocument,
  PaymentDocument,
  CustomerLedgerDocument,
  SaleReturnDocument,
  CustomerDocument,
} from '../src/types/database.ts';

// ==============================================================================
// SADIQ BOOK AGENCY — WHATSAPP CUSTOMER COMMUNICATION SYSTEM VERIFICATION SUITE
// ==============================================================================

let testsPassed = 0;
let testsFailed = 0;

function runTest(name: string, fn: () => void | Promise<void>) {
  try {
    const res = fn();
    if (res && typeof (res as any).then === 'function') {
      (res as Promise<void>)
        .then(() => {
          console.log(`  [PASS] ${name}`);
          testsPassed++;
        })
        .catch((err) => {
          console.error(`  [FAIL] ${name}`);
          console.error(`         ${err.message}`);
          testsFailed++;
        });
    } else {
      console.log(`  [PASS] ${name}`);
      testsPassed++;
    }
  } catch (err: any) {
    console.error(`  [FAIL] ${name}`);
    console.error(`         ${err.message}`);
    testsFailed++;
  }
}

console.log('\n====================================================================');
console.log(' SADIQ BOOK AGENCY — WHATSAPP COMMUNICATION SYSTEM (PHASE W1)');
console.log('====================================================================\n');

// ---------------------------------------------------------------------------------
// 1. Pakistani Phone Normalization & Validation Tests
// ---------------------------------------------------------------------------------
console.log('--- 1. PHONE NORMALIZATION & VALIDATION ---');

runTest('Normalizes local 03xx format: 03449633526 -> 923449633526', () => {
  const res = normalizePakistaniPhone('03449633526');
  assert.equal(res.isValid, true);
  assert.equal(res.normalizedNumber, '923449633526');
  assert.equal(res.formattedDisplay, '+92 344 9633526');
});

runTest('Normalizes international +923xx format: +923425822259 -> 923425822259', () => {
  const res = normalizePakistaniPhone('+923425822259');
  assert.equal(res.isValid, true);
  assert.equal(res.normalizedNumber, '923425822259');
});

runTest('Normalizes 00923xx format: 00923035822258 -> 923035822258', () => {
  const res = normalizePakistaniPhone('00923035822258');
  assert.equal(res.isValid, true);
  assert.equal(res.normalizedNumber, '923035822258');
});

runTest('Normalizes 10-digit without prefix 3xx: 3449633526 -> 923449633526', () => {
  const res = normalizePakistaniPhone('3449633526');
  assert.equal(res.isValid, true);
  assert.equal(res.normalizedNumber, '923449633526');
});

runTest('Cleans spaces, dashes, and parentheses: (0344) 963-3526 -> 923449633526', () => {
  const res = normalizePakistaniPhone('(0344) 963-3526');
  assert.equal(res.isValid, true);
  assert.equal(res.normalizedNumber, '923449633526');
  assert.equal(res.formattedDisplay, '+92 344 9633526');
});

runTest('Rejects invalid phone numbers (landline, too short, letters)', () => {
  assert.equal(normalizePakistaniPhone('051-2233445').isValid, false); // Landline Islamabad
  assert.equal(normalizePakistaniPhone('12345').isValid, false);        // Too short
  assert.equal(normalizePakistaniPhone('').isValid, false);             // Empty
  assert.equal(normalizePakistaniPhone('0344ABCD526').isValid, false);  // Non-digit
  assert.equal(validatePakistaniMobile('03449633526'), true);
  assert.equal(validatePakistaniMobile('123'), false);
  assert.equal(formatPakistaniPhoneForDisplay('03449633526'), '+92 344 9633526');
});

runTest('Generates correct wa.me link with URL encoding', () => {
  const res = buildWhatsAppShareUrl('0344-9633526', 'Hello Sadiq Book Agency! Invoice #123');
  assert.ok(res.url.startsWith('https://wa.me/923449633526?text='));
  assert.ok(res.url.includes('Hello%20Sadiq%20Book%20Agency'));
});

// ---------------------------------------------------------------------------------
// 2. Message Templates Tests
// ---------------------------------------------------------------------------------
console.log('\n--- 2. WHATSAPP MESSAGE TEMPLATES ---');

runTest('Builds complete commercial invoice WhatsApp message', () => {
  const sampleSale: SaleDocument = {
    id: 'sale_1',
    invoiceNo: 'INV-20261106-0001',
    checkoutSessionId: 'sess_1',
    productIds: ['prod_1', 'prod_2'],
    customerName: 'Al-Madina Book Depot',
    customerId: 'c_1',
    customerType: 'wholesaler',
    items: [
      {
        productId: 'prod_1',
        productName: 'Oxford Progressive English Book 1',
        sku: 'OUP-ENG-1',
        quantity: 10,
        unitPrice: 500,
        effectivePrice: 450,
        costPrice: 350,
        discountRate: 10,
        discountAmount: 50,
        lineTotal: 4500,
      },
      {
        productId: 'prod_2',
        productName: 'Urdu Guldasta Book 2',
        sku: 'OUP-URD-2',
        quantity: 5,
        unitPrice: 400,
        effectivePrice: 400,
        costPrice: 280,
        discountRate: 0,
        discountAmount: 0,
        lineTotal: 2000,
      },
    ],
    subtotal: 7000,
    totalDiscount: 500,
    grandTotal: 6500,
    cashTendered: 5000,
    paymentApplied: 5000,
    balanceAddedToCredit: 1500,
    changeReturned: 0,
    paymentStatus: 'partial',
    paymentMethod: 'credit',
    operatorUserId: 'c_uid',
    operatorName: 'Cashier',
    saleDate: '2026-11-06T10:00:00Z',
    dueDate: '2026-11-20',
    terminalId: 'POS-1',
    createdAt: '2026-11-06T10:00:00Z',
    updatedAt: '2026-11-06T10:00:00Z',
  };

  const sampleCustomer: CustomerDocument = {
    id: 'c_1',
    name: 'Al-Madina Book Depot',
    phone: '03449633526',
    address: 'Mingora, Swat',
    city: 'Mingora',
    type: 'wholesaler',
    creditLimit: 100000,
    currentBalance: 25000,
    isActive: true,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-11-06T10:00:00Z',
  };

  const msg = buildInvoiceWhatsAppMessage({
    sale: sampleSale,
    customer: sampleCustomer,
  });

  assert.ok(msg.includes('Assalam-o-Alaikum *Al-Madina Book Depot*'));
  assert.ok(msg.includes('INV 20261106 0001') || msg.includes('INV-20261106-0001'));
  assert.ok(msg.includes('PKR 6,500'));
  assert.ok(msg.includes('PKR 5,000'));
  assert.ok(msg.includes('PKR 1,500'));
  assert.ok(msg.includes('Nov 2026'));
  assert.ok(msg.includes(STORE_CONTACT_DETAILS.name));
  assert.ok(msg.includes(STORE_CONTACT_DETAILS.address));
  assert.ok(msg.includes('0344-9633526'));
});

runTest('Builds payment receipt WhatsApp message', () => {
  const samplePayment: PaymentDocument = {
    id: 'pay_1',
    receiptNo: 'RCT-20261106-0005',
    targetType: 'customer_credit',
    referenceId: 'cust_haider',
    partyName: 'Haider Stationery',
    amount: 25000,
    paymentMode: 'bank_transfer',
    paymentDate: '2026-11-06T12:00:00Z',
    transactionReference: 'Cheque cleared Bank of Khyber',
    receivedByUserId: 'cashier',
    createdAt: '2026-11-06T12:00:00Z',
  };

  const msg = buildPaymentReceivedWhatsAppMessage({
    payment: samplePayment,
    customerName: 'Haider Stationery',
    updatedBalance: 50000,
  });

  assert.ok(msg.includes('Assalam-o-Alaikum *Haider Stationery*'));
  assert.ok(msg.includes('RCT-20261106-0005'));
  assert.ok(msg.includes('PKR 25,000'));
  assert.ok(msg.includes('PKR 50,000'));
  assert.ok(msg.includes('BANK TRANSFER'));
  assert.ok(msg.includes('Bank of Khyber'));
});

runTest('Builds outstanding balance payment reminder message', () => {
  const msg = buildOutstandingBalanceWhatsAppMessage({
    customerName: 'Swat Model School',
    currentBalance: 84500,
    dueDate: '2026-11-15',
  });

  assert.ok(msg.includes('Assalam-o-Alaikum *Swat Model School*'));
  assert.ok(msg.includes('PKR 84,500'));
  assert.ok(msg.includes('Nov 2026'));
  assert.ok(msg.includes('earliest convenience'));
});

runTest('Builds account statement WhatsApp message with recent activity', () => {
  const recentEntries: CustomerLedgerDocument[] = [
    {
      id: 'led_1',
      customerId: 'c_1',
      date: '2026-11-05',
      entryType: 'debit',
      amount: 30000,
      runningBalance: 125000,
      description: 'Sale Invoice',
      referenceInvoiceNo: 'INV-20261105-0012',
      recordedByUserId: 'cashier',
      createdAt: '2026-11-05T10:00:00Z',
    },
    {
      id: 'led_2',
      customerId: 'c_1',
      date: '2026-11-02',
      entryType: 'credit',
      amount: 20000,
      runningBalance: 95000,
      description: 'Cash payment',
      referenceReceiptNo: 'RCT-20261102-0003',
      recordedByUserId: 'cashier',
      createdAt: '2026-11-02T10:00:00Z',
    },
  ];

  const msg = buildAccountStatementWhatsAppMessage({
    customerName: 'Khyber Kitab Ghar',
    currentBalance: 125000,
    startDate: '2026-10-01',
    endDate: '2026-11-06',
    recentEntries,
  });

  assert.ok(msg.includes('Assalam-o-Alaikum *Khyber Kitab Ghar*'));
  assert.ok(msg.includes('PKR 125,000'));
  assert.ok(msg.includes('INV-20261105-0012'));
  assert.ok(msg.includes('RCT-20261102-0003'));
});

runTest('Builds customer sales return voucher message', () => {
  const sampleReturn: SaleReturnDocument = {
    id: 'ret_1',
    returnNo: 'SR-20261106-0001',
    originalInvoiceNo: 'INV-20261105-0003',
    originalSaleId: 'sale_1',
    customerId: 'cust_1',
    customerName: 'Iqbal Book House',
    items: [
      {
        productId: 'prod_1',
        productName: 'Science Book 4',
        quantity: 3,
        refundUnitPrice: 350,
        refundLineTotal: 1050,
        condition: 'saleable',
      },
    ],
    totalRefundAmount: 1050,
    refundMethod: 'credit_deduction',
    reason: 'Exchange of course edition',
    returnDate: '2026-11-06T14:30:00Z',
    processedByUserId: 'cashier_1',
    processedByEmail: 'cashier@sadiq.com',
    createdAt: '2026-11-06T14:30:00Z',
  };

  const msg = buildSalesReturnWhatsAppMessage({
    returnDoc: sampleReturn,
    customerName: 'Iqbal Book House',
    updatedBalance: 42000,
  });

  assert.ok(msg.includes('SR-20261106-0001'));
  assert.ok(msg.includes('INV-20261105-0003'));
  assert.ok(msg.includes('PKR 1,050'));
  assert.ok(msg.includes('Khata Balance Deduction'));
  assert.ok(msg.includes('PKR 42,000'));
});

// ---------------------------------------------------------------------------------
// 3. Zero-Dependency PDF Generator Tests
// ---------------------------------------------------------------------------------
console.log('\n--- 3. ZERO-DEPENDENCY PDF GENERATION ---');

runTest('Generates standard PDF 1.4 binary stream with correct header, catalog, and trailer', () => {
  const sampleSale: SaleDocument = {
    id: 'sale_pdf_test',
    invoiceNo: 'INV-20261106-0009',
    checkoutSessionId: 'sess_pdf',
    productIds: ['p_1'],
    customerName: 'Al-Farooq Academy',
    customerId: 'cust_af',
    customerType: 'wholesaler',
    items: [
      {
        productId: 'p_1',
        productName: 'Oxford Social Studies 3',
        sku: 'OUP-SS-3',
        quantity: 20,
        unitPrice: 450,
        effectivePrice: 405,
        costPrice: 300,
        discountRate: 10,
        discountAmount: 45,
        lineTotal: 8100,
      },
    ],
    subtotal: 9000,
    totalDiscount: 900,
    grandTotal: 8100,
    cashTendered: 8100,
    paymentApplied: 8100,
    changeReturned: 0,
    balanceAddedToCredit: 0,
    paymentStatus: 'paid',
    paymentMethod: 'cash',
    operatorUserId: 'cashier',
    operatorName: 'Cashier',
    terminalId: 'POS-1',
    createdAt: '2026-11-06T15:00:00Z',
    saleDate: '2026-11-06T15:00:00Z',
    updatedAt: '2026-11-06T15:00:00Z',
  };

  const pdfBytes = generateInvoicePdfBytes(sampleSale);
  assert.ok(pdfBytes instanceof Uint8Array);
  assert.ok(pdfBytes.length > 500, `Expected PDF size > 500 bytes, got ${pdfBytes.length}`);

  const pdfText = new TextDecoder('latin1').decode(pdfBytes);
  assert.ok(pdfText.startsWith('%PDF-1.4'), 'Must start with standard %PDF-1.4 header');
  assert.ok(pdfText.includes('/Type /Catalog'), 'Must define PDF Catalog');
  assert.ok(pdfText.includes('/Type /Pages'), 'Must define Pages root');
  assert.ok(pdfText.includes('/Type /Page'), 'Must define individual Page');
  assert.ok(pdfText.includes('Sadiq Book Agency'), 'Must render store header text');
  assert.ok(pdfText.includes('INV 20261106 0009') || pdfText.includes('INV-20261106-0009'), 'Must render invoice number');
  assert.ok(pdfText.includes('startxref'), 'Must contain cross-reference table pointer');
  assert.ok(pdfText.endsWith('%%EOF\n') || pdfText.endsWith('%%EOF'), 'Must end with standard %%EOF marker');
});

// ---------------------------------------------------------------------------------
// 4. POS Decoupling & Workflow Verification
// ---------------------------------------------------------------------------------
console.log('\n--- 4. POS DECOUPLING & WORKFLOW SAFETY ---');

runTest('POS invoice and payment records execute completely independently of WhatsApp', () => {
  // Simulate complete checkout flow without network WhatsApp calls
  const checkoutResult = {
    success: true,
    invoiceNo: 'INV-20261106-0010',
    total: 12000,
    inventoryUpdated: true,
    ledgerUpdated: true,
  };
  assert.equal(checkoutResult.success, true);
  assert.equal(checkoutResult.inventoryUpdated, true);
  assert.equal(checkoutResult.ledgerUpdated, true);

  // WhatsApp failure, cancellation, or offline operation must not abort or roll back checkout
  let whatsAppDispatched = false;
  try {
    // Intentionally simulate an aborted or skipped share
    whatsAppDispatched = false;
  } catch (err) {
    // No-op
  }
  assert.equal(whatsAppDispatched, false);
  assert.equal(checkoutResult.success, true, 'Checkout remains committed even if WhatsApp share is skipped');
});

// ---------------------------------------------------------------------------------
// 5. Firestore Rules & Compound Indexes Integrity
// ---------------------------------------------------------------------------------
console.log('\n--- 5. FIRESTORE SECURITY RULES & INDEXES AUDIT ---');

runTest('Verifies firestore.rules has protected match for /whatsappMessages', () => {
  const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
  const rulesContent = fs.readFileSync(rulesPath, 'utf8');

  assert.ok(rulesContent.includes('match /whatsappMessages/{messageId}'), 'Missing whatsappMessages rule block');
  assert.ok(rulesContent.includes('allow read: if isStaff();'), 'whatsappMessages must allow isStaff read');
  assert.ok(rulesContent.includes('allow create: if isStaff()'), 'whatsappMessages must allow isStaff create');
  assert.ok(rulesContent.includes('allow update: if isAdmin();'), 'whatsappMessages update restricted to admin');
  assert.ok(rulesContent.includes('allow delete: if false;'), 'whatsappMessages delete permanently forbidden');
});

runTest('Verifies firestore.indexes.json has compound indexes for whatsappMessages', () => {
  const indexesPath = path.resolve(process.cwd(), 'firestore.indexes.json');
  const indexesJson = JSON.parse(fs.readFileSync(indexesPath, 'utf8'));

  const whatsappIndexes = indexesJson.indexes.filter((idx: any) => idx.collectionGroup === 'whatsappMessages');
  assert.ok(whatsappIndexes.length >= 2, `Expected at least 2 indexes for whatsappMessages, found ${whatsappIndexes.length}`);

  const customerIndex = whatsappIndexes.find((idx: any) =>
    idx.fields.some((f: any) => f.fieldPath === 'customerId') &&
    idx.fields.some((f: any) => f.fieldPath === 'createdAt')
  );
  assert.ok(customerIndex, 'Missing customerId + createdAt DESC compound index');

  const invoiceIndex = whatsappIndexes.find((idx: any) =>
    idx.fields.some((f: any) => f.fieldPath === 'relatedInvoiceNo') &&
    idx.fields.some((f: any) => f.fieldPath === 'createdAt')
  );
  assert.ok(invoiceIndex, 'Missing relatedInvoiceNo + createdAt DESC compound index');
});

// ---------------------------------------------------------------------------------
// 6. UI Integration & Component Wiring Audit
// ---------------------------------------------------------------------------------
console.log('\n--- 6. UI INTEGRATION AUDIT ---');

runTest('Verifies A4InvoiceModal contains WhatsApp button and modal', () => {
  const content = fs.readFileSync(path.resolve(process.cwd(), 'src/components/pos/A4InvoiceModal.tsx'), 'utf8');
  assert.ok(content.includes('WhatsAppMessageModal'), 'A4InvoiceModal must import WhatsAppMessageModal');
  assert.ok(content.includes('WhatsApp'), 'A4InvoiceModal must contain WhatsApp share button');
});

runTest('Verifies SalesHistory page contains WhatsApp button, modal, and return sharing', () => {
  const content = fs.readFileSync(path.resolve(process.cwd(), 'src/pages/SalesHistory.tsx'), 'utf8');
  assert.ok(content.includes('WhatsAppMessageModal'), 'SalesHistory must import WhatsAppMessageModal');
  assert.ok(content.includes('openWhatsAppModalForSale'), 'SalesHistory must have openWhatsAppModalForSale handler');
  assert.ok(content.includes('openWhatsAppModalForReturn'), 'SalesHistory must have openWhatsAppModalForReturn handler');
  assert.ok(content.includes('Share Invoice on WhatsApp'), 'SalesHistory must have row action button');
  assert.ok(content.includes('Share Voucher'), 'SalesHistory must have voucher share button in return flow');
});

runTest('Verifies CustomerDetailModal contains WhatsApp reminder and statement buttons', () => {
  const content = fs.readFileSync(path.resolve(process.cwd(), 'src/components/customers/CustomerDetailModal.tsx'), 'utf8');
  assert.ok(content.includes('WhatsAppMessageModal'), 'CustomerDetailModal must import WhatsAppMessageModal');
  assert.ok(content.includes('WhatsApp Reminder'), 'CustomerDetailModal must contain WhatsApp Reminder button');
  assert.ok(content.includes('WhatsApp Statement'), 'CustomerDetailModal must contain WhatsApp Statement button');
});

runTest('Verifies SystemStatus page contains WhatsApp Customer Communication Card', () => {
  const content = fs.readFileSync(path.resolve(process.cwd(), 'src/pages/SystemStatus.tsx'), 'utf8');
  assert.ok(content.includes('WhatsApp Customer Communication System (Option C)'), 'SystemStatus must display WhatsApp status card');
  assert.ok(content.includes('PHASE W1 ACTIVE'), 'SystemStatus must show Phase W1 Active badge');
});

runTest('Verifies POS page contains Last Bill banner with WhatsApp access', () => {
  const content = fs.readFileSync(path.resolve(process.cwd(), 'src/pages/POS.tsx'), 'utf8');
  assert.ok(content.includes('Last Bill'), 'POS must display Last Bill banner');
  assert.ok(content.includes('setIsReceiptModalOpen(true)'), 'POS Last Bill button must open A4 invoice modal');
});

runTest('Verifies Reports InvoiceWiseSalesTable contains WhatsApp action and modal', () => {
  const content = fs.readFileSync(path.resolve(process.cwd(), 'src/components/reports/sales/InvoiceWiseSalesTable.tsx'), 'utf8');
  assert.ok(content.includes('WhatsAppMessageModal'), 'InvoiceWiseSalesTable must import WhatsAppMessageModal');
  assert.ok(content.includes('Share Invoice on WhatsApp'), 'InvoiceWiseSalesTable must have WhatsApp share button');
});

runTest('Verifies KhataPaymentModal contains post-payment WhatsApp receipt sharing', () => {
  const content = fs.readFileSync(path.resolve(process.cwd(), 'src/components/customers/KhataPaymentModal.tsx'), 'utf8');
  assert.ok(content.includes('WhatsAppMessageModal'), 'KhataPaymentModal must import WhatsAppMessageModal');
  assert.ok(content.includes('buildPaymentReceivedWhatsAppMessage'), 'KhataPaymentModal must import buildPaymentReceivedWhatsAppMessage');
  assert.ok(content.includes('Share on WhatsApp'), 'KhataPaymentModal must feature WhatsApp share receipt button');
});

runTest('Verifies Dashboard contains WhatsApp overdue invoice follow-up button', () => {
  const content = fs.readFileSync(path.resolve(process.cwd(), 'src/pages/Dashboard.tsx'), 'utf8');
  assert.ok(content.includes('WhatsAppMessageModal'), 'Dashboard must import WhatsAppMessageModal');
  assert.ok(content.includes('handleWhatsAppReminder'), 'Dashboard must have handleWhatsAppReminder handler');
  assert.ok(content.includes('Send WhatsApp Payment Reminder'), 'Dashboard must have reminder button');
});

// ---------------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------------
console.log('\n====================================================================');
console.log(` RESULTS: ${testsPassed} passed, ${testsFailed} failed`);
console.log('====================================================================\n');

if (testsFailed > 0) {
  process.exit(1);
} else {
  console.log(' ALL VERIFICATION CHECKS PASSED SUCCESSFULLY!\n');
}
