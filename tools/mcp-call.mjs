// Petit client MCP pour tester le serveur Axon sans Claude : lance le serveur, enchaîne des appels d'outils, affiche les réponses.
// Usage : BRAIN_VAULT=<cerveau> node tools/mcp-call.mjs '[["brain_office",{"fichier":"Budget.xlsx","action":"lire"}], ...]'
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = process.argv[2] || "[]";
const calls = JSON.parse(arg.startsWith("@") ? (await import("node:fs")).readFileSync(arg.slice(1), "utf8") : arg);
const p = spawn(process.execPath, [path.join(app, "mcp/server.mjs")], { env: process.env, stdio: ["pipe", "pipe", "inherit"] });
let buf = "", id = 10;
const pending = new Map();
p.stdout.on("data", (d) => {
  buf += d; let i;
  while ((i = buf.indexOf("\n")) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); try { const m = JSON.parse(line); pending.get(m.id)?.(m); } catch { /* ligne non JSON */ } }
});
const rpc = (method, params) => new Promise((res) => { const k = ++id; pending.set(k, res); p.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: k, method, params }) + "\n"); });
await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } });
p.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
for (const [name, args] of calls) {
  const r = await rpc("tools/call", { name, arguments: args });
  console.log(`\n=== ${name} ${JSON.stringify(args).slice(0, 120)}\n${r.error ? "ERREUR " + JSON.stringify(r.error) : r.result.content.map((c) => c.text ?? `[${c.type}]`).join("\n")}`);
}
p.kill();
