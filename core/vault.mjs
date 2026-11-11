// Cœur du Brain : lit le coffre (dossier de notes Markdown + médias), construit le graphe,
// l'index de recherche, et gère création / import. Utilisé par l'app ET par le serveur MCP.
import fs from "node:fs/promises";
import fss from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import matter from "gray-matter";
import MiniSearch from "minisearch";
import { extractDoc, docSection, DOC_EXT } from "./docs.mjs";
import { P, logDuMois } from "./structure.mjs";

const EXT = {
  image: [".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".bmp", ".svg"],
  video: [".mp4", ".mov", ".webm", ".mkv", ".m4v", ".ogv"],
  audio: [".mp3", ".wav", ".m4a", ".ogg", ".flac", ".aac", ".opus"],
  pdf: [".pdf"],
  doc: [".docx", ".pptx", ".xlsx", ".xls", ".odt"],
};
const IGNORE = new Set([".git", ".obsidian", ".trash", "node_modules", ".brain"]);
// Zones « brutes » : elles forment le tronc et la colonne vertébrale du cerveau.
export const SPINE_ZONES = [P.inbox, P.journal, P.sources, P.fichiers];
export const MEDIA_DIR = P.fichiers;

export function kindOf(file) {
  const e = path.extname(file).toLowerCase();
  if (e === ".md") return "note";
  for (const [k, list] of Object.entries(EXT)) if (list.includes(e)) return k;
  return "file";
}

const slug = (s) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w\- .]+/g, "").replace(/\s+/g, " ").trim().slice(0, 80) || "sans-titre";
const today = () => new Date().toISOString().slice(0, 10);
const toPosix = (p) => p.split(path.sep).join("/");

export class Vault {
  constructor(root, { user = process.env.AXON_USER || "" } = {}) {
    this.root = path.resolve(root);
    this.user = user; // qui utilise ce cerveau (journal et log par personne)
    this.notes = new Map(); // rel -> note
    this.files = new Map(); // rel -> fichier non-markdown
    this.byName = new Map(); // nom en minuscule -> rel
    this.index = null;
  }

  abs(rel) {
    const p = path.resolve(this.root, rel);
    if (p !== this.root && !p.startsWith(this.root + path.sep)) throw new Error("Chemin hors du coffre : " + rel);
    return p;
  }

  async scan() {
    // Scan INCRÉMENTAL : une note dont la date et la taille n ont pas changé n est pas relue (gros cerveaux = rapide).
    this._prev = this.notes; this.notes = new Map(); this.files.clear(); this.byName.clear();
    const walk = async (dir) => {
      for (const ent of await fs.readdir(dir, { withFileTypes: true })) {
        if (IGNORE.has(ent.name) || ent.name.startsWith(".")) continue;
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) await walk(full);
        else await this.load(toPosix(path.relative(this.root, full)));
      }
    };
    await walk(this.root);
    this._prev = null;
    this.buildIndex();
    return this.stats();
  }

  async load(rel) {
    const full = this.abs(rel);
    const st = await fs.stat(full).catch(() => null);
    if (!st) { this.notes.delete(rel); this.files.delete(rel); return null; }
    const kind = kindOf(rel);
    const base = path.basename(rel);
    if (kind !== "note") {
      const f = { rel, kind, name: base, size: st.size, mtime: st.mtimeMs, created: st.birthtimeMs || st.mtimeMs };
      this.files.set(rel, f);
      this.byName.set(base.toLowerCase(), rel);
      return f;
    }
    const old = this._prev?.get(rel);
    if (old && old.mtime === st.mtimeMs && old.size === st.size) { this.notes.set(rel, old); this.byName.set(old.title.toLowerCase(), rel); return old; }
    const raw = await fs.readFile(full, "utf8");
    let fm = {}, body = raw;
    try { const m = matter(raw); fm = m.data || {}; body = m.content; }
    catch {
      // YAML invalide (ex. « resume: Idée : … » sans guillemets) : lecture tolérante ligne par ligne.
      const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
      if (m) {
        body = raw.slice(m[0].length);
        for (const line of m[1].split(/\r?\n/)) {
          const kv = line.match(/^([\w-]+):\s*(.*)$/); if (!kv) continue;
          let v = kv[2].trim();
          if (/^\[.*\]$/.test(v)) v = v.slice(1, -1).split(",").map((s) => s.trim()).filter(Boolean);
          else v = v.replace(/^["']|["']$/g, "");
          fm[kv[1]] = v;
        }
      }
    }
    const title = path.basename(rel, ".md");
    const links = [], embeds = [];
    const plain = body.replace(/```[\s\S]*?```|`[^`\n]+`/g, "");
    for (const m of plain.matchAll(/(!?)\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g)) (m[1] ? embeds : links).push(m[2].trim());
    const tags = new Set([].concat(fm.tags || []).map(String).filter(Boolean));
    for (const m of plain.matchAll(/(?:^|\s)#([\p{L}\d_\-/]+)/gu)) tags.add(m[1]);
    const created = Date.parse(fm.cree || fm.created || fm.date || "") || st.birthtimeMs || st.mtimeMs;
    const summary = body.replace(/^#.*$/gm, "").replace(/[*_>`|]/g, "").split(/\n\s*\n/).map((s) => s.trim()).find((s) => s.length > 20) || "";
    const note = {
      rel, kind: "note", title, folder: rel.includes("/") ? rel.split("/")[0] : "racine",
      fm, tags: [...tags], links, embeds, created, mtime: st.mtimeMs, size: st.size,
      summary: summary.slice(0, 280), text: body,
    };
    this.notes.set(rel, note);
    this.byName.set(title.toLowerCase(), rel);
    return note;
  }

  resolve(name) {
    const n = name.trim().toLowerCase();
    if (this.notes.has(name) || this.files.has(name)) return name;
    if (this.notes.has(name + ".md")) return name + ".md";
    return this.byName.get(n) || this.byName.get(path.basename(n)) || this.byName.get(path.basename(n, ".md")) || null;
  }

  buildIndex() {
    this.index = new MiniSearch({
      fields: ["title", "text", "tags", "props"], storeFields: ["title", "rel", "folder"], idField: "rel",
      searchOptions: { boost: { title: 3, tags: 2, props: 1.5 }, fuzzy: 0.2, prefix: true },
      // minuscules, sans accents, racinisation légère du français (statiques → statique, chevaux → cheval)
      processTerm: (t) => {
        let w = t.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
        if (w.length > 4) w = w.replace(/aux$/, "al").replace(/(?<=[a-z]{3})[sx]$/, "");
        return w;
      },
    });
    this.index.addAll([...this.notes.values()].map((n) => ({ rel: n.rel, title: n.title, text: n.text, tags: n.tags.join(" "), folder: n.folder,
      // les propriétés (prix, statut, type…) sont aussi cherchables
      props: Object.entries(n.fm || {}).filter(([k]) => !["tags", "cree", "auteur"].includes(k)).map(([k, v]) => `${k} ${Array.isArray(v) ? v.join(" ") : v}`).join(" "),
    })));
  }

  search(q, limit = 30) {
    if (!q.trim() || !this.index) return [];
    const SYS = /^(CLAUDE|README)\.md$|^99-Systeme\//;
    return this.index.search(q)
      .filter((r) => this.notes.get(r.rel)?.fm?.type !== "index-auto")
      .map((r) => ({ ...r, score: SYS.test(r.rel) ? r.score * 0.35 : r.score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit).map((r) => ({ rel: r.rel, title: r.title, folder: r.folder, score: r.score, summary: this.notes.get(r.rel)?.summary || "" }));
  }

  graph() {
    const nodes = [], links = [], seen = new Set();
    const firstDir = (rel) => (rel.includes("/") ? rel.split("/")[0] : "racine");
    for (const n of this.notes.values()) {
      if (n.fm?.type === "index-auto") continue; // les index générés ne sont pas des neurones
      nodes.push({ id: n.rel, name: n.title, kind: "note", group: n.folder, created: n.created, tags: n.tags, spine: SPINE_ZONES.includes(n.folder) });
      seen.add(n.rel);
    }
    for (const f of this.files.values()) {
      // Les fichiers des banques (des milliers d'images et de clips) ne sont pas des neurones :
      // ce sont les notes de banque (catégories, thèmes, marques) qui les représentent dans le graphe.
      if (/(^|\/)(Banques|Archives)\//.test(f.rel) || f.rel.includes("/_apercus/")) continue;
      nodes.push({ id: f.rel, name: f.name, kind: f.kind, group: firstDir(f.rel), created: f.created, spine: true });
      seen.add(f.rel);
    }
    for (const n of this.notes.values()) {
      if (!seen.has(n.rel)) continue;
      for (const [list, type] of [[n.links, "link"], [n.embeds, "embed"]]) {
        for (const l of list) {
          const t = this.resolve(l);
          if (t && t !== n.rel && seen.has(t)) links.push({ source: n.rel, target: t, type });
          // Lien vers une note qui n'existe pas encore : un nœud « fantôme » (comme Obsidian).
          else if (!t && type === "link" && !n.rel.startsWith("99-Systeme/") && !/[.]\w{2,4}$/.test(l)) {
            const name = l.split("|")[0].split("#")[0].trim(), id = "ghost:" + name.toLowerCase();
            if (!name) continue;
            if (!seen.has(id)) { nodes.push({ id, name, kind: "ghost", group: n.folder, from: n.rel, created: n.created, spine: false }); seen.add(id); }
            links.push({ source: n.rel, target: id, type: "ghost" });
          }
        }
      }
    }
    return { nodes, links };
  }

  backlinks(rel) {
    const out = [];
    for (const n of this.notes.values()) if (n.fm?.type !== "index-auto" && [...n.links, ...n.embeds].some((l) => this.resolve(l) === rel)) out.push({ rel: n.rel, title: n.title });
    return out;
  }

  outlinks(rel) {
    const n = this.notes.get(rel);
    if (!n) return [];
    return [...new Set([...n.links, ...n.embeds])].map((l) => ({ name: l, rel: this.resolve(l) }));
  }

  tree() {
    const items = [...this.notes.values()].map((n) => ({ rel: n.rel, title: n.title, kind: "note", mtime: n.mtime }))
      .concat([...this.files.values()].map((f) => ({ rel: f.rel, title: f.name, kind: f.kind, mtime: f.mtime })));
    return items.sort((a, b) => a.rel.localeCompare(b.rel, "fr"));
  }

  stats() {
    let links = 0; for (const n of this.notes.values()) links += n.links.length + n.embeds.length;
    return { notes: this.notes.size, files: this.files.size, links, root: this.root };
  }

  async read(rel) { return fs.readFile(this.abs(rel), "utf8"); }

  async write(rel, content) {
    const p = this.abs(rel);
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, content, "utf8");
    await this.load(rel); this.buildIndex();
    return rel;
  }

  async uniqueRel(dir, name, ext) {
    let rel = toPosix(path.join(dir, name + ext)), i = 2;
    while (fss.existsSync(this.abs(rel))) rel = toPosix(path.join(dir, `${name} ${i++}${ext}`));
    return rel;
  }

  async createNote({ folder = P.inbox, title = "Nouvelle note", body = "", tags = [], type = "note", auteur = "" }) {
    const rel = await this.uniqueRel(folder, slug(title), ".md");
    const fm = `---\ntype: ${type}\ntags: [${tags.join(", ")}]\nauteur: ${auteur}\nstatut: brouillon\ncree: ${today()}\n---\n`;
    await this.write(rel, `${fm}# ${path.basename(rel, ".md")}\n\n${body}\n`);
    return rel;
  }

  // Importe n'importe quel fichier : copie dans 90-Fichiers/AAAA-MM/ + fiche note qui le décrit.
  async importFile(src, { auteur = "" } = {}) {
    const st = await fs.stat(src);
    const srcExt = path.extname(src).toLowerCase();
    // Notes Markdown : elles entrent telles quelles dans l'Inbox (aucune fiche en double).
    if (srcExt === ".md") {
      const rel = await this.uniqueRel(P.inbox, slug(path.basename(src, ".md")), ".md");
      await this.write(rel, await fs.readFile(src, "utf8"));
      await this.log(`Import note « ${path.basename(src)} »`, [rel], auteur);
      return { noteRel: rel, fileRel: rel, kind: "note" };
    }
    // Textes bruts : convertis en note lisible et cherchable.
    if ([".txt", ".csv", ".json", ".log", ".yaml", ".yml"].includes(srcExt) && st.size < 2_000_000) {
      const name = slug(path.basename(src, srcExt));
      const rel = await this.uniqueRel(P.inbox, name, ".md");
      const txt = await fs.readFile(src, "utf8");
      const body = srcExt === ".txt" ? txt : "```" + srcExt.slice(1) + "\n" + txt + "\n```";
      await this.write(rel, `---\ntype: source\nnom_origine: "${path.basename(src).replace(/"/g, "'")}"\ntags: [import, texte]\nauteur: ${auteur}\nstatut: a-trier\ncree: ${today()}\n---\n# ${name}\n\n${body}\n`);
      await this.log(`Import texte « ${path.basename(src)} »`, [rel], auteur);
      return { noteRel: rel, fileRel: rel, kind: "note" };
    }
    const month = new Date().toISOString().slice(0, 7);
    const dir = `${MEDIA_DIR}/${month}`;
    const ext = path.extname(src).toLowerCase();
    const base = slug(path.basename(src, path.extname(src)));
    const fileRel = await this.uniqueRel(dir, base, ext);
    await fs.mkdir(path.dirname(this.abs(fileRel)), { recursive: true });
    await fs.copyFile(src, this.abs(fileRel));
    const kind = kindOf(fileRel);
    const fileName = path.basename(fileRel);
    let extra = "";
    if (kind === "video" || kind === "audio") {
      const meta = await probe(this.abs(fileRel));
      if (meta) extra += `duree: ${meta.duration}\n` + (meta.width ? `dimensions: ${meta.width}x${meta.height}\n` : "");
      if (kind === "video") {
        const thumbRel = fileRel.replace(/\.[^.]+$/, ".miniature.jpg");
        if (await thumbnail(this.abs(fileRel), this.abs(thumbRel), meta?.duration)) { await this.load(thumbRel); extra += `miniature: "[[${path.basename(thumbRel)}]]"\n`; }
      }
    }
    let docText = "";
    if (DOC_EXT.includes(ext)) {
      const r = await extractDoc(this.abs(fileRel)).catch(() => null);
      if (r) { docText = docSection(r); extra += `texte_extrait: ${r.chars}\n`; }
    }
    const noteRel = await this.uniqueRel(dir, base, ".md");
    const body = `---\ntype: media\nmedia: ${kind}\nfichier: "[[${fileName}]]"\nnom_origine: "${path.basename(src).replace(/"/g, "'")}"\ntaille_mo: ${(st.size / 1048576).toFixed(2)}\n${extra}tags: [media, ${kind}]\nauteur: ${auteur}\nstatut: a-decrire\ncree: ${today()}\n---\n# ${base}\n\n![[${fileName}]]\n\n## Description\n\n\n## Moments clés\n\n\n## Liens\n- \n${docText}`;
    await this.write(noteRel, body);
    await this.load(fileRel); this.buildIndex();
    await this.log(`Import ${kind} « ${path.basename(src)} »`, [noteRel], auteur);
    return { noteRel, fileRel, kind };
  }

  // Log = carnet de bord. Un fichier par personne et par mois (99-Systeme/Log/2026-11 Alex.md) :
  // deux personnes sur un même Drive n'écrivent jamais dans le même fichier → pas de conflit.
  async log(what, rels = [], who = "", agent = "Axon") {
    who = who || this.user;
    const rel = logDuMois(this.user || who);
    const p = this.abs(rel);
    if (!fss.existsSync(p)) await this.write(rel, "---\ntype: log\ntags: [systeme]\nresume: \"Carnet de bord : une ligne par action (date | agent | qui | quoi | notes).\"\n---\n# Log " + path.basename(rel, ".md") + "\n\n");
    const links = rels.map((r) => `[[${path.basename(r, ".md")}]]`).join(" ");
    await fs.appendFile(p, `${today()} | ${agent} | ${who} | ${what} | ${links}\n`, "utf8");
  }

  /** Les n dernières lignes du log, toutes personnes confondues (triées par date). */
  async readLog(n = 20) {
    const dir = this.abs(P.logDir);
    const files = fss.existsSync(dir) ? (await fs.readdir(dir)).filter((f) => f.endsWith(".md")).sort().slice(-6) : [];
    const lines = [];
    for (const f of files) lines.push(...(await fs.readFile(path.join(dir, f), "utf8")).split("\n").filter((l) => /^\d{4}-/.test(l)));
    return lines.sort().slice(-n);
  }

  recent(n = 20) {
    return [...this.notes.values()].sort((a, b) => b.mtime - a.mtime).slice(0, n).map((x) => ({ rel: x.rel, title: x.title, mtime: x.mtime }));
  }
}

function run(cmd, args) {
  return new Promise((res) => execFile(cmd, args, { windowsHide: true, timeout: 60000 }, (err, out) => res(err ? null : out)));
}
async function probe(file) {
  const out = await run("ffprobe", ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", file]);
  if (!out) return null;
  try {
    const j = JSON.parse(out); const v = j.streams.find((s) => s.codec_type === "video");
    return { duration: Math.round(+j.format.duration || 0), width: v?.width, height: v?.height };
  } catch { return null; }
}
async function thumbnail(file, out, duration) {
  const t = duration ? Math.min(2, duration / 3).toFixed(1) : "1";
  return !!(await run("ffmpeg", ["-y", "-loglevel", "error", "-ss", t, "-i", file, "-frames:v", "1", "-vf", "scale=480:-1", out])) || fss.existsSync(out);
}
