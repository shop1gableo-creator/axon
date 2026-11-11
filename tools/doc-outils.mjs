// Régénère docs/OUTILS-MCP.md à partir du serveur MCP lui-même (la doc ne peut pas mentir).
// Usage : node tools/doc-outils.mjs   (sur un cerveau vierge temporaire)
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createEmptyBrain } from "../core/scaffold.mjs";

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "axon-doc-"));
await createEmptyBrain(tmp, { equipe: "Doc" });
const p = spawn(process.execPath, [path.join(app, "mcp/server.mjs")], { env: { ...process.env, BRAIN_VAULT: tmp } });
let out = "";
p.stdout.on("data", (d) => { out += d; if (out.includes('"id":3')) p.kill(); });
const send = (m) => p.stdin.write(JSON.stringify(m) + "\n");
send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "doc", version: "1" } } });
send({ jsonrpc: "2.0", method: "notifications/initialized" });
send({ jsonrpc: "2.0", id: 2, method: "tools/list" });
send({ jsonrpc: "2.0", id: 3, method: "prompts/list" });
await new Promise((r) => p.on("exit", r));
const msgs = out.trim().split("\n").map((l) => JSON.parse(l));
const tools = msgs.find((m) => m.id === 2).result.tools;
const prompts = msgs.find((m) => m.id === 3)?.result?.prompts || [];
const args = (t) => Object.entries(t.inputSchema?.properties || {}).map(([k, v]) => `\`${k}\`${(t.inputSchema.required || []).includes(k) ? "" : "?"}${v.description ? ` (${v.description})` : ""}`).join(", ") || "—";
const md = `# Outils MCP d'Axon (${tools.length} outils, ${prompts.length} prompts)

> Fichier généré par \`node tools/doc-outils.mjs\` à partir du serveur : ne pas modifier à la main.

Ordre conseillé pour une IA : \`brain_demarrer\` → \`brain_skill\` (le mode d'emploi de la tâche) → \`brain_contexte\` → agir → \`brain_journal\` / \`brain_cloture\`.

| Outil | Ce qu'il fait | Paramètres (? = optionnel) |
|---|---|---|
${tools.map((t) => `| \`${t.name}\` | ${t.description.replace(/\|/g, "/").replace(/\n/g, " ")} | ${args(t).replace(/\|/g, "/")} |`).join("\n")}

## Prompts (menu « + » de Claude Desktop)
${prompts.map((x) => `- **${x.name}** : ${x.description}`).join("\n")}

## Ressources
- \`brain://commencer-ici\`, \`brain://memoire-ia\`, \`brain://contexte-complet\`
- \`axon://fichier/{+chemin}\` : n'importe quel fichier du cerveau, en qualité d'origine.
`;
fs.writeFileSync(path.join(app, "docs/OUTILS-MCP.md"), md);
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`docs/OUTILS-MCP.md : ${tools.length} outils, ${prompts.length} prompts`);
