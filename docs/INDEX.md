# Dayli Project - Complete Documentation Index

## 📚 Documentation Structure

### Foundation Documents
- **[README.md](README.md)** - Project overview, features, tech stack
- **[.instructions.md](.instructions.md)** - VS Code Copilot instructions for the project

### Research & Planning
- **[docs/RESEARCH_SUMMARY.md](docs/RESEARCH_SUMMARY.md)** ⭐ START HERE
  - Key takeaways from 5+ production bot implementations
  - Architecture decisions & rationale
  - Realistic performance targets
  - Quick reference guide

- **[docs/RESEARCH_BEST_PRACTICES.md](docs/RESEARCH_BEST_PRACTICES.md)** - Deep dive
  - Detailed analysis of successful bot patterns
  - Risk management strategies
  - Common pitfalls & solutions
  - Learning path for implementation

### Architecture & Design
- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** - System design
  - High-level component diagram
  - Integration points & data models
  - Deployment architecture
  - Security considerations

- **[docs/API_REFERENCE.md](docs/API_REFERENCE.md)** - Manifold Markets API
  - Endpoint documentation
  - Bet types & examples
  - Rate limits & error handling
  - Best practices

### Implementation
- **[docs/IMPLEMENTATION_GUIDE.md](docs/IMPLEMENTATION_GUIDE.md)** - Code structure
  - Complete file-by-file layout
  - Code patterns with examples
  - Core components (API client, models, strategies)
  - Kelly Criterion formula & usage

- **[docs/EXECUTION_ROADMAP.md](docs/EXECUTION_ROADMAP.md)** - 2-week MVP plan
  - Daily breakdown (10 days)
  - Task descriptions & success criteria
  - Time estimates
  - Go/no-go decision points
  - Deployment next steps

### Setup & Configuration
- **[docs/SETUP.md](docs/SETUP.md)** - Installation guide
  - Prerequisites
  - Step-by-step setup
  - Development server startup
  - Troubleshooting

- **[config/example.env](config/example.env)** - Configuration template
  - API settings
  - Trading parameters (position size, risk limits)
  - Strategy thresholds
  - Scheduling options

- **[config/requirements.txt](config/requirements.txt)** - Python dependencies
- **[config/package.json](config/package.json)** - Node.js dependencies

## 🗺️ Where to Go Based on Your Task

### "I want to understand the project"
1. Read [RESEARCH_SUMMARY.md](docs/RESEARCH_SUMMARY.md) (10 min)
2. Read [ARCHITECTURE.md](docs/ARCHITECTURE.md) (15 min)
3. Skim [IMPLEMENTATION_GUIDE.md](docs/IMPLEMENTATION_GUIDE.md) (10 min)

### "I want to start coding"
1. Follow [SETUP.md](docs/SETUP.md) (5 min setup)
2. Follow [EXECUTION_ROADMAP.md](docs/EXECUTION_ROADMAP.md) Day 1-5
3. Reference [IMPLEMENTATION_GUIDE.md](docs/IMPLEMENTATION_GUIDE.md) for code patterns

### "I want deep technical details"
1. [RESEARCH_BEST_PRACTICES.md](docs/RESEARCH_BEST_PRACTICES.md) - Patterns & pitfalls
2. [IMPLEMENTATION_GUIDE.md](docs/IMPLEMENTATION_GUIDE.md) - Code examples
3. [API_REFERENCE.md](docs/API_REFERENCE.md) - Manifold specifics

### "I want to understand risk management"
1. [EXECUTION_ROADMAP.md](docs/EXECUTION_ROADMAP.md) - Day 3 (Kelly Criterion)
2. [IMPLEMENTATION_GUIDE.md](docs/IMPLEMENTATION_GUIDE.md) - Kelly Criterion section
3. [RESEARCH_BEST_PRACTICES.md](docs/RESEARCH_BEST_PRACTICES.md) - Risk Management pattern

### "I'm stuck debugging"
1. [RESEARCH_BEST_PRACTICES.md](docs/RESEARCH_BEST_PRACTICES.md) - Common Pitfalls
2. [SETUP.md](docs/SETUP.md) - Troubleshooting section
3. Check logs in `logs/` directory (created at runtime)

## 🎯 Quick Navigation

### Key Concepts
- **Kelly Criterion**: [Implementation Guide](docs/IMPLEMENTATION_GUIDE.md#4-kelly-criterion-sizing-srcriskkelly) | [Best Practices](docs/RESEARCH_BEST_PRACTICES.md#pattern-4-risk-management)
- **API Client**: [Implementation Guide](docs/IMPLEMENTATION_GUIDE.md#1-api-client-srcapiclient) | [API Reference](docs/API_REFERENCE.md)
- **Strategy Framework**: [Implementation Guide](docs/IMPLEMENTATION_GUIDE.md#3-strategy-framework) | [Best Practices](docs/RESEARCH_BEST_PRACTICES.md#pattern-3-strategy-framework)
- **Event Loop**: [Implementation Guide](docs/IMPLEMENTATION_GUIDE.md#5-event-loop-srccorepy) | [Best Practices](docs/RESEARCH_BEST_PRACTICES.md#pattern-5-event-loop-design)
- **Risk Management**: [Best Practices](docs/RESEARCH_BEST_PRACTICES.md#pattern-4-risk-management) | [Roadmap](docs/EXECUTION_ROADMAP.md#day-3-portfolio--risk)

### Core Files
- API Client: `backend/src/api/client.py` (build Day 1)
- Domain Models: `backend/src/api/models.py` (build Day 1)
- Strategies: `backend/src/strategies/base_strategy.py` (build Day 2)
- Portfolio: `backend/src/portfolio/manager.py` (build Day 3)
- Risk: `backend/src/risk/kelly.py` (build Day 3)
- Event Loop: `backend/src/core.py` (build Day 4)
- Logging: `backend/src/logger/csv_logger.py` (build Day 5)

### Configuration Files
- `.env` - API key & trading parameters (copy from `config/example.env`)
- `requirements.txt` - Python dependencies
- `package.json` - Node.js dependencies (if using Node.js)

## 📊 Project Timeline

### Week 1: Core Infrastructure
- **Day 1**: API Client + Models
- **Day 2**: Strategy Framework
- **Day 3**: Portfolio + Risk Management
- **Day 4**: Event Loop
- **Day 5**: Logging

✅ Deliverable: Working bot in paper trading mode

### Week 2: Testing & Enhancement
- **Day 6-7**: 1-week paper trading validation
- **Day 8-9**: Improvements + Dashboard
- **Day 10**: Cleanup & Documentation

✅ Deliverable: Production-ready for small live trading

### Week 3+: Scale & Optimize
- WebSocket integration (optional)
- Database migration
- Cloud deployment
- Multi-strategy scaling

## 🚀 Getting Started Now

```bash
# 1. Navigate to project
cd dayli

# 2. Read the summary
cat docs/RESEARCH_SUMMARY.md

# 3. Set up Python environment
python -m venv venv
source venv/bin/activate

# 4. Install dependencies
pip install -r config/requirements.txt

# 5. Configure API key
cp config/example.env .env
# Edit .env with your Manifold API key

# 6. Start building (follow EXECUTION_ROADMAP.md)
# Day 1: Create backend/src/api/client.py
```

## 📞 Reference Quick Links

- **Manifold Markets Docs**: https://docs.manifold.markets/
- **Sketchy Bot Framework**: https://github.com/sketchy-manifold/sketchy-bot-framework
- **Better Manifold Bot**: https://github.com/sachin-detrax/better_manifold_bot
- **Dayli Dashboard Reference**: https://2ndpairofboots.github.io/dayli/

## ✅ Checklist for MVP Completion

### Infrastructure (Week 1)
- [ ] API Client (REST, retries, caching)
- [ ] Domain Models (Market, Bet, User)
- [ ] Strategy Framework (qualifiers, propose_bet)
- [ ] Portfolio Manager + Kelly Sizing
- [ ] Event Loop (polling)
- [ ] CSV Logging
- [ ] Basic error handling

### Validation (Week 2)
- [ ] Paper trading passes 7-day test
- [ ] Win rate > 50%
- [ ] Positive P&L
- [ ] Max drawdown < 15%
- [ ] CSV logs showing all activity
- [ ] No crashes over 1 week runtime

### Production Ready
- [ ] Documentation complete
- [ ] Code reviewed & cleaned
- [ ] Config externalized (.env)
- [ ] Error handling robust
- [ ] Monitoring in place
- [ ] Deployment guide written

## 📝 Notes

- **MVP Goal**: Simple, working bot in 2 weeks
- **MVP Size**: ~2000 lines of Python
- **MVP Focus**: Reliability over features
- **Next Phase**: Ensemble strategy + dashboard
- **Later**: WebSocket, database, cloud

---

**Last Updated**: March 24, 2026
**Status**: Ready for implementation
**Next Action**: Follow EXECUTION_ROADMAP.md starting Day 1
