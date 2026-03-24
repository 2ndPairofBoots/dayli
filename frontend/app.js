const LOG_BASE = "./logs";

const paths = {
  bets: `${LOG_BASE}/bets/place_bet_event.csv`,
  errors: `${LOG_BASE}/errors/error_event.csv`,
  portfolio: `${LOG_BASE}/portfolio/portfolio_event.csv`,
  strategy: `${LOG_BASE}/strategies/strategy_event.csv`,
};

const qs = (id) => document.getElementById(id);

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

qs("refreshBtn").addEventListener("click", loadDashboard);
loadDashboard();
