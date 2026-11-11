// Pont sécurisé entre l'interface et le processus principal : l'interface ne touche jamais le disque directement.
const { contextBridge, ipcRenderer, webUtils } = require("electron");

const call = (ch) => (...a) => ipcRenderer.invoke(ch, ...a);
const on = (ch) => (fn) => { const l = (_e, d) => fn(d); ipcRenderer.on(ch, l); return () => ipcRenderer.removeListener(ch, l); };

contextBridge.exposeInMainWorld("brain", {
  info: call("vault:info"), chooseVault: call("vault:choose"), dailyNote: call("journal:today"), whoami: call("axon:whoami"), brancherClaude: call("claude:brancher"),
  setup: { info: call("setup:info"), pick: call("setup:pick"), check: call("setup:check"), create: call("setup:create"), done: call("setup:done") }, tree: call("vault:tree"), graph: call("vault:graph"),
  getNote: call("note:get"), saveNote: call("note:save"), createNote: call("note:create"), resolve: call("note:resolve"),
  fileInfo: call("file:info"), importFiles: call("files:import"), pickFiles: call("files:pick"),
  searchText: call("search:text"), searchSens: call("search:sens"), searchNeural: call("search:neural"),
  meta: call("vault:meta"), fluxWidgets: call("flux:widgets"), apis: call("apis:catalog"), chat: call("chat:send"), chatEngine: call("chat:engine"), onChatDelta: on("chat:delta"), fluxUpdate: call("flux:update"), onFlux: on("flux:updated"), liveSnapshot: call("live:snapshot"), onLive: on("live:tick"), context: call("brain:context"), lint: call("maintain:lint"), reindex: call("semantic:reindex"),
  reveal: call("shell:reveal"), openExternal: call("shell:open"), sync: call("git:sync"),
  pathOf: (file) => webUtils.getPathForFile(file),
  onChanged: on("vault:changed"), onSemProgress: on("semantic:progress"), onSemReady: on("semantic:ready"), onSemError: on("semantic:error"),
});
