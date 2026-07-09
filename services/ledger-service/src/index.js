require("dotenv").config();
const express = require("express");
const { pool, migrate } = require("./db");
const requireAuth = require("./middleware/auth");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 4002;

// Health check — for Kubernetes later.
app.get("/health", (_req, res) => res.json({ status: "ok", service: "ledger" }));

// Record a transaction. Protected — needs a valid token.
// (Fee math comes on Day 6. For now, fee is 0 so we can build + test the basics.)
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

  const fee = 0;                    // placeholder — real fee logic on Day 6
  const net = gross;                // placeholder

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

migrate()
  .then(() => app.listen(PORT, () => console.log(`[ledger] listening on ${PORT}`)))
  .catch((err) => {
    console.error("[ledger] failed to start", err);
    process.exit(1);
  });
