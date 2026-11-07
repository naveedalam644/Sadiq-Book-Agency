import assert from 'node:assert/strict';

// ==============================================================================
// SADIQ BOOK AGENCY — PHASE 6 STEP 2 FOUNDATION TEST SUITE
// Tests for:
// 1. Standardized Date Presets & Boundary Utilities
// 2. Monetary Precision & Arithmetic Utilities
// 3. RFC 4180 CSV Escaping, Sanitization & Structured Export
// ==============================================================================

export type DateRangePreset =
  | 'today'
  | 'yesterday'
  | 'this_week'
  | 'this_month'
  | 'last_month'
  | 'custom';

export interface DateRange {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  preset: DateRangePreset;
  label: string;
}

export interface CsvColumn<T = any> {
  key: string;
  label: string;
  formatter?: (val: any, row: T) => string;
}

export interface CsvExportOptions<T = any> {
  filename: string;
  title: string;
  dateRange?: string;
  columns: CsvColumn<T>[];
  data: T[];
  summaryRows?: Array<Record<string, string | number>>;
}

// -----------------------------------------------------------------------------
// PURE FOUNDATION IMPLEMENTATIONS (Mirroring src/utils/)
// -----------------------------------------------------------------------------

export const formatCurrency = (amount: number): string => {
  return `PKR ${new Intl.NumberFormat('en-PK', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount)}`;
};

export const formatNumber = (num: number): string => {
  return new Intl.NumberFormat('en-PK').format(num);
};

export const formatDate = (date: string | Date | undefined | null): string => {
  if (!date) return '-';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '-';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(d);
};

export const roundMoney = (val: number | string | null | undefined): number => {
  const num = typeof val === 'string' ? parseFloat(val) : Number(val);
  if (isNaN(num) || !isFinite(num)) return 0;
  const res = Math.round(num * 100) / 100;
  return res === 0 ? 0 : res;
};

export const safeDivide = (
  numerator: number | null | undefined,
  denominator: number | null | undefined,
  fallback = 0
): number => {
  const num = Number(numerator) || 0;
  const den = Number(denominator) || 0;
  if (den === 0 || isNaN(den) || !isFinite(den)) return fallback;
  const res = num / den;
  return isNaN(res) || !isFinite(res) ? fallback : roundMoney(res);
};

export const calculatePercentage = (
  part: number | null | undefined,
  total: number | null | undefined,
  decimals = 1
): number => {
  const p = Number(part) || 0;
  const t = Number(total) || 0;
  if (t === 0) return 0;
  const multiplier = Math.pow(10, decimals);
  return Math.round(((p / t) * 100) * multiplier) / multiplier;
};

export const formatYMD = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export const isValidYMD = (str?: string | null): boolean => {
  if (!str || typeof str !== 'string') return false;
  const match = str.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const y = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const d = parseInt(match[3], 10);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const testDate = new Date(y, m - 1, d);
  return (
    testDate.getFullYear() === y &&
    testDate.getMonth() === m - 1 &&
    testDate.getDate() === d
  );
};

export const validateDateRange = (
  startDate?: string | null,
  endDate?: string | null
): { isValid: boolean; error?: string } => {
  if (!startDate || !isValidYMD(startDate)) {
    return { isValid: false, error: 'Start date is required and must be in YYYY-MM-DD format.' };
  }
  if (!endDate || !isValidYMD(endDate)) {
    return { isValid: false, error: 'End date is required and must be in YYYY-MM-DD format.' };
  }
  if (startDate > endDate) {
    return { isValid: false, error: 'Start date cannot be after end date.' };
  }
  return { isValid: true };
};

export const computeDateRange = (
  preset: DateRangePreset,
  customStart?: string,
  customEnd?: string,
  referenceDate = new Date()
): DateRange => {
  const now = new Date(referenceDate.getTime());
  const y = now.getFullYear();
  const m = now.getMonth();

  let startStr: string;
  let endStr: string;
  let labelStr: string;

  switch (preset) {
    case 'today': {
      startStr = formatYMD(now);
      endStr = startStr;
      labelStr = `Today (${formatDate(startStr)})`;
      break;
    }

    case 'yesterday': {
      const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      startStr = formatYMD(yesterday);
      endStr = startStr;
      labelStr = `Yesterday (${formatDate(startStr)})`;
      break;
    }

    case 'this_week': {
      const currentDay = now.getDay();
      const distanceToMonday = currentDay === 0 ? 6 : currentDay - 1;
      const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - distanceToMonday);
      startStr = formatYMD(monday);
      endStr = formatYMD(now);
      labelStr = `This Week (${formatDate(startStr)} – ${formatDate(endStr)})`;
      break;
    }

    case 'this_month': {
      const firstDay = new Date(y, m, 1);
      const lastDay = new Date(y, m + 1, 0);
      startStr = formatYMD(firstDay);
      endStr = formatYMD(lastDay);
      labelStr = `This Month (${formatDate(startStr)} – ${formatDate(endStr)})`;
      break;
    }

    case 'last_month': {
      const firstDayLastMonth = new Date(y, m - 1, 1);
      const lastDayLastMonth = new Date(y, m, 0);
      startStr = formatYMD(firstDayLastMonth);
      endStr = formatYMD(lastDayLastMonth);
      labelStr = `Previous Month (${formatDate(startStr)} – ${formatDate(endStr)})`;
      break;
    }

    case 'custom':
    default: {
      const valid = validateDateRange(customStart, customEnd);
      if (valid.isValid && customStart && customEnd) {
        startStr = customStart;
        endStr = customEnd;
      } else {
        startStr = formatYMD(new Date(y, m, 1));
        endStr = formatYMD(new Date(y, m + 1, 0));
      }
      labelStr = `Custom (${formatDate(startStr)} – ${formatDate(endStr)})`;
      break;
    }
  }

  return {
    startDate: startStr,
    endDate: endStr,
    preset,
    label: labelStr,
  };
};

export const getInclusiveQueryBounds = (
  startDate: string,
  endDate: string
): {
  cleanStart: string;
  cleanEnd: string;
  endStringBound: string;
  startIso: string;
  endIso: string;
} => {
  const cleanStart = startDate.split('T')[0].trim();
  const cleanEnd = endDate.split('T')[0].trim();

  return {
    cleanStart,
    cleanEnd,
    endStringBound: cleanEnd + '\uf8ff',
    startIso: `${cleanStart}T00:00:00.000Z`,
    endIso: `${cleanEnd}T23:59:59.999Z`,
  };
};

export const escapeCsvValue = (val: any): string => {
  if (val === null || val === undefined) return '';

  let str = String(val);

  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }

  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
};

export const generateCsvContent = <T>(options: CsvExportOptions<T>): string => {
  const { title, dateRange, columns, data, summaryRows } = options;
  const lines: string[] = [];

  lines.push(`"${title.replace(/"/g, '""')}"`);
  lines.push(`"Sadiq Book Agency — Financial Management System"`);
  if (dateRange) {
    lines.push(`"Report Period: ${dateRange.replace(/"/g, '""')}"`);
  }
  lines.push(`"Generated On: ${new Date().toISOString()}"`);
  lines.push('');

  const headerRow = columns.map((col) => escapeCsvValue(col.label)).join(',');
  lines.push(headerRow);

  if (data && data.length > 0) {
    for (const item of data) {
      const row = columns.map((col) => {
        let val: any;
        if (typeof col.formatter === 'function') {
          val = col.formatter((item as any)[col.key], item);
        } else {
          val = (item as any)[col.key];
        }
        return escapeCsvValue(val);
      });
      lines.push(row.join(','));
    }
  } else {
    lines.push(`"No records found for the selected criteria."`);
  }

  if (summaryRows && summaryRows.length > 0) {
    lines.push('');
    lines.push('"--- FINANCIAL TOTALS & RECONCILIATION ---"');
    for (const summary of summaryRows) {
      const summaryLine = Object.entries(summary)
        .map(([k, v]) => `${escapeCsvValue(k)},${escapeCsvValue(v)}`)
        .join(',');
      lines.push(summaryLine);
    }
  }

  return lines.join('\r\n');
};

// ==============================================================================
// TEST EXECUTION ENGINE
// ==============================================================================

let passedTests = 0;

const runTest = (name: string, fn: () => void) => {
  try {
    fn();
    passedTests++;
    console.log(`✅ PASS: ${name}`);
  } catch (err) {
    console.error(`❌ FAIL: ${name}`);
    console.error(err);
    process.exit(1);
  }
};

console.log('\n====================================================');
console.log('📈 SADIQ BOOK AGENCY — PHASE 6 STEP 2 FOUNDATION');
console.log('====================================================\n');

// -----------------------------------------------------------------------------
// 1. DATE PRESET & BOUNDARY TESTS
// -----------------------------------------------------------------------------

// Deterministic reference date: Wednesday, November 4, 2026
const fixedRefDate = new Date(2026, 10, 4); // Month is 0-indexed (10 = November)

runTest('1.1: "today" preset generates exact start and end for current day', () => {
  const range = computeDateRange('today', undefined, undefined, fixedRefDate);
  assert.equal(range.startDate, '2026-11-04');
  assert.equal(range.endDate, '2026-11-04');
  assert.equal(range.preset, 'today');
});

runTest('1.2: "yesterday" preset generates exact previous calendar date', () => {
  const range = computeDateRange('yesterday', undefined, undefined, fixedRefDate);
  assert.equal(range.startDate, '2026-11-03');
  assert.equal(range.endDate, '2026-11-03');
  assert.equal(range.preset, 'yesterday');
});

runTest('1.3: "this_week" preset starts from Monday of current week to current date', () => {
  // Nov 4, 2026 is a Wednesday. Monday was Nov 2, 2026.
  const range = computeDateRange('this_week', undefined, undefined, fixedRefDate);
  assert.equal(range.startDate, '2026-11-02');
  assert.equal(range.endDate, '2026-11-04');
});

runTest('1.4: "this_month" preset spans 1st day to last day of current month', () => {
  const range = computeDateRange('this_month', undefined, undefined, fixedRefDate);
  assert.equal(range.startDate, '2026-11-01');
  assert.equal(range.endDate, '2026-11-30'); // November has 30 days
});

runTest('1.5: "last_month" preset spans 1st to last day of previous month', () => {
  const range = computeDateRange('last_month', undefined, undefined, fixedRefDate);
  assert.equal(range.startDate, '2026-10-01');
  assert.equal(range.endDate, '2026-10-31'); // October has 31 days
});

runTest('1.6: "last_month" across Year Boundary: January 2026 calculates December 2025', () => {
  const janDate = new Date(2026, 0, 15); // Jan 15, 2026
  const range = computeDateRange('last_month', undefined, undefined, janDate);
  assert.equal(range.startDate, '2025-12-01');
  assert.equal(range.endDate, '2025-12-31');
});

runTest('1.7: "last_month" across Leap Year: March 2024 calculates February 29th', () => {
  const marchLeapDate = new Date(2024, 2, 10); // March 10, 2024
  const range = computeDateRange('last_month', undefined, undefined, marchLeapDate);
  assert.equal(range.startDate, '2024-02-01');
  assert.equal(range.endDate, '2024-02-29'); // 2024 is leap year
});

runTest('1.8: Custom date range validation accepts valid dates in correct order', () => {
  const val = validateDateRange('2026-10-01', '2026-10-31');
  assert.equal(val.isValid, true);
});

runTest('1.9: Custom date range validation rejects inverted dates (start > end)', () => {
  const val = validateDateRange('2026-11-10', '2026-11-01');
  assert.equal(val.isValid, false);
  assert.match(val.error || '', /start date cannot be after end date/i);
});

runTest('1.10: Custom date range validation rejects malformed dates', () => {
  assert.equal(validateDateRange('invalid-date', '2026-11-01').isValid, false);
  assert.equal(validateDateRange('2026-02-30', '2026-03-01').isValid, false); // Feb 30 does not exist
});

runTest('1.11: Inclusive query bounds provide exact string prefix bound and 23:59:59 ISO bound', () => {
  const bounds = getInclusiveQueryBounds('2026-11-01', '2026-11-30');
  assert.equal(bounds.cleanStart, '2026-11-01');
  assert.equal(bounds.cleanEnd, '2026-11-30');
  assert.equal(bounds.endStringBound, '2026-11-30\uf8ff');
  assert.equal(bounds.startIso, '2026-11-01T00:00:00.000Z');
  assert.equal(bounds.endIso, '2026-11-30T23:59:59.999Z');
});

// -----------------------------------------------------------------------------
// 2. MONETARY & ARITHMETIC TESTS
// -----------------------------------------------------------------------------

runTest('2.1: roundMoney eliminates floating point inaccuracies', () => {
  const floatSum = 0.1 + 0.2; // 0.30000000000000004
  assert.equal(roundMoney(floatSum), 0.3);

  const discountCalc = 199.99 * 0.15; // 29.9985
  assert.equal(roundMoney(discountCalc), 30.0);
});

runTest('2.2: roundMoney handles null, undefined, NaN, and negative zero safely', () => {
  assert.equal(roundMoney(null), 0);
  assert.equal(roundMoney(undefined), 0);
  assert.equal(roundMoney('invalid'), 0);
  assert.equal(roundMoney(-0), 0);
});

runTest('2.3: safeDivide prevents division by zero without NaN or Infinity crashes', () => {
  assert.equal(safeDivide(500, 0), 0);
  assert.equal(safeDivide(0, 0), 0);
  assert.equal(safeDivide(100, 3), 33.33);
});

runTest('2.4: calculatePercentage calculates accurate ratios with bounded precision', () => {
  assert.equal(calculatePercentage(25, 100), 25);
  assert.equal(calculatePercentage(1, 3, 2), 33.33);
  assert.equal(calculatePercentage(0, 500), 0);
  assert.equal(calculatePercentage(100, 0), 0); // division by zero safe
});

runTest('2.5: formatCurrency outputs clean PKR formatted representation', () => {
  const formatted = formatCurrency(143000);
  assert.match(formatted, /PKR\s+143,000/);
});

// -----------------------------------------------------------------------------
// 3. CSV EXPORT & ESCAPING TESTS
// -----------------------------------------------------------------------------

runTest('3.1: escapeCsvValue escapes commas by enclosing in quotes', () => {
  assert.equal(escapeCsvValue('Oxford University Press, Karachi'), '"Oxford University Press, Karachi"');
});

runTest('3.2: escapeCsvValue escapes double quotes by doubling internal quotes', () => {
  assert.equal(escapeCsvValue('Edition 9" Special'), '"Edition 9"" Special"');
});

runTest('3.3: escapeCsvValue escapes newlines and carriage returns', () => {
  assert.equal(escapeCsvValue('Line 1\nLine 2'), '"Line 1\nLine 2"');
  assert.equal(escapeCsvValue('Line A\r\nLine B'), '"Line A\r\nLine B"');
});

runTest('3.4: escapeCsvValue sanitizes formula injection characters', () => {
  assert.equal(escapeCsvValue('=SUM(A1:A10)'), "'=SUM(A1:A10)");
  assert.equal(escapeCsvValue('+12345'), "'+12345");
  assert.equal(escapeCsvValue('-500'), "'-500");
  assert.equal(escapeCsvValue('@special'), "'@special");
});

runTest('3.5: Empty CSV dataset produces valid headers and metadata without throwing', () => {
  interface SampleRow { id: string; name: string }
  const emptyOptions: CsvExportOptions<SampleRow> = {
    filename: 'sales_empty',
    title: 'Daily Sales Report',
    dateRange: 'Today (04 Nov 2026)',
    columns: [
      { key: 'id', label: 'Invoice No' },
      { key: 'name', label: 'Customer' },
    ],
    data: [],
  };

  const csv = generateCsvContent(emptyOptions);
  assert.ok(csv.includes('"Daily Sales Report"'));
  assert.ok(csv.includes('Invoice No,Customer'));
  assert.ok(csv.includes('"No records found for the selected criteria."'));
});

runTest('3.6: CSV Export respects active filters and generates formatted summary rows', () => {
  interface SaleRow {
    invoiceNo: string;
    customer: string;
    amount: number;
    paymentMethod: string;
  }

  // Filtered dataset: only 'cash' sales
  const allSales: SaleRow[] = [
    { invoiceNo: 'INV-001', customer: 'Counter Walk-in', amount: 800, paymentMethod: 'cash' },
    { invoiceNo: 'INV-002', customer: 'Alpha Wholesalers', amount: 5000, paymentMethod: 'credit' },
    { invoiceNo: 'INV-003', customer: 'Model School', amount: 1100, paymentMethod: 'cash' },
  ];

  const filteredData = allSales.filter((s) => s.paymentMethod === 'cash');

  const options: CsvExportOptions<SaleRow> = {
    filename: 'cash_sales_filtered',
    title: 'Cash Sales Filtered Report',
    dateRange: '01 Nov 2026 – 04 Nov 2026',
    columns: [
      { key: 'invoiceNo', label: 'Invoice Number' },
      { key: 'customer', label: 'Customer Name' },
      { key: 'amount', label: 'Total (PKR)', formatter: (val) => formatCurrency(val) },
      { key: 'paymentMethod', label: 'Payment Mode' },
    ],
    data: filteredData,
    summaryRows: [
      { 'Total Cash Invoices': 2, 'Total Cash Revenue': formatCurrency(1900) },
    ],
  };

  const csv = generateCsvContent(options);

  // Contains both cash invoices
  assert.ok(csv.includes('INV-001'));
  assert.ok(csv.includes('INV-003'));

  // Does NOT contain credit sale INV-002
  assert.equal(csv.includes('INV-002'), false);

  // Contains formatted summary
  assert.ok(csv.includes('Total Cash Revenue'));
  assert.ok(csv.includes('PKR 1,900'));
});

console.log('====================================================');
console.log(`📊 PHASE 6 STEP 2 TESTS: ${passedTests} PASSED, 0 FAILED`);
console.log('====================================================\n');
