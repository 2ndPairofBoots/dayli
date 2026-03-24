# Execution Roadmap - 2-Week MVP

## Week 1: Core Infrastructure

### Day 1: API Client
**Goal**: Can fetch markets and place test bets

**Tasks**:
1. Set up Python project with:
   - `python -m venv venv`
   - Install: aiohttp, pydantic, python-dotenv
   - Create `src/` package structure

2. Implement `ManifoldClient`:
   - Async session management
   - GET /api/v0/markets (with pagination)
   - GET /api/v0/user (balance check)
   - POST /api/v0/bet (placement)
   - Retry logic with exponential backoff
   - TTL cache for GET requests

3. Create domain models:
   - `Market` (id, question, outcomes, probability, liquidity)
   - `Bet` (id, market_id, outcome, shares, price)
   - `User` (id, balance)
   - `BaseModel.from_dict()` with camelCase → snake_case

4. Test with sample calls:
   ```python
   client = ManifoldClient(api_key="...")
   markets = await client.get_markets(limit=10)
   user = await client.get_user()
   print(f"User balance: {user.balance}")
   ```

**Deliverable**: `backend/src/api/client.py` + `models.py` passing unit tests

### Day 2: Strategy Framework
**Goal**: Can evaluate markets and propose bets

**Tasks**:
1. Create `BaseTradingStrategy` interface:
   - `propose_bet(market) → ProposedBet | None`
   - `base_qualifiers()` - filters all strategies use
   - `custom_qualifiers()` - strategy-specific filters

2. Implement base qualifiers:
   - `LiquidityQualifier` (min $100)
   - `VolumeQualifier` (min $1000 volume)
   - `AgeQualifier` (market open > 1 day)
   - `RecencyQualifier` (no bets in last 5 min)

3. Create `SimpleStrategy`:
   - Heuristic: if YES < 35%, propose YES bet
   - Confidence: fixed 60%
   - Size: 100 mana (will be scaled later)

4. Test:
   ```python
   strategy = SimpleStrategy("simple", client, {})
   result = await strategy.evaluate_and_propose(market)
   if result.proposed_bets:
       print(f"Proposed: {result.proposed_bets[0]}")
   ```

**Deliverable**: `backend/src/strategies/base_strategy.py` with SimpleStrategy working

### Day 3: Portfolio & Risk
**Goal**: Can track positions and calculate Kelly sizes

**Tasks**:
1. Build `PortfolioManager`:
   - Track open positions: market_id → (outcome, shares, avg_price)
   - Calculate portfolio balance
   - Calculate P&L by position
   - Method: `get_kelly_size(market_prob, our_estimate, balance)`

2. Implement Kelly Criterion:
   - Formula: `kelly% = 2 * edge - 1`
   - Fractional: `kelly% / 10` (conservative)
   - Position size: `balance * fractional_kelly%`
   - Examples:
     - Balance $1000, edge 10% → ~50 mana
     - Balance $1000, edge 5% → ~25 mana
     - Balance $1000, edge 1% → ~5 mana

3. Add hard caps:
   - Max single position: $200
   - Max total invested: $500
   - Circuit breaker: Stop if day P&L < -$100

4. Test:
   ```python
   pm = PortfolioManager(balance=1000)
   size = pm.get_kelly_size(market_prob=0.40, our_estimate=0.50)
   # Should be around 50 mana
   ```

**Deliverable**: `backend/src/portfolio/manager.py` + `backend/src/risk/kelly.py`

### Day 4: Event Loop
**Goal**: Bot runs continuously, polling markets and evaluating

**Tasks**:
1. Create `Core` class:
   - Connects to API
   - Polls every 60 seconds
   - Fetches up to 1000 markets
   - Evaluates all strategies on all markets concurrently
   - Places bets from qualified proposals

2. Implement placement logic:
   - Apply Kelly sizing
   - Apply hard caps
   - Check if already traded market
   - Execute via `client.place_bet()`

3. Add error handling:
   - Catch failures gracefully
   - Continue to next market
   - Log errors for debugging
   - Implement exponential backoff on connection errors

4. Create `main.py`:
   ```python
   if __name__ == "__main__":
       client = ManifoldClient(os.getenv("MANIFOLD_API_KEY"))
       strategies = [SimpleStrategy("simple", client, {})]
       core = Core(client, strategies)
       asyncio.run(core.run(poll_interval=60))
   ```

**Deliverable**: `backend/src/core.py` running without errors for 10+ minutes

### Day 5: Logging & Monitoring
**Goal**: Can see what the bot is doing

**Tasks**:
1. Implement CSV logger:
   - Create `logs/` directory structure:
     - `logs/bets/` - PlacedBet events
     - `logs/errors/` - Exceptions
     - `logs/strategies/` - Qualification results
     - `logs/portfolio/` - Balance snapshots

2. Log events:
   - **BetEvent**: timestamp, market_id, outcome, size, price
   - **ErrorEvent**: timestamp, error_type, message
   - **StrategyEvent**: timestamp, strategy_name, decision, confidence
   - **PortfolioEvent**: timestamp, balance, invested, p_and_l

3. Add console output:
   - Every proposed bet: "PROPOSE: {market} {outcome} {size}m"
   - Every placed bet: "PLACED: {market} {outcome} {size}m @ {price}"
   - Every hour: "SNAPSHOT: balance={} invested={} p_and_l={}"

4. Test:
   ```python
   logger.log_place_bet_event(bet, "YES appears underpriced")
   logger.log_portfolio_snapshot(portfolio)
   ```

**Deliverable**: CSV logs being written, console output clean and readable

## Week 2: Testing & Enhancement

### Day 6-7: Paper Trading
**Goal**: Run bot for 1 week in paper trading mode (simulated)

**Tasks**:
1. Add paper trading mode:
   ```python
   class PaperTradingClient(ManifoldClient):
       async def place_bet(self, ...):
           # Don't actually call API
           # Simulate success
           return Bet(id="sim", status="executed")
   ```

2. Set `PAPER_TRADING_MODE=true` in `.env`

3. Run for 7 days straight (or simulate by processing historical data)

4. Collect metrics:
   - Total bets proposed: N
   - Total bets placed: N
   - Win rate: X%
   - Total P&L: +/-$X
   - Sharpe ratio: X
   - Max drawdown: X%

5. Validate expectations:
   - [ ] More bets proposed than placed (filters working)
   - [ ] Win rate > 50% (strategy has edge)
   - [ ] Positive P&L (not losing money)
   - [ ] Max drawdown < 15% (risk management working)

### Day 8-9: Improvements
**Goal**: Better strategy, faster feedback

**Tasks**:
1. Add second strategy:
   - `ArbitrageStrategy`: Look for cross-market mispricing
   - OR `TrendStrategy`: Favor markets with recent volume

2. Implement ensemble:
   - Weight: SimpleStrategy 60%, Second 40%
   - Merge proposals if same market

3. Add live dashboard (optional):
   - Streamlit app
   - Shows real-time balance
   - Shows last 20 bets
   - Shows strategy win rates

4. Performance improvements:
   - Cache market list between polls
   - Fetch only new markets
   - Parallelize strategy evaluation

### Day 10: Cleanup & Documentation
**Goal**: Ready for production testing

**Tasks**:
1. Code cleanup:
   - Remove debug print statements
   - Add docstrings to all functions
   - Type hints everywhere
   - Run black formatter

2. Testing:
   - pytest for unit tests
   - Mock API responses
   - Test error scenarios

3. Documentation:
   - Update README with quick start
   - Document all config parameters
   - Add troubleshooting guide
   - Document strategy logic

4. Prepare for real trading:
   - Set `PAPER_TRADING_MODE=false` in config
   - Reduce position sizes to 10% of paper trading
   - Set up Slack alerts
   - Create backup/recovery plan

## Success Criteria for MVP

**After Week 1**:
- [ ] Bot runs continuously without crashing
- [ ] Fetches & evaluates 1000+ markets per cycle
- [ ] Places bets when strategy qualifies
- [ ] Logs all activities to CSV
- [ ] Paper trading can run unattended

**After Week 2**:
- [ ] Paper trading shows +5% monthly return (extrapolated)
- [ ] Win rate > 52% (beating 50/50)
- [ ] Max drawdown < 15%
- [ ] Zero catastrophic failures
- [ ] Documentation complete

## Resource Estimates

**Time**:
- Week 1: ~40 hours
- Week 2: ~20 hours
- Total: ~60 hours for MVP

**Code Size**:
- API client: 300 lines
- Models: 200 lines
- Strategies: 200 lines
- Core loop: 300 lines
- Risk management: 150 lines
- Logging: 200 lines
- **Total: ~1350 lines of Python**

**Testing**:
- Unit tests: 400 lines
- Integration tests: 200 lines
- Fixtures: 300 lines

## Go/No-Go Decision Points

**After Day 5** (end of core infrastructure):
- Decision: Is the event loop stable?
- If NO: Debug, extend timeline
- If YES: Proceed to testing

**After Day 10** (paper trading validation):
- Decision: Does strategy show edge?
- If NO: Iterate strategy, test longer
- If YES: Prepare for real trading

**After Week 2 live**:
- Decision: Real trading results within 90% of paper?
- If NO: Back to paper trading, debug
- If YES: Increase position sizes gradually

## Deployment Next Steps (Post MVP)

Once MVP passes validation:

1. **Database migration**:
   - Move from CSV to SQLite
   - Track historical trades for backtesting

2. **WebSocket upgrade** (optional):
   - Switch from polling to WebSocket for faster execution
   - More complex but lower latency

3. **Scaling**:
   - Multi-strategy async execution
   - Position reconciliation
   - Alert system (Slack, email)

4. **Production hardening**:
   - Docker containerization
   - Cloud deployment (AWS Lambda, Cloud Functions)
   - Monitoring dashboard
   - Automated recovery

---

## Quick Reference - Key Files to Create

**Week 1**:
1. `backend/src/api/client.py` (300 lines)
2. `backend/src/api/models.py` (200 lines)
3. `backend/src/strategies/base_strategy.py` (200 lines)
4. `backend/src/portfolio/manager.py` (150 lines)
5. `backend/src/risk/kelly.py` (100 lines)
6. `backend/src/core.py` (300 lines)
7. `backend/src/logger/csv_logger.py` (200 lines)

**Week 2**:
1. `backend/src/strategies/strategy2.py` (100 lines)
2. `frontend/app.py` (Streamlit, 200 lines - optional)
3. Tests + fixtures (900 lines)

Total: ~2000-2500 lines for complete MVP
