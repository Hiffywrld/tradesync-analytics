// Verifies the JWT that auth-service issued. We DON'T call auth-service here —
// we just check the token's signature with the shared secret. Fast, and one
// less service to depend on.
const jwt = require("jsonwebtoken");
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

module.exports = function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "missing bearer token" });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.sub;       // the logged-in user's id, from the token
    req.userEmail = payload.email;
    next();                          // token is valid — carry on to the route
  } catch {
    return res.status(401).json({ error: "invalid or expired token" });
  }
};
