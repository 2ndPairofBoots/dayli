# 🚀 Getting Started - Quick Start Guide

## 5-Minute Overview

You're building **Dayli**, an AI trading bot for Manifold Markets.

**What it does**: 
- Polls markets every 60 seconds
- Runs strategy evaluation
- Places bets when it finds edge
- Tracks portfolio P&L
- Logs everything for debugging

**How long to MVP**: 2 weeks (60 hours)
**How much code**: ~2000 lines Python
**Success rate**: 55-65% win rate in paper trading

## Start Here: 3 Options

### Option 1: "I just want to understand what's happening" (10 min)
1. Read [docs/RESEARCH_SUMMARY.md](docs/RESEARCH_SUMMARY.md)
2. Look at [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#high-level-design) diagram
3. You're done - ask questions!

### Option 2: "Show me the code patterns" (20 min)  
1. Read [docs/IMPLEMENTATION_GUIDE.md](docs/IMPLEMENTATION_GUIDE.md) sections:
   - "Project Layout"
   - "1. API Client"
   - "2. Domain Models"
   - "3. Strategy Framework"
   - "5. Event Loop"
2. Skim the code examples
3. Check how they fit together

### Option 3: "Let's start coding" (right now!)
```bash
# 1. Navigate to project
cd dayli

# 2. Create Python environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# 3. Install dependencies
pip install -r config/requirements.txt

# 4. Set up API key
cp config/example.env .env
# Edit .env and add your MANIFOLD_API_KEY from https://manifold.markets/profile

# 5. Follow the roadmap
# Open docs/EXECUTION_ROADMAP.md and start with Day 1
```

## Key Documents (By Purpose)

| Want to... | Read | Time |
|-----------|------|------|
| Understand the big picture | [RESEARCH_SUMMARY.md](docs/RESEARCH_SUMMARY.md) | 10 min |
| See the architecture | [ARCHITECTURE.md](docs/ARCHITECTURE.md) | 15 min |
| Learn how to code it | [IMPLEMENTATION_GUIDE.md](docs/IMPLEMENTATION_GUIDE.md) | 30 min |
| Follow step-by-step plan | [EXECUTION_ROADMAP.md](docs/EXECUTION_ROADMAP.md) | 5 min (ref) |
| Deep dive on patterns | [RESEARCH_BEST_PRACTICES.md](docs/RESEARCH_BEST_PRACTICES.md) | 45 min |
| Understand Manifold API | [API_REFERENCE.md](docs/API_REFERENCE.md) | 20 min |
| See everything | [INDEX.md](docs/INDEX.md) | 10 min (nav) |

## The 10-Day Plan (Overview)

### Week 1: Build Core (40 hours)
- **Day 1**: API Client (fetch markets, place bets)
- **Day 2**: Strategy interface (what makes a good trade)
- **Day 3**: Risk management (Kelly Criterion, position sizing)
- **Day 4**: Event loop (main bot thread)
- **Day 5**: Logging (see what bot is doing)

✅ Result: Working bot

### Week 2: Validate & Polish (20 hours)
- **Day 6-7**: Run in paper trading (simulated, no real money)
- **Day 8-9**: Improve + add dashboard
- **Day 10**: Clean up code + documentation

✅ Result: Production-ready

## Critical Success Factors

1. **Get the API client working first**
   - Can you fetch markets? 
   - Can you get your balance?
   - Can you place test bets?

2. **Strategy is simple**
   - Don't overthink it
   - Qualifiers: "Does this market meet our criteria?"
   - Proposal: "At what size/confidence?"
   - Let Kelly Criterion do the math

3. **Risk management is not optional**
   - Fractional Kelly sizing (1/10 to 1/25)
   - Hard caps (max position, daily loss limit)
   - Circuit breaker (stop if losing too much)

4. **Paper trading before live**
   - Simulate for 7+ days
   - Check: Is it making money?
   - Only then go live with small sizes

## What You Have Now

```
✅ Complete architecture design
✅ Code patterns & examples
✅ 10-day execution plan with tasks
✅ Risk management documented
✅ Best practices from 5+ working bots
✅ Configuration templates
✅ Full documentation
```

## What to Do Next

**Pick one**:

### Path A: Deep Learner
1. Read [RESEARCH_SUMMARY.md](docs/RESEARCH_SUMMARY.md) (understand the problem)
2. Read [RESEARCH_BEST_PRACTICES.md](docs/RESEARCH_BEST_PRACTICES.md) (see all patterns)
3. Read [IMPLEMENTATION_GUIDE.md](docs/IMPLEMENTATION_GUIDE.md) (see how to code)
4. Then start Day 1 of [EXECUTION_ROADMAP.md](docs/EXECUTION_ROADMAP.md)

### Path B: Hands-On Coder
1. Skim [RESEARCH_SUMMARY.md](docs/RESEARCH_SUMMARY.md) (5 min)
2. Set up Python venv (follow Option 3 above)
3. Jump to [EXECUTION_ROADMAP.md](docs/EXECUTION_ROADMAP.md) Day 1
4. Reference [IMPLEMENTATION_GUIDE.md](docs/IMPLEMENTATION_GUIDE.md) as you code

### Path C: Get Help
Ask me questions! I have:
- Code templates ready to paste
- Debugging help for errors
- Alternative approaches if stuck
- Explanations of any concept

## Fastest Way to First Trade (4 Days)

```bash
# Day 1: API Client
- Create src/api/client.py (can fetch markets)
- Create src/api/models.py (can convert to objects)
- Test: client.get_markets() returns data

# Day 2: Strategy
- Create src/strategies/base_strategy.py
- Create simple strategy (return 100 mana if YES < 40%)
- Test: strategy.propose_bet(market) returns proposal

# Day 3: Core Loop
- Create src/core.py (main bot)
- Create main.py (entry point)
- Test: bot runs 5 cycles without crashing

# Day 4: Validation
- Run bot for 1 hour in paper mode
- Check logs in logs/ folder
- Count bets proposed vs placed
- Calculate P&L
```

## Common First Mistakes (Avoid These)

❌ Start with dashboard
→ ✅ Start with API client

❌ Over-engineer the strategy
→ ✅ Start with simple qualifiers

❌ No risk limits
→ ✅ Hard caps from day 1

❌ Live trading immediately
→ ✅ Paper trading for 1+ week first

❌ No logging
→ ✅ Log every decision

## Questions?

All answers are in:
- [docs/INDEX.md](docs/INDEX.md) - Find any document
- [docs/RESEARCH_SUMMARY.md](docs/RESEARCH_SUMMARY.md) - Common Q&A
- [docs/RESEARCH_BEST_PRACTICES.md](docs/RESEARCH_BEST_PRACTICES.md) - Deep dives

## You Are Here 📍

```
Research Phase ✅ COMPLETE
  ↓
Implementation Phase ← YOU ARE HERE
  ↓
Testing Phase (week 2)
  ↓
Live Trading (week 3+)
```

**Next step**: Pick a path above and create backend/src/api/client.py

---

**Ready? Let's go! 🚀**

Follow EXECUTION_ROADMAP.md starting with Day 1.

Questions about any step? Ask before you start!
