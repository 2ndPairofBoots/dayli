import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

const BASE = "https://api.manifold.markets/v0";
const apiFetch = (path, opts={}) => fetch(BASE + path, opts);
const FEE = 0.01, KELLY_FRAC = 0.25;

const CATS = {
  ai:       { k:['ai','llm','gpt','openai','anthropic','claude','gemini','neural','deepmind','agi'], w:1.2, color:'#818cf8', baseRate:0.52 },
  tech:     { k:['apple','google','microsoft','meta','amazon','software','startup','iphone','chip'], w:1.1, color:'#38bdf8', baseRate:0.50 },
  science:  { k:['science','research','climate','space','nasa','cern','physics','vaccine','study'], w:1.15, color:'#34d399', baseRate:0.48 },
  crypto:   { k:['bitcoin','btc','eth','crypto','defi','nft','blockchain','solana','web3'], w:0.85, color:'#fbbf24', baseRate:0.45 },
  politics: { k:['election','president','congress','senate','democrat','republican','vote','trump','biden','law','bill'], w:0.8, color:'#f87171', baseRate:0.38 },
  sports:   { k:['nba','nfl','mlb','nhl','soccer','football','basketball','tennis','swim','olympic'], w:0.9, color:'#fb923c', baseRate:0.50 },
  finance:  { k:['stock','fed','inflation','gdp','recession','interest','economy','sp500','hedge'], w:1.0, color:'#a78bfa', baseRate:0.46 },
};
const getCategory = q => { const s=q.toLowerCase(); for(const [c,{k}] of Object.entries(CATS)) if(k.some(w=>s.includes(w))) return c; return 'other'; };
const catColor = q => CATS[getCategory(q)]?.color ?? '#6b7280';
const catW = q => CATS[getCategory(q)]?.w ?? 1.0;
const fmt = n => { if (n==null||isNaN(n)) return '0'; return Math.abs(n)>=1000?`${(n/1000).toFixed(1)}k`:Number(n).toFixed(0); };

function calcSlip(pool,amt,side){if(!pool?.YES||!pool?.NO||amt<=0)return 0;const k=pool.YES*pool.NO,net=amt*(1-FEE),p0=pool.NO/(pool.YES+pool.NO);if(side==='YES'){const nNO=pool.NO+net;return Math.max(0,(nNO/(k/nNO+nNO))-p0);}else{const nYES=pool.YES+net;return Math.max(0,p0-((k/nYES)/(nYES+k/nYES)));}}
function calcPost(pool,amt,side){if(!pool?.YES||!pool?.NO)return null;const k=pool.YES*pool.NO,net=amt*(1-FEE);if(side==='YES'){const nNO=pool.NO+net;return nNO/(k/nNO+nNO);}else{const nYES=pool.YES+net;const nNO=k/nYES;return nNO/(nYES+nNO);}}
function maxBetForSlip(pool,cap,side){if(!pool?.YES||!pool?.NO)return 0;let lo=0,hi=50000;for(let i=0;i<50;i++){const mid=(lo+hi)/2;calcSlip(pool,mid,side)<cap?lo=mid:hi=mid;}return lo;}
function kelly(mktP,ourP,bal){const b=1/mktP-1,edge=b*ourP-(1-ourP);return edge<=0?0:Math.min((edge/b)*KELLY_FRAC*bal,bal*0.08);}
const tok = s => new Set(s.toLowerCase().split(/\W+/).filter(w=>w.length>3));
const jacc = (a,b) => { const sa=tok(a),sb=tok(b),i=[...sa].filter(x=>sb.has(x)).length; return i/(sa.size+sb.size-i||1); };
function dedup(ms){const kept=[];for(const m of ms)if(!kept.some(k=>jacc(k.question,m.question)>0.5))kept.push(m);return kept;}

const STRAT_COLORS = { calibration:'#6366f1', new_market:'#10b981', mean_reversion:'#fbbf24', extreme_fade:'#f87171', attrition:'#38bdf8', whaler:'#e879f9', unknown:'#4b5280' };
const STRAT_LABELS = { calibration:'Calibration', new_market:'New Mkt', mean_reversion:'Mean Rev', extreme_fade:'Extreme Fade', attrition:'Attrition', whaler:'Whaler', unknown:'—' };

const detectStrategy = (b, mkt) => {
  if (!mkt) return 'unknown';
  const p=mkt.probability??0.5, bets=mkt.betsCount??0, vol=mkt.volume??0, betP=b.probBefore??p;
  if (p>=0.94||p<=0.06) return 'extreme_fade';
  if (bets<=3&&vol<50) return 'new_market';
  if (Math.abs((b.probAfter??betP)-betP)>=0.15) return 'mean_reversion';
  const q=mkt.question?.toLowerCase()??'';
  if (q.includes('by 20')||q.includes('before 20')||q.includes('end of 20')) return 'attrition';
  return 'calibration';
};

// Confidence weight: shrinks edge toward 0 for thin/new markets
// Asymptotically approaches 1.0 at ~200 bets + M$2000 volume
function confidenceWeight(betsCount, vol) {
  const betConf = betsCount / (betsCount + 30);   // 30 = prior strength
  const volConf  = vol / (vol + 500);
  return Math.sqrt(betConf * volConf);             // geometric mean
}

// Dynamic base rates from user's resolved bet history
function calcDynamicBaseRates(resolvedBets) {
  const cats = {};
  for (const b of resolvedBets) {
    const cat = getCategory(b.question ?? '');
    if (!cats[cat]) cats[cat] = { yes: 0, total: 0 };
    cats[cat].total++;
    if (b.resolution === 'YES') cats[cat].yes++;
  }
  const rates = {};
  for (const [cat, {yes, total}] of Object.entries(cats)) {
    if (total >= 10) rates[cat] = yes / total; // only trust if 10+ samples
  }
  return rates;
}

function getBotBets(markets, betHistory, config, balance, totalInvested, catAllocated, dynamicBaseRates) {
  const bets=[], alreadyBet=new Set(betHistory.map(b=>b.contractId));
  // Kelly operates on free capital only
  const freeCapital = Math.max(0, balance - totalInvested - config.balanceReserve);
  if (freeCapital <= 0) return bets;

  for (const m of markets) {
    if (!m.pool||m.isResolved||alreadyBet.has(m.id)) continue;
    if (!m.closeTime||m.closeTime<Date.now()+3600000) continue;
    const p=m.probability; if (p==null) continue;
    const q=m.question?.toLowerCase()??'', cat=getCategory(m.question), catInfo=CATS[cat];
    const betsCount=m.betsCount??0, vol=m.volume??0;

    // Category concentration limit: max 25% of free capital per category
    const catLimit = freeCapital * (config.catMaxPct ?? 0.25);
    if ((catAllocated[cat] ?? 0) >= catLimit) continue;

    let side=null, ourP=null, strategy=null;

    // Use dynamic base rate if available, else fall back to hardcoded
    const baseRate = dynamicBaseRates?.[cat] ?? catInfo?.baseRate ?? 0.50;

    if (config.extreme_fade&&p>=0.93){side='NO';ourP=0.80;strategy='extreme_fade';}
    else if (config.extreme_fade&&p<=0.07){side='YES';ourP=0.20;strategy='extreme_fade';}
    else if (config.new_market&&betsCount<=3&&vol<100){
      if(p>=0.80){side='NO';ourP=0.55;strategy='new_market';}
      else if(p<=0.20){side='YES';ourP=0.45;strategy='new_market';}
    } else if (config.attrition&&(q.includes('by 20')||q.includes('before 20')||q.includes('end of 20'))){
      if(p>0.25&&p<0.70){side='NO';ourP=p-0.10;strategy='attrition';}
    } else if (config.calibration&&catInfo){
      const dev=p-baseRate;
      if(dev>0.12){side='NO';ourP=baseRate+0.04;strategy='calibration';}
      else if(dev<-0.12){side='YES';ourP=baseRate-0.04;strategy='calibration';}
    }

    if (!side||!ourP) continue;

    // Confidence-shrink: blend ourP toward mktP for thin markets
    const conf = confidenceWeight(betsCount, vol);
    ourP = p + (ourP - p) * conf;  // shrinks edge for low-confidence markets

    const mktPAdj=side==='YES'?p:1-p, ourPAdj=side==='YES'?ourP:1-ourP;
    const ev=ourPAdj-mktPAdj;
    if(ev<0.03) continue; // post-shrink EV floor

    const maxSafe=maxBetForSlip(m.pool,config.slipCap,side);
    // Kelly on free capital, with category weight
    const rawKelly=kelly(mktPAdj,ourPAdj,freeCapital)*catW(m.question);
    // Also cap so we don't exceed remaining category budget
    const remaining=catLimit-(catAllocated[cat]??0);
    const size=Math.min(rawKelly,maxSafe,config.maxBet,freeCapital*0.05,remaining);
    if(size<1) continue;

    bets.push({market:m,side,ourP,ev,conf,size:Math.round(size),strategy,cat});
  }
  // Sort by risk-adjusted EV: ev * confidence * category weight
  return bets.sort((a,b)=>(b.ev*b.conf*catW(b.market.question))-(a.ev*a.conf*catW(a.market.question)));
}

export default function App() {
  const [key,setKey]=useState('');
  const [keyInput,setKeyInput]=useState('');
  const [showKey,setShowKey]=useState(false);
  const [user,setUser]=useState(null);
  const [userErr,setUserErr]=useState('');
  const [markets,setMarkets]=useState([]);
  const [bets,setBets]=useState([]);
  const [portfolio,setPortfolio]=useState(null);
  const [portfolioHistory,setPortfolioHistory]=useState([]);
  const [apiPositions,setApiPositions]=useState([]);
  const [wsConnected,setWsConnected]=useState(false);
  const [tab,setTab]=useState('dashboard');
  const [modal,setModal]=useState(null);
  const [betAmt,setBetAmt]=useState(10);
  const [betSide,setBetSide]=useState('YES');
  const [slipCap,setSlipCap]=useState(0.02);
  const [placing,setPlacing]=useState(false);
  const [betMsg,setBetMsg]=useState(null);
  const [mktLoading,setMktLoading]=useState(false);
  const [catFilter,setCatFilter]=useState('all');
  const [posSortBy,setPosSortBy]=useState('cost');
  const [posSortDir,setPosSortDir]=useState(-1);
  const [myProbs,setMyProbs]=useState({});
  const [sortBy,setSortBy]=useState('volume');
  const [search,setSearch]=useState('');
  const [botRunning,setBotRunning]=useState(false);
  const [botDryRun,setBotDryRun]=useState(true);
  const [botLog,setBotLog]=useState([]);
  const [botSession,setBotSession]=useState({cycles:0,betsPlaced:0,manaSpent:0});
  const [botInterval,setBotInterval]=useState(10);
  const [botBetHistory,setBotBetHistory]=useState([]);
  const [botCycleRunning,setBotCycleRunning]=useState(false);
  const [botConfig,setBotConfig]=useState({calibration:true,new_market:true,extreme_fade:true,attrition:true,whaler:true,mean_reversion:false,maxBet:50,balanceReserve:200,dailyLimit:500,slipCap:0.02,catMaxPct:0.25});

  const wsRef=useRef(null), wsPingRef=useRef(null), botRunningRef=useRef(false), botTimerRef=useRef(null);
  useEffect(()=>{botRunningRef.current=botRunning;},[botRunning]);

  const addLog=useCallback((msg,type='info')=>{
    const time=new Date().toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
    setBotLog(prev=>[{time,msg,type},...prev].slice(0,150));
  },[]);

  const fetchUser=useCallback(async k=>{
    if(!k)return;
    try{const r=await apiFetch('/me',{headers:{Authorization:`Key ${k}`}});if(!r.ok){setUserErr('Invalid API key');setUser(null);return;}setUserErr('');setUser(await r.json());}
    catch{setUserErr('Connection error');}
  },[]);

  const fetchPortfolio=useCallback(async uid=>{
    if(!uid)return;
    try{const r=await apiFetch(`/get-user-portfolio?userId=${uid}`);setPortfolio(await r.json());}catch{}
  },[]);

  const fetchPortfolioHistory=useCallback(async uid=>{
    if(!uid)return;
    try{const r=await apiFetch(`/get-user-portfolio-history?userId=${uid}&period=allTime`);const d=await r.json();setPortfolioHistory(Array.isArray(d)?d:[]);}catch{}
  },[]);

  const fetchApiPositions=useCallback(async uid=>{
    if(!uid)return;
    try{
      const r=await apiFetch(`/get-user-contract-metrics-with-contracts?userId=${uid}&limit=500&order=profit`);
      const d=await r.json();
      if(!d.metricsByContract||!d.contracts)return;
      const cMap=Object.fromEntries(d.contracts.map(c=>[c.id,c]));
      const pos=Object.entries(d.metricsByContract).map(([contractId,metrics])=>{
        const m=metrics[0],c=cMap[contractId];
        if(!m||!c||c.isResolved)return null;
        const side=m.maxSharesOutcome;if(!side)return null;
        const shares=m.totalShares?.[side]??0;if(shares<0.001)return null;
        const cost=m.invested??0;if(cost<0.01)return null;
        return{contractId,name:c.question??contractId,side,shares,cost,value:m.payout??0,profit:m.profit??0,profitPct:m.profitPercent??0,lastProb:c.probability??null,curProb:c.probability??null,latestTime:m.lastBetTime??0,oldestTime:m.lastBetTime??0};
      }).filter(Boolean);
      setApiPositions(pos);
      setMarkets(prev=>{const ex=new Set(prev.map(m=>m.id));const newMkts=d.contracts.filter(c=>!ex.has(c.id)&&!c.isResolved&&c.pool);return newMkts.length?[...prev,...newMkts]:prev;});
    }catch{}
  },[]);

  const fetchMarkets=useCallback(async()=>{
    setMktLoading(true);
    try{const r=await apiFetch('/search-markets?term=&filter=open&contractType=BINARY&sort=liquidity&limit=200');const d=await r.json();setMarkets(Array.isArray(d)?d.filter(m=>!m.isResolved&&m.pool):[]);}catch{}
    setMktLoading(false);
  },[]);

  const fetchBets=useCallback(async(uid,k)=>{
    if(!uid||!k)return;
    try{const r=await apiFetch(`/bets?userId=${uid}&limit=1000`,{headers:{Authorization:`Key ${k}`}});const d=await r.json();if(!Array.isArray(d))return;setBets(d);return d;}catch{}
  },[]);

  const connectWS=useCallback(()=>{
    if(wsRef.current?.readyState===WebSocket.OPEN)return;
    try{
      const ws=new WebSocket('wss://api.manifold.markets/ws');
      let txid=0;
      ws.onopen=()=>{
        setWsConnected(true);
        ws.send(JSON.stringify({type:'subscribe',txid:txid++,topics:['global/new-bet']}));
        wsPingRef.current=setInterval(()=>{if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({type:'ping',txid:txid++}));},30000);
        addLog('🔌 WebSocket connected — monitoring live bets','success');
      };
      ws.onmessage=event=>{
        try{
          const msg=JSON.parse(event.data);
          if(msg.type==='broadcast'&&msg.topic==='global/new-bet'){
            const bet=msg.data,amt=bet.amount??0,move=Math.abs((bet.probAfter??0)-(bet.probBefore??0));
            if(amt>=40&&move>=0.08)addLog(`🐋 Whaler: ᴍ${amt.toFixed(0)} ${bet.outcome} moved ${(move*100).toFixed(1)}% — fade candidate`,'warn');
          }
        }catch{}
      };
      ws.onclose=()=>{setWsConnected(false);clearInterval(wsPingRef.current);if(botRunningRef.current){addLog('WebSocket dropped — reconnecting in 5s…','warn');setTimeout(connectWS,5000);}};
      ws.onerror=()=>ws.close();
      wsRef.current=ws;
    }catch(e){addLog(`WebSocket error: ${e.message}`,'error');}
  },[addLog]);

  const disconnectWS=useCallback(()=>{clearInterval(wsPingRef.current);wsRef.current?.close();wsRef.current=null;setWsConnected(false);},[]);

  useEffect(()=>{if(botRunning&&botConfig.whaler)connectWS();else disconnectWS();},[botRunning,botConfig.whaler]);
  useEffect(()=>{fetchMarkets();},[fetchMarkets]);
  useEffect(()=>{if(key)fetchUser(key);},[key,fetchUser]);
  useEffect(()=>{
    if(user?.id){
      fetchPortfolio(user.id);fetchPortfolioHistory(user.id);fetchApiPositions(user.id);
      if(key)fetchBets(user.id,key);
    }
  },[user?.id,key]);

  const mktMap=useMemo(()=>Object.fromEntries(markets.map(m=>[m.id,m])),[markets]);
  const positions=apiPositions;

  const sortedPositions=useMemo(()=>[...positions].sort((a,b)=>{
    if(posSortBy==='market_recent')return(b.latestTime-a.latestTime)*posSortDir;
    if(posSortBy==='market_oldest')return(a.oldestTime-b.oldestTime)*posSortDir;
    return((b[posSortBy]??-Infinity)-(a[posSortBy]??-Infinity))*posSortDir;
  }),[positions,posSortBy,posSortDir]);

  const togglePosSort=col=>{if(posSortBy===col)setPosSortDir(d=>d*-1);else{setPosSortBy(col);setPosSortDir(-1);}};
  const sortArrow=col=>posSortBy===col?(posSortDir===-1?' ↓':' ↑'):'';

  const resolved=useMemo(()=>bets.filter(b=>b.resolvedPayout!=null),[bets]);
  const open=useMemo(()=>bets.filter(b=>b.resolvedPayout==null&&!b.isAnte),[bets]);
  const wins=useMemo(()=>resolved.filter(b=>b.resolvedPayout>b.amount).length,[resolved]);
  const winRate=resolved.length?wins/resolved.length:null;
  const totalPnL=portfolio?.profit??resolved.reduce((s,b)=>s+(b.resolvedPayout??0)-(b.amount??0),0);
  const totalInvested=portfolio?.investmentValue??0;

  const profitAt=useCallback(msAgo=>{
    if(!portfolioHistory.length)return 0;
    const target=Date.now()-msAgo;
    let closest=portfolioHistory[0];
    for(const p of portfolioHistory){if(p.timestamp<=target)closest=p;}
    return closest?.profit??0;
  },[portfolioHistory]);

  const latestProfit=portfolioHistory.length?portfolioHistory[portfolioHistory.length-1]?.profit??0:totalPnL;
  const pnl1D=latestProfit-profitAt(86400000),pnl1W=latestProfit-profitAt(604800000),pnl1M=latestProfit-profitAt(2592000000);

  const pnlChartData=useMemo(()=>{
    if(!portfolioHistory.length)return[];
    return portfolioHistory.map(p=>({date:new Date(p.timestamp).toLocaleDateString('en-US',{month:'short',day:'numeric'}),pnl:+(p.profit??0).toFixed(1)}));
  },[portfolioHistory]);

  const recentBets=useMemo(()=>[...bets].filter(b=>!b.isRedemption&&!b.isAnte).sort((a,b)=>(b.createdTime??0)-(a.createdTime??0)).slice(0,12),[bets]);
  const recentBetsWithStrategy=useMemo(()=>recentBets.map(b=>({...b,strategy:detectStrategy(b,mktMap[b.contractId])})),[recentBets,mktMap]);
  const stratBreakdown=useMemo(()=>{
    const counts={};
    for(const b of bets.filter(b=>!b.isRedemption&&!b.isAnte)){const s=detectStrategy(b,mktMap[b.contractId]);counts[s]=(counts[s]??0)+1;}
    return Object.entries(counts).sort((a,b)=>b[1]-a[1]);
  },[bets,mktMap]);

  const displayMarkets=useMemo(()=>{
    const bal=portfolio?.balance??user?.balance??1000;
    let ms=markets.filter(m=>m.pool);
    if(catFilter!=='all')ms=ms.filter(m=>getCategory(m.question)===catFilter);
    if(search.trim())ms=ms.filter(m=>m.question.toLowerCase().includes(search.toLowerCase()));
    ms=ms.map(m=>{
      const mktP=m.probability,rawMy=myProbs[m.id],ourP=rawMy!=null?rawMy/100:null;
      const side=ourP!=null?(ourP>mktP?'YES':'NO'):null;
      const mktPAdj=side==='YES'?mktP:1-mktP,ourPAdj=ourP!=null?(side==='YES'?ourP:1-ourP):null;
      const ev=ourPAdj!=null&&mktPAdj>0?ourPAdj-mktPAdj:null,cw=catW(m.question);
      const maxSafe=side?maxBetForSlip(m.pool,slipCap,side):0;
      const size=ev!=null&&ev>0?Math.max(1,Math.min(kelly(mktPAdj,ourPAdj,bal)*cw,maxSafe)):0;
      return{...m,ourP,side,ev,cw,size,cat:getCategory(m.question)};
    });
    ms.sort((a,b)=>{if(sortBy==='volume')return(b.volume??0)-(a.volume??0);if(sortBy==='liquidity')return(b.totalLiquidity??0)-(a.totalLiquidity??0);if(sortBy==='closeDate')return(a.closeTime??Infinity)-(b.closeTime??Infinity);return((b.ev??-99)*b.cw)-((a.ev??-99)*a.cw);});
    return ms.slice(0,80);
  },[markets,catFilter,search,sortBy,myProbs,portfolio?.balance,user?.balance,slipCap]);

  const topOpps=useMemo(()=>displayMarkets.filter(m=>m.ev!=null&&m.ev>0&&m.size>0).sort((a,b)=>(b.ev*b.cw)-(a.ev*a.cw)).slice(0,6),[displayMarkets]);

  // Dynamic base rates from resolved bet history
  const dynamicBaseRates = useMemo(()=>{
    if (!resolved.length) return {};
    const betsWithQ = resolved.map(b=>({...b, question: mktMap[b.contractId]?.question??''}));
    return calcDynamicBaseRates(betsWithQ);
  }, [resolved, mktMap]);

  // Category allocation of current open positions
  const catAllocated = useMemo(()=>{
    const alloc = {};
    for (const p of positions) {
      const cat = getCategory(p.name);
      alloc[cat] = (alloc[cat]??0) + p.cost;
    }
    return alloc;
  }, [positions]);

  const botSuggestions=useMemo(()=>{
    const bal=portfolio?.balance??user?.balance??1000;
    if(!bal||!markets.length)return[];
    return getBotBets(markets,[],{...botConfig,slipCap},bal).slice(0,8);
  },[markets,portfolio?.balance,user?.balance,botConfig,slipCap]);

  const openModal=(m,side)=>{const s=side??m.side??'YES';setModal(m);setBetAmt(m.size>0?Math.max(1,Math.round(m.size)):10);setBetSide(s);setBetMsg(null);};

  const placeBet=async()=>{
    if(!key||!modal)return;
    const s=calcSlip(modal.pool,betAmt,betSide);
    if(s>slipCap){setBetMsg({err:`Slippage ${(s*100).toFixed(2)}% exceeds cap`});return;}
    setPlacing(true);setBetMsg(null);
    try{
      const r=await apiFetch('/bet',{method:'POST',headers:{Authorization:`Key ${key}`,'Content-Type':'application/json'},body:JSON.stringify({contractId:modal.id,outcome:betSide,amount:betAmt})});
      const d=await r.json();
      if(d.betId||d.isFilled){setBetMsg({ok:`Placed ᴍ${betAmt} on ${betSide}`});fetchUser(key);fetchPortfolio(user?.id);fetchPortfolioHistory(user?.id);fetchApiPositions(user?.id);fetchBets(user?.id,key);fetchMarkets();}
      else setBetMsg({err:d.message??'Unknown error'});
    }catch(e){setBetMsg({err:e.message});}
    setPlacing(false);
  };

  const runBotCycle=useCallback(async()=>{
    if(!key||!user||botCycleRunning){if(!key||!user)addLog('Not connected','error');return;}
    setBotCycleRunning(true);
    const balance=portfolio?.balance??user.balance??0;
    const freeCapital=Math.max(0,balance-totalInvested-botConfig.balanceReserve);
    addLog(`▶ Cycle #${botSession.cycles+1} | Balance: ᴍ${balance.toFixed(0)} | ${botDryRun?'DRY RUN':'LIVE'}`,'info');
    try{
      const r=await apiFetch('/search-markets?term=&filter=open&contractType=BINARY&sort=liquidity&limit=200');
      const fresh=await r.json();
      const valid=Array.isArray(fresh)?fresh.filter(m=>!m.isResolved&&m.pool):[];
      addLog(`Fetched ${valid.length} markets`,'info');
      const dynRates=Object.entries(dynamicBaseRates);
      if(dynRates.length) addLog(`Dynamic base rates: ${dynRates.map(([c,r])=>`${c}=${(r*100).toFixed(0)}%`).join(', ')}`,'info');
      addLog(`Free capital: ᴍ${freeCapital.toFixed(0)} | Cat limits: ${Object.entries(catAllocated).map(([c,v])=>`${c}=ᴍ${v.toFixed(0)}`).join(', ')||'none'}`,'info');
      const proposed=getBotBets(valid,botBetHistory,{...botConfig,slipCap},balance,totalInvested,catAllocated,dynamicBaseRates);
      addLog(`${proposed.length} opportunities found`,'info');
      if(!proposed.length){addLog('No trades this cycle','info');setBotCycleRunning(false);setBotSession(s=>({...s,cycles:s.cycles+1}));return;}
      let placed=0,spent=0;
      for(const bet of proposed){
        if(spent+bet.size>botConfig.dailyLimit){addLog(`Daily limit ᴍ${botConfig.dailyLimit} reached`,'warn');break;}
        const slip=calcSlip(bet.market.pool,bet.size,bet.side);
        if(slip>botConfig.slipCap){addLog(`  SKIP slip ${(slip*100).toFixed(1)}% | ${bet.market.question.slice(0,40)}…`,'warn');continue;}
        const label=`${STRAT_LABELS[bet.strategy]} → ${bet.side} ᴍ${bet.size} | EV +${(bet.ev*100).toFixed(1)}% | ${bet.market.question.slice(0,35)}…`;
        try{
          const r2=await apiFetch('/bet',{method:'POST',headers:{Authorization:`Key ${key}`,'Content-Type':'application/json'},body:JSON.stringify({contractId:bet.market.id,outcome:bet.side,amount:bet.size,dryRun:botDryRun})});
          const d=await r2.json();
          if(d.betId||d.isFilled||(botDryRun&&d.amount!=null)){
            addLog(`  ${botDryRun?'[DRY]':'✓'} ${label}`,botDryRun?'dry':'success');
            placed++;spent+=bet.size;setBotBetHistory(prev=>[...prev,{contractId:bet.market.id}]);
          }else addLog(`  ✗ ${d.message??'failed'} | ${bet.market.question.slice(0,35)}…`,'error');
        }catch(e){addLog(`  ✗ ${e.message}`,'error');}
        if(!botDryRun)await new Promise(r=>setTimeout(r,400));
      }
      addLog(`◀ Done — ${placed} bets, ᴍ${spent}${botDryRun?' (dry)':' spent'}`,placed>0?'success':'info');
      setBotSession(s=>({cycles:s.cycles+1,betsPlaced:s.betsPlaced+placed,manaSpent:s.manaSpent+spent}));
      if(!botDryRun){fetchUser(key);fetchPortfolio(user.id);fetchPortfolioHistory(user.id);fetchApiPositions(user.id);fetchBets(user.id,key);}
    }catch(e){addLog(`Cycle error: ${e.message}`,'error');}
    setBotCycleRunning(false);
  },[key,user,botDryRun,botConfig,botBetHistory,slipCap,addLog,botCycleRunning,botSession.cycles,portfolio]);

  useEffect(()=>{
    if(botRunning){runBotCycle();botTimerRef.current=setInterval(runBotCycle,botInterval*60000);}
    else clearInterval(botTimerRef.current);
    return()=>clearInterval(botTimerRef.current);
  },[botRunning,botInterval]);

  const TABS=[{id:'dashboard',icon:'▦',label:'Dashboard'},{id:'markets',icon:'◈',label:'Markets'},{id:'portfolio',icon:'◉',label:'Portfolio'},{id:'bot',icon:'⚡',label:'Bot'}];
  const C={background:'#0d0e1a',border:'1px solid #1a1d2e',borderRadius:14,overflow:'hidden'};
  const logColor={info:'#6b7280',success:'#34d399',error:'#f87171',warn:'#fbbf24',dry:'#818cf8'};
  const STRATEGIES=[
    {id:'calibration',label:'Calibration',desc:'Category base rates — bets when deviation >12%.'},
    {id:'extreme_fade',label:'Extreme Fade',desc:'Fades markets at ≥93% or ≤7% probability.'},
    {id:'new_market',label:'New Market Sniper',desc:'Fades extreme probs on freshly created markets (≤3 bets).'},
    {id:'attrition',label:'Attrition',desc:'Bets NO on "by 20XX" markets where nothing is happening.'},
    {id:'whaler',label:'Whaler (WebSocket)',desc:'Live WS feed — logs large bets that move markets ≥8%. Bot-only.'},
    {id:'mean_reversion',label:'Mean Reversion',desc:'(Coming soon) Fades large sudden probability moves.'},
  ];

  const showBotSuggestions=topOpps.length===0;
  const oppList=showBotSuggestions?botSuggestions:topOpps;

  return (
    <div style={{minHeight:'100vh',background:'#07080f',color:'#e2e8f0',fontFamily:'"Inter",system-ui,sans-serif',fontSize:14}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Archivo:wght@300;400;600;700&family=JetBrains+Mono:wght@400;600&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        ::-webkit-scrollbar{width:4px;height:4px;}::-webkit-scrollbar-track{background:#0f1117;}::-webkit-scrollbar-thumb{background:#2d3148;border-radius:4px;}
        input,select,button{font-family:inherit;}
        @keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pulseGlow{0%,100%{opacity:.3}50%{opacity:.7}}
        @keyframes drawLine{from{stroke-dashoffset:100}to{stroke-dashoffset:0}}
        @keyframes spin{to{transform:rotate(360deg)}}
        .card{animation:fadeIn .2s ease}.pulse-glow{animation:pulseGlow 3s ease-in-out infinite}.draw-line{stroke-dasharray:100;animation:drawLine 1.5s ease-out forwards}.spin{animation:spin 1s linear infinite;display:inline-block}
      `}</style>

      {/* Sidebar */}
      <div style={{position:'fixed',left:0,top:0,bottom:0,width:200,background:'#0d0e1a',borderRight:'1px solid #1a1d2e',display:'flex',flexDirection:'column',zIndex:30,padding:'20px 12px'}}>
        <div style={{marginBottom:32,paddingBottom:20,borderBottom:'1px solid #1a2e1a'}}>
          <svg width="160" height="44" viewBox="0 0 160 44" fill="none">
            <g className="pulse-glow"><circle cx="12" cy="22" r="5" fill="#10b981" opacity="0.35"/><circle cx="26" cy="12" r="5" fill="#10b981" opacity="0.35"/><circle cx="26" cy="32" r="5" fill="#10b981" opacity="0.35"/><circle cx="40" cy="22" r="5" fill="#10b981" opacity="0.35"/></g>
            <line x1="12" y1="22" x2="26" y2="12" stroke="#10b981" strokeWidth="1.2" opacity="0.25" className="draw-line"/>
            <line x1="12" y1="22" x2="26" y2="32" stroke="#10b981" strokeWidth="1.2" opacity="0.25" className="draw-line" style={{animationDelay:'.2s'}}/>
            <line x1="26" y1="12" x2="40" y2="22" stroke="#10b981" strokeWidth="1.2" opacity="0.25" className="draw-line" style={{animationDelay:'.4s'}}/>
            <line x1="26" y1="32" x2="40" y2="22" stroke="#10b981" strokeWidth="1.2" opacity="0.25" className="draw-line" style={{animationDelay:'.6s'}}/>
            <circle cx="12" cy="22" r="3" fill="#10b981"/><circle cx="26" cy="12" r="3" fill="#10b981"/><circle cx="26" cy="32" r="3" fill="#10b981"/><circle cx="40" cy="22" r="3" fill="#10b981"/>
            <text x="54" y="30" fill="#f4f4f5" fontSize="26" fontWeight="300" fontFamily="Archivo" letterSpacing="-0.5">Dayli</text>
          </svg>
          <div style={{fontSize:10,color:'#1e4d2e',letterSpacing:'0.1em',fontFamily:'JetBrains Mono,monospace',marginTop:4}}>MANIFOLD TRADING</div>
        </div>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',borderRadius:10,border:'none',cursor:'pointer',marginBottom:4,fontSize:13,fontWeight:tab===t.id?600:400,background:tab===t.id?'rgba(99,102,241,.15)':'transparent',color:tab===t.id?'#818cf8':'#6b7280',transition:'all .15s',textAlign:'left'}}>
            <span style={{fontSize:15}}>{t.icon}</span>{t.label}
            {t.id==='bot'&&botRunning&&<span style={{marginLeft:'auto',width:7,height:7,borderRadius:'50%',background:'#34d399',boxShadow:'0 0 6px #34d399'}}/>}
            {t.id==='bot'&&wsConnected&&<span style={{marginLeft:2,width:6,height:6,borderRadius:'50%',background:'#e879f9',boxShadow:'0 0 5px #e879f9'}}/>}
          </button>
        ))}
        <div style={{marginTop:'auto',borderTop:'1px solid #1a1d2e',paddingTop:16}}>
          {user?(
            <div style={{padding:'10px 12px',borderRadius:10,background:'rgba(99,102,241,.08)',border:'1px solid rgba(99,102,241,.15)'}}>
              <div style={{fontSize:11,color:'#4b5280',marginBottom:3}}>CONNECTED</div>
              <div style={{color:'#818cf8',fontWeight:600,fontSize:13}}>@{user.username}</div>
              <div style={{color:'#34d399',fontWeight:700,fontSize:16,marginTop:2}}>ᴍ{fmt(portfolio?.balance??user.balance??0)}</div>
              {portfolio?.dailyProfit!=null&&<div style={{fontSize:11,color:portfolio.dailyProfit>=0?'#34d399':'#f87171',marginTop:2}}>{portfolio.dailyProfit>=0?'+':''}ᴍ{fmt(portfolio.dailyProfit)} today</div>}
            </div>
          ):<div style={{fontSize:11,color:'#3d4166',textAlign:'center'}}>Not connected</div>}
          {userErr&&<div style={{fontSize:11,color:'#f87171',marginTop:6,textAlign:'center'}}>{userErr}</div>}
          <button onClick={()=>setShowKey(!showKey)} style={{width:'100%',marginTop:10,padding:'8px 12px',borderRadius:8,border:'1px solid #1a1d2e',background:'transparent',color:'#6b7280',cursor:'pointer',fontSize:12}}>{key?'🔑 Change Key':'🔐 API Key'}</button>
        </div>
      </div>

      {/* Main */}
      <div style={{marginLeft:200,minHeight:'100vh'}}>
        <div style={{position:'sticky',top:0,zIndex:20,background:'rgba(7,8,15,.9)',backdropFilter:'blur(12px)',borderBottom:'1px solid #1a1d2e',padding:'12px 28px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <div style={{fontSize:18,fontWeight:700,color:'#c7d2fe'}}>{TABS.find(t=>t.id===tab)?.label}</div>
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            {wsConnected&&<span style={{fontSize:11,color:'#e879f9',display:'flex',alignItems:'center',gap:4}}><span style={{width:6,height:6,borderRadius:'50%',background:'#e879f9',display:'inline-block'}}/>WS Live</span>}
            <div style={{display:'flex',alignItems:'center',gap:8,fontSize:12,color:'#4b5280'}}>Slip cap:
              <select value={slipCap} onChange={e=>setSlipCap(+e.target.value)} style={{background:'#0f1117',border:'1px solid #1a1d2e',borderRadius:6,padding:'4px 8px',color:'#818cf8',fontSize:12,cursor:'pointer'}}>
                {[0.01,0.02,0.03,0.05].map(v=><option key={v} value={v}>{(v*100).toFixed(0)}%</option>)}
              </select>
            </div>
            <button onClick={()=>{fetchMarkets();if(user?.id){fetchUser(key);fetchPortfolio(user.id);fetchPortfolioHistory(user.id);fetchApiPositions(user.id);if(key)fetchBets(user.id,key);}}} style={{background:'#0f1117',border:'1px solid #1a1d2e',borderRadius:6,padding:'5px 12px',color:'#6b7280',cursor:'pointer',fontSize:12}}>↻ Refresh</button>
          </div>
        </div>

        {showKey&&(
          <div style={{background:'#0d0e1a',borderBottom:'1px solid #1a1d2e',padding:'12px 28px',display:'flex',gap:10,alignItems:'center'}}>
            <input type="password" placeholder="Enter Manifold API key…" value={keyInput} onChange={e=>setKeyInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){setKey(keyInput);setShowKey(false);}}} style={{flex:1,maxWidth:340,background:'#07080f',border:'1px solid #2d3148',borderRadius:8,padding:'8px 14px',color:'white',fontSize:13,outline:'none'}}/>
            <button onClick={()=>{setKey(keyInput);setShowKey(false);}} style={{background:'#4f46e5',border:'none',borderRadius:8,padding:'8px 18px',color:'white',cursor:'pointer',fontWeight:600,fontSize:13}}>Connect</button>
            <span style={{fontSize:11,color:'#3d4166'}}>Session only · never stored</span>
          </div>
        )}

        <div style={{padding:'24px 28px'}}>

          {/* Dashboard */}
          {tab==='dashboard'&&(
            <div style={{display:'flex',flexDirection:'column',gap:20}} className="card">
              <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:16}}>
                {[
                  {l:'Balance',v:`ᴍ${fmt(portfolio?.balance??user?.balance??0)}`,sub:portfolio?.dailyProfit!=null?`${portfolio.dailyProfit>=0?'+':''}ᴍ${fmt(portfolio.dailyProfit)} today`:'Manifold Mana',c:'#34d399'},
                  {l:'Invested',v:`ᴍ${fmt(totalInvested)}`,sub:`${positions.length} positions`,c:'#818cf8'},
                  {l:'Total P&L',v:`${totalPnL>=0?'+':''}ᴍ${fmt(Math.abs(totalPnL))}`,sub:'All time',c:totalPnL>=0?'#34d399':'#f87171'},
                  {l:'Win Rate',v:winRate!=null?`${(winRate*100).toFixed(0)}%`:'—',sub:`${wins}/${resolved.length} resolved`,c:'#a78bfa'},
                  {l:'Open Bets',v:positions.length,sub:'Active positions',c:'#fbbf24'},
                ].map(({l,v,sub,c})=>(
                  <div key={l} style={{background:'#0d0e1a',border:'1px solid #1a1d2e',borderRadius:14,padding:'18px 20px'}}>
                    <div style={{fontSize:11,color:'#4b5280',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:6}}>{l}</div>
                    <div style={{fontSize:24,fontWeight:800,color:c}}>{v}</div>
                    <div style={{fontSize:11,color:'#3d4166',marginTop:6}}>{sub}</div>
                  </div>
                ))}
              </div>

              <div style={{display:'grid',gridTemplateColumns:'180px 1fr 160px',gap:16}}>
                <div style={{...C,padding:'16px 18px'}}>
                  <div style={{fontSize:11,color:'#4b5280',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:12}}>Profit</div>
                  {[['1D',pnl1D],['1W',pnl1W],['1M',pnl1M],['LIFE',totalPnL]].map(([l,v])=>(
                    <div key={l} style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
                      <span style={{fontSize:12,color:'#4b5280',fontFamily:'JetBrains Mono,monospace',fontWeight:600}}>{l}</span>
                      <span style={{fontSize:14,fontWeight:700,color:v>=0?'#34d399':'#f87171'}}>{v>=0?'+':''}ᴍ{fmt(Math.abs(v))}</span>
                    </div>
                  ))}
                </div>
                <div style={{...C,padding:'16px 18px'}}>
                  <div style={{fontSize:11,color:'#4b5280',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:10}}>Portfolio P&L</div>
                  {pnlChartData.length<2?<div style={{height:100,display:'flex',alignItems:'center',justifyContent:'center',color:'#3d4166',fontSize:12}}>No history yet</div>:(
                    <ResponsiveContainer width="100%" height={100}>
                      <LineChart data={pnlChartData} margin={{top:4,right:8,left:0,bottom:0}}>
                        <XAxis dataKey="date" tick={{fontSize:10,fill:'#3d4166'}} tickLine={false} axisLine={false} interval="preserveStartEnd"/>
                        <YAxis tick={{fontSize:10,fill:'#3d4166'}} tickLine={false} axisLine={false} width={38} tickFormatter={v=>Math.abs(v)>=1000?`${(v/1000).toFixed(0)}k`:String(v)}/>
                        <Tooltip contentStyle={{background:'#0d0e1a',border:'1px solid #1a1d2e',borderRadius:8,fontSize:12}} labelStyle={{color:'#c7d2fe'}} formatter={v=>[`ᴍ${v.toFixed(1)}`,'P&L']}/>
                        <Line type="monotone" dataKey="pnl" stroke="#6366f1" strokeWidth={2} dot={false} activeDot={{r:4,fill:'#818cf8'}}/>
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>
                <div style={{...C,padding:'16px 18px'}}>
                  <div style={{fontSize:11,color:'#4b5280',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:12}}>By Strategy</div>
                  {stratBreakdown.length===0?<div style={{fontSize:12,color:'#3d4166'}}>No data yet</div>:
                   stratBreakdown.map(([s,n])=>(
                    <div key={s} style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                      <span style={{fontSize:11,padding:'1px 7px',borderRadius:99,background:`${STRAT_COLORS[s]}18`,color:STRAT_COLORS[s],fontWeight:600}}>{STRAT_LABELS[s]}</span>
                      <span style={{fontSize:12,color:'#6b7280',fontWeight:600}}>{n}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div style={C}>
                <div style={{padding:'14px 20px',borderBottom:'1px solid #1a1d2e',fontWeight:700,color:'#c7d2fe'}}>Recent Bets</div>
                <div style={{display:'grid',gridTemplateColumns:'110px 1fr 90px 50px 54px 54px',gap:8,padding:'6px 20px',fontSize:11,color:'#3d4166',textTransform:'uppercase',letterSpacing:'.05em',borderBottom:'1px solid #111320'}}>
                  <span>Time</span><span>Market</span><span>Strategy</span><span>Out</span><span style={{textAlign:'right'}}>Prob</span><span style={{textAlign:'right'}}>Amt</span>
                </div>
                {recentBetsWithStrategy.length===0?<div style={{padding:20,color:'#3d4166',textAlign:'center',fontSize:12}}>No bets yet</div>:
                 recentBetsWithStrategy.map((b,i)=>{
                  const name=mktMap[b.contractId]?.question??b.contractId;
                  const time=b.createdTime?new Date(b.createdTime).toLocaleString('en-US',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}):'—';
                  const prob=b.probAfter??b.probBefore;
                  return(
                    <div key={b.id} style={{display:'grid',gridTemplateColumns:'110px 1fr 90px 50px 54px 54px',gap:8,alignItems:'center',padding:'9px 20px',borderBottom:i<recentBetsWithStrategy.length-1?'1px solid #111320':'none',fontSize:12}}>
                      <span style={{color:'#3d4166',fontSize:10}}>{time}</span>
                      <span style={{whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',color:'#94a3b8'}}>{name}</span>
                      <span><span style={{fontSize:10,fontWeight:600,padding:'2px 7px',borderRadius:99,background:`${STRAT_COLORS[b.strategy]}18`,color:STRAT_COLORS[b.strategy]}}>{STRAT_LABELS[b.strategy]}</span></span>
                      <span><span style={{fontSize:11,fontWeight:700,padding:'2px 6px',borderRadius:5,background:b.outcome==='YES'?'rgba(52,211,153,.12)':'rgba(248,113,113,.12)',color:b.outcome==='YES'?'#34d399':'#f87171'}}>{b.outcome}</span></span>
                      <span style={{textAlign:'right',color:'#818cf8'}}>{prob!=null?`${(prob*100).toFixed(0)}%`:'—'}</span>
                      <span style={{textAlign:'right',color:'#c7d2fe'}}>ᴍ{(b.amount??0).toFixed(0)}</span>
                    </div>
                  );
                })}
              </div>

              <div style={C}>
                <div style={{padding:'16px 20px',borderBottom:'1px solid #1a1d2e',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <div style={{fontWeight:700,color:'#c7d2fe'}}>{showBotSuggestions?'Bot Suggestions':'Top Opportunities'}</div>
                  <div style={{fontSize:11,color:'#4b5280'}}>{showBotSuggestions?`${botSuggestions.length} from strategy model · REST`:`${topOpps.length} from your probs`}</div>
                </div>
                {oppList.length===0?(
                  <div style={{padding:32,textAlign:'center',color:'#3d4166'}}>
                    <div style={{fontSize:28,marginBottom:8}}>◈</div>
                    <div style={{fontWeight:600,color:'#4b5280',marginBottom:4}}>No opportunities yet</div>
                    <div style={{fontSize:12}}>Markets are loading or no edge found above threshold</div>
                    <button onClick={()=>setTab('markets')} style={{marginTop:14,background:'rgba(99,102,241,.15)',border:'1px solid rgba(99,102,241,.3)',borderRadius:8,padding:'8px 20px',color:'#818cf8',cursor:'pointer',fontSize:13,fontWeight:600}}>Browse Markets →</button>
                  </div>
                ):oppList.map((item,i)=>{
                  const isBot=showBotSuggestions;
                  const m=isBot?item.market:item;
                  const side=isBot?item.side:item.side;
                  const ev=isBot?item.ev:item.ev;
                  const size=isBot?item.size:item.size;
                  const strat=isBot?item.strategy:null;
                  return(
                    <div key={m.id} style={{display:'flex',alignItems:'center',gap:14,padding:'14px 20px',borderBottom:i<oppList.length-1?'1px solid #111320':'none'}}
                      onMouseEnter={e=>e.currentTarget.style.background='#0f1117'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                      <div style={{width:26,height:26,borderRadius:8,background:strat?`${STRAT_COLORS[strat]}18`:'rgba(99,102,241,.12)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,color:strat?STRAT_COLORS[strat]:'#6366f1',fontWeight:700,flexShrink:0}}>#{i+1}</div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',color:'#e2e8f0',fontWeight:500}}>{m.question}</div>
                        <div style={{display:'flex',gap:8,marginTop:4,alignItems:'center'}}>
                          {strat?<span style={{fontSize:11,padding:'1px 7px',borderRadius:99,background:`${STRAT_COLORS[strat]}18`,color:STRAT_COLORS[strat],fontWeight:600}}>{STRAT_LABELS[strat]}</span>
                                :<span style={{fontSize:11,padding:'1px 7px',borderRadius:99,background:'rgba(99,102,241,.1)',color:catColor(m.question),fontWeight:600}}>{m.cat}</span>}
                          <span style={{fontSize:11,color:'#4b5280'}}>mkt {(m.probability*100).toFixed(1)}%</span>
                          <span style={{fontSize:11,color:'#34d399'}}>EV +{((ev??0)*100).toFixed(1)}%</span>
                        </div>
                      </div>
                      <div style={{display:'flex',gap:8,flexShrink:0}}>
                        <span style={{fontSize:12,fontWeight:700,padding:'3px 10px',borderRadius:8,background:side==='YES'?'rgba(52,211,153,.12)':'rgba(248,113,113,.12)',color:side==='YES'?'#34d399':'#f87171'}}>{side}</span>
                        <button onClick={()=>{isBot?openModal({...m,ourP:item.ourP,ev:item.ev,cw:catW(m.question),size:item.size,cat:getCategory(m.question)},side):openModal(m);}} style={{background:'linear-gradient(135deg,#4f46e5,#6366f1)',border:'none',borderRadius:8,padding:'6px 14px',color:'white',cursor:'pointer',fontWeight:600,fontSize:12}}>ᴍ{size}</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Markets */}
          {tab==='markets'&&(
            <div className="card">
              <div style={{display:'flex',gap:10,marginBottom:14,flexWrap:'wrap',alignItems:'center'}}>
                <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search markets…" style={{background:'#0d0e1a',border:'1px solid #1a1d2e',borderRadius:8,padding:'7px 14px',color:'white',fontSize:13,outline:'none',width:220}}/>
                <select value={sortBy} onChange={e=>setSortBy(e.target.value)} style={{background:'#0d0e1a',border:'1px solid #1a1d2e',borderRadius:8,padding:'7px 12px',color:'#c7d2fe',fontSize:13,cursor:'pointer'}}>
                  <option value="volume">Sort: Volume</option><option value="liquidity">Sort: Liquidity</option><option value="closeDate">Sort: Closing Soon</option><option value="edge">Sort: Your Edge</option>
                </select>
              </div>
              <div style={{display:'flex',gap:8,marginBottom:14,flexWrap:'wrap'}}>
                {['all',...Object.keys(CATS)].map(c=>(
                  <button key={c} onClick={()=>setCatFilter(c)} style={{padding:'4px 13px',borderRadius:99,border:'1px solid',fontSize:12,fontWeight:500,cursor:'pointer',transition:'all .15s',borderColor:catFilter===c?(c==='all'?'#6366f1':catColor(c)):'#1a1d2e',background:catFilter===c?(c==='all'?'rgba(99,102,241,.15)':`${catColor(c)}18`):'transparent',color:catFilter===c?(c==='all'?'#818cf8':catColor(c)):'#4b5280'}}>{c}</button>
                ))}
              </div>
              <div style={{fontSize:11,color:'#3d4166',marginBottom:12}}>{mktLoading?'Loading…':`${displayMarkets.length} markets`}</div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 80px 70px 90px 80px 90px',gap:8,padding:'7px 14px',fontSize:11,color:'#3d4166',textTransform:'uppercase',letterSpacing:'.05em',borderBottom:'1px solid #1a1d2e'}}>
                <span>Market</span><span style={{textAlign:'right'}}>Mkt %</span><span style={{textAlign:'center'}}>My %</span><span style={{textAlign:'right'}}>EV / Kelly</span><span style={{textAlign:'right'}}>Volume</span><span style={{textAlign:'right'}}>Action</span>
              </div>
              <div style={{display:'flex',flexDirection:'column'}}>
                {displayMarkets.map((m,i)=>{
                  const myVal=myProbs[m.id]??'',hasEdge=m.ev!=null&&m.ev>0;
                  const slip=m.side&&m.size>0?calcSlip(m.pool,m.size,m.side):0,blocked=slip>slipCap;
                  const closes=m.closeTime?new Date(m.closeTime).toLocaleDateString('en-US',{month:'short',day:'numeric'}):null;
                  return(
                    <div key={m.id} style={{display:'grid',gridTemplateColumns:'1fr 80px 70px 90px 80px 90px',gap:8,alignItems:'center',padding:'11px 14px',borderBottom:i<displayMarkets.length-1?'1px solid #0f1117':'none',transition:'background .12s'}}
                      onMouseEnter={e=>e.currentTarget.style.background='#0d0e1a'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                      <div style={{minWidth:0}}>
                        <div style={{whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',color:'#c7d2fe',fontSize:13,fontWeight:500}}>{m.question}</div>
                        <div style={{display:'flex',gap:6,marginTop:3,alignItems:'center'}}>
                          <span style={{fontSize:10,padding:'1px 6px',borderRadius:99,background:'rgba(99,102,241,.08)',color:catColor(m.question),fontWeight:600}}>{m.cat}</span>
                          {closes&&<span style={{fontSize:10,color:'#3d4166'}}>closes {closes}</span>}
                        </div>
                      </div>
                      <div style={{textAlign:'right',fontWeight:600,color:'#94a3b8',fontSize:13}}>{(m.probability*100).toFixed(1)}%</div>
                      <div style={{display:'flex',justifyContent:'center'}}>
                        <input type="number" min="1" max="99" placeholder="—" value={myVal} onChange={e=>{const v=e.target.value;setMyProbs(p=>({...p,[m.id]:v===''?undefined:Math.min(99,Math.max(1,+v))}));}} style={{width:56,background:myVal?'rgba(99,102,241,.1)':'#111320',border:`1px solid ${myVal?'rgba(99,102,241,.3)':'#1a1d2e'}`,borderRadius:6,padding:'4px 6px',color:myVal?'#818cf8':'#4b5280',fontSize:13,fontWeight:600,textAlign:'center',outline:'none'}}/>
                      </div>
                      <div style={{textAlign:'right'}}>{hasEdge?(<><div style={{fontSize:13,fontWeight:700,color:'#34d399'}}>+{(m.ev*100).toFixed(1)}%</div><div style={{fontSize:11,color:blocked?'#f87171':'#4b5280'}}>ᴍ{m.size.toFixed(0)}{blocked?' ⛔':''}</div></>):<div style={{fontSize:12,color:'#3d4166'}}>—</div>}</div>
                      <div style={{textAlign:'right',fontSize:12,color:'#4b5280'}}><div>ᴍ{fmt(m.volume??0)}</div>{m.totalLiquidity&&<div style={{fontSize:11,color:'#3d4166'}}>liq {fmt(m.totalLiquidity)}</div>}</div>
                      <div style={{display:'flex',gap:4,justifyContent:'flex-end'}}>
                        <button onClick={()=>openModal({...m},m.side??'YES')} disabled={!key} style={{background:key?'linear-gradient(135deg,#4f46e5,#6366f1)':'#111320',border:'none',borderRadius:7,padding:'5px 12px',color:key?'white':'#3d4166',cursor:key?'pointer':'default',fontWeight:600,fontSize:12}}>{key?'Bet':'Login'}</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Portfolio */}
          {tab==='portfolio'&&(
            <div className="card" style={{display:'flex',flexDirection:'column',gap:16}}>
              {!key?(
                <div style={{textAlign:'center',padding:48,color:'#3d4166'}}><div style={{fontSize:32,marginBottom:8}}>🔐</div><div>Connect your API key to view portfolio</div></div>
              ):<>
                <div style={C}>
                  <div style={{padding:'14px 20px',borderBottom:'1px solid #1a1d2e',fontWeight:700,color:'#c7d2fe',display:'flex',justifyContent:'space-between'}}><span>Open Positions</span><span style={{color:'#fbbf24'}}>{positions.length}</span></div>
                  {positions.length>0&&(
                    <div style={{display:'grid',gridTemplateColumns:'1fr 72px 72px 72px 72px 72px',gap:8,padding:'7px 20px',borderBottom:'1px solid #111320',fontSize:11,color:'#3d4166',textTransform:'uppercase',letterSpacing:'.05em'}}>
                      <span onClick={()=>togglePosSort('market_recent')} style={{cursor:'pointer',color:posSortBy==='market_recent'?'#818cf8':'#3d4166',userSelect:'none'}}>Market{sortArrow('market_recent')}</span>
                      {[['cost','Cost'],['value','Value'],['profit','Profit'],['profitPct','P&L %'],['lastProb','Prob']].map(([col,label])=>(
                        <span key={col} onClick={()=>togglePosSort(col)} style={{textAlign:'right',cursor:'pointer',color:posSortBy===col?'#818cf8':'#3d4166',userSelect:'none',transition:'color .15s'}}>{label}{sortArrow(col)}</span>
                      ))}
                    </div>
                  )}
                  {positions.length===0?<div style={{padding:20,color:'#3d4166',textAlign:'center'}}>No open positions</div>:
                   sortedPositions.map((p,i)=>(
                    <div key={p.contractId} style={{display:'grid',gridTemplateColumns:'1fr 72px 72px 72px 72px 72px',gap:8,alignItems:'center',padding:'12px 20px',borderBottom:i<sortedPositions.length-1?'1px solid #111320':'none'}}>
                      <div style={{minWidth:0}}>
                        <div style={{whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',color:'#c7d2fe',fontSize:13,fontWeight:500}}>{p.name}</div>
                        <div style={{display:'flex',gap:6,marginTop:3}}>
                          <span style={{fontSize:11,fontWeight:700,padding:'1px 7px',borderRadius:6,background:p.side==='YES'?'rgba(52,211,153,.1)':'rgba(248,113,113,.1)',color:p.side==='YES'?'#34d399':'#f87171'}}>{p.side}</span>
                          <span style={{fontSize:11,color:'#3d4166'}}>{p.shares.toFixed(1)} shares</span>
                        </div>
                      </div>
                      <div style={{textAlign:'right',fontSize:13,color:'#6b7280'}}>ᴍ{p.cost.toFixed(1)}</div>
                      <div style={{textAlign:'right',fontSize:13,color:'#c7d2fe'}}>{p.value!=null?`ᴍ${p.value.toFixed(1)}`:'—'}</div>
                      <div style={{textAlign:'right',fontSize:13,fontWeight:600,color:p.profit==null?'#4b5280':p.profit>=0?'#34d399':'#f87171'}}>{p.profit!=null?`${p.profit>=0?'+':''}ᴍ${p.profit.toFixed(1)}`:'—'}</div>
                      <div style={{textAlign:'right',fontSize:13,fontWeight:600,color:p.profitPct==null?'#4b5280':p.profitPct>=0?'#34d399':'#f87171'}}>{p.profitPct!=null?`${p.profitPct>=0?'+':''}${p.profitPct.toFixed(1)}%`:'—'}</div>
                      <div style={{textAlign:'right',fontSize:13,color:'#818cf8'}}>{p.lastProb!=null?`${(p.lastProb*100).toFixed(1)}%`:'—'}</div>
                    </div>
                  ))}
                </div>
                <div style={C}>
                  <div style={{padding:'14px 20px',borderBottom:'1px solid #1a1d2e',fontWeight:700,color:'#c7d2fe',display:'flex',gap:12,alignItems:'center'}}>
                    <span>Resolved</span>
                    {resolved.length>0&&<><span style={{color:totalPnL>=0?'#34d399':'#f87171',fontWeight:800}}>{totalPnL>=0?'+':''}ᴍ{totalPnL.toFixed(1)}</span>{winRate!=null&&<span style={{color:'#818cf8',fontSize:12}}>{(winRate*100).toFixed(0)}% win rate</span>}</>}
                    <span style={{marginLeft:'auto',color:'#4b5280',fontWeight:400,fontSize:12}}>{resolved.length} bets</span>
                  </div>
                  {resolved.length===0?<div style={{padding:20,color:'#3d4166',textAlign:'center'}}>No resolved bets yet</div>:
                   resolved.slice(0,25).map((b,i)=>{const pnl=b.resolvedPayout-b.amount;return(
                    <div key={b.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'11px 20px',borderBottom:i<Math.min(resolved.length,25)-1?'1px solid #111320':'none'}}>
                      <div style={{flex:1,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',color:'#94a3b8',marginRight:12,fontSize:13}}>{mktMap[b.contractId]?.question??b.contractId}</div>
                      <span style={{fontWeight:700,fontSize:13,flexShrink:0,color:pnl>=0?'#34d399':'#f87171'}}>{pnl>=0?'+':''}ᴍ{pnl.toFixed(1)}</span>
                    </div>
                   );})}
                </div>
              </>}
            </div>
          )}

          {/* Bot */}
          {tab==='bot'&&(
            <div style={{display:'flex',flexDirection:'column',gap:16}} className="card">
              {!key&&<div style={{...C,padding:'20px',textAlign:'center',color:'#f87171',fontSize:13}}>⚠️ Connect your API key before running the bot</div>}
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
                <div style={C}>
                  <div style={{padding:'14px 20px',borderBottom:'1px solid #1a1d2e',fontWeight:700,color:'#c7d2fe',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    Controls
                    {wsConnected&&<span style={{fontSize:11,color:'#e879f9',display:'flex',alignItems:'center',gap:4}}><span style={{width:6,height:6,borderRadius:'50%',background:'#e879f9',display:'inline-block'}}/>WebSocket Live</span>}
                  </div>
                  <div style={{padding:'16px 20px',display:'flex',flexDirection:'column',gap:12}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                      <div>
                        <div style={{fontSize:13,fontWeight:600,color:botDryRun?'#fbbf24':'#34d399'}}>{botDryRun?'🧪 Dry Run (API Simulated)':'🔴 Live Mode'}</div>
                        <div style={{fontSize:11,color:'#4b5280',marginTop:2}}>{botDryRun?'Uses Manifold dryRun=true API param':'Real bets placed with your mana'}</div>
                      </div>
                      <button onClick={()=>setBotDryRun(d=>!d)} disabled={botRunning} style={{padding:'6px 14px',borderRadius:8,border:`1px solid ${botDryRun?'#fbbf24':'#34d399'}`,background:botDryRun?'rgba(251,191,36,.1)':'rgba(52,211,153,.1)',color:botDryRun?'#fbbf24':'#34d399',cursor:botRunning?'default':'pointer',fontSize:12,fontWeight:600}}>{botDryRun?'Switch Live':'Switch Dry'}</button>
                    </div>
                    <div style={{display:'flex',gap:8}}>
                      <button onClick={runBotCycle} disabled={!key||botCycleRunning} style={{flex:1,padding:'10px',borderRadius:10,border:'1px solid #2d3148',background:!key||botCycleRunning?'#111320':'rgba(99,102,241,.15)',color:!key||botCycleRunning?'#3d4166':'#818cf8',cursor:!key||botCycleRunning?'default':'pointer',fontWeight:600,fontSize:13}}>
                        {botCycleRunning?<span><span className="spin">⟳</span> Running…</span>:'▶ Run Once'}
                      </button>
                      <button onClick={()=>setBotRunning(r=>!r)} disabled={!key} style={{flex:1,padding:'10px',borderRadius:10,border:`1px solid ${botRunning?'#f87171':'#34d399'}`,background:botRunning?'rgba(248,113,113,.12)':'rgba(52,211,153,.12)',color:botRunning?'#f87171':'#34d399',cursor:!key?'default':'pointer',fontWeight:600,fontSize:13}}>{botRunning?'⏹ Stop Auto':'⏵ Auto Run'}</button>
                    </div>
                    <div style={{display:'flex',alignItems:'center',gap:8,fontSize:12,color:'#4b5280'}}>
                      Auto interval:
                      <select value={botInterval} onChange={e=>setBotInterval(+e.target.value)} disabled={botRunning} style={{background:'#111320',border:'1px solid #1a1d2e',borderRadius:6,padding:'4px 8px',color:'#818cf8',fontSize:12,cursor:'pointer'}}>
                        {[5,10,15,30,60].map(v=><option key={v} value={v}>{v} min</option>)}
                      </select>
                      {botRunning&&<span style={{color:'#34d399',fontSize:11}}>● Every {botInterval}m</span>}
                    </div>
                    <button onClick={()=>{setBotBetHistory([]);addLog('Bet history cleared','info');}} style={{padding:'6px 12px',borderRadius:8,border:'1px solid #1a1d2e',background:'transparent',color:'#4b5280',cursor:'pointer',fontSize:12,textAlign:'left'}}>↺ Reset bet history ({botBetHistory.length} markets)</button>
                  </div>
                </div>
                <div style={C}>
                  <div style={{padding:'14px 20px',borderBottom:'1px solid #1a1d2e',fontWeight:700,color:'#c7d2fe'}}>Session Stats</div>
                  <div style={{padding:'16px 20px',display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                    {[{l:'Cycles',v:botSession.cycles,c:'#818cf8'},{l:'Bets Placed',v:botSession.betsPlaced,c:'#34d399'},{l:'Mana Spent',v:`ᴍ${botSession.manaSpent}`,c:'#fbbf24'},{l:'Mode',v:botDryRun?'Dry Run':'Live',c:botDryRun?'#fbbf24':'#f87171'}].map(({l,v,c})=>(
                      <div key={l} style={{background:'#111320',borderRadius:10,padding:'12px 14px'}}>
                        <div style={{fontSize:10,color:'#4b5280',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:4}}>{l}</div>
                        <div style={{fontSize:20,fontWeight:800,color:c}}>{v}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div style={C}>
                <div style={{padding:'14px 20px',borderBottom:'1px solid #1a1d2e',fontWeight:700,color:'#c7d2fe'}}>Strategies</div>
                <div style={{padding:'12px 20px',display:'flex',flexDirection:'column',gap:8}}>
                  {STRATEGIES.map(s=>(
                    <div key={s.id} style={{display:'flex',alignItems:'center',gap:14,padding:'10px 14px',borderRadius:10,background:botConfig[s.id]?`${STRAT_COLORS[s.id]}08`:'transparent',border:`1px solid ${botConfig[s.id]?STRAT_COLORS[s.id]+'30':'#1a1d2e'}`,transition:'all .15s'}}>
                      <button onClick={()=>setBotConfig(c=>({...c,[s.id]:!c[s.id]}))} disabled={s.id==='mean_reversion'} style={{width:36,height:20,borderRadius:99,border:'none',cursor:s.id==='mean_reversion'?'default':'pointer',background:botConfig[s.id]?STRAT_COLORS[s.id]:'#2d3148',position:'relative',flexShrink:0,transition:'background .2s'}}>
                        <span style={{position:'absolute',top:2,left:botConfig[s.id]?18:2,width:16,height:16,borderRadius:'50%',background:'white',transition:'left .2s'}}/>
                      </button>
                      <div style={{flex:1}}>
                        <div style={{fontSize:13,fontWeight:600,color:botConfig[s.id]?STRAT_COLORS[s.id]:'#6b7280'}}>{s.label}{s.id==='mean_reversion'&&<span style={{fontSize:10,color:'#4b5280',marginLeft:6}}>coming soon</span>}{s.id==='whaler'&&wsConnected&&<span style={{fontSize:10,color:'#e879f9',marginLeft:6}}>● live</span>}</div>
                        <div style={{fontSize:11,color:'#4b5280',marginTop:2}}>{s.desc}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div style={C}>
                <div style={{padding:'14px 20px',borderBottom:'1px solid #1a1d2e',fontWeight:700,color:'#c7d2fe'}}>Risk Parameters</div>
                <div style={{padding:'16px 20px',display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12}}>
                  {[['Max Bet (ᴍ)','maxBet'],['Reserve (ᴍ)','balanceReserve'],['Daily Limit (ᴍ)','dailyLimit'],['Cat Max %','catMaxPct',true]].map(([label,k,isPct])=>(
                    <div key={k}><div style={{fontSize:11,color:'#4b5280',marginBottom:6}}>{label}</div><input type="number" min={isPct?0.05:1} max={isPct?1:undefined} step={isPct?0.05:1} value={isPct?(botConfig[k]*100).toFixed(0):botConfig[k]} onChange={e=>setBotConfig(c=>({...c,[k]:isPct?+e.target.value/100:+e.target.value}))} style={{width:'100%',background:'#111320',border:'1px solid #1a1d2e',borderRadius:8,padding:'8px 10px',color:'white',fontSize:13,fontWeight:600,outline:'none'}}/>{isPct&&<div style={{fontSize:10,color:'#3d4166',marginTop:3}}>% of free capital per category</div>}</div>
                  ))}
                  <div><div style={{fontSize:11,color:'#4b5280',marginBottom:6}}>Slip Cap</div>
                    <select value={botConfig.slipCap} onChange={e=>setBotConfig(c=>({...c,slipCap:+e.target.value}))} style={{width:'100%',background:'#111320',border:'1px solid #1a1d2e',borderRadius:8,padding:'8px 10px',color:'#818cf8',fontSize:13,cursor:'pointer'}}>
                      {[0.01,0.02,0.03,0.05].map(v=><option key={v} value={v}>{(v*100).toFixed(0)}%</option>)}
                    </select>
                  </div>
                </div>
              </div>
              <div style={C}>
                <div style={{padding:'14px 20px',borderBottom:'1px solid #1a1d2e',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <div style={{fontWeight:700,color:'#c7d2fe'}}>Activity Log</div>
                  <button onClick={()=>setBotLog([])} style={{fontSize:11,color:'#4b5280',background:'transparent',border:'none',cursor:'pointer'}}>Clear</button>
                </div>
                <div style={{height:280,overflowY:'auto',padding:'8px 0',fontFamily:'JetBrains Mono,monospace',fontSize:11}}>
                  {botLog.length===0?<div style={{padding:'20px',color:'#3d4166',textAlign:'center'}}>No activity — run a cycle to start</div>:
                   botLog.map((l,i)=>(
                    <div key={i} style={{display:'flex',gap:10,padding:'4px 20px',borderBottom:'1px solid #0a0b12'}}>
                      <span style={{color:'#3d4166',flexShrink:0}}>{l.time}</span>
                      <span style={{color:logColor[l.type]??'#6b7280'}}>{l.msg}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bet Modal */}
      {modal&&(
        <div onClick={e=>e.target===e.currentTarget&&setModal(null)} style={{position:'fixed',inset:0,background:'rgba(0,0,0,.8)',backdropFilter:'blur(4px)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:50,padding:16}}>
          <div style={{background:'#0d0e1a',border:'1px solid #1a1d2e',borderRadius:20,padding:24,width:'100%',maxWidth:440,boxShadow:'0 25px 60px rgba(0,0,0,.6)'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:18,gap:12}}>
              <p style={{fontWeight:700,color:'#e2e8f0',lineHeight:1.4,fontSize:15}}>{modal.question}</p>
              <button onClick={()=>setModal(null)} style={{background:'none',border:'none',color:'#4b5280',cursor:'pointer',fontSize:22,lineHeight:1,flexShrink:0}}>×</button>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:18}}>
              {[['Market prob',`${(modal.probability*100).toFixed(1)}%`],['My prob',modal.ourP!=null?`${(modal.ourP*100).toFixed(1)}%`:'Not set'],['Expected value',modal.ev!=null?`+${(modal.ev*100).toFixed(2)}%`:'—'],['Category',`${modal.cat??getCategory(modal.question)} (${(modal.cw??catW(modal.question))}×)`]].map(([k,v])=>(
                <div key={k} style={{background:'#111320',borderRadius:10,padding:'10px 14px'}}><div style={{fontSize:11,color:'#4b5280',marginBottom:3}}>{k}</div><div style={{fontWeight:700,color:'#c7d2fe'}}>{v}</div></div>
              ))}
            </div>
            <div style={{display:'flex',gap:8,marginBottom:16}}>
              {['YES','NO'].map(s=>(
                <button key={s} onClick={()=>setBetSide(s)} style={{flex:1,padding:'10px',borderRadius:10,border:`2px solid ${betSide===s?(s==='YES'?'#34d399':'#f87171'):'#1a1d2e'}`,background:betSide===s?(s==='YES'?'rgba(52,211,153,.1)':'rgba(248,113,113,.1)'):'transparent',color:betSide===s?(s==='YES'?'#34d399':'#f87171'):'#4b5280',cursor:'pointer',fontWeight:700,fontSize:14}}>{s}</button>
              ))}
            </div>
            <div style={{marginBottom:16}}>
              <div style={{fontSize:12,color:'#4b5280',marginBottom:6}}>Amount (ᴍ)</div>
              <input type="number" min="1" value={betAmt} onChange={e=>setBetAmt(+e.target.value)} style={{width:'100%',background:'#111320',border:'1px solid #2d3148',borderRadius:10,padding:'10px 14px',color:'white',fontSize:15,fontWeight:600,outline:'none'}}/>
            </div>
            {(()=>{
              const s=calcSlip(modal.pool,betAmt,betSide),pp=calcPost(modal.pool,betAmt,betSide),over=s>slipCap;
              return(
                <div style={{background:over?'rgba(248,113,113,.06)':'#111320',border:`1px solid ${over?'rgba(248,113,113,.2)':'#1a1d2e'}`,borderRadius:10,padding:'12px 14px',marginBottom:16,fontSize:13}}>
                  {[['Platform fee',`ᴍ${(betAmt*FEE).toFixed(2)}`,'#6b7280'],['Price impact',`${(s*100).toFixed(2)}%${over?' ⛔':''}`,over?'#f87171':'#6b7280'],['Post-bet prob',pp?`${(pp*100).toFixed(1)}%`:'—','#818cf8']].map(([k,v,c])=>(
                    <div key={k} style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}><span style={{color:'#4b5280'}}>{k}</span><span style={{color:c,fontWeight:600}}>{v}</span></div>
                  ))}
                  {over&&<div style={{color:'#f87171',fontWeight:600,fontSize:12,marginTop:6,paddingTop:6,borderTop:'1px solid rgba(248,113,113,.15)'}}>Exceeds {(slipCap*100).toFixed(0)}% cap — blocked</div>}
                </div>
              );
            })()}
            {betMsg&&<div style={{borderRadius:8,padding:'8px 12px',fontSize:12,marginBottom:12,background:betMsg.ok?'rgba(52,211,153,.08)':'rgba(248,113,113,.08)',border:`1px solid ${betMsg.ok?'rgba(52,211,153,.2)':'rgba(248,113,113,.2)'}`,color:betMsg.ok?'#34d399':'#f87171'}}>{betMsg.ok??betMsg.err}</div>}
            <button onClick={placeBet} disabled={placing||!key} style={{width:'100%',padding:'13px',borderRadius:12,border:'none',fontWeight:700,fontSize:14,cursor:placing||!key?'default':'pointer',background:placing||!key?'#111320':'linear-gradient(135deg,#4f46e5,#6366f1)',color:placing||!key?'#3d4166':'white'}}>
              {placing?'Placing…':!key?'Connect API key first':`Place ᴍ${betAmt} on ${betSide}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}