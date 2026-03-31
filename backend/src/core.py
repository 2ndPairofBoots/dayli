"""
Main event loop for Dayli trading bot.

Polling loop that:
1. Fetches markets
2. Evaluates strategies
3. Places bets
4. Updates portfolio
5. Logs events
"""

import asyncio
import contextlib
import logging
import os
from dataclasses import asdict
from datetime import datetime
from typing import List, Optional

import aiohttp

from api.client import ManifoldClient
from api.models import Market, StrategyResult, PlaceBetEvent, PortfolioEvent, ErrorEvent
from strategies.base_strategy import BaseTradingStrategy
from portfolio.manager import PortfolioManager
from risk.kelly import RiskManager, create_risk_manager_from_profile
from logger.csv_logger import CSVLogger
from logger.data_uploader import DataUploader
from execution.cpmm import build_state_from_market, simulate_cpmm_execution
from analysis.arb_scanner import scan_linked_market_spreads

logger = logging.getLogger(__name__)


class Core:
    """Main event loop for trading bot."""
    
    def __init__(
        self,
        client: ManifoldClient,
        strategies: List[BaseTradingStrategy],
        portfolio: PortfolioManager,
        risk_mgr: RiskManager,
        csv_logger: CSVLogger,
        data_uploader: Optional[DataUploader] = None,
        max_bets_per_cycle: int = 10
    ):
        """
        Initialize core bot logic.
        
        Args:
            client: ManifoldClient instance
            strategies: List of trading strategies
            portfolio: PortfolioManager instance
            risk_mgr: RiskManager instance
            csv_logger: CSVLogger instance
        """
        self.client = client
        self.strategies = strategies
        self.portfolio = portfolio
        self.risk_mgr = risk_mgr
        self.csv_logger = csv_logger
        self.data_uploader = data_uploader
        self.max_bets_per_cycle = max(1, int(max_bets_per_cycle))
        
        self.cycle_count = 0
        self.bets_placed = 0
        self._cycle_bets_taken = 0
        self._cycle_keys = set()
        self._cycle_bet_lock = asyncio.Lock()
        self.paper_trading = True
        self.arb_signals_count = 0

        self.max_category_exposure_ratio = float(os.getenv("MAX_CATEGORY_EXPOSURE_RATIO", "0.15"))
        self.estimated_fee_rate = float(os.getenv("ESTIMATED_FEE_RATE", "0.02"))
        self.slip_cap = float(os.getenv("SLIP_CAP", "0.02"))

        self._wake_event = asyncio.Event()
        self._ws_task: Optional[asyncio.Task] = None
    
    async def run(
        self,
        poll_interval: int = 60,
        market_limit: int = 1000,
        paper_trading: bool = True
    ):
        """
        Main event loop.
        
        Args:
            poll_interval: Seconds between polls
            market_limit: Max markets to evaluate per cycle
            paper_trading: If True, simulate trades (no real bets)
        """
        
        logger.info("=" * 60)
        logger.info("DAYLI TRADING BOT STARTING")
        logger.info(f"Paper trading: {paper_trading}")
        logger.info(f"Poll interval: {poll_interval}s")
        logger.info(f"Strategies: {len(self.strategies)}")
        logger.info("=" * 60)

        self.paper_trading = paper_trading
        self._ws_task = asyncio.create_task(self._ws_listener())
        
        await self.portfolio_snapshot()  # Initial snapshot
        
        while True:
            try:
                self.cycle_count += 1
                self._cycle_bets_taken = 0
                self._cycle_keys = set()
                cycle_start = datetime.now()
                
                # Log cycle start
                logger.info(f"\n[Cycle {self.cycle_count}] Starting at {cycle_start.strftime('%H:%M:%S')}")
                
                # Fetch markets
                logger.info(f"Fetching up to {market_limit} markets...")
                markets = await self.client.get_markets(limit=market_limit)
                logger.info(f"✓ Loaded {len(markets)} markets")

                if self.data_uploader and self.data_uploader.enabled:
                    await self.data_uploader.upload_event(
                        "market_snapshot",
                        {
                            "cycle": self.cycle_count,
                            "marketCount": len(markets),
                            "markets": [m.raw_data or asdict(m) for m in markets],
                        },
                    )
                
                if not markets:
                    logger.warning("No markets loaded, waiting...")
                    await asyncio.sleep(poll_interval)
                    continue
                
                # Evaluate strategies on all markets
                cycle_bets = await self.evaluate_markets(markets, paper_trading)
                self._run_arb_scan(markets)
                
                # Log cycle summary
                cycle_time = (datetime.now() - cycle_start).total_seconds()
                logger.info(
                    f"✓ Cycle {self.cycle_count} complete: "
                    f"bets placed={cycle_bets}, time={cycle_time:.1f}s"
                )
                
                # Portfolio snapshot every 10 cycles or after placing bets
                if self.cycle_count % 10 == 0 or cycle_bets > 0:
                    await self.portfolio_snapshot()
                
                # Check circuit breaker
                if not self.risk_mgr.check_circuit_breaker():
                    logger.critical("CIRCUIT BREAKER TRIGGERED - STOPPING BOT")
                    break
                
                # Wait before next cycle
                logger.info(f"Sleeping {poll_interval}s until next cycle...")
                try:
                    await asyncio.wait_for(self._wake_event.wait(), timeout=poll_interval)
                    self._wake_event.clear()
                    logger.info("Fast trigger event received; running next cycle immediately")
                except asyncio.TimeoutError:
                    pass
            
            except KeyboardInterrupt:
                logger.info("Bot stopped by user (Ctrl+C)")
                break
            
            except Exception as e:
                logger.error(f"Error in main loop: {e}", exc_info=True)
                
                # Log error event
                error_event = ErrorEvent(
                    timestamp=datetime.now(),
                    error_type=type(e).__name__,
                    message=str(e),
                    traceback=None
                )
                self.csv_logger.log_error(error_event)
                if self.data_uploader and self.data_uploader.enabled:
                    await self.data_uploader.upload_event("error_event", asdict(error_event))
                
                # Continue after error
                await asyncio.sleep(poll_interval)

        if self._ws_task:
            self._ws_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._ws_task

    def _run_arb_scan(self, markets: List[Market]):
        """Phase-2 baseline arbitrage scan on linked binary markets."""
        signals = scan_linked_market_spreads(markets, min_prob_spread=0.15)
        self.arb_signals_count = len(signals)
        if signals:
            top = signals[0]
            logger.info(
                "Arb scan: %s signals. Top spread %.1f%% between %s and %s",
                len(signals),
                top.spread * 100,
                top.market_a,
                top.market_b,
            )

    async def _ws_listener(self):
        """Websocket listener to trigger fast cycles on high-signal public events."""
        ws_url = os.getenv("MANIFOLD_WS_URL", "wss://api.manifold.markets/ws")
        while True:
            try:
                session = await self.client._ensure_session()
                async with session.ws_connect(ws_url, heartbeat=30) as ws:
                    await ws.send_json(
                        {
                            "type": "subscribe",
                            "txid": 1,
                            "topics": ["global/new-bet", "global/updated-contract"],
                        }
                    )
                    async for msg in ws:
                        if msg.type != aiohttp.WSMsgType.TEXT:
                            continue
                        try:
                            payload = msg.json()
                        except Exception:
                            continue
                        if payload.get("type") == "broadcast":
                            self._wake_event.set()
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.warning("Websocket listener error: %s", exc)
                await asyncio.sleep(5)

    def _extract_category(self, market: Market) -> str:
        raw = market.raw_data or {}
        slugs = raw.get("groupSlugs")
        if isinstance(slugs, list) and slugs:
            return str(slugs[0])
        q = (market.question or "").lower()
        if "election" in q or "president" in q or "senate" in q:
            return "politics"
        if "match" in q or "game" in q or "vs" in q or "tournament" in q:
            return "sports"
        if "stock" in q or "bitcoin" in q or "price" in q:
            return "finance"
        return "general"
    
    async def evaluate_markets(self, markets: List[Market], paper_trading: bool = True) -> int:
        """
        Evaluate all strategies on all markets.
        
        Args:
            markets: List of markets to evaluate
            paper_trading: If True, simulate trades
        
        Returns:
            Number of bets placed in this cycle
        """
        
        bets_placed_this_cycle = 0
        # Evaluate all strategies concurrently on all markets
        tasks = [
            self.evaluate_and_execute(market, strategy, paper_trading)
            for market in markets
            for strategy in self.strategies
        ]
        
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Count successful bets
        for result in results:
            if isinstance(result, int) and result > 0:
                bets_placed_this_cycle += 1
        
        return bets_placed_this_cycle
    
    async def evaluate_and_execute(
        self,
        market: Market,
        strategy: BaseTradingStrategy,
        paper_trading: bool = True
    ) -> int:
        """
        Evaluate market with strategy and execute bet if proposed.
        
        Args:
            market: Market to evaluate
            strategy: Strategy to use
            paper_trading: If True, simulate trade
        
        Returns:
            Number of bets placed (0 or 1)
        """
        
        try:
            eval_start = datetime.now()
            
            # Evaluate strategy
            result = await strategy.evaluate_and_propose(market)
            
            eval_time = (datetime.now() - eval_start).total_seconds() * 1000
            
            # Log strategy evaluation
            if result.proposed_bets:
                decision = "proposed"
                confidence = result.proposed_bets[0].confidence
            else:
                decision = "qualified" if not result.log_event else "disqualified"
                confidence = 0.0
            
            # Log if placed or disqualified
            if decision in ["proposed", "disqualified"]:
                from api.models import StrategyEvent
                event = StrategyEvent(
                    timestamp=datetime.now(),
                    strategy_name=strategy.name,
                    market_id=market.id,
                    market_question=market.question[:50],
                    decision=decision,
                    confidence=confidence,
                    latency_ms=eval_time
                )
                self.csv_logger.log_strategy(event)
                if self.data_uploader and self.data_uploader.enabled:
                    await self.data_uploader.upload_event("strategy_event", asdict(event))
            
            # Execute if bet proposed
            if not result.proposed_bets:
                return 0
            
            proposed = result.proposed_bets[0]
            cycle_key = f"{market.id}:{proposed.outcome}:{strategy.name}"
            if cycle_key in self._cycle_keys:
                return 0
            category = self._extract_category(market)

            # Slippage-aware pre-trade estimate.
            cpmm_state = build_state_from_market(market)
            exec_estimate = simulate_cpmm_execution(
                cpmm_state,
                proposed.outcome,
                amount=float(proposed.size),
                fee_rate=self.estimated_fee_rate,
            )
            slippage_penalty = min(self.slip_cap, exec_estimate.slippage)
            
            # Apply Kelly sizing
            kelly_size = self.risk_mgr.calculate_position_size(
                market.get_answer_probability(proposed.outcome),
                proposed.confidence,
                current_invested=int(self.portfolio.get_total_invested()),
                confidence=proposed.confidence,
                slippage_penalty=slippage_penalty,
            )
            
            if kelly_size == 0:
                logger.debug(f"Kelly sizing resulted in 0 size for {market.id}")
                return 0
            
            # Final size (Kelly or proposed, whichever is smaller)
            final_size = min(kelly_size, proposed.size)
            
            if final_size < 1:
                return 0

            if not self.portfolio.can_add_category_exposure(
                category=category,
                additional_notional=float(final_size),
                max_ratio=self.max_category_exposure_ratio,
            ):
                logger.info(
                    "Skipping %s due to category exposure cap (%s)",
                    market.id,
                    category,
                )
                return 0
            
            # Execute bet
            if not paper_trading:
                async with self._cycle_bet_lock:
                    if self._cycle_bets_taken >= self.max_bets_per_cycle:
                        logger.info(
                            f"Skipping {market.id}: reached per-cycle bet cap "
                            f"({self.max_bets_per_cycle})"
                        )
                        return 0
                    self._cycle_bets_taken += 1
                    self._cycle_keys.add(cycle_key)
            else:
                self._cycle_keys.add(cycle_key)

            logger.info(
                f"Executing bet: {strategy.name} on {market.id} "
                f"{proposed.outcome} {final_size}m"
            )
            
            if paper_trading:
                # Simulate bet execution
                logger.debug(f"[PAPER] Would place {final_size}m on {proposed.outcome}")
                actual_cost = final_size  # Simplified
                estimated = simulate_cpmm_execution(
                    cpmm_state,
                    proposed.outcome,
                    amount=float(final_size),
                    fee_rate=self.estimated_fee_rate,
                )
                self.portfolio.add_position(
                    market.id,
                    market.question,
                    proposed.outcome,
                    estimated.shares,
                    estimated.avg_price,
                    category=category,
                    fee_paid=(final_size * self.estimated_fee_rate),
                    slippage_paid=estimated.slippage,
                )
            else:
                # Real bet
                bet = await self.client.place_bet(
                    market.id,
                    proposed.outcome,
                    final_size
                )
                
                if not bet:
                    logger.error(f"Failed to place bet on {market.id}")
                    return 0
                
                # Update portfolio
                self.portfolio.add_position(
                    market.id,
                    market.question,
                    proposed.outcome,
                    bet.shares,
                    bet.execution_price,
                    category=category,
                    fee_paid=(final_size * self.estimated_fee_rate),
                    slippage_paid=slippage_penalty,
                )
                
                actual_cost = float(bet.amount_bet)
            
            # Log placed bet
            bet_event = PlaceBetEvent(
                timestamp=datetime.now(),
                market_id=market.id,
                market_question=market.question[:80],
                outcome=proposed.outcome,
                size=final_size,
                probability=market.get_answer_probability(proposed.outcome),
                strategy_name=strategy.name,
                reason=proposed.reason,
                actual_cost=actual_cost
            )
            self.csv_logger.log_place_bet(bet_event)
            if self.data_uploader and self.data_uploader.enabled:
                await self.data_uploader.upload_event("place_bet_event", asdict(bet_event))
            
            self.bets_placed += 1
            return 1
        
        except Exception as e:
            logger.error(f"Error evaluating {strategy.name} on {market.id}: {e}")
            return 0
    
    async def portfolio_snapshot(self):
        """Log current portfolio metrics."""
        
        # Get latest balance from API
        user = await self.client.get_user()
        if user:
            snapshot_balance = user.cash_balance
            if self.paper_trading and user.total_balance > 0:
                snapshot_balance = user.total_balance
            self.portfolio.balance = snapshot_balance
        
        metrics = self.portfolio.get_metrics()
        
        event = PortfolioEvent(
            timestamp=datetime.now(),
            balance=metrics.balance,
            invested=metrics.invested,
            p_and_l=metrics.profit,
            win_rate=self.portfolio.get_win_rate(),
            fees_paid=self.portfolio.total_fees_paid,
            slippage_paid=self.portfolio.total_slippage_paid,
            trades_count=self.portfolio.trades_count,
            arb_signals_count=self.arb_signals_count,
        )
        
        self.csv_logger.log_portfolio(event)
        if self.data_uploader and self.data_uploader.enabled:
            payload = asdict(event)
            if user:
                payload["user"] = asdict(user)
            await self.data_uploader.upload_event("portfolio_event", payload)
        
        logger.info(
            f"Portfolio: balance={metrics.balance:.0f}, "
            f"invested={metrics.invested:.0f}, "
            f"pnl={metrics.profit:+.0f} ({metrics.profit_percent:+.1f}%), "
            f"positions={len(self.portfolio.positions)}"
        )


async def main(
    api_key: str,
    poll_interval: int = 60,
    risk_profile: str = "moderate",
    paper_trading: bool = True
):
    """
    Main entry point for bot.
    
    Args:
        api_key: Manifold API key
        poll_interval: Seconds between market checks
        risk_profile: Risk profile (conservative, moderate, aggressive)
        paper_trading: If True, simulate trades
    """
    
    # Setup logging
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    # Initialize components
    client = ManifoldClient(api_key)
    
    # Check API connection
    is_healthy = await client.health_check()
    if not is_healthy:
        logger.error("Cannot connect to Manifold API - check API key")
        return
    
    # Get user info
    user = await client.get_user()
    if not user:
        logger.error("Failed to get user info")
        return
    
    logger.info(
        f"Connected as: {user.username} "
        f"(cash_balance: {user.cash_balance:.2f} mana, total_balance: {user.total_balance:.2f} mana)"
    )

    if not paper_trading and user.cash_balance <= 0:
        logger.warning(
            "Live mode requested, but cash balance is 0. Switching to paper trading until funded."
        )
        paper_trading = True

    # In paper mode, use total_balance for simulation sizing if available.
    initial_balance = user.cash_balance
    if paper_trading and user.total_balance > 0:
        initial_balance = user.total_balance
    logger.info(f"Using initial balance for this run: {initial_balance:.2f} mana")
    
    # Initialize managers
    portfolio = PortfolioManager(initial_balance=initial_balance)
    risk_mgr = create_risk_manager_from_profile(initial_balance, profile=risk_profile)
    csv_logger = CSVLogger()
    data_uploader = None

    upload_enabled = os.getenv("BOT_UPLOAD_ENABLED", "false").lower() == "true"
    upload_url = os.getenv("BOT_UPLOAD_URL", "").strip()
    if upload_enabled and upload_url:
        data_uploader = DataUploader(
            upload_url=upload_url,
            api_key=os.getenv("BOT_UPLOAD_API_KEY", "").strip() or None,
            source=os.getenv("BOT_UPLOAD_SOURCE", "dayli-bot"),
            timeout_seconds=int(os.getenv("BOT_UPLOAD_TIMEOUT_SECONDS", "15")),
            max_retries=int(os.getenv("BOT_UPLOAD_MAX_RETRIES", "3")),
            enabled=True,
        )
        logger.info("External data upload is enabled")
    elif upload_enabled:
        logger.warning("BOT_UPLOAD_ENABLED=true but BOT_UPLOAD_URL is empty; uploads disabled")
    
    # Initialize strategies
    from strategies.base_strategy import SimpleStrategy
    strategy_config = {
        "min_liquidity": float(os.getenv("MIN_MARKET_LIQUIDITY", "50")),
        "min_volume": float(os.getenv("MARKET_VOLUME_THRESHOLD", "250")),
        "min_age_hours": int(os.getenv("MIN_MARKET_AGE_HOURS", "0")),
        "max_resolution_risk": int(os.getenv("MAX_RESOLUTION_RISK", "2")),
        "underpriced_threshold": float(os.getenv("UNDERPRICED_THRESHOLD", "0.40")),
        "confidence": float(os.getenv("PREDICTION_THRESHOLD", "0.58")),
        "default_size": int(os.getenv("DEFAULT_BET_SIZE", "75")),
    }
    strategies = [
        SimpleStrategy("SimpleStrategy", client, config=strategy_config)
    ]
    
    # Run bot
    core = Core(
        client,
        strategies,
        portfolio,
        risk_mgr,
        csv_logger,
        data_uploader=data_uploader,
        max_bets_per_cycle=int(os.getenv("MAX_BETS_PER_CYCLE", "10")),
    )
    
    try:
        await core.run(
            poll_interval=poll_interval,
            market_limit=1000,
            paper_trading=paper_trading
        )
    finally:
        csv_logger.close()
        if data_uploader:
            await data_uploader.close()
        await client.close()


if __name__ == "__main__":
    import sys
    
    api_key = os.getenv("MANIFOLD_API_KEY")
    if not api_key:
        print("ERROR: MANIFOLD_API_KEY environment variable not set")
        sys.exit(1)
    
    asyncio.run(main(api_key, paper_trading=True))
