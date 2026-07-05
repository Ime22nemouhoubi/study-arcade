import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { api, getToken, setToken } from "./api.js";
import Auth from "./Auth.jsx";
import {
  DAY, startOfDay, fmtDate, daysBetween, PHASE_META,
  buildPlan, flattenModules, ANNALES, RESOURCES, BOOKS,
  GUIDE_PDF, MODULE_SOURCES, METHOD_PRINCIPLES, DOSSIERS, BLOCK_MATERIAL,
} from "./lib.js";

/* ---------- tiny UI atoms ---------- */
function Ring({ pct, size = 64, stroke = 6, color = "var(--signal)" }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} className="ring">
      <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,.09)" strokeWidth={stroke} fill="none" />
      <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none"
        strokeDasharray={c} strokeDashoffset={c * (1 - (pct || 0))} strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="52%" textAnchor="middle" dominantBaseline="middle" className="ring-t">{Math.round((pct || 0) * 100)}</text>
    </svg>
  );
}
function Ecg() {
  return (
    <svg className="ecg" viewBox="0 0 1200 80" preserveAspectRatio="none" aria-hidden="true">
      <path d="M0,40 L200,40 L215,40 L222,20 L230,60 L238,10 L246,52 L255,40 L430,40 L445,40 L452,20 L460,60 L468,10 L476,52 L485,40 L660,40 L675,40 L682,20 L690,60 L698,10 L706,52 L715,40 L890,40 L905,40 L912,20 L920,60 L928,10 L936,52 L945,40 L1200,40" />
    </svg>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [blocks, setBlocks] = useState([]);
  const [tab, setTab] = useState("dash");
  const [state, setState] = useState(null); // {settings, checklist, weak, dayDone, notes, qcmHist}
  const [now, setNow] = useState(Date.now());

  /* auth bootstrap */
  useEffect(() => {
    (async () => {
      if (!getToken()) { setChecking(false); return; }
      try { const { user } = await api.me(); setUser(user); }
      catch { setToken(null); }
      finally { setChecking(false); }
    })();
  }, []);

  /* load curriculum + state once authed */
  useEffect(() => {
    if (!user) return;
    (async () => {
      const [{ blocks }, st] = await Promise.all([api.curriculum(), api.state()]);
      setBlocks(blocks);
      setState(st);
    })();
  }, [user]);

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  const logout = () => { setToken(null); setUser(null); setState(null); };

  if (checking) return <div className="wrap"><div className="boot">Initialisation du poste…</div></div>;
  if (!user) return <Auth onAuthed={setUser} />;
  if (!state || !blocks.length) return <div className="wrap"><div className="boot">Chargement des données…</div></div>;

  return <Shell user={user} blocks={blocks} state={state} setState={setState}
    tab={tab} setTab={setTab} now={now} logout={logout} />;
}

/* ================= SHELL (authed) ================= */
function Shell({ user, blocks, state, setState, tab, setTab, now, logout }) {
  const MODULES = useMemo(() => flattenModules(blocks), [blocks]);
  const plan = useMemo(() => buildPlan(state.settings.startDate, state.settings.examDate, blocks), [state.settings, blocks]);

  const elapsed = plan.total - daysBetween(Date.now(), state.settings.examDate);
  const today = plan.days[Math.max(0, Math.min(plan.days.length - 1, daysBetween(state.settings.startDate, Date.now())))];
  const remaining = daysBetween(Date.now(), state.settings.examDate);

  /* patch + persist helpers (debounced writes for blob fields) */
  const timers = useRef({});
  const persist = useCallback((key, fn, value) => {
    clearTimeout(timers.current[key]);
    timers.current[key] = setTimeout(() => fn(value).catch(() => {}), 450);
  }, []);
  const patch = (obj) => setState((s) => ({ ...s, ...obj }));

  const setChecklist = (checklist) => { patch({ checklist }); persist("cl", api.saveChecklist, checklist); };
  const setWeak = (weak) => { patch({ weak }); persist("wk", api.saveWeak, weak); };
  const setDayDone = (dayDone) => { patch({ dayDone }); persist("dd", api.saveDayDone, dayDone); };
  const setQcmHist = (qcmHist) => patch({ qcmHist });

  const blockName = (id) => blocks.find((b) => b.id === id)?.name || id;
  const weakList = useMemo(() =>
    Object.entries(state.weak).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1])
      .map(([id, n]) => ({ id, name: blockName(id), n })), [state.weak, blocks]);

  const stats = useMemo(() => {
    const totalMod = MODULES.length;
    const read = MODULES.filter((m) => state.checklist[m.name]?.read).length;
    const mastered = MODULES.filter((m) => state.checklist[m.name]?.mastered).length;
    const avg = state.qcmHist.length ? Math.round(state.qcmHist.reduce((s, h) => s + h.score / h.total, 0) / state.qcmHist.length * 100) : 0;
    let streak = 0;
    for (let k = 0; k < 60; k++) {
      const key = new Date(+startOfDay(Date.now()) - k * DAY).toISOString().slice(0, 10);
      const any = Object.keys(state.dayDone).some((x) => x.startsWith(key) && state.dayDone[x]);
      if (any) streak++; else if (k === 0) continue; else break;
    }
    return { totalMod, read, mastered, avg, streak };
  }, [state, MODULES]);

  const ms = Math.max(0, +startOfDay(state.settings.examDate) + DAY - now);
  const hh = Math.floor((ms % DAY) / 3600000), mm = Math.floor((ms % 3600000) / 60000), ss = Math.floor((ms % 60000) / 1000);
  const progressPct = Math.min(1, Math.max(0, elapsed / plan.total));
  const todayKey = new Date().toISOString().slice(0, 10);
  const doneCount = today ? today.tasks.filter((_, i) => state.dayDone[`${todayKey}:${i}`]).length : 0;
  const toggleTask = (i) => { const key = `${todayKey}:${i}`; setDayDone({ ...state.dayDone, [key]: !state.dayDone[key] }); };

  return (
    <div className="wrap">
      <header className="top">
        <div className="brand"><span className="dot" /><span className="bt">RÉSIDANAT</span><span className="bt2">// LOCKDOWN</span></div>
        <nav className="tabs">
          {[["dash", "Poste"], ["plan", "Plan"], ["qcm", "QCM"], ["library", "Bibliothèque"], ["check", "Modules"], ["notes", "Notes"], ["set", "Réglages"]]
            .map(([k, l]) => <button key={k} className={"tab" + (tab === k ? " on" : "")} onClick={() => setTab(k)}>{l}</button>)}
          <button className="tab logout" onClick={logout} title="Se déconnecter">⏻</button>
        </nav>
      </header>

      {tab === "dash" && (
        <main className="grid">
          <section className="panel hero">
            <div className="hero-head"><span className="eyebrow">Compte à rebours{user.name ? ` · ${user.name}` : ""}</span><span className="eyebrow r">{fmtDate(state.settings.examDate)}</span></div>
            <div className="count"><div className="cbig">{Math.max(0, remaining)}</div>
              <div className="cunit">jours<span>{String(hh).padStart(2, "0")}:{String(mm).padStart(2, "0")}:{String(ss).padStart(2, "0")} restant aujourd'hui</span></div></div>
            <Ecg />
            <div className="progline"><div className="progfill" style={{ width: `${progressPct * 100}%` }} /></div>
            <div className="progmeta"><span>Jour {Math.max(1, elapsed + 1)} / {plan.total}</span><span>{PHASE_META[today?.phase]?.label}</span></div>
          </section>

          <section className="panel vitals">
            <span className="ptitle">Constantes du jour</span>
            <div className="vrow">
              <div className="vitem"><Ring pct={today ? doneCount / today.tasks.length : 0} /><span className="vlab">Objectifs<br />du jour</span></div>
              <div className="vitem"><Ring pct={stats.read / stats.totalMod} color="var(--good)" /><span className="vlab">Modules<br />parcourus</span></div>
              <div className="vitem"><Ring pct={stats.avg / 100} color="var(--amber)" /><span className="vlab">Moyenne<br />QCM</span></div>
            </div>
            <div className="streak"><span className="flame">▲</span> Série : <b>{stats.streak}</b> jour{stats.streak > 1 ? "s" : ""} d'affilée</div>
          </section>

          <section className="panel today">
            <div className="ph-tag">{PHASE_META[today?.phase]?.label} · <span>{today?.blockName}</span></div>
            <span className="ptitle">Objectifs d'aujourd'hui</span>
            <ul className="tasks">
              {today?.tasks.map((t, i) => {
                const on = state.dayDone[`${todayKey}:${i}`];
                return <li key={i} className={on ? "on" : ""} onClick={() => toggleTask(i)}><span className="box">{on ? "✓" : ""}</span>{t}</li>;
              })}
            </ul>
            {today?.block && BLOCK_MATERIAL[today.block] && (
              <a className="daymat" href={BLOCK_MATERIAL[today.block].url} target="_blank" rel="noreferrer">
                <span className="daymat-ic">▤</span>
                <span className="daymat-tx"><b>Matériel du jour → {today.blockName}</b><span>{BLOCK_MATERIAL[today.block].label}</span></span>
                <span className="daymat-go">Ouvrir ↗</span>
              </a>
            )}
            {weakList.length > 0 && (
              <div className="weakbox"><span className="wtitle">⚠ Zones faibles injectées (issues des QCM)</span>
                <div className="wchips">{weakList.slice(0, 5).map((w) => <span key={w.id} className="wchip">{w.name} · {w.n}</span>)}</div></div>
            )}
          </section>

          <section className="panel next">
            <span className="ptitle">Aperçu des 5 prochains jours</span>
            <div className="nlist">
              {plan.days.slice(Math.max(0, elapsed + 1), elapsed + 6).map((d) => (
                <div key={d.d} className="nrow"><span className="nd">{new Date(d.date).toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "2-digit" })}</span>
                  <span className={"nph p" + d.phase}>P{d.phase}</span><span className="nb">{d.blockName}</span></div>
              ))}
            </div>
          </section>
        </main>
      )}

      {tab === "plan" && (
        <main className="col">
          <div className="phead"><h2>Plan de révision · 3 phases</h2>
            <p>Méthode des lauréats : réviser <b>par appareil</b>, refaire la <b>science fondamentale</b> avant sa clinique, puis <b>QCM</b>. Biologie gardée pour la fin (elle s'oublie vite). Les zones faibles détectées aux QCM remontent automatiquement.</p></div>
          {[1, 2, 3].map((ph) => {
            const seg = plan.days.filter((d) => d.phase === ph);
            const from = seg[0], to = seg[seg.length - 1];
            return (
              <section key={ph} className="panel phase">
                <div className="phase-h"><span className={"pbadge p" + ph}>Phase {ph}</span>
                  <div><b>{PHASE_META[ph].label.split("· ")[1]}</b><span className="prange">{fmtDate(from.date)} → {fmtDate(to.date)} · {seg.length} j</span></div></div>
                <p className="pnote">{PHASE_META[ph].note}</p>
                <div className="blockgrid">
                  {ph === 3
                    ? ["Sciences fondamentales", "Pathologie médico-chirurgicale", "Dossiers cliniques"].map((s) => <div key={s} className="bcard sim"><span className="bt3">Simulation</span>{s}</div>)
                    : [...blocks].sort((a, b) => a.tier - b.tier).map((b) =>
                      <div key={b.id} className={"bcard t" + b.tier}><span className="bt3">Tier {b.tier} · {b.fond.length + b.clin.length} modules</span><b>{b.name}</b>
                        <span className="bmods">{[...b.fond, ...b.clin].slice(0, 4).join(" · ")}{(b.fond.length + b.clin.length) > 4 ? "…" : ""}</span></div>)}
                </div>
              </section>
            );
          })}
        </main>
      )}

      {tab === "qcm" && <QcmView blocks={blocks} state={state} setWeak={setWeak} setChecklist={setChecklist} setQcmHist={setQcmHist} MODULES={MODULES} />}

      {tab === "library" && (
        <main className="col">
          <div className="phead"><h2>Bibliothèque</h2><p>Annales officielles de Blida (2023 & 2024, corrigés surlignés), guide de révision, cours d'externat sur Drive, et — pour chaque module — les sources de cours et de questions recommandées. Les liens Drive sont ceux du guide ; dépose-y tes propres PDF au besoin.</p></div>

          <section className="panel"><span className="ptitle">Annales officielles — Université Blida 1</span>
            <div className="antable">{ANNALES.map((a) => (<div key={a.year} className="anrow">
              <div className="anyear">{a.year}<span>{a.fac}</span></div>
              <div className="anparts">
                {a.parts.map((p) => <span key={p} className="anchip">{p}</span>)}
                {a.pdf && <a className="anpdf" href={a.pdf} target="_blank" rel="noreferrer">Ouvrir le sujet corrigé (PDF) ↗</a>}
              </div></div>))}</div>
            <a className="btn ghost" href={GUIDE_PDF} target="_blank" rel="noreferrer">Ouvrir le guide de révision (PDF) ↗</a></section>

          <section className="panel"><span className="ptitle">Cours, Drive & ressources officielles</span>
            <div className="reslist">{RESOURCES.map((r) => (<a key={r.name} className="rescard" href={r.url} target="_blank" rel="noreferrer">
              <span className="restag">{r.tag}</span><b>{r.name}</b><span className="resnote">{r.note}</span><span className="resgo">Ouvrir ↗</span></a>))}</div></section>

          <section className="panel"><span className="ptitle">Par module — cours & questions (d'après le guide)</span>
            <div className="msrc">{blocks.map((b) => { const s = MODULE_SOURCES[b.id]; if (!s) return null; return (
              <div key={b.id} className="msrc-row">
                <div className="msrc-h"><span className={"pbadge p" + b.tier}>T{b.tier}</span><b>{b.name}</b></div>
                <div className="msrc-c"><span className="msrc-lab">Cours</span><p>{s.cours}</p></div>
                <div className="msrc-c"><span className="msrc-lab">Questions</span><p>{s.questions}</p></div>
              </div>); })}</div></section>

          <section className="panel"><span className="ptitle">Méthode — 11 principes du guide</span>
            <ol className="method">{METHOD_PRINCIPLES.map((m, i) => <li key={i}>{m}</li>)}</ol></section>

          <section className="panel"><span className="ptitle">Dossiers cliniques tombés (à travailler en algorithmes)</span>
            <ul className="dossiers">{DOSSIERS.map((d, i) => <li key={i}>{d}</li>)}</ul></section>

          <section className="panel"><span className="ptitle">Livres — quoi, pourquoi, pour quel module</span>
            <div className="booklist">{BOOKS.map((b) => (<div key={b.title} className="bookcard">
              <div className="bookh"><b>{b.title}</b><span className="bookbest">{b.best}</span></div>
              <span className="bookscope">{b.scope}</span><span className="bookwhy">{b.why}</span></div>))}</div></section>
        </main>
      )}

      {tab === "check" && <ChecklistView blocks={blocks} MODULES={MODULES} checklist={state.checklist} setChecklist={setChecklist} />}

      {tab === "notes" && <NotesView blocks={blocks} notes={state.notes} setState={setState} />}

      {tab === "set" && (
        <main className="col">
          <div className="phead"><h2>Réglages</h2><p>Fixe ta date d'examen (session d'Alger 2026 : 8 octobre) et ton point de départ. Le plan se régénère automatiquement.</p></div>
          <SettingsForm settings={state.settings} setState={setState} plan={plan} />
        </main>
      )}

      <footer className="foot">Données du concours d'après sources publiques 2025-26 (residanat-dz, ency-education, programme FAC Alger). QCM d'entraînement originaux. Vérifie toujours la date & le format auprès de ta faculté.</footer>
    </div>
  );
}

/* ================= QCM ================= */
function QcmView({ blocks, state, setWeak, setChecklist, setQcmHist, MODULES }) {
  const [counts, setCounts] = useState({ counts: {}, sections: {}, total: 0 });
  const [blockId, setBlockId] = useState("all");
  const [running, setRunning] = useState(null); // {items, i, picks, done, result, mode, deadline}
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const blockName = (id) => blocks.find((b) => b.id === id)?.name || id;

  useEffect(() => { api.qcmBlocks().then(setCounts).catch(() => {}); }, []);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  const begin = (items, mode, durationMin) => {
    const shuffled = mode === "sim" ? items : [...items].sort(() => Math.random() - 0.5);
    setRunning({
      items: shuffled, i: 0, picks: shuffled.map(() => []), done: false, mode,
      deadline: durationMin ? Date.now() + durationMin * 60000 : null,
    });
  };

  const startDrill = async () => {
    setBusy(true);
    try { begin(await api.qcmQuestions(blockId), "drill", null); }
    finally { setBusy(false); }
  };
  const startSim = async () => {
    setBusy(true);
    try { const { items, durationMin } = await api.qcmSimulation(); begin(items, "sim", durationMin); }
    finally { setBusy(false); }
  };

  // COMBO: single-select among combos; QCS: single; (multi kept for safety)
  const togglePick = (ci) => setRunning((r) => {
    const cur = r.items[r.i]; const picks = r.picks.map((a) => [...a]); const arr = picks[r.i];
    if (cur.type === "COMBO" || cur.type === "QCS") picks[r.i] = arr.includes(ci) ? [] : [ci];
    else picks[r.i] = arr.includes(ci) ? arr.filter((x) => x !== ci) : [...arr, ci];
    return { ...r, picks };
  });

  const finish = async () => {
    setBusy(true);
    try {
      const label = running.mode === "sim" ? "sim" : blockId;
      const payload = { block: label, items: running.items.map((it, k) => ({ id: it.id, picks: running.picks[k] })) };
      const result = await api.qcmSubmit(payload);
      setRunning((r) => ({ ...r, done: true, result }));
      setWeak(result.weak);
      const touched = new Set(running.items.map((it) => it.block));
      const nc = { ...state.checklist };
      MODULES.filter((m) => touched.has(m.block)).forEach((m) => nc[m.name] = { ...(nc[m.name] || {}), qcm: true });
      setChecklist(nc);
      setQcmHist([{ id: Date.now(), block: label, score: result.score, total: result.total, wrong: Object.keys(result.wrongByBlock), date: Date.now() }, ...state.qcmHist].slice(0, 40));
    } catch (e) { alert(e.message); } finally { setBusy(false); }
  };

  // auto-submit when the simulation timer hits zero
  useEffect(() => {
    if (running && !running.done && running.deadline && now >= running.deadline) finish();
  }, [now, running]);

  const timeLeft = running?.deadline ? Math.max(0, running.deadline - now) : null;
  const fmtClock = (ms) => { const s = Math.floor(ms / 1000); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60; return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`; };

  const answeredCount = running ? running.picks.filter((p) => p.length).length : 0;

  return (
    <main className="col">
      <div className="phead"><h2>QCM — test noté & feedback</h2><p>Correction côté serveur, commentée ; les blocs ratés remontent en <b>zones faibles</b> dans le plan. Banque : <b>{counts.total}</b> questions ({counts.sections?.fondamentale || 0} fondamentale · {counts.sections?.pathologie || 0} pathologie · {counts.sections?.clinique || 0} clinique), issues des annales Blida 2023-2024 + entraînement de même style.</p></div>

      {!running && (
        <>
          <section className="panel simcard">
            <div className="simcard-tx">
              <span className="restag">Mode concours</span>
              <b>Simulation Blida — 150 QCM · 4 h</b>
              <span className="resnote">Même structure que le concours d'octobre : 50 sciences fondamentales + 50 pathologie + 50 cas cliniques, chronométré. Corrigé détaillé à la fin.</span>
            </div>
            <button className="btn go" onClick={startSim} disabled={busy}>{busy ? "…" : "Démarrer la simulation"}</button>
          </section>

          <section className="panel qstart">
            <span className="ptitle">Ou : entraînement ciblé par bloc</span>
            <div className="qpick">
              <button className={"qtag" + (blockId === "all" ? " on" : "")} onClick={() => setBlockId("all")}>Tous les blocs · {counts.total}</button>
              {blocks.filter((b) => counts.counts[b.id]).map((b) =>
                <button key={b.id} className={"qtag" + (blockId === b.id ? " on" : "")} onClick={() => setBlockId(b.id)}>{b.name} · {counts.counts[b.id]}</button>)}
            </div>
            <button className="btn" onClick={startDrill} disabled={busy}>Lancer l'entraînement</button>
            {state.qcmHist.length > 0 && (
              <div className="qhist"><span className="ptitle">Historique</span>
                {state.qcmHist.slice(0, 8).map((h, i) => (
                  <div key={i} className="qhrow"><span>{new Date(h.date).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                    <span className="qhblock">{h.block === "all" ? "Tous" : h.block === "sim" ? "Simulation 150" : blockName(h.block)}</span>
                    <span className={"qhscore " + (h.score / h.total >= 0.6 ? "ok" : "bad")}>{h.score}/{h.total}</span></div>))}
              </div>
            )}
          </section>
        </>
      )}

      {running && !running.done && (() => {
        const it = running.items[running.i], picks = running.picks[running.i];
        const isCombo = it.type === "COMBO";
        return (
          <section className="panel qrun">
            <div className="qtop">
              <span className="qcount">Question {running.i + 1}/{running.items.length}</span>
              <span className={"qtype " + it.type}>{it.type}</span>
              {it.source && <span className={"qsrc" + (it.source.startsWith("Annale") ? " off" : "")}>{it.source}</span>}
              <span className="qblock">{blockName(it.block)}</span>
              {timeLeft != null && <span className={"qtimer" + (timeLeft < 300000 ? " low" : "")}>{fmtClock(timeLeft)}</span>}
            </div>
            <p className="qq">{it.q}</p>
            {isCombo ? (
              <>
                <ol className="qprops">{it.props.map((p, pi) => <li key={pi}><span className="qpn">{pi + 1}</span>{p}</li>)}</ol>
                <div className="qchoices">{it.combos.map((c, ci) => (
                  <button key={ci} className={"qchoice" + (picks.includes(ci) ? " sel" : "")} onClick={() => togglePick(ci)}>
                    <span className="qletter">{String.fromCharCode(65 + ci)}</span>{c}</button>))}</div>
              </>
            ) : (
              <div className="qchoices">{it.choices.map((c, ci) => (
                <button key={ci} className={"qchoice" + (picks.includes(ci) ? " sel" : "")} onClick={() => togglePick(ci)}>
                  <span className="qletter">{String.fromCharCode(65 + ci)}</span>{c}</button>))}</div>
            )}
            <div className="qnav">
              <button className="btn ghost" disabled={running.i === 0} onClick={() => setRunning((r) => ({ ...r, i: r.i - 1 }))}>Précédent</button>
              <span className="qprog">{answeredCount}/{running.items.length} répondues</span>
              {running.i < running.items.length - 1
                ? <button className="btn" onClick={() => setRunning((r) => ({ ...r, i: r.i + 1 }))}>Suivant</button>
                : <button className="btn go" onClick={finish} disabled={busy}>{busy ? "…" : "Terminer & corriger"}</button>}
            </div>
          </section>
        );
      })()}

      {running && running.done && (() => {
        const res = running.result, pct = res.score / res.total;
        const letters = (arr) => arr.map((x) => String.fromCharCode(65 + x)).join(", ");
        return (
          <section className="panel qres">
            <div className="qscore"><Ring pct={pct} size={96} stroke={8} color={pct >= 0.6 ? "var(--good)" : "var(--amber)"} />
              <div><b className="qsn">{res.score}/{res.total}</b>
                <span className="qsmsg">{running.mode === "sim" ? "Simulation terminée. " : ""}{pct >= 0.75 ? "Solide. Verrouille et passe au bloc suivant." : pct >= 0.5 ? "Correct — revois les items ratés ci-dessous." : "À retravailler : ces blocs passent en priorité dans le plan."}</span></div></div>
            {Object.keys(res.wrongByBlock).length > 0 && (
              <div className="qimprove"><span className="wtitle">À améliorer → ajouté au plan</span>
                <div className="wchips">{Object.entries(res.wrongByBlock).map(([b, n]) => <span key={b} className="wchip">{blockName(b)} · {n} erreur{n > 1 ? "s" : ""}</span>)}</div></div>)}
            <div className="qcorr">{res.corrections.map((c, k) => (
              <div key={k} className={"qcitem " + (c.ok ? "ok" : "bad")}>
                <div className="qch"><span className="qci">{c.ok ? "✓" : "✗"}</span><span>{c.q}</span></div>
                {c.type === "COMBO" && c.props?.length > 0 && (
                  <ol className="qprops sm">{c.props.map((p, pi) => <li key={pi}><span className="qpn">{pi + 1}</span>{p}</li>)}</ol>)}
                <div className="qcans">Réponse : <b>{letters(c.answer)}</b>
                  {!c.ok && <span className="qcyours"> · toi : {c.picks.length ? letters(c.picks) : "—"}</span>}</div>
                <p className="qwhy">{c.why}</p></div>))}</div>
            <div className="qnav"><button className="btn" onClick={() => setRunning(null)}>Retour</button></div>
          </section>
        );
      })()}
    </main>
  );
}

/* ================= CHECKLIST ================= */
function ChecklistView({ blocks, MODULES, checklist, setChecklist }) {
  return (
    <main className="col">
      <div className="phead"><h2>Suivi des modules</h2><p>Coche <b>Lu</b> (1re passe faite), <b>QCM</b> (entraîné dessus), <b>Maîtrisé</b> (validé). La progression alimente le tableau de bord.</p></div>
      {blocks.map((b) => {
        const mods = MODULES.filter((m) => m.block === b.id);
        return (
          <section key={b.id} className="panel">
            <div className="ck-h"><span className={"pbadge p" + b.tier}>Tier {b.tier}</span><b>{b.name}</b></div>
            <div className="cktable">
              <div className="ckhead"><span>Module</span><span>Lu</span><span>QCM</span><span>Maîtrisé</span></div>
              {mods.map((m) => {
                const c = checklist[m.name] || {};
                const set = (f) => setChecklist({ ...checklist, [m.name]: { ...c, [f]: !c[f] } });
                return (
                  <div key={m.name} className={"ckrow" + (c.mastered ? " done" : "")}>
                    <span className="ckname"><i className={"kind " + m.kind}>{m.kind === "fond" ? "F" : "C"}</i>{m.name}</span>
                    {["read", "qcm", "mastered"].map((f) => <button key={f} className={"ckbox" + (c[f] ? " on" : "")} onClick={() => set(f)}>{c[f] ? "✓" : ""}</button>)}
                  </div>);
              })}
            </div>
          </section>
        );
      })}
    </main>
  );
}

/* ================= NOTES ================= */
function NotesView({ blocks, notes, setState }) {
  const [draft, setDraft] = useState({ block: blocks[0]?.id || "cardio", title: "", body: "" });
  const blockName = (id) => blocks.find((b) => b.id === id)?.name || id;

  const add = async () => {
    if (!draft.title.trim()) return;
    const note = await api.addNote(draft);
    setState((s) => ({ ...s, notes: [note, ...s.notes] }));
    setDraft({ block: draft.block, title: "", body: "" });
  };
  const del = async (id) => { await api.delNote(id); setState((s) => ({ ...s, notes: s.notes.filter((n) => n.id !== id) })); };

  return (
    <main className="col">
      <div className="phead"><h2>Notes importantes</h2><p>Pièges, questions fétiches du jury, seuils à ne pas oublier. Organisées par bloc.</p></div>
      <section className="panel noteform">
        <div className="nfrow">
          <select value={draft.block} onChange={(e) => setDraft({ ...draft, block: e.target.value })}>
            {blocks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
          <input placeholder="Titre (ex. Critères de Light)" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
        </div>
        <textarea placeholder="Le contenu de ta note…" value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
        <button className="btn" onClick={add}>Ajouter la note</button>
      </section>
      <div className="notegrid">
        {notes.length === 0 && <div className="empty">Aucune note pour l'instant. La première zone faible mérite sûrement une fiche.</div>}
        {notes.map((n) => (
          <div key={n.id} className="notecard">
            <div className="noteh"><span className="notetag">{blockName(n.block)}</span><button className="notedel" onClick={() => del(n.id)}>✕</button></div>
            <b>{n.title}</b><p>{n.body}</p></div>))}
      </div>
    </main>
  );
}

/* ================= SETTINGS ================= */
function SettingsForm({ settings, setState, plan }) {
  const [local, setLocal] = useState(settings);
  const save = async (patch) => {
    const next = { ...local, ...patch }; setLocal(next);
    const { settings: saved } = await api.saveSettings(patch);
    setState((s) => ({ ...s, settings: saved }));
  };
  return (
    <section className="panel setform">
      <label>Prénom (facultatif)
        <input value={local.name || ""} onChange={(e) => setLocal({ ...local, name: e.target.value })} onBlur={(e) => save({ name: e.target.value })} placeholder="Ton prénom" /></label>
      <label>Date de l'examen
        <input type="date" value={new Date(local.examDate).toISOString().slice(0, 10)} onChange={(e) => save({ examDate: +startOfDay(e.target.value) })} /></label>
      <label>Début de la préparation
        <input type="date" value={new Date(local.startDate).toISOString().slice(0, 10)} onChange={(e) => save({ startDate: +startOfDay(e.target.value) })} /></label>
      <div className="setinfo">Durée totale : <b>{plan.total} jours</b> · Phase 1 ≈ {plan.p1End} j · Phase 2 ≈ {plan.p2End - plan.p1End} j · Phase 3 ≈ {plan.total - plan.p2End} j</div>
    </section>
  );
}
