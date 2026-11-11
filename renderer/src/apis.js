// Page « API » : le catalogue des API publiques gratuites (dépôt public-apis), cherchable et filtrable.
// Sert de réservoir pour brancher de nouveaux flux dans le cerveau.
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export function createApisPage(B) {
  let all = [], q = "", cat = "", noKey = false;
  function list() {
    const t = q.toLowerCase();
    return all.filter((a) => (!cat || a.category === cat) && (!noKey || !a.auth) && (!t || (a.name + " " + a.description + " " + a.category).toLowerCase().includes(t)));
  }
  function draw(root) {
    const cats = [...new Set(all.map((a) => a.category))].sort();
    const rows = list();
    root.innerHTML = `<div class="ph"><h1>API publiques</h1><span class="sub">${all.length} API gratuites · ${all.filter((a) => !a.auth).length} sans clé · ${cats.length} catégories</span></div>
      <div class="api-bar"><input id="apiQ" placeholder="Chercher une API (crypto, météo, actualités, e-commerce…)" value="${esc(q)}">
        <select id="apiCat"><option value="">Toutes les catégories</option>${cats.map((c) => `<option ${c === cat ? "selected" : ""}>${esc(c)}</option>`).join("")}</select>
        <label class="chk"><input type="checkbox" id="apiNoKey" ${noKey ? "checked" : ""}> Sans clé</label></div>
      <div class="api-count">${rows.length} résultat(s)</div>
      <div class="api-grid">${rows.slice(0, 300).map((a) => `<a class="api-card" href="${esc(a.url)}" target="_blank" rel="noreferrer"><div class="api-top"><b>${esc(a.name)}</b><span class="tagk ${a.auth ? "key" : "free"}">${a.auth ? esc(a.auth) : "sans clé"}</span></div><p>${esc(a.description)}</p><small>${esc(a.category)}</small></a>`).join("")}</div>
      ${rows.length > 300 ? `<p class="api-more">… et ${rows.length - 300} de plus : affine la recherche.</p>` : ""}`;
  }
  return {
    async mount(root) {
      if (!all.length) all = (await B.apis()).filter((a) => !/APILayer/i.test(a.category));
      draw(root);
      root.oninput = (e) => {
        if (e.target.id === "apiQ") { q = e.target.value; const pos = e.target.selectionStart; draw(root); const i = root.querySelector("#apiQ"); i.focus(); i.setSelectionRange(pos, pos); }
        if (e.target.id === "apiCat") { cat = e.target.value; draw(root); }
        if (e.target.id === "apiNoKey") { noKey = e.target.checked; draw(root); }
      };
    },
  };
}
