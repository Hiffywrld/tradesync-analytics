// Connects to Postgres and sets up the table auth-service owns.
const { Pool } = require("pg");

// A "pool" is a set of reusable database connections. Cheaper than opening
// a fresh connection for every query.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Runs once when the service starts. Creates the users table if it isn't
// there yet. "IF NOT EXISTS" makes it safe to run every boot.
async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id          SERIAL PRIMARY KEY,
      email       TEXT UNIQUE NOT NULL,
      name        TEXT NOT NULL,
      password    TEXT NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  console.log("[auth] migration complete");
}

// Make these available to other files (index.js will use them).
module.exports = { pool, migrate };
