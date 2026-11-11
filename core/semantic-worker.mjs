// Processus séparé pour l'IA locale (embeddings) : le modèle tourne ici, jamais dans le processus
// principal, pour que l'interface reste fluide même pendant le calcul de milliers de notes.
import { Vault } from "./vault.mjs";
import { Semantic } from "./semantic.mjs";

const port = process.parentPort;
let sem = null, generator = null;
const progress = (done, total) => port.postMessage({ type: "progress", done, total });

port.on("message", async (e) => {
  const m = e.data;
  try {
    let result;
    if (m.type === "index") {
      if (!sem || sem.vault.root !== m.root) sem = new Semantic(new Vault(m.root), m.cacheDir);
      await sem.vault.scan();
      result = await sem.indexAll(progress);
    } else if (m.type === "generate") {
      // Petit modèle de secours, 100 % local (Qwen3 0.6B, quantifié 4 bits, ~1 Go de RAM).
      const { env } = await import("@huggingface/transformers");
      env.cacheDir = m.cacheDir;
      const { loadPipeline } = await import("./acceleration.mjs");
      generator ??= await loadPipeline("text-generation", "onnx-community/Qwen3-0.6B-ONNX", { dtype: "q4f16" });
      const out = await generator(m.messages, { max_new_tokens: m.max || 400, do_sample: false });
      result = String(out[0].generated_text.at(-1).content).replace(/<think>[\s\S]*?<\/think>/g, "").trim();
    } else if (m.type === "transcribe") {
      const { transcribe } = await import("./enrich.mjs");
      result = await transcribe(m.file, m.cacheDir);
    } else if (m.type === "ocr") {
      const { ocr } = await import("./enrich.mjs");
      result = await ocr(m.file, m.cacheDir);
    } else if (m.type === "materiel") {
      const { status, deviceLabel } = await import("./acceleration.mjs");
      result = { ...status, label: deviceLabel() };
    } else if (m.type === "embed") {
      if (!sem) sem = new Semantic(new Vault(m.root), m.cacheDir);
      result = await sem.embed(m.text, m.kind);
    }
    port.postMessage({ id: m.id, result });
  } catch (err) {
    port.postMessage({ id: m.id, error: String(err?.stack || err) });
  }
});
