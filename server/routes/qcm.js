import { Router } from "express";
import { pool } from "../db.js";
import { auth } from "../auth.js";

const r = Router();
r.use(auth);

// Curriculum block + section counts — safe to expose (no answers)
r.get("/blocks", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT block, section, source, COUNT(*)::int AS n FROM qcm GROUP BY block, section, source");
    const counts = {};       // per block
    const sections = {};      // per section (for simulation sizing)
    let total = 0;
    for (const x of rows) {
      counts[x.block] = (counts[x.block] || 0) + x.n;
      sections[x.section] = (sections[x.section] || 0) + x.n;
      total += x.n;
    }
    res.json({ counts, sections, total });
  } catch (e) { console.error(e); res.status(500).json({ error: "Erreur serveur" }); }
});

// Map a DB row to a client-safe question (NO answer / why)
function toClient(x) {
  return {
    id: x.id, block: x.block, section: x.section, source: x.source, type: x.type,
    q: x.question, caseId: x.case_id,
    choices: JSON.parse(x.choices_json || "[]"),
    props: JSON.parse(x.props_json || "[]"),
    combos: JSON.parse(x.combos_json || "[]"),
  };
}

// Questions for a block drill WITHOUT answers/explanations
r.get("/", async (req, res) => {
  try {
    const { block } = req.query;
    const q = block && block !== "all"
      ? await pool.query("SELECT * FROM qcm WHERE block = $1", [block])
      : await pool.query("SELECT * FROM qcm");
    res.json(q.rows.map(toClient));
  } catch (e) { console.error(e); res.status(500).json({ error: "Erreur serveur" }); }
});

// Build a Blida-format simulation: 50 fondamentale + 50 pathologie + 50 clinique = 150,
// keeping clinical-case clusters together. Falls back gracefully if the bank is smaller.
r.get("/simulation", async (_req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM qcm");
    const shuffle = (a) => a.map((v) => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map((p) => p[1]);
    const bySection = { fondamentale: [], pathologie: [], clinique: [] };
    const cases = {}; // caseId -> [rows]
    for (const x of rows) {
      if (x.case_id) { (cases[x.case_id] = cases[x.case_id] || []).push(x); }
      else (bySection[x.section] || bySection.fondamentale).push(x);
    }
    const targets = { fondamentale: 50, pathologie: 50, clinique: 50 };
    const pick = (arr, n) => {
      // repeat the pool if we don't have enough, so a full-length sim is always assembled
      const out = [];
      let pool2 = shuffle(arr);
      while (out.length < n && pool2.length) {
        out.push(pool2.shift());
        if (!pool2.length && out.length < n) pool2 = shuffle(arr);
      }
      return out;
    };
    const exam = [];
    exam.push(...pick(bySection.fondamentale, targets.fondamentale));
    exam.push(...pick(bySection.pathologie, targets.pathologie));
    // clinique: mix standalone clinique Qs with whole case clusters
    const caseClusters = shuffle(Object.values(cases));
    const clin = [];
    for (const cluster of caseClusters) { if (clin.length + cluster.length <= targets.clinique) clin.push(...cluster); }
    clin.push(...pick(bySection.clinique, Math.max(0, targets.clinique - clin.length)));
    exam.push(...clin.slice(0, targets.clinique));
    res.json({ items: exam.map(toClient), durationMin: 240, structure: targets });
  } catch (e) { console.error(e); res.status(500).json({ error: "Erreur serveur" }); }
});

// Grade a submission server-side (handles QCS, multi-answer, and COMBO), record attempt, push weak areas
r.post("/submit", async (req, res) => {
  try {
    const { block, items } = req.body || {}; // items: [{ id, picks: [idx] }]
    if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: "Aucune réponse" });

    const ids = items.map((it) => it.id);
    const { rows: qrows } = await pool.query("SELECT * FROM qcm WHERE id = ANY($1)", [ids]);
    const byId = Object.fromEntries(qrows.map((q) => [q.id, q]));

    const corrections = [];
    let score = 0;
    const wrongByBlock = {};
    for (const it of items) {
      const row = byId[it.id];
      if (!row) continue;
      const answer = JSON.parse(row.answer_json);
      const picks = Array.isArray(it.picks) ? it.picks : [];
      const ok = [...picks].sort().join(",") === [...answer].sort().join(",");
      if (ok) score++;
      else wrongByBlock[row.block] = (wrongByBlock[row.block] || 0) + 1;
      corrections.push({
        id: row.id, q: row.question, block: row.block, type: row.type,
        answer, picks, ok, why: row.why,
        choices: JSON.parse(row.choices_json || "[]"),
        props: JSON.parse(row.props_json || "[]"),
        combos: JSON.parse(row.combos_json || "[]"),
      });
    }

    const total = corrections.length;
    const uid = req.user.id;
    await pool.query(
      "INSERT INTO attempts (user_id, block, score, total, wrong_json, created_at) VALUES ($1,$2,$3,$4,$5,$6)",
      [uid, block || "all", score, total, JSON.stringify(Object.keys(wrongByBlock)), Date.now()]
    );

    await pool.query("INSERT INTO progress (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING", [uid]);
    const { rows: prows } = await pool.query("SELECT weak_json FROM progress WHERE user_id = $1", [uid]);
    const weak = JSON.parse(prows[0].weak_json || "{}");
    for (const [b, n] of Object.entries(wrongByBlock)) weak[b] = (weak[b] || 0) + n;
    await pool.query("UPDATE progress SET weak_json = $1 WHERE user_id = $2", [JSON.stringify(weak), uid]);

    res.json({ score, total, corrections, wrongByBlock, weak });
  } catch (e) { console.error(e); res.status(500).json({ error: "Erreur serveur" }); }
});

export default r;
