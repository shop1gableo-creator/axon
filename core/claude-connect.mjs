// Brancher (ou débrancher) Axon sur les Claude installés sur ce PC, AUTOMATIQUEMENT :
//  - Claude Desktop : ajoute le serveur dans claude_desktop_config.json (toutes les versions : site web, Microsoft Store),
//    après une copie de sauvegarde du fichier ;
//  - Claude Code : « claude mcp add … -s user » si la commande claude existe ;
//  - les skills d'Axon dans ~/.claude/skills.
// Utilisé par l'écran de premier lancement, le bouton « Brancher Claude » et la CLI (node cli/brain.mjs brancher).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { copySkills } from "./skills.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.resolve(here, "..", "mcp", "server.mjs");
const slash = (p) => p.split(path.sep).join("/");

/** Tous les fichiers de configuration possibles de Claude Desktop sur ce PC. */
export function desktopConfigs() {
  const out = new Set();
  const A = process.env.APPDATA, L = process.env.LOCALAPPDATA, H = os.homedir();
  const add = (dir) => { if (dir && fs.existsSync(dir)) out.add(path.join(dir, "claude_desktop_config.json")); };
  add(A && path.join(A, "Claude"));                                                   // version du site (Windows)
  add(path.join(H, "Library", "Application Support", "Claude"));                      // macOS
  add(path.join(H, ".config", "Claude"));                                             // Linux
  for (const base of [L && path.join(L, "Packages"), L && path.join(L, "Claude-Data")]) { // version Microsoft Store
    if (!base || !fs.existsSync(base)) continue;
    for (const d of fs.readdirSync(base)) {
      if (!/claude/i.test(d)) continue;
      const root = path.join(base, d, "claude_desktop_config.json");
      if (fs.existsSync(root)) out.add(root); // à la racine : seulement s'il existe déjà
      add(path.join(base, d, "LocalCache", "Roaming", "Claude"));
    }
  }
  return [...out];
}

/** Le programme qui lance le serveur : Node s'il est installé, sinon Electron en mode Node. */
export function nodeCommand() {
  if (!process.versions.electron) return { command: process.execPath, env: {} };
  try {
    const found = execFileSync(process.platform === "win32" ? "where" : "which", ["node"], { encoding: "utf8" }).split(/\r?\n/)[0].trim();
    if (found) return { command: found, env: {} };
  } catch { /* pas de Node dans le PATH */ }
  return { command: process.execPath, env: { ELECTRON_RUN_AS_NODE: "1" } };
}

const hasClaudeCli = () => { try { execFileSync(process.platform === "win32" ? "where" : "which", ["claude"], { stdio: "ignore" }); return true; } catch { return false; } };

/** Branche le cerveau `vault` sous le nom `nom` (ex. « axon » ou « axon-lgcorp »). Renvoie un rapport lisible. */
export function brancherClaude({ vault, utilisateur = "", nom = "axon" }) {
  const rapport = [];
  const { command, env } = nodeCommand();
  const entry = { command: slash(command), args: [slash(SERVER)], env: { BRAIN_VAULT: slash(vault), ...(utilisateur ? { AXON_USER: utilisateur } : {}), ...env } };

  const configs = desktopConfigs();
  if (!configs.length) rapport.push({ ok: false, cible: "Claude Desktop", detail: "Claude Desktop n'est pas installé sur ce PC (claude.ai/download), ou n'a jamais été ouvert." });
  for (const f of configs) {
    try {
      let cfg = {};
      if (fs.existsSync(f)) { fs.copyFileSync(f, f + ".avant-axon.bak"); cfg = JSON.parse(fs.readFileSync(f, "utf8") || "{}"); }
      cfg.mcpServers = { ...(cfg.mcpServers || {}), [nom]: entry };
      fs.writeFileSync(f, JSON.stringify(cfg, null, 2));
      rapport.push({ ok: true, cible: "Claude Desktop", detail: f });
    } catch (e) { rapport.push({ ok: false, cible: "Claude Desktop", detail: `${f} : ${e.message}` }); }
  }

  if (hasClaudeCli()) {
    try {
      try { execFileSync("claude", ["mcp", "remove", nom, "-s", "user"], { stdio: "ignore", shell: process.platform === "win32" }); } catch { /* pas encore branché */ }
      const args = ["mcp", "add", nom, "-s", "user", ...Object.entries(entry.env).flatMap(([k, v]) => ["-e", `${k}=${v}`]), "--", entry.command, ...entry.args];
      execFileSync("claude", args.map((a) => (process.platform === "win32" && /\s/.test(a) ? `"${a}"` : a)), { stdio: "ignore", shell: process.platform === "win32" });
      rapport.push({ ok: true, cible: "Claude Code", detail: `serveur « ${nom} » ajouté pour tous les projets` });
    } catch (e) { rapport.push({ ok: false, cible: "Claude Code", detail: e.message.split("\n")[0] }); }
  } else rapport.push({ ok: false, cible: "Claude Code", detail: "non installé (facultatif)" });

  const skills = copySkills(path.join(os.homedir(), ".claude", "skills"));
  rapport.push({ ok: true, cible: "Skills", detail: skills.length ? `${skills.length} skills installés dans ~/.claude/skills` : "déjà installés" });
  return rapport;
}

/** Débranche (désinstallation) : retire le serveur `nom` de Claude Desktop et de Claude Code. */
export function debrancherClaude({ nom = "axon" } = {}) {
  const rapport = [];
  for (const f of desktopConfigs()) {
    if (!fs.existsSync(f)) continue;
    try {
      const cfg = JSON.parse(fs.readFileSync(f, "utf8") || "{}");
      if (cfg.mcpServers?.[nom]) { fs.copyFileSync(f, f + ".avant-desinstall.bak"); delete cfg.mcpServers[nom]; fs.writeFileSync(f, JSON.stringify(cfg, null, 2)); rapport.push(`Claude Desktop : retiré de ${f}`); }
    } catch (e) { rapport.push(`Claude Desktop : ${f} illisible (${e.message})`); }
  }
  if (hasClaudeCli()) { try { execFileSync("claude", ["mcp", "remove", nom, "-s", "user"], { stdio: "ignore", shell: process.platform === "win32" }); rapport.push("Claude Code : retiré"); } catch { /* absent */ } }
  return rapport;
}
