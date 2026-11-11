// Processus principal Electron : fenêtre, accès au coffre, import, recherche, synchro Git.
import { app, BrowserWindow, ipcMain, dialog, protocol, net, shell, utilityProcess } from "electron";
import path from "node:path";
import fs from "node:fs/promises";
import fss from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFile } from "node:child_process";
import chokidar from "chokidar";
import { simpleGit } from "simple-git";
import { Vault } from "./core/vault.mjs";
import { Semantic } from "./core/semantic.mjs";
import { buildIndexes, lint, neural, contextPack, meta } from "./core/maintain.mjs";
import { loadRegions, regionOf } from "./core/regions.mjs";
import { runAll, widgets, CONNECTORS } from "./core/connectors.mjs";
import { askClaude, navigate, isNavigation } from "./core/chat.mjs";
import { modelsDir } from "./core/open.mjs";
import { startLive } from "./core/live.mjs";
import { createEmptyBrain, ajouterMembre, estUnCerveau } from "./core/scaffold.mjs";
import { DOMAINES_DEFAUT, journalDuJour, P } from "./core/structure.mjs";
import { brancherClaude } from "./core/claude-connect.mjs";
import os from "node:os";
let live = null;

const here = path.dirname(fileURLToPath(import.meta.url));
protocol.registerSchemesAsPrivileged([{ scheme: "brain", privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true } }]);
if (process.env.AXON_DATA) app.setPath("userData", process.env.AXON_DATA); // tests : réglages à part

// ----- Désinstallation : « Axon.exe --debrancher » retire Axon de Claude puis quitte (appelé par le désinstallateur).
if (process.argv.includes("--debrancher")) {
  const { debrancherClaude } = await import("./core/claude-connect.mjs");
  try { debrancherClaude({ nom: "axon" }); } catch { /* rien à débrancher */ }
  app.exit(0);
}
// Une seule fenêtre Axon à la fois : relancer l'app ramène la fenêtre existante au premier plan.
if (!process.env.BRAIN_SNAPSHOT && !app.requestSingleInstanceLock()) app.exit(0);
app.on("second-instance", () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

// ----- Carte graphique : sur un PC portable à deux puces (Intel + NVIDIA/AMD), Windows lance souvent les apps sur la
// puce Intel (économie d'énergie) → le cerveau 3D rame. On demande la puce PERFORMANTE et l'accélération maximale.
if (!process.argv.includes("--sans-gpu")) {
  app.commandLine.appendSwitch("force_high_performance_gpu");
  app.commandLine.appendSwitch("ignore-gpu-blocklist");
  app.commandLine.appendSwitch("enable-gpu-rasterization");
  app.commandLine.appendSwitch("enable-zero-copy");
} else app.disableHardwareAcceleration();
// Préférence graphique Windows pour Axon (= Paramètres > Affichage > Graphisme > « Hautes performances »).
function preferHighPerfGpu() {
  if (process.platform !== "win32" || !app.isPackaged) return;
  execFile("reg", ["add", "HKCU\\Software\\Microsoft\\DirectX\\UserGpuPreferences", "/v", process.execPath, "/t", "REG_SZ", "/d", "GpuPreference=2;", "/f"], { windowsHide: true }, () => {});
}

let win, vault, semantic, watcher, fluxTimer;
const settingsFile = () => path.join(app.getPath("userData"), "settings.json");

async function loadSettings() {
  try { return JSON.parse(await fs.readFile(settingsFile(), "utf8")); } catch { return {}; }
}
async function saveSettings(s) {
  await fs.mkdir(path.dirname(settingsFile()), { recursive: true });
  await fs.writeFile(settingsFile(), JSON.stringify(s, null, 2));
}

async function pickVaultPath() {
  const s = await loadSettings();
  for (const c of [process.env.BRAIN_VAULT, s.vaultPath]) if (c && fss.existsSync(c)) return c;
  return null; // → écran de premier lancement
}

// Dossiers « cloud » synchronisés présents sur ce PC (Google Drive pour ordinateur, OneDrive, Dropbox, iCloud).
function cloudFolders() {
  const home = os.homedir();
  const c = [];
  for (const L of "DEFGHIJKLMNOPQRSTUVWXYZ") for (const n of ["Mon Drive", "My Drive", "Drive partagés", "Shared drives"]) c.push(`${L}:\\${n}`);
  c.push(path.join(home, "Google Drive"), path.join(home, "Mon Drive"), path.join(home, "My Drive"), process.env.OneDrive, path.join(home, "Dropbox"), path.join(home, "iCloudDrive"));
  return [...new Set(c)].filter((p) => p && fss.existsSync(p));
}

// ----- Écran de premier lancement (renderer/onboarding.html) -----
function onboardingHandlers() {
  const h = (ch, fn) => ipcMain.handle(ch, async (_e, ...a) => fn(...a));
  h("setup:info", async () => ({ clouds: cloudFolders(), user: (await loadSettings()).utilisateur || os.userInfo().username, documents: path.join(os.homedir(), "Documents"), domaines: DOMAINES_DEFAUT }));
  h("setup:pick", async (defaultPath) => {
    const r = await dialog.showOpenDialog(win, { title: "Choisis le dossier du cerveau", defaultPath: defaultPath || os.homedir(), properties: ["openDirectory", "createDirectory"] });
    return r.canceled ? null : r.filePaths[0];
  });
  h("setup:check", (dir) => {
    if (!dir || !fss.existsSync(dir)) return { etat: "nouveau" };
    if (estUnCerveau(dir)) return { etat: "cerveau", membres: fss.existsSync(path.join(dir, P.membres)) ? fss.readFileSync(path.join(dir, P.membres), "utf8").split("\n").filter((l) => l.startsWith("- ")).map((l) => l.slice(2).split(" — ")[0]) : [] };
    const plein = fss.readdirSync(dir).some((f) => !f.startsWith(".") && !/^desktop\.ini$/i.test(f));
    return { etat: plein ? "plein" : "vide", sousDossier: path.join(dir, "Axon") };
  });
  h("setup:create", async ({ utilisateur, dossier, nom, domaines, brancher }) => {
    utilisateur = String(utilisateur || "").replace(/[\\/:*?"<>|]/g, "").trim();
    let dir = dossier;
    let rejoint = false;
    if (estUnCerveau(dir)) { rejoint = true; await ajouterMembre(dir, utilisateur); }
    else {
      if (fss.existsSync(dir) && fss.readdirSync(dir).some((f) => !f.startsWith(".") && !/^desktop\.ini$/i.test(f))) dir = path.join(dir, "Axon");
      await createEmptyBrain(dir, { nom: nom || "Axon", utilisateur, domaines: domaines?.length ? domaines : DOMAINES_DEFAUT });
    }
    const s = await loadSettings(); s.vaultPath = dir; s.utilisateur = utilisateur; await saveSettings(s);
    const rapport = brancher ? brancherClaude({ vault: dir, utilisateur }) : [];
    return { dir, rejoint, rapport };
  });
  h("axon:guide", () => shell.openPath(path.join(here, "guide", "index.html")));
  h("setup:done", async () => { const dir = await pickVaultPath(); if (dir) { await openVault(dir); await win.loadFile(path.join(here, "renderer", "index.html")); } });
}

const send = (ch, data) => win && !win.isDestroyed() && win.webContents.send(ch, data);

// Mémoire du sens « déportée » : le modèle tourne dans un processus séparé (semantic-worker),
// le processus principal garde seulement les vecteurs pour les calculs rapides (voisins, synapses).
class SemanticRemote extends Semantic {
  constructor(v, cacheDir) {
    super(v, cacheDir);
    this.pending = new Map(); this.seq = 0;
    this.child = utilityProcess.fork(path.join(here, "core", "semantic-worker.mjs"), [], { serviceName: "brain-ia-locale" });
    this.child.on("message", (m) => {
      if (m.type === "progress") return send("semantic:progress", m);
      const p = this.pending.get(m.id); if (!p) return;
      this.pending.delete(m.id); m.error ? p.rej(new Error(m.error)) : p.res(m.result);
    });
  }
  call(type, extra = {}) {
    const id = ++this.seq;
    return new Promise((res, rej) => { this.pending.set(id, { res, rej }); this.child.postMessage({ id, type, root: this.vault.root, cacheDir: this.cacheDir, ...extra }); });
  }
  async indexAll() {
    const r = await this.call("index");
    this.vectors.clear(); await this.loadCache(); this.ready = true;
    return r;
  }
  embed(text, kind = "doc") { return this.call("embed", { text, kind }); }
  dispose() { try { this.child.kill(); } catch { /* déjà arrêté */ } }
}

async function openVault(dir) {
  vault = new Vault(dir, { user: (await loadSettings()).utilisateur || "" });
  await vault.scan();
  // On ne mémorise pas un coffre imposé par BRAIN_VAULT (tests) : sinon l'app rouvre ce coffre de test ensuite.
  if (!process.env.BRAIN_VAULT || path.resolve(process.env.BRAIN_VAULT) !== path.resolve(dir)) { const s = await loadSettings(); s.vaultPath = dir; await saveSettings(s); }
  semantic?.dispose?.();
  semantic = new SemanticRemote(vault, modelsDir);
  watcher?.close();
  let timer;
  const changed = new Set();
  watcher = chokidar.watch(dir, {
    // Les milliers de médias des banques ne sont pas surveillés (seules leurs notes comptent) : moins de RAM et de CPU.
    ignored: (p) => /[\\/](\.git|\.brain|\.obsidian|node_modules|_mini|_apercus)([\\/]|$)/.test(p) || (/[\\/]Banques[\\/]/.test(p) && /\.(png|jpe?g|webp|gif|svg|heic|mp4|mov|m4v|webm|ttf|zip|pdf|docx|xlsx|pptx)$/i.test(p)),
    ignoreInitial: true, awaitWriteFinish: { stabilityThreshold: 300 },
  });
  watcher.on("all", (_ev, p) => {
    changed.add(path.relative(dir, p).split(path.sep).join("/"));
    clearTimeout(timer);
    timer = setTimeout(async () => {
      for (const rel of changed) await vault.load(rel).catch(() => {});
      const notesChanged = [...changed].some((r) => r.endsWith(".md") && !r.endsWith("_index.md"));
      changed.clear(); vault.buildIndex();
      send("vault:changed", vault.stats());
      scheduleIndexes();
      if (notesChanged) { clearTimeout(semTimer); semTimer = setTimeout(indexSemantic, 5000); }
    }, 400);
  });
  indexSemantic();
  scheduleIndexes();
  clearInterval(fluxTimer);
  const autoFlux = () => runAll(vault, { force: false }).then((r) => r.length && send("flux:updated", r)).catch(() => {});
  setTimeout(autoFlux, 8000); fluxTimer = setInterval(autoFlux, 30e3); // chaque flux suit sa propre cadence
  return vault.stats();
}

// Les index automatiques (_index.md) sont régénérés quelques secondes après chaque changement.
let idxTimer;
function scheduleIndexes() {
  clearTimeout(idxTimer);
  idxTimer = setTimeout(async () => {
    try { await buildIndexes(vault); const { buildPack } = await import("./core/pack.mjs"); await buildPack(vault, await loadRegions(vault)); }
    catch (e) { console.error("index", e); }
  }, 4000);
}

// File d'enrichissement des médias importés (transcription, OCR), traitée un par un dans le processus IA.
// OCR lancé avec le Node du PC, dans un processus à part : Tesseract se bloque dans Electron
// et le Node intégré à Electron (v24) est trop ancien pour l'une de ses dépendances.
function ocrInNode(file) {
  return new Promise((resolve) => {
    execFile("node", [path.join(here, "core", "ocr-cli.mjs"), file, modelsDir],
      { windowsHide: true, timeout: 120000, maxBuffer: 1 << 24 },
      (err, out) => resolve(err ? "" : out));
  });
}
const enrichQueue = [];
let enriching = false;
async function pumpEnrich() {
  if (enriching || !semantic) return;
  enriching = true;
  const { transcriptSection, ocrSection } = await import("./core/enrich.mjs");
  while (enrichQueue.length) {
    const r = enrichQueue.shift();
    try {
      const file = vault.abs(r.fileRel);
      let section = "";
      if (r.kind === "video" || r.kind === "audio") section = transcriptSection(await semantic.call("transcribe", { file }));
      else if (r.kind === "image") section = ocrSection(await ocrInNode(file));
      if (section) {
        const note = await vault.read(r.noteRel);
        await vault.write(r.noteRel, note.replace(/\n## Liens\n/, section + "\n## Liens\n").replace("statut: a-decrire", "statut: a-compiler"));
        send("enrich:done", { rel: r.noteRel, kind: r.kind });
      }
    } catch (e) { console.error("enrichissement", r.fileRel, e.message); }
  }
  enriching = false;
}

let indexing = false, semTimer;
async function indexSemantic() {
  if (indexing || !semantic) return;
  indexing = true;
  try {
    const r = await semantic.indexAll((done, total) => send("semantic:progress", { done, total }));
    send("semantic:ready", r);
  } catch (e) { send("semantic:error", String(e.message || e)); }
  indexing = false;
}

function handlers() {
  const h = (ch, fn) => ipcMain.handle(ch, async (_e, ...a) => fn(...a));
  h("vault:info", () => (vault ? { ...vault.stats(), sem: !!semantic?.ready } : null));
  h("vault:choose", async () => { await win.loadFile(path.join(here, "renderer", "onboarding.html")); return null; });
  h("axon:whoami", async () => ({ utilisateur: vault?.user || "", dossier: vault?.root || "" }));
  h("axon:materiel", async () => {
    const g = await app.getGPUInfo("complete").catch(() => ({}));
    const actif = (g.gpuDevice || []).find((d) => d.active) || (g.gpuDevice || [])[0] || {};
    const ia = await semantic?.call?.("materiel").catch(() => null);
    const gl = g.auxAttributes?.glRenderer || "";
    return { carte: gl.match(/ANGLE \([^,]+, (.+?) \(0x/)?.[1] || actif.deviceString || gl || "inconnue", acceleration: app.getGPUFeatureStatus?.().webgl, ia: ia?.label || "pas encore chargée", coeurs: os.cpus().length, ram: Math.round(os.totalmem() / 1e9) };
  });
  h("journal:today", async () => {
    const rel = journalDuJour(vault.user);
    if (!vault.notes.has(rel)) {
      const d = new Date().toISOString().slice(0, 10);
      await vault.write(rel, `---\ntype: journal\ntags: [journal]\nauteur: ${vault.user || "moi"}\ncree: ${d}\n---\n# ${d}${vault.user ? " · " + vault.user : ""}\n\n## Fait aujourd'hui\n- \n\n## Idées\n- \n\n## Agents IA\n- \n`);
      await vault.load(rel);
    }
    return rel;
  });
  h("claude:brancher", async () => brancherClaude({ vault: vault.root, utilisateur: vault.user }));
  h("vault:tree", () => vault.tree());
  h("vault:graph", async () => {
    const g = vault.graph();
    const regions = await loadRegions(vault);
    for (const n of g.nodes) n.region = regionOf(n.from || n.id, regions);
    g.regions = regions.map((r) => ({ nom: r.nom, couleur: r.couleur, dir: r.dir, position: r.position, dossiers: r.dossiers, description: r.description }));
    if (semantic?.ready) g.links.push(...semantic.synapses(3, 0.5).filter((l) => !g.links.some((x) => (x.source === l.source && x.target === l.target) || (x.source === l.target && x.target === l.source))));
    return g;
  });
  h("note:get", async (rel) => {
    const n = vault.notes.get(rel);
    const content = await vault.read(rel);
    return { rel, title: n?.title, content, fm: n?.fm || {}, created: n?.created, mtime: n?.mtime, backlinks: vault.backlinks(rel), outlinks: vault.outlinks(rel), related: semantic?.ready ? semantic.related(rel, 6) : [] };
  });
  h("note:save", async (rel, content) => { await vault.write(rel, content); return true; });
  h("note:create", async (opts) => {
    const rel = await vault.createNote(opts);
    await vault.log(`Nouvelle note`, [rel], opts.auteur || "");
    return rel;
  });
  h("note:resolve", (name) => vault.resolve(name));
  h("file:info", (rel) => (vault.files.get(rel) ? { ...vault.files.get(rel), backlinks: vault.backlinks(rel) } : null));
  h("files:import", async (paths) => {
    const out = [];
    for (const p of paths) out.push(await vault.importFile(p).catch((e) => ({ error: `${path.basename(p)} : ${e.message}` })));
    for (const r of out) if (!r.error) enrichQueue.push(r);
    pumpEnrich();
    return out;
  });
  h("files:pick", async () => {
    const r = await dialog.showOpenDialog(win, { title: "Importer dans le Brain", properties: ["openFile", "multiSelections"] });
    return r.canceled ? [] : r.filePaths;
  });
  h("search:text", (q) => vault.search(q));
  h("search:neural", async (q) => (semantic?.ready ? neural(vault, semantic, q, 15) : vault.search(q, 15)));
  h("vault:meta", async () => { const regions = await loadRegions(vault); return meta(vault).map((n) => ({ ...n, region: regionOf(n.rel, regions) })); });
  h("flux:widgets", () => widgets(vault));
  h("live:snapshot", () => (live ??= startLive(send)).snapshot());
  // Catalogue des API publiques (dépôt public-apis) : construit une fois, mis en cache.
  let apiCatalog = null;
  h("apis:catalog", async () => {
    if (apiCatalog) return apiCatalog;
    const { parsePublicApis } = await import("./core/apis.mjs");
    apiCatalog = await parsePublicApis(path.resolve(here, "..", "references", "ia", "public-apis", "README.md"));
    return apiCatalog;
  });
  // Modèle : navigation locale instantanée, sinon Claude (âme + contexte), réponse en flux.
  // Moteur du Modèle : « claude » (Claude Code, abonnement) ou « local » (Qwen3 0,6B, hors ligne). Mémorisé.
  h("chat:engine", async (set) => {
    const s = await loadSettings();
    if (set) { s.chatEngine = set; await saveSettings(s); }
    return s.chatEngine || "claude";
  });
  const askLocal = async (text, sem, why = "") => {
    const pack = await contextPack(vault, sem, text, { budgetWords: 900 });
    const answer = await semantic.call("generate", { messages: [
      { role: "system", content: "Tu es Axon, l'assistant de ce cerveau. Réponds en français, court et précis, uniquement à partir du contexte. Cite les notes avec [[Titre]]. /no_think" },
      { role: "user", content: `${pack.text}\n\nQuestion : ${text}` } ] });
    return { text: `${answer}\n\n_Modèle local (Qwen3 0,6B)${why ? " · Claude indisponible : " + why.slice(0, 120) : ""}_`, sources: pack.notes.map((rel) => ({ rel, title: vault.notes.get(rel)?.title || rel })), local: true };
  };
  h("chat:send", async ({ id, text, sessionId }) => {
    const sem = semantic?.ready ? semantic : null;
    if (isNavigation(text)) return { ...(await navigate(vault, sem, text)), local: true, sessionId };
    if ((await loadSettings()).chatEngine === "local") return askLocal(text, sem);
    const soul = (await vault.read("99-Systeme/Ame du cerveau.md").catch(() => "")).replace(/^---[\s\S]*?---\n/, "");
    try {
      return await askClaude({ vault, semantic: sem, soul, question: text, sessionId, onEvent: (e) => send("chat:delta", { id, ...e }) });
    } catch (e) {
      return askLocal(text, sem, e.message); // secours automatique
    }
  });
  h("flux:update", async (only) => { const r = await runAll(vault, { only }); await vault.scan(); return r; });
  h("brain:context", async (q) => (await contextPack(vault, semantic?.ready ? semantic : null, q)).text);
  h("maintain:lint", async () => {
    await buildIndexes(vault); await vault.scan();
    return lint(vault, semantic?.ready ? semantic : null);
  });
  h("search:sens", async (q) => (semantic?.ready ? semantic.query(q, 15) : { pending: true }));
  h("semantic:reindex", () => { indexSemantic(); return true; });
  h("shell:reveal", (rel) => shell.showItemInFolder(vault.abs(rel)));
  h("shell:open", (rel) => shell.openPath(vault.abs(rel)));
  h("git:sync", async () => {
    const git = simpleGit(vault.root);
    if (!(await git.checkIsRepo())) await git.init();
    await git.add(["-A"]);
    const st = await git.status();
    if (st.files.length) await git.commit(`Axon : synchro du ${new Date().toLocaleString("fr-FR")}`);
    const remotes = await git.getRemotes();
    if (!remotes.length) return { ok: true, message: `${st.files.length} changement(s) enregistré(s) sur ce PC. Aucun GitHub branché pour l'instant.` };
    await git.pull(["--rebase"]).catch(() => {});
    await git.push();
    return { ok: true, message: `${st.files.length} changement(s) enregistré(s) et envoyé(s) sur GitHub.` };
  });
}

app.whenReady().then(async () => {
  protocol.handle("brain", (req) => {
    const rel = decodeURIComponent(new URL(req.url).pathname.replace(/^\//, ""));
    try { return net.fetch(pathToFileURL(vault.abs(rel)).toString(), { headers: req.headers }); }
    catch { return new Response("Interdit", { status: 403 }); }
  });
  handlers();
  onboardingHandlers();
  preferHighPerfGpu();
  win = new BrowserWindow({
    width: 1500, height: 920, minWidth: 900, minHeight: 600, backgroundColor: "#060708", title: "Axon", icon: path.join(here, "renderer", "icon.png"),
    titleBarStyle: "hidden", titleBarOverlay: { color: "#060708", symbolColor: "#cfd2d8", height: 40 },
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(here, "preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: "deny" }; });
  win.webContents.on("will-navigate", (e, url) => { if (!url.startsWith("file:")) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); } });
  const dir = await pickVaultPath();
  if (dir) { await openVault(dir); await win.loadFile(path.join(here, "renderer", "index.html")); }
  else await win.loadFile(path.join(here, "renderer", "onboarding.html"));
  // Mode test : BRAIN_SNAPSHOT=fichier.png → capture la fenêtre (après un script optionnel) puis quitte.
  if (process.env.BRAIN_SNAPSHOT) {
    const errors = [];
    win.webContents.on("console-message", (e) => { if (e.level === "error") errors.push(e.message); });
    await new Promise((r) => setTimeout(r, +(process.env.BRAIN_WAIT || 6000)));
    // BRAIN_STEPS = [{ js, wait, out }] : enchaîne des actions et des captures (tests visuels).
    const steps = process.env.BRAIN_STEPS ? JSON.parse(process.env.BRAIN_STEPS) : [{ js: process.env.BRAIN_SCRIPT, wait: 2500, out: process.env.BRAIN_SNAPSHOT }];
    for (const s of steps) {
      if (s.js) await win.webContents.executeJavaScript(s.js).catch((e) => errors.push(String(e)));
      await new Promise((r) => setTimeout(r, s.wait ?? 2500));
      if (s.out) await fs.writeFile(s.out, (await win.webContents.capturePage()).toPNG());
    }
    if (errors.length) await fs.writeFile(process.env.BRAIN_SNAPSHOT + ".errors.txt", errors.join("\n"));
    app.quit();
  }
});
app.on("window-all-closed", () => app.quit());
app.on("before-quit", () => semantic?.dispose?.());
