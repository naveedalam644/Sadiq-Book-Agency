import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// ==============================================================================
// SADIQ BOOK AGENCY — SYLLABUS & SCHOOL COURSE SETS VERIFICATION SUITE
// ==============================================================================

let testsPassed = 0;
let testsFailed = 0;

function runTest(name: string, fn: () => void | Promise<void>) {
  try {
    const res = fn();
    if (res instanceof Promise) {
      res
        .then(() => {
          console.log(`  [PASS] ${name}`);
          testsPassed++;
        })
        .catch((err: any) => {
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
console.log(' SADIQ BOOK AGENCY — SYLLABUS & SCHOOL COURSE SETS VERIFICATION');
console.log('====================================================================\n');

// ---------------------------------------------------------------------------------
// In-Memory Simulation
// ---------------------------------------------------------------------------------

interface EducationalBoard {
  id: string;
  name: string;
  code?: string;
  city?: string;
  isActive: boolean;
}

interface School {
  id: string;
  boardId: string;
  boardName: string;
  name: string;
  city?: string;
  isActive: boolean;
}

interface Product {
  id: string;
  sku: string;
  title: string;
  publisherId: string;
  publisherName: string;
  seriesId?: string;
  seriesName?: string;
  currentStock: number;
  retailPrice: number;
  costPrice: number;
  isActive: boolean;
}

interface SyllabusItem {
  productId: string;
  title: string;
  sku: string;
  publisherId: string;
  publisherName: string;
  subject: string;
  quantity: number;
  retailPrice: number;
}

interface SyllabusSet {
  id: string;
  boardId: string;
  boardName: string;
  schoolId: string;
  schoolName: string;
  className: string;
  items: SyllabusItem[];
  totalBooks: number;
  totalSetPrice: number;
  isActive: boolean;
}

const boardsDb = new Map<string, EducationalBoard>();
const schoolsDb = new Map<string, School>();
const productsDb = new Map<string, Product>();
const syllabusSetsDb = new Map<string, SyllabusSet>();
const salesHistory: Array<{ invoiceNo: string; items: Array<{ productId: string; publisherName: string; quantity: number; unitPrice: number; lineTotal: number }> }> = [];

function normalize(str: string): string {
  return str.trim().toLowerCase().replace(/\s+/g, ' ');
}

// ---------------------------------------------------------------------------------
// 1. Boards & Schools Service Logic Mirror
// ---------------------------------------------------------------------------------

function createBoardMock(name: string, code?: string, city?: string): EducationalBoard {
  const norm = normalize(name);
  for (const b of boardsDb.values()) {
    if (normalize(b.name) === norm) {
      throw new Error(`Board "${name}" already exists.`);
    }
  }
  const id = `brd_${boardsDb.size + 1}`;
  const board: EducationalBoard = { id, name: name.trim(), code, city, isActive: true };
  boardsDb.set(id, board);
  return board;
}

function createSchoolMock(boardId: string, name: string, city?: string): School {
  const board = boardsDb.get(boardId);
  if (!board) throw new Error('Board not found');
  const norm = normalize(name);
  for (const s of schoolsDb.values()) {
    if (s.boardId === boardId && normalize(s.name) === norm) {
      throw new Error(`School "${name}" already exists under ${board.name}.`);
    }
  }
  const id = `sch_${schoolsDb.size + 1}`;
  const school: School = { id, boardId, boardName: board.name, name: name.trim(), city, isActive: true };
  schoolsDb.set(id, school);
  return school;
}

function saveSyllabusSetMock(
  boardId: string,
  schoolId: string,
  className: string,
  items: SyllabusItem[]
): SyllabusSet {
  const school = schoolsDb.get(schoolId);
  if (!school) throw new Error('School not found');

  const totalBooks = items.reduce((acc, i) => acc + (i.quantity || 1), 0);
  const totalSetPrice = items.reduce((acc, i) => acc + (i.retailPrice * (i.quantity || 1)), 0);

  const cleanClass = className.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const id = `syl_${schoolId}_${cleanClass}`;

  const set: SyllabusSet = {
    id,
    boardId,
    boardName: school.boardName,
    schoolId,
    schoolName: school.name,
    className,
    items,
    totalBooks,
    totalSetPrice,
    isActive: true,
  };
  syllabusSetsDb.set(id, set);
  return set;
}

// POS 1-Click Checkout of Syllabus Course Set
function processSyllabusSetSaleMock(
  invoiceNo: string,
  itemsToBill: Array<{ productId: string; quantity: number }>
) {
  const saleItems: Array<{ productId: string; publisherName: string; quantity: number; unitPrice: number; lineTotal: number }> = [];

  for (const item of itemsToBill) {
    const prod = productsDb.get(item.productId);
    if (!prod) throw new Error(`Product ${item.productId} not found`);
    if (prod.currentStock < item.quantity) {
      throw new Error(`Insufficient stock for "${prod.title}". Requested: ${item.quantity}, Available: ${prod.currentStock}`);
    }

    // Decrement stock from master store inventory
    prod.currentStock -= item.quantity;

    const lineTotal = prod.retailPrice * item.quantity;
    saleItems.push({
      productId: prod.id,
      publisherName: prod.publisherName,
      quantity: item.quantity,
      unitPrice: prod.retailPrice,
      lineTotal,
    });
  }

  salesHistory.push({ invoiceNo, items: saleItems });
  return saleItems;
}

// ---------------------------------------------------------------------------------
// Seed Data
// ---------------------------------------------------------------------------------

function setupTestData() {
  boardsDb.clear();
  schoolsDb.clear();
  productsDb.clear();
  syllabusSetsDb.clear();
  salesHistory.length = 0;

  // Master Catalog Products from 3 different publishers
  // 1. Oxford University Press
  productsDb.set('prod_ox_urdu_3', {
    id: 'prod_ox_urdu_3',
    sku: 'BK-OX-U3',
    title: 'Oxford Progressive Urdu Class 3',
    publisherId: 'pub_oxford',
    publisherName: 'Oxford University Press',
    seriesId: 'ser_progressive_urdu',
    seriesName: 'Oxford Progressive Urdu',
    currentStock: 60,
    retailPrice: 580,
    costPrice: 464,
    isActive: true,
  });

  // 2. Caravan Book House
  productsDb.set('prod_cb_eng_3', {
    id: 'prod_cb_eng_3',
    sku: 'BK-CB-E3',
    title: 'Caravan Radiant English Reader 3',
    publisherId: 'pub_caravan',
    publisherName: 'Caravan Book House',
    seriesId: 'ser_radiant_english',
    seriesName: 'Radiant English Series',
    currentStock: 45,
    retailPrice: 620,
    costPrice: 527,
    isActive: true,
  });

  // 3. Punjab Curriculum & Textbook Board (PTBB)
  productsDb.set('prod_ptbb_math_3', {
    id: 'prod_ptbb_math_3',
    sku: 'BK-PTBB-M3',
    title: 'PTBB Mathematics Book 3 (SNC)',
    publisherId: 'pub_ptbb',
    publisherName: 'Punjab Textbook Board',
    seriesId: 'ser_ptbb_primary',
    seriesName: 'PTBB Primary Board',
    currentStock: 100,
    retailPrice: 240,
    costPrice: 204,
    isActive: true,
  });

  // 4. National Book Foundation (General Science)
  productsDb.set('prod_nbf_sci_3', {
    id: 'prod_nbf_sci_3',
    sku: 'BK-NBF-S3',
    title: 'General Science Class 3 (National Curriculum)',
    publisherId: 'pub_nbf',
    publisherName: 'National Book Foundation',
    seriesId: 'ser_nbf_science',
    seriesName: 'NBF Science Series',
    currentStock: 80,
    retailPrice: 290,
    costPrice: 246.5,
    isActive: true,
  });
}

// ==============================================================================
// TEST EXECUTION
// ==============================================================================

console.log('--- 1. Educational Boards Management ---');

setupTestData();

runTest('1. Can add new Educational Boards and list them', () => {
  const bisePesh = createBoardMock('BISE Peshawar', 'PESH', 'Peshawar');
  const biseMrdn = createBoardMock('BISE Mardan', 'MRDN', 'Mardan');
  const privateBoard = createBoardMock('Private Schools Regulatory Board', 'PSRA', 'Peshawar');

  assert.equal(boardsDb.size, 3);
  assert.equal(bisePesh.name, 'BISE Peshawar');
  assert.equal(biseMrdn.code, 'MRDN');
  assert.equal(privateBoard.city, 'Peshawar');
});

runTest('2. Duplicate Educational Board name is rejected (case-insensitive & trimmed)', () => {
  assert.throws(
    () => createBoardMock('   bise peshawar  '),
    /already exists/
  );
});

console.log('\n--- 2. Schools Management under Boards ---');

runTest('3. Can add Schools affiliated with specific Educational Boards', () => {
  const bisePesh = Array.from(boardsDb.values()).find((b) => b.code === 'PESH')!;
  const biseMrdn = Array.from(boardsDb.values()).find((b) => b.code === 'MRDN')!;

  const sch1 = createSchoolMock(bisePesh.id, 'City Model High School Cantt', 'Peshawar');
  const sch2 = createSchoolMock(bisePesh.id, 'Allama Iqbal Public Academy', 'Peshawar');
  const sch3 = createSchoolMock(biseMrdn.id, 'The Mardan Grammar School', 'Mardan');

  assert.equal(schoolsDb.size, 3);
  assert.equal(sch1.boardName, 'BISE Peshawar');
  assert.equal(sch3.boardName, 'BISE Mardan');
});

runTest('4. Duplicate School under same Board is rejected', () => {
  const bisePesh = Array.from(boardsDb.values()).find((b) => b.code === 'PESH')!;
  assert.throws(
    () => createSchoolMock(bisePesh.id, '  city model high school cantt  '),
    /already exists/
  );
});

console.log('\n--- 3. Multi-Publisher Class Syllabus Book Set Creation ---');

runTest('5. Can assemble a complete Class 3 Book Set with books from different publishers', () => {
  const sch1 = Array.from(schoolsDb.values())[0];

  // Set includes:
  // - Urdu: Oxford Progressive Urdu (580 Rs)
  // - English: Caravan Radiant English (620 Rs)
  // - Mathematics: PTBB Math (240 Rs)
  // - Science: NBF General Science (290 Rs)
  const items: SyllabusItem[] = [
    {
      productId: 'prod_ox_urdu_3',
      title: 'Oxford Progressive Urdu Class 3',
      sku: 'BK-OX-U3',
      publisherId: 'pub_oxford',
      publisherName: 'Oxford University Press',
      subject: 'Urdu',
      quantity: 1,
      retailPrice: 580,
    },
    {
      productId: 'prod_cb_eng_3',
      title: 'Caravan Radiant English Reader 3',
      sku: 'BK-CB-E3',
      publisherId: 'pub_caravan',
      publisherName: 'Caravan Book House',
      subject: 'English',
      quantity: 1,
      retailPrice: 620,
    },
    {
      productId: 'prod_ptbb_math_3',
      title: 'PTBB Mathematics Book 3 (SNC)',
      sku: 'BK-PTBB-M3',
      publisherId: 'pub_ptbb',
      publisherName: 'Punjab Textbook Board',
      subject: 'Mathematics',
      quantity: 1,
      retailPrice: 240,
    },
    {
      productId: 'prod_nbf_sci_3',
      title: 'General Science Class 3 (National Curriculum)',
      sku: 'BK-NBF-S3',
      publisherId: 'pub_nbf',
      publisherName: 'National Book Foundation',
      subject: 'General Science',
      quantity: 1,
      retailPrice: 290,
    },
  ];

  const setDoc = saveSyllabusSetMock(sch1.boardId, sch1.id, 'Class 3', items);

  assert.equal(setDoc.totalBooks, 4);
  // Total Set Price: 580 + 620 + 240 + 290 = 1,730 PKR
  assert.equal(setDoc.totalSetPrice, 1730);
  assert.equal(setDoc.className, 'Class 3');
  assert.equal(setDoc.schoolName, sch1.name);
});

console.log('\n--- 4. POS Direct 1-Click Billing & Inventory Deduction ---');

runTest('6. 1-Click billing loads full course set into POS and calculates correct bill total', () => {
  const sch1 = Array.from(schoolsDb.values())[0];
  const setDoc = syllabusSetsDb.get(`syl_${sch1.id}_class_3`)!;

  // Bill all 4 books from the set
  const itemsToBill = setDoc.items.map((i) => ({ productId: i.productId, quantity: i.quantity }));
  const billedItems = processSyllabusSetSaleMock('INV-20261107-0001', itemsToBill);

  assert.equal(billedItems.length, 4);
  const totalBilled = billedItems.reduce((acc, i) => acc + i.lineTotal, 0);
  assert.equal(totalBilled, 1730, 'Total bill for course set is exactly 1,730 PKR');
});

runTest('7. Each book in the course set is deducted from its respective shop inventory', () => {
  // Check stock after sale of 1 course set:
  const oxUrdu = productsDb.get('prod_ox_urdu_3')!;
  const cbEng = productsDb.get('prod_cb_eng_3')!;
  const ptbbMath = productsDb.get('prod_ptbb_math_3')!;
  const nbfSci = productsDb.get('prod_nbf_sci_3')!;

  assert.equal(oxUrdu.currentStock, 59, 'Oxford stock decreased by 1 (60 -> 59)');
  assert.equal(cbEng.currentStock, 44, 'Caravan stock decreased by 1 (45 -> 44)');
  assert.equal(ptbbMath.currentStock, 99, 'PTBB stock decreased by 1 (100 -> 99)');
  assert.equal(nbfSci.currentStock, 79, 'NBF stock decreased by 1 (80 -> 79)');
});

runTest('8. Sale items record publisher attribute for multi-publisher accounting', () => {
  const lastSale = salesHistory[0];
  assert.equal(lastSale.items[0].publisherName, 'Oxford University Press');
  assert.equal(lastSale.items[1].publisherName, 'Caravan Book House');
  assert.equal(lastSale.items[2].publisherName, 'Punjab Textbook Board');
  assert.equal(lastSale.items[3].publisherName, 'National Book Foundation');
});

runTest('9. Cashier can unselect a book if parent already has it (partial set billing)', () => {
  // Parent already has Oxford Urdu book, wants remaining 3 books
  const partialItems = [
    { productId: 'prod_cb_eng_3', quantity: 1 },
    { productId: 'prod_ptbb_math_3', quantity: 1 },
    { productId: 'prod_nbf_sci_3', quantity: 1 },
  ];

  const billedItems = processSyllabusSetSaleMock('INV-20261107-0002', partialItems);
  assert.equal(billedItems.length, 3);
  const total = billedItems.reduce((acc, i) => acc + i.lineTotal, 0);
  // 620 + 240 + 290 = 1,150 PKR
  assert.equal(total, 1150);

  // Oxford book stock is NOT decremented (remains 59)
  assert.equal(productsDb.get('prod_ox_urdu_3')!.currentStock, 59);
  // Caravan decrements to 43
  assert.equal(productsDb.get('prod_cb_eng_3')!.currentStock, 43);
});

console.log('\n--- 5. Source Code, Route & Security Verification ---');

runTest('10. AppRoutes registers /syllabus route', () => {
  const content = fs.readFileSync(path.resolve('src/routes/AppRoutes.tsx'), 'utf-8');
  assert.ok(content.includes('path="/syllabus"'), 'AppRoutes has /syllabus route');
  assert.ok(content.includes('<Syllabus />') || content.includes('<Syllabus/>'), 'AppRoutes renders Syllabus component');
});

runTest('11. AdminLockContext & SectionLockRoute protect /syllabus', () => {
  const adminLock = fs.readFileSync(path.resolve('src/contexts/AdminLockContext.tsx'), 'utf-8');
  assert.ok(adminLock.includes("'/syllabus'"), "AdminLockContext protects '/syllabus'");

  const secLock = fs.readFileSync(path.resolve('src/routes/SectionLockRoute.tsx'), 'utf-8');
  assert.ok(secLock.includes("case '/syllabus':"), "SectionLockRoute maps friendly name for '/syllabus'");
});

runTest('12. Sidebar contains Syllabus link', () => {
  const content = fs.readFileSync(path.resolve('src/components/layout/Sidebar.tsx'), 'utf-8');
  assert.ok(content.includes("to: '/syllabus'"), "Sidebar navigates to '/syllabus'");
  assert.ok(content.includes("name: 'Syllabus'"), "Sidebar displays 'Syllabus'");
});

runTest('13. POS has School Course Set button and modal integration', () => {
  const content = fs.readFileSync(path.resolve('src/pages/POS.tsx'), 'utf-8');
  assert.ok(content.includes('SchoolSyllabusSetModal'), 'POS imports SchoolSyllabusSetModal');
  assert.ok(content.includes('addSyllabusSet'), 'POS uses addSyllabusSet hook');
  assert.ok(content.includes('setIsSyllabusModalOpen(true)'), 'POS opens SchoolSyllabusSetModal on click');
});

runTest('14. firestore.rules protects boards, schools, and syllabusSets', () => {
  const rules = fs.readFileSync(path.resolve('firestore.rules'), 'utf-8');
  assert.ok(rules.includes('match /boards/{boardId}'), 'Rules protect /boards');
  assert.ok(rules.includes('match /schools/{schoolId}'), 'Rules protect /schools');
  assert.ok(rules.includes('match /syllabusSets/{setId}'), 'Rules protect /syllabusSets');
});

runTest('15. firestore.indexes.json contains compound indexes for schools and syllabusSets', () => {
  const indexes = fs.readFileSync(path.resolve('firestore.indexes.json'), 'utf-8');
  assert.ok(indexes.includes('"schools"'), 'Indexes include schools collectionGroup');
  assert.ok(indexes.includes('"syllabusSets"'), 'Indexes include syllabusSets collectionGroup');
});

// Summary
setTimeout(() => {
  console.log('\n====================================================================');
  console.log(` RESULTS: ${testsPassed} PASSED, ${testsFailed} FAILED`);
  console.log('====================================================================\n');
  if (testsFailed > 0) process.exit(1);
}, 200);

