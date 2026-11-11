// Onglet « Modèle » : converser avec l'esprit du Brain.
// - questions de navigation (« c'est où… ») → réponse locale instantanée + vol de caméra jusqu'au neurone ;
// - autres questions → Claude (âme + paquet de contexte), réponse affichée au fil de l'eau.
import { render } from "./markdown.js";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const SUGGESTIONS = [
  "C'est où le neurone de la trésorerie ?",
  "Résume-moi le domaine Business en 5 points",
  "Qu'est-ce qui a changé dans le cerveau aujourd'hui ?",
  "Quels sont nos principes pour que l'IA ne se perde pas ?",
  "Emmène-moi à mes objectifs",
];

export function createModel({ B, resolve, openRel, flyTo, toast }) {
  const state = { messages: [], sessionId: null, busy: false, root: null };
  let seq = 0;

  B.onChatDelta(({ id, text }) => {
    const m = state.messages.find((x) => x.id === id);
    if (!m) return;
    m.text += text; m.pending = false;
    paintMessage(m);
  });

  function paintMessage(m) {
    const el = state.root?.querySelector(`[data-msg="${m.id}"] .bubble`);
    if (!el) return draw();
    el.innerHTML = m.role === "user" ? esc(m.text) : m.pending ? `<span class="typing"><i></i><i></i><i></i></span>` : render(m.text, resolve);
    el.closest(".msgs-scroll")?.scrollTo({ top: 1e9, behavior: "smooth" });
  }

  function msgHtml(m) {
    const body = m.role === "user" ? esc(m.text) : m.pending ? `<span class="typing"><i></i><i></i><i></i></span>` : render(m.text, resolve);
    const foot = m.role === "assistant" && !m.pending
      ? `<div class="msg-foot">${m.target ? `<button class="go" data-go="${esc(m.target)}">◉ Aller au neurone</button>` : ""}${(m.sources || []).slice(0, 6).map((s) => `<a class="src" data-rel="${esc(s.rel)}">${esc(s.title)}</a>`).join("")}${m.ms ? `<span class="ms">${m.local ? "local · " : "Claude · "}${(m.ms / 1000).toFixed(1)} s</span>` : ""}</div>`
      : "";
    return `<div class="msg ${m.role}" data-msg="${m.id}"><div class="bubble">${body}</div>${foot}</div>`;
  }

  function draw() {
    if (!state.root) return;
    state.root.innerHTML = `<div class="model">
      <header class="model-head"><div><h1>Modèle</h1><p>L'esprit du Brain. Il connaît vos régions, vos notes, vos flux, et vous emmène où vous voulez.</p></div>
        <div class="model-tools"><div class="seg" id="mEngine" title="Moteur de réponse"><button data-e="claude" class="${state.engine === "claude" ? "on" : ""}">Claude</button><button data-e="local" class="${state.engine === "local" ? "on" : ""}">Local · hors ligne</button></div>
        <button class="ghost" id="mNew" ${state.messages.length ? "" : "hidden"}>Nouvelle conversation</button></div></header>
      <div class="msgs-scroll"><div class="msgs">${state.messages.length ? state.messages.map(msgHtml).join("") : `<div class="model-empty"><div class="orb"></div><p>Pose une question, ou demande « c'est où… » pour voler jusqu'à un neurone.</p><div class="chips">${SUGGESTIONS.map((s) => `<button class="chip-btn" data-sugg="${esc(s)}">${esc(s)}</button>`).join("")}</div></div>`}</div></div>
      <form class="composer glass2" id="mForm"><textarea id="mInput" rows="1" placeholder="Demande au Brain…  (Entrée pour envoyer, Maj+Entrée pour aller à la ligne)"></textarea><button class="primary" id="mSend" ${state.busy ? "disabled" : ""}>${state.busy ? "…" : "Envoyer"}</button></form>
    </div>`;
    state.root.querySelector(".msgs-scroll").scrollTop = 1e9;
    const ta = state.root.querySelector("#mInput");
    ta.addEventListener("input", () => { ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 180) + "px"; });
    ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(ta.value); } });
    ta.focus();
  }

  async function send(text) {
    text = text.trim();
    if (!text || state.busy) return;
    const user = { id: ++seq, role: "user", text };
    const bot = { id: ++seq, role: "assistant", text: "", pending: true };
    state.messages.push(user, bot);
    state.busy = true; draw();
    const t0 = performance.now();
    try {
      const r = await B.chat({ id: bot.id, text, sessionId: state.sessionId });
      bot.text = r.text || bot.text; bot.pending = false; bot.target = r.target; bot.sources = r.sources; bot.local = r.local; bot.ms = performance.now() - t0;
      if (r.sessionId) state.sessionId = r.sessionId;
      if (r.target) setTimeout(() => flyTo(r.target), r.local ? 350 : 900);
    } catch (e) {
      bot.pending = false; bot.text = `**Je n'ai pas pu répondre.** ${e.message}`;
    }
    state.busy = false; draw();
  }

  return {
    async mount(root) {
      state.root = root;
      state.engine = await B.chatEngine();
      draw();
      root.onclick = (e) => {
        const s = e.target.closest("[data-sugg]"); if (s) return send(s.dataset.sugg);
        const g = e.target.closest("[data-go]"); if (g) return flyTo(g.dataset.go);
        const r = e.target.closest("[data-rel]"); if (r) return openRel(r.dataset.rel);
        const w = e.target.closest("a.wl"); if (w) { const rel = resolve(w.dataset.link); if (rel) openRel(rel); else toast("Cette note n'existe pas encore."); return; }
        if (e.target.closest("#mNew")) { state.messages = []; state.sessionId = null; draw(); }
        const eng = e.target.closest("[data-e]");
        if (eng) B.chatEngine(eng.dataset.e).then((v) => { state.engine = v; draw(); toast(v === "local" ? "Modèle local (Qwen3 0,6B), 100 % hors ligne" : "Claude (abonnement)"); });
      };
      root.onsubmit = (e) => { e.preventDefault(); send(root.querySelector("#mInput").value); };
    },
    send,
  };
}
