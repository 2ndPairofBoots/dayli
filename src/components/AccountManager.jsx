// ─────────────────────────────────────────────
// src/components/AccountManager.jsx
// Modal for adding, switching, and removing
// saved Manifold API key accounts.
// ─────────────────────────────────────────────

import { useState } from 'react';
import { fetchMe } from '../api/manifold';
import { loadAccounts, saveAccounts } from '../utils/storage';
import { fmt } from '../utils/categories';

/**
 * AccountManager modal.
 * @param {object} props
 * @param {string} props.activeKey - Currently active API key
 * @param {(key: string) => void} props.onSelectKey - Called when user switches account
 * @param {() => void} props.onClose - Called to close the modal
 */
export default function AccountManager({ activeKey, onSelectKey, onClose }) {
  const [accounts, setAccounts] = useState(loadAccounts);
  const [newKey, setNewKey] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [adding, setAdding] = useState(false);
  const [validating, setValidating] = useState(false);
  const [err, setErr] = useState('');

  /** Validates the API key against /me, then saves the account */
  const addAccount = async () => {
    if (!newKey.trim()) { setErr('API key required'); return; }
    setValidating(true);
    setErr('');
    const u = await fetchMe(newKey.trim());
    if (!u) { setErr('Invalid API key or connection error'); setValidating(false); return; }
    const label = newLabel.trim() || `@${u.username}`;
    const acct = { id: Date.now().toString(), key: newKey.trim(), label, username: u.username, balance: u.balance };
    const updated = [...accounts.filter(a => a.key !== newKey.trim()), acct];
    setAccounts(updated);
    saveAccounts(updated);
    setNewKey('');
    setNewLabel('');
    setAdding(false);
    setValidating(false);
  };

  /** Removes an account by id */
  const removeAccount = id => {
    const updated = accounts.filter(a => a.id !== id);
    setAccounts(updated);
    saveAccounts(updated);
  };

  return (
    <div
      onClick={e => e.target === e.currentTarget && onClose()}
      style={{ position:'fixed',inset:0,background:'rgba(0,0,0,.85)',backdropFilter:'blur(4px)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:60,padding:16 }}
    >
      <div style={{ background:'#0d0e1a',border:'1px solid #1a1d2e',borderRadius:20,padding:24,width:'100%',maxWidth:480,boxShadow:'0 25px 60px rgba(0,0,0,.6)' }}>
        {/* Header */}
        <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20 }}>
          <div style={{ fontWeight:700,color:'#c7d2fe',fontSize:16 }}>Accounts</div>
          <button onClick={onClose} style={{ background:'none',border:'none',color:'#4b5280',cursor:'pointer',fontSize:22 }}>×</button>
        </div>

        {/* Empty state */}
        {accounts.length === 0 && !adding && (
          <div style={{ textAlign:'center',padding:'24px 0',color:'#3d4166',fontSize:13 }}>No accounts added yet</div>
        )}

        {/* Account list */}
        {accounts.map(a => (
          <div
            key={a.id}
            onClick={() => { onSelectKey(a.key); onClose(); }}
            style={{ display:'flex',alignItems:'center',gap:12,padding:'12px 14px',borderRadius:10,border:`1px solid ${activeKey===a.key?'rgba(99,102,241,.4)':'#1a1d2e'}`,background:activeKey===a.key?'rgba(99,102,241,.1)':'#111320',marginBottom:8,cursor:'pointer',transition:'all .15s' }}
            onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(99,102,241,.3)'}
            onMouseLeave={e => e.currentTarget.style.borderColor = activeKey===a.key?'rgba(99,102,241,.4)':'#1a1d2e'}
          >
            <div style={{ width:36,height:36,borderRadius:10,background:'rgba(99,102,241,.15)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:16,flexShrink:0 }}>👤</div>
            <div style={{ flex:1,minWidth:0 }}>
              <div style={{ fontWeight:600,color:'#c7d2fe',fontSize:13 }}>{a.label}</div>
              <div style={{ fontSize:11,color:'#4b5280' }}>@{a.username} · ᴍ{fmt(a.balance ?? 0)}</div>
            </div>
            {activeKey === a.key && (
              <span style={{ fontSize:11,color:'#818cf8',background:'rgba(99,102,241,.15)',padding:'2px 8px',borderRadius:99,fontWeight:600 }}>Active</span>
            )}
            <button
              onClick={e => { e.stopPropagation(); removeAccount(a.id); }}
              style={{ background:'none',border:'none',color:'#4b5280',cursor:'pointer',fontSize:16,padding:'0 4px' }}
              title="Remove"
            >×</button>
          </div>
        ))}

        {/* Add account form */}
        {adding ? (
          <div style={{ background:'#111320',borderRadius:12,padding:16,border:'1px solid #1a1d2e',marginTop:8 }}>
            <div style={{ fontSize:12,color:'#4b5280',marginBottom:6 }}>Nickname (optional)</div>
            <input
              value={newLabel}
              onChange={e => setNewLabel(e.target.value)}
              placeholder="e.g. Main Account"
              style={{ width:'100%',background:'#07080f',border:'1px solid #2d3148',borderRadius:8,padding:'8px 12px',color:'white',fontSize:13,outline:'none',marginBottom:10 }}
            />
            <div style={{ fontSize:12,color:'#4b5280',marginBottom:6 }}>API Key</div>
            <input
              type="password"
              value={newKey}
              onChange={e => setNewKey(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addAccount()}
              placeholder="Manifold API key…"
              style={{ width:'100%',background:'#07080f',border:'1px solid #2d3148',borderRadius:8,padding:'8px 12px',color:'white',fontSize:13,outline:'none',marginBottom:10 }}
            />
            {err && <div style={{ color:'#f87171',fontSize:12,marginBottom:8 }}>{err}</div>}
            <div style={{ display:'flex',gap:8 }}>
              <button
                onClick={addAccount}
                disabled={validating}
                style={{ flex:1,padding:'8px',borderRadius:8,border:'none',background:'linear-gradient(135deg,#4f46e5,#6366f1)',color:'white',cursor:'pointer',fontWeight:600,fontSize:13 }}
              >{validating ? 'Validating…' : 'Add Account'}</button>
              <button
                onClick={() => { setAdding(false); setErr(''); }}
                style={{ padding:'8px 14px',borderRadius:8,border:'1px solid #1a1d2e',background:'transparent',color:'#6b7280',cursor:'pointer',fontSize:13 }}
              >Cancel</button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            style={{ width:'100%',marginTop:8,padding:'10px',borderRadius:10,border:'1px dashed #2d3148',background:'transparent',color:'#6366f1',cursor:'pointer',fontSize:13,fontWeight:600 }}
          >+ Add Account</button>
        )}

        <div style={{ fontSize:10,color:'#2d3148',marginTop:12,textAlign:'center' }}>
          Keys stored in browser localStorage · never sent to any server except Manifold
        </div>
      </div>
    </div>
  );
}