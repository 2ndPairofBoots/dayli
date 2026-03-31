"""
Strategy framework for Dayli trading bot.

Strategies implement BaseTradingStrategy interface with:
- Qualifier pipeline (PASS/FAIL checks)
- propose_bet() hook (strategy-specific logic)
"""

from abc import ABC, abstractmethod
from typing import List, Optional
import logging
import time
from datetime import datetime
import re

from api.models import Market, ProposedBet, StrategyResult
from api.client import ManifoldClient

logger = logging.getLogger(__name__)


class Qualifier(ABC):
    """Base class for market qualifiers."""
    
    @abstractmethod
    async def evaluate(self, market: Market, client: ManifoldClient) -> bool:
        """
        Check if market passes this qualifier.
        
        Args:
            market: Market to evaluate
            client: API client (for additional data if needed)
        
        Returns:
            True if market passes, False otherwise
        """
        pass
    
    @abstractmethod
    def reason(self) -> str:
        """Get reason for disqualification if evaluate returns False."""
        pass


class LiquidityQualifier(Qualifier):
    """Require minimum liquidity."""
    
    def __init__(self, min_liquidity: float = 100.0):
        self.min_liquidity = min_liquidity
        self._failed_reason = ""
    
    async def evaluate(self, market: Market, client: ManifoldClient) -> bool:
        if market.liquidity < self.min_liquidity:
            self._failed_reason = f"Liquidity {market.liquidity:.0f} < {self.min_liquidity:.0f}"
            return False
        return True
    
    def reason(self) -> str:
        return self._failed_reason


class VolumeQualifier(Qualifier):
    """Require minimum trading volume."""
    
    def __init__(self, min_volume: float = 500.0):
        self.min_volume = min_volume
        self._failed_reason = ""
    
    async def evaluate(self, market: Market, client: ManifoldClient) -> bool:
        if market.volume < self.min_volume:
            self._failed_reason = f"Volume {market.volume:.0f} < {self.min_volume:.0f}"
            return False
        return True
    
    def reason(self) -> str:
        return self._failed_reason


class AgeQualifier(Qualifier):
    """Require market to be open for minimum time."""
    
    def __init__(self, min_age_hours: int = 1):
        self.min_age_hours = min_age_hours
        self._failed_reason = ""
    
    async def evaluate(self, market: Market, client: ManifoldClient) -> bool:
        if market.created_time is None:
            return True

        now = datetime.now(market.created_time.tzinfo) if market.created_time.tzinfo else datetime.now()
        age_hours = max(0.0, (now - market.created_time).total_seconds() / 3600)
        
        if age_hours < self.min_age_hours:
            self._failed_reason = f"Market age {age_hours:.1f}h < {self.min_age_hours}h"
            return False
        return True
    
    def reason(self) -> str:
        return self._failed_reason


class ClosedQualifier(Qualifier):
    """Reject closed/resolved markets."""
    
    def __init__(self):
        self._failed_reason = ""
    
    async def evaluate(self, market: Market, client: ManifoldClient) -> bool:
        if market.is_closed():
            self._failed_reason = f"Market is {market.status}"
            return False
        return True
    
    def reason(self) -> str:
        return self._failed_reason


class ResolutionRiskQualifier(Qualifier):
    """Reject markets with high ambiguity / likely N/A risk signals."""

    HIGH_RISK_PHRASES = [
        r"my\s+judgment",
        r"at\s+my\s+discretion",
        r"i\s+will\s+decide",
        r"subjective",
        r"if\s+i\s+feel",
        r"probably",
        r"maybe",
        r"tbd",
        r"unclear",
    ]

    def __init__(self, max_risk_score: int = 2):
        self.max_risk_score = max_risk_score
        self._failed_reason = ""

    async def evaluate(self, market: Market, client: ManifoldClient) -> bool:
        raw = market.raw_data or {}
        text = " ".join(
            [
                str(raw.get("question", market.question or "")),
                str(raw.get("textDescription", "")),
                str(raw.get("description", "")),
            ]
        ).lower()

        risk_score = 0
        for pattern in self.HIGH_RISK_PHRASES:
            if re.search(pattern, text):
                risk_score += 1

        if raw.get("isResolved") and raw.get("resolution") == "CANCEL":
            risk_score += 2

        if risk_score > self.max_risk_score:
            self._failed_reason = (
                f"Resolution risk score {risk_score} > {self.max_risk_score}"
            )
            return False

        return True

    def reason(self) -> str:
        return self._failed_reason


class BaseTradingStrategy(ABC):
    """Base class for all trading strategies.
    
    Subclasses must implement:
    - propose_bet(market) - Core strategy logic
    - custom_qualifiers() - Strategy-specific filters (optional)
    """
    
    def __init__(self, name: str, client: ManifoldClient, config: dict = None):
        """
        Initialize strategy.
        
        Args:
            name: Strategy name (for logging)
            client: ManifoldClient instance
            config: Configuration dict (strategy-specific parameters)
        """
        self.name = name
        self.client = client
        self.config = config or {}
    
    async def evaluate_and_propose(
        self,
        market: Market
    ) -> StrategyResult:
        """
        Evaluate market against qualifiers, then call propose_bet().
        
        Returns:
            StrategyResult with proposed bets or log event
        """
        start_time = time.time()
        
        # Run base qualifiers (all strategies use these)
        for qualifier in self.base_qualifiers():
            if not await qualifier.evaluate(market, self.client):
                reason = qualifier.reason()
                log_msg = f"[{self.name}] Disqualified: {reason}"
                return StrategyResult(log_event=log_msg)
        
        # Run custom qualifiers (strategy-specific)
        for qualifier in self.custom_qualifiers():
            if not await qualifier.evaluate(market, self.client):
                reason = qualifier.reason()
                log_msg = f"[{self.name}] Disqualified: {reason}"
                return StrategyResult(log_event=log_msg)
        
        # All qualifiers passed, call strategy-specific logic
        proposed = await self.propose_bet(market)
        latency_ms = (time.time() - start_time) * 1000
        
        if proposed:
            logger.info(
                f"[{self.name}] Proposed: {market.id} {proposed.outcome} "
                f"{proposed.size}m @ confidence {proposed.confidence:.1%}"
            )
            return StrategyResult(proposed_bets=[proposed])
        else:
            log_msg = f"[{self.name}] No edge above threshold"
            return StrategyResult(log_event=log_msg)
    
    @abstractmethod
    async def propose_bet(self, market: Market) -> Optional[ProposedBet]:
        """
        Strategy-specific betting logic.
        
        Called only if all qualifiers pass.
        
        Args:
            market: Market that passed all qualifiers
        
        Returns:
            ProposedBet if we want to trade, None otherwise
        """
        pass
    
    def base_qualifiers(self) -> List[Qualifier]:
        """Qualifiers that all strategies use."""
        min_liquidity = float(self.config.get("min_liquidity", 100.0))
        min_volume = float(self.config.get("min_volume", 500.0))
        min_age_hours = int(self.config.get("min_age_hours", 0))
        max_resolution_risk = int(self.config.get("max_resolution_risk", 2))
        return [
            ClosedQualifier(),
            LiquidityQualifier(min_liquidity=min_liquidity),
            VolumeQualifier(min_volume=min_volume),
            AgeQualifier(min_age_hours=min_age_hours),
            ResolutionRiskQualifier(max_risk_score=max_resolution_risk),
        ]
    
    def custom_qualifiers(self) -> List[Qualifier]:
        """Strategy-specific qualifiers (override in subclass)."""
        return []


class SimpleStrategy(BaseTradingStrategy):
    """
    Simple baseline strategy.
    
    Logic:
    - If YES probability < 35%, propose YES bet
    - Confidence: 60% (arbitrary, from heuristic)
    - Size: 100 mana (will be scaled by Kelly Criterion)
    """
    
    async def propose_bet(self, market: Market) -> Optional[ProposedBet]:
        """Simple probability-based heuristic."""
        
        # Only works for binary YES/NO markets
        if "YES" not in market.outcomes or "NO" not in market.outcomes:
            return None
        
        yes_prob = market.get_answer_probability("YES")
        no_prob = market.get_answer_probability("NO")
        
        # If YES is underpriced (< 35%), bet on it
        threshold = float(self.config.get("underpriced_threshold", 0.35))
        confidence = float(self.config.get("confidence", 0.60))
        default_size = int(self.config.get("default_size", 100))
        if yes_prob < threshold:
            reason = f"YES underpriced at {yes_prob:.1%}"
            
            return ProposedBet(
                market_id=market.id,
                outcome="YES",
                size=default_size,  # Default size (scaled by Kelly)
                confidence=confidence,
                reason=reason
            )
        
        # If NO is underpriced (< 35%), bet on it
        if no_prob < threshold:
            reason = f"NO underpriced at {no_prob:.1%}"
            
            return ProposedBet(
                market_id=market.id,
                outcome="NO",
                size=default_size,
                confidence=confidence,
                reason=reason
            )
        
        # No clear edge
        return None


class HousekeepingStrategy(BaseTradingStrategy):
    """
    Non-trading strategy for maintenance tasks.
    
    Examples:
    - Daily loan requests
    - Balance transfers
    - Bot health checks
    """
    
    async def propose_bet(self, market: Market) -> Optional[ProposedBet]:
        """Housekeeping never proposes trades."""
        return None
    
    def base_qualifiers(self) -> List[Qualifier]:
        """Housekeeping skips normal qualifiers."""
        return []
    
    async def evaluate_and_propose(self, market: Market) -> StrategyResult:
        """Housekeeping does minimal evaluation."""
        # Just return empty result
        return StrategyResult()
