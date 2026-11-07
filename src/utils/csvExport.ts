/**
 * CLIENT-SIDE CSV EXPORT UTILITY
 * Sadiq Book Agency — High-Reliability Financial Reporting
 */

import type { CsvExportOptions } from '../types/reports';

/**
 * Escapes a single CSV field value according to RFC 4180 standards:
 * - If value contains comma, quotes, newline, or carriage return: wraps in quotes and escapes internal quotes as "".
 * - Sanitizes against spreadsheet formula injection (e.g., =, +, -, @ leading chars).
 */
export const escapeCsvValue = (val: any): string => {
  if (val === null || val === undefined) return '';

  let str = String(val);

  // Formula injection defense: prepend a single quote if string starts with formula characters
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }

  // If contains commas, double quotes, or newlines, quote the field and double internal quotes
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
};

/**
 * Pure function: generates the full CSV string from export options.
 * Highly testable without DOM / browser dependencies.
 */
export const generateCsvContent = <T>(options: CsvExportOptions<T>): string => {
  const { title, dateRange, columns, data, summaryRows } = options;
  const lines: string[] = [];

  // 1. Report Metadata Header
  lines.push(`"${title.replace(/"/g, '""')}"`);
  lines.push(`"Sadiq Book Agency — Financial Management System"`);
  if (dateRange) {
    lines.push(`"Report Period: ${dateRange.replace(/"/g, '""')}"`);
  }
  lines.push(`"Generated On: ${new Date().toISOString()}"`);
  lines.push(''); // Blank separator line

  // 2. Table Column Headers
  const headerRow = columns.map((col) => escapeCsvValue(col.label)).join(',');
  lines.push(headerRow);

  // 3. Data Rows
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
    // Empty data indicator
    lines.push(`"No records found for the selected criteria."`);
  }

  // 4. Summary / Total Rows
  if (summaryRows && summaryRows.length > 0) {
    lines.push(''); // Blank separator line
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

/**
 * Triggers client-side browser download for generated CSV file.
 */
export const downloadCsv = <T>(options: CsvExportOptions<T>): void => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const csvContent = generateCsvContent(options);
  // Prepend UTF-8 BOM so Excel opens Urdu/Arabic/special characters correctly
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const cleanFilename = (options.filename || 'report').replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = cleanFilename.endsWith('.csv') ? cleanFilename : `${cleanFilename}.csv`;

  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
