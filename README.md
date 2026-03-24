# Dayli - Manifold Markets Trading Bot

An AI-powered automated trading bot for Manifold Markets with real-time dashboard analytics.

## Project Overview

Dayli is a prediction market trading automation system that:
- Automatically identifies and executes trades on Manifold Markets
- Provides real-time performance metrics and portfolio tracking
- Implements intelligent risk management and position sizing
- Offers strategic suggestions based on market analysis

## Reference Projects

- **Dayli Dashboard**: https://2ndpairofboots.github.io/dayli/ (UI/UX reference)
- **Manifold Markets Skill**: https://github.com/Thomas-Lemoine/manifold-markets-skill (API reference)

## Project Structure

```
dayli/
├── docs/                 # Project documentation
├── backend/              # Trading bot and API logic
├── frontend/             # Dashboard UI components
├── config/               # Configuration files and templates
├── tests/                # Testing suite
├── .instructions.md      # Copilot instructions
└── README.md             # This file
```

## Tech Stack (Planned)

- **Backend**: Python/Node.js (async, event-driven)
- **Frontend**: React/Vue with TypeScript
- **Real-time**: WebSocket for market updates
- **Data**: Supabase for bulk data, local DB for bot state
- **Monitoring**: Logging, metrics, alerts

## Getting Started

See [docs/SETUP.md](docs/SETUP.md) for installation and configuration.

## Key Features

### Dashboard
- Real-time balance and P&L tracking (1D, 1W, 1M, LIFE)
- Win rate and resolved market statistics
- Portfolio breakdown by strategy
- Recent trades log with outcomes
- Bot suggestions from strategy model

### Trading Engine
- REST & WebSocket API integration
- Standard bets, limit orders, multi-outcome bets
- AMM math and orderbook simulation
- Intelligent position sizing
- Risk controls (slip cap, max drawdown)

### Monitoring
- Comprehensive logging
- Performance metrics
- Error alerts and recovery
- Paper trading mode for validation

## Development Phases

1. ✅ Planning & Architecture
2. API client implementation
3. Trading engine & strategy model
4. Dashboard UI
5. Integration & testing
6. Production deployment
