require("dotenv").config();
const express = require("express");
const { pool, migrate } = require("./db");
const requireAuth = require("./middleware/auth");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 4002;
// Fee rate comes from config (env / ConfigMap later) — NOT hard-coded.
const FEE_RATE = parseFloat(process.env.FEE_RATE || "0.02"); // 2% default

app.get("/health", (_req, res) => res.json({ status: "ok", service: "ledger" }));

// List current exchange rates.
app.get("/rates", requireAuth, async (_req, res) => {
  const { rows } = await pool.query(
    "SELECT currency, ngn_rate, as_of FROM exchange_rates ORDER BY currency"
  );
  res.json({ rates: rows });
});

// Record a transaction — now with real fee math.
app.post("/transactions", requireAuth, async (req, res) => {
  const { type, gross_amount, currency, category } = req.body || {};
  if (!type || !["INCOME", "EXPENSE"].includes(type)) {
    return res.status(400).json({ error: "type must be INCOME or EXPENSE" });
  }
  const gross = Number(gross_amount);
  if (!gross || gross <= 0) {
    return res.status(400).json({ error: "gross_amount must be a positive number" });
  }
  if (!currency) return res.status(400).json({ error: "currency is required" });

  // Make sure we know this currency's rate before accepting it.
  const known = await pool.query(
    "SELECT 1 FROM exchange_rates WHERE currency = $1",
    [currency.toUpperCase()]
  );
  if (known.rowCount === 0) {
    return res.status(400).json({ error: `unknown currency ${currency}` });
  }

  // THE FEE MATH:
  const fee = +(gross * FEE_RATE).toFixed(2);
  // INCOME: you keep gross minus fee.  EXPENSE: it costs you gross plus fee.
  const net = type === "INCOME" ? +(gross - fee).toFixed(2) : +(gross + fee).toFixed(2);

  const { rows } = await pool.query(
    `INSERT INTO transactions (user_id, type, gross_amount, fee, net_amount, currency, category)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [req.userId, type, gross, fee, net, currency.toUpperCase(), category || null]
  );
  res.status(201).json({ transaction: rows[0] });
});

// List the logged-in user's transactions.
app.get("/transactions", requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    "SELECT * FROM transactions WHERE user_id = $1 ORDER BY occurred_at DESC",
    [req.userId]
  );
  res.json({ transactions: rows });
});

// Wallet balances grouped by currency (income adds, expense subtracts).
app.get("/wallets", requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT currency,
            SUM(CASE WHEN type='INCOME' THEN net_amount ELSE -net_amount END) AS balance
     FROM transactions WHERE user_id = $1 GROUP BY currency ORDER BY currency`,
    [req.userId]
  );
  res.json({ wallets: rows });
});

migrate()
  .then(() => app.listen(PORT, () => console.log(`[ledger] listening on ${PORT}`)))
  .catch((err) => {
    console.error("[ledger] failed to start", err);
    process.exit(1);
  });
