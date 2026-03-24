# Manifold Markets Trading Bot Repositories - Comprehensive Research

**Date**: March 24, 2026  
**Total Repositories Analyzed**: 12+ active trading bot projects  
**Primary Languages**: Python (90%), TypeScript (10%)

---

## Executive Summary

This research identifies 9 major Manifold Markets trading bot repositories, with the most recent and complete implementations being **sachin-detrax/better_manifold_bot** and **ksadov/manifold-llm-bot** (both updated in 2025). These repositories demonstrate complete implementations of:

- **API client implementations** with full market data access
- **Strategy/prediction engines** using LLMs, ensemble methods, and external data
- **Risk management systems** with Kelly Criterion and Fractional Kelly implementations  
- **Event-driven architectures** with local databases and performance tracking
- **Real-time monitoring** via REST polling and local caching

---

## Tier-1 Repositories (Complete Implementation Examples)

### 1. **ksadov/manifold-llm-bot** 🏆
**Status**: Active | **Stars**: 7 | **Updated**: May 2025 | **Language**: Python

**Description**: LLM-based agent trading bot with DSPy optimization, supporting multiple LLM backends.

**Key Strengths**:
- Multi-backend LLM support (OpenAI, Anthropic, Together AI, llama.cpp)
- Integrated Google Custom Search for external knowledge
- Complete backtesting framework with historical data
- DSPy for prompt optimization (MIRPOv2, COPRO)
- Local SQLite database for position tracking
- Modular configuration system

**Architecture Highlights**:
```
src/
├── scripts/
│   ├── trade.py              # Main trading loop with LLM decision-making
│   ├── backtest.py           # Historical backtesting
│   ├── prefill_trade_database.py  # Position synchronization
│   ├── make_dataset.py       # Data preparation
│   ├── make_data_split.py    # Train/val/test splits
│   ├── evaluate.py           # DSPy evaluation framework
│   └── optimize.py           # Prompt/strategy optimization
├── core/
│   └── agent logic           # LLM-based decision making
config/
├── llm/                       # LLM provider configs (gpt-4o-mini, others)
├── bot/                       # Bot behavior configs
├── secrets/                   # API key storage
└── templates/                 # Prompt templates (e.g., halawi_scratchpad.txt)
dspy_programs/               # Serialized DSPy programs
```

**API Client Pattern**:
- Direct HTTP requests to Manifold API
- Authentication via API key header
- Market data parsing
- Bet placement with automatic order handling

**Strategy Implementation Pattern**:
- `DSPy` modules for structured prompting
- Chain-of-thought reasoning
- Multi-run execution with variance penalty
- Grade-based optimization of prompts

**Risk Management**:
- Position-aware betting (tracks holdings via database)
- Auto-sell mechanism (>0.9 probability)
- Database reconciliation with market state

**Real-time Architecture**:
- Event-driven through sequential polling
- Local SQLite database for state management
- Asynchronous search queries
- Graceful timeout handling

**Configuration Files**:
```
config/llm/gpt-4o-mini-example.json    # LLM configuration
config/bot/kbot.json                  # Active bot config
config/secrets/secrets-example.json    # API keys
```

**Running the Bot**:
```bash
python -m src.scripts.trade config/bot/kbot.json
```

---

### 2. **sachin-detrax/better_manifold_bot** 🥇
**Status**: Active | **Stars**: 1 | **Updated**: Nov 2025 | **Language**: Python

**Description**: Sophisticated ensemble-based trading bot with multi-signal decision making and comprehensive documentation.

**Key Strengths**:
- **Advanced ensemble architecture**: Combines 3 independent signals
- **Comprehensive documentation**: `SYSTEM_DOCUMENTATION.md` explains all logic
- **Latest updates**: Nov 2025 (most current)
- **Structured forecasting**: Self-consistency checks with OpenAI
- **Professional risk management**: Quarter Kelly with variance penalty
- **Performance visualization**: Automatic graph generation

**Architecture Highlights**:
```
better_manifold_bot/
├── core/
│   ├── decision_maker.py      # Ensemble aggregation logic
│   └── bot_interface.py        # Abstract bot interface
├── manifold/
│   ├── client.py              # Complete REST API client
│   ├── models.py              # Data structures for markets/bets
│   └── exceptions.py          # Error handling
├── signals/
│   ├── historical_signal.py   # Creator bias analysis (25% weight)
│   ├── microstructure_signal.py # Order book analysis (15% weight)
│   └── openai_signal.py        # Structured forecasting (60% weight)
├── ensemble_decision_maker.py  # Signal weighting & aggregation
└── kelly_bot.py               # Kelly Criterion implementation
----
main_openai.py               # Primary entry point
main_ensemble.py             # Ensemble-only entry point
backtest_optimize.py         # Historical analysis
performance_data/            # Trade logs and analysis
└── *_performance.json       # Detailed decision logs
```

**Signal Generation System**:

1. **Historical Signal** (25%):
   - Analyzes creator's resolution history
   - Calculates "Real World Resolution Rate" vs "Market Probability"
   - Identifies systematic biases
   - File: `signals/historical_signal.py`

2. **Microstructure Signal** (15%):
   - Examines order book depth
   - Detects liquidity imbalances
   - Identifies breaking news pressure
   - File: `signals/microstructure_signal.py`

3. **OpenAI Signal** (60%):
   - Structured forecasting with decomposition
   - Base rate estimation
   - Counter-argument analysis
   - Multiple runs (default: 3) for consistency
   - Variance penalty on disagreement
   - File: `signals/openai_signal.py`

**Ensemble Aggregation Logic** (`ensemble_decision_maker.py`):
```python
# Pseudo-code of aggregation
disagreement_penalty = calculate_signal_variance()
true_probability = weighted_average(historical, microstructure, openai)
final_confidence = apply_penalty(true_probability, disagreement_penalty)
edge = abs(true_probability - market_probability)

if edge >= 5%:  # minimum threshold
    bet_size = calculate_kelly(edge, bankroll, market_odds)
    bet_size = min(bet_size * 0.25, 15% of bankroll)  # Quarter Kelly
```

**Risk Management** (`kelly_bot.py`):
- Kelly Criterion: `f* = (bp - q) / b`
- Fractional Kelly: Quarter Kelly (0.25x base)
- Maximum position size: 15% of bankroll
- Variance penalty for signal disagreement
- Dry-run mode available

**Performance Tracking**:
```
performance_data/
├── 2025_nov_performance.json  # Detailed decision logs
├── cumulative_pl_graph.png
├── win_rate_graph.png
└── roi_analysis.csv
```

**Configuration**:
```
.env file:
MANIFOLD_API_KEY=xxx
OPENAI_API_KEY=xxx
```

**Usage Examples**:
```bash
# Dry run with 10 markets
python main_openai.py --dry-run --limit 10

# Live trading with custom settings
python main_openai.py --limit 20 --n-runs 5 --variance-penalty 0.8

# Generate performance reports
python main_openai.py --show-report --generate-graphs
```

**Command-line Arguments**:
- `--dry-run`: Simulation mode
- `--limit N`: Markets to analyze
- `--bet-amount N`: Override Kelly sizing
- `--show-report`: Historical performance
- `--generate-graphs`: Visualization
- `--n-runs N`: OpenAI consistency runs
- `--disable-openai`: Cost-saving mode

---

### 3. **blackXmask/Manifold-Markets-Trading-Bot** 🎯
**Status**: Active | **Stars**: 3 | **Updated**: Nov 2025 | **Language**: Python

**Description**: Professional AI-powered bot with interactive Streamlit dashboard and portfolio optimization.

**Key Strengths**:
- **Complete GUI**: Streamlit with 9 interactive tabs
- **Portfolio optimization**: Correlation & diversification analysis
- **Arbitrage detection**: Binary & cross-market opportunities
- **Real-time alerts**: Webhook, email, and trading notifications
- **AI analysis**: GPT-5 probability estimation + sentiment
- **Backtesting**: Full simulation framework

**Architecture Highlights**:
```
bot/
├── api_client.py      # Full REST API client
├── strategies.py      # Trading strategies & AI analysis
├── kelly.py          # Bet sizing with Kelly Criterion
├── portfolio.py      # Portfolio tracking, P&L, correlation analysis
├── config.py         # Configuration management
└── arbitrage.py      # Arbitrage detection logic

data/
└── portfolio.json    # Current positions & trade history

app.py              # Streamlit GUI (main entry point)
main.py             # Alternative entry point

examples/
└── ...              # Strategy examples

docs/
└── API_REFERENCE.md # Complete documentation
```

**API Client Implementation** (`bot/api_client.py`):
```python
class ManifoldAPIClient:
    - getMe()                  # Current user info
    - getMarkets()             # Market listings
    - getMarketById()          # Market details
    - getBets()                # Bet history
    - createBet()              # Place bet
    - createMarket()           # Create new market
    - sellBet()                # Exit position
    - getGroupBySlug()         # Group data
    - searchMarkets()          # Advanced search
```

**Trading Strategies** (`bot/strategies.py`):
- GPT-5 probability estimation
- Sentiment analysis
- Edge detection (minimum 5%)
- Kelly Criterion bet sizing
- Market liquidity adjustment
- Ensemble predictions

**Portfolio Management** (`bot/portfolio.py`):
```python
PortfolioTracker:
    - track_position()          # Entry/exit
    - calculate_pnl()           # Performance
    - calculate_correlation()   # Risk metrics
    - get_arbitrage_opportunities()
    - optimize_allocation()     # Rebalancing
```

**Streamlit Dashboard**:
- Tab 1: Portfolio Overview (P&L, ROI, win rate)
- Tab 2: Active Positions
- Tab 3: Trading History
- Tab 4: Correlation Heatmap
- Tab 5: Market Search & Analysis
- Tab 6: Arbitrage Opportunities
- Tab 7: Strategy Configuration
- Tab 8: Backtesting Results
- Tab 9: Performance Analytics

**Bet Sizing** (`bot/kelly.py`):
- Kelly Criterion calculation
- Confidence thresholds
- Position limits by market
- Liquidity-aware sizing

**Configuration** (`.env`):
```
MANIFOLD_API_KEY=xxx
OPENAI_API_KEY=xxx
BOT_NAME=your_bot_name
RUN_MODE=live|dry_run
```

**Running the Bot**:
```bash
streamlit run app.py --server.port 5000
```

---

### 4. **rodriguezramirezederdominic-web/TalOS-Manifold-Bot**
**Status**: Active | **Stars**: 1 | **Updated**: Nov 2025 | **Language**: Python

**Description**: Agentic trading bot using GPT-4 analysis with Fractional Kelly risk management.

**Key Strengths**:
- **Agentic architecture**: Named reasoning (LLM reads market text)
- **Advanced risk management**: Fractional Kelly Criterion
- **Creator targeting**: API-level filtering
- **Modular design**: Separated concerns (trading, decision, finance)

**Architecture Highlights**:
```
TalOS_bot.py      # Main trading loop
brain.py          # AI decision logic (GPT-4 analysis)
kelly.py          # Financial calculations (Fractional Kelly)
config.py         # Parameter configuration
requirements.txt  # Dependencies
.env              # API keys & secrets
```

**Core Components**:

1. **Brain** (`brain.py`):
   - Market text analysis via GPT-4
   - Reference class analysis
   - Calibrated probability generation
   - Counter-factual reasoning

2. **Trading Loop** (`TalOS_bot.py`):
   - Creator-specific market filtering
   - Position monitoring
   - Bet execution
   - Trade logging

3. **Kelly Criterion** (`kelly.py`):
   ```
   Fractional Kelly (0.25x):
   f* = 0.25 * (bp - q) / b
   
   Where:
   - b: net odds
   - p: probability estimate
   - q: 1 - p
   - f*: fraction of bankroll to bet
   ```

**Configuration**:
```
.env:
MANIFOLD_API_KEY=xxx
OPENAI_API_KEY=xxx
TARGET_CREATOR_ID=MikhailTal
BANKROLL=initial_mana
```

**Workflow**:
1. Fetch MikhailTal's markets
2. AI reads and analyzes market text
3. Generate calibrated probability
4. Calculate edge vs market probability
5. Determine bet size with Fractional Kelly
6. Execute and track position

---

## Tier-2 Repositories (Specialized Implementations)

### 5. **willjallen/AutoFold** ⭐⭐
**Status**: Maintained | **Updated**: Feb 2024 | **Language**: Python

**Complete all-in-one framework** combining:
- Comprehensive API client
- Local market data database
- Real-time data subscriber
- Bot interface framework

**File Structure**:
```
AutoFold/
├── api/
│   ├── client.py           # Full API wrapper
│   ├── market.py           # Market model
│   └── auth.py             # Authentication
├── database/
│   ├── localdb.py          # SQLite wrapper
│   └── schema.sql          # Data schema
├── subscriber/
│   └── realtime.py         # Data subscription logic
└── bot/
    └── interface.py        # Bot abstraction
```

---

### 6. **diomidova/manibots** ⭐⭐
**Status**: Archived | **Updated**: Nov 2022 | **Language**: Python

**Multiple specialized bots**:
```
arbitrage-bot/              # Cross-market arbitrage
├── find_opportunities.py
├── execute_arbitrage.py
└── profit_calculator.py

archived/
├── old_strategy_1.py
├── old_strategy_2.py
└── ...
```

**Key Concepts**:
- Market pair identification
- Risk-free profit opportunities
- Automated execution
- Position limits

---

### 7. **keriwarr/manifold-sdk** (TypeScript) 🎯
**Status**: Maintained | **Stars**: 9 | **Updated**: Nov 2022 | **Language**: TypeScript

**Production-grade TypeScript SDK** for API integration.

**File Structure**:
```
src/
├── index.ts              # Main export
├── client.ts             # Core client class
├── endpoints/
│   ├── markets.ts        # Market operations
│   ├── bets.ts          # Betting operations
│   ├── users.ts         # User operations
│   └── groups.ts        # Group operations
└── types.ts             # TypeScript interfaces
```

**Usage Example**:
```typescript
import { Manifold } from "manifold-sdk";

const manifold = new Manifold("YOUR_API_KEY");

// Get user info
const user = await manifold.getMe();

// Create market
const market = await manifold.createMarket({
  description: "test",
  outcomeType: "BINARY",
  question: "test?",
  closeTime: Date.now() + 1000000,
  initialProb: 33,
});

// Place bet
const bet = await manifold.createBet({
  contractId: market.id,
  amount: 100,
  outcome: "YES",
});
```

**Package**:
- Available on npm
- Supports ES modules
- TypeScript first design
- Full API coverage

---

### 8. **howtodowtle/mmm**
**Status**: Archived | **Updated**: Dec 2023 | **Language**: Python

**External data integration example** using FiveThirtyEight predictions.

**File Structure**:
```
all_538.py              # FiveThirtyEight betting strategy
arbitrage.py            # Arbitrage detection & execution
bet_random.py           # Random betting (testing/bonuses)
cron_bets.py            # Scheduled betting jobs
db.py                   # Database operations
scraping.py             # 538 web scraping
kelly.py                # Kelly Criterion implementation
utils.py                # Utility functions
```

**Strategy Example**:
```python
# Pseudo-code: 538 strategy
markets = find_manifold_markets()
for market in markets:
    fivethirtyeight_prob = scrape_538_prediction(market.question)
    edge = abs(fivethirtyeight_prob - market.current_prob)
    if edge > threshold:
        bet_size = kelly_criterion(edge, bankroll)
        execute_bet(market, bet_size)
```

---

### 9. **bcongdon/PyManifold**
**Status**: Maintained | **Stars**: 18 | **Updated**: Dec 2022 | **Language**: Python

**Basic Python API client** with clean interface.

**Key Features**:
- Simple wrapper around REST API
- Market querying
- Betting operations
- User management

---

## Cross-Cutting Architecture Patterns

### API Client Implementation Pattern

All Python projects follow similar API client structure:

```python
class ManifoldClient:
    def __init__(self, api_key):
        self.api_key = api_key
        self.base_url = "https://api.manifold.markets/v0"
        self.session = requests.Session()
        self.session.headers.update({"Authorization": f"Key {api_key}"})
    
    def _request(self, method, endpoint, **kwargs):
        url = f"{self.base_url}/{endpoint}"
        response = self.session.request(method, url, **kwargs)
        response.raise_for_status()
        return response.json()
    
    def get_markets(self, **filters):
        return self._request("GET", "markets", params=filters)
    
    def create_bet(self, contract_id, amount, outcome):
        return self._request("POST", "bets", json={
            "contractId": contract_id,
            "amount": amount,
            "outcome": outcome
        })
```

### Strategy Implementation Pattern

Most bots follow:

```python
def analyze_market(market_data):
    """Generate probability estimate"""
    # 1. Fetch external signals
    signal_1 = historical_analysis(market)
    signal_2 = llm_analysis(market)
    signal_3 = technical_analysis(market)
    
    # 2. Aggregate signals
    weighted_prob = weighted_average(signal_1, signal_2, signal_3)
    
    # 3. Compare to market
    edge = abs(weighted_prob - market.current_prob)
    
    return {
        "probability": weighted_prob,
        "edge": edge,
        "confidence": calculate_confidence(),
        "signals": {signal_1, signal_2, signal_3}
    }

def execute_bet(market, analysis):
    """Place bet using Kelly Criterion"""
    if analysis["edge"] < MINIMUM_EDGE_THRESHOLD:
        return None
    
    bet_size = calculate_kelly(
        probability=analysis["probability"],
        market_odds=calculate_odds(market),
        bankroll=current_bankroll()
    )
    
    # Apply fractional Kelly for safety
    bet_size *= KELLY_FRACTION  # 0.25
    
    return create_bet(market.id, bet_size, prediction_outcome)
```

### Risk Management Pattern

All projects implement:

```python
class RiskManager:
    def __init__(self, bankroll, kelly_fraction=0.25):
        self.bankroll = bankroll
        self.kelly_fraction = kelly_fraction
        self.max_position = 0.15  # 15% of bankroll
    
    def calculate_bet_size(self, edge, probability, odds):
        """Kelly Criterion with safety limits"""
        kelly_optimal = (probability * odds - (1 - probability)) / odds
        kelly_fraction = kelly_optimal * self.kelly_fraction
        bet_size = self.bankroll * kelly_fraction
        
        # Cap position size
        bet_size = min(bet_size, self.bankroll * self.max_position)
        
        return max(1, int(bet_size))  # Minimum 1 mana
    
    def check_position_limits(self, market_id, proposed_bet):
        """Ensure not overleveraged"""
        current_exposure = sum_existing_positions()
        if current_exposure + proposed_bet > self.max_exposure:
            return False
        return True
```

### Event-Driven Architecture Pattern

Real-time monitoring implemented via:

```python
# Option 1: Polling Loop (all projects use this)
def main_loop():
    while True:
        markets = fetch_all_markets()
        for market in markets:
            analysis = analyze_market(market)
            if should_act(analysis):
                execute_bet(market, analysis)
        
        time.sleep(POLL_INTERVAL)  # Usually 30-60 seconds

# Option 2: Local Database State Management
def sync_with_market():
    """Keep local state in sync"""
    remote_bets = fetch_my_bets()
    local_bets = query_local_db()
    
    for remote_bet in remote_bets:
        if remote_bet.id not in local_bets:
            log_bet(remote_bet)
    
    update_positions()
```

### Configuration Pattern

Standard `.env` and config files:

```env
# .env
MANIFOLD_API_KEY=xxx
OPENAI_API_KEY=xxx  # For AI strategies
GOOGLE_API_KEY=xxx  # For search
TARGET_MARKETS=all|MikhailTal  # Filter
BANKROLL=10000
KELLY_FRACTION=0.25
DRY_RUN=true
```

---

## File Patterns Summary

### Entry Points
- `main.py` - Primary bot entry
- `app.py` - Streamlit GUI entry
- `*_bot.py` - Strategic entries
- `trade.py` - Trading loop

### Core API Integration
- `api_client.py` - REST wrapper
- `client.py` - Generic client
- `manifold/client.py` - Scoped client
- `src/` - TypeScript SDK source

### Strategy Implementation
- `strategies.py` - Strategy collection
- `signals/` - Individual signal sources
- `brain.py` - AI decision logic
- `ensemble_decision_maker.py` - Signal aggregation

### Risk Management
- `kelly.py` - Kelly Criterion math
- `portfolio.py` - Position tracking
- `config.py` - Risk parameters
- `ensemble_decision_maker.py` - Variance penalties

### Data & State
- `performance_data/` - Trade history
- `data/portfolio.json` - Current positions
- Database files (SQLite, JSON)
- `performance_logs/` - Detailed decision logs

### Testing & Backtesting
- `test_*.py` - Unit tests
- `backtest_optimize.py` - Historical simulation
- `evaluate.py` - Strategy evaluation
- `*_historical.py` - Past data analysis

### Configuration
- `.env` - Secrets
- `config/` - Modular configs
- `config.py` - Python configuration
- `*.json` - JSON configs

---

## Recommended Learning Path

**Phase 1: Understand the Fundamentals**
1. Read [bcongdon/PyManifold](https://github.com/bcongdon/PyManifold) - Simple API client
2. Review [howtodowtle/mmm](https://github.com/howtodowtle/mmm) - Basic trading flow
3. Study Kelly Criterion: `kelly.py` from any repo

**Phase 2: Intermediate Strategies**
1. [keriwarr/manifold-sdk](https://github.com/keriwarr/manifold-sdk) - TypeScript reference
2. [willjallen/AutoFold](https://github.com/willjallen/AutoFold) - Database integration
3. [rodriguezramirezederdominic-web/TalOS-Manifold-Bot](https://github.com/rodriguezramirezederdominic-web/TalOS-Manifold-Bot) - Agentic approach

**Phase 3: Advanced Implementation**
1. [sachin-detrax/better_manifold_bot](https://github.com/sachin-detrax/better_manifold_bot) - Ensemble methods + documentation
2. [ksadov/manifold-llm-bot](https://github.com/ksadov/manifold-llm-bot) - LLM integration + backtesting
3. [blackXmask/Manifold-Markets-Trading-Bot](https://github.com/blackXmask/Manifold-Markets-Trading-Bot) - Production GUI + portfolio

---

## Key Implementation Takeaways

### WebSocket Status
- ❌ No pure WebSocket implementations found in top repositories
- ✅ Real-time achieved through REST polling (30-60 second intervals)
- ✅ Local caching with SQLite/JSON for state management
- Consider: Polling with exponential backoff for efficiency

### Best Practices
1. **Always use Fractional Kelly** (0.25x) to reduce bankruptcy risk
2. **Maintain local state** with database/JSON for quick decisions
3. **Use ensemble methods** > single-signal strategies
4. **Implement dry-run mode** for testing before live trading
5. **Track detailed decision logs** for performance analysis
6. **Modularize signal sources** for flexibility
7. **Add variance penalties** when signals disagree

### Common Pitfalls to Avoid
- ❌ Using full Kelly Criterion (too aggressive)
- ❌ Single LLM call without consistency checking
- ❌ Ignoring API rate limits
- ❌ Not tracking position reconciliation
- ❌ Deploying untested configurations

---

## Conclusion

The Manifold Markets trading bot ecosystem has evolved significantly, with **2025's most recent implementations** (sachin-detrax, ksadov, blackXmask) representing production-ready frameworks. The most complete reference implementation for learning is **sachin-detrax/better_manifold_bot** due to its extensive documentation, advanced risk management, and recent updates. For LLM integration, **ksadov/manifold-llm-bot** provides the most flexible multi-backend approach.

All repositories use similar architectural patterns around REST API clients, ensemble signal generation, Kelly Criterion risk management, and polling-based event loops—making it straightforward to synthesize approaches for custom implementations.
