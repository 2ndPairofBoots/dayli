"""Simple linked-market inconsistency scanner.

Phase-2 baseline: detects probable duplicate/linked binary markets with large
probability divergence.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, List, Tuple

from api.models import Market


@dataclass
class ArbSignal:
    market_a: str
    market_b: str
    prob_a: float
    prob_b: float
    spread: float
    reason: str


def _normalize_question(text: str) -> str:
    t = (text or "").lower().strip()
    for ch in "?.,:;!()[]{}'\"":
        t = t.replace(ch, "")
    return " ".join(t.split())


def scan_linked_market_spreads(
    markets: Iterable[Market],
    min_prob_spread: float = 0.12,
) -> List[ArbSignal]:
    """Find suspiciously similar binary markets with divergent probabilities."""
    indexed: List[Tuple[str, Market]] = [(_normalize_question(m.question), m) for m in markets]
    out: List[ArbSignal] = []

    for i, (qa, ma) in enumerate(indexed):
        pa = ma.get_answer_probability("YES")
        if pa <= 0 or pa >= 1:
            continue

        for qb, mb in indexed[i + 1 :]:
            # Very cheap text-based linkage heuristic.
            if qa == qb or (qa and qb and (qa in qb or qb in qa)):
                pb = mb.get_answer_probability("YES")
                if pb <= 0 or pb >= 1:
                    continue
                spread = abs(pa - pb)
                if spread >= min_prob_spread:
                    out.append(
                        ArbSignal(
                            market_a=ma.id,
                            market_b=mb.id,
                            prob_a=pa,
                            prob_b=pb,
                            spread=spread,
                            reason="Linked-question spread above threshold",
                        )
                    )

    out.sort(key=lambda s: s.spread, reverse=True)
    return out
