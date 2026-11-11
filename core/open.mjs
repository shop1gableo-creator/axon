// Ouvre le Brain hors de l'app (CLI, serveur MCP) avec les mêmes réglages que l'app.
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { Vault } from "./vault.mjs";
import { Semantic } from "./semantic.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
export const dataDir = path.join(process.env.APPDATA || path.join(os.homedir(), ".config"), "axon");
// Modèles d'IA locale (~300 Mo, téléchargés une fois) : %LOCALAPPDATA%\Axon\models — gardés lors des mises à jour.
export const modelsDir = process.env.AXON_MODELS || path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), ".cache"), "Axon", "models");

export function settings() {
  try { return JSON.parse(fs.readFileSync(path.join(dataDir, "settings.json"), "utf8")); } catch { return {}; }
}

export function vaultPath() {
  if (process.env.BRAIN_VAULT) return process.env.BRAIN_VAULT;
  try {
    const s = JSON.parse(fs.readFileSync(path.join(dataDir, "settings.json"), "utf8"));
    if (s.vaultPath && fs.existsSync(s.vaultPath)) return s.vaultPath;
  } catch { /* pas de réglages */ }
  return null;
}

export async function openBrain({ semantic = false } = {}) {
  const root = vaultPath();
  if (!root || !fs.existsSync(root)) throw new Error(`Cerveau introuvable${root ? " : " + root : ""}. Ouvre l'app Axon une fois (elle te fait choisir le dossier) ou définis BRAIN_VAULT.`);
  const vault = new Vault(root, { user: process.env.AXON_USER || settings().utilisateur || "" });
  await vault.scan();
  let sem = null;
  if (semantic) {
    sem = new Semantic(vault, modelsDir);
    await sem.indexAll();
  }
  return { vault, sem };
}
