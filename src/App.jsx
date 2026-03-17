import { useState, useEffect, useCallback, useMemo, useRef } from 'react';

import { DEFAULT_BOT_CONFIG, STRAT_LABELS } from './constants';
import { getCategory, catW, fmt } from './utils/categories';
import {
  calcSlip, maxBetForSlip, kelly,
  confidenceWeight, certScore,
  detectStrategy, calcDynamicBaseRates, getBotBets,
  getExitSuggestions,
} from './utils/math';
import { getDailySpend, addDailySpend, loadAccounts, saveAccounts } from './utils/storage';
import {
  fetchMe, fetchPortfolio as apiFetchPortfolio,
  fetchPortfolioHistory as apiFetchHistory, fetchPositions,
  fetchBets as apiFetchBets, fetchMarkets as apiFetchMarkets,
  placeBetAPI,
} from './api/manifold';

import AccountManager   from './components/AccountManager';
import BetModal         from './components/BetModal';
import { DashboardTab } from './components/DashboardTab';
import { MarketsTab }   from './components/MarketsTab';
import { PortfolioTab } from './components/PortfolioTab';
import { BotTab }       from './components/BotTab';

function BotIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink:0 }}>
      <rect x="3" y="5" width="10" height="8" rx="2" fill="none" stroke="currentColor" strokeWidth="1.3"/>
      <rect x="6" y="7.5" width="1.5" height="1.5" rx=".5" fill="currentColor"/>
      <rect x="8.5" y="7.5" width="1.5" height="1.5" rx=".5" fill="currentColor"/>
      <path d="M6 10.5h4" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
      <path d="M8 5V3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      <circle cx="8" cy="2.5" r=".8" fill="currentColor"/>
      <path d="M3 9H1.5M12.5 9H14" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  );
}

const TABS = [
  { id:'dashboard', icon:'▦',  label:'Dashboard' },
  { id:'markets',   icon:'◈',  label:'Markets'   },
  { id:'portfolio', icon:'◉',  label:'Portfolio' },
  { id:'bot',       icon:null, label:'Bot', customIcon:<BotIcon/> },
];

function AccountDropdown({ accounts, activeKey, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const active = accounts.find(a => a.key === activeKey);

  // Close on outside click
  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} style={{ position:'relative', marginBottom:10 }}>
      <div style={{ fontSize:10, color:'#4b5280', textTransform:'uppercase', letterSpacing:'.08em', marginBottom:6 }}>Account</div>

      {/* Trigger button */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'9px 12px', borderRadius:10, cursor:'pointer', textAlign:'left',
          background:'#111320', border:`1px solid ${active ? 'rgba(99,102,241,.35)' : '#1a1d2e'}`,
          color: active ? '#c7d2fe' : '#4b5280', fontSize:12, fontWeight: active ? 600 : 400,
          transition:'all .15s', outline:'none',
        }}
      >
        <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1 }}>
          {active ? active.label : '— Select account —'}
        </span>
        <span style={{
          marginLeft:8, fontSize:9, color:'#4b5280', flexShrink:0,
          transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition:'transform .2s',
        }}>▼</span>
      </button>

      {/* Dropdown panel */}
      {open && (
        <div style={{
          position:'absolute', bottom:'calc(100% + 6px)', left:0, right:0, zIndex:100,
          background:'#0d0e1a', border:'1px solid #2d3148', borderRadius:12,
          boxShadow:'0 -8px 32px rgba(0,0,0,.6)', overflow:'hidden',
          animation:'fadeIn .12s ease',
        }}>
          {/* No account option */}
          <button
            onClick={() => { onChange(''); setOpen(false); }}
            style={{
              width:'100%', padding:'9px 12px', textAlign:'left', background:'transparent',
              border:'none', borderBottom:'1px solid #1a1d2e', cursor:'pointer',
              color:'#4b5280', fontSize:12, transition:'background .1s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = '#111320'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >— Select account —</button>

          {accounts.map(a => (
            <button
              key={a.id}
              onClick={() => { onChange(a.key); setOpen(false); }}
              style={{
                width:'100%', padding:'10px 12px', textAlign:'left', background:'transparent',
                border:'none', borderBottom:'1px solid #111320', cursor:'pointer',
                display:'flex', alignItems:'center', gap:10, transition:'background .1s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#111320'}
              onMouseLeave={e => e.currentTarget.style.background = activeKey === a.key ? 'rgba(99,102,241,.08)' : 'transparent'}
            >
              {/* Avatar circle */}
              <div style={{
                width:28, height:28, borderRadius:8, flexShrink:0, fontSize:12,
                background: activeKey === a.key ? 'rgba(99,102,241,.2)' : '#1a1d2e',
                display:'flex', alignItems:'center', justifyContent:'center',
                color: activeKey === a.key ? '#818cf8' : '#4b5280', fontWeight:700,
              }}>
                {a.username?.[0]?.toUpperCase() ?? '?'}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:12, fontWeight:600, color: activeKey === a.key ? '#c7d2fe' : '#94a3b8', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {a.label}
                </div>
                <div style={{ fontSize:10, color:'#4b5280', marginTop:1 }}>
                  ᴍ{a.balance != null ? (Math.abs(a.balance) >= 1000 ? `${(a.balance/1000).toFixed(1)}k` : Math.round(a.balance)) : '—'}
                </div>
              </div>
              {activeKey === a.key && (
                <span style={{ fontSize:9, color:'#818cf8', background:'rgba(99,102,241,.15)', padding:'2px 7px', borderRadius:99, fontWeight:700, flexShrink:0 }}>ACTIVE</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function App() {
  // ── Auth ──
  const [key,         setKey]         = useState('');
  const [user,        setUser]        = useState(null);
  const [userErr,     setUserErr]     = useState('');
  const [showAcctMgr, setShowAcctMgr] = useState(false);

  // ── Data ──
  const [markets,          setMarkets]          = useState([]);
  const [bets,             setBets]             = useState([]);
  const [portfolio,        setPortfolio]        = useState(null);
  const [portfolioHistory, setPortfolioHistory] = useState([]);
  const [apiPositions,     setApiPositions]     = useState([]);
  const [mktLoading,       setMktLoading]       = useState(false);

  // ── UI ──
  const [tab,        setTab]        = useState('dashboard');
  const [slipCap,    setSlipCap]    = useState(0.02);
  const [catFilter,  setCatFilter]  = useState('all');
  const [sortBy,     setSortBy]     = useState('volume');
  const [search,     setSearch]     = useState('');
  const [myProbs,    setMyProbs]    = useState({});
  const [posSortBy,  setPosSortBy]  = useState('cost');
  const [posSortDir, setPosSortDir] = useState(-1);

  // ── Bet modal ──
  const [modal,   setModal]   = useState(null);
  const [betAmt,  setBetAmt]  = useState(10);
  const [betSide, setBetSide] = useState('YES');
  const [placing, setPlacing] = useState(false);
  const [betMsg,  setBetMsg]  = useState(null);

  // ── WebSocket ──
  const [wsConnected, setWsConnected] = useState(false);

  // ── Bot ──
  const [botRunning,      setBotRunning]      = useState(false);
  const [botDryRun,       setBotDryRun]       = useState(true);
  const [botLog,          setBotLog]          = useState([]);
  const [botSession,      setBotSession]      = useState({ cycles:0, betsPlaced:0, manaSpent:0 });
  const [botInterval,     setBotInterval]     = useState(10);
  const [botBetHistory,   setBotBetHistory]   = useState([]);
  const [botCycleRunning, setBotCycleRunning] = useState(false);
  const [botConfig,       setBotConfig]       = useState(DEFAULT_BOT_CONFIG);

  // ── Daily spend ──
  const [dailySpend, setDailySpend] = useState(() => getDailySpend().spent);

  // ── Refs ──
  const wsRef          = useRef(null);
  const wsPingRef      = useRef(null);
  const botRunningRef  = useRef(false);
  const runBotCycleRef = useRef(null);  // always points to latest runBotCycle
  const botTimerRef    = useRef(null);
  const recentMoversRef = useRef(new Map()); // contractId → {probBefore,probAfter,timestamp}

  useEffect(() => { botRunningRef.current = botRunning; }, [botRunning]);

  // Midnight reset
  useEffect(() => {
    const sync = () => setDailySpend(getDailySpend().spent);
    window.addEventListener('focus', sync);
    const t = setInterval(sync, 60000);
    return () => { window.removeEventListener('focus', sync); clearInterval(t); };
  }, []);

  // ── Logging ──
  const addLog = useCallback((msg, type = 'info') => {
    const time = new Date().toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
    setBotLog(prev => [{ time, msg, type }, ...prev].slice(0, 150));
  }, []);

  // ── Fetchers ──
  const loadUser = useCallback(async k => {
    if (!k) return;
    const u = await fetchMe(k);
    if (!u) { setUserErr('Invalid API key'); setUser(null); return; }
    setUserErr(''); setUser(u);
    const accts = loadAccounts(), idx = accts.findIndex(a => a.key === k);
    if (idx >= 0) { accts[idx].balance = u.balance; saveAccounts(accts); }
  }, []);

  const loadPortfolio = useCallback(async uid => {
    if (!uid) return;
    const d = await apiFetchPortfolio(uid);
    if (d) setPortfolio(d);
  }, []);

  const loadPortfolioHistory = useCallback(async uid => {
    if (!uid) return;
    const d = await apiFetchHistory(uid);
    setPortfolioHistory(d);
  }, []);

  const loadPositions = useCallback(async uid => {
    if (!uid) return;
    const { metrics, contracts } = await fetchPositions(uid);
    if (!metrics || !contracts) return;
    const cMap = Object.fromEntries(contracts.map(c => [c.id, c]));
    const pos = Object.entries(metrics).map(([contractId, metricsArr]) => {
      const m = metricsArr[0], c = cMap[contractId];
      if (!m || !c || c.isResolved) return null;
      const side = m.maxSharesOutcome; if (!side) return null;
      const shares = m.totalShares?.[side] ?? 0; if (shares < 0.001) return null;
      const cost = m.invested ?? 0; if (cost < 0.01) return null;
      return {
        contractId, name: c.question ?? contractId, side, shares, cost,
        value: m.payout ?? 0, profit: m.profit ?? 0, profitPct: m.profitPercent ?? 0,
        lastProb: c.probability ?? null, latestTime: m.lastBetTime ?? 0, oldestTime: m.lastBetTime ?? 0,
      };
    }).filter(Boolean);
    setApiPositions(pos);
    setMarkets(prev => {
      const ex = new Set(prev.map(m => m.id));
      const nw = contracts.filter(c => !ex.has(c.id) && !c.isResolved && c.pool);
      return nw.length ? [...prev, ...nw] : prev;
    });
  }, []);

  const loadMarkets = useCallback(async () => {
    setMktLoading(true);
    const d = await apiFetchMarkets();
    setMarkets(d);
    setMktLoading(false);
  }, []);

  const loadBets = useCallback(async (uid, k) => {
    if (!uid || !k) return;
    const d = await apiFetchBets(uid, k);
    setBets(d);
  }, []);

  const refreshAll = useCallback(() => {
    loadMarkets();
    if (user?.id) {
      loadUser(key); loadPortfolio(user.id); loadPortfolioHistory(user.id);
      loadPositions(user.id); if (key) loadBets(user.id, key);
    }
  }, [user?.id, key, loadMarkets, loadUser, loadPortfolio, loadPortfolioHistory, loadPositions, loadBets]);

  useEffect(() => { loadMarkets(); }, [loadMarkets]);
  useEffect(() => { if (key) loadUser(key); }, [key, loadUser]);
  useEffect(() => {
    if (user?.id) {
      loadPortfolio(user.id); loadPortfolioHistory(user.id);
      loadPositions(user.id); if (key) loadBets(user.id, key);
    }
  }, [user?.id, key]);

  // ── WebSocket ──
  const connectWS = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    try {
      const ws = new WebSocket('wss://api.manifold.markets/ws'); let txid = 0;
      ws.onopen = () => {
        setWsConnected(true);
        ws.send(JSON.stringify({ type:'subscribe', txid:txid++, topics:['global/new-bet'] }));
        wsPingRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type:'ping', txid:txid++ }));
        }, 30000);
        addLog('🔌 WebSocket connected', 'success');
      };
      ws.onmessage = event => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'broadcast' && msg.topic === 'global/new-bet') {
            const bet = msg.data, amt = bet.amount ?? 0;
            const move = (bet.probAfter ?? 0) - (bet.probBefore ?? 0);
            // Feed mean reversion tracker
            if (Math.abs(move) >= 0.08) {
              recentMoversRef.current.set(bet.contractId, {
                probBefore: bet.probBefore ?? 0,
                probAfter:  bet.probAfter ?? 0,
                timestamp:  Date.now(),
                amount:     amt,
              });
            }
            if (amt >= 40 && Math.abs(move) >= 0.08)
              addLog(`🐋 Whaler: ᴍ${amt.toFixed(0)} ${bet.outcome} moved ${(Math.abs(move)*100).toFixed(1)}%`, 'warn');
          }
        } catch {}
      };
      ws.onclose = () => {
        setWsConnected(false); clearInterval(wsPingRef.current);
        if (botRunningRef.current) { addLog('WS dropped — reconnecting…', 'warn'); setTimeout(connectWS, 5000); }
      };
      ws.onerror = () => ws.close();
      wsRef.current = ws;
    } catch (e) { addLog(`WebSocket error: ${e.message}`, 'error'); }
  }, [addLog]);

  const disconnectWS = useCallback(() => {
    clearInterval(wsPingRef.current); wsRef.current?.close(); wsRef.current = null; setWsConnected(false);
  }, []);

  useEffect(() => {
    if (botRunning && botConfig.whaler) connectWS(); else disconnectWS();
  }, [botRunning, botConfig.whaler]);

  // ── Derived data ──
  const mktMap = useMemo(() => Object.fromEntries(markets.map(m => [m.id, m])), [markets]);
  const positions = apiPositions;

  const sortedPositions = useMemo(() => [...positions].sort((a, b) => {
    if (posSortBy === 'market_recent') return (b.latestTime - a.latestTime) * posSortDir;
    if (posSortBy === 'market_oldest') return (a.oldestTime - b.oldestTime) * posSortDir;
    return ((b[posSortBy] ?? -Infinity) - (a[posSortBy] ?? -Infinity)) * posSortDir;
  }), [positions, posSortBy, posSortDir]);

  const togglePosSort = col => { if (posSortBy === col) setPosSortDir(d => d * -1); else { setPosSortBy(col); setPosSortDir(-1); } };
  const sortArrow = col => posSortBy === col ? (posSortDir === -1 ? ' ↓' : ' ↑') : '';

  const resolved = useMemo(() => bets.filter(b => b.resolvedPayout != null), [bets]);
  const wins     = useMemo(() => resolved.filter(b => b.resolvedPayout > b.amount).length, [resolved]);
  const winRate  = resolved.length ? wins / resolved.length : null;
  const totalInvested = portfolio?.investmentValue ?? 0;

  const pnlStats = useMemo(() => {
    const hist = portfolioHistory;
    const latest = hist.length ? (hist[hist.length - 1]?.profit ?? 0) : 0;
    const total = latest || portfolio?.profit || resolved.reduce((s, b) => s + (b.resolvedPayout ?? 0) - (b.amount ?? 0), 0);
    const at = ms => {
      if (!hist.length) return 0;
      const target = Date.now() - ms; let c = hist[0];
      for (const p of hist) { if (p.timestamp <= target) c = p; }
      return c?.profit ?? 0;
    };
    return { totalPnL: total, pnl1D: latest - at(86400000), pnl1W: latest - at(604800000), pnl1M: latest - at(2592000000) };
  }, [portfolioHistory, portfolio?.profit, resolved]);

  const pnlChartData = useMemo(() => portfolioHistory.map(p => ({
    date: new Date(p.timestamp).toLocaleDateString('en-US', { month:'short', day:'numeric' }),
    pnl:  +(p.profit ?? 0).toFixed(1),
  })), [portfolioHistory]);

  const recentBets = useMemo(() =>
    [...bets].filter(b => !b.isRedemption && !b.isAnte)
      .sort((a, b) => (b.createdTime ?? 0) - (a.createdTime ?? 0)).slice(0, 12),
  [bets]);

  const recentBetsWithStrategy = useMemo(() =>
    recentBets.map(b => ({ ...b, strategy: detectStrategy(b, mktMap[b.contractId]) })),
  [recentBets, mktMap]);

  const stratBreakdown = useMemo(() => {
    const counts = {};
    for (const b of bets.filter(b => !b.isRedemption && !b.isAnte)) {
      const s = detectStrategy(b, mktMap[b.contractId]);
      counts[s] = (counts[s] ?? 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [bets, mktMap]);

  const dynamicBaseRates = useMemo(() => {
    if (!resolved.length) return {};
    return calcDynamicBaseRates(resolved.map(b => ({ ...b, question: mktMap[b.contractId]?.question ?? '' })));
  }, [resolved, mktMap]);

  const catAllocated = useMemo(() => {
    const alloc = {};
    for (const p of positions) { const cat = getCategory(p.name ?? ''); alloc[cat] = (alloc[cat] ?? 0) + (p.cost ?? 0); }
    return alloc;
  }, [positions]);

  const exitSuggestions = useMemo(() => getExitSuggestions(positions), [positions]);

  const displayMarkets = useMemo(() => {
    const bal = portfolio?.balance ?? user?.balance ?? 1000;
    let ms = markets.filter(m => m.pool);
    if (catFilter !== 'all') ms = ms.filter(m => getCategory(m.question) === catFilter);
    if (search.trim()) ms = ms.filter(m => m.question.toLowerCase().includes(search.toLowerCase()));
    ms = ms.map(m => {
      const mktP = m.probability, rawMy = myProbs[m.id], ourP = rawMy != null ? rawMy / 100 : null;
      const side = ourP != null ? (ourP > mktP ? 'YES' : 'NO') : null;
      const mktPAdj = side === 'YES' ? mktP : 1 - mktP;
      const ourPAdj = ourP != null ? (side === 'YES' ? ourP : 1 - ourP) : null;
      const ev = ourPAdj != null && mktPAdj > 0 ? ourPAdj - mktPAdj : null;
      const cw = catW(m.question);
      const maxSafe = side ? maxBetForSlip(m.pool, slipCap, side) : 0;
      // Updated kelly signature: kelly(pool, mktP, ourP, bal)
      const size = ev != null && ev > 0 ? Math.max(1, Math.min(kelly(m.pool, mktPAdj, ourPAdj, bal) * cw, maxSafe)) : 0;
      const conf = confidenceWeight(m.betsCount ?? 0, m.volume ?? 0);
      const cert = ev != null && ev > 0 ? certScore(ev, conf, cw, m.totalLiquidity) : null;
      return { ...m, ourP, side, ev, cw, size, cat: getCategory(m.question), cert, conf };
    });
    if (sortBy === 'certainty')       ms.sort((a, b) => (b.cert ?? -1) - (a.cert ?? -1));
    else if (sortBy === 'volume')     ms.sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0));
    else if (sortBy === 'liquidity')  ms.sort((a, b) => (b.totalLiquidity ?? 0) - (a.totalLiquidity ?? 0));
    else if (sortBy === 'closeDate')  ms.sort((a, b) => (a.closeTime ?? Infinity) - (b.closeTime ?? Infinity));
    else ms.sort((a, b) => ((b.ev ?? -99) * b.cw) - ((a.ev ?? -99) * a.cw));
    return ms.slice(0, 80);
  }, [markets, catFilter, search, sortBy, myProbs, portfolio?.balance, user?.balance, slipCap]);

  const topOpps = useMemo(() =>
    displayMarkets.filter(m => m.ev != null && m.ev > 0 && m.size > 0)
      .sort((a, b) => (b.ev * b.cw) - (a.ev * a.cw)).slice(0, 6),
  [displayMarkets]);

  const botSuggestions = useMemo(() => {
    const bal = portfolio?.balance ?? user?.balance ?? 1000;
    if (!bal || !markets.length) return [];
    return getBotBets(
      markets, [], { ...botConfig, slipCap }, bal,
      totalInvested, catAllocated, dynamicBaseRates, recentMoversRef.current
    ).slice(0, 8);
  }, [markets, portfolio?.balance, user?.balance, botConfig, slipCap, totalInvested, catAllocated, dynamicBaseRates]);

  // ── Modal ──
  const openModal = (item, side) => {
    const isBot = item.market != null;
    const m = isBot ? item.market : item;
    const s = side ?? m.side ?? 'YES';
    setModal({ ...m, ourP: item.ourP ?? null, ev: item.ev ?? null, cw: catW(m.question ?? ''), size: item.size ?? 0, cat: getCategory(m.question ?? '') });
    setBetAmt(item.size > 0 ? Math.max(1, Math.round(item.size)) : 10);
    setBetSide(s); setBetMsg(null);
  };

  // ── Place bet ──
  const placeBet = async () => {
    if (!key || !modal) return;
    const cur = getDailySpend();
    if (cur.spent + betAmt > botConfig.dailyLimit) {
      setBetMsg({ err: `Daily cap ᴍ${botConfig.dailyLimit} would be exceeded (ᴍ${cur.spent.toFixed(0)} spent today)` }); return;
    }
    const s = calcSlip(modal.pool, betAmt, betSide);
    if (s > slipCap) { setBetMsg({ err: `Slippage ${(s * 100).toFixed(2)}% exceeds cap` }); return; }
    setPlacing(true); setBetMsg(null);
    try {
      const d = await placeBetAPI(key, modal.id, betSide, betAmt);
      if (d.betId || d.isFilled) {
        const ns = addDailySpend(betAmt); setDailySpend(ns);
        setBetMsg({ ok: `Placed ᴍ${betAmt} on ${betSide}` });
        refreshAll();
      } else { setBetMsg({ err: d.message ?? 'Unknown error' }); }
    } catch (e) { setBetMsg({ err: e.message }); }
    setPlacing(false);
  };

  // ── Bot cycle ──
  const runBotCycle = useCallback(async () => {
    if (!key || !user || botCycleRunning) { if (!key || !user) addLog('Not connected', 'error'); return; }
    const cur = getDailySpend(), remaining = botConfig.dailyLimit - cur.spent;
    if (remaining <= 0) { addLog(`Daily cap reached (ᴍ${cur.spent.toFixed(0)} spent) — skipping`, 'warn'); return; }
    setBotCycleRunning(true);
    const balance = portfolio?.balance ?? user.balance ?? 0;
    const freeCapital = Math.max(0, balance - totalInvested - (botConfig.balanceReserve ?? 200));
    addLog(`▶ Cycle #${botSession.cycles + 1} | Bal: ᴍ${balance.toFixed(0)} | Free: ᴍ${freeCapital.toFixed(0)} | Daily rem: ᴍ${remaining.toFixed(0)} | ${botDryRun ? 'DRY' : 'LIVE'}`, 'info');
    try {
      const fresh = await apiFetchMarkets();
      addLog(`Fetched ${fresh.length} markets`, 'info');
      const proposed = getBotBets(
        fresh, botBetHistory, { ...botConfig, slipCap }, balance,
        totalInvested, catAllocated, dynamicBaseRates, recentMoversRef.current
      );
      addLog(`${proposed.length} opportunities`, 'info');
      if (!proposed.length) { addLog('No trades this cycle', 'info'); setBotCycleRunning(false); setBotSession(s => ({ ...s, cycles: s.cycles + 1 })); return; }
      let placed = 0, spent = 0;
      for (const bet of proposed) {
        const cur2 = getDailySpend();
        if (cur2.spent + bet.size > botConfig.dailyLimit) { addLog(`Daily cap reached (ᴍ${cur2.spent.toFixed(0)} spent)`, 'warn'); break; }
        const slip = calcSlip(bet.market.pool, bet.size, bet.side);
        if (slip > botConfig.slipCap) { addLog(`  SKIP slip ${(slip*100).toFixed(1)}% | ${bet.market.question.slice(0,40)}…`, 'warn'); continue; }
        const label = `${STRAT_LABELS[bet.strategy]} → ${bet.side} ᴍ${bet.size} | EV +${(bet.ev*100).toFixed(1)}% conf ${(bet.conf*100).toFixed(0)}% | ${bet.market.question.slice(0,30)}…`;
        try {
          const d = await placeBetAPI(key, bet.market.id, bet.side, bet.size, botDryRun);
          if (d.betId || d.isFilled || (botDryRun && d.amount != null)) {
            addLog(`  ${botDryRun ? '[DRY]' : '✓'} ${label}`, botDryRun ? 'dry' : 'success');
            placed++; spent += bet.size;
            setBotBetHistory(prev => [...prev, { contractId: bet.market.id }]);
            if (!botDryRun) { const ns = addDailySpend(bet.size); setDailySpend(ns); }
          } else { addLog(`  ✗ ${d.message ?? 'failed'} | ${bet.market.question.slice(0,35)}…`, 'error'); }
        } catch (e) { addLog(`  ✗ ${e.message}`, 'error'); }
        if (!botDryRun) await new Promise(r => setTimeout(r, 400));
      }
      addLog(`◀ Done — ${placed} bets, ᴍ${spent}${botDryRun ? ' (dry)' : ' spent'}`, placed > 0 ? 'success' : 'info');
      setBotSession(s => ({ cycles: s.cycles + 1, betsPlaced: s.betsPlaced + placed, manaSpent: s.manaSpent + spent }));
      if (!botDryRun) refreshAll();
    } catch (e) { addLog(`Cycle error: ${e.message}`, 'error'); }
    setBotCycleRunning(false);
  }, [key, user, botDryRun, botConfig, botBetHistory, slipCap, addLog, botCycleRunning, botSession.cycles, portfolio, totalInvested, catAllocated, dynamicBaseRates, refreshAll]);

  // Keep ref in sync so interval always calls latest version (stale closure fix)
  useEffect(() => { runBotCycleRef.current = runBotCycle; }, [runBotCycle]);

  useEffect(() => {
    if (botRunning) {
      runBotCycleRef.current?.();
      botTimerRef.current = setInterval(() => runBotCycleRef.current?.(), botInterval * 60000);
    } else {
      clearInterval(botTimerRef.current);
    }
    return () => clearInterval(botTimerRef.current);
  }, [botRunning, botInterval]);

  const switchAccount = k => {
    setKey(k);
	setUser(null); setPortfolio(null); setBets([]);
	setApiPositions([]); setPortfolioHistory([]);
  };

  const accounts = loadAccounts();

  return (
    <div style={{ minHeight:'100vh', background:'#07080f', color:'#e2e8f0', fontFamily:'"Inter",system-ui,sans-serif', fontSize:14 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Archivo:wght@300;400;600;700&family=JetBrains+Mono:wght@400;600&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        ::-webkit-scrollbar{width:4px;height:4px;}::-webkit-scrollbar-track{background:#0f1117;}::-webkit-scrollbar-thumb{background:#2d3148;border-radius:4px;}
        input,select,button{font-family:inherit;}
        @keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pulseGlow{0%,100%{opacity:.3}50%{opacity:.7}}
        @keyframes drawLine{from{stroke-dashoffset:100}to{stroke-dashoffset:0}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
        .card{animation:fadeIn .2s ease}
        .pulse-glow{animation:pulseGlow 3s ease-in-out infinite}
        .draw-line{stroke-dasharray:100;animation:drawLine 1.5s ease-out forwards}
      `}</style>

      {/* ── Sidebar ── */}
      <div style={{ position:'fixed', left:0, top:0, bottom:0, width:200, background:'#0d0e1a', borderRight:'1px solid #1a1d2e', display:'flex', flexDirection:'column', zIndex:30, padding:'20px 12px' }}>
        {/* Logo */}
        <div style={{ marginBottom:32, paddingBottom:20, borderBottom:'1px solid #1a2e1a' }}>
          <svg width="160" height="44" viewBox="0 0 160 44" fill="none">
            <g className="pulse-glow">
              <circle cx="12" cy="22" r="5" fill="#10b981" opacity="0.35"/>
              <circle cx="26" cy="12" r="5" fill="#10b981" opacity="0.35"/>
              <circle cx="26" cy="32" r="5" fill="#10b981" opacity="0.35"/>
              <circle cx="40" cy="22" r="5" fill="#10b981" opacity="0.35"/>
            </g>
            <line x1="12" y1="22" x2="26" y2="12" stroke="#10b981" strokeWidth="1.2" opacity="0.25" className="draw-line"/>
            <line x1="12" y1="22" x2="26" y2="32" stroke="#10b981" strokeWidth="1.2" opacity="0.25" className="draw-line" style={{ animationDelay:'.2s' }}/>
            <line x1="26" y1="12" x2="40" y2="22" stroke="#10b981" strokeWidth="1.2" opacity="0.25" className="draw-line" style={{ animationDelay:'.4s' }}/>
            <line x1="26" y1="32" x2="40" y2="22" stroke="#10b981" strokeWidth="1.2" opacity="0.25" className="draw-line" style={{ animationDelay:'.6s' }}/>
            <circle cx="12" cy="22" r="3" fill="#10b981"/>
            <circle cx="26" cy="12" r="3" fill="#10b981"/>
            <circle cx="26" cy="32" r="3" fill="#10b981"/>
            <circle cx="40" cy="22" r="3" fill="#10b981"/>
            <text x="54" y="30" fill="#f4f4f5" fontSize="26" fontWeight="300" fontFamily="Archivo" letterSpacing="-0.5">Dayli</text>
          </svg>
          <div style={{ fontSize:10, color:'#1e4d2e', letterSpacing:'0.1em', fontFamily:'JetBrains Mono,monospace', marginTop:4 }}>MANIFOLD TRADING</div>
        </div>

        {/* Nav tabs */}
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', borderRadius:10, border:'none', cursor:'pointer', marginBottom:4, fontSize:13, fontWeight:tab===t.id?600:400, background:tab===t.id?'rgba(99,102,241,.15)':'transparent', color:tab===t.id?'#818cf8':'#6b7280', transition:'all .15s', textAlign:'left' }}>
            {t.customIcon
              ? <span style={{ fontSize:15, display:'flex', alignItems:'center' }}>{t.customIcon}</span>
              : <span style={{ fontSize:15 }}>{t.icon}</span>}
            {t.label}
            {t.id === 'bot' && botRunning  && <span style={{ marginLeft:'auto', width:7, height:7, borderRadius:'50%', background:'#34d399', boxShadow:'0 0 6px #34d399' }}/>}
            {t.id === 'bot' && wsConnected && <span style={{ marginLeft:2, width:6, height:6, borderRadius:'50%', background:'#e879f9', boxShadow:'0 0 5px #e879f9' }}/>}
          </button>
        ))}

        {/* ── Account section ── */}
        <div style={{ marginTop:'auto', borderTop:'1px solid #1a1d2e', paddingTop:16 }}>

          {/* Styled account dropdown */}
		  {accounts.length > 0 && (
			  <AccountDropdown
			  accounts={accounts}
			  activeKey={key}
			  onChange={switchAccount}
			/>
	      )}

          {/* Connected card */}
          {user ? (
            <div style={{ padding:'10px 12px', borderRadius:10, background:'rgba(99,102,241,.08)', border:'1px solid rgba(99,102,241,.15)' }}>
              <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:4 }}>
                <span style={{ width:7, height:7, borderRadius:'50%', background:'#34d399', boxShadow:'0 0 6px #34d399', flexShrink:0 }}/>
                <div style={{ fontSize:10, color:'#4b5280', textTransform:'uppercase', letterSpacing:'.06em' }}>Connected</div>
              </div>
              <div style={{ color:'#818cf8', fontWeight:600, fontSize:13 }}>@{user.username}</div>
              <div style={{ color:'#34d399', fontWeight:700, fontSize:16, marginTop:2, fontFamily:'JetBrains Mono,monospace' }}>ᴍ{fmt(portfolio?.balance ?? user.balance ?? 0)}</div>
            </div>
          ) : (
            <div style={{ padding:'10px 12px', borderRadius:10, background:'#111320', border:'1px solid #1a1d2e', textAlign:'center' }}>
              <div style={{ fontSize:11, color:'#3d4166' }}>Not connected</div>
              <div style={{ fontSize:10, color:'#2d3148', marginTop:3 }}>Add an account below</div>
            </div>
          )}

          {userErr && (
            <div style={{ fontSize:11, color:'#f87171', marginTop:6, padding:'6px 10px', background:'rgba(248,113,113,.08)', border:'1px solid rgba(248,113,113,.15)', borderRadius:8, textAlign:'center' }}>
              {userErr}
            </div>
          )}

          <button
            onClick={() => setShowAcctMgr(true)}
            style={{ width:'100%', marginTop:10, padding:'8px 12px', borderRadius:8, border:'1px solid #1a1d2e', background:'transparent', color:'#6b7280', cursor:'pointer', fontSize:12, display:'flex', alignItems:'center', justifyContent:'center', gap:6, transition:'all .15s' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(99,102,241,.3)'; e.currentTarget.style.color = '#818cf8'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#1a1d2e'; e.currentTarget.style.color = '#6b7280'; }}
          >
            <span>👤</span> Manage Accounts
          </button>
        </div>
      </div>

      {/* ── Main ── */}
      <div style={{ marginLeft:200, minHeight:'100vh' }}>
        {/* Topbar */}
        <div style={{ position:'sticky', top:0, zIndex:20, background:'rgba(7,8,15,.9)', backdropFilter:'blur(12px)', borderBottom:'1px solid #1a1d2e', padding:'12px 28px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ fontSize:18, fontWeight:700, color:'#c7d2fe' }}>{TABS.find(t => t.id === tab)?.label}</div>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            {wsConnected && <span style={{ fontSize:11, color:'#e879f9', display:'flex', alignItems:'center', gap:4 }}><span style={{ width:6, height:6, borderRadius:'50%', background:'#e879f9', display:'inline-block' }}/>WS Live</span>}
            <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:12, color:'#4b5280' }}>
              Slip cap:
              <select value={slipCap} onChange={e => setSlipCap(+e.target.value)}
                style={{ background:'#0f1117', border:'1px solid #1a1d2e', borderRadius:6, padding:'4px 8px', color:'#818cf8', fontSize:12, cursor:'pointer' }}>
                {[0.01,0.02,0.03,0.05].map(v => <option key={v} value={v}>{(v*100).toFixed(0)}%</option>)}
              </select>
            </div>
            <button onClick={refreshAll} style={{ background:'#0f1117', border:'1px solid #1a1d2e', borderRadius:6, padding:'5px 12px', color:'#6b7280', cursor:'pointer', fontSize:12 }}>↻ Refresh</button>
          </div>
        </div>

        {/* Exit suggestions banner */}
        {tab === 'portfolio' && exitSuggestions.exits.length > 0 && (
          <div style={{ margin:'16px 28px 0', padding:'12px 16px', background:'rgba(52,211,153,.06)', border:'1px solid rgba(52,211,153,.2)', borderRadius:12, display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
            <span style={{ fontSize:12, color:'#34d399', fontWeight:600 }}>💰 Take-profit suggestions</span>
            {exitSuggestions.exits.slice(0,3).map(p => (
              <span key={p.contractId} style={{ fontSize:11, color:'#6b7280', background:'#111320', borderRadius:8, padding:'3px 8px' }}>
                {p.name.slice(0,35)}… <span style={{ color:'#34d399' }}>{p.reason}</span>
              </span>
            ))}
          </div>
        )}

        {/* Tab content */}
        <div style={{ padding:'24px 28px' }}>
          {tab === 'dashboard' && (
            <DashboardTab
              portfolio={portfolio} positions={positions} pnlStats={pnlStats}
              pnlChartData={pnlChartData} winRate={winRate} wins={wins} resolved={resolved}
              recentBetsWithStrategy={recentBetsWithStrategy} stratBreakdown={stratBreakdown}
              mktMap={mktMap} botSuggestions={botSuggestions} topOpps={topOpps}
              onOpenModal={openModal} onGoMarkets={() => setTab('markets')}
            />
          )}
          {tab === 'markets' && (
            <MarketsTab
              displayMarkets={displayMarkets} mktLoading={mktLoading}
              catFilter={catFilter} setCatFilter={setCatFilter}
              search={search} setSearch={setSearch}
              sortBy={sortBy} setSortBy={setSortBy}
              myProbs={myProbs} setMyProbs={setMyProbs}
              slipCap={slipCap} onOpenModal={openModal} hasKey={!!key}
            />
          )}
          {tab === 'portfolio' && (
            <PortfolioTab
              hasKey={!!key} positions={positions} sortedPositions={sortedPositions}
              posSortBy={posSortBy} posSortDir={posSortDir}
              togglePosSort={togglePosSort} sortArrow={sortArrow}
              resolved={resolved} totalPnL={pnlStats.totalPnL}
              winRate={winRate} mktMap={mktMap}
            />
          )}
          {tab === 'bot' && (
            <BotTab
              hasKey={!!key} wsConnected={wsConnected}
              botDryRun={botDryRun} setBotDryRun={setBotDryRun}
              botRunning={botRunning} setBotRunning={setBotRunning}
              botInterval={botInterval} setBotInterval={setBotInterval}
              botConfig={botConfig} setBotConfig={setBotConfig}
              botSession={botSession} botBetHistory={botBetHistory}
              setBotBetHistory={setBotBetHistory} botLog={botLog} setBotLog={setBotLog}
              botCycleRunning={botCycleRunning} runBotCycle={runBotCycle} addLog={addLog}
              dailySpent={dailySpend} dailyLimit={botConfig.dailyLimit}
            />
          )}
        </div>
      </div>

      {modal && (
        <BetModal modal={modal} betAmt={betAmt} setBetAmt={setBetAmt} betSide={betSide} setBetSide={setBetSide}
          slipCap={slipCap} placing={placing} betMsg={betMsg} onPlace={placeBet} onClose={() => setModal(null)} hasKey={!!key}/>
      )}
      {showAcctMgr && (
        <AccountManager activeKey={key} onSelectKey={switchAccount} onClose={() => setShowAcctMgr(false)}/>
      )}
    </div>
  );
}