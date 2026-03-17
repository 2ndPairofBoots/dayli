// ─────────────────────────────────────────────
// src/utils/categories.js
// Helpers for categorising markets and
// formatting display values.
// ─────────────────────────────────────────────

import { CATS } from '../constants';

/**
 * Returns the category key for a market question string.
 * Scans each category's keyword list; returns 'other' if no match.
 * @param {string} question - Market question text
 * @returns {string} Category key (e.g. 'ai', 'crypto', 'other')
 */
export function getCategory(question) {
  const s = question.toLowerCase();
  for (const [cat, { k }] of Object.entries(CATS)) {
    if (k.some(w => s.includes(w))) return cat;
  }
  return 'other';
}

/**
 * Returns the display color for a market question's category.
 * Falls back to neutral grey for 'other'.
 * @param {string} question
 * @returns {string} CSS hex color
 */
export function catColor(question) {
  return CATS[getCategory(question)]?.color ?? '#6b7280';
}

/**
 * Returns the Kelly weight multiplier for a market question's category.
 * Falls back to 1.0 for 'other'.
 * @param {string} question
 * @returns {number} Weight multiplier
 */
export function catW(question) {
  return CATS[getCategory(question)]?.w ?? 1.0;
}

/**
 * Formats a mana number for compact display.
 * Values ≥1000 are shown as e.g. "1.2k".
 * Null / NaN returns '0'.
 * @param {number|null} n
 * @returns {string}
 */
export function fmt(n) {
  if (n == null || isNaN(n)) return '0';
  return Math.abs(n) >= 1000
    ? `${(n / 1000).toFixed(1)}k`
    : Number(n).toFixed(0);
}
