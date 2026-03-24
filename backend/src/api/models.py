"""
Domain models for Manifold Markets API responses.

Maps Manifold API JSON (camelCase) to Python objects (snake_case).
Detects schema drift by logging unexpected fields.
"""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Dict, List, Optional, Any
import logging

logger = logging.getLogger(__name__)


def camel_to_snake(name: str) -> str:
    """Convert camelCase to snake_case."""
    result = []
    for i, char in enumerate(name):
        if char.isupper() and i > 0:
            result.append('_')
            result.append(char.lower())
        else:
            result.append(char)
    return ''.join(result)


class BaseModel:
    """Base class for all Manifold models.
    
    Handles:
    - camelCase → snake_case conversion
    - DateTime parsing
    - Unknown field logging (schema drift detection)
    """
    
    __datetime_fields__ = []  # Override in subclasses
    
    @classmethod
    def from_dict(cls, data: dict):
        """Convert API JSON to typed object."""
        if data is None:
            return None
        
        # Convert camelCase keys to snake_case
        converted = {}
        for key, value in data.items():
            snake_key = camel_to_snake(key)
            converted[snake_key] = value
        
        # Parse datetime fields
        for field_name in cls.__datetime_fields__:
            if field_name in converted and converted[field_name]:
                try:
                    if isinstance(converted[field_name], str):
                        converted[field_name] = datetime.fromisoformat(
                            converted[field_name].replace('Z', '+00:00')
                        )
                    elif isinstance(converted[field_name], (int, float)):
                        ts = float(converted[field_name])
                        if ts > 1_000_000_000_000:
                            ts = ts / 1000.0
                        converted[field_name] = datetime.fromtimestamp(ts)
                except Exception as e:
                    logger.warning(f"Failed to parse datetime field {field_name}: {e}")
        
        # Log unexpected keys for schema drift detection
        expected = set(cls.__annotations__.keys()) if hasattr(cls, '__annotations__') else set()
        actual = set(converted.keys())
        if unexpected := actual - expected:
            logger.warning(f"Unexpected fields in {cls.__name__}: {unexpected}")
        
        # Filter to expected fields only
        filtered = {k: v for k, v in converted.items() if k in expected or not expected}
        
        try:
            return cls(**filtered)
        except TypeError as e:
            logger.error(f"Failed to create {cls.__name__}: {e}")
            logger.debug(f"Data: {filtered}")
            raise


@dataclass
class Market(BaseModel):
    """Manifold Market entity."""
    
    __datetime_fields__ = ['created_time', 'close_time', 'resolve_time']
    
    id: str
    question: str
    outcomes: List[str] = field(default_factory=list)  # YES/NO or multiple
    probability: Dict[str, float] = field(default_factory=dict)  # {outcome: prob}
    liquidity: float = 0.0
    volume: float = 0.0
    created_time: Optional[datetime] = None
    close_time: Optional[datetime] = None
    resolve_time: Optional[datetime] = None
    status: str = "open"  # open, closed, resolved
    outcome: Optional[str] = None  # Resolution outcome

    @classmethod
    def from_dict(cls, data: dict):
        """Normalize current Manifold market payload into legacy model fields."""
        if data is None:
            return None

        normalized = dict(data)

        # Normalize liquidity and volume naming.
        if "liquidity" not in normalized and "totalLiquidity" in normalized:
            normalized["liquidity"] = normalized.get("totalLiquidity", 0.0)
        if "volume" not in normalized:
            normalized["volume"] = normalized.get("volume24Hours", normalized.get("volume", 0.0))

        # Normalize probabilities for binary markets.
        if "probability" not in normalized:
            p = normalized.get("p")
            if isinstance(p, (int, float)):
                p = max(0.0, min(1.0, float(p)))
                normalized["probability"] = {"YES": p, "NO": 1.0 - p}
        elif isinstance(normalized.get("probability"), (int, float)):
            p = max(0.0, min(1.0, float(normalized.get("probability"))))
            normalized["probability"] = {"YES": p, "NO": 1.0 - p}

        if "outcomes" not in normalized:
            outcome_type = str(normalized.get("outcomeType", "")).upper()
            if outcome_type == "BINARY":
                normalized["outcomes"] = ["YES", "NO"]

        # Normalize status and resolution.
        if "status" not in normalized:
            if normalized.get("isResolved") or normalized.get("resolution"):
                normalized["status"] = "resolved"
            else:
                normalized["status"] = "open"
        if "outcome" not in normalized and normalized.get("resolution"):
            normalized["outcome"] = normalized.get("resolution")
        if "resolveTime" not in normalized and "resolutionTime" in normalized:
            normalized["resolveTime"] = normalized.get("resolutionTime")

        return super().from_dict(normalized)
    
    def get_answer_probability(self, outcome: str) -> float:
        """Get probability for specific outcome."""
        if isinstance(self.probability, dict):
            return float(self.probability.get(outcome, 0.0))
        if isinstance(self.probability, (int, float)):
            p = max(0.0, min(1.0, float(self.probability)))
            if str(outcome).upper() == "YES":
                return p
            if str(outcome).upper() == "NO":
                return 1.0 - p
        return 0.0
    
    def get_answer_liquidity(self, outcome: str) -> float:
        """Estimate liquidity for specific outcome (simplified)."""
        if not self.outcomes:
            return 0.0
        return self.liquidity / len(self.outcomes)
    
    def is_resolved(self) -> bool:
        """Check if market is resolved."""
        return self.status == "resolved"
    
    def is_closed(self) -> bool:
        """Check if market is closed to betting."""
        return self.status in ["closed", "resolved"]


@dataclass
class Bet(BaseModel):
    """User's bet on a market."""
    
    __datetime_fields__ = ['created_at']
    
    id: str
    contract_id: str  # market_id
    user_id: str
    outcome: str
    shares: float
    amount_bet: float
    profit: float = 0.0
    created_at: Optional[datetime] = None
    limitProb: Optional[float] = None  # For limit orders
    
    # Aliases for compatibility
    @property
    def market_id(self) -> str:
        return self.contract_id
    
    @property
    def execution_price(self) -> float:
        """Approximate execution price (amount / shares)."""
        return self.amount_bet / self.shares if self.shares > 0 else 0.0


@dataclass
class User(BaseModel):
    """User profile and balance."""
    
    __datetime_fields__ = ['created_time']
    
    id: str
    username: str
    name: str = ""
    avatar_url: str = ""
    cash_balance: float = 0.0  # Mana balance
    total_balance: float = 0.0  # Reported aggregate balance
    created_time: Optional[datetime] = None

    @classmethod
    def from_dict(cls, data: dict):
        """Map API user payload to User, supporting multiple balance field names."""
        if data is None:
            return None

        normalized = dict(data)
        # Keep spendable and aggregate balances separate.
        bal = float(normalized.get("balance", 0.0) or 0.0)
        cash = float(normalized.get("cashBalance", 0.0) or 0.0)
        normalized["cashBalance"] = cash
        normalized["totalBalance"] = bal

        return super().from_dict(normalized)
    
    @property
    def balance(self) -> float:
        """Alias for cash_balance."""
        return self.cash_balance


@dataclass
class LiteUser(BaseModel):
    """Minimal user info (from bet/comment responses)."""
    
    id: str
    username: str
    name: str = ""
    avatar_url: str = ""


@dataclass
class ProposedBet:
    """Proposed bet before execution (includes validation)."""
    
    market_id: str
    outcome: str
    size: int  # Amount to bet in mana
    confidence: float  # 0.0 to 1.0
    reason: str  # Why we're betting
    
    def validate(self, kelly_size: int) -> bool:
        """Check size against Kelly Criterion."""
        return self.size <= kelly_size


@dataclass
class PortfolioMetrics(BaseModel):
    """Portfolio summary statistics."""
    
    __datetime_fields__ = []
    
    balance: float
    invested: float
    profit: float = 0.0
    profit_percent: float = 0.0
    
    def to_dict(self) -> dict:
        """Convert to dictionary for JSON serialization."""
        return {
            'balance': self.balance,
            'invested': self.invested,
            'profit': self.profit,
            'profit_percent': self.profit_percent
        }


@dataclass
class Position:
    """An open position in a market."""
    
    market_id: str
    market_question: str
    outcome: str
    shares: float
    avg_cost: float  # Cost per share
    current_price: float  # Prob from market
    
    @property
    def cost_basis(self) -> float:
        """Total cost of position."""
        return self.shares * self.avg_cost
    
    @property
    def current_value(self) -> float:
        """Current market value."""
        return self.shares * self.current_price
    
    @property
    def unrealized_pnl(self) -> float:
        """Unrealized profit/loss."""
        return self.current_value - self.cost_basis


@dataclass
class StrategyResult:
    """Result of strategy evaluation."""
    
    proposed_bets: List[ProposedBet] = field(default_factory=list)
    log_event: Optional[str] = None
    
    def has_proposal(self) -> bool:
        """Check if strategy proposed any bets."""
        return len(self.proposed_bets) > 0


@dataclass
class PlaceBetEvent:
    """Logged event for placed bet."""
    
    timestamp: datetime
    market_id: str
    market_question: str
    outcome: str
    size: int
    probability: float
    strategy_name: str
    reason: str
    actual_cost: Optional[float] = None
    
    def to_csv(self) -> list:
        """Convert to CSV row."""
        return [
            self.timestamp.isoformat(),
            self.market_id,
            self.market_question[:50],  # Truncate question
            self.outcome,
            self.size,
            f"{self.probability:.3f}",
            self.strategy_name,
            self.reason,
            self.actual_cost or "N/A"
        ]


@dataclass
class ErrorEvent:
    """Logged event for errors."""
    
    timestamp: datetime
    error_type: str
    message: str
    traceback: Optional[str] = None
    
    def to_csv(self) -> list:
        """Convert to CSV row."""
        return [
            self.timestamp.isoformat(),
            self.error_type,
            self.message,
            self.traceback or ""
        ]


@dataclass
class StrategyEvent:
    """Logged event for strategy evaluation."""
    
    timestamp: datetime
    strategy_name: str
    market_id: str
    market_question: str
    decision: str  # qualified, disqualified, no_edge, proposed
    confidence: float
    latency_ms: float
    
    def to_csv(self) -> list:
        """Convert to CSV row."""
        return [
            self.timestamp.isoformat(),
            self.strategy_name,
            self.market_id,
            self.market_question[:50],
            self.decision,
            f"{self.confidence:.3f}",
            f"{self.latency_ms:.1f}"
        ]


@dataclass
class PortfolioEvent:
    """Logged event for portfolio snapshot."""
    
    timestamp: datetime
    balance: float
    invested: float
    p_and_l: float
    win_rate: float
    
    def to_csv(self) -> list:
        """Convert to CSV row."""
        return [
            self.timestamp.isoformat(),
            f"{self.balance:.2f}",
            f"{self.invested:.2f}",
            f"{self.p_and_l:.2f}",
            f"{self.win_rate:.3f}"
        ]
