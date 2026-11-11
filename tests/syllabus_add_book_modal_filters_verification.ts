import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// ====================================================================
// SADIQ BOOK AGENCY — SYLLABUS ADD BOOK MODAL FILTERS & CLASS DISPLAY
// ====================================================================

console.log('\n====================================================================');
console.log(' SADIQ BOOK AGENCY — SYLLABUS ADD BOOK MODAL IMPROVEMENTS');
console.log('====================================================================\n');

let passedTests = 0;
let failedTests = 0;

function runTest(testNumber: number, name: string, fn: () => void) {
  try {
    fn();
    console.log(`  [PASS] Test ${testNumber}: ${name}`);
    passedTests++;
  } catch (err: any) {
    console.error(`  [FAIL] Test ${testNumber}: ${name}`);
    console.error(`         Error: ${err.message}`);
    failedTests++;
  }
}

const modalPath = path.resolve('src/components/syllabus/AddBookToSetModal.tsx');
assert.ok(fs.existsSync(modalPath), 'AddBookToSetModal.tsx must exist');
const modalContent = fs.readFileSync(modalPath, 'utf8');

// -----------------------------------------------------------------------------
// Test 1: Verify Subject dropdown is removed from AddBookToSetModal.tsx
// -----------------------------------------------------------------------------
runTest(1, 'Subject dropdown is removed from AddBookToSetModal.tsx', () => {
  assert.ok(
    !modalContent.includes('Subject <span className="text-rose-500">*</span>'),
    'Subject dropdown must be removed from the modal UI'
  );
  assert.ok(
    !modalContent.includes('COMMON_SUBJECTS.map'),
    'COMMON_SUBJECTS select must be removed'
  );
});

// -----------------------------------------------------------------------------
// Test 2: Verify Publisher > Series > Class cascading filters exist
// -----------------------------------------------------------------------------
runTest(2, 'Publisher > Series > Class cascading filters are present', () => {
  assert.ok(
    modalContent.includes('Publisher &gt; Series &gt; Class') ||
      modalContent.includes('Publisher > Series > Class'),
    'Must display Publisher > Series > Class filter section'
  );
  assert.ok(
    modalContent.includes('handlePublisherChange'),
    'Must have publisher change handler'
  );
  assert.ok(
    modalContent.includes('handleSeriesChange'),
    'Must have series change handler'
  );
  assert.ok(
    modalContent.includes('handleClassChange'),
    'Must have class change handler'
  );
  assert.ok(
    modalContent.includes('getActivePublishers'),
    'Must load active publishers'
  );
  assert.ok(
    modalContent.includes('getActiveSeriesByPublisher'),
    'Must load active series by publisher'
  );
  assert.ok(
    modalContent.includes('STANDARD_CLASSES'),
    'Must include standard classes options'
  );
});

// -----------------------------------------------------------------------------
// Test 3: Verify Class is displayed in the book detail line
// -----------------------------------------------------------------------------
runTest(3, 'Class is prominently displayed in the matched books list', () => {
  assert.ok(
    modalContent.includes('Class:'),
    'Book list must explicitly label and display the Class'
  );
  assert.ok(
    modalContent.includes('itemClass') ||
      modalContent.includes('p.targetClass') ||
      modalContent.includes('p.className'),
    'Must extract book class from targetClass or className'
  );
});

// -----------------------------------------------------------------------------
// Test 4: Verify Class is displayed in the selected book highlight card
// -----------------------------------------------------------------------------
runTest(4, 'Class is displayed in the selected book summary card', () => {
  assert.ok(
    modalContent.includes('selectedProduct.targetClass') ||
      modalContent.includes('selectedProduct.className'),
    'Selected book summary must include targetClass or className'
  );
});

// -----------------------------------------------------------------------------
// Test 5: Verify SyllabusBookItem includes targetClass
// -----------------------------------------------------------------------------
runTest(5, 'SyllabusBookItem type and submit payload include targetClass', () => {
  const dbTypesPath = path.resolve('src/types/database.ts');
  const dbTypesContent = fs.readFileSync(dbTypesPath, 'utf8');

  assert.ok(
    dbTypesContent.includes('targetClass?: string;'),
    'SyllabusBookItem in database.ts must support targetClass'
  );
  assert.ok(
    modalContent.includes('targetClass: bookClass'),
    'AddBookToSetModal handleSubmit must pass targetClass to SyllabusBookItem'
  );
});

console.log('\n====================================================================');
console.log(` VERIFICATION SUMMARY: ${passedTests}/${passedTests + failedTests} PASSED (${failedTests} FAILED)`);
console.log('====================================================================\n');

if (failedTests > 0) {
  process.exit(1);
}

