// Mémoire « par le sens » : chaque note devient un vecteur (embedding) calculé EN LOCAL
// sur ton PC (modèle multilingue, aucune donnée envoyée). Sert à la recherche par le sens
// et aux « synapses » calculées entre notes proches.
import fs from "node:fs/promises";
import path from "node:path";

// EmbeddingGemma (Google, 2025) : meilleur petit modèle multilingue, tourne en local (ONNX, q8).
const MODEL = "onnx-community/embeddinggemma-300m-ONNX";
const QUERY = "task: search result | query: ", DOC = "title: none | text: ";
let extractor = null;

async function getExtractor(cacheDir) {
  if (extractor) return extractor;
  const { pipeline, env } = await import("@huggingface/transformers");
  if (cacheDir) env.cacheDir = cacheDir;
  extractor = await pipeline("feature-extraction", MODEL, { dtype: "q8" });
  return extractor;
}

const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };

export class Semantic {
  constructor(vault, cacheDir) {
    this.vault = vault; this.cacheDir = cacheDir;
    this.file = vault.abs(".brain/embeddings.json");
    this.vectors = new Map(); // rel -> { mtime, v }
    this.ready = false;
  }

  async loadCache() {
    try {
      const j = JSON.parse(await fs.readFile(this.file, "utf8"));
      if (j.model === MODEL) for (const [k, x] of Object.entries(j.items)) this.vectors.set(k, x);
    } catch { /* pas encore de cache */ }
  }

  async saveCache() {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    await fs.writeFile(this.file, JSON.stringify({ model: MODEL, items: Object.fromEntries(this.vectors) }));
  }

  async embed(text, kind = "doc") {
    const ex = await getExtractor(this.cacheDir);
    const out = await ex((kind === "query" ? QUERY : DOC) + text.slice(0, 2000), { pooling: "mean", normalize: true });
    return Array.from(out.data, (x) => Math.round(x * 1e4) / 1e4);
  }

  // Calcule les vecteurs manquants ou périmés. onProgress(done, total).
  async indexAll(onProgress = () => {}) {
    await this.loadCache();
    const todo = [...this.vault.notes.values()].filter((n) => n.fm?.type !== "index-auto" && this.vectors.get(n.rel)?.mtime !== n.mtime);
    for (const rel of [...this.vectors.keys()]) if (!this.vault.notes.has(rel)) this.vectors.delete(rel);
    let done = 0;
    for (const n of todo) {
      const text = `${n.title}. ${n.tags.join(" ")}. ${n.text}`;
      this.vectors.set(n.rel, { mtime: n.mtime, v: await this.embed(text) });
      onProgress(++done, todo.length);
      if (done % 25 === 0) await this.saveCache();
    }
    await this.saveCache();
    this.ready = true;
    return { computed: todo.length, total: this.vectors.size };
  }

  async query(text, k = 12) {
    const q = await this.embed(text, "query");
    return this.rank(q, k);
  }

  rank(q, k, exclude) {
    const out = [];
    for (const [rel, { v }] of this.vectors) if (rel !== exclude) out.push({ rel, score: dot(q, v) });
    return out.sort((a, b) => b.score - a.score).slice(0, k)
      .map((r) => ({ ...r, title: this.vault.notes.get(r.rel)?.title || r.rel, summary: this.vault.notes.get(r.rel)?.summary || "" }));
  }

  related(rel, k = 8) {
    const x = this.vectors.get(rel);
    return x ? this.rank(x.v, k, rel) : [];
  }

  // Synapses calculées : pour chaque note, ses k plus proches voisines au-dessus d'un seuil.
  synapses(k = 3, threshold = 0.55) {
    const links = [], seen = new Set();
    for (const rel of this.vectors.keys()) {
      for (const r of this.related(rel, k)) {
        const key = [rel, r.rel].sort().join("|");
        if (r.score >= threshold && !seen.has(key)) { seen.add(key); links.push({ source: rel, target: r.rel, type: "sens", score: r.score }); }
      }
    }
    return links;
  }
}
