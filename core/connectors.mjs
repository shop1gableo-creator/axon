// Connecteurs : des API publiques gratuites (sans clé) qui mettent le cerveau à jour.
// Chaque connecteur écrit une note dans 95-Flux/<Région>/ : l'état actuel en tableau + un historique daté
// (mémoire temporelle : on ne perd jamais l'ancienne valeur, on ajoute une ligne).
import path from "node:path";
import { P, journalDuJour } from "./structure.mjs";

const UA = { "user-agent": "BrainApp/0.3 (+local second brain)" };
const now = () => new Date();
const stamp = () => now().toISOString().slice(0, 16).replace("T", " ");
const nf = (n, d = 2) => (n == null || Number.isNaN(+n) ? "—" : new Intl.NumberFormat("fr-FR", { maximumFractionDigits: d, minimumFractionDigits: d }).format(+n));

async function get(url, type = "json") {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 15000);
  try {
    const r = await fetch(url, { headers: UA, signal: ctl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return type === "json" ? r.json() : r.text();
  } finally { clearTimeout(t); }
}

// Petit lecteur RSS (Google News, blogs…) sans dépendance.
function parseRss(xml, max = 10) {
  const items = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const tag = (n) => (m[1].match(new RegExp(`<${n}[^>]*>([\\s\\S]*?)<\\/${n}>`)) || [])[1]?.replace(/<!\[CDATA\[|\]\]>/g, "").trim() || "";
    items.push({ title: decode(tag("title")), link: tag("link"), date: tag("pubDate"), source: decode(tag("source")) });
    if (items.length >= max) break;
  }
  return items;
}
const decode = (s) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const gnews = (q) => `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=fr&gl=FR&ceid=FR:fr`;

export const CONNECTORS = [
  {
    id: "marches", nom: "Marchés", region: "Finance", every: 3, everyMin: 30, // l accueil est en direct (core/live.mjs) ; ici on garde l historique
    desc: "Indices boursiers, or et pétrole (Yahoo Finance, données publiques sans clé).",
    async run() {
      const syms = [["^FCHI", "CAC 40"], ["^GSPC", "S&P 500"], ["^NDX", "Nasdaq 100"], ["^GDAXI", "DAX"], ["GC=F", "Or (once, USD)"], ["BZ=F", "Pétrole Brent"], ["MC.PA", "LVMH"], ["CFR.SW", "Richemont"]];
      const rows = [];
      for (const [s, label] of syms) {
        const j = await get(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s)}?range=1d&interval=1d`).catch(() => null);
        const m = j?.chart?.result?.[0]?.meta;
        rows.push({ label, value: m?.regularMarketPrice, change: m?.regularMarketChangePercent ?? (m ? ((m.regularMarketPrice - m.chartPreviousClose) / m.chartPreviousClose) * 100 : null), date: m ? new Date(m.regularMarketTime * 1000).toLocaleDateString("fr-FR") : null });
      }
      return {
        widget: rows.map((r) => ({ label: r.label, value: nf(r.value), change: r.change })),
        table: ["| Indice | Dernier | Séance | Date |", "|---|---|---|---|", ...rows.map((r) => `| ${r.label} | ${nf(r.value)} | ${r.change == null ? "—" : (r.change >= 0 ? "+" : "") + nf(r.change) + " %"} | ${r.date || "—"} |`)].join("\n"),
        history: rows.map((r) => `${r.label} ${nf(r.value)}`).join(" · "),
      };
    },
  },
  {
    id: "crypto", nom: "Crypto", region: "Finance", every: 1, everyMin: 30,
    desc: "Bitcoin, Ethereum, Solana en euros (CoinGecko, gratuit).",
    async run() {
      const j = await get("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=eur&include_24hr_change=true");
      const rows = [["bitcoin", "Bitcoin"], ["ethereum", "Ethereum"], ["solana", "Solana"]].map(([k, l]) => ({ label: l, value: j[k]?.eur, change: j[k]?.eur_24h_change }));
      return {
        widget: rows.map((r) => ({ label: r.label, value: nf(r.value, 0) + " €", change: r.change })),
        table: ["| Crypto | Prix (€) | 24 h |", "|---|---|---|", ...rows.map((r) => `| ${r.label} | ${nf(r.value, 0)} | ${(r.change >= 0 ? "+" : "") + nf(r.change)} % |`)].join("\n"),
        history: rows.map((r) => `${r.label} ${nf(r.value, 0)} €`).join(" · "),
      };
    },
  },
  {
    id: "devises", nom: "Devises", region: "Finance", every: 12, everyMin: 360,
    desc: "Taux de change officiels de la BCE (Frankfurter).",
    async run() {
      const j = await get("https://api.frankfurter.dev/v1/latest?base=EUR&symbols=USD,GBP,CHF,JPY,CNY,AED");
      const order = ["USD", "GBP", "CHF", "AED", "JPY", "CNY"];
      const rows = Object.entries(j.rates || {}).sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0])).map(([k, v]) => ({ label: `EUR → ${k}`, value: v }));
      return {
        widget: rows.slice(0, 4).map((r) => ({ label: r.label, value: nf(r.value, 4) })),
        table: [`Taux du ${j.date} (BCE)`, "", "| Paire | Taux |", "|---|---|", ...rows.map((r) => `| ${r.label} | ${nf(r.value, 4)} |`)].join("\n"),
        history: rows.map((r) => `${r.label.slice(6)} ${nf(r.value, 4)}`).join(" · "),
      };
    },
  },
  {
    id: "veille-montres", nom: "Veille montres de luxe", region: "E-com", every: 6, everyMin: 15,
    desc: "Dernières actualités « montres de luxe » (Google News FR).",
    async run() { return news(await get(gnews("montres de luxe OR horlogerie"), "text")); },
  },
  {
    id: "veille-ecom", nom: "Veille e-commerce", region: "E-com", every: 6, everyMin: 15,
    desc: "Actualités e-commerce, Shopify, TikTok Shop (Google News FR).",
    async run() { return news(await get(gnews("e-commerce OR Shopify OR \"TikTok Shop\""), "text")); },
  },
  {
    id: "veille-ia", nom: "Veille IA et tech", region: "Savoir", every: 6, everyMin: 15,
    desc: "Top de Hacker News (tech, IA, startups).",
    async run() {
      const ids = (await get("https://hacker-news.firebaseio.com/v0/topstories.json")).slice(0, 10);
      const items = await Promise.all(ids.map((id) => get(`https://hacker-news.firebaseio.com/v0/item/${id}.json`).catch(() => null)));
      const list = items.filter(Boolean).map((it) => ({ title: it.title, link: it.url || `https://news.ycombinator.com/item?id=${it.id}`, source: `${it.score} pts` }));
      return { widget: list.slice(0, 5).map((n) => ({ label: n.title, link: n.link, sub: n.source })), table: list.map((n) => `- [${n.title}](${n.link}) · ${n.source}`).join("\n"), history: list.slice(0, 3).map((n) => n.title).join(" · ") };
    },
  },
  {
    id: "meteo", nom: "Météo Fribourg", region: "Noyau", every: 3, everyMin: 30,
    desc: "Météo actuelle et 3 prochains jours (Open-Meteo).",
    async run() {
      const j = await get("https://api.open-meteo.com/v1/forecast?latitude=46.8065&longitude=7.1620&current=temperature_2m,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,weather_code&timezone=Europe%2FZurich&forecast_days=7");
      const W = (c) => (c === 0 ? "Soleil" : c <= 3 ? "Nuageux" : c <= 48 ? "Brouillard" : c <= 67 ? "Pluie" : c <= 77 ? "Neige" : c <= 82 ? "Averses" : "Orage");
      const days = j.daily.time.map((d, i) => ({ d, min: j.daily.temperature_2m_min[i], max: j.daily.temperature_2m_max[i], w: W(j.daily.weather_code[i]) }));
      return {
        widget: [{ label: "Maintenant", value: `${Math.round(j.current.temperature_2m)}°`, sub: W(j.current.weather_code) }, ...days.map((x) => ({ label: new Date(x.d).toLocaleDateString("fr-FR", { weekday: "short" }), value: `${Math.round(x.max)}° / ${Math.round(x.min)}°`, sub: x.w }))],
        table: ["| Jour | Min | Max | Temps |", "|---|---|---|---|", ...days.map((x) => `| ${x.d} | ${x.min}° | ${x.max}° | ${x.w} |`)].join("\n"),
        history: `${Math.round(j.current.temperature_2m)}° ${W(j.current.weather_code)}`,
      };
    },
  },
];

function news(xml) {
  const list = parseRss(xml, 12);
  return {
    widget: list.slice(0, 5).map((n) => ({ label: n.title, link: n.link, sub: n.source })),
    table: list.map((n) => `- [${n.title}](${n.link})${n.source ? " · " + n.source : ""}${n.date ? " · " + new Date(n.date).toLocaleDateString("fr-FR") : ""}`).join("\n"),
    history: list.slice(0, 3).map((n) => n.title).join(" · "),
  };
}

// Lance un connecteur et écrit/actualise sa note. Retourne le widget (pour le tableau de bord).
export async function runConnector(vault, c) {
  const rel = `${P.flux}/${c.region}/${c.nom}.md`;
  const out = await c.run();
  let hist = [];
  const prev = await vault.read(rel).catch(() => "");
  const hm = prev.match(/## Historique\n\n([\s\S]*)$/);
  if (hm) hist = hm[1].trim().split("\n").filter((l) => l.startsWith("- "));
  hist.unshift(`- ${stamp()} · ${out.history}`);
  hist = hist.slice(0, 120);
  const md = `---
type: flux
region: ${c.region}
connecteur: ${c.id}
source: "${c.desc.replace(/"/g, "'")}"
maj: ${now().toISOString()}
frequence_h: ${c.every}
widget: ${JSON.stringify(JSON.stringify(out.widget))}
tags: [flux, ${c.region.toLowerCase()}]
resume: "${c.nom} : ${String(out.history).replace(/"/g, "'").slice(0, 140)}"
---
# ${c.nom}

> Mis à jour automatiquement le ${now().toLocaleString("fr-FR")}. ${c.desc}

${out.table}

## Historique

${hist.join("\n")}
`;
  await vault.write(rel, md);
  return { id: c.id, nom: c.nom, region: c.region, rel, widget: out.widget, maj: now().toISOString() };
}

export async function runAll(vault, { only, force = true } = {}) {
  const results = [];
  for (const c of CONNECTORS) {
    if (only && !only.includes(c.id)) continue;
    if (!force) {
      const n = vault.notes.get(`${P.flux}/${c.region}/${c.nom}.md`);
      const last = Date.parse(n?.fm?.maj || 0);
      if (last && Date.now() - last < (c.everyMin ?? c.every * 60) * 60e3) continue;
    }
    try { results.push(await runConnector(vault, c)); }
    catch (e) { results.push({ id: c.id, nom: c.nom, region: c.region, error: String(e.message || e) }); }
  }
  if (results.some((r) => !r.error)) await writeDailyMetrics(vault).catch(() => {});
  const ok = results.filter((r) => !r.error).length;
  if (results.length && force) await vault.log(`Mise à jour des flux : ${ok}/${results.length} connecteurs`, results.filter((r) => r.rel).map((r) => r.rel), "", "Connecteurs");
  return results;
}

// La note du jour devient une « ligne de base de données » : les chiffres du jour sont écrits dans
// ses propriétés par du code (pas par une IA → zéro token, toujours la même méthode).
const num = (s) => (s == null ? null : +String(s).replace(/[^\d,.-]/g, "").replace(/\s/g, "").replace(",", "."));
export async function writeDailyMetrics(vault) {
  const day = new Date().toISOString().slice(0, 10);
  const rel = journalDuJour(vault.user);
  const W = Object.fromEntries(widgets(vault).map((w) => [w.id, w.widget || []]));
  const pick = (id, label) => W[id]?.find((x) => x.label === label)?.value;
  const metrics = {
    btc_eur: num(pick("crypto", "Bitcoin")), eth_eur: num(pick("crypto", "Ethereum")),
    cac40: num(pick("marches", "CAC 40")), sp500: num(pick("marches", "S&P 500")), or_usd: num(pick("marches", "Or (once, USD)")),
    lvmh: num(pick("marches", "LVMH")), eur_usd: num(W.devises?.find((x) => x.label === "EUR → USD")?.value ?? null),
    meteo_paris: pick("meteo", "Maintenant") || null,
  };
  let src = await vault.read(rel).catch(() => null);
  if (!src) src = `---\ntype: journal\ntags: [journal]\ncree: ${day}\n---\n# ${day}\n\n## Notes\n- \n\n## Agents IA\n- \n`;
  const m = src.match(/^---\n([\s\S]*?)\n---\n?/);
  let fm = m ? m[1] : "";
  for (const [k, v] of Object.entries(metrics)) {
    if (v == null || Number.isNaN(v)) continue;
    const line = `${k}: ${typeof v === "number" ? v : JSON.stringify(v)}`;
    fm = new RegExp(`^${k}:.*$`, "m").test(fm) ? fm.replace(new RegExp(`^${k}:.*$`, "m"), line) : fm + "\n" + line;
  }
  await vault.write(rel, `---\n${fm.trim()}\n---\n` + (m ? src.slice(m[0].length) : src));
  return rel;
}

// Lecture des widgets déjà en mémoire (sans appel réseau) pour afficher le tableau de bord instantanément.
export function widgets(vault) {
  return CONNECTORS.map((c) => {
    const rel = `${P.flux}/${c.region}/${c.nom}.md`;
    const n = vault.notes.get(rel);
    let w = null; try { w = n?.fm?.widget ? JSON.parse(n.fm.widget) : null; } catch { /* widget illisible */ }
    return { id: c.id, nom: c.nom, region: c.region, rel, widget: w, maj: n?.fm?.maj || null, desc: c.desc };
  });
}
export { path };
