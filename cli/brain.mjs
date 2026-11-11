#!/usr/bin/env node
// Ligne de commande d Axon : pensée pour les IA (Claude Code, Codex…) et pour vous.
// Exemples :
//   node cli/brain.mjs stats
//   node cli/brain.mjs cherche "statiques noir et blanc"
//   node cli/brain.mjs contexte "comment on fait nos statiques ?"
//   node cli/brain.mjs index      (régénère les _index.md)
//   node cli/brain.mjs sante      (rapport de santé)
import path from "node:path";
import { openBrain } from "../core/open.mjs";
import { buildIndexes, lint, hybrid, contextPack } from "../core/maintain.mjs";

const [cmd = "aide", ...args] = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const rest = args.filter((a) => !a.startsWith("--"));
const arg = rest.join(" ");
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };

const AIDE = `Axon : commandes
  brancher [dossier] [--moi X] [--nom axon]   branche Claude Desktop + Claude Code sur ce cerveau
  debrancher [--nom axon]       retire Axon de Claude Desktop et Claude Code
  carte                         carte compacte du cerveau (pour le début de session d'une IA)
  stats                         chiffres du cerveau
  cherche <texte> [--mots]      recherche hybride (mots + sens) ; --mots = mots seulement
  lire <note>                   affiche une note (nom ou chemin)
  liens <note>                  liens sortants, rétroliens, notes proches par le sens
  contexte <question>           paquet de contexte compact pour répondre à une question
  recent [n]                    notes modifiées récemment
  index                         régénère les index automatiques (_index.md)
  sante                         rapport « Santé du Brain »
  nouvelle <titre> [--dossier X] [--tags a,b]   crée une note (texte lu sur l'entrée standard si fourni)
  importer <fichier...>         copie des fichiers dans le Brain avec une fiche
  journal <texte>               ajoute une ligne au log
  graphe                        exporte le graphe en JSON
  init <dossier> [--nom X] [--equipe Y]   crée un CERVEAU VIERGE (structure + règles, sans données) — local ou dans un dossier cloud`;

async function main() {
  if (cmd === "brancher" || cmd === "debrancher") {
    const { brancherClaude, debrancherClaude } = await import("../core/claude-connect.mjs");
    const { vaultPath, settings } = await import("../core/open.mjs");
    if (cmd === "debrancher") { console.log(debrancherClaude({ nom: opt("--nom", "axon") }).join("\n") || "Rien à débrancher."); return; }
    const v = rest[0] ? path.resolve(rest[0]) : vaultPath();
    if (!v) throw new Error("Indique le dossier du cerveau : node cli/brain.mjs brancher \"G:/Mon Drive/Axon\"");
    for (const r of brancherClaude({ vault: v, utilisateur: opt("--moi", settings().utilisateur || ""), nom: opt("--nom", "axon") })) console.log(`${r.ok ? "OK " : "-- "} ${r.cible} : ${r.detail}`);
    console.log("\nQuitte Claude Desktop COMPLÈTEMENT (icône près de l horloge → Quitter) puis rouvre-le.");
    return;
  }
  if (cmd === "init") {
    const { createEmptyBrain } = await import("../core/scaffold.mjs");
    if (!rest[0]) throw new Error("Indique le dossier : node cli/brain.mjs init \"C:/Users/moi/MonCerveau\" (ou un dossier Google Drive : \"G:/Mon Drive/MonCerveau\")");
    const r = await createEmptyBrain(path.resolve(rest[0]), { nom: opt("--nom", "Axon"), utilisateur: opt("--moi", "") });
    console.log(`Cerveau vierge créé dans ${r.dir} (${r.created.length} fichiers de départ).`);
    return;
  }
  const needSem = ["cherche", "contexte", "liens", "sante"].includes(cmd) && !flags.has("--mots");
  const { vault, sem } = await openBrain({ semantic: needSem });
  const find = (q) => vault.resolve(q) || vault.search(q, 1)[0]?.rel;
  switch (cmd) {
    case "carte": {
      const { buildIndexes: bi } = await import("../core/maintain.mjs");
      await bi(vault);
      const map = await vault.read("99-Systeme/carte-auto.md").catch(() => "");
      const log = await vault.readLog(12);
      console.log([
        "# BRAIN : carte de session",
        map.replace(/^---[\s\S]*?---\n/, ""),
        "## Dernières actions (log)",
        ...log,
        "",
        "Outils : MCP « brain » (brain_contexte, brain_chercher, brain_lire, brain_ecrire, brain_journal) ou CLI : node app/cli/brain.mjs <commande>.",
      ].join("\n"));
      break;
    }
    case "stats": { const s = vault.stats(); console.log(`${s.notes} notes · ${s.files} fichiers · ${s.links} liens\nCoffre : ${s.root}`); break; }
    case "cherche": {
      const res = flags.has("--mots") ? vault.search(arg, 15) : await hybrid(vault, sem, arg, 15);
      for (const r of res) console.log(`- ${r.title}  (${r.rel})\n  ${r.summary || ""}`);
      if (!res.length) console.log("Rien trouvé.");
      break;
    }
    case "lire": { const rel = find(arg); if (!rel) throw new Error("Note introuvable : " + arg); console.log(`# ${rel}\n\n` + (await vault.read(rel))); break; }
    case "liens": {
      const rel = find(arg); if (!rel) throw new Error("Note introuvable : " + arg);
      console.log(`Note : ${rel}\n\nLiens sortants :`); for (const o of vault.outlinks(rel)) console.log(`- ${o.name}${o.rel ? "" : " (n'existe pas)"}`);
      console.log("\nRétroliens :"); for (const b of vault.backlinks(rel)) console.log(`- ${b.title}`);
      if (sem) { console.log("\nProches par le sens :"); for (const r of sem.related(rel, 8)) console.log(`- ${r.title} (${Math.round(r.score * 100)} %)`); }
      break;
    }
    case "contexte": { const p = await contextPack(vault, sem, arg, { budgetWords: +opt("--mots-max", 3500) }); console.log(p.text); break; }
    case "recent": for (const r of vault.recent(+rest[0] || 20)) console.log(`- ${new Date(r.mtime).toLocaleString("fr-FR")}  ${r.title}  (${r.rel})`); break;
    case "index": { const w = await buildIndexes(vault); await vault.scan(); const { buildPack } = await import("../core/pack.mjs"); const { loadRegions } = await import("../core/regions.mjs"); const p = await buildPack(vault, await loadRegions(vault)); console.log(`${w.length} index mis à jour · paquet IA : ${p.notes} notes, ${p.words} mots`); break; }
    case "sante": { await buildIndexes(vault); await vault.scan(); const r = await lint(vault, sem); console.log(JSON.stringify(r, null, 2) + "\nRapport : 99-Systeme/Sante du Brain.md"); break; }
    case "nouvelle": {
      let body = "";
      if (!process.stdin.isTTY) for await (const c of process.stdin) body += c;
      const titleArgs = []; for (let i = 0; i < args.length; i++) { if (args[i] === "--dossier" || args[i] === "--tags") { i++; continue; } if (!args[i].startsWith("--")) titleArgs.push(args[i]); }
      const rel = await vault.createNote({ title: titleArgs.join(" "), folder: opt("--dossier", "00-Inbox"), tags: (opt("--tags", "") || "").split(",").filter(Boolean), body, auteur: "IA" });
      await vault.log("Nouvelle note (CLI)", [rel], "", "CLI");
      console.log(rel); break;
    }
    case "importer": for (const f of rest) { const r = await vault.importFile(path.resolve(f), { auteur: "IA" }); console.log(`${r.kind} → ${r.noteRel}`); } break;
    case "journal": await vault.log(arg, [], "", "CLI"); console.log("Ajouté au log."); break;
    case "graphe": console.log(JSON.stringify(vault.graph())); break;
    default: console.log(AIDE);
  }
}
main().catch((e) => { console.error("Erreur : " + e.message); process.exit(1); });
