// Accueil « Axon » : des WIDGETS réglables (afficher / masquer, déplacer, 4 tailles), données EN DIRECT.
// Crypto chaque seconde, bourse toutes les 10 s, météo Fribourg / Berne toutes les 10 min (prévisions 7 jours).
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const chg = (c) => (c == null || Number.isNaN(+c) ? `<span class="chg"></span>` : `<span class="chg ${c >= 0 ? "pos" : "neg"}">${c >= 0 ? "+" : "−"}${Math.abs(c).toFixed(2).replace(".", ",")} %</span>`);
const ago = (iso) => {
  if (!iso) return "—";
  const m = Math.round((Date.now() - (typeof iso === "number" ? iso : Date.parse(iso))) / 60000);
  return m < 1 ? "à l'instant" : m < 60 ? `il y a ${m} min` : m < 1440 ? `il y a ${Math.round(m / 60)} h` : `il y a ${Math.round(m / 1440)} j`;
};
const keyOf = (id, x) => `${id}:${x.key || x.label}`;
const row = (id, x) => `<div class="w-row" data-k="${esc(keyOf(id, x))}"><span class="w-l">${esc(x.label)}</span><span class="w-v"><b>${esc(x.value)}</b>${chg(x.change)}</span></div>`;

// ---------- météo : libellés et icônes (codes WMO d'Open-Meteo) ----------
export const WMO = (c) => c === 0 ? ["Dégagé", "sun"] : c <= 2 ? ["Peu nuageux", "partly"] : c === 3 ? ["Couvert", "cloud"] : c <= 48 ? ["Brouillard", "fog"] : c <= 57 ? ["Bruine", "drizzle"] : c <= 67 ? ["Pluie", "rain"] : c <= 77 ? ["Neige", "snow"] : c <= 82 ? ["Averses", "rain"] : c <= 86 ? ["Averses de neige", "snow"] : ["Orage", "storm"];
const ICON = {
  sun: `<circle cx="16" cy="16" r="6" fill="#ffd66b"/><g stroke="#ffd66b" stroke-width="2" stroke-linecap="round">${Array.from({ length: 8 }, (_, i) => { const a = (i * Math.PI) / 4; return `<line x1="${16 + Math.cos(a) * 9.5}" y1="${16 + Math.sin(a) * 9.5}" x2="${16 + Math.cos(a) * 12.5}" y2="${16 + Math.sin(a) * 12.5}"/>`; }).join("")}</g>`,
  moon: `<path d="M20 6a10 10 0 1 0 6 18A8 8 0 0 1 20 6z" fill="#dfe6ff"/>`,
  cloud: `<path d="M9 23h14a5 5 0 0 0 .6-9.96A7 7 0 0 0 10.2 15 4 4 0 0 0 9 23z" fill="#d7dbe3"/>`,
  partly: `<circle cx="12" cy="12" r="5" fill="#ffd66b"/><path d="M11 25h13a4.5 4.5 0 0 0 .5-8.97A6.5 6.5 0 0 0 12.1 18 3.5 3.5 0 0 0 11 25z" fill="#e6e9ef"/>`,
  fog: `<g stroke="#c9ced8" stroke-width="2.2" stroke-linecap="round"><line x1="6" y1="12" x2="26" y2="12"/><line x1="4" y1="17" x2="24" y2="17"/><line x1="8" y1="22" x2="28" y2="22"/></g>`,
  drizzle: `<path d="M9 19h14a5 5 0 0 0 .6-9.96A7 7 0 0 0 10.2 11 4 4 0 0 0 9 19z" fill="#cfd5df"/><g stroke="#7cc4ff" stroke-width="2" stroke-linecap="round"><line x1="12" y1="23" x2="11" y2="25"/><line x1="17" y1="23" x2="16" y2="25"/><line x1="22" y1="23" x2="21" y2="25"/></g>`,
  rain: `<path d="M9 18h14a5 5 0 0 0 .6-9.96A7 7 0 0 0 10.2 10 4 4 0 0 0 9 18z" fill="#bfc6d2"/><g stroke="#62b2ff" stroke-width="2.2" stroke-linecap="round"><line x1="12" y1="21" x2="10" y2="26"/><line x1="17" y1="21" x2="15" y2="26"/><line x1="22" y1="21" x2="20" y2="26"/></g>`,
  snow: `<path d="M9 18h14a5 5 0 0 0 .6-9.96A7 7 0 0 0 10.2 10 4 4 0 0 0 9 18z" fill="#dfe4ec"/><g fill="#fff"><circle cx="11" cy="23" r="1.6"/><circle cx="16" cy="25" r="1.6"/><circle cx="21" cy="23" r="1.6"/></g>`,
  storm: `<path d="M9 17h14a5 5 0 0 0 .6-9.96A7 7 0 0 0 10.2 9 4 4 0 0 0 9 17z" fill="#9aa3b2"/><path d="M17 18l-4 6h3l-2 5 6-8h-3l2-3z" fill="#ffd66b"/>`,
};
const icon = (code, day = true, cls = "") => { let k = WMO(code)[1]; if (!day && k === "sun") k = "moon"; return `<svg class="wx ${cls}" viewBox="0 0 32 32">${ICON[k]}</svg>`; };
const DAYS = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];

function weatherBody(m, size) {
  if (!m) return `<div class="w-empty">Météo en cours de chargement…</div>`;
  const [label] = WMO(m.now.code);
  const mood = !m.now.jour ? "night" : ["sun", "partly"].includes(WMO(m.now.code)[1]) ? "clear" : ["rain", "drizzle", "storm"].includes(WMO(m.now.code)[1]) ? "rain" : "grey";
  const lo = Math.min(...m.jours.map((d) => d.min)), hi = Math.max(...m.jours.map((d) => d.max)), span = Math.max(1, hi - lo);
  const hours = m.heures.filter((_, i) => i % 2 === 0).slice(0, size === "s" ? 4 : 8).map((h, i) => `<div class="wh" style="--i:${i}"><small>${i === 0 ? "Mtn" : esc(h.h.slice(0, 2)) + " h"}</small>${icon(h.code, +h.h.slice(0, 2) >= 7 && +h.h.slice(0, 2) <= 18)}<b>${Math.round(h.t)}°</b></div>`).join("");
  const week = m.jours.map((d, i) => {
    const l = ((d.min - lo) / span) * 100, w = ((d.max - d.min) / span) * 100;
    return `<div class="wd" style="--i:${i}"><span class="wd-day">${i === 0 ? "Auj." : DAYS[new Date(d.date + "T12:00").getDay()]}</span>${icon(d.code)}<span class="wd-pp">${d.pp >= 20 ? `${d.pp} %` : ""}</span><span class="wd-min">${Math.round(d.min)}°</span><span class="wd-bar"><i style="left:${l}%;width:${Math.max(6, w)}%"></i></span><span class="wd-max">${Math.round(d.max)}°</span></div>`;
  }).join("");
  return `<div class="wx-card ${mood}">
    <div class="wx-top"><div><div class="wx-city">${esc(m.ville)}</div><div class="wx-temp">${Math.round(m.now.t)}°</div><div class="wx-label">${esc(label)} · max ${Math.round(m.jours[0].max)}° min ${Math.round(m.jours[0].min)}°</div></div>${icon(m.now.code, m.now.jour, "big")}</div>
    ${size !== "s" ? `<div class="wx-stats"><span>Ressenti <b>${Math.round(m.now.ressenti)}°</b></span><span>Vent <b>${Math.round(m.now.vent)} km/h</b></span><span>Humidité <b>${m.now.humidite} %</b></span></div>` : ""}
    <div class="wx-hours">${hours}</div>
    ${size === "l" || size === "xl" ? `<div class="wx-week">${week}</div>` : ""}
  </div>`;
}

// ---------- catalogue des widgets ----------
export const WIDGETS = {
  horloge: { titre: "Horloge", tailles: ["s", "m"], defaut: "m" },
  "meteo-fribourg": { titre: "Météo · Fribourg", tailles: ["s", "m", "l"], defaut: "l" },
  "meteo-berne": { titre: "Météo · Berne", tailles: ["s", "m", "l"], defaut: "l" },
  crypto: { titre: "Crypto", tailles: ["m", "l", "xl"], defaut: "m" },
  marches: { titre: "Marchés", tailles: ["m", "l", "xl"], defaut: "l" },
  devises: { titre: "Devises · BCE", tailles: ["s", "m"], defaut: "m" },
  cerveau: { titre: "Cerveau", tailles: ["s", "m"], defaut: "m" },
  "veille-montres": { titre: "Veille · montres de luxe", tailles: ["m", "l", "xl"], defaut: "m" },
  "veille-ecom": { titre: "Veille · e-commerce", tailles: ["m", "l", "xl"], defaut: "m" },
  "veille-ia": { titre: "Veille · IA et tech", tailles: ["m", "l", "xl"], defaut: "m" },
  recent: { titre: "Récemment", tailles: ["m", "l"], defaut: "m" },
};
export const DEFAULT_LAYOUT = ["horloge", "meteo-fribourg", "crypto", "marches", "meteo-berne", "devises", "cerveau", "veille-montres", "veille-ecom", "veille-ia", "recent"].map((id) => ({ id, size: WIDGETS[id].defaut, on: true }));

export function home({ flux, stats, meta, live = {}, layout = DEFAULT_LAYOUT, editing = false }) {
  const h = new Date().getHours();
  const hello = h < 6 ? "Bonne nuit" : h < 12 ? "Bonjour" : h < 18 ? "Bon après-midi" : "Bonsoir";
  const F = Object.fromEntries(flux.map((f) => [f.id, f]));
  const empty = `<div class="w-empty">En attente des données…</div>`;
  const list = (id) => ((live[id]?.length ? live[id] : F[id]?.widget) || []).map((x) => row(id, x)).join("") || empty;
  const news = (id, n) => (F[id]?.widget || []).slice(0, n).map((x) => `<a class="w-news" href="${esc(x.link)}" target="_blank" rel="noreferrer">${esc(x.label)}<small>${esc(x.sub || "")}</small></a>`).join("") || empty;
  const meteo = Object.fromEntries((live.meteo || []).map((m) => [m.key, m]));
  const recent = [...meta].filter((n) => !(/^(95-Flux|99-Systeme)\//.test(n.rel) || /(^|\/)Banques\//.test(n.rel))).sort((a, b) => b.mtime - a.mtime);
  const body = (id, size) => {
    switch (id) {
      case "horloge": return `<div class="clock-w"><svg class="clock-ring" viewBox="0 0 100 100"><circle cx="50" cy="50" r="46"/><circle class="sec" cx="50" cy="50" r="46" data-sec-ring/></svg><div><div class="clock-big" data-clock>${new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</div><div class="clock-date">${new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}</div><div class="clock-zone">Fribourg · Suisse</div></div></div>`;
      case "meteo-fribourg": return weatherBody(meteo.fribourg, size);
      case "meteo-berne": return weatherBody(meteo.berne, size);
      case "crypto": case "marches": case "devises": return list(id);
      case "cerveau": return `<div class="kp"><div><b data-count="${stats.notes}">${stats.notes}</b><span>neurones</span></div><div><b data-count="${stats.links}">${stats.links}</b><span>synapses</span></div>${size !== "s" ? `<div><b data-count="${stats.files}">${stats.files}</b><span>médias</span></div>` : ""}</div>`;
      case "veille-montres": case "veille-ecom": case "veille-ia": return news(id, size === "m" ? 4 : 7);
      case "recent": return recent.slice(0, size === "l" ? 12 : 6).map((n) => `<div class="w-row link" data-rel="${esc(n.rel)}"><span class="w-l">${esc(n.title)}</span><span class="w-v dim">${esc(n.region || n.folder)}</span></div>`).join("");
      default: return empty;
    }
  };
  const note = (id) => ({ crypto: "Binance · en direct", marches: "Yahoo · 10 s", devises: ago(F.devises?.maj), cerveau: stats.sem ? "mémoire du sens prête" : "calcul du sens…", "meteo-fribourg": meteo.fribourg ? ago(meteo.fribourg.maj) : "", "meteo-berne": meteo.berne ? ago(meteo.berne.maj) : "" }[id] ?? (F[id] ? ago(F[id].maj) : ""));
  const shown = layout.filter((w) => w.on && WIDGETS[w.id]);
  const hidden = layout.filter((w) => !w.on && WIDGETS[w.id]);
  const tools = (w) => `<div class="w-tools">${WIDGETS[w.id].tailles.map((t) => `<button class="${w.size === t ? "on" : ""}" data-size="${t}" data-w="${w.id}">${t.toUpperCase()}</button>`).join("")}<button class="w-hide" data-hide="${w.id}" title="Masquer">✕</button></div>`;
  const widgets = shown.map((w, i) => `<section class="w lg size-${w.size}" data-card="${w.id}" ${F[w.id]?.rel ? `data-rel="${esc(F[w.id].rel)}"` : ""} ${editing ? `draggable="true"` : ""} style="--i:${i}">
      ${editing ? tools(w) : ""}
      ${w.id.startsWith("meteo") || w.id === "horloge" ? "" : `<header><span>${WIDGETS[w.id].titre}</span><small>${note(w.id)}</small></header>`}
      <div class="w-body">${body(w.id, w.size)}</div></section>`).join("");
  const tick = ["crypto", "marches"].flatMap((id) => (live[id]?.length ? live[id] : F[id]?.widget || []).map((x) => `<span class="tk" data-k="${esc(keyOf(id, x))}"><em>${esc(x.label)}</em> <b>${esc(x.value)}</b> ${chg(x.change)}</span>`)).join('<span class="tk-sep">·</span>');
  return `<div class="home ${editing ? "editing" : ""}">
  <div class="home-head">
    <div><div class="brand"><b>AXON</b> · ${String(stats?.root || "").split(/[\\/]/).pop().toUpperCase()}</div><div class="hello">${hello}.</div><div class="date">${new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · <span id="clock">${new Date().toLocaleTimeString("fr-FR")}</span></div></div>
    <div class="home-actions"><span class="live"><i></i>En direct</span><button class="h-btn" id="bEditHome">${editing ? "Terminé" : "Personnaliser"}</button><button class="h-btn primary" id="bFlux">Actualiser</button></div>
  </div>
  ${tick ? `<div class="ticker"><div class="ticker-track">${tick}<span class="tk-sep">·</span>${tick}</div></div>` : ""}
  ${editing ? `<div class="w-tray">${hidden.length ? `<span>Ajouter :</span>${hidden.map((w) => `<button data-show="${w.id}">＋ ${WIDGETS[w.id].titre}</button>`).join("")}` : `<span>Glisse les widgets pour les déplacer · choisis une taille · ✕ pour masquer</span>`}<button class="ghost" data-reset>Disposition par défaut</button></div>` : ""}
  <div class="wgrid">${widgets}</div></div>`;
}

// Mise à jour EN PLACE (cours qui changent, avec un éclat ; météo redessinée).
export function patchLive(root, { id, widget }) {
  if (id === "meteo") {
    for (const m of widget) {
      const card = root.querySelector(`[data-card="meteo-${m.key}"] .w-body`);
      if (card) { const size = (card.parentElement.className.match(/size-(\w+)/) || [])[1] || "m"; card.innerHTML = weatherBody(m, size); }
    }
    return;
  }
  for (const x of widget) {
    const k = keyOf(id, x);
    for (const el of root.querySelectorAll(`[data-k="${CSS.escape(k)}"]`)) {
      const b = el.querySelector("b"); if (!b) continue;
      if (b.textContent !== x.value) {
        const up = (x.raw ?? 0) >= (+el.dataset.raw || 0);
        b.textContent = x.value; el.dataset.raw = x.raw ?? "";
        el.classList.remove("flash-up", "flash-down"); void el.offsetWidth; el.classList.add(up ? "flash-up" : "flash-down");
      }
      const c = el.querySelector(".chg");
      if (c && x.change != null) { c.className = `chg ${x.change >= 0 ? "pos" : "neg"}`; c.textContent = `${x.change >= 0 ? "+" : "−"}${Math.abs(x.change).toFixed(2).replace(".", ",")} %`; }
    }
    const card = root.querySelector(`[data-card="${id}"] .w-body`);
    if (card && !card.querySelector(`[data-k="${CSS.escape(k)}"]`)) card.innerHTML = widget.map((w) => row(id, w)).join("");
  }
}

// Reflet qui suit la souris + horloge à aiguille des secondes.
export function glassPointer(root) {
  root.addEventListener("pointermove", (e) => {
    const c = e.target.closest(".lg"); if (!c) return;
    const r = c.getBoundingClientRect();
    c.style.setProperty("--mx", `${((e.clientX - r.left) / r.width) * 100}%`);
    c.style.setProperty("--my", `${((e.clientY - r.top) / r.height) * 100}%`);
  });
  setInterval(() => {
    const now = new Date();
    for (const el of root.querySelectorAll("[data-clock]")) el.textContent = now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    for (const r of root.querySelectorAll("[data-sec-ring]")) r.style.strokeDashoffset = String(289 - (289 * (now.getSeconds() + now.getMilliseconds() / 1000)) / 60);
  }, 250);
}
