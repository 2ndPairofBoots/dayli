"""
Async REST client for Manifold Markets API.

Features:
- Async/await with aiohttp
- TTL caching for GET requests
- Exponential backoff on rate limits (429)
- Automatic retries on failures
- Type conversion to domain models
"""

import asyncio
import logging
import time
from typing import List, Dict, Optional, Any
from datetime import datetime, timedelta

import aiohttp

from .models import Market, Bet, User, LiteUser

logger = logging.getLogger(__name__)


class ManifoldClient:
    """Async client for Manifold Markets REST API."""
    
    def __init__(
        self,
        api_key: str,
        base_url: str = "https://api.manifold.markets",
        timeout: int = 10,
        max_retries: int = 3
    ):
        """
        Initialize Manifold client.
        
        Args:
            api_key: API key from https://manifold.markets/profile
            base_url: Base URL for API
            timeout: Request timeout in seconds
            max_retries: Max retries for failed requests
        """
        self.api_key = api_key
        self.base_url = base_url
        self.timeout = aiohttp.ClientTimeout(total=timeout)
        self.max_retries = max_retries
        
        self.session: Optional[aiohttp.ClientSession] = None
        self.cache: Dict[str, tuple] = {}  # {endpoint: (data, timestamp)}
        self.cache_ttl: Dict[str, int] = {}  # {endpoint: ttl_seconds}
        
        # Set default cache TTLs (in seconds)
        self._default_cache_ttl = {
            "/v0/markets": 30,  # Markets update frequently
            "/v0/me": 10,       # User balance important
            "/v0/bets": 30,
        }
    
    async def __aenter__(self):
        """Async context manager entry."""
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit."""
        await self.close()
    
    async def close(self):
        """Close the aiohttp session."""
        if self.session:
            await self.session.close()
    
    async def _ensure_session(self) -> aiohttp.ClientSession:
        """Lazily create and return aiohttp session."""
        if self.session is None:
            self.session = aiohttp.ClientSession(
                timeout=self.timeout,
                headers={"Authorization": f"Key {self.api_key}"}
            )
        return self.session
    
    def _get_cache_ttl(self, endpoint: str) -> int:
        """Get cache TTL for endpoint (default: no cache)."""
        return self._default_cache_ttl.get(endpoint, 0)
    
    def _is_cached(self, endpoint: str) -> bool:
        """Check if endpoint is in cache and not expired."""
        if endpoint not in self.cache:
            return False
        
        data, timestamp = self.cache[endpoint]
        ttl = self._get_cache_ttl(endpoint)
        
        if ttl <= 0:
            return False  # No cache for this endpoint
        
        age = time.time() - timestamp
        if age < ttl:
            logger.debug(f"Cache hit for {endpoint} (age: {age:.1f}s)")
            return True
        else:
            del self.cache[endpoint]  # Expired
            return False
    
    def _get_from_cache(self, endpoint: str) -> Optional[Any]:
        """Get data from cache if valid."""
        if self._is_cached(endpoint):
            return self.cache[endpoint][0]
        return None
    
    def _set_cache(self, endpoint: str, data: Any):
        """Store data in cache."""
        if self._get_cache_ttl(endpoint) > 0:
            self.cache[endpoint] = (data, time.time())
    
    async def _make_request(
        self,
        method: str,
        endpoint: str,
        **kwargs
    ) -> Any:
        """
        Make HTTP request with retries and caching.
        
        Retry logic:
        - Max 3 retries
        - Exponential backoff: 2^retry seconds
        - On 429 (rate limit): Wait longer
        - On 5xx: Retry
        - On 4xx (not 429): Fail immediately
        
        Args:
            method: HTTP method (GET, POST)
            endpoint: API endpoint path
            **kwargs: Additional arguments for aiohttp request
        
        Returns:
            Parsed JSON response
        """
        
        # Check cache for GET requests
        if method.upper() == "GET":
            cached = self._get_from_cache(endpoint)
            if cached is not None:
                return cached
        
        session = await self._ensure_session()
        url = f"{self.base_url}{endpoint}"
        
        retry_count = 0
        while retry_count < self.max_retries:
            try:
                logger.debug(f"{method} {endpoint}")
                
                async with session.request(method, url, **kwargs) as response:
                    text = await response.text()
                    
                    # Handle rate limiting (429)
                    if response.status == 429:
                        wait_time = 2 ** (retry_count + 1)
                        logger.warning(
                            f"Rate limited (429). Waiting {wait_time}s before retry."
                        )
                        await asyncio.sleep(wait_time)
                        retry_count += 1
                        continue
                    
                    # Handle other errors
                    if response.status >= 400:
                        logger.error(
                            f"{method} {endpoint} returned {response.status}: {text[:200]}"
                        )
                        if response.status < 500:
                            # Client error (not retriable)
                            response.raise_for_status()
                        else:
                            # Server error (retriable)
                            raise aiohttp.ClientError(f"Server error: {response.status}")
                    
                    # Success
                    data = await response.json()
                    
                    # Cache GET requests
                    if method.upper() == "GET":
                        self._set_cache(endpoint, data)
                    
                    return data
            
            except (aiohttp.ClientError, asyncio.TimeoutError) as e:
                retry_count += 1
                
                if retry_count >= self.max_retries:
                    logger.error(f"Max retries exceeded for {method} {endpoint}: {e}")
                    raise
                
                wait_time = 2 ** retry_count
                logger.warning(
                    f"Request failed ({type(e).__name__}). "
                    f"Retrying in {wait_time}s... (attempt {retry_count}/{self.max_retries})"
                )
                await asyncio.sleep(wait_time)
        
        raise Exception(f"Failed to get {endpoint} after {self.max_retries} retries")
    
    # --- Market Endpoints ---
    
    async def get_markets(
        self,
        limit: int = 100,
        offset: int = 0,
        sort: str = "created-time"
    ) -> List[Market]:
        """
        List all markets with pagination.
        
        Args:
            limit: Number of markets to fetch (max 1000)
            offset: Unused for v0 endpoint (kept for compatibility)
            sort: Sort order (created-time, updated-time, last-bet-time, last-comment-time)
        
        Returns:
            List of Market objects
        """
        limit = min(limit, 1000)  # Cap at 1000
        
        data = await self._make_request(
            "GET",
            "/v0/markets",
            params={"limit": limit, "sort": sort}
        )
        
        return [Market.from_dict(m) for m in data] if isinstance(data, list) else []
    
    async def get_market(self, market_id: str) -> Optional[Market]:
        """
        Get specific market by ID.
        
        Args:
            market_id: Market ID
        
        Returns:
            Market object or None if not found
        """
        try:
            data = await self._make_request("GET", f"/v0/market/{market_id}")
            return Market.from_dict(data)
        except Exception as e:
            logger.error(f"Failed to get market {market_id}: {e}")
            return None
    
    async def search_markets(
        self,
        query: str,
        limit: int = 100
    ) -> List[Market]:
        """
        Search for markets by question text.
        
        Args:
            query: Search query
            limit: Maximum results
        
        Returns:
            List of matching Market objects
        """
        data = await self._make_request(
            "GET",
            f"/v0/search-markets",
            params={"q": query, "limit": limit}
        )
        
        if isinstance(data, list):
            return [Market.from_dict(m) for m in data]
        elif isinstance(data, dict) and "markets" in data:
            return [Market.from_dict(m) for m in data["markets"]]
        else:
            return []
    
    # --- Bet Endpoints ---
    
    async def place_bet(
        self,
        market_id: str,
        outcome: str,
        amount: int,
        limit_prob: Optional[float] = None
    ) -> Optional[Bet]:
        """
        Place a bet on a market.
        
        Args:
            market_id: Market ID
            outcome: Outcome to bet on (YES, NO, or specific outcome)
            amount: Amount in mana to bet
            limit_prob: Optional limit probability (for conditional bet)
        
        Returns:
            Placed Bet object or None if failed
        """
        payload = {
            "contractId": market_id,
            "outcome": outcome,
            "amount": amount
        }
        
        if limit_prob is not None:
            payload["limitProb"] = limit_prob
        
        try:
            data = await self._make_request("POST", "/v0/bet", json=payload)
            return Bet.from_dict(data)
        except Exception as e:
            logger.error(f"Failed to place bet on {market_id}: {e}")
            return None
    
    async def get_bets(
        self,
        market_id: Optional[str] = None,
        user_id: Optional[str] = None,
        limit: int = 100
    ) -> List[Bet]:
        """
        Get list of bets.
        
        Args:
            market_id: Filter by market
            user_id: Filter by user (your bets)
            limit: Maximum results
        
        Returns:
            List of Bet objects
        """
        params = {"limit": limit}
        if market_id:
            params["contractId"] = market_id
        if user_id:
            params["userId"] = user_id
        
        data = await self._make_request("GET", "/v0/bets", params=params)
        
        return [Bet.from_dict(b) for b in data] if isinstance(data, list) else []
    
    # --- User Endpoints ---
    
    async def get_user(self) -> Optional[User]:
        """
        Get current user info and balance.
        
        Returns:
            User object or None if failed
        """
        try:
            data = await self._make_request("GET", "/v0/me")
            return User.from_dict(data)
        except Exception as e:
            logger.error(f"Failed to get user: {e}")
            return None
    
    async def get_portfolio(self, username: Optional[str] = None) -> Dict[str, Any]:
        """
        Get user portfolio (positions).
        
        Args:
            username: Username (default: current user)
        
        Returns:
            Portfolio data dictionary
        """
        endpoint = "/v0/portfolio"
        if username:
            endpoint += f"/{username}"
        
        try:
            return await self._make_request("GET", endpoint)
        except Exception as e:
            logger.error(f"Failed to get portfolio: {e}")
            return {}
    
    # --- Health Check ---
    
    async def health_check(self) -> bool:
        """
        Check if API is accessible.
        
        Returns:
            True if API is reachable, False otherwise
        """
        try:
            user = await self.get_user()
            return user is not None
        except Exception:
            return False


async def test_client():
    """Quick test of the API client."""
    import os
    
    api_key = os.getenv("MANIFOLD_API_KEY")
    if not api_key:
        print("ERROR: MANIFOLD_API_KEY not set in environment")
        return
    
    async with ManifoldClient(api_key) as client:
        # Test health check
        print("Testing API connection...")
        is_healthy = await client.health_check()
        print(f"✓ Health check: {is_healthy}")
        
        # Test get user
        print("\nFetching user info...")
        user = await client.get_user()
        if user:
            print(f"✓ User: {user.username}")
            print(f"  Balance: {user.balance} mana")
        
        # Test get markets
        print("\nFetching markets...")
        markets = await client.get_markets(limit=5)
        print(f"✓ Fetched {len(markets)} markets")
        if markets:
            market = markets[0]
            print(f"  Latest: {market.question[:60]}...")
            print(f"    Liquidity: {market.liquidity:.2f}")
            print(f"    Volume: {market.volume:.2f}")
            print(f"    Outcomes: {market.outcomes}")
            print(f"    Probabilities: {market.probability}")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(test_client())
