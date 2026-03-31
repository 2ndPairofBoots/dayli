"""
Kelly Criterion and risk management for position sizing.

Kelly's formula helps maximize long-term win rate while minimizing risk.
We use fractional Kelly (more conservative) to avoid over-leveraging.
"""

import logging
from typing import Optional

logger = logging.getLogger(__name__)


def calculate_kelly_size(
    account_balance: float,
    market_probability: float,
    our_estimate: float,
    kelly_fraction: float = 0.1,
    max_size: Optional[int] = None
) -> int:
    """
    Calculate position size using Kelly Criterion.
    
    Kelly Formula:
        f = (Edge - 1 + Odds) / Odds
        where:
        - f is the fraction of bankroll to bet
        - Edge is our probability
        - Odds is market odds (usually 1 for equal odds)
    
    Simplified binary (YES/NO):
        f = (2 * edge - 1) / 1 = 2 * edge - 1
        where:
        - edge = our_probability - market_probability
    
    Fractional Kelly:
        Use f / fraction_denominator to be more conservative
        Common: 1/10 (10% Kelly), 1/25 (4% Kelly)
    
    Args:
        account_balance: Total balance in mana
        market_probability: Manifold market probability
        our_estimate: Our estimated true probability
        kelly_fraction: Fraction of Kelly to use (0.1 = 1/10, more conservative)
        max_size: Hard cap on position size (optional)
    
    Returns:
        Position size in mana (integer)
    
    Examples:
        balance=1000, market=0.40, our=0.50, kelly_fraction=0.1
        edge = 0.50 - 0.40 = 0.10
        kelly = 2 * 0.10 - 1 = 0.20 (20% of bankroll)
        fractional = 0.20 * 0.1 = 0.02 (2% of bankroll)
        size = 1000 * 0.02 = 20 mana
    """
    
    # Calculate edge
    edge = our_estimate - market_probability
    
    # No positive edge if edge <= 0
    if edge <= 0:
        logger.debug(f"No edge: market={market_probability:.1%}, our={our_estimate:.1%}")
        return 0
    
    # Practical binary approximation for this bot: size grows with edge.
    kelly = 2 * edge
    
    # Shouldn't happen if edge > 0, but safety check
    if kelly <= 0:
        logger.warning(f"Negative Kelly for edge={edge:.1%}")
        return 0
    
    # Apply fractional Kelly (be more conservative)
    fractional_kelly = kelly * kelly_fraction
    
    # Calculate size
    size = int(account_balance * fractional_kelly)
    
    # Apply hard cap
    if max_size is not None:
        size = min(size, max_size)
    
    logger.debug(
        f"Kelly sizing: balance={account_balance}, market={market_probability:.1%}, "
        f"our={our_estimate:.1%}, edge={edge:.1%}, kelly={kelly:.1%}, "
        f"fractional={fractional_kelly:.2%}, size={size}"
    )
    
    return size


def calculate_kelly_fraction(
    market_probability: float,
    our_estimate: float,
    confidence: float = 1.0,
    slippage_penalty: float = 0.0,
) -> float:
    """Calculate raw Kelly fraction for binary prediction market exposure.

    Uses odds implied by current quote, then applies confidence and slippage penalty.
    """
    q = max(1e-6, min(1 - 1e-6, float(market_probability)))
    p = max(1e-6, min(1 - 1e-6, float(our_estimate)))

    # Decimal net odds for YES share at price q: b = (1 - q) / q.
    b = (1 - q) / q
    raw = (b * p - (1 - p)) / b

    conf = max(0.0, min(1.0, confidence))
    adjusted = raw * conf
    adjusted = adjusted - max(0.0, slippage_penalty)

    return max(0.0, adjusted)


class RiskManager:
    """Manage risk limits and position constraints."""
    
    def __init__(
        self,
        balance: float,
        max_position_size: int = 500,
        max_invested: int = 5000,
        max_daily_loss: int = 2000,
        max_drawdown_percent: float = 0.15,  # 15%
        kelly_fraction: float = 0.1,  # 1/10 Kelly
    ):
        """
        Initialize risk manager.
        
        Args:
            balance: Current balance in mana
            max_position_size: Hard cap on single position (mana)
            max_invested: Hard cap on total invested across all positions
            max_daily_loss: Stop trading if daily loss exceeds this
            max_drawdown_percent: Max drawdown before circuit breaker (0.15 = 15%)
            kelly_fraction: Fraction of Kelly to use for sizing
        """
        self.balance = balance
        self.max_position_size = max_position_size
        self.max_invested = max_invested
        self.max_daily_loss = max_daily_loss
        self.max_drawdown_percent = max_drawdown_percent
        self.kelly_fraction = kelly_fraction
        
        self.peak_balance = balance  # Track peak for drawdown
        self.daily_loss = 0.0  # Track daily P&L
    
    def calculate_position_size(
        self,
        market_probability: float,
        our_estimate: float,
        current_invested: int = 0,
        confidence: float = 1.0,
        slippage_penalty: float = 0.0,
    ) -> int:
        """
        Calculate position size respecting all risk limits.
        
        Args:
            market_probability: Market probability (0.0 to 1.0)
            our_estimate: Our estimate of true probability
            current_invested: Current total invested (for max_invested check)
        
        Returns:
            Safe position size in mana
        """
        
        # 1. Calculate Kelly fraction then convert to position size.
        kelly_fraction_raw = calculate_kelly_fraction(
            market_probability,
            our_estimate,
            confidence=confidence,
            slippage_penalty=slippage_penalty,
        )
        kelly_size = int(self.balance * (kelly_fraction_raw * self.kelly_fraction))
        
        if kelly_size == 0:
            return 0
        
        # 2. Apply hard limits
        size = kelly_size
        size = min(size, self.max_position_size)  # Max per position
        
        # 3. Check invested limit
        room_in_portfolio = self.max_invested - current_invested
        if room_in_portfolio <= 0:
            logger.warning("Max invested limit reached")
            return 0
        
        size = min(size, room_in_portfolio)

        logger.debug(
            "Kelly sizing: q=%.3f estimate=%.3f conf=%.2f slip=%.4f raw=%.4f frac=%.4f size=%s",
            market_probability,
            our_estimate,
            confidence,
            slippage_penalty,
            kelly_fraction_raw,
            self.kelly_fraction,
            size,
        )
        
        return max(1, size)  # At least 1 mana
    
    def check_circuit_breaker(self) -> bool:
        """
        Check if circuit breaker triggered.
        
        Returns:
            False if trading should stop, True if OK to continue
        """
        
        # Check daily loss limit
        if self.daily_loss < -self.max_daily_loss:
            logger.error(f"Daily loss limit triggered: {self.daily_loss:.0f} < -{self.max_daily_loss}")
            return False
        
        # Check drawdown limit only when we have valid positive balance state.
        if self.balance <= 0:
            logger.warning("Skipping drawdown check because balance is non-positive")
            return True
        if self.peak_balance <= 0:
            self.peak_balance = self.balance
        drawdown = 1 - (self.balance / self.peak_balance)
        if drawdown > self.max_drawdown_percent:
            logger.error(
                f"Max drawdown triggered: {drawdown:.1%} > {self.max_drawdown_percent:.1%}"
            )
            return False
        
        return True
    
    def update_balance(self, new_balance: float, position_pnl: Optional[float] = None):
        """
        Update manager state after trade/balance change.
        
        Args:
            new_balance: New account balance
            position_pnl: P&L from recent position (for daily P&L tracking)
        """
        self.balance = new_balance
        
        # Update peak
        if new_balance > self.peak_balance:
            self.peak_balance = new_balance
        
        # Update daily P&L
        if position_pnl is not None:
            self.daily_loss += position_pnl
    
    def reset_daily_loss(self):
        """Reset daily P&L counter (typically at midnight)."""
        self.daily_loss = 0.0
        logger.info("Reset daily loss counter")


# Configuration for different trading profiles
CONSERVATIVE_CONFIG = {
    "max_position_size": 200,      # Small positions
    "max_invested": 1000,           # Limited portfolio
    "max_daily_loss": 500,          # Stop early on losses
    "max_drawdown_percent": 0.10,   # 10% drawdown max
    "kelly_fraction": 0.05,         # Ultra-conservative Kelly (1/20)
}

MODERATE_CONFIG = {
    "max_position_size": 500,       # Medium positions
    "max_invested": 5000,           # Reasonable portfolio
    "max_daily_loss": 2000,         # Allow more losses
    "max_drawdown_percent": 0.15,   # 15% drawdown max
    "kelly_fraction": 0.10,         # Conservative Kelly (1/10)
}

AGGRESSIVE_CONFIG = {
    "max_position_size": 1000,      # Large positions
    "max_invested": 10000,          # Large portfolio
    "max_daily_loss": 5000,         # Allow large losses
    "max_drawdown_percent": 0.25,   # 25% drawdown max
    "kelly_fraction": 0.20,         # Moderate Kelly (1/5)
}


def create_risk_manager_from_profile(
    balance: float,
    profile: str = "moderate"
) -> RiskManager:
    """
    Create risk manager from preset profile.
    
    Args:
        balance: Current balance
        profile: "conservative", "moderate", or "aggressive"
    
    Returns:
        Configured RiskManager
    """
    
    configs = {
        "conservative": CONSERVATIVE_CONFIG,
        "moderate": MODERATE_CONFIG,
        "aggressive": AGGRESSIVE_CONFIG,
    }
    
    config = configs.get(profile, MODERATE_CONFIG)
    return RiskManager(balance, **config)
