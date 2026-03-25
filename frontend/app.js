const LOG_BASE = "./logs";

const paths = {
  bets: `${LOG_BASE}/bets/place_bet_event.csv`,
  errors: `${LOG_BASE}/errors/error_event.csv`,
  portfolio: `${LOG_BASE}/portfolio/portfolio_event.csv`,
  strategy: `${LOG_BASE}/strategies/strategy_event.csv`,
};

const qs = (id) => document.getElementById(id);
const ACCOUNT_STORAGE_KEY = "dayli_account";

function maskApiKey(key) {
  if (!key || key.length < 8) return "configured";
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

function loadSavedAccount() {
  try {
    const raw = localStorage.getItem(ACCOUNT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.displayName || !parsed?.email || !parsed?.apiKey) return null;
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
    sub.textContent = "Create account to connect API";
    return;
  }

  name.textContent = account.displayName;
  sub.textContent = `Connected ${maskApiKey(account.apiKey)}`;
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
  qs("emailInput").value = account.email;
  qs("apiKeyInput").value = account.apiKey;
}

async function onAccountSubmit(event) {
  event.preventDefault();

  const displayName = qs("displayNameInput").value.trim();
  const email = qs("emailInput").value.trim();
  const apiKey = qs("apiKeyInput").value.trim();

  if (!displayName || !email || !apiKey) {
    setConnectionStatus("Connection: missing required fields", true);
    return;
  }

  setConnectionStatus("Connection: verifying API key...");

  try {
    const me = await verifyManifoldApiKey(apiKey);
    const account = {
      displayName,
      email,
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

qs("refreshBtn").addEventListener("click", loadDashboard);
initAccountFlow();
loadDashboard();
