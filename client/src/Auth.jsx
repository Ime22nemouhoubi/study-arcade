import React, { useState } from "react";
import { api, setToken } from "./api.js";

export default function Auth({ onAuthed }) {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ email: "", password: "", name: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setErr(""); setBusy(true);
    try {
      const fn = mode === "login" ? api.login : api.register;
      const { token, user } = await fn(form);
      setToken(token);
      onAuthed(user);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-brand"><span className="dot" /><b>RÉSIDANAT</b><span className="bt2">// LOCKDOWN</span></div>
        <svg className="ecg auth-ecg" viewBox="0 0 400 40" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0,20 L120,20 L128,10 L134,30 L140,4 L146,26 L152,20 L280,20 L288,10 L294,30 L300,4 L306,26 L312,20 L400,20" />
        </svg>
        <h1>{mode === "login" ? "Reprendre la préparation" : "Créer ton poste"}</h1>
        <p className="auth-sub">Concours d'accès au résidanat — session d'octobre. Ta progression est sauvegardée sur ton compte.</p>

        {mode === "register" && (
          <label>Prénom
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ton prénom" />
          </label>
        )}
        <label>Email
          <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="toi@exemple.dz" />
        </label>
        <label>Mot de passe
          <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
            placeholder="≥ 6 caractères" onKeyDown={(e) => e.key === "Enter" && submit()} />
        </label>

        {err && <div className="auth-err">{err}</div>}
        <button className="btn" onClick={submit} disabled={busy}>{busy ? "…" : mode === "login" ? "Se connecter" : "Commencer"}</button>
        <button className="auth-switch" onClick={() => { setErr(""); setMode(mode === "login" ? "register" : "login"); }}>
          {mode === "login" ? "Pas de compte ? En créer un" : "Déjà un compte ? Se connecter"}
        </button>
      </div>
    </div>
  );
}
