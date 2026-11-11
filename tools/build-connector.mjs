// Construit le connecteur Axon pour Claude Desktop (fichier Axon.mcpb à double-cliquer) :
// 1) empaquète le serveur MCP en un seul fichier (esbuild), 2) copie les skills, 3) crée le .mcpb.
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const run = (c) => execSync(c, { cwd: app, stdio: "inherit" });
run(`npx esbuild mcp/server.mjs --bundle --platform=node --format=esm --target=node20 --external:@huggingface/transformers --external:onnxruntime-node --external:sharp "--banner:js=import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);" --outfile=connector/server/index.mjs`);
fs.rmSync(path.join(app, "connector", "skills"), { recursive: true, force: true });
fs.cpSync(path.join(app, "skills"), path.join(app, "connector", "skills"), { recursive: true });
run(`npx -y @anthropic-ai/mcpb pack connector ../Axon.mcpb`);
console.log("Connecteur prêt : Axon.mcpb (à côté du dossier app).");
