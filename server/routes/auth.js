import { Router } from "express";
import bcrypt from "bcryptjs";
import { pool } from "../db.js";
import { sign, auth } from "../auth.js";

const r = Router();
const DAY = 86400000;
const startOfDay = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return +d; };

// BIGINT columns come back from pg as strings — convert epoch fields to numbers for the client.
function publicUser(u) {
  return { id: u.id, email: u.email, name: u.name, examDate: Number(u.exam_date), startDate: Number(u.start_date) };
}

r.post("/register", async (req, res) => {
  try {
    const { email, password, name } = req.body || {};
    if (!email || !password || password.length < 6)
      return res.status(400).json({ error: "Email et mot de passe (≥ 6 caractères) requis." });
    const { rows: ex } = await pool.query("SELECT id FROM users WHERE email = $1", [email.toLowerCase()]);
    if (ex[0]) return res.status(409).json({ error: "Cet email est déjà utilisé." });

    const hash = bcrypt.hashSync(password, 10);
    const now = Date.now();
    const examDefault = startOfDay(now) + 96 * DAY; // ~ session d'Alger
    const { rows } = await pool.query(
      "INSERT INTO users (email, password_hash, name, exam_date, start_date, created_at) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *",
      [email.toLowerCase(), hash, name || "", examDefault, startOfDay(now), now]
    );
    const user = rows[0];
    await pool.query("INSERT INTO progress (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING", [user.id]);
    res.json({ token: sign(user), user: publicUser(user) });
  } catch (e) { console.error(e); res.status(500).json({ error: "Erreur serveur" }); }
});

r.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const { rows } = await pool.query("SELECT * FROM users WHERE email = $1", [(email || "").toLowerCase()]);
    const user = rows[0];
    if (!user || !bcrypt.compareSync(password || "", user.password_hash))
      return res.status(401).json({ error: "Email ou mot de passe incorrect." });
    res.json({ token: sign(user), user: publicUser(user) });
  } catch (e) { console.error(e); res.status(500).json({ error: "Erreur serveur" }); }
});

r.get("/me", auth, async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM users WHERE id = $1", [req.user.id]);
    if (!rows[0]) return res.status(404).json({ error: "Introuvable" });
    res.json({ user: publicUser(rows[0]) });
  } catch (e) { console.error(e); res.status(500).json({ error: "Erreur serveur" }); }
});

export default r;
