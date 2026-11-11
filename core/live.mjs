// Données EN DIRECT pour l'accueil (processus principal) — sans rien écrire dans le coffre.
// - Crypto : flux WebSocket public de Binance (mini-ticker, une mise à jour par seconde, sans clé).
//   Doc : https://developers.binance.com/docs/binance-spot-api-docs/web-socket-streams
// - Bourse : Yahoo Finance (données publiques), interrogé toutes les 10 secondes.
// Les notes 95-Flux restent mises à jour par les connecteurs, mais beaucoup moins souvent
// (historique), pour ne pas agiter le cerveau toutes les secondes.

const CRYPTO = [["btceur", "Bitcoin"], ["etheur", "Ethereum"], ["soleur", "Solana"]];
const MARKETS = [["^FCHI", "CAC 40"], ["^GSPC", "S&P 500"], ["^NDX", "Nasdaq 100"], ["^GDAXI", "DAX"], ["GC=F", "Or (once, USD)"], ["BZ=F", "Pétrole Brent"], ["MC.PA", "LVMH"], ["CFR.SW", "Richemont"]];
// Météo suisse : Fribourg et Berne (Open-Meteo, gratuit, sans clé).
const CITIES = [{ id: "fribourg", nom: "Fribourg", lat: 46.8065, lon: 7.1620 }, { id: "berne", nom: "Berne", lat: 46.9480, lon: 7.4474 }];
const UA = { "user-agent": "BrainApp/0.4 (+local second brain)" };
const nf = (n, d = 2) => (n == null || Number.isNaN(+n) ? "—" : new Intl.NumberFormat("fr-FR", { maximumFractionDigits: d, minimumFractionDigits: d }).format(+n));

export function startLive(send) {
  const state = { crypto: new Map(), marches: new Map(), meteo: new Map() };
  // ordre fixe des lignes (pas l ordre d arrivée des données)
  const ordered = (k) => { const ref = (k === "crypto" ? CRYPTO : MARKETS).map(([s]) => s); return [...state[k].values()].sort((a, b) => ref.indexOf(a.key) - ref.indexOf(b.key)); };
  let ws = null, wsTimer = null, stopped = false, pending = new Set(), flushTimer = null;

  // On regroupe les mises à jour : au plus 4 envois par seconde vers l'écran.
  const push = (id) => {
    pending.add(id);
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      for (const k of pending) send("live:tick", { id: k, at: Date.now(), widget: k === "meteo" ? [...state.meteo.values()] : ordered(k) });
      pending.clear();
    }, 250);
  };

  function connect() {
    if (stopped) return;
    const streams = CRYPTO.map(([s]) => `${s}@miniTicker`).join("/");
    try { ws = new WebSocket(`wss://stream.binance.com:9443/stream?streams=${streams}`); } catch { return retry(); }
    ws.onmessage = (ev) => {
      try {
        const { data: d } = JSON.parse(ev.data);
        const sym = d.s.toLowerCase(), label = CRYPTO.find(([s]) => s === sym)?.[1];
        if (!label) return;
        const price = +d.c, open = +d.o;
        state.crypto.set(sym, { key: sym, label, value: nf(price, price > 1000 ? 0 : 2) + " €", raw: price, change: open ? ((price - open) / open) * 100 : null });
        push("crypto");
      } catch { /* trame ignorée */ }
    };
    ws.onclose = () => retry();
    ws.onerror = () => { try { ws.close(); } catch { /* déjà fermé */ } };
  }
  function retry() { clearTimeout(wsTimer); if (!stopped) wsTimer = setTimeout(connect, 3000); } // Binance coupe au bout de 24 h : on se reconnecte

  async function markets() {
    await Promise.all(MARKETS.map(async ([s, label]) => {
      try {
        const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s)}?range=1d&interval=1m`, { headers: UA, signal: AbortSignal.timeout(8000) });
        const m = (await r.json())?.chart?.result?.[0]?.meta; if (!m) return;
        const change = m.chartPreviousClose ? ((m.regularMarketPrice - m.chartPreviousClose) / m.chartPreviousClose) * 100 : null;
        state.marches.set(s, { key: s, label, value: nf(m.regularMarketPrice), raw: m.regularMarketPrice, change, open: m.currentTradingPeriod?.regular ? Date.now() / 1000 < m.currentTradingPeriod.regular.end && Date.now() / 1000 > m.currentTradingPeriod.regular.start : null });
      } catch { /* réseau : on garde la dernière valeur */ }
    }));
    if (state.marches.size) push("marches");
  }

  async function weather() {
    try {
      const q = new URLSearchParams({
        latitude: CITIES.map((c) => c.lat).join(","), longitude: CITIES.map((c) => c.lon).join(","), timezone: "Europe/Zurich", forecast_days: "7",
        current: "temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m,is_day,precipitation",
        hourly: "temperature_2m,weather_code,precipitation_probability", daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset,uv_index_max",
      });
      const r = await fetch(`https://api.open-meteo.com/v1/forecast?${q}`, { headers: UA, signal: AbortSignal.timeout(10000) });
      const j = await r.json(), list = Array.isArray(j) ? j : [j];
      list.forEach((d, i) => {
        const c = CITIES[i]; if (!c || !d.current) return;
        const nowIdx = Math.max(0, d.hourly.time.findIndex((t) => t >= d.current.time.slice(0, 13)));
        state.meteo.set(c.id, {
          key: c.id, ville: c.nom, maj: Date.now(),
          now: { t: d.current.temperature_2m, ressenti: d.current.apparent_temperature, code: d.current.weather_code, vent: d.current.wind_speed_10m, humidite: d.current.relative_humidity_2m, jour: !!d.current.is_day, pluie: d.current.precipitation },
          heures: d.hourly.time.slice(nowIdx, nowIdx + 24).map((t, k) => ({ h: t.slice(11, 16), t: d.hourly.temperature_2m[nowIdx + k], code: d.hourly.weather_code[nowIdx + k], pp: d.hourly.precipitation_probability[nowIdx + k] })),
          jours: d.daily.time.map((t, k) => ({ date: t, code: d.daily.weather_code[k], max: d.daily.temperature_2m_max[k], min: d.daily.temperature_2m_min[k], pp: d.daily.precipitation_probability_max[k], lever: d.daily.sunrise[k]?.slice(11), coucher: d.daily.sunset[k]?.slice(11), uv: d.daily.uv_index_max[k] })),
        });
      });
      if (state.meteo.size) push("meteo");
    } catch { /* réseau : on garde la dernière météo */ }
  }

  connect();
  markets();
  weather();
  const mTimer = setInterval(markets, 10_000);
  const wTimer = setInterval(weather, 10 * 60_000);
  return {
    snapshot: () => ({ crypto: ordered("crypto"), marches: ordered("marches"), meteo: [...state.meteo.values()] }),
    stop() { stopped = true; clearInterval(mTimer); clearInterval(wTimer); clearTimeout(wsTimer); try { ws?.close(); } catch { /* déjà fermé */ } },
  };
}
