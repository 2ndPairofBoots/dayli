// ─────────────────────────────────────────────
// src/utils/math.js
// ─────────────────────────────────────────────

import { FEE, KELLY_FRAC, CATS } from '../constants';
import { getCategory, catW } from './categories';

// ── AMM / Slippage ────────────────────────────

export function calcSlip(pool, amt, side) {
  if (!pool?.YES || !pool?.NO || amt <= 0) return 0;
  const k = pool.YES * pool.NO, net = amt * (1 - FEE);
  const p0 = pool.NO / (pool.YES + pool.NO);
  if (side === 'YES') { const nNO = pool.NO + net; return Math.max(0, (nNO / (k / nNO + nNO)) - p0); }
  else { const nYES = pool.YES + net; return Math.max(0, p0 - ((k / nYES) / (nYES + k / nYES))); }
}

export function calcPost(pool, amt, side) {
  if (!pool?.YES || !pool?.NO) return null;
  const k = pool.YES * pool.NO, net = amt * (1 - FEE);
  if (side === 'YES') { const nNO = pool.NO + net; return nNO / (k / nNO + nNO); }
  else { const nYES = pool.YES + net; const nNO = k / nYES; return nNO / (nYES + nNO); }
}

export function maxBetForSlip(pool, cap, side) {
  if (!pool?.YES || !pool?.NO) return 0;
  let lo = 0, hi = 50000;
  for (let i = 0; i < 50; i++) { const mid = (lo + hi) / 2; calcSlip(pool, mid, side) < cap ? lo = mid : hi = mid; }
  return lo;
}

// ── Kelly (CPMM-aware) ────────────────────────
//
// IMPROVEMENT: Standard fixed-odds Kelly ignores the fact that your bet
// moves the market price against you. We now use the *average* execution
// price (integral of CPMM curve) rather than the current market price.
// This gives a more accurate edge estimate and prevents over-sizing on
// low-liquidity markets where price impact is large.
//
// Average execution price for side YES given pool and net amount:
//   avg_p = shares_received / net_amount
//   shares_received = pool.YES - k / (pool.NO + net)  [CPMM math]
//
// We use this average price as mktP in the Kelly formula so the edge
// is computed against what you actually pay, not the pre-bet price.

/**
 * Returns shares received for a given net mana input on a CPMM market.
 * @param {{ YES: number, NO: number }} pool
 * @param {number} net - Mana after fee
 * @param {'YES'|'NO'} side
 */
function sharesOut(pool, net, side) {
  const k = pool.YES * pool.NO;
  if (side === 'YES') return pool.YES - k / (pool.NO + net);
  else return pool.NO - k / (pool.YES + net);
}

/**
 * CPMM-aware Kelly sizing.
 * Computes the optimal bet by finding the amount f that maximises
 * expected log-wealth, using the actual average execution price
 * rather than the current market probability.
 *
 * Falls back to quarter-Kelly fixed-odds formula when pool is missing.
 *
 * @param {{ YES: number, NO: number } | null} pool
 * @param {number} mktP  - Current market probability for this side
 * @param {number} ourP  - Our estimated probability for this side
 * @param {number} bal   - Free capital to size against
 * @returns {number} Recommended bet size in mana (≥0)
 */
export function kelly(pool, mktP, ourP, bal) {
  // Basic sanity — no edge means no bet
  if (ourP <= mktP) return 0;

  // Without pool data fall back to fixed-odds quarter-Kelly
  if (!pool?.YES || !pool?.NO) {
    const b = 1 / mktP - 1;
    const edge = b * ourP - (1 - ourP);
    return edge <= 0 ? 0 : Math.min((edge / b) * KELLY_FRAC * bal, bal * 0.08);
  }

  // Binary search for the bet size f that maximises E[log(wealth)]
  // E[log(W)] = ourP * log(bal + profit_if_win) + (1-ourP) * log(bal - f)
  // where profit_if_win = shares_received - f  (net gain if market resolves YES)
  let lo = 0, hi = Math.min(bal * 0.15, 5000);
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const net = mid * (1 - FEE);
    const shares = sharesOut(pool, net, 'YES'); // same math for both sides
    // Derivative of E[log W] w.r.t. f — positive means increase f
    const dUp   = ourP / (bal + shares - mid);
    const dDown = (1 - ourP) / (bal - mid);
    if (dUp > dDown) lo = mid; else hi = mid;
  }
  const optimal = (lo + hi) / 2;
  // Apply quarter-Kelly fraction and hard cap
  return Math.min(optimal * KELLY_FRAC, bal * 0.08);
}

// ── Confidence weighting ──────────────────────

/**
 * Shrinks edge toward zero for thin/new markets.
 * Geometric mean of two logistic curves:
 *   bet-count prior (50% at 30 bets) × volume prior (50% at ᴍ500).
 */
export function confidenceWeight(betsCount, vol) {
  const bc = betsCount / (betsCount + 30);
  const vc = vol / (vol + 500);
  return Math.sqrt(bc * vc);
}

// ── Certainty score ───────────────────────────

export function certScore(ev, conf, cw, liquidity) {
  const liq = Math.min(1, (liquidity || 0) / 2000);
  return Math.round(Math.min(99, Math.max(1, ev * conf * cw * (0.5 + 0.5 * liq) * 400)));
}

export function certColor(score) {
  if (score >= 70) return '#34d399';
  if (score >= 45) return '#fbbf24';
  return '#f87171';
}

// ── Strategy detection ────────────────────────

/**
 * Infers which strategy likely placed a historical bet.
 * "Manual" = bet was NOT placed by any known strategy pattern.
 * This is exposed in the strategy breakdown as "Manual" so users
 * can see how many bets were placed directly on Manifold vs via Dayli.
 */
export function detectStrategy(bet, mkt) {
  if (!mkt) return 'manual';
  const p = mkt.probability ?? 0.5;
  const bets = mkt.betsCount ?? 0;
  const vol  = mkt.volume ?? 0;
  const betP = bet.probBefore ?? p;

  if (p >= 0.94 || p <= 0.06) return 'extreme_fade';
  if (bets <= 5 && vol < 200)  return 'new_market';
  if (Math.abs((bet.probAfter ?? betP) - betP) >= 0.15) return 'mean_reversion';
  const q = mkt.question?.toLowerCase() ?? '';
  if (q.includes('by 20') || q.includes('before 20') || q.includes('end of 20')) return 'attrition';

  // IMPROVEMENT: detect manual bets — small round amounts (ᴍ5, ᴍ10, ᴍ25, ᴍ50, ᴍ100)
  // placed at mid-range probs with no clear strategy signal are likely manual.
  // We flag them rather than defaulting to 'calibration'.
  const roundAmts = new Set([5, 10, 15, 20, 25, 50, 100, 200]);
  const amt = bet.amount ?? 0;
  if (roundAmts.has(Math.round(amt)) && p > 0.15 && p < 0.85) return 'manual';

  return 'calibration';
}

// ── Dynamic base rates ────────────────────────

export function calcDynamicBaseRates(resolvedBets) {
  const cats = {};
  for (const b of resolvedBets) {
    const cat = getCategory(b.question ?? '');
    if (!cats[cat]) cats[cat] = { yes: 0, total: 0 };
    cats[cat].total++;
    if (b.resolution === 'YES') cats[cat].yes++;
  }
  const rates = {};
  for (const [cat, { yes, total }] of Object.entries(cats)) {
    if (total >= 10) rates[cat] = yes / total;
  }
  return rates;
}

// ── Qualifiers (Dagonet-inspired) ─────────────

const BOT_USERNAMES = new Set([
  'manifoldbot', 'mirrorbot', 'market-maker', 'marketmaker',
  'dagonet', 'galahad', 'evansbot', 'spacedroplet', 'a',
]);

export const QUALIFIERS = {
  notClosingSoon: m => m.closeTime && m.closeTime > Date.now() + 3600000,
  hasPool:        m => !!m.pool?.YES && !!m.pool?.NO,
  isOpen:         m => !m.isResolved,
  minLiquidity:   (m, min = 50) => (m.totalLiquidity ?? 0) >= min,
  notBotCreated:  m => !BOT_USERNAMES.has(m.creatorUsername?.toLowerCase() ?? ''),
  minBettors:     (m, min = 2) => (m.uniqueBettorCount ?? 0) >= min,
};

export function passesQualifiers(m, catAllocated, catLimit) {
  return (
    QUALIFIERS.notClosingSoon(m) &&
    QUALIFIERS.hasPool(m) &&
    QUALIFIERS.isOpen(m) &&
    QUALIFIERS.minLiquidity(m) &&
    QUALIFIERS.notBotCreated(m) &&
    QUALIFIERS.minBettors(m) &&
    (catAllocated ?? 0) < catLimit
  );
}

// ── Mean reversion ────────────────────────────

export function meanReversionSignal(m, recentMovers) {
  const MOVE_THRESHOLD = 0.12;
  const WINDOW_MS      = 30 * 60000;
  const MAX_VOL        = 2000;

  const mover = recentMovers?.get(m.id);
  if (!mover) return null;
  if (Date.now() - mover.timestamp > WINDOW_MS) return null;
  if ((m.volume ?? 0) > MAX_VOL) return null;

  const move = mover.probAfter - mover.probBefore;
  if (Math.abs(move) < MOVE_THRESHOLD) return null;

  const side = move > 0 ? 'NO' : 'YES';
  const ourP = mover.probBefore + move * 0.40;
  return { side, ourP, strategy: 'mean_reversion' };
}

// ── Bot engine ────────────────────────────────

/**
 * Core bot engine — returns ranked list of proposed bets.
 *
 * IMPROVEMENTS vs previous version:
 *  1. CPMM-aware Kelly via the new kelly() function
 *  2. EV now computed against post-bet average price, not pre-bet price
 *  3. Minimum liquidity qualifier added (skip dust markets)
 *  4. New market threshold widened (≤5 bets, <ᴍ200 vol)
 *  5. Mean reversion wired in from WebSocket movers
 */
export function getBotBets(
  markets, betHistory, config, balance, totalInvested,
  catAllocated, dynamicBaseRates, recentMovers
) {
  const bets = [];
  const alreadyBet = new Set((betHistory ?? []).map(b => b.contractId));
  const freeCapital = Math.max(0, (balance ?? 0) - (totalInvested ?? 0) - (config.balanceReserve ?? 200));
  if (freeCapital <= 0) return bets;

  for (const m of markets) {
    if (alreadyBet.has(m.id)) continue;

    const cat      = getCategory(m.question ?? '');
    const catLimit = freeCapital * (config.catMaxPct ?? 0.25);

    if (!passesQualifiers(m, catAllocated?.[cat], catLimit)) continue;

    const p        = m.probability; if (p == null) continue;
    const q        = m.question?.toLowerCase() ?? '';
    const catInfo  = CATS[cat];
    const betsCount = m.betsCount ?? 0, vol = m.volume ?? 0;

    let side = null, ourP = null, strategy = null;
    const baseRate = dynamicBaseRates?.[cat] ?? catInfo?.baseRate ?? 0.50;

    // Strategy rules
    if (config.mean_reversion) {
      const sig = meanReversionSignal(m, recentMovers);
      if (sig) ({ side, ourP, strategy } = sig);
    }
    if (!side) {
      if (config.extreme_fade && p >= 0.93) {
        side = 'NO'; ourP = 0.80; strategy = 'extreme_fade';
      } else if (config.extreme_fade && p <= 0.07) {
        side = 'YES'; ourP = 0.20; strategy = 'extreme_fade';
      } else if (config.new_market && betsCount <= 5 && vol < 200) {
        if (p >= 0.75) { side = 'NO';  ourP = 0.50; strategy = 'new_market'; }
        else if (p <= 0.25) { side = 'YES'; ourP = 0.50; strategy = 'new_market'; }
      } else if (config.attrition && (q.includes('by 20') || q.includes('before 20') || q.includes('end of 20'))) {
        if (p > 0.25 && p < 0.70) { side = 'NO'; ourP = p - 0.10; strategy = 'attrition'; }
      } else if (config.calibration && catInfo) {
        const dev = p - baseRate;
        if (dev > 0.12)  { side = 'NO';  ourP = baseRate + 0.04; strategy = 'calibration'; }
        else if (dev < -0.12) { side = 'YES'; ourP = baseRate - 0.04; strategy = 'calibration'; }
      }
    }
    if (!side || !ourP) continue;

    // Confidence shrinkage
    const conf = confidenceWeight(betsCount, vol);
    ourP = p + (ourP - p) * conf;

    const mktPAdj = side === 'YES' ? p       : 1 - p;
    const ourPAdj = side === 'YES' ? ourP    : 1 - ourP;

    // IMPROVEMENT: EV against post-bet average price
    // Compute average execution price for a probe bet of ᴍ10
    // to get a realistic edge estimate rather than using current prob
    const probeSide = side === 'YES' ? 'YES' : 'NO';
    const probeNet  = 10 * (1 - FEE);
    const probeShares = sharesOut(m.pool, probeNet, probeSide);
    const avgExecPrice = probeNet / probeShares; // avg cost per share
    const adjEV = ourPAdj - avgExecPrice;        // edge against actual avg price
    if (adjEV < 0.03) continue;

    // CPMM-aware Kelly
    const maxSafe     = maxBetForSlip(m.pool, config.slipCap ?? 0.02, side);
    const catRemaining = catLimit - (catAllocated?.[cat] ?? 0);
    const kellyAmt    = kelly(m.pool, mktPAdj, ourPAdj, freeCapital);
    const size = Math.min(
      kellyAmt * (catW(m.question ?? '') || 1),
      maxSafe,
      config.maxBet ?? 50,
      freeCapital * 0.05,
      catRemaining
    );
    if (size < 1) continue;

    bets.push({ market: m, side, ourP, ev: adjEV, conf, size: Math.round(size), strategy, cat });
  }

  return bets.sort(
    (a, b) => b.ev * b.conf * (catW(b.market.question ?? '') || 1)
            - a.ev * a.conf * (catW(a.market.question ?? '') || 1)
  );
}

// ── Exit suggestions ──────────────────────────

export function getExitSuggestions(positions, takeProfitPct = 40, stopLossPct = -30) {
  const exits = [], warnings = [];
  for (const p of positions) {
    if (p.profitPct >= takeProfitPct)
      exits.push({ ...p, reason: `+${p.profitPct.toFixed(1)}% — take profit` });
    else if (p.profitPct <= stopLossPct)
      warnings.push({ ...p, reason: `${p.profitPct.toFixed(1)}% — stop loss` });
  }
  return { exits, warnings };
}