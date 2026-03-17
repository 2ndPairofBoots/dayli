import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { STRAT_COLORS, STRAT_LABELS } from '../constants';
import { catColor, catW, getCategory, fmt } from '../utils/categories';
import { certScore, certColor } from '../utils/math';

export function DashboardTab({
  portfolio, positions, pnlStats, pnlChartData,
  winRate, wins, resolved, recentBetsWithStrategy,
  stratBreakdown, mktMap, botSuggestions, topOpps,
  onOpenModal, onGoMarkets,
}) {
  const { totalPnL, pnl1D, pnl1W, pnl1M } = pnlStats;
  const totalInvested = portfolio?.investmentValue ?? 0;
  const showBotSuggestions = topOpps.length === 0;
  const oppList = showBotSuggestions ? botSuggestions : topOpps;
  const C = { background:'#0d0e1a', border:'1px solid #1a1d2e', borderRadius:14, overflow:'hidden' };

  // Split strategy breakdown into Dayli strategies vs manual
  const dayliStrats = stratBreakdown.filter(([s]) => s !== 'manual' && s !== 'unknown');
  const manualCount = stratBreakdown.find(([s]) => s === 'manual')?.[1] ?? 0;
  const unknownCount = stratBreakdown.find(([s]) => s === 'unknown')?.[1] ?? 0;
  const totalBets = stratBreakdown.reduce((s, [, n]) => s + n, 0);
  const manualPct = totalBets > 0 ? Math.round(((manualCount + unknownCount) / totalBets) * 100) : 0;

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
      {/* Stat tiles */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:16 }}>
        {[
          { l:'Balance',   v:`ᴍ${fmt(portfolio?.balance ?? 0)}`,                        sub:'Manifold Mana',           c:'#34d399' },
          { l:'Invested',  v:`ᴍ${fmt(totalInvested)}`,                                  sub:`${positions.length} positions`, c:'#818cf8' },
          { l:'Total P&L', v:`${totalPnL>=0?'+':''}ᴍ${fmt(Math.abs(totalPnL))}`,        sub:'All time',                c:totalPnL>=0?'#34d399':'#f87171' },
          { l:'Win Rate',  v:winRate!=null?`${(winRate*100).toFixed(0)}%`:'—',           sub:`${wins}/${resolved.length} resolved`, c:'#a78bfa' },
          { l:'Open Bets', v:positions.length,                                           sub:'Active positions',        c:'#fbbf24' },
        ].map(({ l, v, sub, c }) => (
          <div key={l} style={{ background:'#0d0e1a', border:'1px solid #1a1d2e', borderRadius:14, padding:'18px 20px' }}>
            <div style={{ fontSize:11, color:'#4b5280', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:6 }}>{l}</div>
            <div style={{ fontSize:24, fontWeight:800, color:c }}>{v}</div>
            <div style={{ fontSize:11, color:'#3d4166', marginTop:6 }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* Mid row */}
      <div style={{ display:'grid', gridTemplateColumns:'180px 1fr 200px', gap:16 }}>
        {/* Profit breakdown */}
        <div style={{ ...C, padding:'16px 18px' }}>
          <div style={{ fontSize:11, color:'#4b5280', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:12 }}>Profit</div>
          {[['1D',pnl1D],['1W',pnl1W],['1M',pnl1M],['LIFE',totalPnL]].map(([l,v]) => (
            <div key={l} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
              <span style={{ fontSize:12, color:'#4b5280', fontFamily:'JetBrains Mono,monospace', fontWeight:600 }}>{l}</span>
              <span style={{ fontSize:14, fontWeight:700, color:v>=0?'#34d399':'#f87171' }}>{v>=0?'+':''}ᴍ{fmt(Math.abs(v))}</span>
            </div>
          ))}
        </div>

        {/* P&L chart */}
        <div style={{ ...C, padding:'16px 18px' }}>
          <div style={{ fontSize:11, color:'#4b5280', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:10 }}>Portfolio P&L</div>
          {pnlChartData.length < 2
            ? <div style={{ height:100, display:'flex', alignItems:'center', justifyContent:'center', color:'#3d4166', fontSize:12 }}>No history yet</div>
            : (
              <ResponsiveContainer width="100%" height={100}>
                <LineChart data={pnlChartData} margin={{ top:4, right:8, left:0, bottom:0 }}>
                  <XAxis dataKey="date" tick={{ fontSize:10, fill:'#3d4166' }} tickLine={false} axisLine={false} interval="preserveStartEnd"/>
                  <YAxis tick={{ fontSize:10, fill:'#3d4166' }} tickLine={false} axisLine={false} width={38} tickFormatter={v=>Math.abs(v)>=1000?`${(v/1000).toFixed(0)}k`:String(v)}/>
                  <Tooltip contentStyle={{ background:'#0d0e1a', border:'1px solid #1a1d2e', borderRadius:8, fontSize:12 }} labelStyle={{ color:'#c7d2fe' }} formatter={v=>[`ᴍ${v.toFixed(1)}`,'P&L']}/>
                  <Line type="monotone" dataKey="pnl" stroke="#6366f1" strokeWidth={2} dot={false} activeDot={{ r:4, fill:'#818cf8' }}/>
                </LineChart>
              </ResponsiveContainer>
            )}
        </div>

        {/* Strategy breakdown — with manual section */}
        <div style={{ ...C, padding:'16px 18px' }}>
          <div style={{ fontSize:11, color:'#4b5280', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:12 }}>By Strategy</div>
          {stratBreakdown.length === 0
            ? <div style={{ fontSize:12, color:'#3d4166' }}>No data yet</div>
            : (
              <>
                {/* Dayli strategies */}
                {dayliStrats.map(([s, n]) => (
                  <div key={s} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:7 }}>
                    <span style={{ fontSize:11, padding:'1px 7px', borderRadius:99, background:`${STRAT_COLORS[s]}18`, color:STRAT_COLORS[s], fontWeight:600 }}>{STRAT_LABELS[s]}</span>
                    <span style={{ fontSize:12, color:'#6b7280', fontWeight:600 }}>{n}</span>
                  </div>
                ))}

                {/* Manual divider */}
                {(manualCount + unknownCount) > 0 && (
                  <>
                    <div style={{ height:1, background:'#1a1d2e', margin:'8px 0' }}/>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
                      <span style={{ fontSize:11, padding:'1px 7px', borderRadius:99, background:'rgba(148,163,184,.1)', color:'#94a3b8', fontWeight:600 }}>Manual</span>
                      <span style={{ fontSize:12, color:'#6b7280', fontWeight:600 }}>{manualCount + unknownCount}</span>
                    </div>
                    <div style={{ fontSize:10, color:'#3d4166', textAlign:'right' }}>
                      {manualPct}% placed outside Dayli
                    </div>
                  </>
                )}
              </>
            )}
        </div>
      </div>

      {/* Recent bets */}
      <div style={C}>
        <div style={{ padding:'14px 20px', borderBottom:'1px solid #1a1d2e', fontWeight:700, color:'#c7d2fe' }}>Recent Bets</div>
        <div style={{ display:'grid', gridTemplateColumns:'110px 1fr 100px 50px 54px 54px', gap:8, padding:'6px 20px', fontSize:11, color:'#3d4166', textTransform:'uppercase', letterSpacing:'.05em', borderBottom:'1px solid #111320' }}>
          <span>Time</span><span>Market</span><span>Strategy</span><span>Out</span><span style={{ textAlign:'right' }}>Prob</span><span style={{ textAlign:'right' }}>Amt</span>
        </div>
        {recentBetsWithStrategy.length === 0
          ? <div style={{ padding:20, color:'#3d4166', textAlign:'center', fontSize:12 }}>No bets yet</div>
          : recentBetsWithStrategy.map((b, i) => {
            const name = mktMap[b.contractId]?.question ?? b.contractId;
            const time = b.createdTime ? new Date(b.createdTime).toLocaleString('en-US',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}) : '—';
            const prob = b.probAfter ?? b.probBefore;
            const isManual = b.strategy === 'manual' || b.strategy === 'unknown';
            return (
              <div key={b.id} style={{ display:'grid', gridTemplateColumns:'110px 1fr 100px 50px 54px 54px', gap:8, alignItems:'center', padding:'9px 20px', borderBottom:i<recentBetsWithStrategy.length-1?'1px solid #111320':'none', fontSize:12 }}>
                <span style={{ color:'#3d4166', fontSize:10 }}>{time}</span>
                <span style={{ whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', color:'#94a3b8' }}>{name}</span>
                <span>
                  <span style={{ fontSize:10, fontWeight:600, padding:'2px 7px', borderRadius:99, background:isManual?'rgba(148,163,184,.1)':`${STRAT_COLORS[b.strategy]}18`, color:isManual?'#94a3b8':STRAT_COLORS[b.strategy] }}>
                    {isManual ? '↗ Manual' : STRAT_LABELS[b.strategy]}
                  </span>
                </span>
                <span><span style={{ fontSize:11, fontWeight:700, padding:'2px 6px', borderRadius:5, background:b.outcome==='YES'?'rgba(52,211,153,.12)':'rgba(248,113,113,.12)', color:b.outcome==='YES'?'#34d399':'#f87171' }}>{b.outcome}</span></span>
                <span style={{ textAlign:'right', color:'#818cf8' }}>{prob!=null?`${(prob*100).toFixed(0)}%`:'—'}</span>
                <span style={{ textAlign:'right', color:'#c7d2fe' }}>ᴍ{(b.amount??0).toFixed(0)}</span>
              </div>
            );
          })}
      </div>

      {/* Top opportunities / bot suggestions */}
      <div style={C}>
        <div style={{ padding:'16px 20px', borderBottom:'1px solid #1a1d2e', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ fontWeight:700, color:'#c7d2fe' }}>{showBotSuggestions ? 'Bot Suggestions' : 'Top Opportunities'}</div>
          <div style={{ fontSize:11, color:'#4b5280' }}>{showBotSuggestions ? `${botSuggestions.length} from strategy model` : `${topOpps.length} from your probs`}</div>
        </div>
        {oppList.length === 0 ? (
          <div style={{ padding:32, textAlign:'center', color:'#3d4166' }}>
            <div style={{ fontSize:28, marginBottom:8 }}>◈</div>
            <div style={{ fontWeight:600, color:'#4b5280', marginBottom:4 }}>No opportunities yet</div>
            <div style={{ fontSize:12 }}>Markets loading or no edge above threshold</div>
            <button onClick={onGoMarkets} style={{ marginTop:14, background:'rgba(99,102,241,.15)', border:'1px solid rgba(99,102,241,.3)', borderRadius:8, padding:'8px 20px', color:'#818cf8', cursor:'pointer', fontSize:13, fontWeight:600 }}>Browse Markets →</button>
          </div>
        ) : oppList.map((item, i) => {
          const isBot = showBotSuggestions;
          const m = isBot ? item.market : item;
          const side = item.side, ev = item.ev, size = isBot ? item.size : Math.round(item.size ?? 0);
          const strat = isBot ? item.strategy : null;
          const cert = isBot ? certScore(ev??0, item.conf??0.5, catW(m.question??''), m.totalLiquidity) : null;
          return (
            <div key={m.id} style={{ display:'flex', alignItems:'center', gap:14, padding:'14px 20px', borderBottom:i<oppList.length-1?'1px solid #111320':'none' }}
              onMouseEnter={e=>e.currentTarget.style.background='#0f1117'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
              <div style={{ width:26, height:26, borderRadius:8, background:strat?`${STRAT_COLORS[strat]}18`:'rgba(99,102,241,.12)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, color:strat?STRAT_COLORS[strat]:'#6366f1', fontWeight:700, flexShrink:0 }}>#{i+1}</div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', color:'#e2e8f0', fontWeight:500 }}>{m.question}</div>
                <div style={{ display:'flex', gap:8, marginTop:4, alignItems:'center', flexWrap:'wrap' }}>
                  {strat
                    ? <span style={{ fontSize:11, padding:'1px 7px', borderRadius:99, background:`${STRAT_COLORS[strat]}18`, color:STRAT_COLORS[strat], fontWeight:600 }}>{STRAT_LABELS[strat]}</span>
                    : <span style={{ fontSize:11, padding:'1px 7px', borderRadius:99, background:'rgba(99,102,241,.1)', color:catColor(m.question??''), fontWeight:600 }}>{m.cat}</span>}
                  <span style={{ fontSize:11, color:'#4b5280' }}>mkt {(m.probability*100).toFixed(1)}%</span>
                  <span style={{ fontSize:11, color:'#34d399' }}>EV +{((ev??0)*100).toFixed(1)}%</span>
                  {isBot && item.conf!=null && <span style={{ fontSize:11, color:'#4b5280' }}>conf {(item.conf*100).toFixed(0)}%</span>}
                </div>
              </div>
              {cert!=null && (
                <div style={{ flexShrink:0, textAlign:'center', background:`${certColor(cert)}18`, border:`1px solid ${certColor(cert)}40`, borderRadius:10, padding:'4px 10px', minWidth:52 }}>
                  <div style={{ fontSize:15, fontWeight:800, color:certColor(cert) }}>{cert}%</div>
                  <div style={{ fontSize:9, color:'#4b5280', textTransform:'uppercase', letterSpacing:'.04em' }}>certainty</div>
                </div>
              )}
              <div style={{ display:'flex', gap:8, flexShrink:0 }}>
                <span style={{ fontSize:12, fontWeight:700, padding:'3px 10px', borderRadius:8, background:side==='YES'?'rgba(52,211,153,.12)':'rgba(248,113,113,.12)', color:side==='YES'?'#34d399':'#f87171' }}>{side}</span>
                <button onClick={()=>onOpenModal(item,side)} style={{ background:'linear-gradient(135deg,#4f46e5,#6366f1)', border:'none', borderRadius:8, padding:'6px 14px', color:'white', cursor:'pointer', fontWeight:600, fontSize:12 }}>ᴍ{size}</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}