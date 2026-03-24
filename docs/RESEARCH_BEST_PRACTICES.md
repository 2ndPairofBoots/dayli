# Manifold Markets Bot Research & Best Practices

## Overview

Based on research of 5+ successful production trading bot implementations on GitHub, this document outlines proven patterns and best practices for building Manifold Markets trading bots.

## Key Bot Implementations Analyzed

### 1. Sketchy Bot Framework (sketchy-manifold)
**Architecture**: Pipeline-based strategy evaluation
- **API Client**: Unified async client for REST + WebSocket
- **Models**: Typed dataclasses with BaseModel inheritance
- **Strategies**: BaseTradingStrategy with qualifier pipeline
- **Core Loop**: WebSocket event-driven + market fetching
- **Logging**: Domain-based CSV event logging

### 2. Better Manifold Bot (sachin-detrax) - Most Complete
**Architecture**: Ensemble decision-making system
- **Signals**: 3-signal ensemble (Historical 25%, Microstructure 15%, OpenAI 60%)
- **Strategy**: Structured forecasting with self-consistency checks
- **Risk Management**: Kelly Criterion based position sizing
- **Backend**: REST polling (30-60s intervals not WebSocket)
- **Documentation**: Extensive and well-maintained

### 3. Manifold LLM Bot (ksadov)
**Architecture**: Multi-LLM with optimization
- **LLM Support**: OpenAI, Anthropic, llama.cpp backends
- **Optimization**: DSPy for prompt engineering
- **Backtesting**: Complete framework with historical data
- **File Pattern**: `src/scripts/trade.py`, LLM config files

### 4. TalOS Manifold Bot (rodriguezramirezederdominic-web)
**Architecture**: Agentic with risk optimization
- **Decision Engine**: brain.py (GPT-4 analysis)
- **Risk Management**: Fractional Kelly Criterion (0.25x conservative)
- **Pattern**: Demonstrates fractional Kelly reduces volatility

### 5. Manifold Markets Trading Bot (blackXmask)
**Architecture**: Interactive UI with portfolio tools
- **Frontend**: Streamlit 9-tab GUI
- **Analysis**: GPT-5 integration for market analysis
- **Portfolio**: Optimization & arbitrage detection
- **File Structure**: `bot/api_client.py`, `bot/portfolio.py`

## Architecture Patterns

### Pattern 1: Async API Client
```
ManifoldClient
├── REST Methods (GET /markets, POST /bets, etc.)
├── WebSocket Connection (market updates, bet confirmations)
├── Automatic Retries (exponential backoff)
├── TTL Cache (reduce API calls)
├── Type Mapping (raw JSON → typed objects)
└── Error Handling (categorize and log)
```

**Implementation Details**:
- Use `aiohttp` for async HTTP
- Use `websockets` for WebSocket connections
- Cache responses with TTL per endpoint
- Implement exponential backoff on 429 (rate limit)
- Convert camelCase JSON → snake_case Python

### Pattern 2: Typed Domain Models
```
BaseModel (custom class)
├── from_dict() - constructor from API JSON
├── camelCase → snake_case conversion
├── DateTime field parsing
├── Model classes:
│   ├── Market
│   │   ├── id, question, outcomes
│   │   ├── probability (dict by outcome)
│   │   ├── liquidity, volume
│   │   └── Helper: get_answer_probability()
│   ├── Bet
│   │   ├── id, market_id, outcome, shares
│   │   └── timestamp, status (executed/pending/failed)
│   ├── User (full profile)
│   ├── LiteUser (id, name, avatar only)
│   └── ProposedBet (with validation against BetConfig)
```

**Key Learning**: Manifold JSON frequently changes; breaking on unknown fields is a feature, not a bug.

### Pattern 3: Strategy Framework
```
BaseTradingStrategy
├── evaluate_and_propose()
│   ├── Run qualifiers (async)
│   ├── Call propose_bet()
│   └── Return StrategyResult
├── Qualifiers (reusable PASS/FAIL checks)
│   ├── Market type check
│   ├── Bot/creator restrictions
│   ├── Liquidity threshold
│   ├── Opt-out checks
│   └── Custom qualifiers per strategy
└── Return: ProposedBet or LogEvent

Concrete Strategies
├── LongTermValueStrategy (fundamental analysis)
├── ArbitrageStrategy (cross-market)
├── EnsembleStrategy (3-signal weighted)
└── HousekeepingStrategy (maintenance only)
```

**Best Practice**: Modular qualifiers allow easy strategy composition.

### Pattern 4: Risk Management
**Kelly Criterion Approach**:
```
Bet Size = (Edge × Odds - (1 - Edge)) / Odds
Fractional Kelly = Kelly / 4 to 1 / 25 (reduces volatility)

Examples:
- Conservative: Kelly / 25 (0.04 × kelly)
- Moderate: Kelly / 10 (0.1 × kelly)  
- Aggressive: Kelly / 4 (0.25 × kelly)

Position Limits:
- Single position: 5-10% of bankroll
- Total invested: 30-50% of bankroll
- Daily loss limit: 2-5% of bankroll
```

**Hard Caps** (prevent catastrophic loss):
- Max trade size (abs amount)
- Max portfolio drawdown (circuit breaker)
- Per-market position limit
- Outcome correlation check (don't over-correlate)

### Pattern 5: Event Loop Design

**Option A: WebSocket Event-Driven** (sketchy-bot-framework)
```
Connect WebSocket → Subscribe "global/new-bet"
  ↓
Parse incoming bet messages
  ↓
Fetch market context (REST)
  ↓
Evaluate all strategies concurrently
  ↓
Merge overlapping proposals
  ↓
Place bets (REST POST)
  ↓
Log events to CSV
```

**Option B: Polling-Based** (better_manifold_bot, most implementations)
```
Check every 30-60 seconds:
  ↓
Fetch all open markets (or new markets)
  ↓
Run strategy evaluation
  ↓
Calculate position changes
  ↓
Execute bets
  ↓
Update local state
  ↓
Sleep N seconds
```

**Finding**: Most bots use polling (REST) not WebSocket
- Simpler to understand and debug
- Achieves "real-time" with 30-60s polling
- Easier to test
- Less connection maintenance

## Core Implementation Components

### 1. API Client
**Minimum methods**:
- `get_markets(limit, offset)` - List markets
- `get_market(id)` - Get specific market
- `search_markets(query)` - Search by question
- `get_user()` - Get balance and profile
- `get_portfolio()` - Get positions
- `place_bet(market_id, outcome, amount)` - Standard bet
- `place_limit_order(market_id, outcome, amount, limit_prob)` - Conditional bet
- `get_bets(market_id)` - Get market bets

**Error Handling Pattern**:
```python
async def _make_request(self, method, endpoint, **kwargs):
    retry_count = 0
    while retry_count < MAX_RETRIES:
        try:
            response = await session.request(method, ...)
            if response.status == 429:  # Rate limited
                await asyncio.sleep(2 ** retry_count)  # Exponential backoff
                retry_count += 1
                continue
            else:
                return response
        except Exception as e:
            retry_count += 1
            await asyncio.sleep(2 ** retry_count)
```

### 2. Market Data Processor
**What to cache locally**:
- Market snapshots (probability, liquidity, volume)
- Recent bets (last 10-20)
- User portfolio
- Bet status (executed/pending)

**Update frequency**:
- Markets: every poll cycle (30-60s)
- Portfolio: after every trade
- Bets: after execution

### 3. Strategy Decision Engine
**Ensemble Pattern** (most successful):
```
Signal 1: Historical Patterns (25%)
  - Track old market resolutions
  - Identify systematic mis-pricings
  - Train ML model if data available

Signal 2: Microstructure (15%)
  - Bid-ask spreads
  - Order flow analysis
  - Timestamp velocity

Signal 3: External Data / LLM (60%)
  - Current news/events
  - LLM analysis (GPT-4, Claude)
  - Domain expertise signals

Final Decision = Weighted Ensemble + Kelly Sizing
```

**Alternative Patterns**:
- Rule-based qualifiers only (limited edge)
- Single ML model (requires training data)
- Pure LLM analysis (expensive, slower)
- Arbitrage detection (limited scalability)

### 4. Position Management
**Tracking Structure**:
```python
class Position:
    market_id: str
    outcome: str
    shares: int
    avg_price: float
    current_value: float  # market_probability × shares
    p_and_l: float
    created_at: datetime
    last_updated: datetime
```

**Rebalancing Logic**:
- New signal says SELL outcome X
- Current position: 100 shares at $0.50
- Close with market bet or limit order
- Log transaction with P&L

### 5. Monitoring & Observability
**CSV Event Logging** (sketchy pattern):
```
logs/
├── bets/
│   └── PlaceBetEvent.csv (timestamp, market, outcome, size, price)
├── positions/
│   └── PositionEvent.csv (open, close, rebalance)
├── errors/
│   └── ErrorEvent.csv (type, message, traceback)
├── strategies/
│   └── StrategyEvent.csv (name, decision, confidence, latency)
└── portfolio/
    └── PortfolioMetricsEvent.csv (balance, invested, p_and_l, win_rate)
```

**Metrics to track**:
- Win rate (resolved / total)
- Sharpe ratio (returns / volatility)
- Max drawdown (peak-to-trough)
- Recovery time (days to recover from max drawdown)
- Average holding time
- Trade frequency
- Slippage (expected vs actual)

## Recommended Tech Stack

### Backend
```
Python 3.10+
├── aiohttp         - async HTTP client
├── websockets      - WebSocket connections (optional)
├── pydantic        - data validation
├── APScheduler     - task scheduling
└── SQLAlchemy      - ORM (optional, for state)

Alternative: Node.js
├── axios           - HTTP client
├── ws              - WebSocket
├── TypeScript      - type safety
└── node-cron       - scheduling
```

### Frontend (Optional)
```
React/Vue.js
├── recharts        - charts & metrics
├── Tailwind CSS    - styling
└── axios           - API calls

Simpler Alternative: Streamlit (Python)
- Dashboard in 50 lines
- Real-time updates
- Easy callbacks
```

### Database (Optional)
```
SQLite (local development)
PostgreSQL (production)
Supabase (serverless option)
```

## Common Pitfalls & Solutions

| Pitfall | Impact | Solution |
|---------|--------|----------|
| Not handling API schema changes | Bot crashes | Type camelCase→snake_case conversion, log unknown fields |
| No exponential backoff on 429 | IP ban, lost trades | Implement backoff: 2^retry seconds |
| Over-leveraging Kelly Criterion | Catastrophic loss | Use Fractional Kelly (1/10 to 1/25) + hard caps |
| Ignoring position correlation | Hidden risk | Track market topic overlap, limit correlated positions |
| No slippage modeling | Worse than expected returns | Use limit orders, simulate orderbook, track actual vs expected |
| Lost state on restart | Unknown portfolio state | Persist positions to JSON or DB before restart |
| Not logging all bets | Debugging impossible | Log every decision: qualify, propose, execute, confirm |
| WebSocket reconnection issues | Missing trades | Use polling + fallback, manual ping loop, exponential backoff |

## Deployment Patterns

### Development
- Local Python script with polling loop
- SQLite for state persistence
- Console logging
- Optional: local Streamlit dashboard

### Production
- Docker container + scheduler (cron, Kubernetes)
- PostgreSQL for state and audit trail
- Structured logging (JSON to ELK or CloudWatch)
- Monitoring alerts (Slack, email)
- Paper trading option (separate config)

### Scaling
- Separate event loop from strategy evaluation
- Use message queue (Redis, RabbitMQ) for orders
- Multi-strategy framework (run many bots concurrently)
- Database connection pooling

## Learning Path for Implementation

### Phase 1: MVP (Week 1)
1. Set up API client with REST only
2. Implement simple qualifier-based strategy
3. Single market polling loop
4. CSV logging
5. Test with paper trading

### Phase 2: Risk & Scaling (Week 2-3)
1. Add Kelly Criterion position sizing
2. Implement hard caps and circuit breakers
3. Build portfolio reconciliation logic
4. Add multi-strategy evaluation
5. Performance metrics calculation

### Phase 3: Intelligence (Week 3+)
1. Add ensemble signals (historical + microstructure)
2. Integrate LLM analysis (OpenAI API)
3. Implement backtesting framework
4. Fine-tune thresholds empirically
5. Add market filtering by category/volume

### Phase 4: Production (Month 2+)
1. WebSocket event-driven (optional upgrade)
2. Database migration (SQLite → PostgreSQL)
3. Monitoring/alerting setup
4. Automated health checks
5. Gradual rollout (small position sizes → full capacity)

## Success Metrics

**Before Going Live**:
- [ ] Paper trading shows +5-10% monthly return
- [ ] Win rate > 55%
- [ ] Max drawdown < 15%
- [ ] Processed > 1000 simulated bets without errors
- [ ] All risk limits enforced successfully

**Live Trading**:
- [ ] Actual performance within 90% of paper trading
- [ ] Position reconciliation matches Manifold portfolio
- [ ] < 1% of trades fail to execute
- [ ] Average latency < 2 seconds (proposal to confirmation)
- [ ] Zero catastrophic loss incidents (max drawdown limit holds)

## References

- **Sketchy Bot Framework**: https://github.com/sketchy-manifold/sketchy-bot-framework
- **Better Manifold Bot**: https://github.com/sachin-detrax/better_manifold_bot (most detailed docs)
- **Manifold LLM Bot**: https://github.com/ksadov/manifold-llm-bot
- **Official Manifold Docs**: https://docs.manifold.markets/
- **Prediction Markets**: https://en.wikipedia.org/wiki/Prediction_market
- **Kelly Criterion**: https://en.wikipedia.org/wiki/Kelly_criterion
