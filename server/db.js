import pg from "pg";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("⚠  DATABASE_URL is not set. Create a Neon database and set DATABASE_URL (see README).");
}

// Neon (and most hosted Postgres) require SSL; local dev over localhost does not.
export const pool = new Pool({
  connectionString,
  ssl: connectionString && !connectionString.includes("localhost") ? { rejectUnauthorized: false } : false,
});

// Create schema (idempotent) then seed the QCM bank. Called once on boot.
export async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT DEFAULT '',
      exam_date BIGINT,
      start_date BIGINT,
      created_at BIGINT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS qcm (
      id TEXT PRIMARY KEY,
      block TEXT NOT NULL,
      section TEXT NOT NULL DEFAULT 'fondamentale',
      source TEXT NOT NULL DEFAULT 'Entraînement',
      type TEXT NOT NULL,
      question TEXT NOT NULL,
      choices_json TEXT NOT NULL DEFAULT '[]',
      answer_json TEXT NOT NULL,
      props_json TEXT NOT NULL DEFAULT '[]',
      combos_json TEXT NOT NULL DEFAULT '[]',
      case_id TEXT,
      why TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS attempts (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      block TEXT NOT NULL,
      score INTEGER NOT NULL,
      total INTEGER NOT NULL,
      wrong_json TEXT NOT NULL,
      created_at BIGINT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS notes (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      block TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT DEFAULT '',
      created_at BIGINT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS progress (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      checklist_json TEXT DEFAULT '{}',
      weak_json TEXT DEFAULT '{}',
      daydone_json TEXT DEFAULT '{}'
    );
  `);

  // Migration: add columns that may be missing on databases created by an earlier version.
  await pool.query(`
    ALTER TABLE qcm ADD COLUMN IF NOT EXISTS section TEXT NOT NULL DEFAULT 'fondamentale';
    ALTER TABLE qcm ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'Entraînement';
    ALTER TABLE qcm ADD COLUMN IF NOT EXISTS props_json TEXT NOT NULL DEFAULT '[]';
    ALTER TABLE qcm ADD COLUMN IF NOT EXISTS combos_json TEXT NOT NULL DEFAULT '[]';
    ALTER TABLE qcm ADD COLUMN IF NOT EXISTS case_id TEXT;
    ALTER TABLE qcm ALTER COLUMN choices_json SET DEFAULT '[]';
  `);

  await seedQcm();
}

async function seedQcm() {
  const items = JSON.parse(fs.readFileSync(path.join(__dirname, "data", "qcm.json"), "utf8"));
  const { rows } = await pool.query("SELECT COUNT(*)::int AS n FROM qcm");
  // Re-seed if the table is empty OR if the bank size changed (e.g. after an update).
  if (rows[0].n === items.length) return;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM qcm");
    for (const r of items) {
      await client.query(
        `INSERT INTO qcm (id, block, section, source, type, question, choices_json, answer_json, props_json, combos_json, case_id, why)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          r.id, r.block, r.section || "fondamentale", r.source || "Entraînement", r.type, r.q,
          JSON.stringify(r.choices || []), JSON.stringify(r.answer),
          JSON.stringify(r.props || []), JSON.stringify(r.combos || []),
          r.caseId || null, r.why,
        ]
      );
    }
    await client.query("COMMIT");
    console.log(`Seeded ${items.length} QCM items`);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export function loadBlocks() {
  return JSON.parse(fs.readFileSync(path.join(__dirname, "data", "blocks.json"), "utf8")).blocks;
}
