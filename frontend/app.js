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
let lastHoldings = [];

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
  if (!name || !sub) return;

  if (!account) {
    name.textContent = "No account";
    sub.textContent = "API input is below";
    return;
  }

  name.textContent = account.displayName;
  sub.textContent = "Manifold account connected";
}

function clearDataViews() {
  setText("balanceValue", "-");
  setText("investedValue", "-");
  setText("pnlValue", "-");
  setText("openHoldingsValue", "-");
  setText("lastUpdated", "Last updated: -");
  renderRows("betsTable", [], () => "");
  renderRows("errorsTable", [], () => "");
  renderRows("strategyTable", [], () => "");
  renderRows("holdingsTable", [], () => "");
  renderRows("marketsTable", [], () => "");
  setText("holdingsStatusText", "Holdings: connect API to load data");
  drawPortfolioChart([]);
  showMarketRaw(-1);
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
    setText("balanceValue", formatMana(bal));
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
      (h) => `<tr>
        <td>${escapeHtml(short(h.marketQuestion, 72))}</td>
        <td>${escapeHtml(h.outcome)}</td>
        <td>${formatMana(h.shares)}</td>
        <td>${formatMana(h.avgPrice)}</td>
        <td>${formatMana(h.value)}</td>
        <td>${h.pnl >= 0 ? "+" : ""}${formatMana(h.pnl)}</td>
      </tr>`
    );

    setText("openHoldingsValue", String(lastHoldings.length));
    const invested = lastHoldings.reduce((sum, h) => sum + parseNum(h.shares) * parseNum(h.avgPrice), 0);
    const pnl = lastHoldings.reduce((sum, h) => sum + parseNum(h.pnl), 0);
    setText("investedValue", formatMana(invested));
    setText("pnlValue", formatMana(pnl));

    if (status) status.textContent = `Holdings: loaded ${lastHoldings.length} open trades.`;
  } catch (error) {
    lastHoldings = [];
    renderRows("holdingsTable", [], () => "");
    setText("openHoldingsValue", "0");
    if (status) status.textContent = `Holdings: failed (${error.message})`;
  }
}

function buildLinePath(points) {
  if (!points.length) return "";
  return points
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(" ");
}

function drawPortfolioChart(portfolioRows) {
  const line = qs("chartLine");
  const fill = qs("chartFill");
  if (!line || !fill) return;

  const rows = portfolioRows.slice(-120);
  const series = rows
    .map((r) => {
      const balance = parseNum(r.balance);
      const invested = parseNum(r.invested);
      return balance + invested;
    })
    .filter((v) => !Number.isNaN(v));

  if (series.length < 2) {
    line.setAttribute("d", "");
    fill.setAttribute("d", "");
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
    return { x, y };
  });

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

function showMarketRaw(index) {
  const raw = qs("marketRawJson");
  if (!raw) return;
  if (index < 0 || index >= lastMarkets.length) {
    raw.textContent = "Select a row to inspect full market payload.";
    return;
  }
  raw.textContent = JSON.stringify(lastMarkets[index], null, 2);
}

function bindMarketRowClicks() {
  document.querySelectorAll(".market-row").forEach((row) => {
    row.addEventListener("click", () => {
      const idx = Number(row.dataset.index);
      showMarketRaw(idx);
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
    lastMarkets = Array.isArray(markets) ? markets : [];

    renderRows(
      "marketsTable",
      lastMarkets,
      (m, idx) => `<tr class="market-row" data-index="${idx}">
        <td>${escapeHtml(short(m.id, 14))}</td>
        <td>${escapeHtml(short(m.question, 86))}</td>
        <td>${fmtNum(parseMarketProbability(m), 3)}</td>
        <td>${fmtNum(parseMarketLiquidity(m), 0)}</td>
        <td>${fmtNum(parseMarketVolume24h(m), 0)}</td>
        <td>${escapeHtml(m.outcomeType || "-")}</td>
        <td>${m.isResolved ? "yes" : "no"}</td>
      </tr>`
    );

    showMarketRaw(lastMarkets.length ? 0 : -1);
    bindMarketRowClicks();

    if (status) {
      status.textContent = `Markets: loaded ${lastMarkets.length} datapoints-rich records from Manifold.`;
    }
  } catch (error) {
    if (status) status.textContent = `Markets: failed (${error.message})`;
    renderRows("marketsTable", [], () => "");
    showMarketRaw(-1);
  }
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

    const latestPortfolio = portfolio[portfolio.length - 1] || {};

    if (latestPortfolio.balance != null && latestPortfolio.balance !== "") {
      setText("balanceValue", formatMana(latestPortfolio.balance));
    }
    setText("investedValue", formatMana(latestPortfolio.invested));
    setText("pnlValue", formatMana(latestPortfolio.pnl));
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
