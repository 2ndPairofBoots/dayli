# Implementation Guide - Detailed Code Structure

## Project Layout (Based on Best Practices)

```
dayli/
├── backend/
│   ├── src/
│   │   ├── api/
│   │   │   ├── __init__.py
│   │   │   ├── client.py              # ManifoldClient - async REST client
│   │   │   ├── models.py              # Domain models (Market, Bet, User, etc)
│   │   │   └── schemas.py             # Pydantic schemas for validation
│   │   │
│   │   ├── strategies/
│   │   │   ├── __init__.py
│   │   │   ├── base_strategy.py       # BaseTradingStrategy interface
│   │   │   ├── simple_strategy.py     # Basic qualifier-only strategy
│   │   │   ├── ensemble_strategy.py   # 3-signal ensemble
│   │   │   └── housekeeping_strategy.py # Maintenance tasks
│   │   │
│   │   ├── qualifiers/
│   │   │   ├── __init__.py
│   │   │   ├── base_qualifier.py      # Base class
│   │   │   ├── market_filters.py      # Market type, volume, liquidity checks
│   │   │   ├── risk_qualifiers.py     # Position limits, correlation checks
│   │   │   └── custom_qualifiers.py   # Strategy-specific checks
│   │   │
│   │   ├── portfolio/
│   │   │   ├── __init__.py
│   │   │   ├── position.py            # Position dataclass
│   │   │   ├── manager.py             # Portfolio tracking & P&L
│   │   │   └── metrics.py             # Sharpe, drawdown, win rate calculations
│   │   │
│   │   ├── risk/
│   │   │   ├── __init__.py
│   │   │   ├── kelly.py               # Kelly Criterion & Fractional Kelly
│   │   │   └── limits.py              # Hard caps, circuit breakers
│   │   │
│   │   ├── logger/
│   │   │   ├── __init__.py
│   │   │   ├── events.py              # Event dataclasses
│   │   │   └── csv_logger.py          # CSV event logging
│   │   │
│   │   ├── core.py                    # Main event loop
│   │   ├── config.py                  # Configuration loading
│   │   └── main.py                    # Entry point
│   │
│   ├── tests/
│   │   ├── unit/
│   │   │   ├── test_api_client.py
│   │   │   ├── test_models.py
│   │   │   ├── test_kelly.py
│   │   │   └── test_strategies.py
│   │   ├── integration/
│   │   │   ├── test_event_loop.py
│   │   │   └── test_paper_trading.py
│   │   └── fixtures/
│   │       ├── mock_markets.py
│   │       └── mock_responses.py
│   │
│   ├── requirements.txt
│   ├── main.py                        # Startup script
│   └── README.md
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Dashboard.jsx          # Main layout
│   │   │   ├── MetricsPanel.jsx       # Balance, P&L, win rate
│   │   │   ├── ChartsPanel.jsx        # Time-series P&L
│   │   │   ├── PortfolioPanel.jsx     # Positions by strategy
│   │   │   ├── MarketsPanel.jsx       # Market browser
│   │   │   ├── SuggestionsPanel.jsx   # AI suggestions
│   │   │   └── ConfigPanel.jsx        # Settings
│   │   │
│   │   ├── hooks/
│   │   │   ├── useMetrics.js          # Fetch metrics
│   │   │   ├── usePortfolio.js        # Fetch positions
│   │   │   └── useWebSocket.js        # Live updates
│   │   │
│   │   ├── services/
│   │   │   ├── api.js                 # API client wrapper
│   │   │   └── store.js               # Zustand state management
│   │   │
│   │   ├── App.jsx
│   │   └── index.jsx
│   │
│   ├── public/
│   ├── package.json
│   └── vite.config.js
│
├── logs/                              # Created at runtime
│   ├── bets/
│   ├── positions/
│   ├── errors/
│   ├── strategies/
│   └── portfolio/
│
├── config/
│   ├── api_config.py                  # API endpoint configuration
│   ├── trading_config.py              # Strategy & risk parameters
│   ├── housekeeping_config.py         # Maintenance rules
│   ├── example.env
│   ├── requirements.txt
│   └── package.json
│
├── docs/
│   ├── ARCHITECTURE.md
│   ├── API_REFERENCE.md
│   ├── RESEARCH_BEST_PRACTICES.md
│   ├── SETUP.md
│   ├── KELLY_CRITERION.md             # Deep dive on sizing
│   └── DEPLOYMENT.md
│
├── .instructions.md
├── .gitignore
└── README.md
```

## Core Components - Code Patterns

### 1. API Client (src/api/client.py)

```python
# Minimal implementation pattern
class ManifoldClient:
    def __init__(self, api_key: str, base_url: str = "https://api.manifold.markets"):
        self.api_key = api_key
        self.base_url = base_url
        self.session = None
        self.cache = {}  # {endpoint: (data, timestamp)}
        self.cache_ttl = {}  # {endpoint: ttl_seconds}
    
    async def _ensure_session(self):
        if self.session is None:
            self.session = aiohttp.ClientSession(
                headers={"Authorization": f"Bearer {self.api_key}"}
            )
        return self.session
    
    async def _make_request(self, method: str, endpoint: str, **kwargs):
        """
        Handles GET/POST with retries, timeout, and caching.
        
        Retry pattern:
        - Max 3 retries
        - Exponential backoff: 2^retry seconds
        - On 429: Wait longer (backoff)
        - On 5xx: Retry
        - On 4xx (not 429): Fail immediately
        """
        retry_count = 0
        max_retries = 3
        
        while retry_count < max_retries:
            try:
                session = await self._ensure_session()
                async with session.request(
                    method,
                    f"{self.base_url}{endpoint}",
                    timeout=aiohttp.ClientTimeout(total=10),
                    **kwargs
                ) as response:
                    if response.status == 429:
                        # Rate limited - exponential backoff
                        wait_time = 2 ** (retry_count + 1)
                        logging.warning(f"Rate limited. Waiting {wait_time}s")
                        await asyncio.sleep(wait_time)
                        retry_count += 1
                        continue
                    
                    response.raise_for_status()
                    data = await response.json()
                    return [Market.from_dict(m) for m in data]  # Type conversion
            
            except aiohttp.ClientError as e:
                retry_count += 1
                if retry_count >= max_retries:
                    raise
                await asyncio.sleep(2 ** retry_count)
    
    async def get_markets(self, limit: int = 100, offset: int = 0) -> List[Market]:
        """List all markets with pagination."""
        return await self._make_request("GET", "/api/v0/markets", 
                                       params={"limit": limit, "offset": offset})
    
    async def place_bet(self, market_id: str, outcome: str, amount: int) -> Bet:
        """Place a standard bet."""
        response = await self._make_request("POST", "/api/v0/bet",
                                          json={"contractId": market_id, 
                                               "outcome": outcome,
                                               "amount": amount})
        return Bet.from_dict(response)
```

### 2. Domain Models (src/api/models.py)

```python
from dataclasses import dataclass
from datetime import datetime
from typing import Dict, List, Optional

class BaseModel:
    """Base class for all Manifold models.
    
    Handles:
    - camelCase → snake_case conversion
    - DateTime parsing
    - Unknown field logging (schema drift detection)
    """
    
    @classmethod
    def from_dict(cls, data: dict):
        """Convert API JSON to typed object."""
        # Convert camelCase keys to snake_case
        converted = {}
        for key, value in data.items():
            snake_key = camel_to_snake(key)
            converted[snake_key] = value
        
        # Parse datetime fields
        for field in getattr(cls, '__datetime_fields__', []):
            if field in converted:
                converted[field] = datetime.fromisoformat(converted[field])
        
        # Log unexpected keys for schema drift detection
        expected = set(cls.__annotations__.keys())
        actual = set(converted.keys())
        if unexpected := actual - expected:
            logger.warning(f"Unexpected fields in {cls.__name__}: {unexpected}")
        
        return cls(**{k: v for k, v in converted.items() if k in expected})

@dataclass
class Market(BaseModel):
    """Manifold Market entity."""
    __datetime_fields__ = ['created_time', 'close_time']
    
    id: str
    question: str
    outcomes: List[str]  # YES/NO or multiple outcomes
    probability: Dict[str, float]  # {outcome: float}
    liquidity: float  # Total liquidity
    volume: float   # Total bet volume
    created_time: Optional[datetime] = None
    close_time: Optional[datetime] = None
    
    def get_answer_probability(self, outcome: str) -> float:
        """Get probability for specific outcome."""
        return self.probability.get(outcome, 0.0)
    
    def get_answer_liquidity(self, outcome: str) -> float:
        """Estimate liquidity for specific outcome."""
        # Simplified - distribute total liquidity proportionally
        return self.liquidity / len(self.outcomes)

@dataclass
class Bet(BaseModel):
    """User's bet on a market."""
    __datetime_fields__ = ['timestamp']
    
    id: str
    market_id: str
    outcome: str
    shares: int
    amount_bet: float
    execution_price: float
    timestamp: Optional[datetime] = None
    status: str = "executed"  # executed, pending, failed

@dataclass
class ProposedBet:
    """Proposed bet before execution (includes validation)."""
    market_id: str
    outcome: str
    size: int  # Amount to bet
    confidence: float  # 0.0 to 1.0
    reason: str  # Why we're betting
    
    def validate(self, kelly_size: int) -> bool:
        """Check size against Kelly Criterion."""
        return self.size <= kelly_size
```

### 3. Strategy Framework (src/strategies/base_strategy.py)

```python
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import List, Optional

@dataclass
class StrategyResult:
    """Result of strategy evaluation."""
    proposed_bets: List[ProposedBet] = None
    log_event: Optional[str] = None

class BaseTradingStrategy(ABC):
    """Base class for all trading strategies.
    
    Subclasses implement:
    1. propose_bet() - Core strategy logic
    2. Optional: Custom qualifiers
    """
    
    def __init__(self, name: str, client: ManifoldClient, config: dict):
        self.name = name
        self.client = client
        self.config = config
    
    async def evaluate_and_propose(self, market: Market) -> StrategyResult:
        """Run qualifiers, then call propose_bet()."""
        
        # Run base qualifiers (liquidity, volume, etc)
        for qualifier in self.base_qualifiers():
            result = await qualifier.evaluate(market, self.client)
            if not result.passed:
                return StrategyResult(log_event=f"{self.name}: disqualified - {result.reason}")
        
        # Run custom qualifiers
        for qualifier in self.custom_qualifiers():
            result = await qualifier.evaluate(market, self.client)
            if not result.passed:
                return StrategyResult(log_event=f"{self.name}: disqualified - {result.reason}")
        
        # Call strategy-specific proposal logic
        proposed = await self.propose_bet(market)
        if proposed:
            return StrategyResult(proposed_bets=[proposed])
        else:
            return StrategyResult(log_event=f"{self.name}: no edge above threshold")
    
    @abstractmethod
    async def propose_bet(self, market: Market) -> Optional[ProposedBet]:
        """Strategy-specific betting logic.
        
        Return ProposedBet if we want to trade, None otherwise.
        """
        pass
    
    def base_qualifiers(self) -> List[BaseQualifier]:
        """Reusable checks all strategies use."""
        return [
            LiquidityQualifier(min_liquidity=100),
            VolumeQualifier(min_volume=500),
            TimeQualifier(min_days_open=1),
        ]
    
    def custom_qualifiers(self) -> List[BaseQualifier]:
        """Strategy-specific checks (override in subclass)."""
        return []

class SimpleStrategy(BaseTradingStrategy):
    """Example: Basic qualifier-only strategy."""
    
    async def propose_bet(self, market: Market) -> Optional[ProposedBet]:
        # Simple heuristic: if YES is underpriced vs 50/50, bet on it
        yes_prob = market.get_answer_probability("YES")
        
        if yes_prob < 0.40:  # Appears underpriced
            return ProposedBet(
                market_id=market.id,
                outcome="YES",
                size=100,  # Will be scaled by Kelly
                confidence=0.60,
                reason="YES underpriced"
            )
        return None
```

### 4. Kelly Criterion Sizing (src/risk/kelly.py)

```python
def calculate_kelly_size(
    account_balance: float,
    market_probability: float,
    edge: float,
    kelly_fraction: float = 0.1  # Fractional Kelly (0.1 = 1/10)
) -> float:
    """
    Calculate position size using Kelly Criterion.
    
    Kelly = (2p - 1) / 1  where p = edge probability
    Fractional Kelly = Kelly / N (typically N = 10 to 25)
    
    Returns: Size in mana to bet
    """
    
    if edge <= 0 or edge >= 1:
        return 0  # No edge
    
    # Kelly formula: (probability * odds - (1 - probability)) / odds
    # For binary: (2 * edge - 1)
    kelly_percentage = 2 * edge - 1
    
    if kelly_percentage <= 0:
        return 0  # Negative Kelly (avoid)
    
    # Apply fractional Kelly
    fractional_kelly = kelly_percentage * kelly_fraction
    
    # Size = balance * fractional kelly
    return int(account_balance * fractional_kelly)

# Example usage:
# Balance: $1000
# Market prob (market says): 40% YES
# Our estimate: 50% YES
# Edge = 50% - 40% = 10%
kelly_size = calculate_kelly_size(1000, 0.40, 0.10)
# Result: ~10 mana (1000 * 0.1 * 0.1)
```

### 5. Event Loop (src/core.py)

```python
class Core:
    """Main event loop - polls markets and executes strategies."""
    
    def __init__(self, client: ManifoldClient, strategies: List[BaseTradingStrategy]):
        self.client = client
        self.strategies = strategies
        self.portfolio = PortfolioManager()
        self.logger = CSVLogger()
    
    async def run(self, poll_interval: int = 60):
        """
        Main loop:
        1. Fetch new markets
        2. Evaluate all strategies
        3. Place bets
        4. Update portfolio
        5. Log events
        """
        while True:
            try:
                # Fetch markets
                markets = await self.client.get_markets(limit=1000)
                logger.info(f"Fetched {len(markets)} markets")
                
                # Evaluate strategies concurrently
                tasks = [
                    self._evaluate_market(market, strategy)
                    for market in markets
                    for strategy in self.strategies
                ]
                results = await asyncio.gather(*tasks, return_exceptions=True)
                
                # Execute bets
                for result in results:
                    if isinstance(result, ProposedBet):
                        await self._place_bet(result)
                
                # Update portfolio metrics
                self.portfolio.refresh()
                
                # Wait before next poll
                await asyncio.sleep(poll_interval)
            
            except Exception as e:
                logger.error(f"Error in main loop: {e}")
                await asyncio.sleep(poll_interval)
    
    async def _evaluate_market(self, market: Market, strategy: BaseTradingStrategy):
        """Evaluate one market with one strategy."""
        result = await strategy.evaluate_and_propose(market)
        if result.proposed_bets:
            return result.proposed_bets[0]  # Return first proposal
        return None
    
    async def _place_bet(self, proposed: ProposedBet):
        """Place bet with error handling and logging."""
        try:
            # Apply risk limits
            final_size = min(proposed.size, self._get_kelly_limit())
            
            bet = await self.client.place_bet(
                proposed.market_id,
                proposed.outcome,
                final_size
            )
            
            # Log success
            self.logger.log_place_bet_event(bet, proposed.reason)
        
        except Exception as e:
            self.logger.log_error_event(f"Failed to place bet: {e}")
```

## File-by-File Checklist

### Essential Files (MVP)
- [ ] `backend/src/api/client.py` - API client with retries
- [ ] `backend/src/api/models.py` - Typed domain objects
- [ ] `backend/src/strategies/base_strategy.py` - Strategy interface
- [ ] `backend/src/portfolio/manager.py` - Position tracking
- [ ] `backend/src/risk/kelly.py` - Position sizing
- [ ] `backend/src/core.py` - Main event loop
- [ ] `backend/src/logger/csv_logger.py` - Event logging
- [ ] `backend/main.py` - Entry point
- [ ] `backend/requirements.txt` - Dependencies

### Optional but Recommended
- [ ] `backend/src/qualifiers/` - Reusable qualifier checks
- [ ] `frontend/` - Dashboard UI
- [ ] `backend/src/logger/events.py` - Typed event definitions

### Testing
- [ ] `backend/tests/unit/test_kelly.py` - Unit tests
- [ ] `backend/tests/integration/test_event_loop.py` - Integration tests
- [ ] `backend/tests/fixtures/mock_responses.py` - Mock data

## Quick Start Command Sequence

```bash
# 1. Clone and enter
cd dayli/backend

# 2. Setup Python environment
python -m venv venv
source venv/bin/activate  # or `venv\Scripts\activate` on Windows

# 3. Install dependencies
pip install -r requirements.txt

# 4. Configure API key
cp config/example.env .env
# Edit .env with your MANIFOLD_API_KEY

# 5. Run
python main.py
```

## Next Steps

1. **Start with API client** - Get models loading, test caching/retries
2. **Add simple strategy** - Just qualifier pipeline, no ML
3. **Build event loop** - Polling every 60s
4. **Add Kelly Criterion** - Position sizing
5. **Implement CSV logging** - Understand what's happening
6. **Paper trading** - Simulate for 1-2 weeks
7. **Add dashboard** - Real-time metrics
8. **Go live** - Small position sizes first
