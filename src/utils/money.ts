/**
 * MONETARY & ARITHMETIC UTILITIES
 * Sadiq Book Agency — High-Precision Financial Accounting
 */

import { formatCurrency, formatNumber } from './formatters';

export { formatCurrency, formatNumber };

/**
 * Rounds monetary amounts to 2 decimal places to prevent floating-point anomalies.
 * E.g., 0.1 + 0.2 = 0.30000000000000004 -> 0.3
 */
export const roundMoney = (val: number | string | null | undefined): number => {
  const num = typeof val === 'string' ? parseFloat(val) : Number(val);
  if (isNaN(num) || !isFinite(num)) return 0;
  const res = Math.round(num * 100) / 100;
  return res === 0 ? 0 : res;
};

/**
 * Performs safe division to eliminate NaN and Infinity errors.
 */
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

/**
 * Calculates percentage with bounded precision (defaults to 1 decimal place).
 * E.g., (25 / 100) * 100 = 25.0%
 */
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
