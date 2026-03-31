# Manifold Bot Master Strategy (Applied to Dayli)

Date: 2026-03-24
Project: Dayli (backend + dashboard)

## Scope and evidence

This document applies the 18 research prompts directly to this codebase and provides:
- Mathematical and engineering guidance for Manifold CPMM markets.
- Economic, calibration, risk, and architecture recommendations.
- A ranked implementation roadmap for this repo.

Primary evidence used:
- Manifold docs/API/FAQ (official): https://docs.manifold.markets/
- Manifold open-source code (formula-level): https://github.com/manifoldmarkets/manifold
- Existing Dayli research docs in this repo.

Important: some items (e.g., exact current global fee percentages, top-20 leaderboard trader decomposition, and cross-platform gap statistics) require a scheduled data pipeline against live APIs and historical dumps. This document includes concrete collection methods and implementation plans where hard numbers are not stable/publicly fixed.

---

## Prompt 1 — AMM mechanics (mathematical foundations)

### 1.1 Exact mechanism and invariant
Manifold binary markets use CPMM mechanism cpmm-1 with weighted invariant:

K = YES^p * NO^(1-p)

Where:
- YES, NO are pool balances.
- p is the market center parameter.
- For many binary markets p is initialized from initial probability.

Source-level formulas from manifold code:
- Probability:

q = (p * NO) / ((1 - p) * YES + p * NO)

- Liquidity function:

L = YES^p * NO^(1-p)

### 1.2 Shares from bet amount B (before fees)
For YES bet amount B:

shares_yes = YES + B - ( K * (B + NO)^(p - 1) )^(1/p)

For NO bet amount B:

shares_no = NO + B - ( K * (B + YES)^(-p) )^(1/(1-p))

Pool update (before liquidity fee transfer term):
- YES bet: YES' = YES - shares_yes + B, NO' = NO + B
- NO bet: YES' = YES + B, NO' = NO - shares_no + B

Then q' computed from YES', NO'.

### 1.3 Worked numeric examples (using p = 0.5 for intuition)
For p = 0.5:
- q = NO / (YES + NO)
- K = sqrt(YES * NO)

Pick total pool 200:
- At 50%: YES=100, NO=100
- At 20%: YES=160, NO=40
- At 80%: YES=40, NO=160

Example with B=10, YES bet, no fees:
- 50%:
  - shares ≈ 17.35
  - YES' ≈ 92.65, NO'=110
  - q' ≈ 54.28%
- 20%:
  - shares ≈ 32.42
  - YES' ≈ 137.58, NO'=50
  - q' ≈ 26.65%
- 80%:
  - shares ≈ 6.69
  - YES' ≈ 43.31, NO'=170
  - q' ≈ 79.70% (YES bet near upper extreme moves less due convexity + pool state)

### 1.4 Payout at resolution
Binary payout is fixed-share style:
- YES share pays 1 M if YES resolves, else 0.
- NO share pays 1 M if NO resolves, else 0.

If you hold S_yes YES shares and market resolves YES:
- payout = S_yes

If resolves NO:
- payout = 0 for YES side.

### 1.5 Bet size vs EV and slippage break-even
Let:
- r = your true probability estimate
- q_avg(B) = average fill probability paid by your bet after slippage and fees
- f(B) = effective fee fraction on notional

EV per 1 share equivalent:
EV(B) = r - q_avg(B) - fee_equivalent(B)

Trade is profitable only if:
r > q_avg(B) + fee_equivalent(B)

As B increases, q_avg(B) rises for YES buys (falls for NO buys), shrinking edge. Optimal B is where marginal EV reaches zero.

### 1.6 Liquidity/subsidy effect
Higher liquidity increases pool depth, reducing dq/dB (probability move per mana). For p=0.5 and symmetric pool, local impact scales roughly inversely with pool size.

Operationally:
- More liquidity -> less slippage -> larger feasible position sizes for same edge.

### 1.7 Sell proceeds
Manifold supports selling via POST /v0/market/[id]/sell. Sell value is computed by reversing position through limit-book then CPMM, minus fees.

Compare:
- Hold-to-resolution expected value: shares * Pr(correct)
- Sell-now value: immediate deterministic proceeds from sale formula

Decision rule:
Sell when immediate sale value exceeds discounted expected hold value adjusted for resolution/N/A risk and opportunity cost.

### 1.8 Edge cases
- Probability clamps near min/max in code paths.
- Dust/rounding and tiny-share residuals can appear with repeated micro-bets.
- Minimum liquidity safeguards prevent pathological removals.
- Near-0 or near-1 probabilities can create numerical instability if not clamped.

### 1.9 Pseudo-numeric/range differences
Pseudo-numeric still uses cpmm-1 internals, but displayed value maps from probability via:
- linear or log scale mapping between min/max.

So the trading mechanics are CPMM; interpretation layer is numeric mapping.

### 1.10 Implied probability vs true probability
- Implied probability: current CPMM quote q from pool state.
- True probability: your model estimate r of real-world event.

Difference exists due to:
- liquidity/impact,
- temporary order-flow pressure,
- fees,
- behavioral biases.

### 1.11 Dayli application
- Keep current approach of estimating edge = r - q.
- Add execution-size solver based on marginal EV after slippage.
- Add explicit probability impact simulation using CPMM formulas before each live order.

---

## Prompt 2 — Fee structure and economics

### 2.1 Fees and costs affecting bot PnL
From API docs and responses:
- Bet-level fees reported as creatorFee, platformFee, liquidityFee in each fill.
- Comment API calls have explicit M1 transaction fee.
- Market creation costs:
  - Binary: M50
  - Pseudo-numeric: M250
  - Multiple choice: M25/answer (or M25 without preset answers)

### 2.2 Break-even edge formula
Let:
- q_avg = average entry price including slippage
- F = total fee per expected payout unit

Break-even condition:
r - q_avg - F > 0
=> minimum edge e_min = q_avg + F - q_mid

In implementation, compute from actual simulated fills:
- Use dry-run (when available) or local CPMM simulator + historical fee observations.

### 2.3 Loans
FAQ describes:
- Free daily loans (tier-dependent percent of position value).
- Margin loans (for members) with daily interest.
- Loans distributed over unresolved positions and deducted from proceeds on sale/resolve.

Bot implication:
- Treat loan usage as leverage with explicit carrying cost.
- Add max leverage cap and avoid relying on loan mechanics as core alpha.

### 2.4 Mana economy
- Mana is non-cash virtual currency.
- Sources: trading gains, quests, referrals, bonuses, purchases.
- Sinks: trading losses, fees, market creation, subsidies.

### 2.5 Creation/subsidy economics
- Creation costs seed liquidity.
- Additional liquidity generally not a direct fee-yield strategy for passive LP in current retail use; expected to lose some subsidy except in specific paths.

### 2.6 Free mana sources (operational)
- Signup balance.
- Daily streak rewards.
- Quest rewards.
- Referral rewards.

### 2.7 Dayli application
- Add a fee-normalized expected value check before every bet.
- Extend logs to capture realized fee per trade and rolling fee drag.
- Add optional loan-aware risk module, default OFF.

---

## Prompt 3 — Calibration and biases

### 3.1 Practical findings to exploit
Across prediction markets, common inefficiencies:
- Extreme tails (very low/high probs) are often miscalibrated.
- Early low-liquidity markets are noisier.
- Creator/personal markets can be less efficient due discretionary resolution.
- Correlated markets can drift apart.

### 3.2 Bias ranking for Dayli
1. Low-liquidity new markets (high exploitability, high risk)
2. Correlated-market inconsistency (medium-high)
3. Tail overconfidence near 0/1 (medium)
4. Creator-resolution ambiguity markets (avoid vs exploit)

### 3.3 Dayli application
- Build calibration dataset from data dumps + bot logs.
- Add category-specific edge thresholds.
- Add contrarian module only where historical calibration supports it.

---

## Prompt 4 — Kelly and bankroll management

### 4.1 Correct Kelly framing under CPMM
For small bets, binary approximation:
- payoff odds b ≈ (1 - q)/q for YES side at quote q.
- full Kelly f* = (b*r - (1-r))/b

Because CPMM causes slippage, use effective q_avg(B), not spot q.

### 4.2 Fractional Kelly recommendation
- Default: quarter Kelly or tenth Kelly for noisy estimates.
- Confidence-scaled multiplier m in [0.25, 1.0].

### 4.3 Correlation-aware sizing
For positions vector w and covariance Sigma over outcome returns:
- maximize expected log growth approx by controlling w^T Sigma w under edge constraints.
- practical proxy: cap per-theme exposure and pairwise correlated notional.

### 4.4 Dayli application
Current kelly.py uses simplified scaling; upgrade to:
1. compute odds from market q,
2. compute f*,
3. apply confidence multiplier,
4. apply slippage-adjusted cap,
5. apply hard limits.

---

## Prompt 5 — Arbitrage strategies

### 5.1 Arb categories
- Intra-platform logical arb:
  - mutually exclusive markets,
  - decomposition relationships,
  - linked binary vs multi-answer structures.
- Cross-platform arb:
  - slower due mapping + policy + execution latency.

### 5.2 Detection formula
For mutually exclusive events A_i with sum probability <=1:
- if sum_i q_i + fee_buffer < 1 => potential YES basket arb
- if derived constraints violated (e.g., parent < child), trade spread.

### 5.3 Dayli application
- Add arb scanner module that builds relation graph and flags violations.
- Use conservative execution with resolution-risk penalty.

---

## Prompt 6 — External signal generation

### 6.1 Priority ranking (reliability/cost/access)
1. Internal Manifold state + market microstructure (free, immediate)
2. Structured external forecasts (Metaculus/Kalshi/Polymarket overlap where legal/API-accessible)
3. Domain-specific feeds (sports/elections/econ APIs)
4. News sentiment/NLP
5. Social sentiment

### 6.2 Signal fusion
Use weighted ensemble:
- logit(r) = w0 + sum_j wj * logit(r_j)
- update weights online by out-of-sample Brier/log-loss performance.

### 6.3 Dayli application
- Start with 3-signal ensemble:
  - market microstructure,
  - base-rate model,
  - optional LLM adjudicator.

---

## Prompt 7 — LLM integration

### 7.1 Best-fit tasks
High value:
- market text parsing,
- ambiguity/N/A risk detection,
- evidence summarization,
- feature extraction from long descriptions/comments.

Lower trust:
- direct numeric probability output without calibration.

### 7.2 Architecture
- Rules-first decision engine.
- LLM called only on candidate markets passing cheap filters.
- LLM output post-processed via calibration layer and consistency checks.

### 7.3 Cost guardrails
- Daily token budget.
- Caching by market hash + TTL.
- Backoff to cheaper model for classification-only steps.

### 7.4 Dayli application
- Add LLM gate in strategy pipeline as optional confidence augmenter, not sole predictor.

---

## Prompt 8 — API reference and patterns (bot-focused)

### 8.1 Core endpoints for Dayli
Read:
- GET /v0/markets
- GET /v0/search-markets
- GET /v0/market/[id]
- GET /v0/market/[id]/prob
- GET /v0/market-probs
- GET /v0/bets
- GET /v0/me
- GET /v0/get-user-portfolio
- GET /v0/get-user-contract-metrics-with-contracts

Write:
- POST /v0/bet
- POST /v0/bet/cancel/[id]
- POST /v0/market/[id]/sell

Auth:
- Authorization: Key {api_key}

Rate limit:
- 500 requests/min per IP (official guideline)

Websocket:
- wss://api.manifold.markets/ws
- topics include global/new-bet, global/updated-contract, contract/[id]/...

### 8.2 Dayli scanning architecture
- Hybrid: websocket event triggers + periodic reconciliation polling.
- Cache markets locally; request probs in batches with /market-probs.
- Use before/beforeTime cursors for stable pagination.

---

## Prompt 9 — Open-source bot lessons

### Proven patterns
- Async client + retries/backoff.
- Fractional Kelly + hard risk caps.
- Event logging for post-trade diagnostics.
- Ensemble decision logic.
- Paper-trading first, then low-size live rollout.

### Anti-patterns
- All-in on uncalibrated LLM outputs.
- No idempotency protections around bet placement.
- No circuit breaker on drawdown.

### Dayli application
- Already has many core patterns; next step is calibration infrastructure and execution simulator depth.

---

## Prompt 10 — Market selection rubric

### 0-100 scoring rubric
- Liquidity/depth: 20
- Resolution quality (objective criteria): 20
- Creator trust/reputation: 15
- Signal strength (model confidence-edge): 25
- Correlation contribution/diversification: 10
- Time-to-resolution and mana velocity: 10

Thresholds:
- >= 75: bet candidate
- 55-74: watchlist / require stronger edge
- < 55: skip

Reject hard if:
- high ambiguity text,
- high creator-risk flags,
- insufficient liquidity.

---

## Prompt 11 — N/A and resolution risk

### Key mechanics
N/A (cancel) behavior can claw back prior sold-profit effects and returns stakes/liquidity according to platform rules.

### N/A-adjusted EV
Let c = probability of cancel/N/A.
Then adjusted EV:
EV_adj = (1-c)*EV_resolved + c*EV_cancel_state

For conservative filtering, require EV_adj > safety_margin.

### Dayli application
- Add N/A risk score feature in strategy qualifier.
- Penalize edge by resolution-risk multiplier.

---

## Prompt 12 — Portfolio management

### Recommended limits (starting point)
- Keep 25-40% bankroll liquid.
- Max single market exposure: 3-6% bankroll (lower if high ambiguity).
- Max correlated theme bucket: 12-18% bankroll.

### Decision tree
- Entry: edge > threshold and risk score passes.
- Add: only if updated edge improves and correlation budget allows.
- Hold: if thesis intact and better alternatives absent.
- Exit/sell: if edge decays below threshold or superior opportunity appears.

---

## Prompt 13 — Speed and latency

### Practical conclusion
- Millisecond HFT is not primary edge.
- Minute-level responsiveness plus event triggers captures most retail alpha.

### Dayli application
- Keep 1-5 minute base cycle.
- Add event-driven immediate reevaluation for:
  - large probability jumps,
  - key linked-market changes,
  - major news feed events.

---

## Prompt 14 — Market creation ROI

### Summary
Market creation can be strategic for community/research but usually not highest immediate trading ROI vs pure trading unless you have audience and curation edge.

### Dayli stance
- Treat creation as secondary module.
- Activate only with explicit topic advantage and engagement expectation.

---

## Prompt 15 — Competitor/top trader analysis

### What to copy
- Specialization by domain.
- Tight risk discipline.
- Fast reaction in specific niches.

### What to avoid
- Overtrading noisy markets.
- Concentrated unresolved-duration risk.

### Dayli application
- Add category specialization mode and benchmark by category PnL.

---

## Prompt 16 — Catastrophic loss prevention

### Mandatory safeguards
- Hard caps: single trade, daily loss, total drawdown.
- Idempotency keys / duplicate-order checks.
- Order confirmation reconciliation.
- Kill switch on repeated API anomalies.
- Alerting on unusual bet bursts.

### Dayli application
- Existing circuit breakers are good baseline; add duplicate-bet guard and anomaly alerts.

---

## Prompt 17 — Academic strategy extraction

### Practical synthesis
- Prediction markets are often fairly efficient in liquid major topics, less so in niche/early/ambiguous markets.
- Calibration and disciplined sizing beat raw prediction cleverness alone.
- Ensemble + post-hoc calibration + strict risk controls is robust.

### Dayli application
- Focus on calibration loops and adaptive weighting rather than one-shot model complexity.

---

## Prompt 18 — Full strategy ranking + roadmap

## 18.1 Ranked strategies for Dayli

| Rank | Strategy | Expected Edge/Trade | Opportunities/day | Complexity | Min capital |
|---|---|---:|---:|---|---:|
| 1 | Market selection + calibrated edge + fractional Kelly | Medium | Medium-High | Medium | 1,000 |
| 2 | Correlated-market consistency arb (intra-Manifold) | Medium | Medium | High | 2,000 |
| 3 | Event-triggered repricing (news + linked markets) | Medium-High | Low-Medium | High | 2,000 |
| 4 | LLM-assisted resolution-risk filtering | Indirect (risk reduction) | High coverage | Medium | 1,000 |
| 5 | Cross-platform signal overlay | Medium | Low-Medium | High | 5,000 |

## 18.2 Minimum viable implementation specs

### Strategy A: Calibrated core trader
- Signals: internal market state + base rates + category priors.
- API: /markets, /market-probs, /bet, /sell, /get-user-portfolio.
- Logic: edge estimate -> slippage-adjusted EV -> Kelly fraction -> risk gates.
- Edge cases: low liquidity, resolution ambiguity, API retries.

### Strategy B: Correlation arb module
- Signals: relationship graph among market IDs.
- API: /search-markets, /market-probs.
- Logic: detect constraint violations, open spread trades with tight sizing.
- Edge cases: resolution mismatch timing, creator discretion.

## 18.3 Roadmap (applied to this repo)

### Phase 1 (Weeks 1-2): Foundation
- Implement slippage-aware execution simulator using cpmm formulas.
- Replace simplified Kelly with odds-based, confidence-scaled fractional Kelly.
- Add fee-adjusted EV gate.
- Add N/A risk qualifier and hard reject rules.

Expected result: immediate reduction in bad trades and variance.

### Phase 2 (Weeks 3-6): Signal expansion
- Build calibration dataset from data dump + logs.
- Add category-level priors and adaptive thresholds.
- Add linked-market inconsistency detector.

Expected result: higher hit rate and better capital efficiency.

### Phase 3 (Weeks 7-12): Optimization
- Online weight updates by category.
- Event-triggered reevaluation loop (websocket + polling hybrid).
- Strong monitoring and anomaly alerting.

Expected result: faster reaction without rate-limit blowups.

### Phase 4 (Months 3-6): Advanced
- External signal connectors.
- Optional LLM uncertainty module for ambiguity-heavy markets.
- Scenario testing and stress simulation framework.

## 18.4 KPI dashboard specification

Track from day one:
- Net PnL, realized/unrealized PnL
- Brier/log-loss calibration by category and horizon
- Edge captured (predicted vs executed average edge)
- Slippage cost per trade
- Fee drag ratio
- Exposure concentration and correlation budget usage
- N/A loss attribution
- Bet acceptance/rejection reasons by qualifier

## 18.5 12-month target architecture

- Data plane: market/event ingest + portfolio state store.
- Decision plane: ensemble signals + calibration + risk optimizer.
- Execution plane: idempotent order manager + reconciliation.
- Observability: metrics, alerts, replay/backtest, postmortem tooling.

---

## Immediate implementation checklist for Dayli

1. Upgrade kelly.py to odds-based fractional Kelly with confidence and slippage caps.
2. Add cpmm execution simulator utility shared by strategy and risk modules.
3. Add N/A risk scoring to strategy qualifiers.
4. Add correlated exposure accounting in portfolio manager.
5. Add websocket listener for high-priority event triggers.
6. Add KPI CSV/JSON metrics for calibration and slippage.
7. Add arb scanner module for linked-market inconsistencies.

---

## Appendix A — Core formulas used in implementation

- CPMM invariant: K = YES^p * NO^(1-p)
- Probability: q = (p*NO)/((1-p)*YES + p*NO)
- YES shares from bet B:
  shares_yes = YES + B - ( K * (B + NO)^(p - 1) )^(1/p)
- NO shares from bet B:
  shares_no = NO + B - ( K * (B + YES)^(-p) )^(1/(1-p))
- Small-bet Kelly (binary approx):
  f* = (b*r - (1-r))/b, with b ≈ (1-q)/q for YES side

---

## Appendix B — Notes on uncertainty

Items requiring continuous empirical refresh (not constants):
- Exact fee mix by market type/tier over time.
- Category-specific alpha magnitudes.
- Arbitrage gap persistence distributions.
- Leaderboard strategy decomposition.

Recommended method:
- nightly ETL from official API + data dumps,
- rolling 30/90-day analytics,
- automated report generation.
