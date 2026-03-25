# Dayli Backend - Trading Bot

This is the core trading bot implementation for Dayli.

## Quick Start

### 1. Setup Python Environment

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
```

### 2. Install Dependencies

```bash
pip install -r ../config/requirements.txt
```

### 3. Configure API Key

```bash
cp ../config/example.env ../.env
# Edit ../.env and add your MANIFOLD_API_KEY
```

Get your API key from: https://manifold.markets/profile

### 4. Run the Bot

```bash
python main.py
```

## Architecture

```
src/
├── api/              # API client & domain models
├── strategies/       # Trading strategies
├── portfolio/        # Portfolio tracking
├── risk/             # Risk management (Kelly Criterion)
├── logger/           # CSV event logging
└── core.py           # Main event loop

main.py              # Entry point
```

## Core Components

### API Client (`src/api/client.py`)
- Async REST client for Manifold Markets API
- Automatic retries with exponential backoff
- TTL caching for common endpoints
- Type conversion to domain models

### Domain Models (`src/api/models.py`)
- `Market` - Market data
- `Bet` - User bets
- `User` - User profile & balance
- `ProposedBet` - Strategy proposals
- Event models for logging

### Strategies (`src/strategies/base_strategy.py`)
- `BaseTradingStrategy` - Base interface
- `SimpleStrategy` - Basic heuristic (underpriced detection)
- Qualifier pipeline for market filtering
- Extensible for custom strategies

### Risk Management (`src/risk/kelly.py`)
- Kelly Criterion for position sizing
- Fractional Kelly (conservative)
- Hard caps & circuit breakers
- Risk profiles (conservative, moderate, aggressive)

### Portfolio Manager (`src/portfolio/manager.py`)
- Track open positions
- Calculate P&L (realized & unrealized)
- Portfolio metrics

### Event Logger (`src/logger/csv_logger.py`)
- CSV logging for all events
- Separate logs by domain (bets, errors, strategies, portfolio)
- Enables analysis and debugging

### API Uploader (`src/logger/data_uploader.py`)
- Optional upload of bot events to your external API
- Includes portfolio/balance snapshots and full market payload snapshots
- Retries with backoff on transient failures

### Core Loop (`src/core.py`)
- Main polling loop (every 60 seconds)
- Market fetching
- Strategy evaluation
- Bet execution
- Portfolio updates

## Configuration

Edit `.env` with these key settings:

```env
# API
MANIFOLD_API_KEY=your_key_here

# Behavior
BOT_CHECK_INTERVAL=60           # Seconds between checks
PAPER_TRADING_MODE=true         # Simulate trades (no real money)
RISK_PROFILE=moderate           # conservative, moderate, aggressive

# Optional external ingestion API
BOT_UPLOAD_ENABLED=true
BOT_UPLOAD_URL=https://your-api.example.com/ingest
BOT_UPLOAD_API_KEY=your_uploader_key
BOT_UPLOAD_SOURCE=dayli-bot

# Risk Limits (see config/example.env for all options)
MAX_POSITION_SIZE=500           # Max per trade
MAX_INVESTED=5000              # Total portfolio limit
MAX_DAILY_LOSS=2000            # Stop if daily loss exceeds this
```

## External Upload Payloads

When `BOT_UPLOAD_ENABLED=true`, the bot posts JSON envelopes to `BOT_UPLOAD_URL` for:

- `market_snapshot` (includes full `raw_data` market payloads from Manifold)
- `portfolio_event` (includes balance, invested, PnL, win rate, plus user balances)
- `strategy_event`
- `place_bet_event`
- `error_event`

## Logging

Logs are written to `logs/` directory:

```
logs/
├── bets/bets_event.csv           # Placed bets
├── errors/error_event.csv         # Errors
├── strategies/strategy_event.csv  # Strategy evaluations
└── portfolio/portfolio_event.csv  # Portfolio snapshots
```

Each event CSV has timestamps, details, and reason codes for analysis.

## Usage Examples

### Run in Paper Trading (Recommended First)

```bash
# Edit .env
PAPER_TRADING_MODE=true
RISK_PROFILE=conservative

# Run
python main.py
```

Monitor the logs to see strategy decisions and simulated trades.

### Run with Small Real Bets

```bash
# Edit .env
PAPER_TRADING_MODE=false
MAX_POSITION_SIZE=50             # Start small
RISK_PROFILE=conservative

# Run
python main.py
```

### Custom Risk Profile

```python
# In your code
from risk.kelly import AGGRESSIVE_CONFIG
risk_mgr = RiskManager(balance=1000, **AGGRESSIVE_CONFIG)
```

## API Endpoints Used

The bot uses these Manifold Markets API endpoints:

- `GET /api/v0/markets` - List markets
- `GET /api/v0/user` - Get user balance
- `POST /api/v0/bet` - Place bets
- `GET /api/v0/bets` - Get bets (for reconciliation)

See `docs/API_REFERENCE.md` for full details.

## Troubleshooting

### "MANIFOLD_API_KEY not found"
- Check that `.env` file exists in root `dayli/` directory
- API key should be from https://manifold.markets/profile

### "Cannot connect to Manifold API"
- Check internet connection
- Verify API key is valid
- Check Manifold Markets status

### "No markets loaded"
- API might be returning empty results
- Check network/firewall
- Try waiting a few seconds between restarts

### Bot runs but doesn't place bets
- Check strategy evaluation logs in `logs/strategies/`
- Verify risk limits aren't blocking all trades
- Check market liquidity and volume thresholds

## Development

### Adding a Custom Strategy

Create a new file `src/strategies/my_strategy.py`:

```python
from strategies.base_strategy import BaseTradingStrategy, Qualifier
from api.models import ProposedBet, Market

class MyStrategy(BaseTradingStrategy):
    async def propose_bet(self, market: Market) -> ProposedBet | None:
        # Your strategy logic here
        pass
    
    def custom_qualifiers(self):
        # Your market filters here
        return []

# In main.py
strategies = [
    SimpleStra strategy('MyStrategy', client)
]
```

See `docs/IMPLEMENTATION_GUIDE.md` for more.

### Testing

Run tests (once implemented):

```bash
pytest tests/
```

## Performance

Typical performance on a modest system:

- Evaluation latency: <100ms per market
- Markets evaluated per cycle: 1000
- Cycle time: ~2-5 minutes (includes network latency)
- CPU usage: <10% (mostly idle, aiohttp is efficient)
- Memory: ~100-200 MB

## Safety

Important safety considerations:

1. **Always test in paper trading first**
2. **Start with conservative risk profile**
3. **Monitor positions regularly**
4. **Set hard caps on position size & daily loss**
5. **Don't risk more than you can afford to lose**

## Support

See `docs/` directory for detailed documentation:
- `ARCHITECTURE.md` - System design
- `IMPLEMENTATION_GUIDE.md` - Code patterns
- `API_REFERENCE.md` - API details
- `RESEARCH_BEST_PRACTICES.md` - Trading strategies

## License

MIT License - See LICENSE file
