// Enrichissement automatique des médias importés, 100 % local :
//  - vidéo / audio → transcription Whisper avec minutage (texte cherchable par les IA) ;
//  - image → texte lu par OCR (Tesseract, français + anglais).
// Exécuté dans le processus « IA locale » (semantic-worker) pour ne jamais bloquer l'interface.
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

let asr = null, ocrWorker = null;

const run = (cmd, args) => new Promise((res, rej) => execFile(cmd, args, { windowsHide: true, maxBuffer: 1 << 26 }, (e, out) => (e ? rej(e) : res(out))));
const mmss = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export async function transcribe(file, cacheDir, { maxSeconds = 1800, language = "french" } = {}) {
  const raw = path.join(os.tmpdir(), `brain-${Date.now()}.f32`);
  // ffmpeg : piste audio en mono 16 kHz, flottants 32 bits (ce qu'attend Whisper)
  await run("ffmpeg", ["-y", "-loglevel", "error", "-i", file, "-t", String(maxSeconds), "-ac", "1", "-ar", "16000", "-f", "f32le", raw]);
  const buf = await fs.readFile(raw); await fs.rm(raw, { force: true });
  if (buf.length < 16000 * 4 * 0.5) return { text: "", chunks: [] }; // moins d'une demi-seconde de son
  const audio = new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4);
  if (!asr) {
    const { pipeline, env } = await import("@huggingface/transformers");
    env.cacheDir = cacheDir;
    asr = await pipeline("automatic-speech-recognition", "onnx-community/whisper-base", { dtype: "q8" });
  }
  const out = await asr(audio, { chunk_length_s: 30, stride_length_s: 5, return_timestamps: true, task: "transcribe", language, no_repeat_ngram_size: 3 });
  const chunks = (out.chunks || []).map((c) => ({ t: c.timestamp?.[0] ?? 0, text: c.text.trim() })).filter((c) => c.text);
  return { text: out.text?.trim() || "", chunks };
}

export async function ocr(file, cacheDir) {
  if (!ocrWorker) {
    const { createWorker } = await import("tesseract.js");
    ocrWorker = await createWorker(["fra", "eng"], 1, { cachePath: path.join(cacheDir, "tesseract") });
  }
  const { data } = await ocrWorker.recognize(file);
  return (data.text || "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

// Construit la section Markdown à ajouter dans la fiche du média.
export function transcriptSection({ text, chunks }) {
  if (!text) return "";
  const lines = chunks.length ? chunks.map((c) => `- \`${mmss(c.t)}\` ${c.text}`).join("\n") : text;
  return `\n## Transcription (automatique, Whisper local)\n\n${lines}\n`;
}
export function ocrSection(text) {
  return text && text.replace(/\W/g, "").length > 12 ? `\n## Texte dans l'image (OCR automatique)\n\n${text.split("\n").map((l) => "> " + l).join("\n")}\n` : "";
}
