# Manifold Markets API Reference

## Overview

The Manifold Markets API provides REST endpoints and WebSocket connections for trading and market data.

Reference: https://github.com/Thomas-Lemoine/manifold-markets-skill

## Key API Capabilities

### REST Endpoints

#### Authentication
```
Bearer token in Authorization header
Header: Authorization: Bearer YOUR_API_KEY
```

#### Markets
- `GET /api/v0/markets` - List all markets
- `GET /api/v0/markets/{id}` - Get specific market
- `GET /api/v0/search?q={query}` - Search markets
- `POST /api/v0/markets` - Create market (requires special permission)

#### Bets & Orders
- `POST /api/v0/bet` - Place standard bet
- `POST /api/v0/limit-orders` - Place limit order
- `POST /api/v0/bet` - Multi-outcome bet (same endpoint, different format)
- `GET /api/v0/bets?market={id}` - Get market bets
- `GET /api/v0/user/bets` - Get user's bets

#### Portfolio
- `GET /api/v0/user` - Get user data & balance
- `GET /api/v0/portfolio/{username}` - Get portfolio
- `GET /api/v0/positions` - Get open positions

#### Market Resolution
- `POST /api/v0/markets/{id}/close` - Close market
- `POST /api/v0/markets/{id}/resolve` - Resolve market

### WebSocket Connection

**Endpoint**: `wss://api.manifold.markets/...`

**Events**:
- Market updates (price, volume)
- Order book updates
- Trade execution confirmals
- User balance updates

## Bet Types

### Standard Bet
```json
{
  "amount": 100,
  "contractId": "market-id",
  "outcome": "YES"
}
```

### Limit Order
```json
{
  "amount": 100,
  "contractId": "market-id", 
  "outcome": "YES",
  "limitProb": 0.45,  // Execute if prob falls below this
  "expiration": timestamp
}
```

### Multi-Outcome Bet
```json
{
  "amounts": {
    "outcome1": 50,
    "outcome2": 50
  },
  "contractId": "market-id"
}
```

## Rate Limits

- Generally permissive but respect documented limits
- Implement exponential backoff on 429 responses
- Cache market data when possible
- Use WebSocket for real-time data instead of polling

## Common Errors

| Code | Meaning | Action |
|------|---------|--------|
| 400 | Bad request | Check parameters |
| 401 | Unauthorized | Verify API key |
| 403 | Forbidden | Insufficient permissions |
| 404 | Not found | Check market/user IDs |
| 429 | Rate limited | Implement backoff |
| 500 | Server error | Retry with exponential backoff |

## Implementation Notes

### AMM (Automated Market Maker)
- Markets use logarithmic market scoring rule (LMSR)
- Liquidity depth affects slippage
- Probability = e^(YES_shares) / (e^(YES_shares) + e^(NO_shares))

### Orderbook Simulation
Before placing large bets, simulate execution against orderbook to predict:
- Actual execution price
- Slippage
- Max shares obtainable

### Best Practices

1. **Cache Data**: Store market snapshots to reduce API calls
2. **Batch Requests**: Use bulk endpoints when available
3. **Error Handling**: Implement retry logic with exponential backoff
4. **Monitoring**: Log all API calls for debugging
5. **Limits**: Set hard caps on:
   - Max trade size (% of balance)
   - Max position size
   - Daily loss limit
   - API call frequency

## Testing

- Use Manifold Markets testnet for development
- Implement paper trading mode (simulate without real API calls)
- Verify all edge cases before live trading

## Further Reading

- Official Docs: https://docs.manifold.markets/
- GitHub Skill: https://github.com/Thomas-Lemoine/manifold-markets-skill
- Supabase Data: Bulk market history available via Supabase
