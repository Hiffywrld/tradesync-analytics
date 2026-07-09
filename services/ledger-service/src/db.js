const { Pool } = require("pg");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS transactions (
      id            SERIAL PRIMARY KEY,
      user_id       INTEGER NOT NULL,
      type          TEXT NOT NULL CHECK (type IN ('INCOME','EXPENSE')),
      gross_amount  NUMERIC(14,2) NOT NULL,
      fee           NUMERIC(14,2) NOT NULL,
      net_amount    NUMERIC(14,2) NOT NULL,
      currency      TEXT NOT NULL,
      category      TEXT,
      occurred_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS exchange_rates (
      currency   TEXT PRIMARY KEY,
      ngn_rate   NUMERIC(14,4) NOT NULL,
      as_of      DATE NOT NULL DEFAULT CURRENT_DATE
    );
  `);

  // Seed fixed rates only if the table is empty. These are pinned config,
  // NOT a live feed — so a demo never depends on the internet.
  const { rows } = await pool.query("SELECT COUNT(*)::int AS c FROM exchange_rates");
  if (rows[0].c === 0) {
    await pool.query(`
      INSERT INTO exchange_rates (currency, ngn_rate) VALUES
        ('NGN', 1),
        ('USD', 1600),
        ('EUR', 1750),
        ('GBP', 2050);
    `);
    console.log("[ledger] seeded default exchange rates");
  }
  console.log("[ledger] migration complete");
}

module.exports = { pool, migrate };
