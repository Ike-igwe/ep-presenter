// =========================================================
// EP Presenter — Electron preload script
// =========================================================
// Runs in an isolated world before the renderer's window loads.
// Exposes a small, safe API to the renderer via contextBridge.
// =========================================================

const { contextBridge, ipcRenderer } = require('electron');

// Listen for menu-triggered actions and re-dispatch as DOM events
// the renderer can handle (the existing HTML already has these functions
// on window — we just need to invoke them when menu items fire).
const menuActionMap = {
  'ep:new-deck': () => { if (typeof window.newDeck === 'function') window.newDeck(); else if (typeof window.addSlide === 'function') { /* fallback no-op */ } },
  'ep:trigger-save': () => { if (typeof window.savePresentation === 'function') window.savePresentation(); },
  'ep:trigger-open': () => clickHidden('input[accept=".json"]'),
  'ep:trigger-import-pptx': () => clickHidden('input[accept=".pptx"]'),
  'ep:trigger-export-pdf': () => { if (typeof window.exportPDF === 'function') window.exportPDF(); },
  'ep:trigger-export-pptx': () => { if (typeof window.exportPPTX === 'function') window.exportPPTX(); },
  'ep:start-present': () => { if (typeof window.startPresent === 'function') window.startPresent(); },
  'ep:open-presenter-view': () => { if (typeof window.openPresenterView === 'function') window.openPresenterView(); }
};

function clickHidden(selector) {
  const el = document.querySelector(selector);
  if (el && typeof el.click === 'function') el.click();
}

// Wait until the renderer DOM is ready before wiring up menu listeners
window.addEventListener('DOMContentLoaded', () => {
  Object.keys(menuActionMap).forEach(channel => {
    ipcRenderer.on(channel, () => {
      try { menuActionMap[channel](); } catch (e) { console.error('Menu action failed:', channel, e); }
    });
  });
});

// Expose a minimal API to the renderer for the About dialog etc.
contextBridge.exposeInMainWorld('epElectron', {
  getVersion: () => ipcRenderer.invoke('ep:get-version'),
  openExternal: (url) => ipcRenderer.invoke('ep:open-external', url),
  listDesktopSources: () => ipcRenderer.invoke('ep:list-desktop-sources'),

  // Video conversion: takes an ArrayBuffer of WebM bytes + format and returns
  // { ok, outputPath } or { ok: false, error / canceled }.
  // The renderer should subscribe to onConvertProgress for live percentage.
  convertVideo: (sourceData, format, suggestedFilename, opts) =>
    ipcRenderer.invoke('ep:convert-video', { sourceData, format, suggestedFilename, opts }),
  probeEncoders: () => ipcRenderer.invoke('ep:probe-encoders'),
  onConvertProgress: (cb) => {
    const handler = (_event, data) => { try { cb(data); } catch (e) {} };
    ipcRenderer.on('ep:convert-progress', handler);
    return () => ipcRenderer.removeListener('ep:convert-progress', handler);
  },
  showInFolder: (filePath) => ipcRenderer.invoke('ep:show-in-folder', filePath),

  platform: process.platform
});
