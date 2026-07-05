const TOKEN_KEY = "residanat_token";
export const getToken = () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } };
export const setToken = (t) => { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch {} };

async function req(method, path, body) {
  const headers = { "Content-Type": "application/json" };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`/api${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
  return data;
}

export const api = {
  register: (b) => req("POST", "/auth/register", b),
  login: (b) => req("POST", "/auth/login", b),
  me: () => req("GET", "/auth/me"),
  curriculum: () => req("GET", "/curriculum"),
  state: () => req("GET", "/state"),
  saveSettings: (b) => req("PUT", "/settings", b),
  saveChecklist: (checklist) => req("PUT", "/checklist", { checklist }),
  saveWeak: (weak) => req("PUT", "/weak", { weak }),
  saveDayDone: (dayDone) => req("PUT", "/daydone", { dayDone }),
  addNote: (b) => req("POST", "/notes", b),
  delNote: (id) => req("DELETE", `/notes/${id}`),
  qcmBlocks: () => req("GET", "/qcm/blocks"),
  qcmQuestions: (block) => req("GET", `/qcm?block=${encodeURIComponent(block)}`),
  qcmSimulation: () => req("GET", "/qcm/simulation"),
  qcmSubmit: (b) => req("POST", "/qcm/submit", b),
};
