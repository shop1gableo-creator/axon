// Écran de premier lancement : prénom → dossier (Cloud / Personnel) → domaines → création + branchement de Claude.
const S = window.brain.setup;
const $ = (q) => document.querySelector(q);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const COLORS = ["#7cc4ff", "#ff7a45", "#4ade9b", "#f5c542", "#c08bff", "#f472b6", "#34d399", "#fb923c", "#60a5fa"];
const POS = ["haut-gauche", "haut-avant", "haut-arriere", "haut-droite", "avant-gauche", "avant-droite", "droite", "arriere-gauche", "bas"];
const state = { step: 1, mode: null, dir: "", etat: null, domaines: [], info: null };

function show(n) {
  state.step = n;
  document.querySelectorAll("section").forEach((s) => s.classList.toggle("on", +s.dataset.step === n));
  document.querySelectorAll(".steps i").forEach((i, k) => i.classList.toggle("on", k < n));
}
document.addEventListener("click", (e) => {
  if (e.target.closest("[data-next]")) {
    if (state.step === 1 && !$("#user").value.trim()) return $("#user").focus();
    show(state.step + 1);
  }
  if (e.target.closest("[data-prev]")) show(state.step - 1);
});
$("#user").addEventListener("keydown", (e) => { if (e.key === "Enter") document.querySelector("[data-step='1'] [data-next]").click(); });

// ----- étape 2 : où -----
document.querySelectorAll("[data-mode]").forEach((b) => b.addEventListener("click", async () => {
  state.mode = b.dataset.mode;
  document.querySelectorAll("[data-mode]").forEach((x) => x.classList.toggle("on", x === b));
  $("#where").hidden = false;
  await pick();
}));
$("#pick").addEventListener("click", pick);
async function pick() {
  const def = state.mode === "cloud" ? state.info.clouds[0] : state.info.documents;
  const d = await S.pick(def);
  if (!d) return;
  state.dir = d; $("#dir").value = d;
  const r = await S.check(d); state.etat = r;
  const hint = {
    nouveau: "Un nouveau cerveau sera créé dans ce dossier.",
    vide: "Dossier vide : le cerveau sera créé dedans.",
    plein: `Ce dossier contient déjà des fichiers : le cerveau sera créé dans un sous-dossier <b>Axon</b>.`,
    cerveau: `C'est déjà un cerveau Axon${r.membres?.length ? ` (membres : <b>${r.membres.map(esc).join(", ")}</b>)` : ""}. Tu vas le <b>rejoindre</b> : ton journal et ton log seront à ton nom, rien ne sera écrasé.`,
  }[r.etat];
  $("#dirState").innerHTML = hint;
  $("#toDomains").disabled = false;
  $("#toDomains").textContent = r.etat === "cerveau" ? "Rejoindre ce cerveau" : "Continuer";
}
$("#toDomains").addEventListener("click", (e) => { if (state.etat?.etat === "cerveau") { e.stopImmediatePropagation(); create(); } }, true);

// ----- étape 3 : domaines -----
function renderDoms() {
  $("#doms").innerHTML = state.domaines.map((d, i) => `<span class="dom"><i style="background:${d.couleur}"></i>${esc(d.nom)}<button data-rm="${i}" title="Retirer">×</button></span>`).join("");
}
$("#doms").addEventListener("click", (e) => { const b = e.target.closest("[data-rm]"); if (b) { state.domaines.splice(+b.dataset.rm, 1); renderDoms(); } });
function addDom() {
  const nom = $("#newDom").value.replace(/[\\/:*?"<>|]/g, "").trim();
  if (!nom || state.domaines.some((d) => d.nom.toLowerCase() === nom.toLowerCase())) return;
  const k = state.domaines.length;
  state.domaines.push({ nom, num: 0, position: POS[k % POS.length], couleur: COLORS[k % COLORS.length], description: "" });
  $("#newDom").value = ""; renderDoms();
}
$("#addDom").addEventListener("click", addDom);
$("#newDom").addEventListener("keydown", (e) => { if (e.key === "Enter") addDom(); });
$("#create").addEventListener("click", create);

async function create() {
  const btn = state.etat?.etat === "cerveau" ? $("#toDomains") : $("#create");
  btn.disabled = true; btn.textContent = "Création…";
  const domaines = state.domaines.map((d, i) => ({ ...d, num: 10 * (i + 1) }));
  try {
    const r = await S.create({ utilisateur: $("#user").value.trim(), dossier: state.dir, nom: "Axon", domaines, brancher: $("#brancher").checked || state.etat?.etat === "cerveau" });
    $("#doneTitle").textContent = r.rejoint ? "Tu as rejoint le cerveau." : "Ton cerveau est prêt.";
    $("#doneLead").innerHTML = `Dossier : <b>${esc(r.dir)}</b>`;
    $("#report").innerHTML = r.rapport.map((x) => `<li><b>${x.ok ? "✓" : "–"} ${esc(x.cible)}</b>${esc(x.detail)}</li>`).join("");
    show(4);
  } catch (e) { btn.disabled = false; btn.textContent = "Réessayer"; alert(e.message); }
}
$("#open").addEventListener("click", () => S.done());
$("#guide").addEventListener("click", () => window.brain.guide());

(async () => {
  state.info = await S.info();
  $("#user").value = state.info.user || "";
  $("#cloudFound").textContent = state.info.clouds.length ? `Trouvé : ${state.info.clouds[0]}` : "Google Drive pour ordinateur non détecté";
  state.domaines = state.info.domaines.map((d) => ({ ...d }));
  renderDoms();
  $("#user").focus();
})();
