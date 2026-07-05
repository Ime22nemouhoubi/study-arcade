import express from "express";
import cors from "cors";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { init, loadBlocks } from "./db.js";
import authRoutes from "./routes/auth.js";
import stateRoutes from "./routes/state.js";
import qcmRoutes from "./routes/qcm.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// Create schema, run migrations, and seed the QCM bank before serving.
await init();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => res.json({ ok: true, time: Date.now() }));
app.get("/api/curriculum", (_req, res) => res.json({ blocks: loadBlocks() }));
app.use("/api/auth", authRoutes);
app.use("/api", stateRoutes);
app.use("/api/qcm", qcmRoutes);

// Serve built frontend (client/dist) in production
const clientDist = path.join(__dirname, "..", "client", "dist");
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

// Only start the listener when run directly (not when imported by tests)
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  app.listen(PORT, () => console.log(`Résidanat-Lockdown en écoute sur :${PORT}`));
}

export default app;
