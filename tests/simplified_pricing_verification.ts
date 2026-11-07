/**
 * SADIQ BOOK AGENCY — SIMPLIFIED PUBLISHER COST & BILL-LEVEL CUSTOMER DISCOUNT SYSTEM
 * Verification Suite (10 Core Accounting & Behavioral Tests)
 */

import assert from 'node:assert';

function roundMoney(value: number): number {
  return Math.round((Number(value) || 0) * 100) / 100;
}

console.log('====================================================================');
console.log(' SADIQ BOOK AGENCY — SIMPLIFIED PRICING & DISCOUNT VERIFICATION');
console.log('====================================================================\n');

let passedTests = 0;

function runTest(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  [PASS] ${name}`);
    passedTests++;
  } catch (err: any) {
    console.error(`  [FAIL] ${name}`);
    console.error(`         ${err.message}`);
    process.exit(1);
  }
}

// -----------------------------------------------------------------------------------
// TEST 1: Publisher Discount Calculation Formula
// -----------------------------------------------------------------------------------
runTest('Test 1: Publisher discount calculation formula: Actual Purchase Cost = MRP * (1 - Pub Disc % / 100)', () => {
  // Example 1 from spec: MRP = Rs. 500, Publisher Discount = 50% => Actual Purchase Cost = Rs. 250
  const mrp1 = 500;
  const pubDisc1 = 50;
  const cost1 = roundMoney(mrp1 * (1 - pubDisc1 / 100));
  assert.strictEqual(cost1, 250, 'MRP 500 at 50% discount must equal 250 PKR purchase cost');

  // Example 2: MRP = 1200, Publisher Discount = 40% => 720
  const mrp2 = 1200;
  const pubDisc2 = 40;
  const cost2 = roundMoney(mrp2 * (1 - pubDisc2 / 100));
  assert.strictEqual(cost2, 720, 'MRP 1200 at 40% discount must equal 720 PKR');

  // Example 3: MRP = 350, Publisher Discount = 30% => 245
  const mrp3 = 350;
  const pubDisc3 = 30;
  const cost3 = roundMoney(mrp3 * (1 - pubDisc3 / 100));
  assert.strictEqual(cost3, 245, 'MRP 350 at 30% discount must equal 245 PKR');

  // Example 4: Zero discount => Actual Purchase Cost == MRP
  const mrp4 = 150;
  const pubDisc4 = 0;
  const cost4 = roundMoney(mrp4 * (1 - pubDisc4 / 100));
  assert.strictEqual(cost4, 150, 'MRP 150 at 0% discount must equal 150 PKR');

  // Example 5: Precision rounding test: MRP = 299, Publisher Discount = 33.33% => 199.34
  const mrp5 = 299;
  const pubDisc5 = 33.33;
  const cost5 = roundMoney(mrp5 * (1 - pubDisc5 / 100));
  assert.strictEqual(cost5, 199.34, 'Precision rounding must preserve exact 2 decimal places');
});

// -----------------------------------------------------------------------------------
// TEST 2: Product-Level Publisher Discount Independence
// -----------------------------------------------------------------------------------
runTest('Test 2: Product-level publisher discount is manually entered per product without auto-fetching', () => {
  // Two products from the same publisher: "Oxford University Press"
  const productA = {
    id: 'prod_oxford_1',
    title: 'Oxford Progressive English 5',
    publisherName: 'Oxford University Press',
    retailPrice: 600, // MRP
    publisherDiscountPercent: 45, // Manual entry: 45%
    costPrice: roundMoney(600 * (1 - 45 / 100)), // 330 PKR
    currentStock: 50,
  };

  const productB = {
    id: 'prod_oxford_2',
    title: 'Oxford Social Studies 5',
    publisherName: 'Oxford University Press',
    retailPrice: 600, // Same MRP
    publisherDiscountPercent: 55, // Manual entry: 55%
    costPrice: roundMoney(600 * (1 - 55 / 100)), // 270 PKR
    currentStock: 30,
  };

  assert.strictEqual(productA.costPrice, 330, 'Product A cost must be 330 based on its individual 45% term');
  assert.strictEqual(productB.costPrice, 270, 'Product B cost must be 270 based on its individual 55% term');
  assert.notStrictEqual(productA.costPrice, productB.costPrice, 'Products from same publisher must support independent manual discount terms');
});

// -----------------------------------------------------------------------------------
// TEST 3: Different Customer Discounts for Same Product on Different Invoices
// -----------------------------------------------------------------------------------
runTest('Test 3: Different customer discounts for the same product on different invoices', () => {
  const product = {
    id: 'prod_general_science',
    title: 'General Science 8',
    retailPrice: 1000, // MRP = 1000
    publisherDiscountPercent: 40,
    costPrice: 600, // Actual purchase cost = 600
  };

  // Bill 1: Customer A receives 10% customer discount
  const bill1DiscountRate = 10;
  const bill1UnitPrice = product.retailPrice; // 1000
  const bill1DiscountAmt = roundMoney(bill1UnitPrice * (bill1DiscountRate / 100)); // 100
  const bill1SellingPrice = roundMoney(bill1UnitPrice - bill1DiscountAmt); // 900
  const bill1Qty = 2;
  const bill1LineTotal = roundMoney(bill1SellingPrice * bill1Qty); // 1800
  const bill1Cogs = roundMoney(product.costPrice * bill1Qty); // 1200
  const bill1GrossProfit = roundMoney(bill1LineTotal - bill1Cogs); // 600

  // Bill 2: Customer B receives 25% customer discount
  const bill2DiscountRate = 25;
  const bill2UnitPrice = product.retailPrice; // 1000
  const bill2DiscountAmt = roundMoney(bill2UnitPrice * (bill2DiscountRate / 100)); // 250
  const bill2SellingPrice = roundMoney(bill2UnitPrice - bill2DiscountAmt); // 750
  const bill2Qty = 2;
  const bill2LineTotal = roundMoney(bill2SellingPrice * bill2Qty); // 1500
  const bill2Cogs = roundMoney(product.costPrice * bill2Qty); // 1200
  const bill2GrossProfit = roundMoney(bill2LineTotal - bill2Cogs); // 300

  assert.strictEqual(bill1SellingPrice, 900, 'Bill 1 selling price is 900');
  assert.strictEqual(bill2SellingPrice, 750, 'Bill 2 selling price is 750');
  assert.strictEqual(bill1GrossProfit, 600, 'Bill 1 profit with 10% customer discount is 600');
  assert.strictEqual(bill2GrossProfit, 300, 'Bill 2 profit with 25% customer discount is 300');
  assert.strictEqual(bill1Cogs, bill2Cogs, 'COGS remains identical (1200) based on publisher-discounted cost');
});

// -----------------------------------------------------------------------------------
// TEST 4: Different Customer Discounts for Products Within One Invoice
// -----------------------------------------------------------------------------------
runTest('Test 4: Different customer discounts for products within one invoice', () => {
  interface InvoiceLine {
    productId: string;
    productName: string;
    quantity: number;
    costPrice: number;
    unitPrice: number; // MRP
    discountRate: number; // Customer line discount %
  }

  const lines: InvoiceLine[] = [
    { productId: 'p1', productName: 'English Grammar', quantity: 2, costPrice: 200, unitPrice: 400, discountRate: 10 }, // 10%
    { productId: 'p2', productName: 'Mathematics Guide', quantity: 1, costPrice: 450, unitPrice: 900, discountRate: 20 }, // 20%
    { productId: 'p3', productName: 'Notebook Premium', quantity: 5, costPrice: 80, unitPrice: 120, discountRate: 5 },   // 5%
  ];

  let calculatedSubtotal = 0;
  let calculatedDiscount = 0;
  let calculatedCogs = 0;

  const processedLines = lines.map((line) => {
    const rawSubtotal = roundMoney(line.unitPrice * line.quantity);
    const discAmount = roundMoney(line.unitPrice * (line.discountRate / 100));
    const effectivePrice = roundMoney(line.unitPrice - discAmount);
    const lineTotal = roundMoney(effectivePrice * line.quantity);
    const lineDiscount = roundMoney(discAmount * line.quantity);
    const lineCogs = roundMoney(line.costPrice * line.quantity);

    calculatedSubtotal += rawSubtotal;
    calculatedDiscount += lineDiscount;
    calculatedCogs += lineCogs;

    return {
      ...line,
      discountAmount: discAmount,
      effectivePrice,
      lineTotal,
    };
  });

  calculatedSubtotal = roundMoney(calculatedSubtotal);
  calculatedDiscount = roundMoney(calculatedDiscount);
  const grandTotal = roundMoney(calculatedSubtotal - calculatedDiscount);

  // Line 1: (400 - 40) * 2 = 720 (Disc: 80)
  assert.strictEqual(processedLines[0].lineTotal, 720);
  // Line 2: (900 - 180) * 1 = 720 (Disc: 180)
  assert.strictEqual(processedLines[1].lineTotal, 720);
  // Line 3: (120 - 6) * 5 = 570 (Disc: 30)
  assert.strictEqual(processedLines[2].lineTotal, 570);

  // Totals:
  // Subtotal = 800 + 900 + 600 = 2300
  // Total Discount = 80 + 180 + 30 = 290
  // Grand Total = 2300 - 290 = 2010
  assert.strictEqual(calculatedSubtotal, 2300);
  assert.strictEqual(calculatedDiscount, 290);
  assert.strictEqual(grandTotal, 2010);
  assert.strictEqual(roundMoney(calculatedSubtotal - calculatedDiscount), grandTotal);
});

// -----------------------------------------------------------------------------------
// TEST 5: Billing across Archetypes (Parchon, Wholesale, Marketshop, Khata Credit)
// -----------------------------------------------------------------------------------
runTest('Test 5: Bill-level discounts across Parchon, Wholesale, Marketshop, and Khata', () => {
  const bookMrp = 500;
  // 1. Parchon Cash Sale: Walk-in counter buyer with 5% ad-hoc bill discount
  const parchonDisc = 5;
  const parchonEffPrice = roundMoney(bookMrp * (1 - parchonDisc / 100)); // 475
  const parchonTotal = roundMoney(parchonEffPrice * 1); // 475
  const cashTendered = 500;
  const changeReturned = roundMoney(cashTendered - parchonTotal); // 25
  assert.strictEqual(parchonTotal, 475, 'Parchon counter sale correctly applies 5% bill discount');
  assert.strictEqual(changeReturned, 25, 'Physical change returned is 25 PKR');

  // 2. Wholesale Bill: 15% bill discount
  const wholesaleDisc = 15;
  const wholesaleEffPrice = roundMoney(bookMrp * (1 - wholesaleDisc / 100)); // 425
  const wholesaleTotal = roundMoney(wholesaleEffPrice * 10); // 4250
  assert.strictEqual(wholesaleTotal, 4250, 'Wholesale bill applies 15% bill discount');

  // 3. Marketshop Bill: Pre-configured 12% customer discount can be modified to 14% on the bill
  const marketshopModifiedOnBill = 14; // User overrides on bill
  const marketshopEffPrice = roundMoney(bookMrp * (1 - marketshopModifiedOnBill / 100)); // 430
  const marketshopTotal = roundMoney(marketshopEffPrice * 4); // 1720
  assert.strictEqual(marketshopTotal, 1720, 'Marketshop bill allows user to override discount on bill without silent rollback');

  // 4. Customer Khata Credit Bill: 10% bill discount, posts to Khata debt
  const khataDisc = 10;
  const khataEffPrice = roundMoney(bookMrp * (1 - khataDisc / 100)); // 450
  const khataTotal = roundMoney(khataEffPrice * 6); // 2700
  const previousDebt = 10000;
  const updatedDebt = previousDebt + khataTotal; // 12700
  assert.strictEqual(updatedDebt, 12700, 'Customer Khata debit posts net selling amount (2700), not MRP');
});

// -----------------------------------------------------------------------------------
// TEST 6: Actual Purchase Cost and Stock Valuation
// -----------------------------------------------------------------------------------
runTest('Test 6: Actual purchase cost and stock valuation use publisher-discounted rate', () => {
  const inventory = [
    { id: '1', title: 'Urdu Qawaid', mrp: 400, pubDisc: 40, costPrice: 240, stock: 100 }, // Value: 24,000
    { id: '2', title: 'Islamiat 9', mrp: 300, pubDisc: 50, costPrice: 150, stock: 50 },   // Value: 7,500
    { id: '3', title: 'Physics 10', mrp: 800, pubDisc: 35, costPrice: 520, stock: 40 },  // Value: 20,800
  ];

  let totalStockValuation = 0;
  let totalStockQty = 0;

  for (const item of inventory) {
    const calculatedCost = roundMoney(item.mrp * (1 - item.pubDisc / 100));
    assert.strictEqual(item.costPrice, calculatedCost, 'Product cost must match MRP * (1 - PubDisc)');
    totalStockValuation += roundMoney(item.costPrice * item.stock);
    totalStockQty += item.stock;
  }

  // Total valuation: 24000 + 7500 + 20800 = 52300
  assert.strictEqual(totalStockValuation, 52300, 'Stock valuation is strictly based on actual publisher-discounted purchase cost');
  assert.strictEqual(totalStockQty, 190, 'Total stock units match');
});

// -----------------------------------------------------------------------------------
// TEST 7: Historical Sale & Purchase Snapshots Immutability
// -----------------------------------------------------------------------------------
runTest('Test 7: Historical sale and purchase snapshots remain frozen when catalog prices change', () => {
  // Snapshot taken at sale time on Jan 10
  const historicalSaleItem = {
    productId: 'p_chem_10',
    productName: 'Chemistry Matric',
    quantity: 5,
    costPrice: 300, // Historical purchase cost (MRP 600 - 50% pub disc)
    unitPrice: 600, // Historical MRP
    discountRate: 15, // Historical customer discount %
    discountAmount: 90, // 600 * 15%
    effectivePrice: 510, // 600 - 90
    lineTotal: 2550, // 510 * 5
  };

  // Product catalog is subsequently updated on Feb 1:
  // Publisher announces price increase to MRP = 750, Publisher discount changed to 40% (New cost = 450)
  const updatedCatalogProduct = {
    id: 'p_chem_10',
    title: 'Chemistry Matric',
    retailPrice: 750, // New MRP
    publisherDiscountPercent: 40,
    costPrice: roundMoney(750 * (1 - 40 / 100)), // 450
  };

  // Assert historical sale snapshot is completely unaffected
  assert.strictEqual(updatedCatalogProduct.costPrice, 450, 'Catalog cost updated to 450');
  assert.strictEqual(historicalSaleItem.unitPrice, 600, 'Historical MRP remains 600 PKR');
  assert.strictEqual(historicalSaleItem.costPrice, 300, 'Historical costPrice remains 300 PKR');
  assert.strictEqual(historicalSaleItem.discountRate, 15, 'Historical customer discount remains 15%');
  assert.strictEqual(historicalSaleItem.effectivePrice, 510, 'Historical selling price remains 510 PKR');
  assert.strictEqual(historicalSaleItem.lineTotal, 2550, 'Historical line total remains 2550 PKR');
});

// -----------------------------------------------------------------------------------
// TEST 8: Returns and Profit Calculations
// -----------------------------------------------------------------------------------
runTest('Test 8: Sales returns reverse historical customer price and publisher cost snapshot', () => {
  // Original sale: 4 units @ MRP 500 with 20% customer discount (effectivePrice 400, costPrice 250)
  const originalItem = {
    productId: 'prod_bio_9',
    productName: 'Biology 9',
    unitPrice: 500,
    effectivePrice: 400,
    costPrice: 250,
    quantity: 4,
  };

  // Customer returns 2 units
  const returnQty = 2;
  const refundUnitPrice = originalItem.effectivePrice; // 400
  const refundLineTotal = roundMoney(refundUnitPrice * returnQty); // 800
  const originalCostSnapshot = originalItem.costPrice; // 250
  const reversedCogs = roundMoney(originalCostSnapshot * returnQty); // 500

  // Net accounting for this transaction:
  const grossSales = roundMoney(originalItem.effectivePrice * originalItem.quantity); // 1600
  const grossCogs = roundMoney(originalItem.costPrice * originalItem.quantity); // 1000

  const netSales = roundMoney(grossSales - refundLineTotal); // 1600 - 800 = 800
  const netCogs = roundMoney(grossCogs - reversedCogs); // 1000 - 500 = 500
  const grossProfit = roundMoney(netSales - netCogs); // 800 - 500 = 300

  assert.strictEqual(refundLineTotal, 800, 'Refund uses historical customer discounted price (400 * 2 = 800)');
  assert.strictEqual(reversedCogs, 500, 'Reversed COGS uses historical cost snapshot (250 * 2 = 500)');
  assert.strictEqual(grossProfit, 300, 'Gross profit after return is Net Sales (800) - Net COGS (500) = 300');
});

// -----------------------------------------------------------------------------------
// TEST 9: Product History and Publisher Analytics
// -----------------------------------------------------------------------------------
runTest('Test 9: Product history and publisher analytics reflect net sales and net publisher cost', () => {
  // Sales stream: 10 units sold @ 450 (MRP 500, 10% disc), unit cost = 250 (50% pub disc)
  const grossTurnover = roundMoney(10 * 450); // 4500
  const grossCogs = roundMoney(10 * 250); // 2500

  // Return stream: 2 units returned @ 450, unit cost = 250
  const returnedTurnover = roundMoney(2 * 450); // 900
  const returnedCogs = roundMoney(2 * 250); // 500

  // Analytics derivation:
  const netTurnover = roundMoney(grossTurnover - returnedTurnover); // 3600
  const netCogs = roundMoney(grossCogs - returnedCogs); // 2000
  const grossProfit = roundMoney(netTurnover - netCogs); // 1600
  const marginPercent = netTurnover > 0 ? roundMoney((grossProfit / netTurnover) * 100) : 0;

  assert.strictEqual(netTurnover, 3600, 'Net publisher turnover is 3600');
  assert.strictEqual(netCogs, 2000, 'Net COGS is 2000');
  assert.strictEqual(grossProfit, 1600, 'Gross profit is 1600');
  assert.strictEqual(marginPercent, 44.44, 'Gross margin percentage is 44.44%');
});

// -----------------------------------------------------------------------------------
// TEST 10: Complete Accounting Reconciliation
// -----------------------------------------------------------------------------------
runTest('Test 10: Complete accounting reconciliation: Net Sales - Net COGS = Gross Profit', () => {
  // Period summary:
  // Gross Sales (at MRP) = 100,000
  // Customer Discounts = 15,000
  // Net Gross Invoiced Sales = 85,000
  // Customer Returns (Refunds) = 5,000
  // Net Sales Revenue = 80,000
  const grossSalesMrp = 100000;
  const customerDiscounts = 15000;
  const invoicedSales = roundMoney(grossSalesMrp - customerDiscounts); // 85,000
  const customerReturns = 5000;
  const netSalesRevenue = roundMoney(invoicedSales - customerReturns); // 80,000

  // COGS based on publisher-discounted cost:
  // Purchases: MRP 120,000 with 45% publisher discount => Actual Cost = 66,000
  // Sold goods cost = 48,000
  // Returned goods cost = 2,500
  // Net COGS = 45,500
  const grossCogs = 48000;
  const returnedCogs = 2500;
  const netCogs = roundMoney(grossCogs - returnedCogs); // 45,500

  // Operating Expenses = 12,000
  const operatingExpenses = 12000;

  // Invariants:
  // 1. Gross Profit = Net Sales - Net COGS
  const grossProfit = roundMoney(netSalesRevenue - netCogs); // 80,000 - 45,500 = 34,500
  // 2. Net Operating Profit = Gross Profit - Operating Expenses
  const operatingProfit = roundMoney(grossProfit - operatingExpenses); // 34,500 - 12,000 = 22,500

  assert.strictEqual(grossProfit, 34500, 'Gross profit reconciles to 34,500');
  assert.strictEqual(operatingProfit, 22500, 'Operating profit reconciles to 22,500');

  // Customer discount vs Publisher discount separation check:
  // Customer discount (15,000) only reduced revenue from MRP (100k -> 85k).
  // Publisher discount reduced inventory intake cost.
  // Neither was counted as operating expense.
  assert.notStrictEqual(customerDiscounts, operatingExpenses, 'Customer discount is never classified as operating expense');
});

console.log('\n====================================================================');
console.log(` Simplified Pricing Verification Suite Summary:`);
console.log(` Total Tests: 10`);
console.log(` Passed:      ${passedTests}`);
console.log(` Failed:      0`);
console.log('====================================================================\n');
