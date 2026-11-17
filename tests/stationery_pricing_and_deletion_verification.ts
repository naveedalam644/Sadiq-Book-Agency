import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

console.log('--- Verifying Stationery Pricing Simplification & Firebase Deletions ---');

// 1. Verify firestore.rules allows deletion for products, customers, suppliers
const firestoreRules = fs.readFileSync(path.resolve('firestore.rules'), 'utf-8');
assert.ok(
  firestoreRules.includes('match /products/{productId}') &&
  firestoreRules.includes('allow delete: if isStaff();'),
  'firestore.rules must allow delete for products by staff'
);
assert.ok(
  firestoreRules.includes('match /customers/{customerId}') &&
  firestoreRules.includes('allow delete: if isStaff();'),
  'firestore.rules must allow delete for customers by staff'
);
assert.ok(
  firestoreRules.includes('match /suppliers/{supplierId}') &&
  firestoreRules.includes('allow read, write: if isStaff();'),
  'firestore.rules must allow write/delete for suppliers by staff'
);
console.log('✓ firestore.rules security permissions verified.');

// 2. Verify customerService.ts has deleteCustomer calling deleteDoc
const customerService = fs.readFileSync(path.resolve('src/services/customerService.ts'), 'utf-8');
assert.ok(customerService.includes('deleteDoc'), 'customerService must import deleteDoc');
assert.ok(customerService.includes('deleteCustomer = async'), 'customerService must export deleteCustomer');
assert.ok(customerService.includes("await deleteDoc(docRef)"), 'deleteCustomer must call deleteDoc on customers docRef');
console.log('✓ customerService.ts deleteCustomer implementation verified.');

// 3. Verify supplierService.ts has deleteSupplier calling deleteDoc
const supplierService = fs.readFileSync(path.resolve('src/services/supplierService.ts'), 'utf-8');
assert.ok(supplierService.includes('deleteDoc'), 'supplierService must import deleteDoc');
assert.ok(supplierService.includes('deleteSupplier = async'), 'supplierService must export deleteSupplier');
assert.ok(supplierService.includes("await deleteDoc(supRef)"), 'deleteSupplier must call deleteDoc on suppliers supRef');
console.log('✓ supplierService.ts deleteSupplier implementation verified.');

// 4. Verify discountService.ts prioritizes configured retailPrice over lastSoldPrice
const discountService = fs.readFileSync(path.resolve('src/services/discountService.ts'), 'utf-8');
assert.ok(
  discountService.includes('const defaultPrice = standardRetail > 0 ? standardRetail : (product.lastSoldPrice || 0);'),
  'discountService must prioritize configured standardRetail over old lastSoldPrice'
);
console.log('✓ discountService.ts pricing resolution verified.');

// 5. Verify ProductFormModal.tsx stationery pricing simplification and deletion option
const productFormModal = fs.readFileSync(path.resolve('src/components/inventory/ProductFormModal.tsx'), 'utf-8');
assert.ok(
  productFormModal.includes('Purchase Price (Cost) (PKR) *') &&
  productFormModal.includes('Default Sale Price (PKR) *'),
  'ProductFormModal must display simplified Purchase Price and Default Sale Price'
);
assert.ok(
  !productFormModal.includes('Wholesale Rate (PKR)') &&
  !productFormModal.includes('Market Shop Rate (PKR)'),
  'ProductFormModal must not show Wholesale or Market Shop Rate fields for stationery'
);
assert.ok(
  productFormModal.includes('onDelete?: (product: ProductDocument) => Promise<void>'),
  'ProductFormModal must accept onDelete prop'
);
assert.ok(
  productFormModal.includes('Delete Product'),
  'ProductFormModal must provide Delete Product button in edit mode'
);
console.log('✓ ProductFormModal.tsx simplified pricing and delete button verified.');

// 6. Verify ProductDetailModal.tsx deletion option
const productDetailModal = fs.readFileSync(path.resolve('src/components/inventory/ProductDetailModal.tsx'), 'utf-8');
assert.ok(productDetailModal.includes('onDelete?: (product: ProductDocument) => void'), 'ProductDetailModal must accept onDelete prop');
assert.ok(productDetailModal.includes('Delete Product'), 'ProductDetailModal must render Delete Product button');
console.log('✓ ProductDetailModal.tsx delete button verified.');

// 7. Verify Inventory.tsx handles product deletion from both table and modals
const inventoryPage = fs.readFileSync(path.resolve('src/pages/Inventory.tsx'), 'utf-8');
assert.ok(inventoryPage.includes('handleDeleteProduct'), 'Inventory.tsx must define handleDeleteProduct');
assert.ok(inventoryPage.includes('onDelete={handleDeleteProduct}'), 'Inventory.tsx must pass onDelete to modals');
console.log('✓ Inventory.tsx product deletion wiring verified.');

// 8. Verify CustomerFormModal and CustomerDetailModal deletion buttons
const customerFormModal = fs.readFileSync(path.resolve('src/components/customers/CustomerFormModal.tsx'), 'utf-8');
assert.ok(customerFormModal.includes('Delete Customer'), 'CustomerFormModal must render Delete Customer button');
const customerDetailModal = fs.readFileSync(path.resolve('src/components/customers/CustomerDetailModal.tsx'), 'utf-8');
assert.ok(customerDetailModal.includes('Delete Customer'), 'CustomerDetailModal must render Delete Customer button');
console.log('✓ Customer modals deletion buttons verified.');

// 9. Verify Customers.tsx table and modal delete actions
const customersPage = fs.readFileSync(path.resolve('src/pages/Customers.tsx'), 'utf-8');
assert.ok(customersPage.includes('deleteCustomer'), 'Customers.tsx must import deleteCustomer');
assert.ok(customersPage.includes('handleDeleteCustomer'), 'Customers.tsx must define handleDeleteCustomer');
assert.ok(customersPage.includes('onDelete={handleDeleteCustomer}'), 'Customers.tsx must pass onDelete to Customer modals');
console.log('✓ Customers.tsx customer deletion wiring verified.');

// 10. Verify SupplierFormModal and SupplierDetailModal deletion buttons
const supplierFormModal = fs.readFileSync(path.resolve('src/components/suppliers/SupplierFormModal.tsx'), 'utf-8');
assert.ok(supplierFormModal.includes('Delete Supplier'), 'SupplierFormModal must render Delete Supplier button');
const supplierDetailModal = fs.readFileSync(path.resolve('src/components/suppliers/SupplierDetailModal.tsx'), 'utf-8');
assert.ok(supplierDetailModal.includes('Delete Supplier'), 'SupplierDetailModal must render Delete Supplier button');
console.log('✓ Supplier modals deletion buttons verified.');

// 11. Verify Suppliers.tsx table and modal delete actions
const suppliersPage = fs.readFileSync(path.resolve('src/pages/Suppliers.tsx'), 'utf-8');
assert.ok(suppliersPage.includes('deleteSupplier'), 'Suppliers.tsx must import deleteSupplier');
assert.ok(suppliersPage.includes('handleDeleteSupplier'), 'Suppliers.tsx must define handleDeleteSupplier');
assert.ok(suppliersPage.includes('onDelete={handleDeleteSupplier}'), 'Suppliers.tsx must pass onDelete to Supplier modals');
console.log('✓ Suppliers.tsx supplier deletion wiring verified.');

// 12. Verify POS.tsx displays Default Sale Rate
const posPage = fs.readFileSync(path.resolve('src/pages/POS.tsx'), 'utf-8');
assert.ok(posPage.includes('Default Sale Rate'), 'POS.tsx must display Default Sale Rate for stationery');
console.log('✓ POS.tsx pricing label verified.');

console.log('ALL VERIFICATIONS PASSED SUCCESSFULLY!');
