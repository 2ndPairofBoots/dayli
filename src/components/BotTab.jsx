
// ═══════════════════════════════════════════════════════
// FILE: src/components/BotTab.jsx
// ═══════════════════════════════════════════════════════
import { STRATEGIES, STRAT_COLORS as SC } from '../constants';

/**
 * Bot tab — controls, strategy toggles, risk parameters,
 * daily cap progress bar, session stats, and activity log.
 */
export function BotTab({
  hasKey, wsConnected, botDryRun, setBotDryRun,
  botRunning, setBotRunning, botInterval, setBotInterval,
  botConfig, setBotConfig, botSession,
  botBetHistory, setBotBetHistory, botLog, setBotLog,
  botCycleRunning, runBotCycle, addLog,
  dailySpent, dailyLimit,
}) {
  const C = { background:'#0d0e1a',border:'1px solid #1a1d2e',borderRadius:14,overflow:'hidden' };
  const logColor = { info:'#6b7280',success:'#34d399',error:'#f87171',warn:'#fbbf24',dry:'#818cf8' };
  const dailyPct = dailyLimit > 0 ? Math.min(100, (dailySpent / dailyLimit) * 100) : 0;
  const dailyRemaining = Math.max(0, dailyLimit - dailySpent);
  const dailyOver = dailySpent >= dailyLimit;

  return (
    <div style={{ display:'flex',flexDirection:'column',gap:16 }}>
      {!hasKey && (
        <div style={{ ...C,padding:'20px',textAlign:'center',color:'#f87171',fontSize:13 }}>
          ⚠️ Connect your API key before running the bot
        </div>
      )}

      {/* Daily cap progress bar */}
      <div style={{ ...C,padding:'16px 20px' }}>
        <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8 }}>
          <div style={{ fontSize:12,fontWeight:600,color:'#c7d2fe' }}>Daily Spend Cap</div>
          <div style={{ fontSize:12,color:dailyOver?'#f87171':'#6b7280' }}>ᴍ{dailySpent.toFixed(0)} / ᴍ{dailyLimit}{dailyOver && ' — LIMIT REACHED'}</div>
        </div>
        <div style={{ height:8,background:'#111320',borderRadius:99,overflow:'hidden' }}>
          <div style={{ height:'100%',width:`${dailyPct}%`,background:dailyOver?'#f87171':dailyPct>75?'#fbbf24':'#34d399',borderRadius:99,transition:'width .3s' }}/>
        </div>
        <div style={{ display:'flex',justifyContent:'space-between',marginTop:6,fontSize:11,color:'#4b5280' }}>
          <span>Resets at midnight</span>
          <span style={{ color:dailyRemaining<50?'#fbbf24':'#4b5280' }}>ᴍ{dailyRemaining.toFixed(0)} remaining today</span>
        </div>
      </div>

      {/* Controls + Session stats */}
      <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:16 }}>
        <div style={C}>
          <div style={{ padding:'14px 20px',borderBottom:'1px solid #1a1d2e',fontWeight:700,color:'#c7d2fe',display:'flex',justifyContent:'space-between',alignItems:'center' }}>
            Controls
            {wsConnected && <span style={{ fontSize:11,color:'#e879f9',display:'flex',alignItems:'center',gap:4 }}><span style={{ width:6,height:6,borderRadius:'50%',background:'#e879f9',display:'inline-block' }}/>WS Live</span>}
          </div>
          <div style={{ padding:'16px 20px',display:'flex',flexDirection:'column',gap:12 }}>
            <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center' }}>
              <div>
                <div style={{ fontSize:13,fontWeight:600,color:botDryRun?'#fbbf24':'#34d399' }}>{botDryRun ? '🧪 Dry Run (API Simulated)' : '🔴 Live Mode'}</div>
                <div style={{ fontSize:11,color:'#4b5280',marginTop:2 }}>{botDryRun ? 'Uses Manifold dryRun=true param' : 'Real bets placed with your mana'}</div>
              </div>
              <button onClick={()=>setBotDryRun(d=>!d)} disabled={botRunning}
                style={{ padding:'6px 14px',borderRadius:8,border:`1px solid ${botDryRun?'#fbbf24':'#34d399'}`,background:botDryRun?'rgba(251,191,36,.1)':'rgba(52,211,153,.1)',color:botDryRun?'#fbbf24':'#34d399',cursor:botRunning?'default':'pointer',fontSize:12,fontWeight:600 }}>
                {botDryRun ? 'Switch Live' : 'Switch Dry'}
              </button>
            </div>
            <div style={{ display:'flex',gap:8 }}>
              <button onClick={runBotCycle} disabled={!hasKey||botCycleRunning||dailyOver}
                style={{ flex:1,padding:'10px',borderRadius:10,border:'1px solid #2d3148',background:!hasKey||botCycleRunning||dailyOver?'#111320':'rgba(99,102,241,.15)',color:!hasKey||botCycleRunning||dailyOver?'#3d4166':'#818cf8',cursor:!hasKey||botCycleRunning||dailyOver?'default':'pointer',fontWeight:600,fontSize:13 }}>
                {botCycleRunning ? '⟳ Running…' : dailyOver ? 'Daily Cap Reached' : '▶ Run Once'}
              </button>
              <button onClick={()=>setBotRunning(r=>!r)} disabled={!hasKey||(dailyOver&&!botRunning)}
                style={{ flex:1,padding:'10px',borderRadius:10,border:`1px solid ${botRunning?'#f87171':'#34d399'}`,background:botRunning?'rgba(248,113,113,.12)':'rgba(52,211,153,.12)',color:botRunning?'#f87171':'#34d399',cursor:!hasKey?'default':'pointer',fontWeight:600,fontSize:13 }}>
                {botRunning ? '⏹ Stop Auto' : '⏵ Auto Run'}
              </button>
            </div>
            <div style={{ display:'flex',alignItems:'center',gap:8,fontSize:12,color:'#4b5280' }}>
              Auto interval:
              <select value={botInterval} onChange={e=>setBotInterval(+e.target.value)} disabled={botRunning}
                style={{ background:'#111320',border:'1px solid #1a1d2e',borderRadius:6,padding:'4px 8px',color:'#818cf8',fontSize:12,cursor:'pointer' }}>
                {[5,10,15,30,60].map(v=><option key={v} value={v}>{v} min</option>)}
              </select>
              {botRunning && <span style={{ color:'#34d399',fontSize:11 }}>● Every {botInterval}m</span>}
            </div>
            <button onClick={()=>{setBotBetHistory([]);addLog('Bet history cleared','info');}}
              style={{ padding:'6px 12px',borderRadius:8,border:'1px solid #1a1d2e',background:'transparent',color:'#4b5280',cursor:'pointer',fontSize:12,textAlign:'left' }}>
              ↺ Reset bet history ({botBetHistory.length} markets)
            </button>
          </div>
        </div>

        <div style={C}>
          <div style={{ padding:'14px 20px',borderBottom:'1px solid #1a1d2e',fontWeight:700,color:'#c7d2fe' }}>Session Stats</div>
          <div style={{ padding:'16px 20px',display:'grid',gridTemplateColumns:'1fr 1fr',gap:12 }}>
            {[
              { l:'Cycles',     v:botSession.cycles,          c:'#818cf8' },
              { l:'Bets Placed',v:botSession.betsPlaced,      c:'#34d399' },
              { l:'Mana Spent', v:`ᴍ${botSession.manaSpent}`, c:'#fbbf24' },
              { l:'Mode',       v:botDryRun?'Dry Run':'Live', c:botDryRun?'#fbbf24':'#f87171' },
            ].map(({ l, v, c }) => (
              <div key={l} style={{ background:'#111320',borderRadius:10,padding:'12px 14px' }}>
                <div style={{ fontSize:10,color:'#4b5280',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:4 }}>{l}</div>
                <div style={{ fontSize:20,fontWeight:800,color:c }}>{v}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Strategies */}
      <div style={C}>
        <div style={{ padding:'14px 20px',borderBottom:'1px solid #1a1d2e',fontWeight:700,color:'#c7d2fe' }}>Strategies</div>
        <div style={{ padding:'12px 20px',display:'flex',flexDirection:'column',gap:8 }}>
          {STRATEGIES.map(s => (
            <div key={s.id} style={{ display:'flex',alignItems:'center',gap:14,padding:'10px 14px',borderRadius:10,background:botConfig[s.id]?`${SC[s.id]}08`:'transparent',border:`1px solid ${botConfig[s.id]?SC[s.id]+'30':'#1a1d2e'}`,transition:'all .15s' }}>
              <button onClick={()=>setBotConfig(c=>({...c,[s.id]:!c[s.id]}))} disabled={s.id==='mean_reversion'}
                style={{ width:36,height:20,borderRadius:99,border:'none',cursor:s.id==='mean_reversion'?'default':'pointer',background:botConfig[s.id]?SC[s.id]:'#2d3148',position:'relative',flexShrink:0,transition:'background .2s' }}>
                <span style={{ position:'absolute',top:2,left:botConfig[s.id]?18:2,width:16,height:16,borderRadius:'50%',background:'white',transition:'left .2s' }}/>
              </button>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13,fontWeight:600,color:botConfig[s.id]?SC[s.id]:'#6b7280' }}>
                  {s.label}
                  {s.id==='mean_reversion' && <span style={{ fontSize:10,color:'#4b5280',marginLeft:6 }}>coming soon</span>}
                  {s.id==='whaler' && wsConnected && <span style={{ fontSize:10,color:'#e879f9',marginLeft:6 }}>● live</span>}
                </div>
                <div style={{ fontSize:11,color:'#4b5280',marginTop:2 }}>{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Risk parameters */}
      <div style={C}>
        <div style={{ padding:'14px 20px',borderBottom:'1px solid #1a1d2e',fontWeight:700,color:'#c7d2fe' }}>Risk Parameters</div>
        <div style={{ padding:'16px 20px',display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12 }}>
          {[['Max Bet (ᴍ)','maxBet',false],['Reserve (ᴍ)','balanceReserve',false],['Daily Limit (ᴍ)','dailyLimit',false],['Cat Max %','catMaxPct',true]].map(([label,k,isPct]) => (
            <div key={k}>
              <div style={{ fontSize:11,color:'#4b5280',marginBottom:6 }}>{label}</div>
              <input type="number" min={isPct?5:1} max={isPct?100:undefined} step={isPct?5:1}
                value={isPct ? Math.round((botConfig[k]??0.25)*100) : botConfig[k]}
                onChange={e=>setBotConfig(c=>({...c,[k]:isPct?+e.target.value/100:+e.target.value}))}
                style={{ width:'100%',background:'#111320',border:'1px solid #1a1d2e',borderRadius:8,padding:'8px 10px',color:'white',fontSize:13,fontWeight:600,outline:'none' }}/>
              {isPct && <div style={{ fontSize:10,color:'#3d4166',marginTop:3 }}>% of free capital</div>}
            </div>
          ))}
        </div>
      </div>

      {/* Activity log */}
      <div style={C}>
        <div style={{ padding:'14px 20px',borderBottom:'1px solid #1a1d2e',display:'flex',justifyContent:'space-between',alignItems:'center' }}>
          <div style={{ fontWeight:700,color:'#c7d2fe' }}>Activity Log</div>
          <button onClick={()=>setBotLog([])} style={{ fontSize:11,color:'#4b5280',background:'transparent',border:'none',cursor:'pointer' }}>Clear</button>
        </div>
        <div style={{ height:280,overflowY:'auto',padding:'8px 0',fontFamily:'JetBrains Mono,monospace',fontSize:11 }}>
          {botLog.length === 0
            ? <div style={{ padding:'20px',color:'#3d4166',textAlign:'center' }}>No activity — run a cycle to start</div>
            : botLog.map((l, i) => (
              <div key={i} style={{ display:'flex',gap:10,padding:'4px 20px',borderBottom:'1px solid #0a0b12' }}>
                <span style={{ color:'#3d4166',flexShrink:0 }}>{l.time}</span>
                <span style={{ color:logColor[l.type]??'#6b7280' }}>{l.msg}</span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}