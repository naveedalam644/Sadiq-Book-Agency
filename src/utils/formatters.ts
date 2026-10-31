/**
 * Utility functions for date, currency, and role formatting across the bookstore app.
 */

export const formatCurrency = (amount: number, currency = 'PKR'): string => {
  return `${currency} ${amount.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
};

export const formatDate = (isoString?: string): string => {
  if (!isoString) return '—';
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return isoString;
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
};

export const formatDateTime = (isoString?: string): string => {
  if (!isoString) return '—';
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return isoString;
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

export const getGreetingByTime = (): string => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 17) return 'Good Afternoon';
  return 'Good Evening';
};

