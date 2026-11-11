// Vue « neurone ouvert en grand » (double-clic sur un neurone) : le neurone apparaît devant l'écran
// avec son orbe animé, ses sous-titres, ses médias en aperçu, son contenu complet et ses liens.
import { render, splitFrontmatter, mediaUrl, kindOfRel } from "./markdown.js";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fmt = (t) => (t ? new Date(t).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "");

export function createFocus({ B, brain, resolveName, openRel }) {
  const root = document.createElement("div");
  root.id = "nfocus"; root.hidden = true;
  document.body.appendChild(root);
  let current = null;

  function close() {
    if (root.hidden) return;
    root.classList.remove("in");
    setTimeout(() => { root.hidden = true; root.innerHTML = ""; current = null; }, 320);
  }
  async function open(id) {
    const info = brain.info(id); if (!info) return;
    current = id;
    const note = info.kind === "note" ? await B.getNote(id).catch(() => null) : null;
    if (current !== id) return;
    const body = note ? splitFrontmatter(note.content).body : "";
    const fm = note?.fm || {};
    const desc = String(fm.resume || "").trim();
    // médias intégrés : aperçus (images et vidéos) en haut
    const medias = [...body.matchAll(/!\[\[([^\]|#]+)(?:\|[^\]]*)?\]\]/g)].map((m) => resolveName(m[1].trim())).filter(Boolean)
      .filter((r) => ["image", "video"].includes(kindOfRel(r))).filter((r) => !/\/_mini\//.test(r) || true).slice(0, 8);
    const media = medias.map((r, i) => kindOfRel(r) === "video"
      ? `<div class="nf-m" style="--i:${i}"><video src="${mediaUrl(r)}" muted loop preload="metadata" onmouseenter="this.play()" onmouseleave="this.pause()"></video></div>`
      : `<div class="nf-m" style="--i:${i}"><img src="${mediaUrl(r)}" loading="lazy" alt=""></div>`).join("");
    const chips = info.neighbors.slice(0, 24).map((m, i) => `<button class="nf-chip" style="--c:${m.color};--i:${i}" data-nf="${esc(m.id)}"><i></i>${esc(m.name)}</button>`).join("");
    const words = body.split(/\s+/).filter(Boolean).length;
    const meta = [info.region, fm.type, fmt(info.created), `${info.neighbors.length} liens`, note ? `${note.backlinks?.length || 0} rétroliens` : "", words ? `${words} mots` : ""].filter(Boolean);
    root.innerHTML = `
      <div class="nf-back" data-nfclose></div>
      <article class="nf-panel" style="--c:${info.color}">
        <button class="nf-x" data-nfclose title="Fermer (Échap)">✕</button>
        <header class="nf-head">
          <div class="nf-orb"><span class="r1"></span><span class="r2"></span><span class="r3"></span><i></i>${Array.from({ length: 10 }, (_, k) => `<em style="--k:${k}"></em>`).join("")}</div>
          <div class="nf-titles">
            <div class="nf-kicker">${esc(String(info.region || "").toUpperCase())}${fm.type ? ` · ${esc(String(fm.type).toUpperCase())}` : ""}</div>
            <h1>${esc(info.name)}</h1>
            ${desc ? `<p class="nf-desc">${esc(desc)}</p>` : ""}
            <div class="nf-meta">${meta.map((m) => `<span>${esc(m)}</span>`).join("")}</div>
            <div class="nf-actions">
              ${info.kind === "note" ? `<button class="primary" data-nfopen="${esc(id)}">Ouvrir la note</button>` : ""}
              <button data-nfgo="${esc(id)}">Voir dans le cerveau</button>
            </div>
          </div>
        </header>
        ${media ? `<section class="nf-media">${media}</section>` : ""}
        <section class="nf-body md">${body ? render(body, resolveName) : `<p class="nf-empty">Ce neurone n'a pas encore de contenu.</p>`}</section>
        ${chips ? `<footer class="nf-links"><div class="nf-label">Relié à ${info.neighbors.length} neurone(s)</div><div class="nf-chips">${chips}</div></footer>` : ""}
      </article>`;
    root.hidden = false;
    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add("in")));
    root.querySelector(".nf-panel").scrollTop = 0;
  }
  root.addEventListener("click", (e) => {
    if (e.target.closest("[data-nfclose]")) return close();
    const o = e.target.closest("[data-nfopen]"); if (o) { close(); return openRel(o.dataset.nfopen); }
    const g = e.target.closest("[data-nfgo]"); if (g) { close(); return brain.focus(g.dataset.nfgo); }
    const n = e.target.closest("[data-nf]"); if (n) { brain.select(n.dataset.nf); root.querySelector(".nf-panel")?.classList.add("swap"); return setTimeout(() => open(n.dataset.nf), 180); }
    const a = e.target.closest("a.wl"); if (a) { const rel = resolveName(a.dataset.link); if (rel) { brain.select(rel); open(rel); } }
  });
  window.addEventListener("keydown", (e) => { if (e.key === "Escape" && !root.hidden) close(); });
  return { open, close, isOpen: () => !root.hidden };
}
