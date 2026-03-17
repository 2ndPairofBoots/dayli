
// ═══════════════════════════════════════════════════════
// FILE: src/components/PortfolioTab.jsx
// ═══════════════════════════════════════════════════════

/**
 * Portfolio tab — open positions and resolved bet history.
 * Positions come from Manifold's contract-metrics endpoint
 * so cost basis, value, and profit are accurate.
 */
export function PortfolioTab({
  hasKey, positions, sortedPositions, posSortBy, posSortDir,
  togglePosSort, sortArrow, resolved, totalPnL, winRate, mktMap,
}) {
  const C = { background:'#0d0e1a',border:'1px solid #1a1d2e',borderRadius:14,overflow:'hidden' };

  if (!hasKey) {
    return (
      <div style={{ textAlign:'center',padding:48,color:'#3d4166' }}>
        <div style={{ fontSize:32,marginBottom:8 }}>🔐</div>
        <div>Connect your API key to view portfolio</div>
      </div>
    );
  }

  return (
    <div style={{ display:'flex',flexDirection:'column',gap:16 }}>
      {/* Open positions */}
      <div style={C}>
        <div style={{ padding:'14px 20px',borderBottom:'1px solid #1a1d2e',fontWeight:700,color:'#c7d2fe',display:'flex',justifyContent:'space-between' }}>
          <span>Open Positions</span>
          <span style={{ color:'#fbbf24' }}>{positions.length}</span>
        </div>
        {positions.length > 0 && (
          <div style={{ display:'grid',gridTemplateColumns:'1fr 72px 72px 72px 72px 72px',gap:8,padding:'7px 20px',borderBottom:'1px solid #111320',fontSize:11,color:'#3d4166',textTransform:'uppercase',letterSpacing:'.05em' }}>
            <span onClick={()=>togglePosSort('market_recent')} style={{ cursor:'pointer',color:posSortBy==='market_recent'?'#818cf8':'#3d4166',userSelect:'none' }}>Market{sortArrow('market_recent')}</span>
            {[['cost','Cost'],['value','Value'],['profit','Profit'],['profitPct','P&L %'],['lastProb','Prob']].map(([col,label]) => (
              <span key={col} onClick={()=>togglePosSort(col)} style={{ textAlign:'right',cursor:'pointer',color:posSortBy===col?'#818cf8':'#3d4166',userSelect:'none',transition:'color .15s' }}>{label}{sortArrow(col)}</span>
            ))}
          </div>
        )}
        {positions.length === 0
          ? <div style={{ padding:20,color:'#3d4166',textAlign:'center' }}>No open positions</div>
          : sortedPositions.map((p, i) => (
            <div key={p.contractId} style={{ display:'grid',gridTemplateColumns:'1fr 72px 72px 72px 72px 72px',gap:8,alignItems:'center',padding:'12px 20px',borderBottom:i<sortedPositions.length-1?'1px solid #111320':'none' }}>
              <div style={{ minWidth:0 }}>
                <div style={{ whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',color:'#c7d2fe',fontSize:13,fontWeight:500 }}>{p.name}</div>
                <div style={{ display:'flex',gap:6,marginTop:3 }}>
                  <span style={{ fontSize:11,fontWeight:700,padding:'1px 7px',borderRadius:6,background:p.side==='YES'?'rgba(52,211,153,.1)':'rgba(248,113,113,.1)',color:p.side==='YES'?'#34d399':'#f87171' }}>{p.side}</span>
                  <span style={{ fontSize:11,color:'#3d4166' }}>{p.shares.toFixed(1)} shares</span>
                </div>
              </div>
              <div style={{ textAlign:'right',fontSize:13,color:'#6b7280' }}>ᴍ{p.cost.toFixed(1)}</div>
              <div style={{ textAlign:'right',fontSize:13,color:'#c7d2fe' }}>{p.value!=null?`ᴍ${p.value.toFixed(1)}`:'—'}</div>
              <div style={{ textAlign:'right',fontSize:13,fontWeight:600,color:p.profit==null?'#4b5280':p.profit>=0?'#34d399':'#f87171' }}>{p.profit!=null?`${p.profit>=0?'+':''}ᴍ${p.profit.toFixed(1)}`:'—'}</div>
              <div style={{ textAlign:'right',fontSize:13,fontWeight:600,color:p.profitPct==null?'#4b5280':p.profitPct>=0?'#34d399':'#f87171' }}>{p.profitPct!=null?`${p.profitPct>=0?'+':''}${p.profitPct.toFixed(1)}%`:'—'}</div>
              <div style={{ textAlign:'right',fontSize:13,color:'#818cf8' }}>{p.lastProb!=null?`${(p.lastProb*100).toFixed(1)}%`:'—'}</div>
            </div>
          ))}
      </div>

      {/* Resolved bets */}
      <div style={C}>
        <div style={{ padding:'14px 20px',borderBottom:'1px solid #1a1d2e',fontWeight:700,color:'#c7d2fe',display:'flex',gap:12,alignItems:'center' }}>
          <span>Resolved</span>
          {resolved.length > 0 && (
            <>
              <span style={{ color:totalPnL>=0?'#34d399':'#f87171',fontWeight:800 }}>{totalPnL>=0?'+':''}ᴍ{totalPnL.toFixed(1)}</span>
              {winRate != null && <span style={{ color:'#818cf8',fontSize:12 }}>{(winRate*100).toFixed(0)}% win rate</span>}
            </>
          )}
          <span style={{ marginLeft:'auto',color:'#4b5280',fontWeight:400,fontSize:12 }}>{resolved.length} bets</span>
        </div>
        {resolved.length === 0
          ? <div style={{ padding:20,color:'#3d4166',textAlign:'center' }}>No resolved bets yet</div>
          : resolved.slice(0, 25).map((b, i) => {
            const pnl = b.resolvedPayout - b.amount;
            return (
              <div key={b.id} style={{ display:'flex',justifyContent:'space-between',alignItems:'center',padding:'11px 20px',borderBottom:i<Math.min(resolved.length,25)-1?'1px solid #111320':'none' }}>
                <div style={{ flex:1,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',color:'#94a3b8',marginRight:12,fontSize:13 }}>{mktMap[b.contractId]?.question ?? b.contractId}</div>
                <span style={{ fontWeight:700,fontSize:13,flexShrink:0,color:pnl>=0?'#34d399':'#f87171' }}>{pnl>=0?'+':''}ᴍ{pnl.toFixed(1)}</span>
              </div>
            );
          })}
      </div>
    </div>
  );
}

