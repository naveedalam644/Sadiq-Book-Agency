import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import QRCode from 'qrcode';

console.log('=== STARTING CUSTOMER KHATA FILTERS & BILL QR CODE VERIFICATION ===');

// 1. Verify firestore.rules allows get on sales for QR code verification
const firestoreRules = fs.readFileSync(path.resolve('firestore.rules'), 'utf-8');
assert.ok(
  firestoreRules.includes('match /sales/{saleId}') &&
  firestoreRules.includes('allow get: if true;'),
  'firestore.rules must allow get on sales collection for public QR code verification'
);
console.log('✓ firestore.rules allows public get for sales verification.');

// 2. Verify qrCodeHelper.ts generates functional QR code data URL
const { generateInvoiceQrDataUrl, getInvoiceVerificationUrl } = await import('../src/utils/qrCodeHelper.ts');
const testInvoiceNo = 'INV-261117-001';
const verificationUrl = getInvoiceVerificationUrl(testInvoiceNo);
assert.ok(verificationUrl.includes('/verify-invoice/INV-261117-001'), 'Verification URL must format properly');

const qrDataUrl = await generateInvoiceQrDataUrl(testInvoiceNo, 200);
assert.ok(typeof qrDataUrl === 'string' && qrDataUrl.startsWith('data:image/png;base64,'), 'QR code must generate PNG data URL');
console.log('✓ qrCodeHelper.ts generated valid QR code data URL.');

// 3. Verify A4InvoiceModal renders QR codes in both Thermal and A4 formats
const a4InvoiceContent = fs.readFileSync(path.resolve('src/components/pos/A4InvoiceModal.tsx'), 'utf-8');
assert.ok(
  a4InvoiceContent.includes('generateInvoiceQrDataUrl'),
  'A4InvoiceModal must import generateInvoiceQrDataUrl'
);
assert.ok(
  a4InvoiceContent.includes('Scan for Digital Bill') && a4InvoiceContent.includes('qrCodeUrl'),
  'A4InvoiceModal must render QR code in thermal receipt layout'
);
assert.ok(
  a4InvoiceContent.includes('Digital Bill Verification') && a4InvoiceContent.includes('Scan QR code with smartphone'),
  'A4InvoiceModal must render QR code in standard A4/A5 full page layout'
);
console.log('✓ A4InvoiceModal dual thermal & A4/A5 QR code rendering verified.');

// 4. Verify CustomerBillModal has dual mode and requested filters:
// Book: Publisher > Series > Class
// Others: Category > Size > Sheet
const customerBillModalContent = fs.readFileSync(path.resolve('src/components/customers/CustomerBillModal.tsx'), 'utf-8');

// Mode Switcher Tabs
assert.ok(
  customerBillModalContent.includes('Books (Publisher') &&
  customerBillModalContent.includes('Notebook & Stationery (Category'),
  'CustomerBillModal must contain mode switcher for Books vs Notebooks/Stationery'
);

// Book Flow: Publisher > Series > Class
assert.ok(
  customerBillModalContent.includes('publisherFilter') &&
  customerBillModalContent.includes('seriesFilter') &&
  customerBillModalContent.includes('classFilter'),
  'CustomerBillModal must support Publisher, Series, and Class filters for books'
);

// Others Flow: Category > Size > Sheet
assert.ok(
  customerBillModalContent.includes('categoryFilter') &&
  customerBillModalContent.includes('sizeFilter') &&
  customerBillModalContent.includes('sheetFilter'),
  'CustomerBillModal must support Category, Size, and Sheet filters for notebooks/stationery'
);

// Direct quantity input & Add All
assert.ok(
  customerBillModalContent.includes('title="Direct quantity to add"') || customerBillModalContent.includes('enteredQty'),
  'CustomerBillModal must provide direct quantity input box for matching products'
);
assert.ok(
  customerBillModalContent.includes('handleAddAllMatching') && customerBillModalContent.includes('Add All'),
  'CustomerBillModal must provide Add All matching products button'
);

// Class Sequence Sorting
assert.ok(
  customerBillModalContent.includes('sortProductsByClassSequence'),
  'CustomerBillModal must sort products by educational class sequence'
);
console.log('✓ CustomerBillModal Book & Stationery dual hierarchy filters verified.');

// 5. Verify PublicInvoiceView page and routes
const publicInvoiceContent = fs.readFileSync(path.resolve('src/pages/PublicInvoiceView.tsx'), 'utf-8');
assert.ok(publicInvoiceContent.includes('getSaleById') || publicInvoiceContent.includes('getSaleByInvoiceNo'), 'PublicInvoiceView must fetch sale');
assert.ok(publicInvoiceContent.includes('Verified Authentic Invoice Document'), 'PublicInvoiceView must display verified status');
assert.ok(publicInvoiceContent.includes('handlePrint') && publicInvoiceContent.includes('handleShareWhatsApp'), 'PublicInvoiceView must provide Print & WhatsApp options');

const appRoutesContent = fs.readFileSync(path.resolve('src/routes/AppRoutes.tsx'), 'utf-8');
assert.ok(
  appRoutesContent.includes('path="/verify-invoice/:invoiceNo"') &&
  appRoutesContent.includes('PublicInvoiceView'),
  'AppRoutes must register public /verify-invoice/:invoiceNo route'
);
console.log('✓ PublicInvoiceView and public verification routes verified.');

console.log('=== ALL 5 VERIFICATION CHECKS PASSED SUCCESSFULLY! ===');

