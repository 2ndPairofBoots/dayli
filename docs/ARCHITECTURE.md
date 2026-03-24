# System Architecture

## High-Level Design

```
┌─────────────────────────────────────────────────────────┐
│         Dashboard UI (React/Vue)                        │
│  - Metrics & analytics                                  │
│  - Market browsing                                       │
│  - Configuration & controls                             │
└────────────────────┬────────────────────────────────────┘
                     │ HTTP/WebSocket
┌────────────────────▼────────────────────────────────────┐
│      Trading Bot Engine (Python/Node.js)                │
│  ┌──────────────────────────────────────────────────┐  │
│  │  Strategy & Prediction Model                     │  │
│  │  - Market analysis                               │  │
│  │  - Suggestion generation                         │  │
│  └──────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────┐  │
│  │  Trading Logic & Risk Management                 │  │
│  │  - Position sizing                               │  │
│  │  - Stop loss / max drawdown                       │  │
│  │  - Bet execution orchestration                   │  │
│  └──────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────┐  │
│  │  Monitoring & Scheduler                          │  │
│  │  - Periodic execution                            │  │
│  │  - Logging & alerts                              │  │
│  │  - Error recovery                                │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────────┬────────────────────────────────────┘
                     │ HTTP + WebSocket
┌────────────────────▼────────────────────────────────────┐
│    Manifold Markets API Layer                           │
│  ┌──────────────────────────────────────────────────┐  │
│  │  REST Client                                     │  │
│  │  - Markets, portfolio, bets endpoints            │  │
│  │  - Auth handling & rate limiting                 │  │
│  └──────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────┐  │
│  │  WebSocket Client                                │  │
│  │  - Real-time price updates                       │  │
│  │  - Order updates                                 │  │
│  └──────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────┐  │
│  │  Market Math Utils                               │  │
│  │  - AMM calculations                              │  │
│  │  - Orderbook simulation                          │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
         ↓ API Calls
   Manifold Markets
```

## Component Details

### Frontend (Dashboard UI)
- **Metrics Panel**: Balance, P&L, win rate, position count
- **Charts**: Time-series P&L (1D, 1W, 1M, LIFE)
- **Portfolio View**: Positions by strategy, breakdown
- **Markets Browser**: Searchable list with filtering
- **Suggestions Panel**: AI-generated trading opportunities
- **Configuration**: Slip cap, risk parameters

### Backend (Trading Engine)

**Core Modules:**
1. **API Client** - REST & WebSocket connectors
2. **Market Data Processor** - Caches and normalizes market data
3. **Strategy Engine** - Prediction model and analysis
4. **Trade Manager** - Executes and tracks trades
5. **Portfolio Manager** - Calculates P&L, tracks positions
6. **Risk Manager** - Position sizing, drawdown limits
7. **Scheduler** - Periodic bot execution
8. **Logger & Monitor** - Metrics, alerts, diagnostics

**Data Flow:**
```
API (WebSocket) → Market Data Cache → Strategy Engine
                               ↓
                          Trade Manager
                               ↓
                          API (REST Bets)
                               ↓
                          Portfolio Manager
                               ↓
                          Dashboard (HTTP)
```

## Data Models

### Market
```python
{
  "id": str,
  "question": str,
  "outcomes": [str],
  "probability": {outcome: float},
  "liquidity": float,
  "volume": float,
  "createdTime": timestamp,
  "closeTime": timestamp
}
```

### Trade/Bet
```python
{
  "id": str,
  "market_id": str,
  "outcome": str,
  "amount": float,
  "shares": float,
  "execution_price": float,
  "timestamp": timestamp,
  "status": "executed" | "pending" | "failed"
}
```

### Portfolio
```python
{
  "balance": float,
  "invested": float,
  "positions": [Position],
  "p_and_l": {
    "today": float,
    "week": float,
    "month": float,
    "lifetime": float
  },
  "win_rate": float  # resolved / total
}
```

## Integration Points

### Manifold Markets API
- **Auth**: API key bearer token
- **Rate Limits**: Respect documented limits (implement exponential backoff on 429)
- **Connection Model**: REST polling (30-60s intervals, most reliable)
  - WebSocket is optional upgrade (not production-critical)
- **Key REST Endpoints**:
  - GET /api/v0/markets - List all markets with pagination
  - GET /api/v0/markets?limit=1000 - Bulk fetch
  - POST /api/v0/bet - Place standard or limit order
  - GET /api/v0/user - User balance and profile
  - GET /api/v0/portfolio - User positions
  - GET /api/v0/bets?marketId=X - Market bet history

## Deployment Architecture

### Development
- Local backend (async server)
- Local frontend (dev server)
- Manifold Markets testnet or paper trading

### Production
- Backend: Scheduled cloud function or persistent server
- Frontend: CDN-hosted SPA
- Database: Supabase for historical data
- Monitoring: Cloud logging & alerting

## Security Considerations

1. **API Keys**: Environment variables, never in code
2. **Rate Limiting**: Implement backoff & queuing
3. **Error Handling**: Graceful degradation, retry logic
4. **Validation**: Input validation on all API calls
5. **Limits**: Hard caps on position size, daily loss
