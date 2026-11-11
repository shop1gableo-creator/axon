// Interface du Brain : navigation, cerveau 3D, notes (lire / écrire), pages, palette de commandes, import.
import "@fontsource-variable/inter";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "@fontsource/instrument-serif";
import fuzzysort from "fuzzysort";
import { createBrain, DEFAULTS, PALETTES } from "./brain3d.js";
import { createEditor } from "./editor.js";
import { render, embedHtml, kindOfRel, splitFrontmatter , mediaUrl } from "./markdown.js";
import * as V from "./views.js";
import { home, patchLive, glassPointer, WIDGETS, DEFAULT_LAYOUT } from "./home.js";
import { createFocus } from "./focus.js";
import { createModel } from "./model.js";
import { createApisPage } from "./apis.js";
import { waves } from "./waves.js";

const B = window.brain;
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fmtDate = (t) => (t ? new Date(t).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) : "");
const store = { get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };

const state = { tree: [], names: new Map(), cur: null, view: "read", page: "brain", dirty: false, openDirs: new Set(store.get("openDirs", [])), semReady: false, stats: null, legend: [], regions: [] };

// ---------- toasts ----------
function toast(msg, ms = 3800) {
  const t = document.createElement("div"); t.className = "toast"; t.textContent = msg;
  $("#toasts").prepend(t);
  while ($("#toasts").children.length > 3) $("#toasts").lastChild.remove();
  setTimeout(() => { t.classList.add("out"); setTimeout(() => t.remove(), 220); }, ms);
}
function resolveName(name) {
  const n = name.trim().toLowerCase();
  return state.names.get(n) || state.names.get(n.replace(/\.md$/, "")) || state.names.get(n.split("/").pop()) || null;
}
const colorOf = (g) => state.legend.find((l) => l.name === g)?.color || "#9096a8";

// ---------- arbre ----------
async function loadTree() {
  state.tree = await B.tree();
  state.names = new Map();
  for (const it of state.tree) {
    const base = it.rel.split("/").pop();
    state.names.set(base.toLowerCase(), it.rel);
    if (it.kind === "note") state.names.set(base.replace(/\.md$/i, "").toLowerCase(), it.rel);
    state.names.set(it.rel.toLowerCase(), it.rel);
    state.names.set(it.rel.replace(/\.md$/i, "").toLowerCase(), it.rel);
  }
  renderTree();
}
function renderTree() {
  const root = { dirs: new Map(), files: [] };
  for (const it of state.tree) {
    // L arborescence montre les notes et les vrais fichiers, pas les milliers d images des banques ni les miniatures.
    if (/(^|\/)(_mini|_apercus|_source)\//.test(it.rel) || (/(^|\/)Banques\//.test(it.rel) && it.kind !== "note")) continue;
    const parts = it.rel.split("/"); let d = root, p = "";
    for (const part of parts.slice(0, -1)) { p += (p ? "/" : "") + part; if (!d.dirs.has(part)) d.dirs.set(part, { dirs: new Map(), files: [], path: p }); d = d.dirs.get(part); }
    d.files.push(it);
  }
  const html = (d) =>
    [...d.dirs.entries()].map(([name, sub]) => `<div class="dir${state.openDirs.has(sub.path) ? " open" : ""}" data-path="${esc(sub.path)}"><div class="dname">${esc(name)}</div><div class="kids">${html(sub)}</div></div>`).join("") +
    d.files.filter((f) => !/\.miniature\.jpg$/.test(f.rel) && !/(^|\/)_index\.md$/.test(f.rel)).map((f) =>
      `<div class="file${state.cur === f.rel ? " cur" : ""}" data-rel="${esc(f.rel)}" data-kind="${f.kind}" title="${esc(f.rel)}"><i></i>${esc(f.kind === "note" ? f.title.replace(/\.md$/, "") : f.title)}</div>`).join("");
  $("#tree").innerHTML = html(root);
}
$("#tree").addEventListener("click", (e) => {
  const f = e.target.closest(".file"); if (f) return openRel(f.dataset.rel);
  const d = e.target.closest(".dname");
  if (d) { const dir = d.parentElement; dir.classList.toggle("open"); dir.classList.contains("open") ? state.openDirs.add(dir.dataset.path) : state.openDirs.delete(dir.dataset.path); store.set("openDirs", [...state.openDirs]); }
});
function revealInTree(rel) {
  const parts = rel.split("/"); let p = "";
  for (const part of parts.slice(0, -1)) { p += (p ? "/" : "") + part; state.openDirs.add(p); }
  store.set("openDirs", [...state.openDirs]); renderTree();
  $(`.file[data-rel="${CSS.escape(rel)}"]`)?.scrollIntoView({ block: "nearest" });
}

// ---------- navigation entre vues ----------
function showSection(id) {
  for (const s of ["#brainView", "#noteView", "#pageView"]) $(s).hidden = s !== id;
  brain.pause(id !== "#brainView");
  if (id === "#brainView") requestAnimationFrame(() => brain.resize());
}
// ---------- historique : retour / avant (boutons ‹ ›, Alt+← / Alt+→, boutons latéraux de la souris) ----------
const hist = { back: [], fwd: [], cur: null, nav: false };
function record(e) {
  if (hist.nav) return;
  if (hist.cur && (hist.cur.t !== e.t || hist.cur.v !== e.v)) { hist.back.push(hist.cur); if (hist.back.length > 80) hist.back.shift(); hist.fwd = []; }
  hist.cur = e; syncHist();
}
function syncHist() { const b = document.getElementById("tbBack"), f = document.getElementById("tbFwd"); if (b) b.disabled = !hist.back.length; if (f) f.disabled = !hist.fwd.length; }
async function histGo(dir) {
  const from = dir < 0 ? hist.back : hist.fwd, to = dir < 0 ? hist.fwd : hist.back, e = from.pop();
  if (!e) return;
  if (hist.cur) to.push(hist.cur);
  hist.cur = e; hist.nav = true;
  try { e.t === "note" ? await openRel(e.v) : await go(e.v); } finally { hist.nav = false; syncHist(); }
}
document.getElementById("tbBack").onclick = () => histGo(-1);
document.getElementById("tbFwd").onclick = () => histGo(1);
window.addEventListener("keydown", (e) => { if (e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) { e.preventDefault(); histGo(e.key === "ArrowLeft" ? -1 : 1); } });
window.addEventListener("mouseup", (e) => { if (e.button === 3) { e.preventDefault(); histGo(-1); } if (e.button === 4) { e.preventDefault(); histGo(1); } });

async function go(page) {
  record({ t: "page", v: page });
  await flushSave();
  state.page = page;
  for (const a of document.querySelectorAll("#nav a")) a.classList.toggle("on", a.dataset.view === page);
  const navA = document.querySelector(`#nav a[data-view="${page}"]`);
  if (navA) $("#tbPage").textContent = navA.childNodes[1]?.textContent?.trim() || page;
  document.body.classList.remove("has-note");
  if (page === "brain") { state.cur = null; renderTree(); showSection("#brainView"); requestAnimationFrame(syncShape); return; }
  state.cur = null; renderTree(); showSection("#pageView");
  const P = $("#page");
  if (page === "model") { model.mount(P); }
  else if (page === "apis") { apisPage.mount(P); }
  else if (page === "waves") { waves(P, await B.meta(), colorOf); }
  else if (page === "home") {
    const [flux, stats, meta, live] = await Promise.all([B.fluxWidgets(), B.info(), B.meta(), B.liveSnapshot().catch(() => ({}))]);
    P.innerHTML = home({ flux, stats, meta, live, layout: homeLayout(), editing: state.editHome });
  } else if (page === "timeline") P.innerHTML = V.timeline(await B.meta(), colorOf);
  else if (page === "numbers") P.innerHTML = V.numbers(await B.meta(), await B.info(), colorOf);
  else if (page === "medias") P.innerHTML = V.medias(state.tree, await B.meta());
  else if (page === "health") {
    P.innerHTML = `<div class="ph"><h1>Santé</h1><span class="sub">analyse en cours…</span></div>`;
    const r = await B.lint();
    const md = await B.getNote("99-Systeme/Sante du cerveau.md").then((n) => n.content).catch(() => "");
    P.innerHTML = V.health(r, md, resolveName);
  } else if (page === "ask") { P.innerHTML = V.ask(null, null); $("#askQ").focus(); }
  $("#pageView").scrollTop = 0;
}
$("#nav").addEventListener("click", (e) => { const a = e.target.closest("a"); if (a) go(a.dataset.view); });
$("#page").addEventListener("click", async (e) => {
  const r = e.target.closest("[data-rel]"); if (r && !state.editHome && !e.target.closest(".w-tools")) return openRel(r.dataset.rel);
  const w = e.target.closest("a.wl"); if (w) { const rel = resolveName(w.dataset.link); if (rel) openRel(rel); return; }
  if (e.target.closest("#bLint")) return go("health");
  // ----- widgets de l'accueil : personnaliser, tailles, masquer, ajouter -----
  if (e.target.closest("#bEditHome")) { state.editHome = !state.editHome; return renderHome(); }
  const sz = e.target.closest("[data-size]"); if (sz) { e.stopPropagation(); setLayout(homeLayout().map((w) => (w.id === sz.dataset.w ? { ...w, size: sz.dataset.size } : w))); return renderHome(); }
  const hd = e.target.closest("[data-hide]"); if (hd) { e.stopPropagation(); setLayout(homeLayout().map((w) => (w.id === hd.dataset.hide ? { ...w, on: false } : w))); return renderHome(); }
  const sh = e.target.closest("[data-show]"); if (sh) { setLayout(homeLayout().map((w) => (w.id === sh.dataset.show ? { ...w, on: true } : w))); return renderHome(); }
  if (e.target.closest("[data-reset]")) { setLayout(DEFAULT_LAYOUT); return renderHome(); }
  if (state.editHome && e.target.closest(".w")) return; // en mode personnalisation, un clic n'ouvre rien
  const fb = e.target.closest("#bFlux");
  if (fb) {
    fb.disabled = true; fb.textContent = "Mise à jour…";
    const r = await B.fluxUpdate();
    const ko = r.filter((x) => x.error);
    toast(`${r.length - ko.length}/${r.length} flux mis à jour${ko.length ? " · échec : " + ko.map((x) => x.nom).join(", ") : ""}`, 5000);
    fb.disabled = false; fb.textContent = "Actualiser les veilles";
    refreshHomeCards();
    return;
  }
  if (e.target.closest("a.w-news")) return;
  if (e.target.closest("#copyCtx")) { await navigator.clipboard.writeText($("#ctxText").textContent).then(() => toast("Contexte copié : colle-le dans Claude"), () => toast("Copie impossible")); }
});
$("#page").addEventListener("submit", async (e) => {
  if (e.target.id !== "askForm") return;
  e.preventDefault();
  const q = $("#askQ").value.trim(); if (!q) return;
  const [res, ctx] = await Promise.all([B.searchNeural(q), B.context(q)]);
  $("#page").innerHTML = V.ask(res, ctx); $("#askQ").value = q;
});

// ---------- note ----------
async function openRel(rel) {
  if (!rel) return;
  record({ t: "note", v: rel });
  await flushSave();
  state.cur = rel; state.page = null;
  document.body.classList.add("has-note");
  $$("#nav a").forEach((a) => a.classList.remove("on"));
  $("#tbPage").textContent = rel.split("/").pop().replace(/\.md$/, "");
  revealInTree(rel);
  showSection("#noteView");
  const kind = kindOfRel(rel);
  $("#crumb").textContent = rel.split("/").slice(0, -1).join("  /  ") || "racine";
  $("#title").textContent = rel.split("/").pop().replace(/\.md$/, "");
  if (kind === "note") {
    const n = await B.getNote(rel);
    state.note = n; editor.value = n.content; state.dirty = false;
    $("#viewMode").hidden = false;
    setView(state.view); renderPanel(n);
  } else {
    const f = await B.fileInfo(rel);
    state.note = null; $("#viewMode").hidden = true; $("#editor").hidden = true; $("#preview").hidden = false;
    $("#preview").innerHTML = `<p style="font:11px var(--mono);color:var(--faint)">${esc(kind)} · ${f ? (f.size / 1048576).toFixed(2) + " Mo · " + fmtDate(f.created) : ""}</p>` +
      embedHtml(rel).replace("<img ", '<img class="media-big" ').replace("<video ", '<video class="media-big" ') + `<p><button data-act="ext">Ouvrir avec le logiciel du PC</button></p>`;
    renderPanel({ fm: {}, content: "", backlinks: f?.backlinks || [], outlinks: [], related: [] });
  }
  $("#noteBody").scrollTop = 0;
}
function setView(v) {
  state.view = v;
  for (const b of $("#viewMode").children) b.classList.toggle("on", b.dataset.v === v);
  $("#editor").hidden = v !== "edit"; $("#preview").hidden = v !== "read";
  if (v === "read") $("#preview").innerHTML = render(editor.value, resolveName); else editor.focus();
}
function renderPanel(n) {
  const props = Object.entries(n.fm || {}).filter(([, v]) => v !== "" && v != null);
  $("#props").innerHTML = props.length ? props.map(([k, v]) => `<div class="prop"><span>${esc(k)}</span><span>${esc(Array.isArray(v) ? v.join(", ") : v instanceof Date ? fmtDate(v) : typeof v === "object" ? JSON.stringify(v) : v)}</span></div>`).join("") : '<div class="empty">Aucune</div>';
  const heads = [...splitFrontmatter(n.content || "").body.matchAll(/^(#{1,3})\s+(.+)$/gm)];
  $("#outline").innerHTML = heads.length ? heads.map((h, i) => `<a class="lnk h${h[1].length}" data-h="${i}">${esc(h[2])}</a>`).join("") : '<div class="empty">Aucun titre</div>';
  const list = (arr, empty) => (arr.length ? arr.map((x) => `<a class="lnk${x.rel ? "" : " missing"}" data-rel="${esc(x.rel || "")}">${esc(x.title || x.name || x.rel)}${x.score ? `<span class="sc">${Math.round(x.score * 100)} %</span>` : ""}</a>`).join("") : `<div class="empty">${empty}</div>`);
  $("#back").innerHTML = list(n.backlinks || [], "Aucune note ne pointe ici");
  $("#out").innerHTML = list((n.outlinks || []).map((o) => ({ ...o, title: o.name })), "Aucun lien");
  $("#near").innerHTML = state.semReady ? list(n.related || [], "Rien de proche") : '<div class="empty">Calcul du sens en cours…</div>';
}
$("#panel").addEventListener("click", (e) => {
  const a = e.target.closest(".lnk"); if (!a) return;
  if (a.dataset.h !== undefined) { if (state.view !== "read") setView("read"); $$("#preview h1, #preview h2, #preview h3")[+a.dataset.h]?.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
  if (a.dataset.rel) openRel(a.dataset.rel);
});
$("#preview").addEventListener("click", (e) => {
  const a = e.target.closest("a.wl");
  if (a) { e.preventDefault(); const rel = resolveName(a.dataset.link); rel ? openRel(rel) : createFromLink(a.dataset.link); return; }
  if (e.target.closest("[data-act=ext]")) B.openExternal(state.cur);
});
$("#viewMode").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) setView(b.dataset.v); });
$("#bReveal").onclick = () => state.cur && B.reveal(state.cur);
$("#bFocus").onclick = () => { const rel = state.cur; go("brain").then(() => setTimeout(() => brain.focus(rel), 200)); };
async function createFromLink(name) {
  const folder = state.cur?.includes("/") ? state.cur.split("/")[0] : "00-Inbox";
  const rel = await B.createNote({ title: name, folder });
  await loadTree(); state.view = "edit"; openRel(rel); toast(`Note « ${name} » créée`);
}

// ---------- édition + sauvegarde auto ----------
let saveTimer;
const editor = createEditor($("#editor"), {
  names: () => state.tree.filter((t) => t.kind === "note").map((t) => t.title.replace(/\.md$/, "")),
  onChange: () => { state.dirty = true; clearTimeout(saveTimer); saveTimer = setTimeout(flushSave, 900); },
  onSave: () => flushSave(true),
});
async function flushSave(explicit) {
  clearTimeout(saveTimer);
  if (!state.dirty || !state.cur || kindOfRel(state.cur) !== "note") return;
  state.dirty = false;
  await B.saveNote(state.cur, editor.value);
  if (explicit) toast("Enregistré");
}

// ---------- cerveau 3D ----------
const brain = createBrain($("#graph"), {
  onSelect: async (n, info) => {
    const card = $("#card");
    const token = (state.cardToken = (state.cardToken || 0) + 1); // un clic rapide sur un autre neurone annule l'ancien
    if (!n) { card.classList.remove("show"); setTimeout(() => { if (state.cardToken === token) card.hidden = true; }, 220); return; }
    const name = n.name.replace(/\.md$/, "");
    const orb = `<div class="nc-orb" style="--c:${info.color}"><i></i><b></b></div>`;
    const close = `<button class="nc-x ghost icon" data-close title="Fermer">✕</button>`;
    if (n.kind === "ghost") {
      const folder = (state.regions.find((r) => r.nom === info.region)?.dossiers || [])[0] || "00-Inbox";
      card.innerHTML = `${close}<div class="nc-head">${orb}<div><div class="nc-sub">NEURONE VIDE · ${esc(info.region || "")}</div><h4>${esc(name)}</h4></div></div><p class="nc-desc">Cette note est citée par d'autres neurones mais n'existe pas encore.</p><div class="nc-actions"><button class="primary" data-create="${esc(name)}" data-folder="${esc(folder)}">Faire naître ce neurone</button></div>`;
      card.hidden = false; requestAnimationFrame(() => card.classList.add("show")); return;
    }
    let d = null;
    if (n.kind === "note") d = await B.getNote(n.id).catch(() => null);
    if (state.cardToken !== token) return;
    const body = d ? splitFrontmatter(d.content).body : "";
    const desc = String(d?.fm?.resume || body.replace(/^#.*$/gm, "").replace(/!\[\[[^\]]*\]\]/g, "").replace(/\[\[([^\]|]*)(\|[^\]]*)?\]\]/g, "$1").replace(/[*_>#`]/g, "").trim()).slice(0, 220);
    const img = (body.match(/!\[\[([^\]|#]+\.(?:png|jpe?g|webp|gif))(?:\|[^\]]*)?\]\]/i) || [])[1];
    const imgRel = img ? resolveName(img.trim()) : null;
    const medias = (body.match(/!\[\[/g) || []).length;
    const type = d?.fm?.type || (n.kind === "note" ? "note" : n.kind);
    const stats = [`${info.neighbors.length} lien${info.neighbors.length > 1 ? "s" : ""}`, d ? `${d.backlinks?.length || 0} rétrolien${(d.backlinks?.length || 0) > 1 ? "s" : ""}` : "", medias ? `${medias} média${medias > 1 ? "s" : ""}` : ""].filter(Boolean);
    const chips = info.neighbors.slice(0, 8).map((m) => `<button class="chip${m.kind === "ghost" ? " ghostchip" : ""}" data-go="${esc(m.id)}"><i style="background:${m.color}"></i>${esc(m.name)}</button>`).join("");
    card.innerHTML = `${close}
      <div class="nc-head">${orb}<div><div class="nc-sub">${esc((info.region || n.group || "").toUpperCase())} · ${esc(String(type).toUpperCase())}</div><h4>${esc(name)}</h4><div class="nc-meta">${fmtDate(n.created)}${stats.map((x) => ` · ${x}`).join("")}</div></div></div>
      ${imgRel ? `<div class="nc-img"><img src="${mediaUrl(imgRel)}" alt=""></div>` : ""}
      ${desc ? `<p class="nc-desc">${esc(desc)}</p>` : ""}
      ${chips ? `<div class="nc-label">Relié à</div><div class="chips">${chips}${info.neighbors.length > 8 ? `<span class="more">+${info.neighbors.length - 8}</span>` : ""}</div>` : ""}
      <div class="nc-actions"><button class="primary" data-open="${esc(n.id)}">Ouvrir le neurone</button><button data-focusgo="${esc(n.id)}">S'approcher</button></div>`;
    card.hidden = false; requestAnimationFrame(() => card.classList.add("show"));
  },
  onEmpty: (e) => openAtelier({ region: e.region }),
  onOpen: (n) => focusView.open(n.id),
});
// Barre latérale : largeur réglable à la souris (mémorisée)
{
  const setW = (w) => { const v = Math.max(200, Math.min(480, w)); document.documentElement.style.setProperty("--side-w", v + "px"); return v; };
  const saved = store.get("sideW", 0); if (saved) setW(saved);
  const h = document.getElementById("sideResize");
  h.addEventListener("pointerdown", (e) => {
    e.preventDefault(); document.body.classList.add("resizing"); h.setPointerCapture(e.pointerId);
    const move = (ev) => { store.set("sideW", setW(ev.clientX)); brain.resize(); };
    const up = () => { document.body.classList.remove("resizing"); h.removeEventListener("pointermove", move); h.removeEventListener("pointerup", up); };
    h.addEventListener("pointermove", move); h.addEventListener("pointerup", up);
  });
  h.addEventListener("dblclick", () => { store.set("sideW", setW(248)); brain.resize(); });
}
const focusView = createFocus({ B, brain, resolveName: (x) => resolveName(x), openRel: (r) => openRel(r) });
window.__axon = { ouvrirNeurone: (id) => focusView.open(id) }; // pour les tests visuels
// ---------- Atelier : créer un neurone (texte, médias, liens) et le voir naître dans le cerveau ----------
const at = { media: [], links: [] };
function openAtelier({ region = "", title = "" } = {}) {
  $("#card").hidden = true; $("#viewPanel").hidden = true;
  $("#atRegion").innerHTML = (state.regions || []).map((r) => `<option value="${esc(r.nom)}" ${r.nom === region ? "selected" : ""}>${esc(r.nom)} · ${esc((r.dossiers || [])[0] || "")}</option>`).join("");
  if (title) $("#atTitle").value = title;
  renderAtelier(); $("#atelier").hidden = false; $("#atTitle").focus();
}
function renderAtelier() {
  $("#atMedia").innerHTML = at.media.map((m, i) => `<span class="chip">${esc(m.name)}<b data-rm-media="${i}">✕</b></span>`).join("");
  $("#atLinks").innerHTML = at.links.map((l, i) => `<span class="chip"><i style="background:${l.color}"></i>${esc(l.name)}<b data-rm-link="${i}">✕</b></span>`).join("");
}
$("#bAtelier").onclick = () => ($("#atelier").hidden ? openAtelier() : ($("#atelier").hidden = true));
$("#atClose").onclick = () => ($("#atelier").hidden = true);
$("#atelier").addEventListener("click", (e) => {
  const m = e.target.closest("[data-rm-media]"); if (m) { at.media.splice(+m.dataset.rmMedia, 1); renderAtelier(); }
  const l = e.target.closest("[data-rm-link]"); if (l) { at.links.splice(+l.dataset.rmLink, 1); renderAtelier(); }
});
$("#atFiles").onclick = async () => {
  const paths = await B.pickFiles(); if (!paths.length) return;
  toast(`Import de ${paths.length} fichier(s)…`);
  for (const r of await B.importFiles(paths)) if (!r.error) at.media.push({ name: r.fileRel.split("/").pop(), fileRel: r.fileRel, noteRel: r.noteRel, kind: r.kind });
  renderAtelier();
};
$("#atLink").addEventListener("input", () => {
  const res = brain.find($("#atLink").value).filter((r) => !at.links.some((l) => l.id === r.id));
  $("#atLinkList").hidden = !res.length;
  $("#atLinkList").innerHTML = res.map((r) => `<button data-add="${esc(r.id)}" data-name="${esc(r.name)}" data-color="${r.color}"><i style="background:${r.color}"></i>${esc(r.name)}</button>`).join("");
});
$("#atLinkList").addEventListener("click", (e) => {
  const b = e.target.closest("[data-add]"); if (!b) return;
  at.links.push({ id: b.dataset.add, name: b.dataset.name, color: b.dataset.color });
  $("#atLink").value = ""; $("#atLinkList").hidden = true; renderAtelier(); brain.highlight([b.dataset.add]);
});
$("#atCreate").onclick = async () => {
  const title = $("#atTitle").value.trim(); if (!title) { $("#atTitle").focus(); return toast("Donne un nom au neurone"); }
  const reg = (state.regions || []).find((r) => r.nom === $("#atRegion").value);
  const folder = (reg?.dossiers || ["00-Inbox"]).find((d) => d !== "racine") || "00-Inbox";
  const media = at.media.map((m) => (m.kind === "note" ? `- [[${m.fileRel.split("/").pop().replace(/\.md$/, "")}]]` : `![[${m.fileRel.split("/").pop()}]]`)).join("\n\n");
  const body = [$("#atText").value.trim(), media && `## Médias\n\n${media}`, at.links.length && `## Liens\n\n${at.links.map((l) => `- [[${l.name}]]`).join("\n")}`].filter(Boolean).join("\n\n");
  const rel = await B.createNote({ title, folder, body, tags: [(reg?.nom || "inbox").toLowerCase()], type: "note" });
  toast(`« ${title} » est né dans ${reg?.nom || folder}`);
  at.media = []; at.links = []; $("#atTitle").value = ""; $("#atText").value = ""; renderAtelier();
  $("#atelier").hidden = true;
  await loadTree(); await loadGraph(); setTimeout(() => brain.focus(rel), 400);
};

// Forme du cerveau : Cerveau / Cerveau + colonne / Galaxie (transition animée)
function syncShape() {
  const cur = brain.settings().shape, b = $("#shapeSeg").querySelector(`[data-shape="${cur}"]`);
  for (const x of document.querySelectorAll("#shapeSeg button")) x.classList.toggle("on", x === b);
  if (b) { const ind = $("#shapeSeg .seg-ind"); ind.style.width = b.offsetWidth + "px"; ind.style.transform = `translateX(${b.offsetLeft}px)`; }
}
$("#shapeSeg").addEventListener("click", (e) => { const b = e.target.closest("[data-shape]"); if (b) applyView({ shape: b.dataset.shape }); });

$("#bZoomIn").onclick = () => brain.zoom(0.7);
$("#bZoomOut").onclick = () => brain.zoom(1.4);
// Aller à un neurone : recherche directement dans le cerveau.
const findBox = $("#brainFind"), findList = $("#brainFindList");
function renderFind() {
  const res = brain.find(findBox.value);
  findList.hidden = !res.length;
  findList.innerHTML = res.map((r, i) => `<button class="${i === 0 ? "on" : ""}" data-go="${esc(r.id)}"><i style="background:${r.color}"></i>${esc(r.name)}<span>${esc(r.region || "")}</span></button>`).join("");
}
findBox.addEventListener("input", renderFind);
findBox.addEventListener("keydown", (e) => {
  if (e.key === "Enter") { const b = findList.querySelector("button"); if (b) { brain.focus(b.dataset.go); findList.hidden = true; findBox.blur(); } }
  if (e.key === "Escape") { findBox.value = ""; findList.hidden = true; findBox.blur(); }
});
findList.addEventListener("click", (e) => { const b = e.target.closest("[data-go]"); if (b) { brain.focus(b.dataset.go); findList.hidden = true; } });
$("#card").addEventListener("click", (e) => {
  const b = e.target.closest("[data-open]"); if (b) return openRel(b.dataset.open);
  const go_ = e.target.closest("[data-go]"); if (go_) return brain.focus(go_.dataset.go);
  const fg = e.target.closest("[data-focusgo]"); if (fg) return brain.focus(fg.dataset.focusgo);
  const c = e.target.closest("[data-create]"); if (c) return openNewDialog(c.dataset.create, c.dataset.folder);
  if (e.target.closest("[data-close]")) { $("#card").classList.remove("show"); $("#card").hidden = true; brain.clear(); }
});
function renderLegend(lg) {
  state.legend = lg;
  $("#legend").innerHTML = `<span class="lbl">PAR ${{ folder: "DOSSIER", tag: "TAG", type: "TYPE", region: "RÉGION" }[brain.settings().groupBy]}</span>` +
    lg.map((x) => `<span class="lg${x.hidden ? " off" : ""}" data-g="${esc(x.name)}" title="${x.count} neurones · ${x.links} synapses"><i style="background:${x.color}"></i><span class="lg-n">${esc(x.name)}</span><span>${x.count} · ${x.links}</span></span>`).join("");
}
// Jauges (façon mindcorpus) : part des notes résumées, reliées et compilées.
async function updateGauges() {
  const meta = await B.meta(); if (!meta.length) return;
  const pct = (f) => Math.round((meta.filter(f).length / meta.length) * 100);
  const gs = [["Résumées", pct((n) => n.summary)], ["Reliées", pct((n) => n.deg > 1)], ["Compilées", pct((n) => n.statut === "compile" || n.statut === "fondation")]];
  $("#gauges").innerHTML = gs.map(([l, v]) => `<div class="gauge"><span>${l}</span><b><i style="width:${v}%"></i></b><em>${v} %</em></div>`).join("");
}
async function loadGraph() {
  updateGauges();
  const g = await B.graph();
  state.regions = g.regions || [];
  renderLegend(brain.setData(g));
  const notes = g.nodes.filter((n) => n.kind === "note").length, ghosts = g.nodes.filter((n) => n.kind === "ghost").length;
  $("#brainSub").textContent = `${notes} neurones · ${g.nodes.length - notes - ghosts} médias · ${g.links.filter((l) => l.type !== "ghost").length} synapses${ghosts ? ` · ${ghosts} à créer` : ""}`;
}
$("#legend").addEventListener("click", (e) => { const l = e.target.closest(".lg"); if (l) l.classList.toggle("off", !brain.toggleGroup(l.dataset.g)); });
$("#bHome").onclick = () => brain.home();

// Panneau « Vue » : chaque contrôle est relié à un réglage du cerveau, mémorisé.
const PALETTE_NAMES = { default: "Défaut", lava: "Lave", ocean: "Océan", forest: "Forêt", aurora: "Aurore", mono: "Mono", sunset: "Couchant" };
function syncPanel() {
  const s = brain.settings();
  document.body.dataset.theme = s.theme;
  for (const el of $$("#viewPanel [data-k]")) el.type === "checkbox" ? (el.checked = !!s[el.dataset.k]) : (el.value = s[el.dataset.k]);
  for (const o of $$("#viewPanel [data-o]")) o.textContent = s[o.dataset.o] + " %";
  $("#palettes").innerHTML = Object.entries(PALETTES).map(([k, cols]) =>
    `<button class="pal${s.palette === k ? " on" : ""}" data-pal="${k}"><span>${PALETTE_NAMES[k] || k}</span><i style="background:linear-gradient(90deg,${cols.slice(0, 6).join(",")})"></i></button>`).join("");
  for (const b of $$("#layouts button")) b.classList.toggle("on", b.dataset.l === s.layout);
}
function applyView(partial) { renderLegend(brain.apply(partial)); store.set("view6", brain.settings()); syncPanel(); syncShape(); }
$("#viewPanel").addEventListener("input", (e) => {
  const k = e.target.dataset.k; if (!k) return;
  applyView({ [k]: e.target.type === "checkbox" ? e.target.checked : e.target.type === "range" ? +e.target.value : e.target.value });
});
$("#viewPanel").addEventListener("click", (e) => {
  const p = e.target.closest("[data-pal]"); if (p) return applyView({ palette: p.dataset.pal });
  const l = e.target.closest("[data-l]"); if (l) return applyView({ layout: l.dataset.l, morph: brain.settings().morph < 50 ? 100 : brain.settings().morph });
});
$("#bViewPanel").onclick = () => { $("#viewPanel").hidden = !$("#viewPanel").hidden; syncPanel(); };
$("#vpClose").onclick = () => ($("#viewPanel").hidden = true);
$("#vpReset").onclick = () => { renderLegend(brain.apply({ ...DEFAULTS })); store.set("view6", brain.settings()); syncPanel(); };

// ---------- palette de commandes (Ctrl+K) ----------
const ACTIONS = [
  { t: "Nouvelle note", k: "Ctrl N", run: () => openNewDialog() },
  { t: "Importer des fichiers", k: "Ctrl I", run: () => $("#bImport").click() },
  { t: "Synchroniser (Git)", k: "Ctrl ⇧ S", run: () => $("#bSync").click() },
  { t: "Vue cerveau", k: "Ctrl B", run: () => go("brain") },
  { t: "Accueil (tableau de bord)", k: "Ctrl H", run: () => go("home") },
  { t: "Parler au Modèle (IA du Brain)", k: "Ctrl J", run: () => go("model") },
  { t: "Mettre à jour tous les flux (API)", run: async () => { toast("Mise à jour des flux…"); const r = await B.fluxUpdate(); toast(`${r.filter((x) => !x.error).length}/${r.length} flux mis à jour`); } },
  { t: "Chronologie", run: () => go("timeline") }, { t: "Chiffres", run: () => go("numbers") },
  { t: "Médias", run: () => go("medias") }, { t: "Santé du cerveau", run: () => go("health") },
  { t: "Demander au cerveau", run: () => go("ask") },
  { t: "Note du jour", run: () => dailyNote() },
  { t: "Brancher Claude (Desktop + Code) sur ce cerveau", run: async () => { const r = await B.brancherClaude(); toast(r.map((x) => (x.ok ? "✓ " : "– ") + x.cible).join(" · ") + " — quitte Claude complètement puis rouvre-le"); } },
  { t: "Changer de cerveau / rejoindre un cerveau", run: () => B.chooseVault() },
  { t: "Guide Axon (installation, Claude, dépannage)", run: () => B.guide() },
  { t: "Matériel utilisé (carte graphique, processeur)", run: async () => { const m = await B.materiel(); toast(`Affichage : ${m.carte} (WebGL ${m.acceleration}) · IA locale : ${m.ia} · ${m.coeurs} cœurs · ${m.ram} Go de RAM`, 9000); } },
  { t: "Recalculer le sens des notes", run: () => { B.reindex(); toast("Recalcul lancé"); } },
  ...Object.keys(PALETTES).map((p) => ({ t: `Palette : ${p}`, run: () => { renderLegend(brain.apply({ palette: p })); store.set("view6", brain.settings()); } })),
];
let pmode = "neural", psel = 0, pitems = [];
function openPalette(initial = "") { $("#palette").showModal(); $("#pq").value = initial; runPalette(); $("#pq").focus(); }
async function runPalette() {
  const q = $("#pq").value;
  if (q.startsWith(">") || !q.trim()) {
    const term = q.replace(/^>\s*/, "");
    const acts = term ? fuzzysort.go(term, ACTIONS, { key: "t" }).map((r) => r.obj) : ACTIONS;
    const recent = q.trim() ? [] : [...state.tree].filter((t) => t.kind === "note" && !/_index\.md$/.test(t.rel)).sort((a, b) => b.mtime - a.mtime).slice(0, 6).map((t) => ({ kind: "Récent", title: t.title.replace(/\.md$/, ""), rel: t.rel }));
    pitems = [...recent, ...acts.map((a) => ({ kind: "Action", title: a.t, sub: a.k || "", run: a.run }))];
  } else {
    const names = state.tree.filter((t) => !/\.miniature\.jpg$|_index\.md$/.test(t.rel)).map((t) => ({ title: t.title.replace(/\.md$/, ""), rel: t.rel, kind: t.kind }));
    const fz = fuzzysort.go(q, names, { key: "title", limit: 6 }).map((r) => ({ kind: r.obj.kind === "note" ? "Note" : r.obj.kind, title: r.obj.title, rel: r.obj.rel, sub: r.obj.rel }));
    let deep = [];
    if (q.trim().length > 2) {
      const res = pmode === "text" ? await B.searchText(q) : pmode === "sens" ? await B.searchSens(q) : await B.searchNeural(q);
      if (Array.isArray(res)) deep = res.filter((r) => !fz.some((f) => f.rel === r.rel)).slice(0, 10).map((r) => ({ kind: pmode === "neural" ? (r.via === "propagation" ? "Propagé" : "Neuronal") : pmode === "sens" ? "Sens" : "Mots", title: r.title, rel: r.rel, sub: r.summary }));
    }
    if ($("#pq").value !== q) return;
    pitems = [...fz, ...deep, { kind: "Créer", title: `Créer la note « ${q} »`, run: () => openNewDialog(q) }];
  }
  psel = 0; drawPalette();
}
function drawPalette() {
  $("#plist").innerHTML = pitems.map((it, i) => `<li class="${i === psel ? "sel" : ""}" data-i="${i}"><span class="k">${esc(it.kind)}</span><b>${esc(it.title)}</b><small class="${it.kind === "Propagé" ? "via" : ""}">${esc(it.sub || "")}</small></li>`).join("");
  $("#plist .sel")?.scrollIntoView({ block: "nearest" });
}
function choosePalette(i) {
  const it = pitems[i]; if (!it) return;
  $("#palette").close();
  if (it.run) it.run(); else openRel(it.rel);
}
let pTimer;
$("#pq").addEventListener("input", () => { clearTimeout(pTimer); pTimer = setTimeout(runPalette, 110); });
$("#pq").addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); psel = (psel + (e.key === "ArrowDown" ? 1 : -1) + pitems.length) % Math.max(pitems.length, 1); drawPalette(); }
  else if (e.key === "Enter") { e.preventDefault(); choosePalette(psel); }
  else if (e.key === "Tab") { e.preventDefault(); const modes = ["neural", "text", "sens"]; setPmode(modes[(modes.indexOf(pmode) + 1) % 3]); }
});
function setPmode(m) { pmode = m; $$("#pmode button").forEach((b) => b.classList.toggle("on", b.dataset.m === m)); runPalette(); }
$("#pmode").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { setPmode(b.dataset.m); $("#pq").focus(); } });
$("#plist").addEventListener("click", (e) => { const li = e.target.closest("li"); if (li) choosePalette(+li.dataset.i); });
$("#palette").addEventListener("click", (e) => { if (e.target === $("#palette")) $("#palette").close(); });
$("#bPalette").onclick = () => openPalette();

// ---------- actions ----------
$("#bSync").onclick = async () => {
  await flushSave(); toast("Synchronisation…");
  try { const r = await B.sync(); toast(r.message, 6000); } catch (e) { toast("Synchro impossible : " + e.message, 8000); }
};
$("#bImport").onclick = async () => importPaths(await B.pickFiles());
$("#bNew").onclick = () => openNewDialog();
async function dailyNote() {
  const rel = await B.dailyNote(); // 01-Journal/AAAA/AAAA-MM-JJ <Prénom>.md, créé si besoin
  await loadTree();
  state.view = "edit"; openRel(rel);
}
function openNewDialog(title = "", folder = "00-Inbox") {
  const dirs = [...new Set([...state.tree.map((t) => t.rel.split("/")[0]).filter((d) => !/\.\w+$/.test(d)), folder].filter((d) => d && d !== "racine"))].sort();
  $("#nFolder").innerHTML = (dirs.length ? dirs : ["00-Inbox"]).map((d) => `<option ${d === folder ? "selected" : ""}>${esc(d)}</option>`).join("");
  $("#nTitle").value = title; $("#nTags").value = "";
  $("#dlgNew").showModal(); $("#nTitle").focus();
}
$("#nCancel").onclick = () => $("#dlgNew").close();
$("#fNew").addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = $("#nTitle").value.trim(); if (!title) return;
  const tags = $("#nTags").value.split(",").map((s) => s.trim()).filter(Boolean);
  const rel = await B.createNote({ title, folder: $("#nFolder").value, tags, type: $("#nType").value });
  $("#dlgNew").close();
  await loadTree(); state.view = "edit"; openRel(rel); toast(`« ${title} » créée`);
});
async function importPaths(paths) {
  if (!paths?.length) return;
  toast(`Import de ${paths.length} fichier(s)…`);
  const res = await B.importFiles(paths);
  const ok = res.filter((r) => !r.error), ko = res.filter((r) => r.error);
  await loadTree(); loadGraph();
  toast(`${ok.length} fichier(s) rangé(s) dans le Brain${ko.length ? ` · ${ko.length} erreur(s) : ${ko.map((k) => k.error).join(" ; ")}` : ""}`, 6000);
  if (ok.length === 1) { state.view = "read"; openRel(ok[0].noteRel); } else if (ok.length) go("medias");
}
let dragDepth = 0;
window.addEventListener("dragenter", (e) => { if (e.dataTransfer?.types.includes("Files")) { dragDepth++; $("#drop").hidden = false; } });
window.addEventListener("dragleave", () => { if (--dragDepth <= 0) { dragDepth = 0; $("#drop").hidden = true; } });
window.addEventListener("dragover", (e) => e.preventDefault());
window.addEventListener("drop", (e) => { e.preventDefault(); dragDepth = 0; $("#drop").hidden = true; importPaths([...e.dataTransfer.files].map((f) => B.pathOf(f)).filter(Boolean)); });

// ---------- raccourcis clavier ----------
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !$("#viewPanel").hidden) { $("#viewPanel").hidden = true; return; }
  if (!e.ctrlKey) return;
  const k = e.key.toLowerCase();
  const map = { j: () => go("model"), h: () => go("home"), k: () => openPalette(), p: () => openPalette(">"), n: () => openNewDialog(), b: () => go("brain"), i: () => $("#bImport").click(), d: () => dailyNote(), e: () => state.note && setView(state.view === "edit" ? "read" : "edit") };
  if (e.shiftKey && k === "s") { e.preventDefault(); return $("#bSync").click(); }
  if (map[k]) { e.preventDefault(); map[k](); }
});
window.addEventListener("resize", () => brain.resize());

// ---------- statut + mises à jour en direct ----------
function setStats(s) {
  if (!s) return;
  state.stats = s; if (s.sem) state.semReady = true;
  $("#stats").textContent = `${s.notes}·${s.files}`;
  $("#tbStats").textContent = `${s.notes} neurones · ${s.links} synapses`;
  $("#status").innerHTML = `<b>${s.notes}</b> notes · <b>${s.files}</b> fichiers · <b>${s.links}</b> liens<br>Mémoire du sens : ${state.semReady ? "prête" : state.semText || "en attente"}`;
}
let refreshTimer;
B.onChanged((s) => {
  setStats(s);
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(async () => {
    await loadTree(); loadGraph();
    if (state.cur && !state.dirty && kindOfRel(state.cur) === "note") {
      const n = await B.getNote(state.cur).catch(() => null);
      if (n && n.content !== editor.value) { editor.value = n.content; if (state.view === "read") setView("read"); renderPanel(n); }
    }
  }, 350);
});
B.onFlux(() => { if (state.page === "home") refreshHomeCards(); });
// Accueil en direct : les cours arrivent en continu et sont modifiés EN PLACE (aucun rechargement de page).
B.onLive((t) => { if (state.page === "home") patchLive($("#page"), t); });
glassPointer($("#page"));
// Les autres cartes (veilles, devises, météo, cerveau) se rafraîchissent seules toutes les 10 s, sans clignoter.
async function refreshHomeCards() {
  if (state.page !== "home") return;
  const [flux, stats, meta, live] = await Promise.all([B.fluxWidgets(), B.info(), B.meta(), B.liveSnapshot().catch(() => ({}))]);
  const tmp = document.createElement("div"); tmp.innerHTML = home({ flux, stats, meta, live, layout: homeLayout(), editing: state.editHome });
  for (const card of tmp.querySelectorAll("[data-card]")) {
    const id = card.dataset.card; if (id === "crypto" || id === "marches") continue; // déjà en direct
    const cur = $("#page").querySelector(`[data-card="${id}"]`);
    if (cur && cur.innerHTML !== card.innerHTML) cur.innerHTML = card.innerHTML;
  }
}
setInterval(() => { if (!state.editHome) refreshHomeCards(); }, 10_000);

// Disposition des widgets (mémorisée sur ce PC)
function homeLayout() {
  const saved = store.get("homeLayout", null);
  if (!Array.isArray(saved)) return DEFAULT_LAYOUT;
  const known = saved.filter((w) => WIDGETS[w.id]);
  for (const d of DEFAULT_LAYOUT) if (!known.some((w) => w.id === d.id)) known.push({ ...d, on: false }); // nouveaux widgets : proposés dans « Ajouter »
  return known;
}
function setLayout(l) { store.set("homeLayout", l); }
async function renderHome() {
  if (state.page !== "home") return;
  const [flux, stats, meta, live] = await Promise.all([B.fluxWidgets(), B.info(), B.meta(), B.liveSnapshot().catch(() => ({}))]);
  $("#page").innerHTML = home({ flux, stats, meta, live, layout: homeLayout(), editing: state.editHome });
}
// Glisser-déposer pour réordonner les widgets (mode Personnaliser)
let dragW = null;
$("#page").addEventListener("dragstart", (e) => { const w = e.target.closest?.(".w"); if (!w || !state.editHome) return; dragW = w.dataset.card; w.classList.add("dragging"); e.dataTransfer.effectAllowed = "move"; });
$("#page").addEventListener("dragend", (e) => { e.target.closest?.(".w")?.classList.remove("dragging"); dragW = null; for (const x of document.querySelectorAll(".w.drop-before")) x.classList.remove("drop-before"); });
$("#page").addEventListener("dragover", (e) => { if (!dragW) return; e.preventDefault(); const w = e.target.closest(".w"); for (const x of document.querySelectorAll(".w.drop-before")) x.classList.remove("drop-before"); if (w && w.dataset.card !== dragW) w.classList.add("drop-before"); });
$("#page").addEventListener("drop", (e) => {
  if (!dragW) return; e.preventDefault();
  const target = e.target.closest(".w")?.dataset.card; const l = homeLayout();
  const from = l.findIndex((w) => w.id === dragW); if (from < 0) return;
  const [m] = l.splice(from, 1); const to = target ? l.findIndex((w) => w.id === target) : l.length;
  l.splice(to < 0 ? l.length : to, 0, m); setLayout(l); dragW = null; renderHome();
});
B.onSemProgress(({ done, total }) => { state.semText = `calcul ${done}/${total}`; B.info().then(setStats); });
B.onSemReady(async () => { state.semReady = true; B.info().then(setStats); loadGraph(); if (state.note) renderPanel(await B.getNote(state.cur)); });
B.onSemError((m) => { state.semText = "indisponible"; toast("Mémoire du sens indisponible : " + m, 8000); });

// ---------- Modèle (IA du Brain) ----------
const apisPage = createApisPage(B);
// Horloge de l'Accueil, à la seconde.
setInterval(() => { const c = document.getElementById("clock"); if (c) c.textContent = new Date().toLocaleTimeString("fr-FR"); }, 1000);
const model = createModel({
  B, resolve: resolveName, openRel, toast,
  flyTo: (rel) => { go("brain").then(() => setTimeout(() => brain.focus(rel), 250)); },
});

// ---------- aperçu au survol d'un [[lien]] ----------
let hoverTimer, hoverFor = null;
document.addEventListener("mouseover", (e) => {
  const a = e.target.closest("a.wl");
  if (!a || a === hoverFor) return;
  hoverFor = a; clearTimeout(hoverTimer);
  hoverTimer = setTimeout(async () => {
    const rel = resolveName(a.dataset.link);
    if (!rel || kindOfRel(rel) !== "note" || hoverFor !== a) return;
    const n = await B.getNote(rel).catch(() => null);
    if (!n || hoverFor !== a) return;
    const box = $("#hover"), r = a.getBoundingClientRect();
    box.innerHTML = '<div class="md">' + render(n.content.slice(0, 1600), resolveName) + "</div>";
    box.style.left = Math.min(r.left, innerWidth - 400) + "px";
    box.style.top = (r.bottom + 320 > innerHeight ? r.top - 310 : r.bottom + 8) + "px";
    box.hidden = false;
  }, 380);
});
function hideHover() { hoverFor = null; clearTimeout(hoverTimer); $("#hover").hidden = true; }
document.addEventListener("mouseout", (e) => {
  if (e.target.closest("a.wl") && !e.relatedTarget?.closest?.("a.wl")) hideHover();
});
// L'aperçu ne reste JAMAIS affiché : il disparaît au clic, au défilement, à la touche Échap,
// quand la souris quitte la fenêtre, et si le lien survolé n'existe plus (page changée).
for (const ev of ["mousedown", "wheel", "keydown", "blur"]) window.addEventListener(ev, hideHover, true);
document.addEventListener("mouseleave", hideHover);
setInterval(() => { if (!$("#hover").hidden && (!hoverFor || !hoverFor.isConnected)) hideHover(); }, 400);

// ---------- démarrage ----------
async function boot() {
  let info = await B.info();
  if (!info) { $("#status").textContent = "Aucun coffre ouvert"; if (!(await B.chooseVault())) return; info = await B.info(); }
  setStats(info);
  await loadTree();
  renderLegend(brain.apply(store.get("view6", {})));
  await loadGraph();
  renderLegend(brain.apply(store.get("view6", {})));
  syncPanel();
  go("home");
}
boot();
