// =========================================================
// EP Presenter — preload script
// =========================================================
// Runs in a privileged Node.js context bridging the renderer and main process.
// With contextIsolation:true, the renderer can't access Node directly. We use
// contextBridge to expose a minimal, named API on window.epElectron.
//
// Every method here corresponds to an ipcMain.handle in main.js (or an event
// we listen for via ipcRenderer.on).
// =========================================================

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('epElectron', {
  // App version
  getVersion: () => ipcRenderer.invoke('ep:get-version'),

  // Open a URL in the user's default browser
  openExternal: (url) => ipcRenderer.invoke('ep:open-external', url),

  // List screens/windows for the screen-share picker
  // Returns: [{ id, name, thumbnail, appIcon }]
  listDesktopSources: () => ipcRenderer.invoke('ep:list-desktop-sources'),

  // Reveal a saved file in the OS file explorer
  showInFolder: (filePath) => ipcRenderer.invoke('ep:show-in-folder', filePath),

  // Save a recorded WebM directly to disk
  // sourceData: ArrayBuffer; suggestedFilename: string (no extension)
  // Returns: { ok, outputPath?, canceled?, error? }
  saveWebm: (sourceData, suggestedFilename) =>
    ipcRenderer.invoke('ep:save-webm', { sourceData, suggestedFilename }),

  // Probe available H.264 encoders (NVENC, QSV, AMF, libx264)
  // Returns: string[] in preference order
  probeEncoders: () => ipcRenderer.invoke('ep:probe-encoders'),

  // Convert a recorded WebM to MP4 / MOV / GIF / MP3
  // format: 'mp4' | 'mov' | 'gif' | 'mp3'
  // opts: { quality: 'fast' | 'balanced' | 'high' }
  // Returns: { ok, outputPath?, canceled?, error?, log? }
  convertVideo: (sourceData, format, suggestedFilename, opts) =>
    ipcRenderer.invoke('ep:convert-video', { sourceData, format, suggestedFilename, opts }),

  // Subscribe to conversion progress events.
  // callback receives { pct, encoder, fellBack? }
  // Returns an unsubscribe function.
  onConvertProgress: (callback) => {
    const wrapped = (_event, data) => {
      try { callback(data); } catch (e) { /* swallow */ }
    };
    ipcRenderer.on('ep:convert-progress', wrapped);
    return () => ipcRenderer.removeListener('ep:convert-progress', wrapped);
  },

  // Subscribe to menu events from File/Present menus in main.js.
  // eventName: e.g. 'new-deck', 'trigger-open', 'trigger-save', 'start-present'.
  // Returns an unsubscribe function.
  onMenuEvent: (eventName, callback) => {
    const channel = 'ep:' + eventName;
    const wrapped = (_event, ...args) => {
      try { callback(...args); } catch (e) { /* swallow */ }
    };
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.removeListener(channel, wrapped);
  }
});
