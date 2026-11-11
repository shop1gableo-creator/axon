// Paquet IA : rend le cerveau lisible par n'importe quelle IA, même sans outils.
//  - llms.txt       : sommaire au format llmstxt.org (titre, résumé, liens vers chaque note avec une ligne de résumé)
//  - llms-full.txt  : l'essentiel en UN fichier (démarrage, mémoire des IA, charte, carte, résumé de chaque note,
//                     flux du jour, dernières actions) — à donner à ChatGPT / Gemini dans le navigateur.
// Régénérés automatiquement avec les index (aucune IA nécessaire, zéro token).
import path from "node:path";
import { P } from "./structure.mjs";

const AUTO = "index-auto";
const oneLine = (s) => String(s || "").replace(/\s+/g, " ").trim();
const resumeOf = (n) => oneLine(n.fm?.resume || n.fm?.summary || n.summary).slice(0, 180);
const enc = (rel) => rel.split("/").map(encodeURIComponent).join("/");

export async function buildPack(vault, regionsList = []) {
  const notes = [...vault.notes.values()].filter((n) => n.fm?.type !== AUTO && !/(^|\/)(CLAUDE|AGENTS|GEMINI)\.md$/.test(n.rel));
  const byFolder = new Map();
  for (const n of notes) {
    const dir = path.posix.dirname(n.rel) === "." ? "racine" : n.rel.split("/")[0];
    if (!byFolder.has(dir)) byFolder.set(dir, []);
    byFolder.get(dir).push(n);
  }
  const folders = [...byFolder.keys()].sort();

  // ---------- llms.txt ----------
  const txt = [
    "# Axon — " + path.basename(vault.root),
    "",
    "> Cerveau Axon : notes Markdown reliées par des [[liens]], rangées en domaines (chacun avec Projets, Savoir, Decisions, Ressources, Archives). Toute IA commence par 00-COMMENCER-ICI.md.",
    "",
    "## Démarrer",
    "- [Commencer ici](00-COMMENCER-ICI.md): qui ils sont, carte des régions, protocole de session",
    "- [Ce que les IA savent de nous](" + enc(P.memoire) + "): mémoire vivante des IA, à lire puis à compléter",
    "- [AGENTS.md](AGENTS.md): règles pour toutes les IA",
    "- [Contexte complet](llms-full.txt): l'essentiel en un seul fichier",
    "",
  ];
  for (const f of folders) {
    txt.push(`## ${f}`);
    for (const n of byFolder.get(f).sort((a, b) => a.title.localeCompare(b.title, "fr"))) txt.push(`- [${n.title}](${enc(n.rel)}): ${resumeOf(n) || "—"}`);
    txt.push("");
  }

  // ---------- llms-full.txt ----------
  const read = (rel) => vault.read(rel).then((s) => s.replace(/^---[\s\S]*?---\n/, "").trim()).catch(() => "");
  const log = await vault.readLog(20);
  const flux = notes.filter((n) => n.rel.startsWith(P.flux + "/")).map((n) => `- ${n.title} (maj ${String(n.fm?.maj || "").slice(0, 16)}) : ${resumeOf(n)}`);
  const full = [
    "# Axon — contexte complet pour une IA",
    `Généré automatiquement le ${new Date().toLocaleString("fr-FR")}. ${notes.length} notes. Ce fichier suffit pour comprendre ce cerveau ; pour le détail, demande la note voulue.`,
    "",
    "=============== 1. COMMENCER ICI ===============",
    await read("00-COMMENCER-ICI.md"),
    "",
    "=============== 2. CE QUE LES IA SAVENT DE NOUS ===============",
    await read(P.memoire),
    "",
    "=============== 4. RÉGIONS ===============",
    ...regionsList.map((r) => `- ${r.nom} (${r.position}) : ${r.description || ""} · dossiers ${r.dossiers.join(", ")}`),
    "",
    "=============== 5. TOUTES LES NOTES (une ligne chacune) ===============",
    ...folders.flatMap((f) => [`## ${f}`, ...byFolder.get(f).map((n) => `- ${n.title} (${n.rel}) : ${resumeOf(n) || "—"}`), ""]),
    "=============== 6. FLUX DU JOUR ===============",
    ...flux,
    "",
    "=============== 7. DERNIÈRES ACTIONS (log) ===============",
    ...log,
    "",
    "=============== 8. CONSIGNES ===============",
    "Réponds en français. Cite les notes sous la forme [[Titre]]. Si tu apprends quelque chose de durable sur eux, propose la ligne à ajouter dans « Ce que les IA savent de nous ». N'invente jamais un chiffre absent de ce contexte.",
  ].join("\n");

  const prevTxt = await vault.read("llms.txt").catch(() => "");
  const nextTxt = txt.join("\n");
  if (prevTxt !== nextTxt) await vault.write("llms.txt", nextTxt);
  const prevFull = (await vault.read("llms-full.txt").catch(() => "")).split("\n").slice(2).join("\n");
  if (prevFull !== full.split("\n").slice(2).join("\n")) await vault.write("llms-full.txt", full);
  return { notes: notes.length, words: full.split(/\s+/).length };
}
