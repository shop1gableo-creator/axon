// Vue « Vagues » : l'activité de chaque région (ou dossier) dans le temps, en flux empilés (stream graph),
// comme la vue Waves de mindcorpus. d3 calcule les couches ; rendu SVG net et responsive.
import * as d3 from "d3";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export function waves(root, meta, colorOf, key = "region") {
  const items = meta.filter((n) => n.created);
  if (!items.length) { root.innerHTML = `<div class="ph"><h1>Vagues</h1></div><div class="empty-state">Pas encore assez de notes datées.</div>`; return; }
  const t0 = d3.min(items, (n) => n.created), t1 = d3.max(items, (n) => n.created);
  const span = t1 - t0;
  // Pas de temps adapté à l'étendue : heures, jours, semaines ou mois.
  const step = span < 3 * 864e5 ? d3.timeHour : span < 120 * 864e5 ? d3.timeDay : span < 900 * 864e5 ? d3.timeWeek : d3.timeMonth;
  const label = step === d3.timeHour ? "par heure" : step === d3.timeDay ? "par jour" : step === d3.timeWeek ? "par semaine" : "par mois";
  const buckets = step.range(step.floor(new Date(t0)), step.offset(step.floor(new Date(t1)), 1));
  if (buckets.length < 2) buckets.push(step.offset(buckets[0], 1));
  const groups = [...new Set(items.map((n) => n[key] || n.folder))].sort();
  const table = buckets.map((b) => Object.fromEntries([["t", b], ...groups.map((g) => [g, 0])]));
  for (const n of items) {
    const i = d3.bisectRight(buckets, new Date(n.created)) - 1;
    if (i >= 0) table[i][n[key] || n.folder]++;
  }
  // Lissage (noyau binomial appliqué 3 fois) : des vagues fluides même avec peu de notes.
  for (const g of groups) for (let pass = 0; pass < 3; pass++) {
    const v = table.map((r) => r[g]);
    table.forEach((r, i) => { r[g] = (v[i - 2] || 0) * 1 / 16 + (v[i - 1] || 0) * 4 / 16 + v[i] * 6 / 16 + (v[i + 1] || 0) * 4 / 16 + (v[i + 2] || 0) * 1 / 16; });
  }
  const W = Math.max(640, root.clientWidth - 70), H = 420, m = { t: 20, r: 20, b: 34, l: 20 };
  const stack = d3.stack().keys(groups).offset(d3.stackOffsetWiggle).order(d3.stackOrderInsideOut)(table);
  const x = d3.scaleTime().domain(d3.extent(buckets)).range([m.l, W - m.r]);
  const y = d3.scaleLinear().domain([d3.min(stack, (s) => d3.min(s, (d) => d[0])), d3.max(stack, (s) => d3.max(s, (d) => d[1]))]).range([H - m.b, m.t]);
  const area = d3.area().curve(d3.curveBasis).x((d) => x(d.data.t)).y0((d) => y(d[0])).y1((d) => y(d[1]));
  const fmt = step === d3.timeHour ? d3.timeFormat("%H h") : d3.timeFormat("%d %b");
  root.innerHTML = `<div class="ph"><h1>Vagues</h1><span class="sub">activité de chaque région ${label} · ${items.length} notes</span></div>
    <div class="box waves-box"><svg viewBox="0 0 ${W} ${H}" width="100%" class="waves">
      ${stack.map((s) => `<path d="${area(s)}" fill="${colorOf(s.key)}" fill-opacity=".78"><title>${esc(s.key)}</title></path>`).join("")}
      ${x.ticks(8).map((t) => `<g transform="translate(${x(t)},0)"><line y1="${m.t}" y2="${H - m.b}" stroke="rgba(255,255,255,.06)"/><text y="${H - 12}" text-anchor="middle">${fmt(t)}</text></g>`).join("")}
    </svg>
    <div class="waves-legend">${groups.map((g) => `<span><i style="background:${colorOf(g)}"></i>${esc(g)} <em>${items.filter((n) => (n[key] || n.folder) === g).length}</em></span>`).join("")}</div></div>`;
}
