const LOG_BASE = "./logs";

const paths = {
  bets: `${LOG_BASE}/bets/place_bet_event.csv`,
  errors: `${LOG_BASE}/errors/error_event.csv`,
  portfolio: `${LOG_BASE}/portfolio/portfolio_event.csv`,
  strategy: `${LOG_BASE}/strategies/strategy_event.csv`,
};

const qs = (id) => document.getElementById(id);
const ACCOUNT_STORAGE_KEY = "dayli_account";
const MANIFOLD_BASE_URL = "https://api.manifold.markets";

let lastMarkets = [];
let filteredMarkets = [];
let lastHoldings = [];
let lastPortfolioRows = [];
let chartRange = "1w";
const chartRangeMs = {
  "1d": 24 * 60 * 60 * 1000,
  "1w": 7 * 24 * 60 * 60 * 1000,
  "1m": 30 * 24 * 60 * 60 * 1000,
};
const snapshotMetrics = {
  balance: null,
  invested: null,
};
let chartPlotPoints = [];
let searchDebounceTimer = null;
let ws = null;
let previousProbByMarket = new Map();

function setTrendClass(id, value) {
  const el = qs(id);
  if (!el) return;
  el.classList.remove("gain", "loss");
  const n = Number(value);
  if (Number.isNaN(n) || n === 0) return;
  el.classList.add(n > 0 ? "gain" : "loss");
}

function setText(id, value) {
  const el = qs(id);
  if (!el) return;
  el.textContent = value;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function loadSavedAccount() {
  try {
    const raw = localStorage.getItem(ACCOUNT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.displayName || !parsed?.apiKey) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveAccount(account) {
  localStorage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify(account));
}

function clearAccount() {
  localStorage.removeItem(ACCOUNT_STORAGE_KEY);
}

function setConnectionStatus(text, isError = false) {
  const el = qs("connectionStatus");
  if (!el) return;
  el.textContent = text;
  el.style.color = isError ? "#b91c1c" : "";
}

function updateAccountHeader(account) {
  const name = qs("accountName");
  const sub = qs("accountSub");
  const avatar = qs("accountAvatar");
  if (!name || !sub || !avatar) return;

  if (!account) {
    name.textContent = "No account";
    sub.textContent = "Click to connect";
    avatar.innerHTML = '<i class="fas fa-user"></i>';
    return;
  }

  name.textContent = account.displayName;
  sub.textContent = "Manifold account connected";
  const initial = account.displayName.charAt(0).toUpperCase();
  avatar.textContent = initial;
}

function clearDataViews() {
  setText("balanceValue", "-");
  setText("investedValue", "-");
  setText("pnlValue", "-");
  setText("netWorthValue", "-");
  setText("openHoldingsValue", "-");
  setTrendClass("pnlValue", 0);
  snapshotMetrics.balance = null;
  snapshotMetrics.invested = null;
  lastPortfolioRows = [];
  setText("lastUpdated", "Last updated: -");
  renderRows("betsTable", [], () => "");
  renderRows("errorsTable", [], () => "");
  renderRows("strategyTable", [], () => "");
  renderRows("holdingsTable", [], () => "");
  renderRows("marketsTable", [], () => "");
  setText("holdingsStatusText", "Holdings: connect API to load data");
  drawPortfolioChart([]);
  hideChartTooltip();
  showMarketRaw(-1);
}

function updateNetWorth() {
  const balance = Number.isFinite(snapshotMetrics.balance) ? snapshotMetrics.balance : null;
  const invested = Number.isFinite(snapshotMetrics.invested) ? snapshotMetrics.invested : null;
  if (balance == null && invested == null) {
    setText("netWorthValue", "-");
    return;
  }
  setText("netWorthValue", formatMana((balance || 0) + (invested || 0)));
}

async function loadConnectedSnapshot(apiKey) {
  const response = await fetch("https://api.manifold.markets/v0/me", {
    headers: {
      Authorization: `Key ${apiKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(`account snapshot failed (${response.status})`);
  }

  const me = await response.json();
  const bal = Number(me.balance ?? 0);
  if (!Number.isNaN(bal) && bal > 0) {
    snapshotMetrics.balance = bal;
    setText("balanceValue", formatMana(bal));
    updateNetWorth();
  }
  return me;
}

async function loadAllData(apiKey) {
  await loadDashboard();
  await Promise.all([
    loadMarketDatapoints(),
    loadRecentBetsFromApi(apiKey),
    apiKey ? loadConnectedSnapshot(apiKey) : Promise.resolve(),
  ]);
  await loadCurrentHoldings(apiKey);

  // Calculate analytics after all data is loaded
  calculatePerformanceMetrics();
}

async function fetchCurrentUser(apiKey) {
  const meRes = await fetch("https://api.manifold.markets/v0/me", {
    headers: {
      Authorization: `Key ${apiKey}`,
    },
  });
  if (!meRes.ok) {
    throw new Error(`user lookup failed (${meRes.status})`);
  }
  return meRes.json();
}

async function loadRecentBetsFromApi(apiKey) {
  try {
    const me = await fetchCurrentUser(apiKey);
    const betsRes = await fetch(
      `${MANIFOLD_BASE_URL}/v0/bets?userId=${encodeURIComponent(me.id)}&limit=50`,
      {
        headers: {
          Authorization: `Key ${apiKey}`,
        },
      }
    );

    if (!betsRes.ok) {
      throw new Error(`bets lookup failed (${betsRes.status})`);
    }

    const bets = await betsRes.json();
    const rows = (Array.isArray(bets) ? bets : []).slice(0, 20);

    renderRows(
      "betsTable",
      rows,
      (r) => `<tr>
        <td>${short(r.createdTime ? new Date(r.createdTime).toISOString() : "-", 19)}</td>
        <td>${short(r.contractQuestion || r.question || r.contractId || "-", 46)}</td>
        <td>${escapeHtml(r.outcome || "-")}</td>
        <td>${formatMana(r.amount)}</td>
        <td>${fmtNum(r.probBefore ?? r.probAfter ?? r.limitProb, 3)}</td>
        <td>${short(r.answer || "Live Manifold API bet", 44)}</td>
      </tr>`
    );
  } catch {
    renderRows("betsTable", [], () => "");
  }
}

function formatMana(value) {
  const n = Number(value);
  if (Number.isNaN(n)) return "-";
  return n.toLocaleString(undefined, {
    maximumFractionDigits: 2,
  });
}

function parseNum(...values) {
  for (const val of values) {
    const n = Number(val);
    if (!Number.isNaN(n)) return n;
  }
  return 0;
}

function extractHoldings(data) {
  const arrays = [];
  if (Array.isArray(data)) arrays.push(data);
  if (Array.isArray(data?.investments)) arrays.push(data.investments);
  if (Array.isArray(data?.positions)) arrays.push(data.positions);
  if (Array.isArray(data?.holdings)) arrays.push(data.holdings);
  if (Array.isArray(data?.contracts)) arrays.push(data.contracts);
  if (Array.isArray(data?.data?.investments)) arrays.push(data.data.investments);
  if (Array.isArray(data?.data?.positions)) arrays.push(data.data.positions);
  if (Array.isArray(data?.portfolio)) arrays.push(data.portfolio);
  if (Array.isArray(data?.positionsByContract)) arrays.push(data.positionsByContract);

  const source = arrays.flatMap((arr) => arr || []);
  const result = [];

  source.forEach((row) => {
    const marketQuestion = row.question || row.contractQuestion || row.title || row.contractId || "Unknown market";
    const marketId = row.contractId || row.marketId || row.id || marketQuestion;
    const yesShares = parseNum(row.hasYesShares, row.yesShares);
    const noShares = parseNum(row.hasNoShares, row.noShares);
    const fallbackShares = parseNum(row.shares, row.totalShares, row.numberShares, row.amount);
    const avgPrice = parseNum(row.averagePrice, row.avgPrice, row.avgCost, row.price);

    const pushRow = (outcome, sharesVal) => {
      if (sharesVal <= 0) return;
      const value = parseNum(row.currentValue, row.value, row.notionalValue, sharesVal * avgPrice);
      const pnl = parseNum(row.profit, row.pnl, row.unrealizedPnl, value - sharesVal * avgPrice);
      result.push({
        marketId,
        marketQuestion,
        outcome,
        shares: sharesVal,
        avgPrice,
        value,
        pnl,
      });
    };

    if (yesShares > 0 || noShares > 0) {
      pushRow("YES", yesShares);
      pushRow("NO", noShares);
    } else {
      const outcome = row.outcome || row.answer || row.position || "-";
      pushRow(outcome, fallbackShares);
    }
  });

  return result;
}

function mergeHoldings(holdings) {
  const byKey = new Map();

  holdings.forEach((h) => {
    const key = `${h.marketId}::${h.outcome}`;
    const prev = byKey.get(key) || {
      marketId: h.marketId,
      marketQuestion: h.marketQuestion,
      outcome: h.outcome,
      shares: 0,
      costBasis: 0,
      value: 0,
      pnl: 0,
    };

    prev.shares += parseNum(h.shares);
    prev.costBasis += parseNum(h.shares) * parseNum(h.avgPrice);
    prev.value += parseNum(h.value);
    prev.pnl += parseNum(h.pnl);
    byKey.set(key, prev);
  });

  return Array.from(byKey.values()).map((h) => {
    const avgPrice = h.shares > 0 ? h.costBasis / h.shares : 0;
    const value = h.value > 0 ? h.value : h.costBasis;
    const pnl = Number.isFinite(h.pnl) ? h.pnl : value - h.costBasis;
    return {
      ...h,
      avgPrice,
      value,
      pnl,
    };
  });
}

function buildHoldingsFromBets(bets) {
  const grouped = new Map();
  (bets || []).forEach((b) => {
    const marketId = b.contractId || b.contract_id || "unknown";
    const outcome = b.outcome || "-";
    const key = `${marketId}::${outcome}`;
    const shares = parseNum(b.shares);
    const amount = parseNum(b.amount);
    const existing = grouped.get(key) || {
      marketId,
      marketQuestion: b.contractQuestion || b.question || marketId,
      outcome,
      shares: 0,
      costBasis: 0,
    };
    existing.shares += shares;
    existing.costBasis += amount;
    grouped.set(key, existing);
  });

  return Array.from(grouped.values())
    .filter((h) => h.shares > 0)
    .map((h) => ({
      ...h,
      avgPrice: h.shares > 0 ? h.costBasis / h.shares : 0,
      value: h.costBasis,
      pnl: 0,
    }));
}

async function loadCurrentHoldings(apiKey) {
  const status = qs("holdingsStatusText");
  if (status) status.textContent = "Holdings: loading...";

  try {
    const me = await fetchCurrentUser(apiKey);
    const liveBalance = parseNum(me.balance, me.cashBalance, me.totalBalance);
    if (liveBalance > 0) {
      setText("balanceValue", formatMana(liveBalance));
    }

    const endpoints = [
      `${MANIFOLD_BASE_URL}/v0/portfolio`,
      `${MANIFOLD_BASE_URL}/v0/portfolio/${encodeURIComponent(me.username)}`,
    ];

    const payloads = [];
    for (const url of endpoints) {
      const res = await fetch(url, {
        headers: {
          Authorization: `Key ${apiKey}`,
        },
      });
      if (res.ok) {
        payloads.push(await res.json());
      }
    }

    let merged = mergeHoldings(payloads.flatMap((p) => extractHoldings(p)));

    if (!merged.length) {
      const betsRes = await fetch(
        `${MANIFOLD_BASE_URL}/v0/bets?userId=${encodeURIComponent(me.id)}&limit=1000`,
        {
          headers: {
            Authorization: `Key ${apiKey}`,
          },
        }
      );
      if (betsRes.ok) {
        const bets = await betsRes.json();
        merged = buildHoldingsFromBets(Array.isArray(bets) ? bets : []);
      }
    }

    lastHoldings = merged
      .filter((h) => h.shares > 0)
      .sort((a, b) => b.value - a.value);

    renderRows(
      "holdingsTable",
      lastHoldings,
      (h, idx) => `<tr>
        <td>${escapeHtml(short(h.marketQuestion, 72))}</td>
        <td>${escapeHtml(h.outcome)}</td>
        <td>${formatMana(h.shares)}</td>
        <td>${formatMana(h.avgPrice)}</td>
        <td>${formatMana(h.value)}</td>
        <td class="${h.pnl >= 0 ? "gain" : "loss"}">${h.pnl >= 0 ? "+" : ""}${formatMana(h.pnl)}</td>
        <td>
          <button class="btn-trade" onclick="openPositionModal(${idx})">
            <i class="fas fa-info-circle"></i> View
          </button>
          <button class="btn-quick-sell" data-holding-index="${idx}" onclick="openQuickSellPanel(${idx})">
            <i class="fas fa-arrow-down"></i> Sell
          </button>
        </td>
      </tr>`
    );

    setText("openHoldingsValue", String(lastHoldings.length));
    const invested = lastHoldings.reduce((sum, h) => sum + parseNum(h.shares) * parseNum(h.avgPrice), 0);
    const currentValue = lastHoldings.reduce((sum, h) => sum + parseNum(h.value), 0);
    const pnl = currentValue - invested;
    snapshotMetrics.invested = invested;
    setText("investedValue", formatMana(invested));
    setText("pnlValue", formatMana(pnl));
    setTrendClass("pnlValue", pnl);
    updateNetWorth();

    if (status) status.textContent = `Holdings: loaded ${lastHoldings.length} open trades.`;
  } catch (error) {
    lastHoldings = [];
    renderRows("holdingsTable", [], () => "");
    setText("openHoldingsValue", "0");
    snapshotMetrics.invested = null;
    setText("investedValue", "-");
    setText("pnlValue", "-");
    setTrendClass("pnlValue", 0);
    updateNetWorth();
    if (status) status.textContent = `Holdings: failed (${error.message})`;
  }
}

function buildLinePath(points) {
  if (!points.length) return "";
  return points
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(" ");
}

function hideChartTooltip() {
  const tip = qs("chartTooltip");
  const dot = qs("chartHoverDot");
  if (tip) tip.style.display = "none";
  if (dot) dot.style.display = "none";
}

function showChartTooltip(point, event) {
  const chart = qs("portfolioChart");
  const box = chart?.parentElement;
  const tip = qs("chartTooltip");
  const dot = qs("chartHoverDot");
  if (!chart || !box || !tip || !dot || !point) return;

  dot.setAttribute("cx", point.x.toFixed(2));
  dot.setAttribute("cy", point.y.toFixed(2));
  dot.style.display = "block";

  const dateLabel = point.ts ? new Date(point.ts).toLocaleString() : "time: n/a";
  tip.innerHTML = `net worth: ${formatMana(point.value)}<br>${escapeHtml(dateLabel)}`;
  tip.style.display = "block";

  const rect = box.getBoundingClientRect();
  const localX = event.clientX - rect.left;
  const localY = event.clientY - rect.top;
  const x = Math.min(Math.max(localX + 12, 10), rect.width - 180);
  const y = Math.min(Math.max(localY - 46, 10), rect.height - 42);
  tip.style.left = `${x}px`;
  tip.style.top = `${y}px`;
}

function initChartHover() {
  const chart = qs("portfolioChart");
  if (!chart) return;

  chart.addEventListener("mouseleave", () => {
    hideChartTooltip();
  });

  chart.addEventListener("mousemove", (event) => {
    if (!chartPlotPoints.length) {
      hideChartTooltip();
      return;
    }

    const rect = chart.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / Math.max(1, rect.width);
    const hoverX = Math.min(1000, Math.max(0, ratio * 1000));

    let nearest = chartPlotPoints[0];
    let bestDist = Math.abs(nearest.x - hoverX);
    for (let i = 1; i < chartPlotPoints.length; i++) {
      const dist = Math.abs(chartPlotPoints[i].x - hoverX);
      if (dist < bestDist) {
        bestDist = dist;
        nearest = chartPlotPoints[i];
      }
    }

    showChartTooltip(nearest, event);
  });
}

function parsePortfolioTimestamp(row) {
  const raw =
    row?.timestamp ??
    row?.created_time ??
    row?.createdTime ??
    row?.time ??
    row?.date ??
    "";
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isNaN(n) && n > 0) {
    return n > 10_000_000_000 ? n : n * 1000;
  }
  const t = Date.parse(String(raw));
  return Number.isNaN(t) ? null : t;
}

function filterRowsByRange(rows) {
  if (chartRange === "all") return rows;
  const windowMs = chartRangeMs[chartRange];
  if (!windowMs) return rows;

  const now = Date.now();
  const cutoff = now - windowMs;
  const filtered = rows.filter((r) => {
    const ts = parsePortfolioTimestamp(r);
    return ts != null && ts >= cutoff;
  });

  if (filtered.length >= 2) return filtered;
  return rows.slice(-40);
}

function setChartRange(nextRange) {
  chartRange = nextRange;
  ["1d", "1w", "1m", "all"].forEach((range) => {
    const btn = qs(`range${range === "all" ? "All" : range}`);
    if (!btn) return;
    btn.classList.toggle("active", range === chartRange);
  });
  drawPortfolioChart(lastPortfolioRows);
}

function initRangeControls() {
  const mapping = {
    range1d: "1d",
    range1w: "1w",
    range1m: "1m",
    rangeAll: "all",
  };
  Object.entries(mapping).forEach(([id, range]) => {
    qs(id)?.addEventListener("click", () => setChartRange(range));
  });
  setChartRange(chartRange);
}

function drawPortfolioChart(portfolioRows) {
  const line = qs("chartLine");
  const fill = qs("chartFill");
  if (!line || !fill) return;

  const rows = filterRowsByRange((portfolioRows || []).slice(-400));
  const series = rows
    .map((r) => {
      const balance = parseNum(r.balance);
      const invested = parseNum(r.invested);
      return balance + invested;
    })
    .filter((v) => !Number.isNaN(v));

  if (series.length < 2) {
    chartPlotPoints = [];
    line.setAttribute("d", "");
    fill.setAttribute("d", "");
    hideChartTooltip();
    return;
  }

  const width = 1000;
  const height = 240;
  const padX = 18;
  const padY = 20;
  const min = Math.min(...series);
  const max = Math.max(...series);
  const span = Math.max(1, max - min);

  const points = series.map((v, i) => {
    const x = padX + (i * (width - padX * 2)) / (series.length - 1);
    const y = height - padY - ((v - min) / span) * (height - padY * 2);
    const ts = parsePortfolioTimestamp(rows[i]);
    return { x, y, value: v, ts };
  });
  chartPlotPoints = points;

  const linePath = buildLinePath(points);
  const fillPath = `${linePath} L ${points[points.length - 1].x.toFixed(2)} ${
    (height - padY).toFixed(2)
  } L ${points[0].x.toFixed(2)} ${(height - padY).toFixed(2)} Z`;

  line.setAttribute("d", linePath);
  fill.setAttribute("d", fillPath);
}

async function verifyManifoldApiKey(apiKey) {
  const response = await fetch("https://api.manifold.markets/v0/me", {
    headers: {
      Authorization: `Key ${apiKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(`API check failed (${response.status})`);
  }

  return response.json();
}

function prefillAccountForm(account) {
  if (!account) return;
  qs("displayNameInput").value = account.displayName;
}

async function onAccountSubmit(event) {
  event.preventDefault();

  const displayName = qs("displayNameInput").value.trim();
  const keyInput = qs("apiKeyInput").value.trim();
  const existing = loadSavedAccount();
  const apiKey = keyInput || existing?.apiKey || "";

  if (!displayName || !apiKey) {
    setConnectionStatus("Connection: missing required fields", true);
    return;
  }

  setConnectionStatus("Connection: verifying API key...");

  try {
    const me = await verifyManifoldApiKey(apiKey);
    const account = {
      displayName,
      apiKey,
      manifoldUser: me.username || me.name || "Connected",
    };
    saveAccount(account);
    updateAccountHeader(account);
    setConnectionStatus(`Connection: connected as ${account.manifoldUser}`);
    await loadAllData(apiKey);
    qs("statusText").textContent = "Status: connected and synced";
    showAccountPanel(false);
  } catch (error) {
    setConnectionStatus(`Connection: ${error.message}`, true);
  }
}

function onDisconnect() {
  clearAccount();
  qs("accountForm").reset();
  updateAccountHeader(null);
  setConnectionStatus("Connection: disconnected");
  clearDataViews();
  setText("statusText", "Status: connect API to load data");
  setText("marketStatusText", "Markets: connect API to load data");
  showAccountPanel(true);
}

function showAccountPanel(show) {
  const panel = qs("accountPanel");
  const chip = qs("accountChip");
  if (!panel || !chip) return;
  panel.hidden = !show;
  chip.setAttribute("aria-expanded", show ? "true" : "false");
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      row.push(cell);
      cell = "";
    } else if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (ch === "\r" && next === "\n") i++;
      row.push(cell);
      if (row.some((c) => c !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }

  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }

  const [headers, ...dataRows] = rows;
  if (!headers) return [];
  return dataRows.map((r) => {
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h.trim()] = (r[idx] ?? "").trim();
    });
    return obj;
  });
}

async function readCsv(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to load ${path} (${res.status})`);
  }
  const text = await res.text();
  return parseCsv(text);
}

function renderRows(target, rows, mapper) {
  const body = qs(target);
  body.innerHTML = rows.map(mapper).join("");
}

function fmtNum(v, digits = 2) {
  const n = Number(v);
  if (Number.isNaN(n)) return "-";
  return n.toFixed(digits);
}

function short(text, max = 74) {
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max - 1)}...` : text;
}

function parseMarketProbability(market) {
  const p = market?.p;
  if (typeof p === "number") return p;
  if (typeof market?.probability === "number") return market.probability;
  if (typeof market?.probability === "object" && market?.probability?.YES != null) {
    return Number(market.probability.YES);
  }
  return null;
}

function parseMarketLiquidity(market) {
  return Number(market?.totalLiquidity ?? market?.liquidity ?? 0);
}

function parseMarketVolume24h(market) {
  return Number(market?.volume24Hours ?? market?.volume ?? 0);
}

function inferCategory(market) {
  const q = String(market?.question || "").toLowerCase();
  if (/bitcoin|btc|eth|crypto|solana|token/.test(q)) return "Crypto";
  if (/election|president|senate|trump|biden|congress|politic/.test(q)) return "Politics";
  if (/nba|nfl|mlb|nhl|tournament|match|cup|sports|game/.test(q)) return "Sports";
  if (/movie|tv|oscar|music|celebrity|entertain/.test(q)) return "Entertainment";
  return "General";
}

function showMarketRaw(index) {
  const raw = qs("marketRawJson");
  if (!raw) return;
  if (index < 0 || index >= filteredMarkets.length) {
    raw.textContent = "Select a row to inspect full market payload.";
    return;
  }
  raw.textContent = JSON.stringify(filteredMarkets[index], null, 2);
}

function bindMarketRowClicks() {
  document.querySelectorAll(".market-row").forEach((row) => {
    row.addEventListener("click", (event) => {
      // Check if clicked on trade button
      if (event.target.closest('.btn-trade')) {
        const idx = parseInt(row.dataset.index);
        if (idx >= 0 && idx < filteredMarkets.length) {
          openTradePanel(filteredMarkets[idx]);
        }
      } else {
        // Original behavior - show raw JSON
        const idx = Number(row.dataset.index);
        showMarketRaw(idx);
      }
    });
  });
}

async function loadMarketDatapoints(limitOverride) {
  const status = qs("marketStatusText");
  const limitInput = qs("marketLimitInput");
  const limit = Number(limitOverride ?? limitInput?.value ?? 120);
  const clampedLimit = Math.max(10, Math.min(1000, Number.isNaN(limit) ? 120 : limit));
  if (limitInput) limitInput.value = String(clampedLimit);

  if (status) status.textContent = `Markets: loading ${clampedLimit}...`;

  try {
    const response = await fetch(
      `${MANIFOLD_BASE_URL}/v0/markets?limit=${clampedLimit}&sort=updated-time`,
      { cache: "no-store" }
    );

    if (!response.ok) {
      throw new Error(`market feed failed (${response.status})`);
    }

    const markets = await response.json();
    previousProbByMarket = new Map(lastMarkets.map((m) => [m.id, Number(parseMarketProbability(m))]));
    lastMarkets = Array.isArray(markets) ? markets : [];
    filteredMarkets = lastMarkets;

    applyMarketFiltersAndSort();
    renderBreakingNews();

    if (status) {
      status.textContent = `Markets: loaded ${lastMarkets.length} markets from Manifold.`;
    }
  } catch (error) {
    if (status) status.textContent = `Markets: failed (${error.message})`;
    renderRows("marketsTable", [], () => "");
    showMarketRaw(-1);
  }
}

// Market filtering, search, and sorting functions
function applyMarketFiltersAndSort() {
  const searchTerm = qs("marketSearchInput")?.value?.toLowerCase() || "";
  const statusFilter = qs("statusFilter")?.value || "all";
  const liquidityFilter = qs("liquidityFilter")?.value || "all";
  const categoryFilter = qs("categoryFilter")?.value || "all";
  const sortBy = qs("sortControl")?.value || "volume";

  // Filter markets
  filteredMarkets = lastMarkets.filter(market => {
    // Search filter
    if (searchTerm && !market.question?.toLowerCase().includes(searchTerm)) {
      return false;
    }

    // Status filter
    if (statusFilter === "open" && market.isResolved) return false;
    if (statusFilter === "closed" && (market.isResolved || market.closeTime < Date.now())) return false;
    if (statusFilter === "resolved" && !market.isResolved) return false;

    // Liquidity filter
    const liquidity = parseMarketLiquidity(market);
    if (liquidityFilter === "high" && liquidity < 1000) return false;
    if (liquidityFilter === "medium" && (liquidity < 100 || liquidity >= 1000)) return false;
    if (liquidityFilter === "low" && liquidity >= 100) return false;
    if (categoryFilter !== "all" && inferCategory(market) !== categoryFilter) return false;

    return true;
  });

  // Sort markets
  filteredMarkets.sort((a, b) => {
    switch (sortBy) {
      case "volume":
        return parseMarketVolume24h(b) - parseMarketVolume24h(a);
      case "liquidity":
        return parseMarketLiquidity(b) - parseMarketLiquidity(a);
      case "probability":
        return parseMarketProbability(b) - parseMarketProbability(a);
      case "created":
        return (b.createdTime || 0) - (a.createdTime || 0);
      case "trending":
        // Trending = volume × recency score
        const recencyA = Math.max(0, 1 - (Date.now() - (a.createdTime || 0)) / (7 * 24 * 60 * 60 * 1000));
        const recencyB = Math.max(0, 1 - (Date.now() - (b.createdTime || 0)) / (7 * 24 * 60 * 60 * 1000));
        const trendScoreA = parseMarketVolume24h(a) * (1 + recencyA * 2);
        const trendScoreB = parseMarketVolume24h(b) * (1 + recencyB * 2);
        return trendScoreB - trendScoreA;
      default:
        return 0;
    }
  });

  // Render filtered markets
  renderRows(
    "marketsTable",
    filteredMarkets,
    (m, idx) => `<tr class="market-row" data-index="${idx}">
      <td>${escapeHtml(short(m.id, 14))}</td>
      <td>${escapeHtml(short(m.question, 86))}<br><span class="badge">${escapeHtml(inferCategory(m))}</span></td>
      <td>${fmtNum(parseMarketProbability(m), 3)}</td>
      <td class="${getProbDeltaClass(m.id)}">${formatProbDelta(m.id)}</td>
      <td>${renderMarketSparkline(m.id)}</td>
      <td>${fmtNum(parseMarketLiquidity(m), 0)}</td>
      <td>${fmtNum(parseMarketVolume24h(m), 0)}</td>
      <td>${escapeHtml(m.outcomeType || "-")}</td>
      <td>${m.isResolved ? "yes" : "no"}</td>
      <td><button class="btn-trade" data-index="${idx}">Trade</button></td>
    </tr>`
  );

  showMarketRaw(filteredMarkets.length ? 0 : -1);
  bindMarketRowClicks();
  renderTrendingMarkets();
  renderVolumeHeatmap();
  renderNewsFeed();

  // Update search count
  const countEl = qs("searchResultCount");
  if (countEl) {
    if (searchTerm || statusFilter !== "all" || liquidityFilter !== "all" || categoryFilter !== "all") {
      countEl.textContent = `${filteredMarkets.length} of ${lastMarkets.length}`;
      countEl.style.display = "block";
    } else {
      countEl.style.display = "none";
    }
  }
}

function renderBreakingNews() {
  const now = Date.now();
  const oneDayAgo = now - (24 * 60 * 60 * 1000);
  
  const breakingMarkets = lastMarkets
    .filter(m => !m.isResolved && m.createdTime && m.createdTime > oneDayAgo)
    .sort((a, b) => b.createdTime - a.createdTime)
    .slice(0, 6);

  const section = qs("breakingNewsSection");
  const list = qs("breakingNewsList");
  
  if (!section || !list) return;

  if (breakingMarkets.length === 0) {
    section.style.display = "none";
    return;
  }

  section.style.display = "block";
  list.innerHTML = breakingMarkets.map(m => {
    const prob = parseMarketProbability(m);
    const volume = parseMarketVolume24h(m);
    const hoursAgo = Math.floor((now - m.createdTime) / (60 * 60 * 1000));
    const timeText = hoursAgo < 1 ? "Just now" : `${hoursAgo}h ago`;
    
    return `<div class="breaking-news-item" onclick="window.open('https://manifold.markets/${m.creatorUsername}/${m.slug}', '_blank')">
      <div class="breaking-news-question">${escapeHtml(short(m.question, 120))}</div>
      <div class="breaking-news-meta">
        <div class="breaking-news-prob">${fmtNum(prob, 1)}%</div>
        <div class="breaking-news-time">
          <i class="fas fa-clock"></i> ${timeText}
        </div>
        <div class="breaking-news-volume">
          <i class="fas fa-chart-line"></i> M$${fmtNum(volume, 0)}
        </div>
      </div>
    </div>`;
  }).join('');
}

function initMarketDiscoveryControls() {
  const searchInput = qs("marketSearchInput");
  const statusFilter = qs("statusFilter");
  const liquidityFilter = qs("liquidityFilter");
  const categoryFilter = qs("categoryFilter");
  const sortControl = qs("sortControl");
  const clearBtn = qs("clearFilters");

  // Search with debouncing
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(() => {
        applyMarketFiltersAndSort();
      }, 300);
    });
  }

  // Filters
  if (statusFilter) {
    statusFilter.addEventListener("change", applyMarketFiltersAndSort);
  }
  if (liquidityFilter) {
    liquidityFilter.addEventListener("change", applyMarketFiltersAndSort);
  }
  if (categoryFilter) {
    categoryFilter.addEventListener("change", applyMarketFiltersAndSort);
  }
  if (sortControl) {
    sortControl.addEventListener("change", applyMarketFiltersAndSort);
  }

  // Clear filters
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      if (searchInput) searchInput.value = "";
      if (statusFilter) statusFilter.value = "open";
      if (liquidityFilter) liquidityFilter.value = "all";
      if (categoryFilter) categoryFilter.value = "all";
      if (sortControl) sortControl.value = "volume";
      applyMarketFiltersAndSort();
    });
  }
}

function formatProbDelta(marketId) {
  const prev = previousProbByMarket.get(marketId);
  const curr = filteredMarkets.find((m) => m.id === marketId);
  if (!curr) return "-";
  const cp = Number(parseMarketProbability(curr));
  if (prev == null || Number.isNaN(cp)) return "-";
  const d = (cp - prev) * 100;
  return `${d >= 0 ? "+" : ""}${fmtNum(d, 2)}%`;
}

function getProbDeltaClass(marketId) {
  const prev = previousProbByMarket.get(marketId);
  const curr = filteredMarkets.find((m) => m.id === marketId);
  if (!curr || prev == null) return "";
  const d = Number(parseMarketProbability(curr)) - prev;
  if (d > 0) return "delta-up";
  if (d < 0) return "delta-down";
  return "";
}

function renderMarketSparkline(marketId) {
  const curr = filteredMarkets.find((m) => m.id === marketId);
  const p = Number(parseMarketProbability(curr));
  if (Number.isNaN(p)) return "-";
  const x = [0, 16, 32, 48, 64];
  const base = [p - 0.04, p - 0.02, p - 0.01, p + 0.01, p].map((v) => Math.max(0.01, Math.min(0.99, v)));
  const points = base.map((v, i) => `${x[i]},${20 - v * 20}`).join(" ");
  return `<svg class="sparkline-svg" viewBox="0 0 64 20"><polyline fill="none" stroke="#4fd1b2" stroke-width="2" points="${points}" /></svg>`;
}

function renderTrendingMarkets() {
  const section = qs("trendingSection");
  const list = qs("trendingMarketsList");
  const count = qs("trendingCount");
  if (!section || !list || !count) return;
  const top = [...filteredMarkets]
    .sort((a, b) => parseMarketVolume24h(b) - parseMarketVolume24h(a))
    .slice(0, 6);
  if (!top.length) {
    section.style.display = "none";
    return;
  }
  section.style.display = "block";
  count.textContent = `${top.length} markets`;
  list.innerHTML = top
    .map(
      (m, idx) => `<div class="breaking-news-item" data-market-index="${idx}">
      <div class="breaking-news-question">${escapeHtml(short(m.question, 100))}</div>
      <div class="breaking-news-meta">
        <span class="breaking-news-prob">${fmtNum(parseMarketProbability(m), 1)}%</span>
        <span class="breaking-news-volume"><i class="fas fa-chart-line"></i> M$${fmtNum(parseMarketVolume24h(m), 0)}</span>
      </div>
    </div>`
    )
    .join("");
  const edgeMarkets = top.filter((m) => {
    const p = Number(parseMarketProbability(m));
    return !Number.isNaN(p) && Math.abs(50 - p * 100) >= (botSettings.alertEdgeThreshold || 6);
  });
  if (edgeMarkets.length) notifyOpportunity(edgeMarkets[0]);
}

function renderVolumeHeatmap() {
  const canvas = qs("volumeHeatmap");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const rows = 4;
  const cols = 6;
  const data = [...filteredMarkets].slice(0, rows * cols);
  const maxVol = Math.max(1, ...data.map((m) => parseMarketVolume24h(m)));
  const cellW = canvas.width / cols;
  const cellH = canvas.height / rows;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  data.forEach((m, i) => {
    const r = Math.floor(i / cols);
    const c = i % cols;
    const vol = parseMarketVolume24h(m) / maxVol;
    ctx.fillStyle = `rgba(79, 209, 178, ${0.15 + vol * 0.75})`;
    ctx.fillRect(c * cellW + 2, r * cellH + 2, cellW - 4, cellH - 4);
    ctx.fillStyle = "#e8eef7";
    ctx.font = "11px Manrope";
    ctx.fillText(`${fmtNum(parseMarketVolume24h(m), 0)}`, c * cellW + 8, r * cellH + 16);
  });
}

function renderNewsFeed() {
  const feed = qs("newsFeedList");
  if (!feed) return;
  const top = [...filteredMarkets]
    .sort((a, b) => parseMarketVolume24h(b) - parseMarketVolume24h(a))
    .slice(0, 4);
  feed.innerHTML = top
    .map(
      (m) => `<div class="breaking-news-item">
      <div class="breaking-news-question">${escapeHtml(short(m.question, 90))}</div>
      <div class="breaking-news-meta">
        <span><i class="fas fa-newspaper"></i> Market signal</span>
        <span class="breaking-news-volume">Vol M$${fmtNum(parseMarketVolume24h(m), 0)}</span>
      </div>
    </div>`
    )
    .join("");
}

function initPositionModal() {
  qs("positionModalClose")?.addEventListener("click", () => (qs("positionModal").style.display = "none"));
  qs("positionModalOverlay")?.addEventListener("click", () => (qs("positionModal").style.display = "none"));
}

function openPositionModal(idx) {
  const h = lastHoldings[idx];
  if (!h) return;
  const modal = qs("positionModal");
  const body = qs("positionModalBody");
  if (!modal || !body) return;
  body.innerHTML = `
    <div class="trade-market-info">
      <p class="trade-market-question">${escapeHtml(h.marketQuestion)}</p>
      <div class="trade-market-meta">
        <div><strong>Outcome:</strong> ${escapeHtml(h.outcome)}</div>
        <div><strong>Shares:</strong> ${formatMana(h.shares)}</div>
        <div><strong>Avg Price:</strong> M$${formatMana(h.avgPrice)}</div>
      </div>
      <div class="trade-market-meta">
        <div><strong>Value:</strong> M$${formatMana(h.value)}</div>
        <div><strong>P&L:</strong> <span class="${h.pnl >= 0 ? "gain" : "loss"}">${h.pnl >= 0 ? "+" : ""}${formatMana(h.pnl)}</span></div>
      </div>
    </div>
    <button class="btn btn-danger" onclick="openQuickSellPanel(${idx})"><i class="fas fa-arrow-down"></i> Quick Exit</button>
  `;
  modal.style.display = "flex";
}

function showToast(message) {
  const c = qs("toastContainer");
  if (!c) return;
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = message;
  c.appendChild(el);
  setTimeout(() => {
    if (el.parentNode) el.parentNode.removeChild(el);
  }, 4000);
}

function initNotifications() {
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission().catch(() => {});
  }
}

function notifyOpportunity(market) {
  const msg = `Opportunity: ${short(market.question, 60)} @ ${fmtNum(parseMarketProbability(market), 1)}%`;
  showToast(msg);
  if (botSettings.soundAlerts) {
    try {
      const ac = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.value = 0.04;
      osc.connect(gain);
      gain.connect(ac.destination);
      osc.start();
      osc.stop(ac.currentTime + 0.12);
    } catch {}
  }
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification("Dayli Opportunity", { body: msg });
  }
}

function initWebSocket() {
  try {
    // Placeholder public stream endpoint; falls back silently.
    ws = new WebSocket("wss://manifold.markets/api/v0/ws");
    ws.onopen = () => showToast("Realtime feed connected");
    ws.onmessage = () => {
      // On any update, refresh market filters quickly.
      if (lastMarkets.length) applyMarketFiltersAndSort();
    };
    ws.onclose = () => setTimeout(initWebSocket, 5000);
    ws.onerror = () => {};
  } catch {}
}

function decisionBadge(decision) {
  const isGood = decision === "proposed" || decision === "qualified";
  const klass = isGood ? "good" : "bad";
  return `<span class="badge ${klass}">${decision}</span>`;
}

function inferAccountName(rows) {
  const saved = loadSavedAccount();
  if (saved?.displayName) return saved.displayName;
  if (!rows || !rows.length) return "No account";
  return "No account";
}

async function loadDashboard() {
  setText("statusText", "Status: loading portfolio history...");

  try {
    const safeRead = async (path) => {
      try {
        return await readCsv(path);
      } catch {
        return [];
      }
    };

    const [errors, portfolio, strategy] = await Promise.all([
      safeRead(paths.errors),
      safeRead(paths.portfolio),
      safeRead(paths.strategy),
    ]);
    lastPortfolioRows = portfolio;

    const latestPortfolio = portfolio[portfolio.length - 1] || {};
    const connected = !!loadSavedAccount()?.apiKey;

    if (!connected) {
      if (latestPortfolio.balance != null && latestPortfolio.balance !== "") {
        const balance = parseNum(latestPortfolio.balance);
        snapshotMetrics.balance = balance;
        setText("balanceValue", formatMana(balance));
      }
      const invested = parseNum(latestPortfolio.invested);
      const pnl = parseNum(latestPortfolio.pnl);
      snapshotMetrics.invested = invested;
      setText("investedValue", formatMana(invested));
      setText("pnlValue", formatMana(pnl));
      setTrendClass("pnlValue", pnl);
      updateNetWorth();
    }

    setText("accountName", inferAccountName([]));
    drawPortfolioChart(portfolio);

    renderRows(
      "errorsTable",
      errors.slice(-20).reverse(),
      (r) => `<tr>
        <td>${short(r.timestamp, 19)}</td>
        <td>${short(r.error_type, 20)}</td>
        <td>${short(r.message, 75)}</td>
      </tr>`
    );

    renderRows(
      "strategyTable",
      strategy.slice(-20).reverse(),
      (r) => `<tr>
        <td>${short(r.timestamp, 19)}</td>
        <td>${short(r.market_question, 46)}</td>
        <td>${decisionBadge(r.decision)}</td>
        <td>${fmtNum(r.confidence, 3)}</td>
      </tr>`
    );

    const now = new Date();
    setText("lastUpdated", `Last updated: ${now.toLocaleString()}`);
    setText("statusText", "Status: portfolio and trade data loaded");
  } catch (err) {
    setText("statusText", `Status: failed (${err.message})`);
  }
}

// Trade Panel Functions
let currentTradeMarket = null;
let currentTradeType = "buy";

function openTradePanel(market) {
  currentTradeMarket = market;
  const panel = qs("tradePanel");
  const info = qs("tradeMarketInfo");
  
  if (!panel || !market) return;

  // Populate market info
  const prob = parseMarketProbability(market);
  const liquidity = parseMarketLiquidity(market);
  const volume = parseMarketVolume24h(market);

  info.innerHTML = `
    <div class="trade-market-question">${escapeHtml(market.question)}</div>
    <div class="trade-market-meta">
      <div><strong>Probability:</strong> ${fmtNum(prob, 1)}%</div>
      <div><strong>Liquidity:</strong> M$${fmtNum(liquidity, 0)}</div>
      <div><strong>Volume 24h:</strong> M$${fmtNum(volume, 0)}</div>
    </div>
  `;

  // Reset form
  qs("tradeAmount").value = "";
  qs("tradeOutcome").value = "YES";
  qs("tradePreview").style.display = "none";
  qs("tradeStatus").textContent = "";

  panel.style.display = "flex";
}

function closeTradePanel() {
  const panel = qs("tradePanel");
  if (panel) panel.style.display = "none";
  currentTradeMarket = null;
}

function openQuickSellPanel(holdingIndex) {
  const holding = lastHoldings[holdingIndex];
  if (!holding || !holding.marketId) {
    alert("Cannot find market for this holding");
    return;
  }

  // Find the market in lastMarkets
  const market = lastMarkets.find(m => m.id === holding.marketId);
  if (!market) {
    alert("Market not loaded. Please refresh markets first.");
    return;
  }

  // Open trade panel in sell mode
  currentTradeType = "sell";
  openTradePanel(market);
  
  // Pre-fill with sell details
  qs("tradeSellBtn")?.click();
  qs("tradeOutcome").value = holding.outcome === "YES" ? "YES" : "NO";
  qs("tradeAmount").value = Math.floor(holding.shares * holding.avgPrice).toString();
}

function setTradeType(type) {
  currentTradeType = type;
  const buyBtn = qs("tradeBuyBtn");
  const sellBtn = qs("tradeSellBtn");
  
  if (buyBtn && sellBtn) {
    buyBtn.classList.toggle("active", type === "buy");
    sellBtn.classList.toggle("active", type === "sell");
  }
}

function calculateTradePreview() {
  if (!currentTradeMarket) return;

  const amount = parseFloat(qs("tradeAmount")?.value || "0");
  const outcome = qs("tradeOutcome")?.value || "YES";
  
  if (amount <= 0) {
    qs("tradePreview").style.display = "none";
    return;
  }

  // Simple CPMM calculation (approximate)
  const currentProb = parseMarketProbability(currentTradeMarket) / 100;
  const isBuy = currentTradeType === "buy";
  const isYes = outcome === "YES";

  // Rough estimate of shares (would need full CPMM math from backend)
  let avgPrice, expectedShares, potentialProfit, newProb;

  if (isBuy) {
    if (isYes) {
      avgPrice = currentProb;
      expectedShares = amount / avgPrice;
      potentialProfit = expectedShares * (1 - avgPrice);
      newProb = currentProb + (amount / 10000); // Simplified impact
    } else {
      avgPrice = 1 - currentProb;
      expectedShares = amount / avgPrice;
      potentialProfit = expectedShares * (1 - avgPrice);
      newProb = currentProb - (amount / 10000);
    }
  } else {
    avgPrice = isYes ? currentProb : (1 - currentProb);
    expectedShares = amount / avgPrice;
    potentialProfit = -amount * 0.02; // Selling has negative profit estimate
    newProb = currentProb;
  }

  // Display preview
  qs("previewShares").textContent = fmtNum(expectedShares, 2);
  qs("previewPrice").textContent = `M$${fmtNum(avgPrice, 3)}`;
  qs("previewProfit").textContent = `M$${fmtNum(potentialProfit, 2)}`;
  qs("previewProfit").className = potentialProfit >= 0 ? "gain" : "loss";
  qs("previewNewProb").textContent = `${fmtNum(Math.max(0.01, Math.min(0.99, newProb)) * 100, 1)}%`;
  qs("tradePreview").style.display = "block";
}

async function executeTrade(event) {
  event.preventDefault();
  
  const status = qs("tradeStatus");
  const amount = parseFloat(qs("tradeAmount")?.value || "0");
  const outcome = qs("tradeOutcome")?.value || "YES";
  const account = loadSavedAccount();

  if (!account?.apiKey) {
    if (status) status.textContent = "Error: No API key configured";
    return;
  }

  if (!currentTradeMarket || amount <= 0) {
    if (status) status.textContent = "Error: Invalid trade parameters";
    return;
  }

  if (status) status.textContent = "Executing trade...";

  try {
    const response = await fetch(`${MANIFOLD_BASE_URL}/v0/bet`, {
      method: "POST",
      headers: {
        "Authorization": `Key ${account.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contractId: currentTradeMarket.id,
        amount: amount,
        outcome: outcome
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(error || `Trade failed (${response.status})`);
    }

    const result = await response.json();
    if (status) status.textContent = `✅ Trade executed! Shares: ${fmtNum(result.shares || 0, 2)}`;
    
    // Refresh data after trade
    setTimeout(() => {
      loadAllData(account.apiKey);
      closeTradePanel();
    }, 2000);

  } catch (error) {
    if (status) status.textContent = `❌ Error: ${error.message}`;
  }
}

function initTradePanel() {
  // Close buttons
  qs("tradePanelClose")?.addEventListener("click", closeTradePanel);
  qs("tradePanelOverlay")?.addEventListener("click", closeTradePanel);

  // Trade type buttons
  qs("tradeBuyBtn")?.addEventListener("click", () => setTradeType("buy"));
  qs("tradeSellBtn")?.addEventListener("click", () => setTradeType("sell"));

  // Preview button
  qs("tradePreviewBtn")?.addEventListener("click", calculateTradePreview);

  // Form submission
  qs("tradeForm")?.addEventListener("submit", executeTrade);

  // Auto-preview on amount change
  qs("tradeAmount")?.addEventListener("input", () => {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(calculateTradePreview, 500);
  });
}

// Make openQuickSellPanel available globally
window.openQuickSellPanel = openQuickSellPanel;

// Week 3: Bot Control & Analytics
let botSettings = {
  kellyMultiplier: 0.25,
  maxBetSize: 100,
  minEdge: 5,
  maxDrawdown: 20,
  alertEdgeThreshold: 6,
  soundAlerts: true
};

let botStatus = {
  running: false,
  startTime: null
};

function updateBotStatusDisplay() {
  const indicator = qs("botStatusIndicator");
  const statusText = qs("botStatusText");
  const uptimeEl = qs("botUptime");
  const startBtn = qs("botStartBtn");
  const stopBtn = qs("botStopBtn");

  if (!indicator || !statusText) return;

  const statusDot = indicator.querySelector(".status-dot");
  if (statusDot) {
    statusDot.className = "status-dot";
    if (botStatus.running) {
      statusDot.classList.add("status-dot-running");
      statusText.textContent = "Running";
      statusText.style.color = "var(--good)";
    } else {
      statusDot.classList.add("status-dot-stopped");
      statusText.textContent = "Stopped";
      statusText.style.color = "var(--danger)";
    }
  }

  // Update uptime
  if (uptimeEl) {
    if (botStatus.running && botStatus.startTime) {
      const elapsed = Date.now() - botStatus.startTime;
      const hours = Math.floor(elapsed / (60 * 60 * 1000));
      const minutes = Math.floor((elapsed % (60 * 60 * 1000)) / (60 * 1000));
      uptimeEl.textContent = `${hours}h ${minutes}m`;
    } else {
      uptimeEl.textContent = "-";
    }
  }

  // Update button states
  if (startBtn && stopBtn) {
    startBtn.disabled = botStatus.running;
    stopBtn.disabled = !botStatus.running;
  }
}

function startBot() {
  botStatus.running = true;
  botStatus.startTime = Date.now();
  updateBotStatusDisplay();
  alert("Bot started! Note: This is frontend-only. Backend integration required for actual trading.");
}

function stopBot() {
  botStatus.running = false;
  botStatus.startTime = null;
  updateBotStatusDisplay();
}

function saveRiskSettings(event) {
  event.preventDefault();
  
  botSettings.kellyMultiplier = parseFloat(qs("kellyMultiplier")?.value || "0.25");
  botSettings.maxBetSize = parseFloat(qs("maxBetSize")?.value || "100");
  botSettings.minEdge = parseFloat(qs("minEdge")?.value || "5");
  botSettings.maxDrawdown = parseFloat(qs("maxDrawdown")?.value || "20");
  botSettings.alertEdgeThreshold = parseFloat(qs("alertEdgeThreshold")?.value || "6");
  botSettings.soundAlerts = !!qs("soundAlerts")?.checked;

  // Save to localStorage
  localStorage.setItem("dayli_bot_settings", JSON.stringify(botSettings));

  showToast(
    `Saved risk settings: Kelly ${botSettings.kellyMultiplier}x, Max Bet M$${botSettings.maxBetSize}, Min Edge ${botSettings.minEdge}%`
  );
}

function loadRiskSettings() {
  try {
    const saved = localStorage.getItem("dayli_bot_settings");
    if (saved) {
      botSettings = JSON.parse(saved);
      qs("kellyMultiplier").value = botSettings.kellyMultiplier;
      qs("maxBetSize").value = botSettings.maxBetSize;
      qs("minEdge").value = botSettings.minEdge;
      qs("maxDrawdown").value = botSettings.maxDrawdown;
      if (qs("alertEdgeThreshold")) qs("alertEdgeThreshold").value = botSettings.alertEdgeThreshold ?? 6;
      if (qs("soundAlerts")) qs("soundAlerts").checked = botSettings.soundAlerts !== false;
    }
  } catch (e) {
    console.error("Failed to load bot settings", e);
  }
}

// Analytics Calculations
function calculatePerformanceMetrics() {
  // This would ideally use backend data
  // For now, calculate from holdings and portfolio
  
  const totalInvested = snapshotMetrics.invested || 0;
  const balance = snapshotMetrics.balance || 0;
  const netWorth = balance + totalInvested;
  
  // Simple ROI calculation
  let roi = 0;
  if (totalInvested > 0) {
    const currentValue = lastHoldings.reduce((sum, h) => sum + parseNum(h.value), 0);
    const profit = currentValue - totalInvested;
    roi = (profit / totalInvested) * 100;
  }

  // Win rate estimated from current holdings PnL sign
  const wins = lastHoldings.filter((h) => parseNum(h.pnl) > 0).length;
  const total = Math.max(1, lastHoldings.length);
  const winRate = (wins / total) * 100;

  // Sharpe approximation from portfolio CSV returns
  const returns = [];
  for (let i = 1; i < lastPortfolioRows.length; i++) {
    const prev = parseNum(lastPortfolioRows[i - 1].balance) + parseNum(lastPortfolioRows[i - 1].invested);
    const curr = parseNum(lastPortfolioRows[i].balance) + parseNum(lastPortfolioRows[i].invested);
    if (prev > 0) returns.push((curr - prev) / prev);
  }
  const mean = returns.length ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
  const variance =
    returns.length > 1 ? returns.reduce((a, r) => a + (r - mean) ** 2, 0) / (returns.length - 1) : 0;
  const std = Math.sqrt(Math.max(variance, 0));
  const sharpe = std > 0 ? (mean / std) * Math.sqrt(252) : 0;

  // Average trade (would need bet history)
  const avgTrade = lastHoldings.length > 0 
    ? lastHoldings.reduce((sum, h) => sum + parseNum(h.pnl), 0) / lastHoldings.length 
    : 0;

  // Update display
  qs("winRateValue").textContent = `${fmtNum(winRate, 1)}%`;
  qs("roiValue").textContent = `${roi >= 0 ? "+" : ""}${fmtNum(roi, 2)}%`;
  qs("roiValue").className = `analytic-value ${roi >= 0 ? "gain" : "loss"}`;
  qs("sharpeValue").textContent = fmtNum(sharpe, 2);
  qs("avgTradeValue").textContent = `M$${fmtNum(avgTrade, 2)}`;
  qs("avgTradeValue").className = `analytic-value ${avgTrade >= 0 ? "gain" : "loss"}`;
  renderPnlBreakdown();
  renderBestWorstTrades();
}

function renderPnlBreakdown() {
  const rows = [];
  const now = Date.now();
  const windows = [
    { label: "1D", ms: 24 * 60 * 60 * 1000 },
    { label: "1W", ms: 7 * 24 * 60 * 60 * 1000 },
    { label: "1M", ms: 30 * 24 * 60 * 60 * 1000 },
  ];
  windows.forEach((w) => {
    const recent = lastPortfolioRows.filter((r) => {
      const ts = parsePortfolioTimestamp(r);
      return ts != null && ts >= now - w.ms;
    });
    const first = recent[0];
    const last = recent[recent.length - 1];
    const start = first ? parseNum(first.balance) + parseNum(first.invested) : 0;
    const end = last ? parseNum(last.balance) + parseNum(last.invested) : 0;
    const pnl = end - start;
    const roi = start > 0 ? (pnl / start) * 100 : 0;
    rows.push({ period: w.label, trades: "-", pnl, roi });
  });
  renderRows(
    "pnlBreakdownTable",
    rows,
    (r) => `<tr><td>${r.period}</td><td>${r.trades}</td><td class="${r.pnl >= 0 ? "gain" : "loss"}">${r.pnl >= 0 ? "+" : ""}${fmtNum(r.pnl, 2)}</td><td class="${r.roi >= 0 ? "gain" : "loss"}">${r.roi >= 0 ? "+" : ""}${fmtNum(r.roi, 2)}%</td></tr>`
  );
}

function renderBestWorstTrades() {
  const sorted = [...lastHoldings].sort((a, b) => parseNum(b.pnl) - parseNum(a.pnl));
  const best = sorted.slice(0, 3).map((x) => ({ type: "Best", ...x }));
  const worst = sorted.slice(-3).reverse().map((x) => ({ type: "Worst", ...x }));
  renderRows(
    "bestWorstTable",
    [...best, ...worst],
    (r) => `<tr><td>${r.type}</td><td>${escapeHtml(short(r.marketQuestion, 44))}</td><td class="${parseNum(r.pnl) >= 0 ? "gain" : "loss"}">${parseNum(r.pnl) >= 0 ? "+" : ""}${fmtNum(parseNum(r.pnl), 2)}</td></tr>`
  );
}

// Kelly Edge Calculator
function calculateKellyEdge() {
  const edge = parseFloat(qs("edgeInput")?.value || "0") / 100;
  const currentProb = parseFloat(qs("probInput")?.value || "50") / 100;
  
  if (edge <= 0 || currentProb <= 0 || currentProb >= 1) {
    alert("Please enter valid edge and probability values");
    return;
  }

  // Kelly formula: f* = (bp - q) / b
  // where b = odds, p = probability of win, q = probability of loss
  const myProb = currentProb + edge;
  const odds = (1 - currentProb) / currentProb;
  const kellyFraction = (odds * myProb - (1 - myProb)) / odds;
  const kellyPercent = Math.max(0, Math.min(1, kellyFraction)) * 100;

  // Apply Kelly multiplier from settings
  const adjustedKelly = kellyPercent * botSettings.kellyMultiplier;
  const bankroll = (snapshotMetrics.balance || 1000);
  const recommendedBet = Math.min(
    (adjustedKelly / 100) * bankroll,
    botSettings.maxBetSize
  );

  // Expected value
  const expectedValue = recommendedBet * edge;

  // Display results
  qs("kellyPercent").textContent = `${fmtNum(kellyPercent, 2)}% (${fmtNum(adjustedKelly, 2)}% adjusted)`;
  qs("recommendedBet").textContent = `M$${fmtNum(recommendedBet, 2)}`;
  qs("expectedValue").textContent = `+M$${fmtNum(expectedValue, 2)}`;
  qs("edgeResults").style.display = "block";
}

function initBotControls() {
  // Load saved settings
  loadRiskSettings();

  // Bot start/stop
  qs("botStartBtn")?.addEventListener("click", startBot);
  qs("botStopBtn")?.addEventListener("click", stopBot);

  // Risk settings form
  qs("riskForm")?.addEventListener("submit", saveRiskSettings);

  // Edge calculator
  qs("calculateEdgeBtn")?.addEventListener("click", calculateKellyEdge);

  // Update bot status display
  updateBotStatusDisplay();

  // Update bot status every minute
  setInterval(updateBotStatusDisplay, 60000);
}

function initAccountFlow() {
  const form = qs("accountForm");
  const disconnectBtn = qs("disconnectBtn");
  const accountChip = qs("accountChip");
  if (!form || !disconnectBtn) return;

  const saved = loadSavedAccount();
  if (saved) {
    prefillAccountForm(saved);
    updateAccountHeader(saved);
    setConnectionStatus(`Connection: connected as ${saved.manifoldUser || saved.displayName}`);
  } else {
    updateAccountHeader(null);
    setConnectionStatus("Connection: not configured");
  }

  form.addEventListener("submit", onAccountSubmit);
  disconnectBtn.addEventListener("click", onDisconnect);
  accountChip?.addEventListener("click", () => {
    const panel = qs("accountPanel");
    if (!panel) return;
    showAccountPanel(panel.hidden);
  });
}

function setActiveTab(tab) {
  const tabs = document.querySelectorAll(".tab-btn");
  const sections = document.querySelectorAll("[data-tab-section]");
  tabs.forEach((btn) => btn.classList.toggle("active", btn.dataset.tab === tab));
  sections.forEach((section) => {
    section.style.display = section.getAttribute("data-tab-section") === tab ? "" : "none";
  });
}

function initTabNavigation() {
  const resolveTab = () => {
    const hash = window.location.hash || "#/overview";
    const tab = hash.replace("#/", "").trim();
    const valid = ["overview", "markets", "trades", "intel"];
    return valid.includes(tab) ? tab : "overview";
  };

  const applyFromHash = () => setActiveTab(resolveTab());

  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      // Let hash route drive the state
      setTimeout(applyFromHash, 0);
    });
  });

  window.addEventListener("hashchange", applyFromHash);

  if (!window.location.hash) {
    window.location.hash = "#/overview";
  } else {
    applyFromHash();
  }
}

qs("refreshBtn").addEventListener("click", async () => {
  const saved = loadSavedAccount();
  if (!saved?.apiKey) {
    setText("statusText", "Status: connect API to load data");
    setText("marketStatusText", "Markets: connect API to load data");
    showAccountPanel(true);
    return;
  }
  await loadAllData(saved.apiKey);
});
qs("refreshMarketsBtn")?.addEventListener("click", async () => {
  const saved = loadSavedAccount();
  if (!saved?.apiKey) {
    setText("marketStatusText", "Markets: connect API to load data");
    showAccountPanel(true);
    return;
  }
  await loadMarketDatapoints();
});

initAccountFlow();
initRangeControls();
initChartHover();
initMarketDiscoveryControls();
initTradePanel();
initBotControls();
initPositionModal();
initNotifications();
initWebSocket();
initTabNavigation();

const savedAccount = loadSavedAccount();
if (savedAccount?.apiKey) {
  showAccountPanel(false);
  loadAllData(savedAccount.apiKey);
} else {
  showAccountPanel(true);
  clearDataViews();
  setText("statusText", "Status: connect API to load data");
  setText("marketStatusText", "Markets: connect API to load data");
}

window.openPositionModal = openPositionModal;
