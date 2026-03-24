"""Entry point for Dayli trading bot."""

import asyncio
import os
import logging
import sys
from pathlib import Path

# Add src to path so we can import modules
sys.path.insert(0, str(Path(__file__).parent / "src"))

from core import main


def setup_environment():
    """Load environment variables and validate setup."""
    
    from dotenv import load_dotenv
    
    # Load .env file
    env_file = Path(__file__).parent.parent / ".env"
    if env_file.exists():
        load_dotenv(env_file)
    
    # Validate API key
    api_key = os.getenv("MANIFOLD_API_KEY")
    if not api_key:
        print("ERROR: MANIFOLD_API_KEY not found in environment")
        print("Set it in .env file or environment variable")
        return None
    
    return api_key


if __name__ == "__main__":
    print("=" * 60)
    print("DAYLI - Manifold Markets Trading Bot")
    print("=" * 60)
    
    # Setup
    api_key = setup_environment()
    if not api_key:
        sys.exit(1)
    
    # Get config from environment
    poll_interval = int(os.getenv("BOT_CHECK_INTERVAL", "60"))
    risk_profile = os.getenv("RISK_PROFILE", "moderate")
    paper_trading = os.getenv("PAPER_TRADING_MODE", "true").lower() == "true"
    
    print(f"✓ API key loaded")
    print(f"✓ Poll interval: {poll_interval}s")
    print(f"✓ Risk profile: {risk_profile}")
    print(f"✓ Paper trading: {paper_trading}")
    print()
    
    # Run bot
    try:
        asyncio.run(main(
            api_key=api_key,
            poll_interval=poll_interval,
            risk_profile=risk_profile,
            paper_trading=paper_trading
        ))
    except KeyboardInterrupt:
        print("\nBot stopped by user")
    except Exception as e:
        print(f"\nError: {e}")
        logging.exception(e)
        sys.exit(1)
