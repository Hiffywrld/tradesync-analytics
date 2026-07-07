require("dotenv").config();
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { pool, migrate } = require("./db");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 4001;
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

// Health check — later, Kubernetes pings this to know the service is alive.
app.get("/health", (_req, res) => res.json({ status: "ok", service: "auth" }));

// Register a new freelancer.
app.post("/register", async (req, res) => {
  const { email, name, password } = req.body || {};
  if (!email || !name || !password) {
    return res.status(400).json({ error: "email, name and password are required" });
  }
  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      "INSERT INTO users (email, name, password) VALUES ($1, $2, $3) RETURNING id, email, name, created_at",
      [email.toLowerCase(), name, hash]
    );
    res.status(201).json({ user: result.rows[0] });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "email already registered" });
    }
    console.error(err);
    res.status(500).json({ error: "internal error" });
  }
});

// Log in — checks the password, returns a signed JWT.
app.post("/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: "email and password are required" });
  }
  try {
    const result = await pool.query(
      "SELECT id, email, name, password FROM users WHERE email = $1",
      [email.toLowerCase()]
    );
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: "invalid credentials" });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ error: "invalid credentials" });

    const token = jwt.sign(
      { sub: user.id, email: user.email, name: user.name },
      JWT_SECRET,
      { expiresIn: "12h" }
    );
    res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal error" });
  }
});

// Set up the database table, THEN start listening for requests.
migrate()
  .then(() => app.listen(PORT, () => console.log(`[auth] listening on ${PORT}`)))
  .catch((err) => {
    console.error("[auth] failed to start", err);
    process.exit(1);
  });