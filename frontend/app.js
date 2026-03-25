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
    qs("statusText").textContent = "Status: website account connected";
  } catch (error) {
    setConnectionStatus(`Connection: ${error.message}`, true);
  }
}

function onDisconnect() {
  clearAccount();
  qs("accountForm").reset();
  updateAccountHeader(null);
  setConnectionStatus("Connection: disconnected");
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
  qs("statusText").textContent = "Status: loading logs...";

  try {
    const [bets, errors, portfolio, strategy] = await Promise.all([
      readCsv(paths.bets),
      readCsv(paths.errors),
      readCsv(paths.portfolio),
      readCsv(paths.strategy),
    ]);

    const latestPortfolio = portfolio[portfolio.length - 1] || {};

    qs("balanceValue").textContent = fmtNum(latestPortfolio.balance);
    qs("pnlValue").textContent = fmtNum(latestPortfolio.pnl);
    qs("simBetsValue").textContent = String(bets.slice(-50).length);
    qs("errorsValue").textContent = String(errors.slice(-50).length);
    qs("accountName").textContent = inferAccountName(bets);

    renderRows(
      "betsTable",
      bets.slice(-20).reverse(),
      (r) => `<tr>
        <td>${short(r.timestamp, 19)}</td>
        <td>${short(r.market_question, 46)}</td>
        <td>${r.outcome}</td>
        <td>${r.size}</td>
        <td>${fmtNum(r.probability, 3)}</td>
        <td>${short(r.reason, 44)}</td>
      </tr>`
    );

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
    qs("lastUpdated").textContent = `Last updated: ${now.toLocaleString()}`;
    qs("statusText").textContent = "Status: online (loaded CSV logs from repo)";
  } catch (err) {
    qs("statusText").textContent = `Status: failed (${err.message})`;
  }
}

function initAccountFlow() {
  const form = qs("accountForm");
  const disconnectBtn = qs("disconnectBtn");
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
}

qs("refreshBtn").addEventListener("click", async () => {
  await Promise.all([loadDashboard(), loadMarketDatapoints()]);
});
qs("refreshMarketsBtn")?.addEventListener("click", () => loadMarketDatapoints());
initAccountFlow();
loadDashboard();
loadMarketDatapoints();
