import { useState } from 'react';
import { CATS } from '../constants';
import { catColor } from '../utils/categories';
import { calcSlip, confidenceWeight, certScore, certColor } from '../utils/math';

/** Capitalizes first letter of a string */
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

export function MarketsTab({
  displayMarkets, mktLoading, catFilter, setCatFilter,
  search, setSearch, sortBy, setSortBy,
  myProbs, setMyProbs, slipCap, onOpenModal, hasKey,
}) {
  const [expandedId, setExpandedId] = useState(null);
  const C = { background:'#0d0e1a', border:'1px solid #1a1d2e', borderRadius:14, overflow:'hidden' };

  return (
    <div>
      {/* Controls row */}
      <div style={{ display:'flex', gap:10, marginBottom:14, flexWrap:'wrap', alignItems:'center' }}>
        <div style={{ position:'relative' }}>
          <span style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', fontSize:13, color:'#4b5280', pointerEvents:'none' }}>🔍</span>
          <input
            value={search} onChange={e=>setSearch(e.target.value)}
            placeholder="Search markets…"
            style={{ background:'#0d0e1a', border:'1px solid #1a1d2e', borderRadius:10, padding:'8px 14px 8px 34px', color:'white', fontSize:13, outline:'none', width:240 }}
          />
        </div>

        {/* Improved sort dropdown */}
        <div style={{ position:'relative' }}>
          <select
            value={sortBy} onChange={e=>setSortBy(e.target.value)}
            style={{ appearance:'none', WebkitAppearance:'none', background:'#0d0e1a', border:'1px solid #1a1d2e', borderRadius:10, padding:'8px 36px 8px 14px', color:'#c7d2fe', fontSize:13, cursor:'pointer', outline:'none', fontWeight:500 }}
          >
            <option value="volume">📊 Volume</option>
            <option value="liquidity">💧 Liquidity</option>
            <option value="closeDate">⏰ Closing Soon</option>
            <option value="edge">📈 Your Edge</option>
            <option value="certainty">🎯 Certainty</option>
          </select>
          <span style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', color:'#4b5280', pointerEvents:'none', fontSize:10 }}>▼</span>
        </div>

        <div style={{ fontSize:11, color:'#4b5280', marginLeft:'auto' }}>
          {mktLoading ? '⟳ Loading…' : `${displayMarkets.length} markets`}
        </div>
      </div>

      {/* Category pills — capitalized */}
      <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap' }}>
        <button
          onClick={()=>setCatFilter('all')}
          style={{ padding:'5px 14px', borderRadius:99, border:'1px solid', fontSize:12, fontWeight:600, cursor:'pointer', transition:'all .15s', borderColor:catFilter==='all'?'#6366f1':'#1a1d2e', background:catFilter==='all'?'rgba(99,102,241,.15)':'transparent', color:catFilter==='all'?'#818cf8':'#4b5280' }}
        >All</button>
        {Object.keys(CATS).map(c => (
          <button
            key={c} onClick={()=>setCatFilter(c)}
            style={{ padding:'5px 14px', borderRadius:99, border:'1px solid', fontSize:12, fontWeight:600, cursor:'pointer', transition:'all .15s', borderColor:catFilter===c?catColor(c):'#1a1d2e', background:catFilter===c?`${catColor(c)}18`:'transparent', color:catFilter===c?catColor(c):'#4b5280' }}
          >{cap(c)}</button>
        ))}
      </div>

      {/* Table */}
      <div style={C}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 80px 70px 90px 70px 80px 90px', gap:8, padding:'8px 16px', fontSize:11, color:'#3d4166', textTransform:'uppercase', letterSpacing:'.05em', borderBottom:'1px solid #1a1d2e', background:'#0a0b13' }}>
          <span>Market</span>
          <span style={{ textAlign:'right' }}>Mkt %</span>
          <span style={{ textAlign:'center' }}>My %</span>
          <span style={{ textAlign:'right' }}>EV / Kelly</span>
          <span style={{ textAlign:'center' }}>Certainty</span>
          <span style={{ textAlign:'right' }}>Volume</span>
          <span style={{ textAlign:'right' }}>Action</span>
        </div>

        {displayMarkets.length === 0 && (
          <div style={{ padding:32, textAlign:'center', color:'#3d4166', fontSize:13 }}>
            {mktLoading ? '⟳ Loading markets…' : 'No markets match filters'}
          </div>
        )}

        {displayMarkets.map((m, i) => {
          const myVal   = myProbs[m.id] ?? '';
          const hasEdge = m.ev != null && m.ev > 0;
          const slip    = m.side && m.size > 0 ? calcSlip(m.pool, m.size, m.side) : 0;
          const blocked = slip > slipCap;
          const closes  = m.closeTime ? new Date(m.closeTime).toLocaleDateString('en-US',{month:'short',day:'numeric'}) : null;
          const daysLeft = m.closeTime ? Math.max(0, Math.round((m.closeTime - Date.now()) / 86400000)) : null;
          const urgent  = daysLeft != null && daysLeft <= 7;
          const cert    = hasEdge && m.ev != null ? certScore(m.ev, confidenceWeight(m.betsCount??0,m.volume??0), m.cw, m.totalLiquidity) : null;
          const expanded = expandedId === m.id;

          return (
            <div key={m.id}>
              <div
                style={{ display:'grid', gridTemplateColumns:'1fr 80px 70px 90px 70px 80px 90px', gap:8, alignItems:'center', padding:'11px 16px', borderBottom:'1px solid #0f1117', transition:'background .12s', cursor:'pointer' }}
                onMouseEnter={e=>e.currentTarget.style.background='#0d0e1a'}
                onMouseLeave={e=>e.currentTarget.style.background='transparent'}
                onClick={()=>setExpandedId(expanded ? null : m.id)}
              >
                <div style={{ minWidth:0 }}>
                  <div style={{ whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', color:'#c7d2fe', fontSize:13, fontWeight:500 }}>{m.question}</div>
                  <div style={{ display:'flex', gap:6, marginTop:3, alignItems:'center', flexWrap:'wrap' }}>
                    {/* Capitalized category pill */}
                    <span style={{ fontSize:10, padding:'1px 7px', borderRadius:99, background:`${catColor(m.question??'')}15`, color:catColor(m.question??''), fontWeight:600 }}>{cap(m.cat ?? 'other')}</span>
                    {closes && <span style={{ fontSize:10, color:urgent?'#fbbf24':'#3d4166' }}>{urgent?'⚠ ':''}closes {closes}</span>}
                    {m.betsCount != null && <span style={{ fontSize:10, color:'#3d4166' }}>{m.betsCount} bets</span>}
                  </div>
                </div>

                <div style={{ textAlign:'right' }}>
                  <div style={{ fontWeight:700, color:'#94a3b8', fontSize:14 }}>{(m.probability*100).toFixed(1)}%</div>
                </div>

                <div style={{ display:'flex', justifyContent:'center' }}>
                  <input
                    type="number" min="1" max="99" placeholder="—" value={myVal}
                    onClick={e=>e.stopPropagation()}
                    onChange={e=>{ const v=e.target.value; setMyProbs(p=>({...p,[m.id]:v===''?undefined:Math.min(99,Math.max(1,+v))})); }}
                    style={{ width:52, background:myVal?'rgba(99,102,241,.1)':'#111320', border:`1px solid ${myVal?'rgba(99,102,241,.3)':'#1a1d2e'}`, borderRadius:6, padding:'4px 6px', color:myVal?'#818cf8':'#4b5280', fontSize:13, fontWeight:600, textAlign:'center', outline:'none' }}
                  />
                </div>

                <div style={{ textAlign:'right' }}>
                  {hasEdge ? (
                    <>
                      <div style={{ fontSize:13, fontWeight:700, color:'#34d399' }}>+{(m.ev*100).toFixed(1)}%</div>
                      <div style={{ fontSize:11, color:blocked?'#f87171':'#4b5280' }}>ᴍ{m.size.toFixed(0)}{blocked?' ⛔':''}</div>
                    </>
                  ) : <div style={{ fontSize:12, color:'#3d4166' }}>—</div>}
                </div>

                <div style={{ display:'flex', justifyContent:'center' }}>
                  {cert != null ? (
                    <div style={{ textAlign:'center', background:`${certColor(cert)}15`, border:`1px solid ${certColor(cert)}35`, borderRadius:8, padding:'3px 8px', minWidth:46 }}>
                      <div style={{ fontSize:13, fontWeight:800, color:certColor(cert) }}>{cert}%</div>
                    </div>
                  ) : <span style={{ color:'#3d4166', fontSize:12 }}>—</span>}
                </div>

                <div style={{ textAlign:'right', fontSize:12, color:'#4b5280' }}>
                  <div>ᴍ{Math.abs(m.volume??0)>=1000?`${((m.volume??0)/1000).toFixed(1)}k`:(m.volume??0).toFixed(0)}</div>
                  {m.totalLiquidity && <div style={{ fontSize:11, color:'#3d4166' }}>liq {Math.abs(m.totalLiquidity)>=1000?`${(m.totalLiquidity/1000).toFixed(1)}k`:m.totalLiquidity.toFixed(0)}</div>}
                </div>

                <div style={{ display:'flex', gap:4, justifyContent:'flex-end' }} onClick={e=>e.stopPropagation()}>
                  <button
                    onClick={()=>onOpenModal({...m}, m.side??'YES')} disabled={!hasKey}
                    style={{ background:hasKey?'linear-gradient(135deg,#4f46e5,#6366f1)':'#111320', border:'none', borderRadius:7, padding:'6px 12px', color:hasKey?'white':'#3d4166', cursor:hasKey?'pointer':'default', fontWeight:600, fontSize:12 }}
                  >{hasKey ? 'Bet' : 'Login'}</button>
                </div>
              </div>

              {/* Expanded detail panel */}
              {expanded && (
                <div style={{ padding:'12px 16px 16px', background:'#0a0b13', borderBottom:'1px solid #0f1117' }}>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:12 }}>
                    {[
                      ['Bets Count', m.betsCount ?? '—'],
                      ['Total Liquidity', m.totalLiquidity ? `ᴍ${Math.abs(m.totalLiquidity)>=1000?`${(m.totalLiquidity/1000).toFixed(1)}k`:m.totalLiquidity.toFixed(0)}` : '—'],
                      ['Unique Bettors', m.uniqueBettorCount ?? '—'],
                      ['Closes', closes ?? '—'],
                    ].map(([k,v]) => (
                      <div key={k} style={{ background:'#111320', borderRadius:8, padding:'8px 12px' }}>
                        <div style={{ fontSize:10, color:'#4b5280', marginBottom:3, textTransform:'uppercase', letterSpacing:'.05em' }}>{k}</div>
                        <div style={{ fontWeight:700, color:'#c7d2fe', fontSize:13 }}>{v}</div>
                      </div>
                    ))}
                  </div>
                  {m.pool && (
                    <div style={{ display:'flex', gap:10, marginBottom:12 }}>
                      <div style={{ flex:1, background:'rgba(52,211,153,.06)', border:'1px solid rgba(52,211,153,.15)', borderRadius:8, padding:'8px 12px' }}>
                        <div style={{ fontSize:10, color:'#34d399', marginBottom:2, fontWeight:600 }}>YES POOL</div>
                        <div style={{ fontWeight:700, color:'#34d399' }}>ᴍ{m.pool.YES?.toFixed(0)}</div>
                      </div>
                      <div style={{ flex:1, background:'rgba(248,113,113,.06)', border:'1px solid rgba(248,113,113,.15)', borderRadius:8, padding:'8px 12px' }}>
                        <div style={{ fontSize:10, color:'#f87171', marginBottom:2, fontWeight:600 }}>NO POOL</div>
                        <div style={{ fontWeight:700, color:'#f87171' }}>ᴍ{m.pool.NO?.toFixed(0)}</div>
                      </div>
                      {hasEdge && m.side && (
                        <div style={{ flex:1, background:'rgba(99,102,241,.08)', border:'1px solid rgba(99,102,241,.2)', borderRadius:8, padding:'8px 12px' }}>
                          <div style={{ fontSize:10, color:'#818cf8', marginBottom:2, fontWeight:600 }}>SLIP @ ᴍ{m.size?.toFixed(0)}</div>
                          <div style={{ fontWeight:700, color:slip>slipCap?'#f87171':'#818cf8' }}>{(slip*100).toFixed(2)}%</div>
                        </div>
                      )}
                    </div>
                  )}
                  {m.description && (
                    <div style={{ fontSize:12, color:'#6b7280', lineHeight:1.5 }}>
                      {typeof m.description === 'string' ? m.description.slice(0,200) : ''}
                      {typeof m.description === 'string' && m.description.length > 200 ? '…' : ''}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}