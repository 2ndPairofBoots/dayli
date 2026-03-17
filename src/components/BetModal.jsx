// ─────────────────────────────────────────────
// src/components/BetModal.jsx
// Confirmation modal shown before placing a bet.
// Shows slippage, post-bet probability, fee,
// and blocks submission if slip cap is exceeded.
// ─────────────────────────────────────────────

import { calcSlip, calcPost } from '../utils/math';
import { getCategory, catW } from '../utils/categories';
import { FEE } from '../constants';

/**
 * BetModal — full-screen overlay for placing a single bet.
 * @param {object} props
 * @param {object} props.modal - Enriched market object being bet on
 * @param {number} props.betAmt - Current bet amount
 * @param {(n: number) => void} props.setBetAmt
 * @param {'YES'|'NO'} props.betSide
 * @param {(s: string) => void} props.setBetSide
 * @param {number} props.slipCap - Max allowed slippage (e.g. 0.02)
 * @param {boolean} props.placing - True while API call is in-flight
 * @param {{ ok?: string, err?: string }|null} props.betMsg - Result message
 * @param {() => void} props.onPlace - Called when user confirms
 * @param {() => void} props.onClose - Called to dismiss the modal
 * @param {boolean} props.hasKey - Whether an API key is connected
 */
export default function BetModal({
  modal, betAmt, setBetAmt, betSide, setBetSide,
  slipCap, placing, betMsg, onPlace, onClose, hasKey,
}) {
  const slip = calcSlip(modal.pool, betAmt, betSide);
  const postProb = calcPost(modal.pool, betAmt, betSide);
  const over = slip > slipCap;

  return (
    <div
      onClick={e => e.target === e.currentTarget && onClose()}
      style={{ position:'fixed',inset:0,background:'rgba(0,0,0,.8)',backdropFilter:'blur(4px)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:50,padding:16 }}
    >
      <div style={{ background:'#0d0e1a',border:'1px solid #1a1d2e',borderRadius:20,padding:24,width:'100%',maxWidth:440,boxShadow:'0 25px 60px rgba(0,0,0,.6)' }}>

        {/* Market title */}
        <div style={{ display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:18,gap:12 }}>
          <p style={{ fontWeight:700,color:'#e2e8f0',lineHeight:1.4,fontSize:15 }}>{modal.question}</p>
          <button onClick={onClose} style={{ background:'none',border:'none',color:'#4b5280',cursor:'pointer',fontSize:22,lineHeight:1,flexShrink:0 }}>×</button>
        </div>

        {/* Info grid */}
        <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:18 }}>
          {[
            ['Market prob', `${(modal.probability * 100).toFixed(1)}%`],
            ['My prob',     modal.ourP != null ? `${(modal.ourP * 100).toFixed(1)}%` : 'Not set'],
            ['Expected value', modal.ev != null ? `+${(modal.ev * 100).toFixed(2)}%` : '—'],
            ['Category',   `${modal.cat ?? getCategory(modal.question)} (${(modal.cw ?? catW(modal.question))}×)`],
          ].map(([k, v]) => (
            <div key={k} style={{ background:'#111320',borderRadius:10,padding:'10px 14px' }}>
              <div style={{ fontSize:11,color:'#4b5280',marginBottom:3 }}>{k}</div>
              <div style={{ fontWeight:700,color:'#c7d2fe' }}>{v}</div>
            </div>
          ))}
        </div>

        {/* YES / NO toggle */}
        <div style={{ display:'flex',gap:8,marginBottom:16 }}>
          {['YES', 'NO'].map(s => (
            <button
              key={s}
              onClick={() => setBetSide(s)}
              style={{
                flex:1, padding:'10px', borderRadius:10,
                border:`2px solid ${betSide===s ? (s==='YES'?'#34d399':'#f87171') : '#1a1d2e'}`,
                background:betSide===s ? (s==='YES'?'rgba(52,211,153,.1)':'rgba(248,113,113,.1)') : 'transparent',
                color:betSide===s ? (s==='YES'?'#34d399':'#f87171') : '#4b5280',
                cursor:'pointer', fontWeight:700, fontSize:14,
              }}
            >{s}</button>
          ))}
        </div>

        {/* Amount input */}
        <div style={{ marginBottom:16 }}>
          <div style={{ fontSize:12,color:'#4b5280',marginBottom:6 }}>Amount (ᴍ)</div>
          <input
            type="number" min="1" value={betAmt}
            onChange={e => setBetAmt(+e.target.value)}
            style={{ width:'100%',background:'#111320',border:'1px solid #2d3148',borderRadius:10,padding:'10px 14px',color:'white',fontSize:15,fontWeight:600,outline:'none' }}
          />
        </div>

        {/* Slippage / impact summary */}
        <div style={{ background:over?'rgba(248,113,113,.06)':'#111320',border:`1px solid ${over?'rgba(248,113,113,.2)':'#1a1d2e'}`,borderRadius:10,padding:'12px 14px',marginBottom:16,fontSize:13 }}>
          {[
            ['Platform fee',  `ᴍ${(betAmt * FEE).toFixed(2)}`,            '#6b7280'],
            ['Price impact',  `${(slip * 100).toFixed(2)}%${over?' ⛔':''}`, over ? '#f87171' : '#6b7280'],
            ['Post-bet prob', postProb ? `${(postProb * 100).toFixed(1)}%` : '—', '#818cf8'],
          ].map(([k, v, c]) => (
            <div key={k} style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6 }}>
              <span style={{ color:'#4b5280' }}>{k}</span>
              <span style={{ color:c,fontWeight:600 }}>{v}</span>
            </div>
          ))}
          {over && (
            <div style={{ color:'#f87171',fontWeight:600,fontSize:12,marginTop:6,paddingTop:6,borderTop:'1px solid rgba(248,113,113,.15)' }}>
              Exceeds {(slipCap * 100).toFixed(0)}% cap — blocked
            </div>
          )}
        </div>

        {/* Result message */}
        {betMsg && (
          <div style={{ borderRadius:8,padding:'8px 12px',fontSize:12,marginBottom:12,background:betMsg.ok?'rgba(52,211,153,.08)':'rgba(248,113,113,.08)',border:`1px solid ${betMsg.ok?'rgba(52,211,153,.2)':'rgba(248,113,113,.2)'}`,color:betMsg.ok?'#34d399':'#f87171' }}>
            {betMsg.ok ?? betMsg.err}
          </div>
        )}

        {/* Submit */}
        <button
          onClick={onPlace}
          disabled={placing || !hasKey}
          style={{ width:'100%',padding:'13px',borderRadius:12,border:'none',fontWeight:700,fontSize:14,cursor:placing||!hasKey?'default':'pointer',background:placing||!hasKey?'#111320':'linear-gradient(135deg,#4f46e5,#6366f1)',color:placing||!hasKey?'#3d4166':'white' }}
        >
          {placing ? 'Placing…' : !hasKey ? 'Connect API key first' : `Place ᴍ${betAmt} on ${betSide}`}
        </button>
      </div>
    </div>
  );
}