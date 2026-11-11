// Méthode « LLM Knowledge Base » (Karpathy) appliquée au Brain :
//  - index automatiques : chaque dossier a un _index.md avec une ligne de résumé par note
//    (l'IA lit l'index avant d'ouvrir les notes → peu de tokens, ne se perd pas) ;
//  - santé du cerveau : liens cassés, orphelins, doublons, notes sans résumé, médias non décrits… ;
//  - recherche hybride (mots + sens, fusion des rangs) ;
//  - paquet de contexte : ce qu'une IA doit lire pour répondre à une question, déjà trié et compact.
import path from "node:path";

export const AUTO = "index-auto";
const today = () => new Date().toISOString().slice(0, 10);
const isAuto = (n) => n.fm?.type === AUTO;
const summaryOf = (n) => String(n.fm?.resume || n.fm?.summary || n.summary || "").replace(/\s+/g, " ").replace(/\|/g, "/").slice(0, 160);
const words = (s) => (s.match(/\S+/g) || []).length;

// ---------- index automatiques ----------
export async function buildIndexes(vault) {
  const byDir = new Map();
  for (const n of vault.notes.values()) {
    if (isAuto(n)) continue;
    const dir = path.posix.dirname(n.rel);
    if (dir === ".") continue;
    for (let d = dir; d !== "."; d = path.posix.dirname(d)) if (!byDir.has(d)) byDir.set(d, { notes: [], subdirs: new Set() });
    byDir.get(dir).notes.push(n);
    let d = dir;
    while (path.posix.dirname(d) !== ".") { byDir.get(path.posix.dirname(d)).subdirs.add(d); d = path.posix.dirname(d); }
  }
  const written = [];
  for (const [dir, { notes, subdirs }] of byDir) {
    const name = dir.split("/").pop();
    const lines = [
      "---", `type: ${AUTO}`, "tags: [systeme, index]", `maj: ${today()}`, "---",
      `# Index · ${name}`, "",
      "> Généré automatiquement par le Brain. Une ligne par note : lis ce résumé avant d'ouvrir une note.", "",
    ];
    if (subdirs.size) {
      lines.push("## Sous-dossiers", "");
      for (const s of [...subdirs].sort()) lines.push(`- [[${s}/_index|${s.split("/").pop()}]] · ${countIn(byDir, s)} notes`);
      lines.push("");
    }
    if (notes.length) {
      lines.push("## Notes", "", "| Note | Résumé | Tags | Date |", "|---|---|---|---|");
      for (const n of notes.sort((a, b) => a.title.localeCompare(b.title, "fr")))
        lines.push(`| [[${n.title}]] | ${summaryOf(n) || "_à résumer_"} | ${n.tags.slice(0, 4).join(", ")} | ${new Date(n.created).toISOString().slice(0, 10)} |`);
    }
    const rel = `${dir}/_index.md`;
    const content = lines.join("\n") + "\n";
    const prev = await vault.read(rel).catch(() => null);
    if (prev?.replace(/maj: .*/, "") !== content.replace(/maj: .*/, "")) { await vault.write(rel, content); written.push(rel); }
  }
  // Carte racine : tous les dossiers, du plus gros au plus petit.
  const top = [...byDir.keys()].filter((d) => !d.includes("/")).sort();
  const root = [
    "---", `type: ${AUTO}`, "tags: [systeme, index]", `maj: ${today()}`, "---", "# Carte automatique du Brain", "",
    `${[...vault.notes.values()].filter((n) => !isAuto(n)).length} notes · ${vault.files.size} fichiers. Point d'entrée pour toute IA : lis cette page, puis l'index du dossier utile, puis la note.`, "",
    ...top.map((d) => `- [[${d}/_index|${d}]] · ${countIn(byDir, d)} notes`),
  ].join("\n") + "\n";
  const prevRoot = await vault.read("99-Systeme/carte-auto.md").catch(() => null);
  if (prevRoot?.replace(/maj: .*/, "") !== root.replace(/maj: .*/, "")) { await vault.write("99-Systeme/carte-auto.md", root); written.push("99-Systeme/carte-auto.md"); }
  return written;
}
function countIn(byDir, dir) {
  let c = byDir.get(dir)?.notes.length || 0;
  for (const s of byDir.get(dir)?.subdirs || []) c += countIn(byDir, s);
  return c;
}

// ---------- santé ----------
export async function lint(vault, semantic) {
  const notes = [...vault.notes.values()].filter((n) => !isAuto(n) && n.folder !== "99-Systeme");
  const incoming = new Map();
  const broken = [];
  for (const n of vault.notes.values()) {
    for (const l of [...n.links, ...n.embeds]) {
      const t = vault.resolve(l);
      if (!t) broken.push({ from: n.title, to: l });
      else if (!isAuto(n)) incoming.set(t, (incoming.get(t) || 0) + 1);
    }
  }
  const orphans = notes.filter((n) => !incoming.get(n.rel) && !n.links.length && !n.embeds.length);
  const noLinks = notes.filter((n) => !n.links.length && !n.embeds.length && incoming.get(n.rel));
  const noFm = notes.filter((n) => !Object.keys(n.fm || {}).length);
  const noSummary = notes.filter((n) => !summaryOf(n));
  const long = notes.filter((n) => words(n.text) > 2500);
  const mediaTodo = notes.filter((n) => n.fm?.type === "media" && n.fm?.statut === "a-decrire");
  const inbox = notes.filter((n) => n.folder === "00-Inbox");
  const dup = [];
  if (semantic?.ready) {
    const seen = new Set();
    for (const n of notes) for (const r of semantic.related(n.rel, 2)) {
      const key = [n.rel, r.rel].sort().join("|");
      if (r.score > 0.94 && !seen.has(key) && !isAuto(vault.notes.get(r.rel) || {})) { seen.add(key); dup.push({ a: n.title, b: r.title, score: r.score }); }
    }
  }
  const unusedFiles = [...vault.files.values()].filter((f) => !/\.miniature\.jpg$/.test(f.name) && !incoming.get(f.rel));
  const issues = broken.length + orphans.length + noFm.length + mediaTodo.length + dup.length;
  const score = Math.max(0, Math.round(100 - (issues / Math.max(notes.length, 1)) * 60 - Math.min(inbox.length, 20)));

  const L = (arr, f) => (arr.length ? arr.slice(0, 60).map(f).join("\n") : "- Rien à signaler ✓");
  const md = [
    "---", `type: ${AUTO}`, "tags: [systeme, sante]", `maj: ${today()}`, "---", "# Santé du Brain", "",
    `**Score : ${score}/100** · ${notes.length} notes analysées · ${vault.files.size} fichiers`, "",
    "> Rapport généré automatiquement. Une IA peut le lire et corriger les points un par un (commande « brain-lint »).", "",
    `## Liens cassés (${broken.length})`, L(broken, (b) => `- [[${b.from}]] pointe vers « ${b.to} », qui n'existe pas`), "",
    `## Notes orphelines (${orphans.length})`, "Aucun lien entrant ni sortant : elles sont perdues dans le cerveau.", L(orphans, (n) => `- [[${n.title}]]`), "",
    `## Notes sans liens sortants (${noLinks.length})`, L(noLinks, (n) => `- [[${n.title}]]`), "",
    `## Sans frontmatter (${noFm.length})`, L(noFm, (n) => `- [[${n.title}]]`), "",
    `## Sans résumé (${noSummary.length})`, L(noSummary, (n) => `- [[${n.title}]]`), "",
    `## Trop longues, à découper (${long.length})`, L(long, (n) => `- [[${n.title}]] · ${words(n.text)} mots`), "",
    `## Doublons probables (${dup.length})`, L(dup, (d) => `- [[${d.a}]] ≈ [[${d.b}]] (${Math.round(d.score * 100)} %)`), "",
    `## Médias à décrire (${mediaTodo.length})`, L(mediaTodo, (n) => `- [[${n.title}]]`), "",
    `## Fichiers jamais référencés (${unusedFiles.length})`, L(unusedFiles, (f) => `- ${f.rel}`), "",
    `## Inbox à trier (${inbox.length})`, L(inbox, (n) => `- [[${n.title}]]`), "",
  ].join("\n") + "\n";
  await vault.write("99-Systeme/Sante du cerveau.md", md);
  return { score, broken: broken.length, orphans: orphans.length, noFrontmatter: noFm.length, noSummary: noSummary.length, long: long.length, duplicates: dup.length, mediaTodo: mediaTodo.length, inbox: inbox.length, unusedFiles: unusedFiles.length };
}

// ---------- recherche hybride (Reciprocal Rank Fusion) ----------
export async function hybrid(vault, semantic, q, k = 10) {
  const text = vault.search(q, 40).filter((r) => !isAuto(vault.notes.get(r.rel) || {}));
  // Recherche par le sens si le modèle local est là ; sinon (connecteur portable), on reste sur les mots.
  const sens = semantic?.ready ? (await semantic.query(q, 40).catch(() => [])).filter((r) => !isAuto(vault.notes.get(r.rel) || {})) : [];
  const score = new Map();
  const add = (list, w) => list.forEach((r, i) => score.set(r.rel, (score.get(r.rel) || 0) + w / (60 + i)));
  add(text, 1); add(sens, 1.3);
  // Les notes système (règles, index, log) passent après le contenu réel.
  for (const [rel, s] of score) if (/^(CLAUDE|README)\.md$|^99-Systeme\//.test(rel)) score.set(rel, s * 0.45);
  return [...score.entries()].sort((a, b) => b[1] - a[1]).slice(0, k).map(([rel, s]) => {
    const n = vault.notes.get(rel);
    return { rel, title: n?.title || rel, folder: n?.folder, summary: summaryOf(n || {}), score: +s.toFixed(4) };
  });
}

// ---------- paquet de contexte pour une IA ----------
// Les meilleures notes en entier (jusqu'au budget), puis leurs voisines en résumé d'une ligne.
export async function contextPack(vault, semantic, q, { budgetWords = 3500, k = 8 } = {}) {
  const hits = await hybrid(vault, semantic, q, k);
  const out = [`# Contexte du Brain pour : « ${q} »`, ""];
  let used = 0;
  const full = new Set();
  for (const h of hits) {
    const n = vault.notes.get(h.rel);
    if (!n) continue;
    const w = words(n.text);
    if (used + w > budgetWords) continue;
    used += w; full.add(h.rel);
    out.push(`## ${n.title}  (${h.rel})`, n.text.trim(), "");
  }
  const neighbours = new Map();
  for (const rel of full) {
    for (const o of vault.outlinks(rel)) if (o.rel && !full.has(o.rel)) neighbours.set(o.rel, "lien");
    for (const b of vault.backlinks(rel)) if (!full.has(b.rel)) neighbours.set(b.rel, "rétrolien");
  }
  const rest = hits.filter((h) => !full.has(h.rel));
  if (rest.length || neighbours.size) {
    out.push("## À ouvrir si besoin (résumés)");
    for (const h of rest) out.push(`- ${h.title} (${h.rel}) : ${h.summary}`);
    for (const [rel, why] of [...neighbours].slice(0, 15)) {
      const n = vault.notes.get(rel);
      if (n && !isAuto(n)) out.push(`- ${n.title} (${rel}, ${why}) : ${summaryOf(n)}`);
    }
  }
  return { text: out.join("\n"), words: used, notes: [...full] };
}

// ---------- propagation façon HippoRAG 2 (PageRank personnalisé) ----------
// Graines = résultats de la recherche hybride. L'activation se propage le long des [[liens]],
// rétroliens et synapses du sens (kNN). damping 0.5 : on reste proche des graines.
export function personalizedPageRank(vault, semantic, seeds, { damping = 0.5, iters = 25, knn = 4 } = {}) {
  const adj = new Map();
  const add = (a, b, w) => {
    if (!adj.has(a)) adj.set(a, new Map());
    adj.get(a).set(b, Math.max(adj.get(a).get(b) || 0, w));
  };
  for (const n of vault.notes.values()) {
    if (isAuto(n)) continue;
    for (const l of [...n.links, ...n.embeds]) {
      const t = vault.resolve(l);
      if (t && t !== n.rel && vault.notes.has(t) && !isAuto(vault.notes.get(t))) { add(n.rel, t, 1); add(t, n.rel, 1); }
    }
    if (semantic?.ready) for (const r of semantic.related(n.rel, knn)) if (r.score > 0.6) { add(n.rel, r.rel, r.score); add(r.rel, n.rel, r.score); }
  }
  const total = seeds.reduce((s, x) => s + x.w, 0) || 1;
  const reset = new Map(seeds.map((s) => [s.rel, s.w / total]));
  let p = new Map(reset);
  for (let it = 0; it < iters; it++) {
    const next = new Map();
    for (const [rel, v] of reset) next.set(rel, (1 - damping) * v);
    for (const [rel, mass] of p) {
      const out = adj.get(rel);
      if (!out?.size) { next.set(rel, (next.get(rel) || 0) + damping * mass); continue; }
      let wsum = 0; for (const w of out.values()) wsum += w;
      for (const [to, w] of out) next.set(to, (next.get(to) || 0) + damping * mass * (w / wsum));
    }
    p = next;
  }
  return p;
}

// Recherche « neuronale » : hybride + propagation dans le graphe.
export async function neural(vault, semantic, q, k = 10) {
  const seeds = await hybrid(vault, semantic, q, 12);
  if (!seeds.length) return [];
  const pr = personalizedPageRank(vault, semantic, seeds.map((s, i) => ({ rel: s.rel, w: 1 / (1 + i) })));
  const max = Math.max(...pr.values());
  const score = new Map();
  seeds.forEach((s, i) => score.set(s.rel, 1 / (1 + i)));
  for (const [rel, v] of pr) score.set(rel, (score.get(rel) || 0) + 0.6 * (v / max));
  return [...score.entries()].sort((a, b) => b[1] - a[1]).slice(0, k).map(([rel, s]) => {
    const n = vault.notes.get(rel);
    return { rel, title: n?.title || rel, folder: n?.folder, summary: summaryOf(n || {}), score: +s.toFixed(4), via: seeds.some((x) => x.rel === rel) ? "direct" : "propagation" };
  });
}

// Métadonnées de toutes les notes pour les vues (chronologie, chiffres…).
export function meta(vault) {
  const deg = new Map();
  for (const n of vault.notes.values()) for (const l of [...n.links, ...n.embeds]) {
    const t = vault.resolve(l); if (!t) continue;
    deg.set(n.rel, (deg.get(n.rel) || 0) + 1); deg.set(t, (deg.get(t) || 0) + 1);
  }
  return [...vault.notes.values()].filter((n) => !isAuto(n)).map((n) => ({
    rel: n.rel, title: n.title, folder: n.folder, created: n.created, mtime: n.mtime, tags: n.tags,
    summary: summaryOf(n), words: words(n.text), type: n.fm?.type || "note", deg: deg.get(n.rel) || 0,
    media: n.fm?.media || null, statut: n.fm?.statut || null,
  }));
}
