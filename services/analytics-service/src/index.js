require("dotenv").config();
const express = require("express");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 4003;
// Where to reach ledger-service. In compose/k8s this is the service NAME.
const LEDGER_URL = process.env.LEDGER_URL || "http://localhost:4002";

app.get("/health", (_req, res) => res.json({ status: "ok", service: "analytics" }));

// Helper: forward the caller's token to ledger-service and return the JSON.
async function callLedger(path, authHeader) {
  const resp = await fetch(`${LEDGER_URL}${path}`, {
    headers: { Authorization: authHeader || "" },
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`ledger ${path} -> ${resp.status}: ${body}`);
  }
  return resp.json();
}

// The profit report. Pulls transactions + rates FROM ledger, converts
// everything into one base currency, then sums income minus expenses.
app.get("/report", async (req, res) => {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: "missing bearer token" });

  const base = (req.query.base || "NGN").toUpperCase();

  try {
    // 1. Ask ledger-service for the data (this is the inter-service call).
    const { transactions } = await callLedger("/transactions", auth);
    const { rates } = await callLedger("/rates", auth);

    // Build a lookup: currency -> its value in naira.
    const ngn = {};
    rates.forEach((r) => (ngn[r.currency] = Number(r.ngn_rate)));
    if (!ngn[base]) {
      return res.status(400).json({ error: `no exchange rate for base ${base}` });
    }

    // 2. Convert every amount into the base currency and total it.
    // value_in_base = amount * (currency->NGN) / (base->NGN)
    const toBase = (amount, currency) =>
      (Number(amount) * ngn[currency]) / ngn[base];

    let income = 0;
    let expense = 0;

    for (const t of transactions) {
      const value = toBase(t.net_amount, t.currency);
      if (t.type === "INCOME") income += value;
      else expense += value;
    }

    const profit = income - expense;

    res.json({
      base_currency: base,
      total_income: +income.toFixed(2),
      total_expense: +expense.toFixed(2),
      net_profit: +profit.toFixed(2),
      transaction_count: transactions.length,
    });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: "could not build report", detail: err.message });
  }
});

app.listen(PORT, () => console.log(`[analytics] listening on ${PORT}, ledger at ${LEDGER_URL}`));
