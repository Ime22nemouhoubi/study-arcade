import { Router } from "express";
import { pool } from "../db.js";
import { auth } from "../auth.js";

const r = Router();
const startOfDay = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return +d; };

r.use(auth);

// One call to hydrate the whole app
r.get("/state", async (req, res) => {
  try {
    const uid = req.user.id;
    const { rows: urows } = await pool.query("SELECT * FROM users WHERE id = $1", [uid]);
    const user = urows[0];
    const { rows: prows } = await pool.query("SELECT * FROM progress WHERE user_id = $1", [uid]);
    const prog = prows[0] || {};
    const { rows: notes } = await pool.query("SELECT id, block, title, body, created_at FROM notes WHERE user_id = $1 ORDER BY created_at DESC", [uid]);
    const { rows: attempts } = await pool.query("SELECT id, block, score, total, wrong_json, created_at FROM attempts WHERE user_id = $1 ORDER BY created_at DESC LIMIT 40", [uid]);
    res.json({
      settings: { name: user.name, examDate: Number(user.exam_date), startDate: Number(user.start_date) },
      checklist: JSON.parse(prog.checklist_json || "{}"),
      weak: JSON.parse(prog.weak_json || "{}"),
      dayDone: JSON.parse(prog.daydone_json || "{}"),
      notes: notes.map((n) => ({ id: n.id, block: n.block, title: n.title, body: n.body, created_at: Number(n.created_at) })),
      qcmHist: attempts.map((a) => ({ id: a.id, block: a.block, score: a.score, total: a.total, wrong: JSON.parse(a.wrong_json), date: Number(a.created_at) })),
    });
  } catch (e) { console.error(e); res.status(500).json({ error: "Erreur serveur" }); }
});

r.put("/settings", async (req, res) => {
  try {
    const { name, examDate, startDate } = req.body || {};
    await pool.query(
      "UPDATE users SET name = COALESCE($1, name), exam_date = COALESCE($2, exam_date), start_date = COALESCE($3, start_date) WHERE id = $4",
      [name ?? null, examDate ? startOfDay(examDate) : null, startDate ? startOfDay(startDate) : null, req.user.id]
    );
    const { rows } = await pool.query("SELECT name, exam_date, start_date FROM users WHERE id = $1", [req.user.id]);
    const u = rows[0];
    res.json({ settings: { name: u.name, examDate: Number(u.exam_date), startDate: Number(u.start_date) } });
  } catch (e) { console.error(e); res.status(500).json({ error: "Erreur serveur" }); }
});

async function upsertProgress(uid, field, value) {
  await pool.query("INSERT INTO progress (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING", [uid]);
  await pool.query(`UPDATE progress SET ${field} = $1 WHERE user_id = $2`, [JSON.stringify(value), uid]);
}

r.put("/checklist", async (req, res) => { try { await upsertProgress(req.user.id, "checklist_json", req.body.checklist || {}); res.json({ ok: true }); } catch (e) { console.error(e); res.status(500).json({ error: "Erreur serveur" }); } });
r.put("/weak", async (req, res) => { try { await upsertProgress(req.user.id, "weak_json", req.body.weak || {}); res.json({ ok: true }); } catch (e) { console.error(e); res.status(500).json({ error: "Erreur serveur" }); } });
r.put("/daydone", async (req, res) => { try { await upsertProgress(req.user.id, "daydone_json", req.body.dayDone || {}); res.json({ ok: true }); } catch (e) { console.error(e); res.status(500).json({ error: "Erreur serveur" }); } });

// Notes
r.post("/notes", async (req, res) => {
  try {
    const { block, title, body } = req.body || {};
    if (!title?.trim()) return res.status(400).json({ error: "Titre requis" });
    const { rows } = await pool.query(
      "INSERT INTO notes (user_id, block, title, body, created_at) VALUES ($1,$2,$3,$4,$5) RETURNING id, block, title, body, created_at",
      [req.user.id, block || "transversal", title.trim(), body || "", Date.now()]
    );
    const n = rows[0];
    res.json({ id: n.id, block: n.block, title: n.title, body: n.body, created_at: Number(n.created_at) });
  } catch (e) { console.error(e); res.status(500).json({ error: "Erreur serveur" }); }
});

r.delete("/notes/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM notes WHERE id = $1 AND user_id = $2", [req.params.id, req.user.id]);
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: "Erreur serveur" }); }
});

export default r;
