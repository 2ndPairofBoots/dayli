"""CPMM execution math utilities for slippage-aware sizing.

These helpers mirror Manifold cpmm-1 formulas closely enough for pre-trade risk checks.
"""

from __future__ import annotations

from dataclasses import dataclass
from math import isfinite


@dataclass
class CpmmState:
    yes: float
    no: float
    p: float


@dataclass
class CpmmExecutionEstimate:
    shares: float
    avg_price: float
    prob_before: float
    prob_after: float
    slippage: float


def clamp_prob(prob: float, lo: float = 1e-6, hi: float = 1 - 1e-6) -> float:
    return max(lo, min(hi, prob))


def get_probability(state: CpmmState) -> float:
    """Implied YES probability from pool state."""
    denom = (1 - state.p) * state.yes + state.p * state.no
    if denom <= 0:
        return 0.5
    return clamp_prob((state.p * state.no) / denom)


def _cpmm_shares_no_fee(state: CpmmState, bet_amount: float, outcome: str) -> float:
    if bet_amount <= 0:
        return 0.0

    y, n, p = state.yes, state.no, state.p
    k = (y ** p) * (n ** (1 - p))

    if outcome == "YES":
        shares = y + bet_amount - (k * ((bet_amount + n) ** (p - 1))) ** (1 / p)
    else:
        shares = n + bet_amount - (k * ((bet_amount + y) ** (-p))) ** (1 / (1 - p))

    if not isfinite(shares) or shares < 0:
        return 0.0
    return shares


def simulate_cpmm_execution(
    state: CpmmState,
    outcome: str,
    amount: float,
    fee_rate: float = 0.0,
) -> CpmmExecutionEstimate:
    """Estimate shares, average price, and slippage for a bet amount.

    fee_rate is an aggregate approximation used for pre-trade filtering only.
    """
    amount = max(0.0, float(amount))
    if amount <= 0:
        p0 = get_probability(state)
        return CpmmExecutionEstimate(0.0, 0.0, p0, p0, 0.0)

    prob_before = get_probability(state)
    fee = amount * max(0.0, fee_rate)
    effective_amount = max(0.0, amount - fee)

    shares = _cpmm_shares_no_fee(state, effective_amount, outcome)
    avg_price = (effective_amount / shares) if shares > 0 else 0.0

    if outcome == "YES":
        yes_new = state.yes - shares + effective_amount
        no_new = state.no + effective_amount
    else:
        yes_new = state.yes + effective_amount
        no_new = state.no - shares + effective_amount

    next_state = CpmmState(yes=max(1e-6, yes_new), no=max(1e-6, no_new), p=state.p)
    prob_after = get_probability(next_state)

    if outcome == "YES":
        slippage = max(0.0, avg_price - prob_before)
    else:
        slippage = max(0.0, avg_price - (1 - prob_before))

    return CpmmExecutionEstimate(
        shares=shares,
        avg_price=avg_price,
        prob_before=prob_before,
        prob_after=prob_after,
        slippage=slippage,
    )


def build_state_from_market(market) -> CpmmState:
    """Build a CPMM state from Dayli Market model raw payload with safe fallbacks."""
    raw = getattr(market, "raw_data", {}) or {}
    pool = raw.get("pool") if isinstance(raw.get("pool"), dict) else {}

    yes = float(pool.get("YES", 0.0) or 0.0)
    no = float(pool.get("NO", 0.0) or 0.0)

    # Fallback for sparse payloads.
    if yes <= 0 or no <= 0:
        liquidity = float(raw.get("totalLiquidity", market.liquidity or 100.0) or 100.0)
        prob = market.get_answer_probability("YES")
        prob = clamp_prob(prob)
        # For p=0.5, q=no/(yes+no). Use synthetic split.
        no = max(1.0, liquidity * prob)
        yes = max(1.0, liquidity * (1 - prob))

    p = float(raw.get("p", market.get_answer_probability("YES") or 0.5) or 0.5)
    p = clamp_prob(p)

    return CpmmState(yes=yes, no=no, p=p)
