// Pages du Brain : chronologie, chiffres, médias, santé, demander.
import { mediaUrl, kindOfRel, render } from "./markdown.js";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fmt = (t, o) => new Date(t).toLocaleDateString("fr-FR", o);
const nf = (n) => new Intl.NumberFormat("fr-FR").format(n);

export function timeline(meta, colorOf) {
  const items = [...meta].sort((a, b) => b.created - a.created);
  let html = `<div class="ph"><h1>Chronologie</h1><span class="sub">${items.length} notes, de la plus récente à la plus ancienne</span></div>`;
  let cur = "";
  for (const n of items) {
    const m = fmt(n.created, { month: "long", year: "numeric" });
    if (m !== cur) { cur = m; html += `<div class="tl-month">${esc(m)}</div>`; }
    html += `<div class="tl-item" data-rel="${esc(n.rel)}"><span class="d">${fmt(n.created, { day: "2-digit", month: "short" })}</span><span class="dot" style="color:${colorOf(n.folder)};background:${colorOf(n.folder)}"></span><div><b>${esc(n.title)}</b><small>${esc(n.folder)} · ${esc(n.summary || "")}</small></div></div>`;
  }
  return html || `<div class="empty-state"><div class="big">Rien pour l'instant</div>Crée ta première note avec Ctrl+N.</div>`;
}

export function numbers(meta, stats, colorOf) {
  const words = meta.reduce((s, n) => s + n.words, 0);
  const byFolder = {}; for (const n of meta) byFolder[n.folder] = (byFolder[n.folder] || 0) + 1;
  const folders = Object.entries(byFolder).sort((a, b) => b[1] - a[1]);
  const maxF = Math.max(1, ...folders.map((f) => f[1]));
  const byType = {}; for (const n of meta) byType[n.type] = (byType[n.type] || 0) + 1;
  const tags = {}; for (const n of meta) for (const t of n.tags) tags[t] = (tags[t] || 0) + 1;
  const hubs = [...meta].sort((a, b) => b.deg - a.deg).slice(0, 12);
  // Histogramme : notes créées par semaine (sur les 26 dernières semaines)
  const now = Date.now(), W = 7 * 864e5, weeks = new Array(26).fill(0);
  for (const n of meta) { const i = 25 - Math.floor((now - n.created) / W); if (i >= 0 && i < 26) weeks[i]++; }
  const maxW = Math.max(1, ...weeks);
  return `<div class="ph"><h1>Chiffres</h1><span class="sub">l'état de votre cerveau</span></div>
  <div class="kpis">
    <div class="kpi"><div class="v">${nf(stats.notes)}</div><div class="l">notes</div></div>
    <div class="kpi"><div class="v">${nf(stats.files)}</div><div class="l">fichiers et médias</div></div>
    <div class="kpi"><div class="v">${nf(stats.links)}</div><div class="l">synapses écrites</div></div>
    <div class="kpi"><div class="v">${nf(words)}</div><div class="l">mots</div></div>
  </div>
  <div class="box" style="margin-bottom:12px"><h3>Notes créées par semaine · 6 derniers mois</h3>
    <div class="hist">${weeks.map((w, i) => `<div style="height:${(w / maxW) * 100}%;animation-delay:${i * 18}ms" title="${w} note(s)"></div>`).join("")}</div>
    <div class="hist-l"><span>il y a 6 mois</span><span>aujourd'hui</span></div></div>
  <div class="grid2">
    <div class="box"><h3>Par dossier</h3>${folders.map(([f, c], i) => `<div class="bar"><span class="name">${esc(f)}</span><span class="t"><i style="width:${(c / maxF) * 100}%;background:${colorOf(f)};animation-delay:${i * 40}ms"></i></span><span class="n">${c}</span></div>`).join("")}</div>
    <div class="box"><h3>Hubs · notes les plus reliées</h3>${hubs.map((h) => `<div class="hub" data-rel="${esc(h.rel)}"><b>${esc(h.title)}</b><span>${h.deg} liens</span></div>`).join("")}</div>
    <div class="box"><h3>Par type</h3>${Object.entries(byType).sort((a, b) => b[1] - a[1]).map(([t, c]) => `<div class="bar"><span class="name">${esc(t)}</span><span class="t"><i style="width:${(c / meta.length) * 100}%;background:var(--accent-2)"></i></span><span class="n">${c}</span></div>`).join("")}</div>
    <div class="box"><h3>Tags</h3><div class="chips">${Object.entries(tags).sort((a, b) => b[1] - a[1]).slice(0, 40).map(([t, c]) => `<span class="chip">#${esc(t)} <span style="color:var(--faint)">${c}</span></span>`).join("") || '<span class="chip">aucun tag</span>'}</div></div>
  </div>`;
}

export function medias(tree, meta) {
  const files = tree.filter((t) => t.kind !== "note" && !/\.miniature\.jpg$/.test(t.rel)).sort((a, b) => b.mtime - a.mtime);
  const fiche = new Map(meta.filter((m) => m.type === "media").map((m) => [m.rel.replace(/\.md$/, ""), m.rel]));
  const thumbOf = new Set(tree.filter((t) => /\.miniature\.jpg$/.test(t.rel)).map((t) => t.rel));
  if (!files.length) return `<div class="ph"><h1>Médias</h1></div><div class="empty-state"><div class="big">Aucun média</div>Glisse des images, vidéos, sons ou PDF n'importe où dans la fenêtre.</div>`;
  return `<div class="ph"><h1>Médias</h1><span class="sub">${files.length} fichiers · glisse-en d'autres dans la fenêtre</span></div>
  <div class="gallery">${files.map((f) => {
    const k = f.kind, base = f.rel.replace(/\.[^.]+$/, "");
    const thumb = base + ".miniature.jpg";
    const open = fiche.get(base) || f.rel;
    let th = `<div class="th">${{ audio: "♪", pdf: "PDF", file: "◇" }[k] || "◇"}</div>`;
    if (k === "image") th = `<div class="th" style="background-image:url('${mediaUrl(f.rel)}')"></div>`;
    else if (k === "video") th = thumbOf.has(thumb) ? `<div class="th" style="background-image:url('${mediaUrl(thumb)}')"></div>` : `<div class="th"><video src="${mediaUrl(f.rel)}#t=1" preload="metadata" muted></video></div>`;
    return `<div class="tile" data-rel="${esc(open)}">${th.replace('<div class="th"', `<div class="th"`).replace("</div>", `<span class="badge">${k}</span></div>`)}<div class="cap">${esc(f.title)}<small>${new Date(f.mtime).toLocaleDateString("fr-FR")}</small></div></div>`;
  }).join("")}</div>`;
}

export function health(r, reportMd, resolve) {
  const col = r.score >= 85 ? "var(--ok)" : r.score >= 60 ? "var(--warn)" : "var(--hot)";
  return `<div class="ph"><h1>Santé</h1><span class="sub">contrôle automatique du cerveau (méthode Karpathy)</span><span class="grow"></span><button id="bLint">Relancer l'analyse</button></div>
  <div class="kpis">
    <div class="kpi"><div class="v" style="color:${col}">${r.score}</div><div class="l">score sur 100</div></div>
    <div class="kpi"><div class="v">${r.broken}</div><div class="l">liens cassés</div></div>
    <div class="kpi"><div class="v">${r.orphans}</div><div class="l">notes orphelines</div></div>
    <div class="kpi"><div class="v">${r.duplicates}</div><div class="l">doublons probables</div></div>
  </div>
  <div class="box"><div class="md" style="padding:0;max-width:none">${render(reportMd, resolve)}</div></div>`;
}

export function ask(results, ctx) {
  return `<div class="ph"><h1>Demander</h1><span class="sub">recherche neuronale : mots + sens + propagation dans les synapses</span></div>
  <form class="ask" id="askForm"><input id="askQ" placeholder="Ex. : qu'est-ce qu'on a décidé pour les statiques ?" autocomplete="off"><button class="primary">Chercher</button></form>
  ${results ? (results.length ? results.map((r) => `<div class="res-card" data-rel="${esc(r.rel)}"><b>${esc(r.title)}</b><span class="via">${r.via === "propagation" ? "trouvé par propagation" : "direct"}</span><small>${esc(r.folder || "")} · ${esc(r.summary || "")}</small></div>`).join("") : '<div class="empty-state">Rien trouvé.</div>') : '<div class="empty-state"><div class="big">Pose une question au cerveau</div>Il cherche par les mots, par le sens, puis laisse l\'activation se propager le long des liens pour trouver ce qui est relié.</div>'}
  ${ctx ? `<div class="box" style="margin-top:16px"><h3>Paquet de contexte prêt pour une IA <button class="ghost" id="copyCtx" style="float:right;margin-top:-6px">Copier</button></h3><div class="ctx" id="ctxText">${esc(ctx)}</div></div>` : ""}`;
}
