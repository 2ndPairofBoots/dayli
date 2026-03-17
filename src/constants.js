export const BASE = "https://api.manifold.markets/v0";
export const FEE = 0.01;
export const KELLY_FRAC = 0.25;

export const CATS = {
  ai:       { k:['ai','llm','gpt','openai','anthropic','claude','gemini','neural','deepmind','agi'], w:1.2, color:'#818cf8', baseRate:0.52 },
  tech:     { k:['apple','google','microsoft','meta','amazon','software','startup','iphone','chip'], w:1.1, color:'#38bdf8', baseRate:0.50 },
  science:  { k:['science','research','climate','space','nasa','cern','physics','vaccine','study'], w:1.15, color:'#34d399', baseRate:0.48 },
  crypto:   { k:['bitcoin','btc','eth','crypto','defi','nft','blockchain','solana','web3'], w:0.85, color:'#fbbf24', baseRate:0.45 },
  politics: { k:['election','president','congress','senate','democrat','republican','vote','trump','biden','law','bill'], w:0.8, color:'#f87171', baseRate:0.38 },
  sports:   { k:['nba','nfl','mlb','nhl','soccer','football','basketball','tennis','swim','olympic'], w:0.9, color:'#fb923c', baseRate:0.50 },
  finance:  { k:['stock','fed','inflation','gdp','recession','interest','economy','sp500','hedge'], w:1.0, color:'#a78bfa', baseRate:0.46 },
};

/** Color per strategy — includes 'manual' for bets placed directly on Manifold */
export const STRAT_COLORS = {
  calibration:    '#6366f1',
  new_market:     '#10b981',
  mean_reversion: '#fbbf24',
  extreme_fade:   '#f87171',
  attrition:      '#38bdf8',
  whaler:         '#e879f9',
  manual:         '#94a3b8',  // ← new: bets placed outside Dayli
  unknown:        '#4b5280',
};

export const STRAT_LABELS = {
  calibration:    'Calibration',
  new_market:     'New Mkt',
  mean_reversion: 'Mean Rev',
  extreme_fade:   'Extreme Fade',
  attrition:      'Attrition',
  whaler:         'Whaler',
  manual:         'Manual',    // ← new
  unknown:        '—',
};

export const STRATEGIES = [
  { id:'calibration',    label:'Calibration',          desc:'Category base rates — bets when deviation >12%.' },
  { id:'extreme_fade',   label:'Extreme Fade',          desc:'Fades markets at ≥93% or ≤7% probability.' },
  { id:'new_market',     label:'New Market Sniper',     desc:'Fades extreme probs on freshly created markets (≤5 bets).' },
  { id:'attrition',      label:'Attrition',             desc:'Bets NO on "by 20XX" markets where nothing is happening.' },
  { id:'whaler',         label:'Whaler (WebSocket)',    desc:'Live WS feed — logs large bets moving markets ≥8%. Bot-only.' },
  { id:'mean_reversion', label:'Mean Reversion',        desc:'Fades sudden large probability moves detected via WebSocket.' },
];

export const DEFAULT_BOT_CONFIG = {
  calibration:    true,
  new_market:     true,
  extreme_fade:   true,
  attrition:      true,
  whaler:         true,
  mean_reversion: false,
  maxBet:         50,
  balanceReserve: 200,
  dailyLimit:     500,
  slipCap:        0.02,
  catMaxPct:      0.25,
};