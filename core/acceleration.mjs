// ACCÉLÉRATION MATÉRIELLE de l'IA locale (recherche par le sens, petit modèle de secours).
// Mesuré le 2026-11-11 (i7-11800H + RTX 3060 Laptop, modèle EmbeddingGemma 300M) pour 64 notes :
//   processeur q8 par paquets ≈ 4,8 s · processeur q8 une par une ≈ 11,5 s · carte graphique DirectML ≈ 21 à 42 s.
// Pour un PETIT modèle, le processeur gagne (la carte perd du temps à chaque aller-retour de données).
// La carte graphique sert donc à l'AFFICHAGE (cerveau 3D, voir main.mjs) ; l'IA locale tourne sur le processeur, par paquets.
// Pour essayer la carte graphique quand même (gros modèles futurs) : variable AXON_DEVICE=dml (Windows) ou cuda (Linux).
import os from "node:os";

const order = () => {
  const forced = process.env.AXON_DEVICE;
  if (forced && forced !== "auto") return [forced, "cpu"];
  return ["cpu"];
};

export const status = { device: null, essais: [] };

/** Charge un pipeline transformers.js sur le meilleur matériel disponible. */
export async function loadPipeline(task, model, opts = {}) {
  const { pipeline } = await import("@huggingface/transformers");
  let lastErr;
  for (const device of order()) {
    try {
      const p = await pipeline(task, model, { ...opts, device }); // threads : réglage par défaut d ONNX (mesuré le plus rapide)
      // petit essai réel : certaines cartes acceptent le chargement mais échouent au calcul
      if (task === "feature-extraction") await p("test", { pooling: "mean", normalize: true });
      status.device = device; status.essais.push({ device, ok: true });
      return p;
    } catch (e) { lastErr = e; status.essais.push({ device, ok: false, erreur: String(e.message || e).slice(0, 160) }); }
  }
  throw lastErr;
}

export const deviceLabel = (d = status.device) => ({ dml: "carte graphique (DirectML)", cuda: "carte graphique (CUDA)", webgpu: "carte graphique (WebGPU)", cpu: `processeur (${os.cpus().length} cœurs)` })[d] || "pas encore chargé";
