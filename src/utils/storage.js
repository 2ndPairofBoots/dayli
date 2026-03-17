// ─────────────────────────────────────────────
// src/utils/storage.js
// localStorage helpers for:
//  - Daily spend cap (resets at midnight)
//  - Multi-account management
// ─────────────────────────────────────────────

// ── Keys ─────────────────────────────────────

const DAILY_KEY = 'dayli_daily_spend';
const ACCTS_KEY = 'dayli_accounts';

// ── Date helper ───────────────────────────────

/**
 * Returns today's date as an ISO string (YYYY-MM-DD).
 * Used to key the daily spend record so it auto-invalidates at midnight.
 * @returns {string}
 */
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// ── Daily Spend ───────────────────────────────

/**
 * Reads today's spend total from localStorage.
 * If the stored date doesn't match today, returns a fresh zero record
 * (handles automatic midnight reset without any cron job).
 * @returns {{ date: string, spent: number }}
 */
export function getDailySpend() {
  try {
    const raw = localStorage.getItem(DAILY_KEY);
    if (!raw) return { date: todayStr(), spent: 0 };
    const parsed = JSON.parse(raw);
    if (parsed.date !== todayStr()) return { date: todayStr(), spent: 0 };
    return parsed;
  } catch {
    return { date: todayStr(), spent: 0 };
  }
}

/**
 * Adds `amount` mana to today's spend total and persists it.
 * Safe to call after every successful bet (manual or bot).
 * @param {number} amount - Mana amount to add
 * @returns {number} New cumulative spend for today
 */
export function addDailySpend(amount) {
  try {
    const cur = getDailySpend();
    const next = { date: todayStr(), spent: (cur.spent || 0) + amount };
    localStorage.setItem(DAILY_KEY, JSON.stringify(next));
    return next.spent;
  } catch {
    return 0;
  }
}

// ── Accounts ──────────────────────────────────

/**
 * Loads all saved accounts from localStorage.
 * Each account: { id, key, label, username, balance }
 * @returns {Array<object>}
 */
export function loadAccounts() {
  try {
    const raw = localStorage.getItem(ACCTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Persists the full accounts array to localStorage.
 * Call after any add / remove / balance update.
 * @param {Array<object>} accounts
 */
export function saveAccounts(accounts) {
  try {
    localStorage.setItem(ACCTS_KEY, JSON.stringify(accounts));
  } catch {}
}
