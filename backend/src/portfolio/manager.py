"""
Portfolio manager for tracking positions and P&L.
"""

import logging
from typing import Dict, List, Optional
from datetime import datetime

from api.models import Position, PortfolioMetrics

logger = logging.getLogger(__name__)


class PortfolioManager:
    """Manages open positions and portfolio metrics."""
    
    def __init__(self, initial_balance: float = 0.0):
        """
        Initialize portfolio.
        
        Args:
            initial_balance: Starting balance in mana
        """
        self.balance = initial_balance
        self.positions: Dict[str, Position] = {}  # {market_id: Position}
        self.total_invested = 0.0
        self.total_pnl = 0.0
        self.category_exposure: Dict[str, float] = {}
        self.total_fees_paid = 0.0
        self.total_slippage_paid = 0.0
        self.trades_count = 0
    
    def add_position(
        self,
        market_id: str,
        market_question: str,
        outcome: str,
        shares: float,
        price: float,  # Cost per share
        category: str = "uncategorized",
        fee_paid: float = 0.0,
        slippage_paid: float = 0.0,
    ) -> Position:
        """
        Add/update position in portfolio.
        
        Args:
            market_id: Market ID
            market_question: Market question (for reference)
            outcome: Outcome bet on
            shares: Number of shares
            price: Cost per share
        
        Returns:
            Created Position object
        """
        
        # Create or update position
        if market_id in self.positions:
            pos = self.positions[market_id]
            # Update average cost
            total_cost = pos.cost_basis + (shares * price)
            total_shares = pos.shares + shares
            pos.avg_cost = total_cost / total_shares if total_shares > 0 else price
            pos.shares = total_shares
        else:
            pos = Position(
                market_id=market_id,
                market_question=market_question,
                outcome=outcome,
                shares=shares,
                avg_cost=price,
                current_price=price
            )
            self.positions[market_id] = pos
        
        logger.info(f"Position updated: {market_id} {outcome} {pos.shares}sh @ {pos.avg_cost:.3f}")

        notional = max(0.0, shares * price)
        self.category_exposure[category] = self.category_exposure.get(category, 0.0) + notional
        self.total_fees_paid += max(0.0, fee_paid)
        self.total_slippage_paid += max(0.0, slippage_paid)
        self.trades_count += 1
        
        return pos

    def get_category_exposure_ratio(self, category: str) -> float:
        """Return category notional exposure as ratio of account balance."""
        if self.balance <= 0:
            return 0.0
        return self.category_exposure.get(category, 0.0) / self.balance

    def can_add_category_exposure(
        self,
        category: str,
        additional_notional: float,
        max_ratio: float,
    ) -> bool:
        """Check if adding notional would breach category concentration cap."""
        if self.balance <= 0:
            return False
        current = self.category_exposure.get(category, 0.0)
        return (current + max(0.0, additional_notional)) <= (self.balance * max_ratio)
    
    def update_market_price(self, market_id: str, current_price: float):
        """
        Update market price for position (from latest market probability).
        
        Args:
            market_id: Market ID
            current_price: Current market probability
        """
        if market_id in self.positions:
            self.positions[market_id].current_price = current_price
    
    def close_position(self, market_id: str, sell_price: float) -> Optional[float]:
        """
        Close a position and record P&L.
        
        Args:
            market_id: Market ID
            sell_price: Price at which we're selling
        
        Returns:
            Realized P&L or None if position doesn't exist
        """
        if market_id not in self.positions:
            logger.warning(f"Position not found: {market_id}")
            return None
        
        pos = self.positions.pop(market_id)
        realized_pnl = pos.shares * (sell_price - pos.avg_cost)
        self.total_pnl += realized_pnl
        
        logger.info(
            f"Position closed: {pos.market_id} {pos.outcome} "
            f"{pos.shares}sh, P&L: {realized_pnl:+.2f}"
        )
        
        return realized_pnl
    
    def get_unrealized_pnl(self) -> float:
        """
        Get total unrealized P&L across all positions.
        
        Returns:
            Total unrealized P&L
        """
        return sum(pos.unrealized_pnl for pos in self.positions.values())
    
    def get_total_pnl(self) -> float:
        """
        Get total P&L (realized + unrealized).
        
        Returns:
            Total P&L
        """
        return self.total_pnl + self.get_unrealized_pnl()
    
    def get_total_invested(self) -> float:
        """
        Get total amount invested in open positions.
        
        Returns:
            Total invested (cost basis)
        """
        return sum(pos.cost_basis for pos in self.positions.values())
    
    def get_metrics(self) -> PortfolioMetrics:
        """
        Get current portfolio metrics.
        
        Returns:
            PortfolioMetrics object
        """
        total_pnl = self.get_total_pnl()
        profit_percent = (total_pnl / self.balance * 100) if self.balance > 0 else 0.0
        
        return PortfolioMetrics(
            balance=self.balance,
            invested=self.get_total_invested(),
            profit=total_pnl,
            profit_percent=profit_percent
        )
    
    def get_win_rate(self) -> float:
        """
        Get realized win rate (winning trades / total trades).
        Currently unavailable unless we track all historical trades.
        
        Returns:
            Win rate (0.0 to 1.0), or 0.0 if no closed positions
        """
        # This would need to be tracked separately
        return 0.0
    
    def to_dict(self) -> dict:
        """
        Convert portfolio to dictionary (for logging/persistence).
        
        Returns:
            Portfolio as dictionary
        """
        return {
            "balance": self.balance,
            "positions": {
                market_id: {
                    "outcome": pos.outcome,
                    "shares": pos.shares,
                    "avg_cost": pos.avg_cost,
                    "current_price": pos.current_price,
                    "cost_basis": pos.cost_basis,
                    "current_value": pos.current_value,
                    "unrealized_pnl": pos.unrealized_pnl,
                }
                for market_id, pos in self.positions.items()
            },
            "total_invested": self.get_total_invested(),
            "total_pnl": self.total_pnl,
            "total_pnl_with_unrealized": self.get_total_pnl(),
            "category_exposure": self.category_exposure,
            "total_fees_paid": self.total_fees_paid,
            "total_slippage_paid": self.total_slippage_paid,
            "trades_count": self.trades_count,
        }
    
    def __repr__(self) -> str:
        """String representation of portfolio."""
        metrics = self.get_metrics()
        return (
            f"Portfolio(balance={metrics.balance:.0f}, "
            f"invested={metrics.invested:.0f}, "
            f"pnl={metrics.profit:+.0f} ({metrics.profit_percent:+.1f}%), "
            f"positions={len(self.positions)})"
        )
