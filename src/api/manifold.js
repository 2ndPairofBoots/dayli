// ─────────────────────────────────────────────
// src/api/manifold.js
// All Manifold API calls in one place.
// Every function returns parsed JSON or null on error.
// ─────────────────────────────────────────────

import { BASE } from '../constants';

/**
 * Low-level fetch wrapper for the Manifold v0 API.
 * @param {string} path - API path e.g. '/me'
 * @param {RequestInit} [opts] - fetch options
 * @returns {Promise<Response>}
 */
export const apiFetch = (path, opts = {}) => fetch(BASE + path, opts);

// ── Auth / User ───────────────────────────────

/**
 * Fetches the authenticated user's profile.
 * Returns null if the key is invalid or the request fails.
 * @param {string} apiKey
 * @returns {Promise<object|null>}
 */
export async function fetchMe(apiKey) {
  try {
    const r = await apiFetch('/me', { headers: { Authorization: `Key ${apiKey}` } });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

// ── Portfolio ─────────────────────────────────

/**
 * Fetches the user's current portfolio summary (balance, investmentValue, dailyProfit).
 * @param {string} userId
 * @returns {Promise<object|null>}
 */
export async function fetchPortfolio(userId) {
  try {
    const r = await apiFetch(`/get-user-portfolio?userId=${userId}`);
    return await r.json();
  } catch {
    return null;
  }
}

/**
 * Fetches the user's full portfolio P&L history.
 * Each entry: { timestamp, profit, ... }
 * @param {string} userId
 * @returns {Promise<Array>}
 */
export async function fetchPortfolioHistory(userId) {
  try {
    const r = await apiFetch(`/get-user-portfolio-history?userId=${userId}&period=allTime`);
    const d = await r.json();
    return Array.isArray(d) ? d : [];
  } catch {
    return [];
  }
}

/**
 * Fetches open position metrics with contract details.
 * Uses Manifold's contract-metrics endpoint which returns accurate
 * invested, profit, profitPercent, and payout — no manual share math needed.
 * @param {string} userId
 * @returns {Promise<{ positions: Array, contracts: Array }>}
 */
export async function fetchPositions(userId) {
  try {
    const r = await apiFetch(
      `/get-user-contract-metrics-with-contracts?userId=${userId}&limit=500&order=profit`
    );
    const d = await r.json();
    if (!d.metricsByContract || !d.contracts) return { positions: [], contracts: [] };
    return { metrics: d.metricsByContract, contracts: d.contracts };
  } catch {
    return { positions: [], contracts: [] };
  }
}

// ── Bets ──────────────────────────────────────

/**
 * Fetches up to 1000 bets for a user (the API maximum).
 * Requires authentication because bets are private.
 * @param {string} userId
 * @param {string} apiKey
 * @returns {Promise<Array>}
 */
export async function fetchBets(userId, apiKey) {
  try {
    const r = await apiFetch(`/bets?userId=${userId}&limit=1000`, {
      headers: { Authorization: `Key ${apiKey}` },
    });
    const d = await r.json();
    return Array.isArray(d) ? d : [];
  } catch {
    return [];
  }
}

// ── Markets ───────────────────────────────────

/**
 * Fetches the top 200 open binary markets sorted by liquidity.
 * This is the primary market list used for both the Markets tab
 * and the bot's opportunity scan.
 * @returns {Promise<Array>}
 */
export async function fetchMarkets() {
  try {
    const r = await apiFetch(
      '/search-markets?term=&filter=open&contractType=BINARY&sort=liquidity&limit=200'
    );
    const d = await r.json();
    return Array.isArray(d) ? d.filter(m => !m.isResolved && m.pool) : [];
  } catch {
    return [];
  }
}

// ── Betting ───────────────────────────────────

/**
 * Places (or simulates) a bet on a market.
 * When dryRun=true, Manifold simulates the bet server-side
 * and returns expected fills without spending mana.
 * @param {string} apiKey
 * @param {string} contractId
 * @param {'YES'|'NO'} outcome
 * @param {number} amount - Mana to bet
 * @param {boolean} [dryRun=false]
 * @returns {Promise<object>} Manifold bet response
 */
export async function placeBetAPI(apiKey, contractId, outcome, amount, dryRun = false) {
  const r = await apiFetch('/bet', {
    method: 'POST',
    headers: {
      Authorization: `Key ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ contractId, outcome, amount, ...(dryRun && { dryRun: true }) }),
  });
  return await r.json();
}
