import jwt from "jsonwebtoken";

const SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
if (SECRET === "dev-secret-change-me" && process.env.NODE_ENV === "production") {
  console.warn("⚠  JWT_SECRET is not set — set it in Railway variables for production.");
}

export function sign(user) {
  return jwt.sign({ id: user.id, email: user.email }, SECRET, { expiresIn: "30d" });
}

export function auth(req, res, next) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Non authentifié" });
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Session expirée" });
  }
}
