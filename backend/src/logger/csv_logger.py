"""
CSV event logging for Dayli trading bot.

Writes events to CSV files organized by domain (bets, errors, strategies, portfolio).
"""

import csv
import os
import logging
from datetime import datetime
from typing import List
from pathlib import Path

from api.models import PlaceBetEvent, ErrorEvent, StrategyEvent, PortfolioEvent

logger = logging.getLogger(__name__)


class CSVLogger:
    """Log bot events to CSV files for analysis and debugging."""
    
    HEADERS = {
        "bets": ["timestamp", "market_id", "market_question", "outcome", "size", 
                 "probability", "strategy", "reason", "actual_cost"],
        "errors": ["timestamp", "error_type", "message", "traceback"],
        "strategies": ["timestamp", "strategy", "market_id", "market_question", 
                       "decision", "confidence", "latency_ms"],
        "portfolio": ["timestamp", "balance", "invested", "pnl", "win_rate"],
    }
    
    def __init__(self, log_dir: str = "logs"):
        """
        Initialize CSV logger.
        
        Args:
            log_dir: Root directory for logs (creates subfolders per domain)
        """
        self.log_dir = Path(log_dir)
        self.log_dir.mkdir(exist_ok=True)
        
        # Create domain subfolders
        for domain in self.HEADERS.keys():
            (self.log_dir / domain).mkdir(exist_ok=True)
        
        # File handles and writers (lazy-loaded)
        self._writers = {}
        self._files = {}
    
    def _get_writer(self, domain: str, event_type: str):
        """Get or create CSV writer for event type."""
        key = f"{domain}/{event_type}"
        
        if key in self._writers:
            return self._writers[key]
        
        # Create file path
        file_path = self.log_dir / domain / f"{event_type}.csv"
        
        # Check if file exists (for writing headers)
        file_exists = file_path.exists()
        
        # Open file
        file_obj = open(file_path, 'a', newline='', encoding='utf-8')
        self._files[key] = file_obj
        
        # Create writer
        writer = csv.writer(file_obj)
        
        # Write header if new file
        if not file_exists and domain in self.HEADERS:
            writer.writerow(self.HEADERS[domain])
            logger.debug(f"Created log file: {file_path}")
        
        self._writers[key] = writer
        return writer
    
    def log_place_bet(self, event: PlaceBetEvent):
        """Log placed bet event."""
        writer = self._get_writer("bets", "place_bet_event")
        writer.writerow(event.to_csv())
        self._files["bets/place_bet_event"].flush()
        logger.debug(f"Logged bet: {event.market_id}")
    
    def log_error(self, event: ErrorEvent):
        """Log error event."""
        writer = self._get_writer("errors", "error_event")
        writer.writerow(event.to_csv())
        self._files["errors/error_event"].flush()
        logger.debug(f"Logged error: {event.error_type}")
    
    def log_strategy(self, event: StrategyEvent):
        """Log strategy evaluation event."""
        writer = self._get_writer("strategies", "strategy_event")
        writer.writerow(event.to_csv())
        self._files["strategies/strategy_event"].flush()
    
    def log_portfolio(self, event: PortfolioEvent):
        """Log portfolio snapshot event."""
        writer = self._get_writer("portfolio", "portfolio_event")
        writer.writerow(event.to_csv())
        self._files["portfolio/portfolio_event"].flush()
    
    def close(self):
        """Close all file handles."""
        for file_obj in self._files.values():
            file_obj.close()
        logger.info("Closed all log files")
    
    def __del__(self):
        """Cleanup on deletion."""
        self.close()


if __name__ == "__main__":
    # Test logging
    logging.basicConfig(level=logging.INFO)
    
    logger_obj = CSVLogger()
    
    # Test bet event
    bet_event = PlaceBetEvent(
        timestamp=datetime.now(),
        market_id="test-market-1",
        market_question="Will AI be AGI by 2030?",
        outcome="YES",
        size=100,
        probability=0.65,
        strategy_name="SimpleStrategy",
        reason="YES appears underpriced",
        actual_cost=65.0
    )
    logger_obj.log_place_bet(bet_event)
    
    # Test error event
    error_event = ErrorEvent(
        timestamp=datetime.now(),
        error_type="APIError",
        message="Failed to place bet: Rate limited",
        traceback="Traceback..."
    )
    logger_obj.log_error(error_event)
    
    # Test portfolio event
    portfolio_event = PortfolioEvent(
        timestamp=datetime.now(),
        balance=1000.0,
        invested=500.0,
        p_and_l=50.0,
        win_rate=0.55
    )
    logger_obj.log_portfolio(portfolio_event)
    
    logger_obj.close()
    print("✓ Logging test passed")
