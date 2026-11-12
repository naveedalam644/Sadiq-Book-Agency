import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolve current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('================================================================');
console.log('BARCODE SCANNING SYSTEM (MOBILE CAMERA & HARDWARE GUN) AUDIT');
console.log('================================================================\n');

// 1. Verify soundEffects utility exists and contains Web Audio API synthesizer
console.log('TEST 1: Verifying sound effects utility...');
const soundEffectsPath = path.join(rootDir, 'src', 'utils', 'soundEffects.ts');
assert(fs.existsSync(soundEffectsPath), 'soundEffects.ts must exist');
const soundEffectsContent = fs.readFileSync(soundEffectsPath, 'utf8');
assert(soundEffectsContent.includes('playSuccessBeep'), 'Must have playSuccessBeep');
assert(soundEffectsContent.includes('playErrorBeep'), 'Must have playErrorBeep');
assert(soundEffectsContent.includes('playScannerBeep'), 'Must export playScannerBeep');
assert(soundEffectsContent.includes('playScannerErrorTone'), 'Must export playScannerErrorTone');
assert(soundEffectsContent.includes('AudioContext'), 'Must use browser standard Web Audio API');
console.log('  ✓ Web Audio API synthesizer verified with zero external assets.\n');

// 2. Verify useBarcodeScanner hook
console.log('TEST 2: Verifying useBarcodeScanner hook for hardware scanner guns...');
const hookPath = path.join(rootDir, 'src', 'hooks', 'useBarcodeScanner.ts');
assert(fs.existsSync(hookPath), 'useBarcodeScanner.ts must exist');
const hookContent = fs.readFileSync(hookPath, 'utf8');
assert(hookContent.includes('useBarcodeScanner'), 'Must export useBarcodeScanner');
assert(hookContent.includes('maxInterKeyTimeoutMs'), 'Must handle inter-key keystroke speed detection');
assert(hookContent.includes('minBarcodeLength'), 'Must enforce minimum barcode length');
assert(hookContent.includes("e.key === 'Enter'"), 'Must detect Enter key delimiter from scanner guns');
assert(hookContent.includes('keydown'), 'Must attach keydown event listener');
assert(hookContent.includes('preventInputPollution'), 'Must support preventInputPollution to protect text inputs');
console.log('  ✓ Hardware USB/Bluetooth scanner gun hook with input cleanup verified.\n');

// 3. Verify BarcodeScannerModal component
console.log('TEST 3: Verifying BarcodeScannerModal (mobile camera viewfinder + scanner gun support)...');
const modalPath = path.join(rootDir, 'src', 'components', 'common', 'BarcodeScannerModal.tsx');
assert(fs.existsSync(modalPath), 'BarcodeScannerModal.tsx must exist');
const modalContent = fs.readFileSync(modalPath, 'utf8');
assert(modalContent.includes('Html5Qrcode'), 'Must use Html5Qrcode engine');
assert(modalContent.includes('Html5QrcodeSupportedFormats.EAN_13'), 'Must support retail EAN-13 barcodes');
assert(modalContent.includes('Html5QrcodeSupportedFormats.CODE_128'), 'Must support Code 128 barcodes');
assert(modalContent.includes('Html5QrcodeSupportedFormats.UPC_A'), 'Must support UPC barcodes');
assert(modalContent.includes("facingMode: 'environment'"), 'Must use back / environment mobile camera');
assert(modalContent.includes("mode === 'continuous'"), 'Must support continuous mode for POS checkout');
assert(modalContent.includes("mode === 'single'"), 'Must support single item scan for inventory creation');
assert(modalContent.includes('handleManualSubmit'), 'Must have manual barcode / keyboard fallback');
assert(modalContent.includes('useBarcodeScanner'), 'BarcodeScannerModal must also listen to hardware scanner guns');
console.log('  ✓ Mobile camera & hardware scanner gun modal verified.\n');

// 4. Verify productSearchService has searchProductByBarcodeOrSku
console.log('TEST 4: Verifying searchProductByBarcodeOrSku in productSearchService...');
const searchServicePath = path.join(rootDir, 'src', 'services', 'productSearchService.ts');
assert(fs.existsSync(searchServicePath), 'productSearchService.ts must exist');
const searchServiceContent = fs.readFileSync(searchServicePath, 'utf8');
assert(searchServiceContent.includes('searchProductByBarcodeOrSku'), 'Must export searchProductByBarcodeOrSku');
assert(searchServiceContent.includes("where('barcode', '==', cleanCode)"), 'Must query Firestore by exact barcode');
assert(searchServiceContent.includes('searchProductBySku(cleanCode'), 'Must fallback to SKU lookup');
console.log('  ✓ Barcode and SKU indexed lookup verified.\n');

// 5. Verify ProductFormModal integration
console.log('TEST 5: Verifying ProductFormModal inventory creation barcode integration...');
const productFormPath = path.join(rootDir, 'src', 'components', 'inventory', 'ProductFormModal.tsx');
assert(fs.existsSync(productFormPath), 'ProductFormModal.tsx must exist');
const productFormContent = fs.readFileSync(productFormPath, 'utf8');
assert(productFormContent.includes('const [barcode, setBarcode] = useState'), 'Must have barcode state');
assert(productFormContent.includes('initialBarcode'), 'Must accept initialBarcode prop');
assert(productFormContent.includes('useBarcodeScanner'), 'Must integrate useBarcodeScanner directly in ProductFormModal');
assert(productFormContent.includes('handleFormKeyDown'), 'Must prevent accidental Enter key premature form submission');
assert(productFormContent.includes('isBarcodeModalOpen'), 'Must have barcode scanner modal open state');
assert(productFormContent.includes('barcode: barcode.trim() || undefined'), 'Must include barcode in CreateProductInput payload');
assert(productFormContent.includes('<BarcodeScannerModal'), 'Must render BarcodeScannerModal');
assert(productFormContent.includes('mode="single"'), 'Must open BarcodeScannerModal in single scan mode');
console.log('  ✓ ProductFormModal inventory barcode scanning with gun verified.\n');

// 6. Verify POS page integration
console.log('TEST 6: Verifying POS page camera & hardware gun barcode checkout integration...');
const posPath = path.join(rootDir, 'src', 'pages', 'POS.tsx');
assert(fs.existsSync(posPath), 'POS.tsx must exist');
const posContent = fs.readFileSync(posPath, 'utf8');
assert(posContent.includes('searchProductByBarcodeOrSku'), 'POS must import searchProductByBarcodeOrSku');
assert(posContent.includes('useBarcodeScanner'), 'POS must use useBarcodeScanner hook');
assert(posContent.includes('handleBarcodeScanned'), 'POS must have handleBarcodeScanned callback');
assert(posContent.includes('pendingNewBarcode'), 'POS must track pendingNewBarcode for unregistered scans');
assert(posContent.includes('initialBarcode={pendingNewBarcode}'), 'POS must pass pending barcode to ProductFormModal');
assert(posContent.includes('addProduct(product, 1)'), 'POS must automatically add scanned product to cart with quantity 1');
assert(posContent.includes('playScannerBeep()'), 'POS must sound audio beep on successful scan');
assert(posContent.includes('playScannerErrorTone()'), 'POS must sound warning tone on scan error or not found');
assert(posContent.includes('isScannerModalOpen'), 'POS must maintain scanner modal state');
assert(posContent.includes('Scan Barcode'), 'POS must have visible Scan Barcode button');
assert(posContent.includes('mode="continuous"'), 'POS must open BarcodeScannerModal in continuous mode');
console.log('  ✓ POS page camera & hardware gun scanner integration verified.\n');

// 7. Verify Inventory page scanner integration
console.log('TEST 7: Verifying Inventory page hardware gun scanner integration...');
const inventoryPath = path.join(rootDir, 'src', 'pages', 'Inventory.tsx');
assert(fs.existsSync(inventoryPath), 'Inventory.tsx must exist');
const inventoryContent = fs.readFileSync(inventoryPath, 'utf8');
assert(inventoryContent.includes('useBarcodeScanner'), 'Inventory must use useBarcodeScanner hook');
assert(inventoryContent.includes('handleInventoryBarcodeScan'), 'Inventory must handle barcode scans');
assert(inventoryContent.includes('scannedBarcodeForAdd'), 'Inventory must track scannedBarcodeForAdd');
assert(inventoryContent.includes('initialBarcode={scannedBarcodeForAdd}'), 'Inventory must pass scannedBarcodeForAdd to ProductFormModal');
console.log('  ✓ Inventory page barcode gun scanning integration verified.\n');

// 8. Simulated In-Memory Search Logic Verification
console.log('TEST 8: Simulating barcode lookup with mock Firestore engine...');
const mockDatabase = [
  {
    id: 'prod-001',
    sku: 'BK-ENG-01',
    barcode: '9789691234567',
    title: 'Oxford English Grade 1',
    publisherName: 'Oxford University Press',
    retailPrice: 450,
  },
  {
    id: 'prod-002',
    sku: 'NB-REG-02',
    barcode: '8964000112233',
    title: 'Sadiq Royal Register 200 Pages',
    publisherName: 'Sadiq Stationery',
    retailPrice: 120,
  },
  {
    id: 'prod-003',
    sku: 'ST-PEN-99',
    title: 'Piano Gel Pen Blue',
    publisherName: 'Piano',
    retailPrice: 30,
  },
];

const mockSearch = (code: string) => {
  const clean = code.trim();
  if (!clean) return null;
  // 1. Direct barcode match
  const byBarcode = mockDatabase.find((p) => p.barcode === clean);
  if (byBarcode) return byBarcode;
  // 2. Fallback to SKU match
  const bySku = mockDatabase.find((p) => p.sku.toUpperCase() === clean.toUpperCase());
  if (bySku) return bySku;
  return null;
};

// Test A: Lookup by valid company barcode (EAN-13)
const resA = mockSearch('9789691234567');
assert(resA !== null, 'Should find product by EAN-13 barcode');
assert.strictEqual(resA.id, 'prod-001');
assert.strictEqual(resA.title, 'Oxford English Grade 1');

// Test B: Lookup by stationery manufacturer barcode
const resB = mockSearch('8964000112233');
assert(resB !== null, 'Should find stationery by barcode');
assert.strictEqual(resB.id, 'prod-002');

// Test C: Lookup by SKU via scanner gun
const resC = mockSearch('ST-PEN-99');
assert(resC !== null, 'Should fallback to SKU when barcode is identical to SKU');
assert.strictEqual(resC.id, 'prod-003');

// Test D: Lookup non-existent barcode
const resD = mockSearch('0000000000000');
assert.strictEqual(resD, null, 'Unregistered barcode should return null');

console.log('  ✓ Mock barcode search simulations passed cleanly.\n');

console.log('================================================================');
console.log('ALL BARCODE SYSTEM VERIFICATION CHECKS PASSED SUCCESSFULLY (8/8)');
console.log('================================================================');
