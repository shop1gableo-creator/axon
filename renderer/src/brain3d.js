// =====================================================================================
// Cerveau 3D — v6 (physique façon Obsidian, dans un vrai cerveau)
// -------------------------------------------------------------------------------------
// • Un CERVEAU anatomique tracé en points fins (hémisphères, lobes, cervelet, tronc, moelle),
//   qui GRANDIT avec le nombre de neurones (jamais tout entassé au même endroit).
// • Physique comme Obsidian : les liens attirent (ressorts), les neurones se repoussent,
//   ils ne se chevauchent pas (collision), et une force douce les garde dans leur région.
//   On peut ATTRAPER un neurone : ses voisins suivent, les autres s'écartent.
// • Dans chaque région, les neurones se regroupent par communauté (sous-dossier), comme
//   les clusters de Graphify / Obsidian.
// • Sélection précise : seul le disque visible est cliquable, le plus proche gagne ; pas de
//   survol pendant qu'on fait tourner le cerveau.
// • Appui long sur un neurone : on voit tout ce qui lui est relié (impulsions sur les liens).
// • Les nouveaux neurones APPARAISSENT en direct (quand on crée une note, ou quand une IA écrit) :
//   ils éclosent, leurs liens s'allument, la caméra les suit.
// • Étiquettes à taille fixe à l'écran, jamais plus de ~28 à la fois : toujours lisible.
// =====================================================================================
import ForceGraph3D from "3d-force-graph";
import * as THREE from "three";
import SpriteText from "three-spritetext";
import { forceCollide } from "d3-force-3d";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

export const PALETTES = {
  default: ["#7aa7ff", "#ff8a5c", "#5fd3a8", "#f4c45a", "#c38bff", "#ff6b8a", "#4fd1e8", "#a3d35c", "#ffa94d", "#e6e8ee"],
  lava: ["#ff3b1f", "#ff7a2f", "#ffb347", "#ffd166", "#ff5a5f", "#e85d75", "#f4a261", "#ff9f1c", "#ffcf99", "#ff6b35"],
  ocean: ["#38bdf8", "#22d3ee", "#2dd4bf", "#60a5fa", "#818cf8", "#a5f3fc", "#5eead4", "#93c5fd", "#c4b5fd", "#67e8f9"],
  forest: ["#7cc36a", "#a7d46f", "#4f9d69", "#c9e27a", "#5fb38a", "#9bc53d", "#3f8f5f", "#d4e79e", "#6aa84f", "#b5d99c"],
  aurora: ["#8b5cf6", "#ec4899", "#22d3ee", "#34d399", "#a78bfa", "#f472b6", "#2dd4bf", "#60a5fa", "#c084fc", "#4ade80"],
  mono: ["#ffffff", "#d4d8e0", "#aab1bf", "#8b93a3", "#e9ecf2", "#c2c8d3", "#9aa2b1", "#f2f4f8"],
  sunset: ["#ff6b6b", "#ff9f43", "#feca57", "#ff7eb3", "#e66767", "#f8a5c2", "#f7b267", "#f4845f", "#c56cf0", "#ffd3b6"],
};
export const THEMES = { original: "#000000", midnight: "#05070d", graphite: "#16171a", pine: "#0b1411", plum: "#130d16", ember: "#150c08" };
export const SHAPES = { brain: "Cerveau", spine: "Cerveau + colonne", galaxy: "Galaxie" };
export const LAYOUTS = ["grid", "ribbon", "wheel", "spheres", "shells", "clusters", "folders", "astrolabe"];
export const DEFAULTS = {
  theme: "graphite", palette: "default", morph: 0, layout: "clusters", recordLayout: "spine", order: "oldest",
  showNotes: true, showRecord: true, groupBy: "region", labels: "lit", turning: false, speed: 30,
  links: true, sens: false, scaffold: 100, pointSize: 100, bloom: 0, empties: true, follow: true, shape: "spine",
};

const bgColor = (hex) => "#" + new THREE.Color(hex).getHexString(THREE.LinearSRGBColorSpace);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const hash = (s) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0) / 4294967295; };
const rng = (seed) => { let s = Math.floor(seed * 2 ** 31) || 1; return () => ((s = Math.imul(s ^ (s >>> 15), 1 | s) + 0x6d2b79f5) >>> 0) / 4294967296; };
const fib = (i, n) => { const y = 1 - (2 * (i + 0.5)) / n, r = Math.sqrt(1 - y * y), t = Math.PI * (3 - Math.sqrt(5)) * i; return { x: Math.cos(t) * r, y, z: Math.sin(t) * r }; };
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const clean = (s) => String(s).replace(/\.md$/, "");
const rgba = (hex, a) => { const c = new THREE.Color(hex); return `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${a})`; };
const easeOutBack = (t) => { const c = 1.7; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };

// ---------------------------------------------------------------------------------
// Anatomie (repère : x = avant (−) / arrière (+), y = haut, z = gauche (−) / droite (+)).
// Les dimensions de base sont multipliées par K, qui grandit avec le nombre de neurones.
// ---------------------------------------------------------------------------------
const BASE_PARTS = [
  { c: [5, 25, -40], r: [128, 86, 58], k: "cortex" }, { c: [5, 25, 40], r: [128, 86, 58], k: "cortex" },
  { c: [-72, 6, -36], r: [70, 72, 52], k: "cortex" }, { c: [-72, 6, 36], r: [70, 72, 52], k: "cortex" },
  { c: [86, 16, -34], r: [62, 64, 50], k: "cortex" }, { c: [86, 16, 34], r: [62, 64, 50], k: "cortex" },
  { c: [-14, -40, -58], r: [78, 40, 36], k: "cortex" }, { c: [-14, -40, 58], r: [78, 40, 36], k: "cortex" },
  { c: [84, -66, -30], r: [46, 30, 40], k: "cervelet" }, { c: [84, -66, 30], r: [46, 30, 40], k: "cervelet" },
  { c: [30, -60, 0], r: [26, 30, 24], k: "tronc" },
];
const BASE_CORD = { top: [32, -78, 0], bottom: [44, -205, 0], r: 12 };
const BASE_LOBES = {
  centre: { c: [0, 18, 0], r: [40, 30, 26] },
  "haut-avant": { c: [-82, 38, 0], r: [42, 34, 64] },
  "haut-arriere": { c: [42, 70, 0], r: [62, 20, 64] },
  haut: { c: [0, 84, 0], r: [70, 14, 56] },
  gauche: { c: [-16, -34, -62], r: [56, 22, 20] },
  droite: { c: [-16, -34, 62], r: [56, 22, 20] },
  "avant-droite": { c: [-96, -6, 42], r: [32, 32, 22] },
  "avant-gauche": { c: [-96, -6, -42], r: [32, 32, 22] },
  "arriere-droite": { c: [86, -64, 0], r: [34, 18, 36] },
  "arriere-gauche": { c: [104, 22, -32], r: [34, 40, 24] },
  arriere: { c: [96, 22, 0], r: [48, 56, 70] }, // lobe occipital = cortex visuel (banques de médias)
  bas: { c: [-10, -20, 0], r: [40, 16, 30] },
};
let K = 1, PARTS = BASE_PARTS, CORD = BASE_CORD, LOBES = BASE_LOBES;
const CENTER = new THREE.Vector3(5, 5, 0);
function setScale(k) {
  K = k;
  const m = (a) => a.map((v) => v * k);
  PARTS = BASE_PARTS.map((p) => ({ ...p, c: m(p.c), r: m(p.r) }));
  CORD = { top: m(BASE_CORD.top), bottom: m(BASE_CORD.bottom), r: BASE_CORD.r * k };
  LOBES = Object.fromEntries(Object.entries(BASE_LOBES).map(([n, l]) => [n, { c: m(l.c), r: m(l.r) }]));
  CENTER.set(5 * k, 5 * k, 0);
}
function insideEll(p, e, s = 1) { const dx = (p.x - e.c[0]) / (e.r[0] * s), dy = (p.y - e.c[1]) / (e.r[1] * s), dz = (p.z - e.c[2]) / (e.r[2] * s); return dx * dx + dy * dy + dz * dz <= 1; }
function inBrain(p, s = 1) { return PARTS.some((e) => insideEll(p, e, s)); }
const folds = (x, y, z) => Math.sin(x * 0.075 + 2.2 * Math.sin(y * 0.05 + z * 0.03)) + Math.sin(y * 0.085 + 2.0 * Math.sin(z * 0.06 + x * 0.035)) + Math.sin(z * 0.07 + 1.8 * Math.sin(x * 0.045 - y * 0.03));

function makeTexture(draw) {
  const c = document.createElement("canvas"); c.width = c.height = 128;
  draw(c.getContext("2d"));
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
// Disque plein + liseré + petit halo. Le disque visible fait 34/64 du sprite (DOT_R).
const DOT_R = 34 / 64;
const dotTexture = () => makeTexture((g) => {
  const halo = g.createRadialGradient(64, 64, 30, 64, 64, 64);
  halo.addColorStop(0, "rgba(255,255,255,.28)"); halo.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = halo; g.fillRect(0, 0, 128, 128);
  const body = g.createRadialGradient(54, 52, 4, 64, 64, 36);
  body.addColorStop(0, "#ffffff"); body.addColorStop(0.35, "rgba(255,255,255,.96)"); body.addColorStop(1, "rgba(225,225,225,.92)");
  g.fillStyle = body; g.beginPath(); g.arc(64, 64, 34, 0, Math.PI * 2); g.fill();
  g.strokeStyle = "#fff"; g.lineWidth = 3; g.stroke();
});
const ringTexture = () => makeTexture((g) => { g.strokeStyle = "#fff"; g.lineWidth = 9; g.beginPath(); g.arc(64, 64, 44, 0, Math.PI * 2); g.stroke(); });
// Anneau de visée en tirets (HUD).
const reticleTexture = () => makeTexture((g) => {
  g.strokeStyle = "#fff"; g.lineWidth = 3; g.lineCap = "round";
  for (let i = 0; i < 4; i++) { const a = (i * Math.PI) / 2; g.beginPath(); g.arc(64, 64, 52, a + 0.18, a + Math.PI / 2 - 0.18); g.stroke(); }
  g.lineWidth = 1.2; g.setLineDash([2, 5]); g.beginPath(); g.arc(64, 64, 60, 0, Math.PI * 2); g.stroke();
});
const fineTexture = () => makeTexture((g) => {
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(0.5, "rgba(255,255,255,.8)"); r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
});

// Les notes « système » (log, index, carte) relient presque tout : leurs liens sont masqués
// tant qu'on ne les sélectionne pas, sinon ils couvrent le cerveau de gris.
const SYSTEM_HUB = /^99-Systeme\/(Log\/.*|index|carte-auto|Sante du cerveau|Membres)\.md$/;

export function createBrain(el, { onSelect, onHover, onEmpty, onOpen }) {
  let S = { ...DEFAULTS };
  let data = { nodes: [], links: [], regions: [] };
  let colorOf = {}, hidden = new Set(), timeCut = Infinity;
  let adj = new Map(), hubCut = 99;
  let selected = null, hovered = null, focusNode = null, lit = new Map();
  let dragging = null, pointerDown = false, rotating = false;
  const TEX = { dot: dotTexture(), ring: ringTexture(), fine: fineTexture(), reticle: reticleTexture() };

  const groupKey = (n) => (S.groupBy === "tag" ? n.tags?.[0] || "sans tag" : S.groupBy === "type" ? n.kind : S.groupBy === "region" ? (n.spine ? "Brut" : n.region || "Autres") : n.group);
  const visible = (n) => !!n && !hidden.has(groupKey(n)) && (n.created || 0) <= timeCut && (n.spine ? S.showRecord : S.showNotes);
  const nodeOf = (x) => (typeof x === "object" ? x : byId.get(x));
  let byId = new Map();
  const isHub = (n) => n.kind === "note" && n.deg >= hubCut;
  const isSys = (n) => SYSTEM_HUB.test(n?.id || "");
  const sizeOf = (n) => (S.pointSize / 100) * (n.kind === "note" ? (n.spine ? 2.4 : 2.8) + Math.sqrt(n.deg || 0) * 1.25 : n.kind === "ghost" ? 2.4 : 2);
  const colorFor = (n) => (n.kind === "ghost" ? "#8c93a3" : colorOf[groupKey(n)] || "#9aa3b5");

  // ---------- graphe ----------
  const G = ForceGraph3D({ controlType: "orbit" })(el)
    .backgroundColor("rgba(0,0,0,0)")
    .showNavInfo(false)
    .nodeLabel(() => "") // infobulle maison (plus stable)
    .nodeThreeObject((n) => {
      const g = new THREE.Group();
      const mat = new THREE.SpriteMaterial({ map: n.kind === "ghost" ? TEX.ring : TEX.dot, color: new THREE.Color(colorFor(n)), transparent: true, depthWrite: false });
      const la = lit.get(n.id); mat.opacity = !lit.size ? (n.kind === "ghost" ? 0.75 : 1) : la ? 1 : 0.3;
      const dot = new THREE.Sprite(mat); dot.renderOrder = 10;
      // Seul le disque visible est cliquable (pas le halo) : fini les sélections du mauvais neurone.
      dot.raycast = function (ray, hits) {
        const p = new THREE.Vector3().setFromMatrixPosition(this.matrixWorld);
        const r = this.scale.x * DOT_R * 1.1;
        const d = ray.ray.distanceSqToPoint(p);
        if (d <= r * r) hits.push({ distance: ray.ray.origin.distanceTo(p), point: p, object: this });
      };
      g.add(dot);
      g.userData = { dot, label: null };
      sizeNode(n, g); n.__obj = g; return g;
    })
    .nodeVisibility(visible)
    .linkVisibility(linkVisible)
    .linkColor(linkColor)
    .linkOpacity(1)
    .linkWidth(0)
    .linkDirectionalParticles((l) => (particleLink(l) ? 3 : 0))
    .linkDirectionalParticleWidth(1.8)
    .linkDirectionalParticleSpeed(0.008)
    .linkDirectionalParticleColor((l) => colorFor(nodeOf(l.source)))
    .enableNodeDrag(true)
    .onNodeHover((n) => {
      if ((rotating || performance.now() < wheelUntil) && !dragging) return;
      setHover(n || null);
    })
    .onNodeClick((n) => {
      if (longFired) { longFired = false; return; }
      const now = performance.now(), dbl = lastClick.n === n && now - lastClick.t < 380;
      lastClick = { n, t: now };
      activate(n, false);
      if (dbl) onOpen?.(n); // double-clic : le neurone s'ouvre en grand devant l'écran
    })
    .onNodeDrag((n) => {
      if (!dragging) {
        dragging = n; cancelLong(); selected = n; updateLit();
        clearTimeout(refreeze);
        const nb = adj.get(n.id) || new Set();
        for (const m of data.nodes) {
          m._back ??= { x: m.fx ?? m.x, y: m.fy ?? m.y, z: m.fz ?? m.z };
          m.__nb = nb.has(m.id) && !isSys(m);
          if (m !== n) { m.fx = m.fy = m.fz = undefined; freed.add(m); }
        }
      }
    })
    .onNodeDragEnd((n) => {
      dragging = null;
      n.fx = n.fy = n.fz = undefined; freed.add(n); // on le lâche : le ressort le ramène à sa place
      G.d3ReheatSimulation();
      clearTimeout(refreeze); refreeze = setTimeout(freezeFreed, 3200);
    })
    .onBackgroundClick((ev) => {
      const e = pickEmpty(ev);
      if (e) { onEmpty?.(e); return; }
      selected = null; focusNode = null; updateLit(); onSelect(null);
    })
    .cooldownTime(9000)
    .d3AlphaDecay(0.028)
    .d3VelocityDecay(0.42);

  // Figer : une fois le cerveau posé, chaque neurone est fixé. Plus rien ne bouge tout seul.
  let lastClick = { n: null, t: 0 }, refreeze = null, settled = false, morphUntil = 0;
  const freed = new Set();
  function freeze(n) { if (n.x !== undefined) { n.fx = n.x; n.fy = n.y; n.fz = n.z; } }
  function freezeFreed() {
    for (const m of freed) {
      if (m === dragging) continue;
      if (m._back) { Object.assign(m, { x: m._back.x, y: m._back.y, z: m._back.z, vx: 0, vy: 0, vz: 0 }); m._back = null; m.__nb = false; }
      freeze(m);
    }
    freed.clear();
  }
  function freezeAll() { if (S.morph > 0) return; for (const n of data.nodes) if (n !== dragging && !births.has(n.id)) freeze(n); settled = true; }
  function unfreezeAll() { for (const n of data.nodes) n.fx = n.fy = n.fz = undefined; settled = false; }
  G.onEngineStop(() => { freezeFreed(); if (!settled) freezeAll(); });

  const controls = G.controls();
  controls.enableDamping = true; controls.dampingFactor = 0.07; controls.rotateSpeed = 0.55; controls.zoomSpeed = 0.9;
  controls.minDistance = 30; controls.maxDistance = 2200;
  const camera = G.camera();
  const renderer = G.renderer();
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  const bloom = new UnrealBloomPass(new THREE.Vector2(el.clientWidth || 1200, el.clientHeight || 800), 0.2, 0.5, 0.62);
  G.postProcessingComposer().addPass(bloom);
  const scene = G.scene();

  // Pendant qu'on fait tourner le cerveau (bouton enfoncé hors d'un neurone), pas de survol :
  // sinon tout s'allume et s'ouvre au passage de la souris.
  let wheelUntil = 0;
  el.addEventListener("wheel", () => { wheelUntil = performance.now() + 350; if (hovered) setHover(null); }, { passive: true });
  el.addEventListener("pointerdown", (ev) => {
    pointerDown = true; downAt = { x: ev.clientX, y: ev.clientY };
    if (hovered) startLong(hovered); else rotating = true;
  });
  window.addEventListener("pointerup", () => { pointerDown = false; rotating = false; cancelLong(); });
  el.addEventListener("pointermove", (ev) => { if (pointerDown && downAt && Math.hypot(ev.clientX - downAt.x, ev.clientY - downAt.y) > 6) cancelLong(); });
  let downAt = null;

  // Appui long (0,45 s) sur un neurone : il montre tout ce à quoi il est relié.
  let longTimer = null, longFired = false;
  function startLong(n) {
    cancelLong();
    longTimer = setTimeout(() => { longFired = true; focusNode = n; selected = n; updateLit(); G.linkDirectionalParticles(G.linkDirectionalParticles()); }, 450);
  }
  function cancelLong() { clearTimeout(longTimer); longTimer = null; }

  // Survol avec un petit délai et de l'hystérésis : pas de clignotement entre deux neurones proches.
  let hoverTimer = null;
  function setHover(n) {
    clearTimeout(hoverTimer);
    if (n === hovered) return;
    hoverTimer = setTimeout(() => {
      hovered = n; el.style.cursor = n ? "pointer" : "grab";
      showTip(n); updateLit(); onHover?.(n);
    }, n ? 60 : 140);
  }
  const tip = document.createElement("div"); tip.className = "tip node-tip"; tip.hidden = true; el.appendChild(tip);
  let mouse = { x: 0, y: 0 };
  el.addEventListener("pointermove", (ev) => { const r = el.getBoundingClientRect(); mouse = { x: ev.clientX - r.left, y: ev.clientY - r.top }; if (!tip.hidden) placeTip(); });
  function placeTip() { tip.style.left = mouse.x + 16 + "px"; tip.style.top = mouse.y + 14 + "px"; }
  function showTip(n) {
    if (!n) { if (!emptyTip) tip.hidden = true; return; }
    tip.innerHTML = `<b>${esc(clean(n.name))}</b><span>${n.kind === "ghost" ? "note pas encore créée · clic pour la créer" : `${esc(groupKey(n))} · ${n.deg} lien(s) · maintenir pour voir ses liens`}</span>`;
    tip.hidden = false; placeTip();
  }

  // ---------- forces : comme Obsidian (ressorts + répulsion + collision) + maison dans la région ----------
  function linkStrength(l) {
    const a = nodeOf(l.source), b = nodeOf(l.target);
    if (isSys(a) || isSys(b) || l.type === "ghost") return 0.02;
    if (l.type === "sens") return 0.02;
    if (dragging && (a === dragging || b === dragging)) return 0.9; // on tire ses voisins avec la souris
    return 0.55 / Math.max(1, Math.min(a?.deg || 1, b?.deg || 1) ** 0.5); // comme d3 : les gros hubs tirent moins chacun
  }
  G.d3Force("link").distance((l) => (l.type === "sens" ? 60 : 26) * Math.sqrt(K)).strength(linkStrength);
  G.d3Force("charge").strength(-42).distanceMax(220);
  G.d3Force("center", null);
  G.d3Force("collide", forceCollide((n) => sizeOf(n) * 1.6 + 2).strength(0.9).iterations(1));
  const home = (() => {
    let nodes = [];
    const f = (alpha) => {
      const m = S.morph / 100, k = (dragging ? 0.03 : 0.08) + 0.3 * m;
      for (const n of nodes) {
        if (n === dragging) continue;
        if (n._back) { const b = n._back, k = dragging ? (n.__nb ? 0.012 : 0.07) : 0.1; n.vx += (b.x - n.x) * k; n.vy += (b.y - n.y) * k; n.vz += (b.z - n.z) * k; continue; }
        const t = n._t; if (!t) continue;
        n.vx += (t.x - n.x) * k * alpha; n.vy += (t.y - n.y) * k * alpha; n.vz += (t.z - n.z) * k * alpha;
        // Le crâne : un neurone qui sort du cerveau est ramené vers l'intérieur.
        if (m < 0.4 && S.shape !== "galaxy" && !n.spine && n.x !== undefined && !inBrain(n, 0.96)) { n.vx += (CENTER.x - n.x) * 0.06; n.vy += (CENTER.y - n.y) * 0.06; n.vz += (CENTER.z - n.z) * 0.06; }
      }
    };
    f.initialize = (ns) => (nodes = ns); return f;
  })();
  G.d3Force("home", home);

  function sizeNode(n, g = n.__obj) {
    if (!g) return;
    const s = sizeOf(n);
    g.userData.dot.scale.set(s * 2, s * 2, 1);
    if (g.userData.label) g.userData.label.position.y = s * 1.15 + 2;
  }

  // Étiquettes créées seulement quand on en a besoin (beaucoup moins de mémoire).
  function labelOf(n) {
    const g = n.__obj; if (!g) return null;
    if (g.userData.label) return g.userData.label;
    const l = new SpriteText(clean(n.name).toUpperCase(), 8, "rgba(235,240,248,.82)");
    l.fontFace = "Geist Mono, JetBrains Mono, Cascadia Mono, Consolas, monospace"; l.fontWeight = "400";
    l.strokeWidth = 0.6; l.strokeColor = "rgba(5,6,9,.9)";
    l.material.depthTest = false; l.material.transparent = true; l.material.sizeAttenuation = false; // taille fixe à l'écran
    const h = 0.0155; l.scale.set((l.scale.x / l.scale.y) * h, h, 1);
    l.center.set(0.5, -0.9); // posée au-dessus du disque
    l.renderOrder = 20; l.raycast = () => {}; l.visible = false;
    g.add(l); g.userData.label = l;
    return l;
  }

  // ---------- cerveau tracé ----------
  let cortex = null;
  function buildCortex() {
    if (cortex) { scene.remove(cortex); cortex.geometry.dispose(); }
    const pos = [], bright = [], r = rng(0.4242);
    const area = PARTS.map((e) => e.r[0] * e.r[1] + e.r[1] * e.r[2] + e.r[0] * e.r[2]);
    const total = area.reduce((a, b) => a + b, 0), N = 32000;
    PARTS.forEach((e, i) => {
      const count = Math.round((N * area[i]) / total);
      for (let j = 0; j < count; j++) {
        const u = r() * 2 - 1, t = r() * Math.PI * 2, s = Math.sqrt(1 - u * u);
        const d = { x: s * Math.cos(t), y: u, z: s * Math.sin(t) };
        const p = { x: e.c[0] + d.x * e.r[0], y: e.c[1] + d.y * e.r[1], z: e.c[2] + d.z * e.r[2] };
        if (PARTS.some((o, k) => k !== i && insideEll(p, o, 0.985))) continue;
        const q = { x: p.x / K, y: p.y / K, z: p.z / K };
        const line = e.k === "cervelet" ? Math.abs(Math.sin(q.y * 0.55 + Math.sin(q.z * 0.05) * 1.5)) < 0.22 : e.k === "tronc" ? false : Math.abs(folds(q.x, q.y, q.z)) < 0.2;
        const depth = line ? 2.6 * K : 0;
        pos.push(p.x - d.x * depth, p.y - d.y * depth, p.z - d.z * depth);
        bright.push(line ? 1.05 : e.k === "tronc" ? 0.5 : 0.2);
      }
    });
    const cordStart = bright.length;
    for (let j = 0; j < 1800; j++) {
      const t = r(), a = r() * Math.PI * 2, rr = CORD.r * (1 - t * 0.35);
      pos.push(CORD.top[0] + (CORD.bottom[0] - CORD.top[0]) * t + Math.cos(a) * rr, CORD.top[1] + (CORD.bottom[1] - CORD.top[1]) * t, Math.sin(a) * rr);
      bright.push(Math.abs(Math.sin(t * 60)) < 0.25 ? 0.8 : 0.35);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(bright.length * 3), 3));
    geo.userData.bright = bright; geo.userData.cordStart = cordStart;
    cortex = new THREE.Points(geo, new THREE.PointsMaterial({ size: 1.3 * Math.sqrt(K), map: TEX.fine, vertexColors: true, transparent: true, depthWrite: false, sizeAttenuation: true, alphaTest: 0.05 }));
    cortex.frustumCulled = false; cortex.raycast = () => {};
    scene.add(cortex); paintCortex();
  }
  // ---------- la galaxie : bras spiraux de poussière d'étoiles + bulbe lumineux ----------
  let galaxy = null;
  function buildGalaxy() {
    if (galaxy) { scene.remove(galaxy); galaxy.geometry.dispose(); }
    const pos = [], col = [], r = rng(0.31), arms = Math.max(3, (data.regions || []).length || 6), R = 300 * K;
    const pal = [new THREE.Color("#9fb3ff"), new THREE.Color("#d8c8ff"), new THREE.Color("#ffffff"), new THREE.Color("#ffd8b0")];
    for (let i = 0; i < 26000; i++) {
      const core = i < 5000, t = core ? Math.pow(r(), 2) * 0.22 : Math.pow(r(), 0.8);
      const rad = t * R, arm = Math.floor(r() * arms), spread = (core ? 0.9 : 0.35) * (1 - t * 0.5);
      const ang = (arm / arms) * Math.PI * 2 + rad * 0.011 / K + (r() - 0.5) * spread;
      const y = (r() - 0.5) * (core ? 26 : 10) * K * (1 - t);
      pos.push(Math.cos(ang) * rad + (r() - 0.5) * 8 * K, y, Math.sin(ang) * rad + (r() - 0.5) * 8 * K);
      const c = pal[Math.floor(r() * pal.length)], b = core ? 0.9 : 0.25 + 0.6 * (1 - t) * r();
      col.push(c.r * b, c.g * b, c.b * b);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    galaxy = new THREE.Points(geo, new THREE.PointsMaterial({ size: 1.6 * Math.sqrt(K), map: TEX.fine, vertexColors: true, transparent: true, depthWrite: false, opacity: 0.85, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
    galaxy.frustumCulled = false; galaxy.raycast = () => {}; galaxy.visible = false;
    // étoiles plus brillantes, dispersées, qui scintillent
    const sp = [], sc = [];
    for (let i = 0; i < 900; i++) { const rr = Math.pow(r(), 0.6) * R * 1.4, a = r() * Math.PI * 2; sp.push(Math.cos(a) * rr, (r() - 0.5) * 160 * K, Math.sin(a) * rr); const b = 0.6 + r() * 0.4; sc.push(b, b, b); }
    const sg = new THREE.BufferGeometry(); sg.setAttribute("position", new THREE.Float32BufferAttribute(sp, 3)); sg.setAttribute("color", new THREE.Float32BufferAttribute(sc, 3));
    const stars = new THREE.Points(sg, new THREE.PointsMaterial({ size: 2.6 * Math.sqrt(K), map: TEX.fine, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
    stars.raycast = () => {}; galaxy.add(stars); galaxy.userData.stars = stars;
    scene.add(galaxy);
  }
  function galaxyTarget(n) {
    const regs = (data.regions || []).map((r) => r.nom), arms = Math.max(3, regs.length), R = 300 * K;
    if (n.spine) { const p = fib(Math.floor(hash(n.id) * 300), 300), rr = (18 + hash(n.id + "r") * 34) * K; return { x: p.x * rr, y: p.y * rr * 0.45, z: p.z * rr }; } // le brut = le bulbe
    const ai = Math.max(0, regs.indexOf(n.region)), list = ctx.byRegion?.get(n.region) || [n], i = list.indexOf(n), m = list.length;
    const t = 0.16 + 0.84 * ((i + 0.5) / Math.max(m, 1)); // les plus reliés près du centre
    const rad = t * R, ang = (ai / arms) * Math.PI * 2 + rad * 0.011 / K + (hash(n.id) - 0.5) * 0.28;
    return { x: Math.cos(ang) * rad, y: (hash(n.id + "y") - 0.5) * 14 * K, z: Math.sin(ang) * rad };
  }

  function paintCortex() {
    if (!cortex) return;
    const col = cortex.geometry.attributes.color.array, br = cortex.geometry.userData.bright;
    const base = new THREE.Color(S.theme === "original" || S.theme === "midnight" ? "#9fb3d6" : "#a9b6cc");
    const cs = cortex.geometry.userData.cordStart, noCord = S.shape === "brain";
    for (let i = 0; i < br.length; i++) { const b = noCord && i >= cs ? 0 : br[i]; col[i * 3] = base.r * b; col[i * 3 + 1] = base.g * b; col[i * 3 + 2] = base.b * b; }
    cortex.geometry.attributes.color.needsUpdate = true;
    cortex.material.opacity = Math.min(1, 0.6 * (S.scaffold / 100) * (1 - S.morph / 100) * (lit.size ? 0.85 : 1));
    cortex.visible = S.shape !== "galaxy" && cortex.material.opacity > 0.01;
    if (galaxy) galaxy.visible = S.shape === "galaxy" && S.morph < 60;
  }

  // ---------- neurones vides ----------
  let empties = null, emptyInfo = [], emptyTip = false;
  function lobeFor(pos) {
    let best = null, bd = Infinity;
    for (const reg of data.regions || []) {
      const L = LOBES[reg.position] || LOBES.arriere, c = L.c;
      const d = ((pos.x - c[0]) / L.r[0]) ** 2 + ((pos.y - c[1]) / L.r[1]) ** 2 + ((pos.z - c[2]) / L.r[2]) ** 2;
      if (d < bd) { bd = d; best = reg; }
    }
    return best;
  }
  function buildEmpties() {
    if (empties) { scene.remove(empties); empties.geometry.dispose(); }
    empties = null; emptyInfo = [];
    if (!data.regions?.length) return;
    const r = rng(0.777), pts = [], cols = [];
    const target = Math.max(120, 260 - Math.round(data.nodes.length / 4));
    for (let guard = 0; emptyInfo.length < target && guard < 20000; guard++) {
      const p = { x: (-200 + r() * 400) * K, y: (-110 + r() * 220) * K, z: (-110 + r() * 220) * K };
      if (!inBrain(p, 0.86)) continue;
      const reg = lobeFor(p); if (!reg) continue;
      emptyInfo.push({ p, region: reg.nom, folder: reg.dossiers?.[0] || "00-Inbox" });
      pts.push(p.x, p.y, p.z);
      const c = new THREE.Color(reg.couleur || "#8892a6").multiplyScalar(0.75); cols.push(c.r, c.g, c.b);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
    empties = new THREE.Points(geo, new THREE.PointsMaterial({ size: 5 * Math.sqrt(K), map: TEX.ring, vertexColors: true, transparent: true, depthWrite: false, sizeAttenuation: true, opacity: 0.6, alphaTest: 0.05 }));
    empties.frustumCulled = false; scene.add(empties);
    paintEmpties();
  }
  function paintEmpties() {
    if (!empties) return;
    empties.visible = S.empties && S.morph < 40 && S.shape !== "galaxy";
    empties.material.opacity = lit.size ? 0.35 : 0.6;
  }
  const ray = new THREE.Raycaster(); ray.params.Points.threshold = 2.6;
  function pickEmpty(ev) {
    if (!empties?.visible || !ev) return null;
    const rect = renderer.domElement.getBoundingClientRect();
    ray.params.Points.threshold = 2.6 * Math.sqrt(K);
    ray.setFromCamera(new THREE.Vector2(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1), camera);
    const hit = ray.intersectObject(empties)[0];
    return hit ? emptyInfo[hit.index] : null;
  }
  let lastMove = 0;
  el.addEventListener("pointermove", (ev) => {
    const now = performance.now(); if (now - lastMove < 80 || pointerDown) return; lastMove = now;
    const e = !hovered && pickEmpty(ev);
    emptyTip = !!e;
    if (e) { tip.innerHTML = `<b>Neurone vide · ${esc(e.region)}</b><span>Clic pour y créer une note</span>`; tip.hidden = false; placeTip(); el.style.cursor = "copy"; }
    else if (!hovered) { tip.hidden = true; el.style.cursor = "grab"; }
  });
  el.addEventListener("pointerleave", () => { tip.hidden = true; });

  // ---------- cibles : région → communauté (sous-dossier) → place ----------
  let ctx = {};
  const community = (n) => { const p = n.id.split("/"); return p.length > 2 ? `${p[0]}/${p[1]}` : p[0]; };
  function lobeTarget(n) {
    if (n.spine && S.shape === "brain") { // sans colonne : le brut se range au fond du cerveau (tronc, hippocampe)
      const L = LOBES.bas, p = fib(Math.floor(hash(n.id) * 200), 200), rf = 0.3 + 0.7 * hash(n.id + "r");
      const t = new THREE.Vector3(L.c[0] + p.x * L.r[0] * rf, L.c[1] - 22 * K + p.y * L.r[1] * rf, L.c[2] + p.z * L.r[2] * rf);
      for (let k = 0; k < 30 && !inBrain(t, 0.9); k++) t.lerp(CENTER, 0.08);
      return { x: t.x, y: t.y, z: t.z };
    }
    if (n.spine) {
      const u = ctx.spineRank.get(n.id) ?? 0, a = hash(n.id) * Math.PI * 2, rr = (5 + hash(n.id + "r") * 9) * K;
      const x = CORD.top[0] + (CORD.bottom[0] - CORD.top[0]) * u, y = CORD.top[1] + 14 * K + (CORD.bottom[1] - CORD.top[1] - 10 * K) * u;
      return { x: x + Math.cos(a) * rr, y, z: Math.sin(a) * rr };
    }
    const reg = ctx.regionByName[n.region];
    const L = (reg && LOBES[reg.position]) || LOBES.arriere;
    const comms = ctx.commsByRegion.get(n.region) || [community(n)];
    const ci = comms.indexOf(community(n)), cm = comms.length;
    // centre de la communauté dans le lobe, puis place du neurone autour de ce centre
    const cc = cm > 1 ? fib(ci, cm) : { x: 0, y: 0, z: 0 }, spread = cm > 1 ? 0.62 : 0;
    const list = ctx.byComm.get(community(n)) || [n], i = list.indexOf(n), m = list.length;
    const p = fib(Math.max(0, i), Math.max(m, 2)), rf = (m === 1 ? 0 : 0.2 + 0.8 * Math.cbrt((i + 0.5) / m)) * (cm > 1 ? 0.55 : 1);
    const t = new THREE.Vector3(L.c[0] + (cc.x * spread + p.x * rf) * L.r[0], L.c[1] + (cc.y * spread + p.y * rf) * L.r[1], L.c[2] + (cc.z * spread + p.z * rf) * L.r[2]);
    for (let k = 0; k < 30 && !inBrain(t, 0.9); k++) t.lerp(CENTER, 0.08);
    return { x: t.x, y: t.y, z: t.z };
  }
  function layoutTarget(n) {
    const g = groupKey(n), gi = ctx.groups.indexOf(g), G_ = ctx.groups.length, j = (s, a) => (hash(n.id + s) - 0.5) * a;
    const tt = ctx.timeRank.get(n.id) ?? 0.5, R = 1.3;
    switch (S.layout) {
      case "grid": { const col = Math.min(9, Math.floor(tt * 10)), p = fib(Math.floor(hash(n.id) * 40), 40); return { x: (-270 + col * 60 + p.x * 16) * R, y: (150 - gi * 50 + p.y * 16) * R, z: p.z * 16 }; }
      case "ribbon": return { x: (-280 + tt * 560) * R, y: (150 - gi * 32 + j("y", 14)) * R, z: j("z", 30) };
      case "wheel": { const start = ctx.wedgeStart[g] ?? 0, span = ctx.wedgeSpan[g] ?? 0.1, ang = (start + hash(n.id + "a") * span) * Math.PI * 2, rad = (40 + tt * 190 + j("r", 18)) * R; return { x: Math.cos(ang) * rad, y: Math.sin(ang) * rad, z: j("z", 14) }; }
      case "spheres": { const ang = (gi / Math.max(G_, 1)) * Math.PI * 2, p = fib(Math.floor(hash(n.id) * 60), 60), Rr = 22 + Math.sqrt(ctx.count[g] || 1) * 6; return { x: Math.cos(ang) * 240 + p.x * Rr, y: p.y * Rr, z: Math.sin(ang) * 240 + p.z * Rr }; }
      case "shells": { const p = fib(Math.floor(hash(n.id) * 400), 400), Rr = 60 + gi * 32; return { x: p.x * Rr, y: p.y * Rr, z: p.z * Rr }; }
      case "folders": { const cols = Math.ceil(Math.sqrt(G_)), cx = gi % cols, cy = Math.floor(gi / cols); return { x: (cx - (cols - 1) / 2) * 150 + j("x", 90), y: 130 - cy * 140 + j("y", 90), z: j("z", 30) }; }
      case "astrolabe": { const ring = 50 + gi * 30, ang = hash(n.id + "a") * Math.PI * 2; return { x: Math.cos(ang) * ring, y: Math.sin(ang) * ring * Math.sin(0.42), z: Math.sin(ang) * ring * Math.cos(0.42) }; }
      default: { const d = ctx.lobes[g] || { x: 0, y: 0, z: 0 }, idx = ctx.rankInGroup.get(n.id) || 0, p = fib(idx, Math.max(ctx.count[g] || 1, 2)), Rr = 14 + Math.sqrt(ctx.count[g] || 1) * 10;
        return { x: d.x * 280 + p.x * Rr, y: d.y * 200 + p.y * Rr, z: d.z * 280 + p.z * Rr }; }
    }
  }
  function computeTargets() {
    if (!data.nodes.length) return;
    ctx.groups = [...new Set(data.nodes.map(groupKey))].sort();
    ctx.count = {}; ctx.rankInGroup = new Map();
    for (const n of data.nodes) { const g = groupKey(n); ctx.rankInGroup.set(n.id, ctx.count[g] || 0); ctx.count[g] = (ctx.count[g] || 0) + 1; }
    ctx.lobes = Object.fromEntries(ctx.groups.map((g, i) => [g, fib(i, Math.max(ctx.groups.length, 2))]));
    let acc = 0; ctx.wedgeStart = {}; ctx.wedgeSpan = {};
    const total = data.nodes.length || 1;
    for (const g of [...ctx.groups].sort((a, b) => ctx.count[b] - ctx.count[a])) { ctx.wedgeStart[g] = acc; ctx.wedgeSpan[g] = (ctx.count[g] / total) * 0.97; acc += ctx.count[g] / total; }
    const byTime = [...data.nodes].sort((x, y) => (x.created || 0) - (y.created || 0) || (x.id < y.id ? -1 : 1));
    ctx.timeRank = new Map(byTime.map((n, i) => [n.id, byTime.length > 1 ? i / (byTime.length - 1) : 0.5]));
    const spine = data.nodes.filter((n) => n.spine).sort((a, b) => (a.created || 0) - (b.created || 0));
    if (S.order === "newest") spine.reverse();
    ctx.spineRank = new Map(spine.map((n, i) => [n.id, spine.length > 1 ? i / (spine.length - 1) : 0]));
    ctx.regionByName = Object.fromEntries((data.regions || []).map((r) => [r.nom, r]));
    ctx.byComm = new Map(); ctx.commsByRegion = new Map();
    for (const n of data.nodes) if (!n.spine) {
      const c = community(n);
      if (!ctx.byComm.has(c)) ctx.byComm.set(c, []);
      ctx.byComm.get(c).push(n);
      if (!ctx.commsByRegion.has(n.region)) ctx.commsByRegion.set(n.region, []);
      if (!ctx.commsByRegion.get(n.region).includes(c)) ctx.commsByRegion.get(n.region).push(c);
    }
    for (const l of ctx.commsByRegion.values()) l.sort((a, b) => (ctx.byComm.get(b).length - ctx.byComm.get(a).length) || (a < b ? -1 : 1));
    ctx.byRegion = new Map();
    for (const n of data.nodes) if (!n.spine) { if (!ctx.byRegion.has(n.region)) ctx.byRegion.set(n.region, []); ctx.byRegion.get(n.region).push(n); }
    for (const l of ctx.byRegion.values()) l.sort((a, b) => b.deg - a.deg || (a.id < b.id ? -1 : 1));
    for (const list of ctx.byComm.values()) list.sort((a, b) => b.deg - a.deg || (a.id < b.id ? -1 : 1));
    const m = S.morph / 100;
    for (const n of data.nodes) {
      const a = S.shape === "galaxy" ? galaxyTarget(n) : lobeTarget(n), b = layoutTarget(n);
      n._t = { x: a.x + (b.x - a.x) * m, y: a.y + (b.y - a.y) * m, z: a.z + (b.z - a.z) * m };
    }
  }

  // ---------- couleurs, liens, surbrillance ----------
  function recolor() {
    const pal = PALETTES[S.palette] || PALETTES.default, keys = [...new Set(data.nodes.map(groupKey))].sort();
    colorOf = Object.fromEntries(keys.map((k, i) => [k, pal[i % pal.length]]));
    if (S.groupBy === "region" && S.palette === "default") {
      for (const r of data.regions || []) if (r.couleur && colorOf[r.nom]) colorOf[r.nom] = r.couleur;
      if (colorOf.Brut) colorOf.Brut = "#e2c79a";
    }
    for (const n of data.nodes) n.__obj?.userData.dot.material.color.set(colorFor(n));
  }
  const center = () => focusNode || hovered || selected;
  function isLitLink(l) { const a = nodeOf(l.source)?.id, b = nodeOf(l.target)?.id, c = center()?.id; return !!c && (a === c || b === c); }
  function linkVisible(l) {
    const a = nodeOf(l.source), b = nodeOf(l.target);
    if (!S.links || !visible(a) || !visible(b) || (l.type === "sens" && !S.sens)) return false;
    if ((isSys(a) || isSys(b)) && !isLitLink(l)) return false; // les liens du log / de l'index : seulement quand on les regarde
    return true;
  }
  function linkColor(l) {
    const src = nodeOf(l.source);
    if (lit.size) return isLitLink(l) ? rgba(colorFor(src), 0.95) : rgba(colorFor(src), 0.07);
    if (l.__new) return rgba("#ffffff", 0.9);
    // Liens teintés par leur région (et non gris), discrets.
    if (S.shape === "galaxy") return rgba(colorFor(src), 0.06); // galaxie : les étoiles d abord, les liens en filigrane
    return rgba(colorFor(src), l.type === "sens" ? 0.12 : 0.22);
  }
  function particleLink(l) { return (focusNode && isLitLink(l)) || (selected && isLitLink(l) && !hovered) || !!l.__new; }

  function updateLit() {
    const c = center();
    lit = new Map();
    if (c) { lit.set(c.id, 1); for (const m of adj.get(c.id) || []) lit.set(m, 0.6); }
    controls.autoRotate = S.turning && !hovered && !selected && !dragging;
    for (const n of data.nodes) {
      const g = n.__obj; if (!g) continue;
      const a = lit.get(n.id);
      n.__op = !lit.size ? (n.kind === "ghost" ? 0.75 : 1) : a ? 1 : 0.3; // la boucle fait le fondu
      const s = sizeOf(n) * (a === 1 ? 1.35 : 1);
      g.userData.dot.scale.set(s * 2, s * 2, 1);
    }
    G.linkVisibility(G.linkVisibility()).linkColor(G.linkColor()).linkDirectionalParticles(G.linkDirectionalParticles());
    paintCortex(); paintEmpties(); labelsDirty = true;
  }

  // Étiquettes : au plus ~28 à la fois, choisies par importance (allumé > hub > proche de la caméra).
  let labelsDirty = true, frame = 0;
  const tmp = new THREE.Vector3(), MAX_LABELS = 28;
  function updateLabels() {
    const cam = camera.position, cands = [];
    for (const n of data.nodes) {
      if (n.kind !== "note" && n.kind !== "ghost") continue;
      const l = n.__obj?.userData.label;
      if (l) l.visible = false;
      if (!visible(n) || S.labels === "none") continue;
      const a = lit.get(n.id);
      let score = 0;
      if (lit.size) { if (!a) continue; score = a === 1 ? 1e6 : 1e5 + n.deg; }
      else if (S.labels === "all") score = 1e3 - tmp.set(n.x || 0, n.y || 0, n.z || 0).distanceTo(cam) / 10;
      else if (S.labels === "hubs") { if (!isHub(n)) continue; score = n.deg; }
      else {
        const d = tmp.set(n.x || 0, n.y || 0, n.z || 0).distanceTo(cam), reach = (160 + sizeOf(n) * 22) * Math.sqrt(K);
        if (!(isHub(n) && S.morph < 40) && d > reach) continue;
        score = (isHub(n) ? 500 : 0) + n.deg * 4 - d / 4;
      }
      cands.push([score, n]);
    }
    cands.sort((a, b) => b[0] - a[0]);
    // Anti-chevauchement : on place les étiquettes par ordre d'importance, en sautant celles qui
    // recouvriraient une étiquette déjà affichée (calcul en pixels à l'écran).
    const W = el.clientWidth, H = el.clientHeight, boxes = [], max = lit.size ? 22 : MAX_LABELS;
    let shown = 0;
    // Les noms de régions passent en premier : les étiquettes de neurones les évitent.
    for (const [g, l] of groupLabels) {
      if (!l.visible) continue;
      tmp.copy(l.position).project(camera); if (tmp.z > 1) continue;
      const x = (tmp.x * 0.5 + 0.5) * W, y = (-tmp.y * 0.5 + 0.5) * H, w = g.length * 12 + 12;
      boxes.push([x - w / 2, y - 14, x + w / 2, y + 14]);
    }
    for (const [, n] of cands) {
      if (shown >= max) break;
      tmp.set(n.x || 0, n.y || 0, n.z || 0).project(camera);
      if (tmp.z > 1) continue;
      const x = (tmp.x * 0.5 + 0.5) * W, y = (-tmp.y * 0.5 + 0.5) * H - 14;
      const w = Math.min(340, clean(n.name).length * 9.6 + 14), h = 24;
      const b = [x - w / 2, y - h, x + w / 2, y];
      if (boxes.some((o) => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1])) continue;
      boxes.push(b); shown++;
      const l = labelOf(n); if (l) l.visible = true;
    }
  }

  // Sélection : la caméra se rapproche en gardant l'angle de vue ; un anneau pulse autour du neurone.
  const pulse = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.ring, transparent: true, depthWrite: false, depthTest: false, opacity: 0 }));
  pulse.renderOrder = 15; pulse.raycast = () => {}; scene.add(pulse);
  const reticle = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.reticle, transparent: true, depthWrite: false, depthTest: false, opacity: 0 }));
  reticle.renderOrder = 16; reticle.raycast = () => {}; scene.add(reticle);
  function activate(n, fly) {
    selected = n; focusNode = null; updateLit();
    if (fly && n.x !== undefined) {
      const out = camera.position.clone().sub(controls.target);
      if (out.lengthSq() < 1) out.set(0, 0.3, 1);
      out.normalize();
      const dist = (110 + sizeOf(n) * 6) * Math.sqrt(K);
      G.cameraPosition({ x: n.x + out.x * dist, y: n.y + out.y * dist, z: n.z + out.z * dist }, { x: n.x, y: n.y, z: n.z }, 1200);
    }
    const neighbors = [...(adj.get(n.id) || [])].map(nodeOf).filter(Boolean).sort((a, b) => b.deg - a.deg)
      .map((m) => ({ id: m.id, name: clean(m.name), color: colorFor(m), kind: m.kind }));
    onSelect(n, { reached: neighbors.length, neighbors, region: n.spine ? "Brut" : n.region, color: colorFor(n) });
  }

  // ---------- noms des régions ----------
  const groupLabels = new Map();
  let rings = null;
  function buildGroupLabels() {
    for (const l of groupLabels.values()) scene.remove(l);
    groupLabels.clear();
    for (const g of ctx.groups || []) {
      const l = new SpriteText(g.toUpperCase().split("").join(" "), 8, rgba(colorOf[g] || "#fff", 0.75));
      l.fontFace = "Geist Mono, JetBrains Mono, Cascadia Mono, Consolas, monospace"; l.fontWeight = "500";
      l.strokeWidth = 0.4; l.strokeColor = "rgba(5,6,9,.85)";
      l.material.depthTest = false; l.material.transparent = true; l.material.sizeAttenuation = false;
      const h = 0.0165; l.scale.set((l.scale.x / l.scale.y) * h, h, 1);
      l.renderOrder = 30; l.raycast = () => {};
      scene.add(l); groupLabels.set(g, l);
    }
  }
  function buildRings() {
    if (rings) { scene.remove(rings); rings = null; }
    if (S.layout !== "astrolabe") return;
    rings = new THREE.Group();
    (ctx.groups || []).forEach((g, gi) => {
      const ring = 50 + gi * 30, pts = [];
      for (let a = 0; a <= 160; a++) { const t = (a / 160) * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(t) * ring, Math.sin(t) * ring * Math.sin(0.42), Math.sin(t) * ring * Math.cos(0.42))); }
      rings.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: new THREE.Color(colorOf[g] || "#888"), transparent: true, opacity: 0.25 })));
    });
    scene.add(rings);
  }
  function updateGroupLabels() {
    const brainMode = S.morph < 40 && S.shape !== "galaxy", show = S.labels !== "none";
    const acc = new Map();
    for (const n of data.nodes) { if (!visible(n)) continue; const g = groupKey(n), a = acc.get(g) || { x: 0, y: 0, z: 0, k: 0, top: -1e9 }; a.x += n.x || 0; a.y += n.y || 0; a.z += n.z || 0; a.top = Math.max(a.top, n.y || 0); a.k++; acc.set(g, a); }
    for (const [g, l] of groupLabels) {
      const a = acc.get(g);
      l.visible = show && !!a && !lit.size; if (!a) continue;
      const c = new THREE.Vector3(a.x / a.k, a.y / a.k, a.z / a.k);
      if (brainMode) {
        if (g === "Brut" && S.shape === "brain") c.y -= 10 * K;
        else if (g === "Brut") c.set(CORD.bottom[0] + 34 * K, CORD.bottom[1] + 30 * K, 0);
        else { const dir = c.clone().sub(CENTER); if (dir.lengthSq() < 1) dir.set(0, 1, 0); dir.normalize(); for (let k = 0; k < 80 && inBrain(c, 1.02); k++) c.addScaledVector(dir, 4 * K); c.addScaledVector(dir, 18 * K); }
      } else c.y = Math.max(a.top, c.y) + 26;
      l.position.copy(c);
    }
    if (rings) rings.visible = S.morph >= 40;
  }

  // ---------- naissances (nouveaux neurones en direct) ----------
  const births = new Map(); // id → instant de naissance
  function animateBirths(now) {
    for (const [id, t0] of births) {
      const n = byId.get(id), g = n?.__obj;
      const t = (now - t0) / 900;
      if (!g || t >= 1) { births.delete(id); if (g) sizeNode(n); continue; }
      const s = sizeOf(n) * 2 * Math.max(0.01, easeOutBack(clamp01(t)));
      g.userData.dot.scale.set(s, s, 1);
    }
  }
  const flashes = []; // anneaux d'éclosion
  function flash(n, color) {
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.ring, color: new THREE.Color(color), transparent: true, depthWrite: false, depthTest: false, opacity: 0.9 }));
    m.renderOrder = 16; m.raycast = () => {}; scene.add(m);
    flashes.push({ m, n, t0: performance.now() });
  }

  // ---------- boucle ----------
  (function tick() {
    const now = performance.now();
    const m = S.morph / 100;
    if (morphUntil > now) {
      const k = 0.075;
      for (const n of data.nodes) {
        const t = n._t; if (!t || n.x === undefined || n === dragging) continue;
        n.x += (t.x - n.x) * k; n.y += (t.y - n.y) * k; n.z += (t.z - n.z) * k; n.vx = n.vy = n.vz = 0;
        n.fx = n.x; n.fy = n.y; n.fz = n.z;
        if (n.__obj) n.__obj.position.set(n.x, n.y, n.z);
      }
      if (now + 20 > morphUntil) { for (const n of data.nodes) if (n._t && n !== dragging) { Object.assign(n, { x: n._t.x, y: n._t.y, z: n._t.z }); n.fx = n.x; n.fy = n.y; n.fz = n.z; } settled = true; }
    }
    // Fondus : l'opacité de chaque neurone glisse vers sa cible (survol, sélection) au lieu de sauter.
    for (const n of data.nodes) {
      const mat = n.__obj?.userData.dot.material; if (!mat || n.__op === undefined) continue;
      const d = n.__op - mat.opacity; if (Math.abs(d) > 0.004) mat.opacity += d * 0.16;
    }
    if (m > 0) for (const n of data.nodes) {
      const t = n._t; if (!t || n.x === undefined || n === dragging) continue;
      const k = 0.07 * m;
      n.x += (t.x - n.x) * k; n.y += (t.y - n.y) * k; n.z += (t.z - n.z) * k;
      n.vx *= 1 - m; n.vy *= 1 - m; n.vz *= 1 - m;
      if (n.__obj) n.__obj.position.set(n.x, n.y, n.z);
    }
    if (births.size) animateBirths(now);
    if (galaxy?.visible) { galaxy.material.opacity = 0.78 + 0.08 * Math.sin(now / 1100); const st = galaxy.userData.stars; if (st) st.material.opacity = 0.55 + 0.35 * Math.abs(Math.sin(now / 700)); }
    for (let i = flashes.length - 1; i >= 0; i--) {
      const f = flashes[i], t = (now - f.t0) / 1100;
      if (t >= 1) { scene.remove(f.m); f.m.material.dispose(); flashes.splice(i, 1); continue; }
      const s = sizeOf(f.n) * (2 + t * 9); f.m.scale.set(s, s, 1); f.m.material.opacity = 0.9 * (1 - t);
      if (f.n.x !== undefined) f.m.position.set(f.n.x, f.n.y, f.n.z);
    }
    const c = selected || focusNode;
    if (c && c.x !== undefined) {
      const t = ((now / 1400) % 1), s = sizeOf(c) * (2.2 + t * 3.5);
      pulse.position.set(c.x, c.y, c.z); pulse.scale.set(s, s, 1); pulse.material.color.set(colorFor(c)); pulse.material.opacity = 0.45 * (1 - t);
      const r = sizeOf(c) * 4.2 * (1 + 0.04 * Math.sin(now / 300));
      reticle.position.set(c.x, c.y, c.z); reticle.scale.set(r, r, 1); reticle.material.rotation = now / 1400;
      reticle.material.color.set(colorFor(c)); reticle.material.opacity = Math.min(0.9, (reticle.material.opacity || 0) + 0.08);
    } else { pulse.material.opacity = 0; reticle.material.opacity = 0; }
    if (frame % 2 === 0) {
      const cam = camera.position, ref = 170 * Math.sqrt(K);
      for (const n of data.nodes) {
        const g = n.__obj; if (!g || births.has(n.id) || n.x === undefined) continue;
        const d = tmp.set(n.x, n.y, n.z).distanceTo(cam), f = Math.max(0.3, Math.min(1, d / ref));
        const target = sizeOf(n) * (lit.get(n.id) === 1 ? 1.35 : 1) * (hovered === n ? 1.3 : 1) * 2 * f;
        n.__sc = n.__sc === undefined ? target : n.__sc + (target - n.__sc) * 0.3;
        g.userData.dot.scale.set(n.__sc, n.__sc, 1);
      }
    }
    if (++frame % 6 === 0 || labelsDirty) { updateLabels(); labelsDirty = false; }
    if (frame % 15 === 0) updateGroupLabels();
    requestAnimationFrame(tick);
  })();

  function apply(partial = {}) {
    const prev = S; S = { ...S, ...partial };
    if (partial.palette !== undefined || partial.groupBy !== undefined) recolor();
    if (partial.theme !== undefined) { el.style.setProperty("--brain-bg", THEMES[S.theme] || "#000"); scene.fog = new THREE.FogExp2(new THREE.Color(THEMES[S.theme] || "#000"), 0.0009 / K); }
    controls.autoRotate = S.turning && !hovered && !selected; controls.autoRotateSpeed = 0.5 * (S.speed / 100);
    bloom.strength = 0.5 * (S.bloom / 100); bloom.enabled = S.bloom > 0; // la lueur coûte cher : coupée par défaut
    if (partial.pointSize !== undefined) for (const n of data.nodes) sizeNode(n);
    if (partial.shape !== undefined && partial.shape !== prev.shape && data.nodes.length) {
      if (S.shape === "galaxy" && !galaxy) buildGalaxy();
      computeTargets(); morphUntil = performance.now() + 2400; paintCortex(); paintEmpties();
      G.d3ReheatSimulation(); // sinon les traits restent à l'ancienne place
      const h = home_(); G.cameraPosition(h.pos, h.look, 2200);
    } else if (["morph", "layout", "recordLayout", "order", "groupBy"].some((k) => partial[k] !== undefined && partial[k] !== prev[k])) { unfreezeAll(); computeTargets(); G.d3ReheatSimulation(); }
    if (["layout", "groupBy", "palette"].some((k) => partial[k] !== undefined)) { buildGroupLabels(); buildRings(); }
    G.nodeVisibility(visible);
    updateLit(); updateGroupLabels();
    return legend();
  }
  function legend() {
    const counts = {}, links = {};
    for (const n of data.nodes) { if (n.kind === "ghost") continue; const g = groupKey(n); counts[g] = (counts[g] || 0) + 1; links[g] = (links[g] || 0) + (n.deg || 0); }
    return Object.keys(colorOf).filter((g) => counts[g]).map((g) => ({ name: g, color: colorOf[g], count: counts[g] || 0, links: links[g] || 0, hidden: hidden.has(g) }));
  }
  const home_ = () => S.shape === "galaxy" ? { pos: { x: 0, y: 330 * K, z: 430 * K }, look: { x: 0, y: 0, z: 0 } } : { pos: { x: -30 * K, y: 55 * K, z: 470 * K }, look: { x: 5 * K, y: -25 * K, z: 0 } };

  return {
    setData(d0) {
      const first = !data.nodes.length;
      const old = byId;
      const idOf = (x) => (typeof x === "object" ? x.id : x);
      const lkey = (l) => `${idOf(l.source)}→${idOf(l.target)}→${l.type || ""}`;
      const oldLinks = new Map(data.links.map((l) => [lkey(l), l]));
      const nodes = d0.nodes.map((n) => { const o = old.get(n.id); if (!o) return n; for (const k of ["name", "kind", "group", "region", "spine", "created", "tags", "from"]) o[k] = n[k]; return o; });
      const ids = new Set(nodes.map((n) => n.id));
      const links = d0.links.filter((l) => ids.has(idOf(l.source)) && ids.has(idOf(l.target))).map((l) => oldLinks.get(lkey(l)) || l);
      const same = !first && nodes.length === data.nodes.length && links.length === data.links.length && nodes.every((n) => old.has(n.id)) && links.every((l) => oldLinks.has(lkey(l)));
      if (same) { data.regions = d0.regions; recolor(); labelsDirty = true; return legend(); } // rien à reconstruire
      const d = { nodes, links, regions: d0.regions };
      byId = new Map(d.nodes.map((n) => [n.id, n]));
      adj = new Map(d.nodes.map((n) => [n.id, new Set()]));
      for (const l of d.links) { const a = idOf(l.source), b = idOf(l.target); adj.get(a)?.add(b); adj.get(b)?.add(a); }
      for (const n of d.nodes) n.deg = adj.get(n.id)?.size || 0;
      const degs = d.nodes.filter((n) => n.kind === "note" && !n.spine && !isSys(n)).map((n) => n.deg).sort((a, b) => b - a);
      hubCut = Math.max(6, degs[Math.min(degs.length - 1, Math.max(4, Math.floor(degs.length * 0.06)))] ?? 99);
      // Le cerveau grandit avec le nombre de neurones (≈ racine cubique) : de la place pour tout le monde.
      const k = Math.max(1, Math.cbrt(d.nodes.length / 140));
      const rescale = Math.abs(k - K) > 0.08 || first;
      if (rescale) setScale(k);
      data = d; recolor(); computeTargets();
      // Les nouveaux neurones naissent à leur place, éclosent, et leurs liens s'allument.
      const born = first ? [] : d.nodes.filter((n) => !old.has(n.id));
      for (const n of d.nodes) if (n.x === undefined && n._t) {
        const near = [...(adj.get(n.id) || [])].map((id) => old.get(id)).find((o) => o?.x !== undefined);
        const base = !first && near ? near : n._t; // un nouveau neurone sort de celui auquel il est relié
        Object.assign(n, { x: base.x + (hash(n.id) - 0.5) * 8, y: base.y + (hash(n.id + "y") - 0.5) * 8, z: base.z + (hash(n.id + "z") - 0.5) * 8 });
      }
      const now = performance.now();
      for (const n of born) { births.set(n.id, now); freed.add(n); }
      if (born.length) { clearTimeout(refreeze); refreeze = setTimeout(freezeFreed, 2600); }
      if (rescale && !first) unfreezeAll(); // le cerveau a grandi : on laisse tout se replacer une fois
      const bornIds = new Set(born.map((n) => n.id));
      for (const l of d.links) if (bornIds.has(idOf(l.source)) || bornIds.has(idOf(l.target))) { l.__new = true; setTimeout(() => { l.__new = false; G.linkColor(G.linkColor()).linkDirectionalParticles(G.linkDirectionalParticles()); }, 2600); }
      if (selected) selected = byId.get(selected.id) || null;
      if (focusNode) focusNode = byId.get(focusNode.id) || null;
      G.warmupTicks(first ? 90 : 0); // au premier affichage, le cerveau arrive déjà « posé »
      G.graphData(data);
      buildGroupLabels(); buildRings();
      if (rescale || !empties) { buildEmpties(); buildCortex(); if (S.shape === "galaxy" || galaxy) buildGalaxy(); paintCortex(); }
      updateLit();
      setTimeout(() => {
        updateLit();
        for (const n of born) flash(n, colorFor(n));
        // On suit les créations : la caméra va vers le dernier neurone né.
        const last = born[born.length - 1];
        if (S.follow && last && born.length <= 12) setTimeout(() => activate(last, true), 1200); // le temps qu'il trouve sa place
      }, 60);
      if (first) setTimeout(() => { const h = home_(); G.cameraPosition(h.pos, h.look, 0); }, 0);
      return legend();
    },
    apply, legend,
    settings: () => ({ ...S }),
    timeRange() { const ts = data.nodes.map((n) => n.created || 0).filter(Boolean); return ts.length ? [Math.min(...ts), Math.max(...ts)] : [0, 0]; },
    setTime(t) { timeCut = t; G.nodeVisibility(visible).linkVisibility(G.linkVisibility()); labelsDirty = true; },
    toggleGroup(g) { hidden.has(g) ? hidden.delete(g) : hidden.add(g); G.nodeVisibility(visible).linkVisibility(G.linkVisibility()); labelsDirty = true; return !hidden.has(g); },
    focus(id) { const n = nodeOf(id); if (n) activate(n, true); },
    info(id) { const n = nodeOf(id); if (!n) return null; return { id: n.id, name: clean(n.name), kind: n.kind, region: n.spine ? "Brut" : n.region, color: colorFor(n), created: n.created, neighbors: [...(adj.get(n.id) || [])].map(nodeOf).filter(Boolean).sort((a, b) => b.deg - a.deg).map((m) => ({ id: m.id, name: clean(m.name), color: colorFor(m), kind: m.kind })) }; },
    select(id) { const n = nodeOf(id); if (n) activate(n, false); },
    highlight(ids) { lit = new Map(ids.map((id, i) => [id, i === 0 ? 1 : 0.6])); G.linkColor(G.linkColor()); labelsDirty = true; },
    clear() { selected = null; focusNode = null; updateLit(); },
    home() { selected = null; focusNode = null; updateLit(); const h = home_(); G.cameraPosition(h.pos, h.look, 1400); },
    zoom(f) { const t = controls.target, p = camera.position.clone().sub(t).multiplyScalar(f).add(t); G.cameraPosition(p, t, 500); },
    find(q) {
      const s = q.trim().toLowerCase(); if (!s) return [];
      return data.nodes.filter((n) => n.kind === "note" && clean(n.name).toLowerCase().includes(s))
        .sort((a, b) => clean(a.name).toLowerCase().indexOf(s) - clean(b.name).toLowerCase().indexOf(s) || b.deg - a.deg).slice(0, 7)
        .map((n) => ({ id: n.id, name: clean(n.name), color: colorFor(n), region: n.spine ? "Brut" : n.region }));
    },
    resize() { G.width(el.clientWidth).height(el.clientHeight); bloom.setSize(el.clientWidth, el.clientHeight); },
    pause(p) { p ? G.pauseAnimation() : G.resumeAnimation(); },
  };
}
