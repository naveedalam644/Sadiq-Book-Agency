/**
 * STANDARDIZED FINANCIAL DATE RANGE PRESETS & QUERY BOUND UTILITIES
 * Sadiq Book Agency — Phase 6
 */

import type { DateRangePreset, DateRange } from '../types/reports';
import { formatDate } from './formatters';

/**
 * Formats a Date object to local YYYY-MM-DD string.
 */
export const formatYMD = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

/**
 * Validates whether a string is a valid YYYY-MM-DD calendar date.
 */
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

/**
 * Validates a date range, ensuring valid dates and that startDate <= endDate.
 */
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

/**
 * Computes exact start and end dates (YYYY-MM-DD) for any standardized preset.
 * Allows passing a reference Date (defaults to new Date()) for deterministic unit testing.
 */
export const computeDateRange = (
  preset: DateRangePreset,
  customStart?: string,
  customEnd?: string,
  referenceDate = new Date()
): DateRange => {
  const now = new Date(referenceDate.getTime());
  const y = now.getFullYear();
  const m = now.getMonth(); // 0-indexed

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
      // Monday as the start of the week
      const currentDay = now.getDay(); // 0 is Sunday, 1 is Monday...
      const distanceToMonday = currentDay === 0 ? 6 : currentDay - 1;
      const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - distanceToMonday);
      startStr = formatYMD(monday);
      endStr = formatYMD(now);
      labelStr = `This Week (${formatDate(startStr)} – ${formatDate(endStr)})`;
      break;
    }

    case 'this_month': {
      const firstDay = new Date(y, m, 1);
      const lastDay = new Date(y, m + 1, 0); // Last day of current month
      startStr = formatYMD(firstDay);
      endStr = formatYMD(lastDay);
      labelStr = `This Month (${formatDate(startStr)} – ${formatDate(endStr)})`;
      break;
    }

    case 'last_month': {
      // Handles year boundary: e.g. January (m=0) -> December of (y-1)
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
        // Fallback to this month if custom dates are incomplete or invalid
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

/**
 * Returns inclusive Firestore query bounds:
 * - String boundary for YYYY-MM-DD equality/prefix queries: `<= end + '\uf8ff'`
 * - ISO timestamp boundary for full 23:59:59.999 day inclusion
 */
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

