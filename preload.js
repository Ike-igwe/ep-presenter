warning: in the working copy of 'main.js', LF will be replaced by CRLF the next time Git touches it
[1mdiff --git a/main.js b/main.js[m
[1mindex 407ea44..14236ce 100644[m
[1m--- a/main.js[m
[1m+++ b/main.js[m
[36m@@ -1,359 +1,133 @@[m
[31m-// =========================================================[m
 // EP Presenter — Electron main process[m
 // =========================================================[m
[31m-// This file runs in Node.js context (not the browser renderer).[m
[31m-// It creates the browser window, defines the application menu,[m
[31m-// and wires up auto-update checking.[m
[32m+[m[32m// This file boots the Electron window, wires up auto-update, and implements[m
[32m+[m[32m// the IPC handlers the renderer talks to:[m
[32m+[m[32m//   ep:get-version              → app version string[m
[32m+[m[32m//   ep:open-external            → open URL in default browser[m
[32m+[m[32m//   ep:list-desktop-sources     → list screens/windows for screen-share picker[m
[32m+[m[32m//   ep:show-in-folder           → reveal a file in OS file explorer[m
[32m+[m[32m//   ep:probe-encoders           → detect available H.264 encoders (GPU first)[m
[32m+[m[32m//   ep:convert-video            → spawn ffmpeg to transcode a recorded webm[m
[32m+[m[32m//   ep:convert-progress         → (event, not handler) per-frame progress %[m
 // =========================================================[m
 [m
[31m-const { app, BrowserWindow, Menu, shell, dialog, ipcMain, session, desktopCapturer } = require('electron');[m
[32m+[m[32mconst { app, BrowserWindow, Menu, shell, ipcMain, dialog, desktopCapturer, session } = require('electron');[m
 const path = require('path');[m
[32m+[m[32mconst fs = require('fs');[m
[32m+[m[32mconst os = require('os');[m
[32m+[m[32mconst { spawn } = require('child_process');[m
[32m+[m[32mconst { autoUpdater } = require('electron-updater');[m
 [m
[31m-// Auto-update support (loaded lazily so dev mode doesn't crash without a signed build)[m
[31m-let autoUpdater = null;[m
[31m-try {[m
[31m-  autoUpdater = require('electron-updater').autoUpdater;[m
[31m-  autoUpdater.autoDownload = false;   // Ask user before downloading[m
[31m-  autoUpdater.autoInstallOnAppQuit = true;[m
[31m-} catch (e) {[m
[31m-  console.warn('electron-updater not available; auto-updates disabled:', e.message);[m
[32m+[m[32m// ---------------------------------------------------------[m
[32m+[m[32m// FFmpeg binary resolution[m
[32m+[m[32m// ---------------------------------------------------------[m
[32m+[m[32m// In dev: ffmpeg-static returns the path inside node_modules.[m
[32m+[m[32m// In packaged app: the binary is unpacked from app.asar to app.asar.unpacked[m
[32m+[m[32m// (configured via "asarUnpack" in package.json's "build" section).[m
[32m+[m[32m// We rewrite the path at runtime so spawn() can find it.[m
[32m+[m[32mfunction resolveFfmpegPath() {[m
[32m+[m[32m  let p;[m
[32m+[m[32m  try {[m
[32m+[m[32m    p = require('ffmpeg-static');[m
[32m+[m[32m  } catch (e) {[m
[32m+[m[32m    return null;[m
[32m+[m[32m  }[m
[32m+[m[32m  if (!p) return null;[m
[32m+[m[32m  // When packaged, ffmpeg-static returns a path containing "app.asar" — the[m
[32m+[m[32m  // binary is actually at the corresponding "app.asar.unpacked" path.[m
[32m+[m[32m  if (p.includes('app.asar') && !p.includes('app.asar.unpacked')) {[m
[32m+[m[32m    p = p.replace('app.asar', 'app.asar.unpacked');[m
[32m+[m[32m  }[m
[32m+[m[32m  // Verify the file exists; if not, return null so the caller can show an error.[m
[32m+[m[32m  try {[m
[32m+[m[32m    if (!fs.existsSync(p)) return null;[m
[32m+[m[32m  } catch (e) {[m
[32m+[m[32m    return null;[m
[32m+[m[32m  }[m
[32m+[m[32m  return p;[m
 }[m
 [m
[31m-// Keep a global reference to the main window so it isn't garbage collected[m
[32m+[m[32m// ---------------------------------------------------------[m
[32m+[m[32m// Window[m
[32m+[m[32m// ---------------------------------------------------------[m
 let mainWindow = null;[m
[31m-// Optional presenter view window (opened from within the app via window.open)[m
[31m-let presenterWindow = null;[m
[31m-[m
[31m-const isDev = !app.isPackaged;[m
 [m
[31m-// =========================================================[m
[31m-// WINDOW CREATION[m
[31m-// =========================================================[m
[31m-function createMainWindow() {[m
[32m+[m[32mfunction createWindow() {[m
   mainWindow = new BrowserWindow({[m
[31m-    width: 1440,[m
[32m+[m[32m    width: 1400,[m
     height: 900,[m
[31m-    minWidth: 1024,[m
[31m-    minHeight: 700,[m
[32m+[m[32m    minWidth: 1100,[m
[32m+[m[32m    minHeight: 720,[m
[32m+[m[32m    backgroundColor: '#0a0a0c',[m
     title: 'EP Presenter',[m
[31m-    backgroundColor: '#1a1a1a',[m
[31m-    icon: path.join(__dirname, 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),[m
[31m-    show: false,   // don't show until ready-to-show fires (prevents white flash)[m
[32m+[m[32m    icon: path.join(__dirname, 'build', 'icon.ico'),[m
     webPreferences: {[m
       preload: path.join(__dirname, 'preload.js'),[m
       contextIsolation: true,[m
       nodeIntegration: false,[m
[31m-      sandbox: false,[m
[31m-      webSecurity: true,[m
[31m-      // Features required by EP Presenter's web stack:[m
[31m-      webviewTag: false,[m
[31m-      spellcheck: true[m
[32m+[m[32m      sandbox: false[m
     }[m
   });[m
 [m
[31m-  // Load the app's HTML[m
[31m-  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));[m
[31m-[m
[31m-  // Show once content is ready[m
[31m-  mainWindow.once('ready-to-show', () => {[m
[31m-    mainWindow.show();[m
[31m-    if (isDev) mainWindow.webContents.openDevTools({ mode: 'detach' });[m
[31m-  });[m
[31m-[m
[31m-  mainWindow.on('closed', () => {[m
[31m-    mainWindow = null;[m
[31m-  });[m
[32m+[m[32m  // Screen-share picker support: when the renderer calls getDisplayMedia(),[m
[32m+[m[32m  // Electron asks us how to handle it. useSystemPicker uses the OS picker on[m
[32m+[m[32m  // newer Electron versions; if unavailable, the renderer's custom picker[m
[32m+[m[32m  // (built on listDesktopSources) takes over.[m
[32m+[m[32m  if (session && session.defaultSession && session.defaultSession.setDisplayMediaRequestHandler) {[m
[32m+[m[32m    session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {[m
[32m+[m[32m      // Default: let the renderer's custom picker drive (it calls[m
[32m+[m[32m      // listDesktopSources → getUserMedia with chromeMediaSourceId). So we[m
[32m+[m[32m      // just deny the getDisplayMedia call here; the renderer falls back.[m
[32m+[m[32m      callback(null);[m
[32m+[m[32m    }, { useSystemPicker: false });[m
[32m+[m[32m  }[m
 [m
[31m-  // Intercept window.open calls — route to the presenter window handler[m
[31m-  mainWindow.webContents.setWindowOpenHandler(({ url, features, frameName }) => {[m
[31m-    // The in-app "Presenter View" feature opens a 2nd window via window.open('','ep-presenter-view',...)[m
[31m-    if (frameName === 'ep-presenter-view') {[m
[31m-      return {[m
[31m-        action: 'allow',[m
[31m-        overrideBrowserWindowOptions: {[m
[31m-          width: 1100,[m
[31m-          height: 720,[m
[31m-          title: 'EP Presenter — Presenter View',[m
[31m-          backgroundColor: '#0a0a0c',[m
[31m-          icon: path.join(__dirname, 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),[m
[31m-          webPreferences: {[m
[31m-            contextIsolation: true,[m
[31m-            nodeIntegration: false[m
[31m-          }[m
[31m-        }[m
[31m-      };[m
[31m-    }[m
[31m-    // External http/https links → open in default browser, not the app[m
[31m-    if (url.startsWith('http://') || url.startsWith('https://')) {[m
[31m-      shell.openExternal(url);[m
[31m-      return { action: 'deny' };[m
[31m-    }[m
[31m-    return { action: 'allow' };[m
[31m-  });[m
[32m+[m[32m  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));[m
[32m+[m[32m  mainWindow.on('closed', () => { mainWindow = null; });[m
 [m
[31m-  // External links clicked inside the app → default browser[m
[31m-  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {[m
[31m-    const parsedUrl = new URL(navigationUrl);[m
[31m-    const currentUrl = new URL(mainWindow.webContents.getURL());[m
[31m-    if (parsedUrl.origin !== currentUrl.origin && !parsedUrl.protocol.startsWith('file')) {[m
[31m-      event.preventDefault();[m
[31m-      shell.openExternal(navigationUrl);[m
[31m-    }[m
[31m-  });[m
[32m+[m[32m  // Build a minimal app menu (File, Edit, View, Present, Window, Help)[m
[32m+[m[32m  buildAppMenu();[m
 }[m
 [m
[31m-// =========================================================[m
[31m-// APPLICATION MENU — EP-branded custom menu[m
[31m-// =========================================================[m
 function buildAppMenu() {[m
[32m+[m[32m  const isMac = process.platform === 'darwin';[m
   const template = [[m
     {[m
       label: 'File',[m
       submenu: [[m
[31m-        {[m
[31m-          label: 'New Deck',[m
[31m-          accelerator: 'CmdOrCtrl+N',[m
[31m-          click: () => mainWindow && mainWindow.webContents.send('ep:new-deck')[m
[31m-        },[m
[31m-        { type: 'separator' },[m
[31m-        {[m
[31m-          label: 'Open…',[m
[31m-          accelerator: 'CmdOrCtrl+O',[m
[31m-          click: () => mainWindow && mainWindow.webContents.send('ep:trigger-open')[m
[31m-        },[m
[31m-        {[m
[31m-          label: 'Save',[m
[31m-          accelerator: 'CmdOrCtrl+S',[m
[31m-          click: () => mainWindow && mainWindow.webContents.send('ep:trigger-save')[m
[31m-        },[m
[31m-        { type: 'separator' },[m
[31m-        {[m
[31m-          label: 'Import PowerPoint (.pptx)…',[m
[31m-          click: () => mainWindow && mainWindow.webContents.send('ep:trigger-import-pptx')[m
[31m-        },[m
[31m-        {[m
[31m-          label: 'Export PDF',[m
[31m-          click: () => mainWindow && mainWindow.webContents.send('ep:trigger-export-pdf')[m
[31m-        },[m
[31m-        {[m
[31m-          label: 'Export PowerPoint (.pptx)',[m
[31m-          click: () => mainWindow && mainWindow.webContents.send('ep:trigger-export-pptx')[m
[31m-        },[m
[31m-        { type: 'separator' },[m
[31m-        { role: 'quit', label: 'Quit EP Presenter' }[m
[31m-      ][m
[31m-    },[m
[31m-    {[m
[31m-      label: 'Edit',[m
[31m-      submenu: [[m
[31m-        { role: 'undo' },[m
[31m-        { role: 'redo' },[m
[31m-        { type: 'separator' },[m
[31m-        { role: 'cut' },[m
[31m-        { role: 'copy' },[m
[31m-        { role: 'paste' },[m
[31m-        { role: 'selectAll' }[m
[31m-      ][m
[31m-    },[m
[31m-    {[m
[31m-      label: 'View',[m
[31m-      submenu: [[m
[31m-        { role: 'reload' },[m
[31m-        { role: 'forceReload' },[m
[31m-        { role: 'toggleDevTools', accelerator: 'CmdOrCtrl+Shift+I' },[m
[31m-        { type: 'separator' },[m
[31m-        { role: 'resetZoom' },[m
[31m-        { role: 'zoomIn' },[m
[31m-        { role: 'zoomOut' },[m
[31m-        { type: 'separator' },[m
[31m-        { role: 'togglefullscreen' }[m
[32m+[m[32m        { role: isMac ? 'close' : 'quit' }[m
       ][m
     },[m
[32m+[m[32m    { role: 'editMenu' },[m
[32m+[m[32m    { role: 'viewMenu' },[m
     {[m
       label: 'Present',[m
       submenu: [[m
[31m-        {[m
[31m-          label: 'Start Presentation',[m
[31m-          accelerator: 'F5',[m
[31m-          click: () => mainWindow && mainWindow.webContents.send('ep:start-present')[m
[31m-        },[m
[31m-        {[m
[31m-          label: 'Open Presenter View',[m
[31m-          accelerator: 'F6',[m
[31m-          click: () => mainWindow && mainWindow.webContents.send('ep:open-presenter-view')[m
[31m-        }[m
[31m-      ][m
[31m-    },[m
[31m-    {[m
[31m-      label: 'Window',[m
[31m-      submenu: [[m
[31m-        { role: 'minimize' },[m
[31m-        { role: 'zoom' },[m
[31m-        { role: 'close' }[m
[32m+[m[32m        { label: 'Start Presentation (F5)', click: () => mainWindow && mainWindow.webContents.executeJavaScript('typeof startPresent === "function" && startPresent()') }[m
       ][m
     },[m
[32m+[m[32m    { role: 'windowMenu' },[m
     {[m
[31m-      label: 'Help',[m
[32m+[m[32m      role: 'help',[m
       submenu: [[m
[31m-        {[m
[31m-          label: 'Visit ikeigwe.com',[m
[31m-          click: () => shell.openExternal('https://ikeigwe.com')[m
[31m-        },[m
[31m-        {[m
[31m-          label: 'The Trading Edge',[m
[31m-          click: () => shell.openExternal('https://ikeigwe.com')[m
[31m-        },[m
[31m-        { type: 'separator' },[m
[31m-        {[m
[31m-          label: 'Check for Updates…',[m
[31m-          click: () => checkForUpdates(true)[m
[31m-        },[m
[31m-        { type: 'separator' },[m
[31m-        {[m
[31m-          label: 'About EP Presenter',[m
[31m-          click: () => showAboutDialog()[m
[31m-        }[m
[32m+[m[32m        { label: 'EP Presenter on the web', click: () => shell.openExternal('https://ikeigwe.com') },[m
[32m+[m[32m        { label: 'Check for Updates', click: () => autoUpdater.checkForUpdatesAndNotify() }[m
       ][m
     }[m
   ];[m
[31m-  const menu = Menu.buildFromTemplate(template);[m
[31m-  Menu.setApplicationMenu(menu);[m
[31m-}[m
[31m-[m
[31m-function showAboutDialog() {[m
[31m-  const version = app.getVersion();[m
[31m-  dialog.showMessageBox(mainWindow, {[m
[31m-    type: 'info',[m
[31m-    title: 'About EP Presenter',[m
[31m-    message: 'EP Presenter',[m
[31m-    detail: [[m
[31m-      'Version ' + version,[m
[31m-      '',[m
[31m-      'Eze Profit — forex trading education presentation tool.',[m
[31m-      'Built by Ike Igwe for traders who teach.',[m
[31m-      '',[m
[31m-      'https://ikeigwe.com'[m
[31m-    ].join('\n'),[m
[31m-    buttons: ['OK', 'Visit ikeigwe.com'],[m
[31m-    defaultId: 0,[m
[31m-    cancelId: 0[m
[31m-  }).then(result => {[m
[31m-    if (result.response === 1) shell.openExternal('https://ikeigwe.com');[m
[31m-  });[m
[31m-}[m
[31m-[m
[31m-// =========================================================[m
[31m-// AUTO-UPDATE[m
[31m-// =========================================================[m
[31m-function checkForUpdates(userInitiated = false) {[m
[31m-  if (!autoUpdater) {[m
[31m-    if (userInitiated) {[m
[31m-      dialog.showMessageBox(mainWindow, {[m
[31m-        type: 'info',[m
[31m-        message: 'Auto-updates unavailable',[m
[31m-        detail: 'electron-updater is not loaded. Check the console for details.'[m
[31m-      });[m
[31m-    }[m
[31m-    return;[m
[31m-  }[m
[31m-  if (isDev) {[m
[31m-    if (userInitiated) {[m
[31m-      dialog.showMessageBox(mainWindow, {[m
[31m-        type: 'info',[m
[31m-        message: 'Development build',[m
[31m-        detail: 'Auto-updates only run in the packaged app.'[m
[31m-      });[m
[31m-    }[m
[31m-    return;[m
[31m-  }[m
[31m-[m
[31m-  autoUpdater.checkForUpdates().catch(err => {[m
[31m-    console.error('Update check failed:', err);[m
[31m-    if (userInitiated) {[m
[31m-      dialog.showMessageBox(mainWindow, {[m
[31m-        type: 'error',[m
[31m-        message: 'Update check failed',[m
[31m-        detail: String(err && err.message || err)[m
[31m-      });[m
[31m-    }[m
[31m-  });[m
[31m-[m
[31m-  if (userInitiated) {[m
[31m-    autoUpdater.once('update-not-available', () => {[m
[31m-      dialog.showMessageBox(mainWindow, {[m
[31m-        type: 'info',[m
[31m-        message: 'You are up to date',[m
[31m-        detail: 'EP Presenter ' + app.getVersion() + ' is the latest version.'[m
[31m-      });[m
[31m-    });[m
[31m-  }[m
[32m+[m[32m  Menu.setApplicationMenu(Menu.buildFromTemplate(template));[m
 }[m
 [m
[31m-if (autoUpdater) {[m
[31m-  autoUpdater.on('update-available', (info) => {[m
[31m-    dialog.showMessageBox(mainWindow, {[m
[31m-      type: 'question',[m
[31m-      buttons: ['Download', 'Later'],[m
[31m-      defaultId: 0,[m
[31m-      cancelId: 1,[m
[31m-      title: 'Update available',[m
[31m-      message: 'EP Presenter ' + info.version + ' is available',[m
[31m-      detail: 'Current version: ' + app.getVersion() + '\nDownload now?'[m
[31m-    }).then(result => {[m
[31m-      if (result.response === 0) autoUpdater.downloadUpdate();[m
[31m-    });[m
[31m-  });[m
[31m-[m
[31m-  autoUpdater.on('update-downloaded', () => {[m
[31m-    dialog.showMessageBox(mainWindow, {[m
[31m-      type: 'question',[m
[31m-      buttons: ['Restart now', 'Later'],[m
[31m-      defaultId: 0,[m
[31m-      cancelId: 1,[m
[31m-      title: 'Update ready',[m
[31m-      message: 'Update downloaded. Restart to install?'[m
[31m-    }).then(result => {[m
[31m-      if (result.response === 0) autoUpdater.quitAndInstall();[m
[31m-    });[m
[31m-  });[m
[31m-[m
[31m-  autoUpdater.on('error', (err) => {[m
[31m-    console.error('Auto-updater error:', err);[m
[31m-  });[m
[31m-}[m
[31m-[m
[31m-// =========================================================[m
[31m-// APP LIFECYCLE[m
[31m-// =========================================================[m
[32m+[m[32m// ---------------------------------------------------------[m
[32m+[m[32m// App lifecycle[m
[32m+[m[32m// ---------------------------------------------------------[m
 app.whenReady().then(() => {[m
[31m-  // Standard browser permissions — media (camera/mic) and display-media (screen share)[m
[31m-  // must be allowed for EP Presenter's webcam overlay + screen share element to work.[m
[31m-  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {[m
[31m-    const allowed = [[m
[31m-      'media',           // camera + mic[m
[31m-      'display-capture', // screen share (getDisplayMedia)[m
[31m-      'clipboard-read',[m
[31m-      'clipboard-sanitized-write',[m
[31m-      'fullscreen'[m
[31m-    ];[m
[31m-    callback(allowed.includes(permission));[m
[31m-  });[m
[31m-[m
[31m-  // No setDisplayMediaRequestHandler — this makes getDisplayMedia() reject in the[m
[31m-  // packaged build, which triggers our renderer's fallback to the custom picker[m
[31m-  // built on top of desktopCapturer. We do this because:[m
[31m-  // 1. Windows 11's native picker (useSystemPicker: true) had inconsistent behavior[m
[31m-  // 2. Our custom picker gives us full UI control, branding, refresh button, etc.[m
[31m-  // 3. Predictable behavior across Windows 10 and 11[m
[31m-[m
[31m-  buildAppMenu();[m
[31m-  createMainWindow();[m
[31m-[m
[31m-  // Check for updates 3s after launch (non-blocking, silent if no update)[m
[31m-  setTimeout(() => checkForUpdates(false), 3000);[m
[32m+[m[32m  createWindow();[m
[32m+[m[32m  // Auto-update check (silent if no update available)[m
[32m+[m[32m  try { autoUpdater.checkForUpdatesAndNotify(); } catch (e) { /* offline ok */ }[m
 [m
   app.on('activate', () => {[m
[31m-    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();[m
[32m+[m[32m    if (BrowserWindow.getAllWindows().length === 0) createWindow();[m
   });[m
 });[m
 [m
[36m@@ -361,21 +135,18 @@[m [mapp.on('window-all-closed', () => {[m
   if (process.platform !== 'darwin') app.quit();[m
 });[m
 [m
[31m-// =========================================================[m
[31m-// RENDERER ↔ MAIN IPC[m
[31m-// =========================================================[m
[31m-// Keyboard shortcuts and menu items in the renderer can ask main to do things.[m
[32m+[m[32m// ---------------------------------------------------------[m
[32m+[m[32m// IPC: simple[m
[32m+[m[32m// ---------------------------------------------------------[m
 ipcMain.handle('ep:get-version', () => app.getVersion());[m
[31m-ipcMain.handle('ep:open-external', (_event, url) => {[m
[31m-  if (typeof url === 'string' && (url.startsWith('http://') || url.startsWith('https://'))) {[m
[31m-    shell.openExternal(url);[m
[31m-    return true;[m
[31m-  }[m
[31m-  return false;[m
[32m+[m
[32m+[m[32mipcMain.handle('ep:open-external', async (_event, url) => {[m
[32m+[m[32m  if (!url || typeof url !== 'string') return false;[m
[32m+[m[32m  try { await shell.openExternal(url); return true; } catch (e) { return false; }[m
 });[m
 [m
[31m-// List the user's available screens and windows so the renderer can[m
[31m-// show a custom picker UI. Thumbnails are returned as data URLs.[m
[32m+[m[32m// Returns array of { id, name, thumbnail (data URL), appIcon (data URL or null) }.[m
[32m+[m[32m// Renderer uses this to build its custom screen-source picker.[m
 ipcMain.handle('ep:list-desktop-sources', async () => {[m
   try {[m
     const sources = await desktopCapturer.getSources({[m
[36m@@ -383,15 +154,339 @@[m [mipcMain.handle('ep:list-desktop-sources', async () => {[m
       thumbnailSize: { width: 320, height: 180 },[m
       fetchWindowIcons: true[m
     });[m
[31m-    return sources.map((s) => ({[m
[32m+[m[32m    return sources.map(s => ({[m
       id: s.id,[m
       name: s.name,[m
[31m-      display_id: s.display_id,[m
       thumbnail: s.thumbnail ? s.thumbnail.toDataURL() : null,[m
       appIcon: s.appIcon ? s.appIcon.toDataURL() : null[m
     }));[m
[31m-  } catch (err) {[m
[31m-    console.error('list-desktop-sources failed:', err);[m
[32m+[m[32m  } catch (e) {[m
[32m+[m[32m    console.error('listDesktopSources failed:', e);[m
     return [];[m
   }[m
 });[m
[32m+[m
[32m+[m[32mipcMain.handle('ep:show-in-folder', async (_event, filePath) => {[m
[32m+[m[32m  if (!filePath || typeof filePath !== 'string') return false;[m
[32m+[m[32m  try { shell.showItemInFolder(filePath); return true; } catch (e) { return false; }[m
[32m+[m[32m});[m
[32m+[m
[32m+[m[32m// ---------------------------------------------------------[m
[32m+[m[32m// IPC: save-webm — direct disk save without browser download[m
[32m+[m[32m// ---------------------------------------------------------[m
[32m+[m[32m// The renderer's previous WebM save used a temporary <a download> trick which[m
[32m+[m[32m// caused Chromium to write the file to a `.tmp` first and then rename. When[m
[32m+[m[32m// rename failed for any reason (large file, AV interception, locked path) the[m
[32m+[m[32m// `.tmp` was left orphaned alongside the saved .webm. This handler replaces[m
[32m+[m[32m// that flow: open a real Save dialog, write the bytes via fs.writeFileSync.[m
[32m+[m[32m// No temp file pattern, no orphan files.[m
[32m+[m[32mipcMain.handle('ep:save-webm', async (_event, args) => {[m
[32m+[m[32m  const { sourceData, suggestedFilename } = args || {};[m
[32m+[m[32m  if (!sourceData) return { ok: false, error: 'No data provided' };[m
[32m+[m
[32m+[m[32m  const defaultName = (suggestedFilename || 'ep-recording-' + Date.now()) + '.webm';[m
[32m+[m[32m  const saveResult = await dialog.showSaveDialog(mainWindow, {[m
[32m+[m[32m    title: 'Save recording',[m
[32m+[m[32m    defaultPath: path.join(app.getPath('downloads'), defaultName),[m
[32m+[m[32m    filters: [{ name: 'WebM video', extensions: ['webm'] }][m
[32m+[m[32m  });[m
[32m+[m[32m  if (saveResult.canceled || !saveResult.filePath) {[m
[32m+[m[32m    return { ok: false, canceled: true };[m
[32m+[m[32m  }[m
[32m+[m[32m  try {[m
[32m+[m[32m    const buf = Buffer.from(sourceData);[m
[32m+[m[32m    fs.writeFileSync(saveResult.filePath, buf);[m
[32m+[m[32m    return { ok: true, outputPath: saveResult.filePath };[m
[32m+[m[32m  } catch (e) {[m
[32m+[m[32m    return { ok: false, error: 'Failed to write file: ' + e.message };[m
[32m+[m[32m  }[m
[32m+[m[32m});[m
[32m+[m
[32m+[m[32m// ---------------------------------------------------------[m
[32m+[m[32m// FFMPEG: encoder probe[m
[32m+[m[32m// ---------------------------------------------------------[m
[32m+[m[32m// Runs `ffmpeg -encoders` once per session, scans output for hardware H.264[m
[32m+[m[32m// encoders, returns them in preference order: NVIDIA → Intel → AMD → CPU.[m
[32m+[m[32m// The renderer caches the result.[m
[32m+[m[32mlet _encoderCache = null;[m
[32m+[m
[32m+[m[32mipcMain.handle('ep:probe-encoders', async () => {[m
[32m+[m[32m  if (_encoderCache) return _encoderCache;[m
[32m+[m[32m  const ffmpegPath = resolveFfmpegPath();[m
[32m+[m[32m  if (!ffmpegPath) {[m
[32m+[m[32m    _encoderCache = ['libx264'];[m
[32m+[m[32m    return _encoderCache;[m
[32m+[m[32m  }[m
[32m+[m[32m  return new Promise((resolve) => {[m
[32m+[m[32m    let buf = '';[m
[32m+[m[32m    const child = spawn(ffmpegPath, ['-hide_banner', '-encoders'], { windowsHide: true });[m
[32m+[m[32m    const timer = setTimeout(() => {[m
[32m+[m[32m      try { child.kill(); } catch (e) {}[m
[32m+[m[32m      _encoderCache = ['libx264'];[m
[32m+[m[32m      resolve(_encoderCache);[m
[32m+[m[32m    }, 4000);[m
[32m+[m[32m    child.stdout.on('data', d => { buf += d.toString(); });[m
[32m+[m[32m    child.stderr.on('data', d => { buf += d.toString(); });[m
[32m+[m[32m    child.on('close', () => {[m
[32m+[m[32m      clearTimeout(timer);[m
[32m+[m[32m      const list = [];[m
[32m+[m[32m      // Order matters: prefer GPU encoders, fall back to CPU.[m
[32m+[m[32m      if (/h264_nvenc/i.test(buf)) list.push('h264_nvenc');[m
[32m+[m[32m      if (/h264_qsv/i.test(buf))   list.push('h264_qsv');[m
[32m+[m[32m      if (/h264_amf/i.test(buf))   list.push('h264_amf');[m
[32m+[m[32m      if (/libx264/i.test(buf))    list.push('libx264');[m
[32m+[m[32m      if (list.length === 0) list.push('libx264'); // fallback[m
[32m+[m[32m      _encoderCache = list;[m
[32m+[m[32m      resolve(list);[m
[32m+[m[32m    });[m
[32m+[m[32m    child.on('error', () => {[m
[32m+[m[32m      clearTimeout(timer);[m
[32m+[m[32m      _encoderCache = ['libx264'];[m
[32m+[m[32m      resolve(_encoderCache);[m
[32m+[m[32m    });[m
[32m+[m[32m  });[m
[32m+[m[32m});[m
[32m+[m
[32m+[m[32m// ---------------------------------------------------------[m
[32m+[m[32m// FFMPEG: build args per format / quality / encoder[m
[32m+[m[32m// ---------------------------------------------------------[m
[32m+[m[32m// Quality presets map to ffmpeg's speed/quality tradeoff:[m
[32m+[m[32m//   fast     → ultrafast preset, higher CRF (bigger file, ~realtime on CPU)[m
[32m+[m[32m//   balanced → medium preset, mid CRF (default)[m
[32m+[m[32m//   high     → slow preset, low CRF (best quality, slowest)[m
[32m+[m[32m// GPU encoders use their own preset names (NVENC: p1..p7, QSV/AMF: speed/quality).[m
[32m+[m[32mfunction buildFfmpegArgs(format, inputPath, outputPath, opts) {[m
[32m+[m[32m  opts = opts || {};[m
[32m+[m[32m  const quality = opts.quality || 'fast';[m
[32m+[m[32m  const encoder = opts.encoder || 'libx264';[m
[32m+[m
[32m+[m[32m  if (format === 'mp4' || format === 'mov') {[m
[32m+[m[32m    const args = ['-y', '-i', inputPath];[m
[32m+[m[32m    // Video codec selection[m
[32m+[m[32m    if (encoder === 'h264_nvenc') {[m
[32m+[m[32m      // NVENC presets: p1=fastest, p7=slowest. CQ is constant-quality (lower = better).[m
[32m+[m[32m      const nvPreset = quality === 'fast' ? 'p2' : quality === 'balanced' ? 'p4' : 'p6';[m
[32m+[m[32m      const nvCq     = quality === 'fast' ? '28' : quality === 'balanced' ? '23' : '20';[m
[32m+[m[32m      args.push('-c:v', 'h264_nvenc', '-preset', nvPreset, '-cq', nvCq, '-rc', 'vbr');[m
[32m+[m[32m    } else if (encoder === 'h264_qsv') {[m
[32m+[m[32m      const qsvPreset = quality === 'fast' ? 'veryfast' : quality === 'balanced' ? 'medium' : 'slow';[m
[32m+[m[32m      const qsvQ      = quality === 'fast' ? '28' : quality === 'balanced' ? '23' : '20';[m
[32m+[m[32m      args.push('-c:v', 'h264_qsv', '-preset', qsvPreset, '-global_quality', qsvQ);[m
[32m+[m[32m    } else if (encoder === 'h264_amf') {[m
[32m+[m[32m      const amfQuality = quality === 'fast' ? 'speed' : quality === 'balanced' ? 'balanced' : 'quality';[m
[32m+[m[32m      const amfQp      = quality === 'fast' ? '28' : quality === 'balanced' ? '23' : '20';[m
[32m+[m[32m      args.push('-c:v', 'h264_amf', '-quality', amfQuality, '-rc', 'cqp', '-qp_i', amfQp, '-qp_p', amfQp);[m
[32m+[m[32m    } else {[m
[32m+[m[32m      // libx264 (CPU fallback). ultrafast is genuinely fast — fine for daily lesson exports.[m
[32m+[m[32m      const x264Preset = quality === 'fast' ? 'ultrafast' : quality === 'balanced' ? 'medium' : 'slow';[m
[32m+[m[32m      const x264Crf    = quality === 'fast' ? '24' : quality === 'balanced' ? '20' : '18';[m
[32m+[m[32m      args.push('-c:v', 'libx264', '-preset', x264Preset, '-crf', x264Crf);[m
[32m+[m[32m    }[m
[32m+[m[32m    // Common video output flags[m
[32m+[m[32m    args.push('-pix_fmt', 'yuv420p');[m
[32m+[m[32m    if (format === 'mp4') args.push('-movflags', '+faststart');[m
[32m+[m[32m    // Audio: AAC at decent bitrate[m
[32m+[m[32m    args.push('-c:a', 'aac', '-b:a', '192k');[m
[32m+[m[32m    args.push(outputPath);[m
[32m+[m[32m    return args;[m
[32m+[m[32m  }[m
[32m+[m
[32m+[m[32m  if (format === 'mp3') {[m
[32m+[m[32m    return ['-y', '-i', inputPath, '-vn', '-c:a', 'libmp3lame', '-q:a', '2', outputPath];[m
[32m+[m[32m  }[m
[32m+[m
[32m+[m[32m  if (format === 'gif') {[m
[32m+[m[32m    // Single-pass palette filter. Quality preset trades fps + width for file size.[m
[32m+[m[32m    const fpsMap   = { fast: 12, balanced: 15, high: 20 };[m
[32m+[m[32m    const widthMap = { fast: 640, balanced: 800, high: 960 };[m
[32m+[m[32m    const fps = fpsMap[quality] || 15;[m
[32m+[m[32m    const w   = widthMap[quality] || 800;[m
[32m+[m[32m    return [[m
[32m+[m[32m      '-y', '-i', inputPath,[m
[32m+[m[32m      '-vf', 'fps=' + fps + ',scale=' + w + ':-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse',[m
[32m+[m[32m      '-loop', '0',[m
[32m+[m[32m      outputPath[m
[32m+[m[32m    ];[m
[32m+[m[32m  }[m
[32m+[m
[32m+[m[32m  return null;[m
[32m+[m[32m}[m
[32m+[m
[32m+[m[32m// ---------------------------------------------------------[m
[32m+[m[32m// FFMPEG: convert-video handler[m
[32m+[m[32m// ---------------------------------------------------------[m
[32m+[m[32m// Renderer passes:[m
[32m+[m[32m//   sourceData: ArrayBuffer of the recorded WebM[m
[32m+[m[32m//   format: 'mp4' | 'mov' | 'gif' | 'mp3'[m
[32m+[m[32m//   suggestedFilename: e.g. 'ep-recording-1735000000000'[m
[32m+[m[32m//   opts: { quality: 'fast'|'balanced'|'high' }[m
[32m+[m[32m// We:[m
[32m+[m[32m//   1. Show a Save dialog so user picks output location[m
[32m+[m[32m//   2. Write the WebM to a temp .webm file[m
[32m+[m[32m//   3. Pick the best encoder (GPU > CPU)[m
[32m+[m[32m//   4. Spawn ffmpeg, parse stderr for progress, stream % to renderer[m
[32m+[m[32m//   5. On non-zero exit with a GPU encoder, retry with libx264 (fallback)[m
[32m+[m[32m//   6. Resolve with { ok, outputPath } or { ok: false, error / canceled }[m
[32m+[m[32mipcMain.handle('ep:convert-video', async (event, args) => {[m
[32m+[m[32m  const { sourceData, format, suggestedFilename, opts } = args || {};[m
[32m+[m[32m  if (!sourceData || !format) return { ok: false, error: 'Missing arguments' };[m
[32m+[m
[32m+[m[32m  const ffmpegPath = resolveFfmpegPath();[m
[32m+[m[32m  if (!ffmpegPath) {[m
[32m+[m[32m    return { ok: false, error: 'FFmpeg binary not available. Reinstall the app.' };[m
[32m+[m[32m  }[m
[32m+[m
[32m+[m[32m  const formatMeta = {[m
[32m+[m[32m    mp4: { ext: 'mp4', label: 'MP4 video (H.264 + AAC)' },[m
[32m+[m[32m    mov: { ext: 'mov', label: 'QuickTime MOV (H.264 + AAC)' },[m
[32m+[m[32m    gif: { ext: 'gif', label: 'Animated GIF' },[m
[32m+[m[32m    mp3: { ext: 'mp3', label: 'MP3 audio' }[m
[32m+[m[32m  };[m
[32m+[m[32m  const meta = formatMeta[format];[m
[32m+[m[32m  if (!meta) return { ok: false, error: 'Unsupported format: ' + format };[m
[32m+[m
[32m+[m[32m  // Save dialog[m
[32m+[m[32m  const defaultName = (suggestedFilename || 'ep-recording-' + Date.now()) + '.' + meta.ext;[m
[32m+[m[32m  const saveResult = await dialog.showSaveDialog(mainWindow, {[m
[32m+[m[32m    title: 'Save converted recording',[m
[32m+[m[32m    defaultPath: path.join(app.getPath('downloads'), defaultName),[m
[32m+[m[32m    filters: [{ name: meta.label, extensions: [meta.ext] }][m
[32m+[m[32m  });[m
[32m+[m[32m  if (saveResult.canceled || !saveResult.filePath) {[m
[32m+[m[32m    return { ok: false, canceled: true };[m
[32m+[m[32m  }[m
[32m+[m[32m  const outputPath = saveResult.filePath;[m
[32m+[m
[32m+[m[32m  // Write the input bytes to a temp .webm file[m
[32m+[m[32m  const tmpInputPath = path.join(os.tmpdir(), 'ep-conv-input-' + Date.now() + '.webm');[m
[32m+[m[32m  try {[m
[32m+[m[32m    const buf = Buffer.from(sourceData);[m
[32m+[m[32m    fs.writeFileSync(tmpInputPath, buf);[m
[32m+[m[32m  } catch (e) {[m
[32m+[m[32m    return { ok: false, error: 'Failed to stage temp file: ' + e.message };[m
[32m+[m[32m  }[m
[32m+[m
[32m+[m[32m  // Decide encoder. Probe lazily if we haven't already.[m
[32m+[m[32m  let encoderList = _encoderCache;[m
[32m+[m[32m  if (!encoderList) {[m
[32m+[m[32m    encoderList = await new Promise(resolve => {[m
[32m+[m[32m      let buf = '';[m
[32m+[m[32m      const c = spawn(ffmpegPath, ['-hide_banner', '-encoders'], { windowsHide: true });[m
[32m+[m[32m      const t = setTimeout(() => { try { c.kill(); } catch (e) {} resolve(['libx264']); }, 4000);[m
[32m+[m[32m      c.stdout.on('data', d => { buf += d.toString(); });[m
[32m+[m[32m      c.stderr.on('data', d => { buf += d.toString(); });[m
[32m+[m[32m      c.on('close', () => {[m
[32m+[m[32m        clearTimeout(t);[m
[32m+[m[32m        const list = [];[m
[32m+[m[32m        if (/h264_nvenc/i.test(buf)) list.push('h264_nvenc');[m
[32m+[m[32m        if (/h264_qsv/i.test(buf))   list.push('h264_qsv');[m
[32m+[m[32m        if (/h264_amf/i.test(buf))   list.push('h264_amf');[m
[32m+[m[32m        if (/libx264/i.test(buf))    list.push('libx264');[m
[32m+[m[32m        if (!list.length) list.push('libx264');[m
[32m+[m[32m        _encoderCache = list;[m
[32m+[m[32m        resolve(list);[m
[32m+[m[32m      });[m
[32m+[m[32m      c.on('error', () => { clearTimeout(t); resolve(['libx264']); });[m
[32m+[m[32m    });[m
[32m+[m[32m  }[m
[32m+[m[32m  // For GIF/MP3 the encoder choice doesn't matter, but we still pick one[m
[32m+[m[32m  // for the args builder so the function signature stays uniform.[m
[32m+[m[32m  const primaryEncoder = encoderList[0];[m
[32m+[m
[32m+[m[32m  // Run the conversion. Returns a promise resolving to { ok, outputPath?, error? }.[m
[32m+[m[32m  function runConversion(encoderToUse) {[m
[32m+[m[32m    const ffArgs = buildFfmpegArgs(format, tmpInputPath, outputPath, {[m
[32m+[m[32m      quality: (opts && opts.quality) || 'fast',[m
[32m+[m[32m      encoder: encoderToUse[m
[32m+[m[32m    });[m
[32m+[m[32m    if (!ffArgs) return Promise.resolve({ ok: false, error: 'Could not build ffmpeg args' });[m
[32m+[m
[32m+[m[32m    return new Promise((resolve) => {[m
[32m+[m[32m      const child = spawn(ffmpegPath, ffArgs, { windowsHide: true });[m
[32m+[m[32m      let stderrBuf = '';[m
[32m+[m[32m      let totalDurationMs = null;[m
[32m+[m
[32m+[m[32m      // Notify renderer which encoder is in use (for the progress label)[m
[32m+[m[32m      try {[m
[32m+[m[32m        if (event && event.sender && !event.sender.isDestroyed()) {[m
[32m+[m[32m          event.sender.send('ep:convert-progress', { pct: 0, encoder: encoderToUse });[m
[32m+[m[32m        }[m
[32m+[m[32m      } catch (e) {}[m
[32m+[m
[32m+[m[32m      child.stderr.on('data', (chunk) => {[m
[32m+[m[32m        const s = chunk.toString();[m
[32m+[m[32m        stderrBuf += s;[m
[32m+[m[32m        // Cap stderr buffer so very long encodes don't balloon memory[m
[32m+[m[32m        if (stderrBuf.length > 16000) stderrBuf = stderrBuf.slice(-8000);[m
[32m+[m
[32m+[m[32m        // Parse total duration (first line containing "Duration: HH:MM:SS.MS")[m
[32m+[m[32m        if (totalDurationMs === null) {[m
[32m+[m[32m          const dm = s.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);[m
[32m+[m[32m          if (dm) {[m
[32m+[m[32m            totalDurationMs = (parseInt(dm[1], 10) * 3600 + parseInt(dm[2], 10) * 60 + parseFloat(dm[3])) * 1000;[m
[32m+[m[32m          }[m
[32m+[m[32m        }[m
[32m+[m[32m        // Parse current time so we can compute %[m
[32m+[m[32m        const tm = s.match(/time=\s*(\d+):(\d+):(\d+\.\d+)/);[m
[32m+[m[32m        if (tm && totalDurationMs && totalDurationMs > 0) {[m
[32m+[m[32m          const curMs = (parseInt(tm[1], 10) * 3600 + parseInt(tm[2], 10) * 60 + parseFloat(tm[3])) * 1000;[m
[32m+[m[32m          const pct = Math.max(0, Math.min(100, Math.round((curMs / totalDurationMs) * 100)));[m
[32m+[m[32m          try {[m
[32m+[m[32m            if (event && event.sender && !event.sender.isDestroyed()) {[m
[32m+[m[32m              event.sender.send('ep:convert-progress', { pct: pct, encoder: encoderToUse });[m
[32m+[m[32m            }[m
[32m+[m[32m          } catch (e) {}[m
[32m+[m[32m        }[m
[32m+[m[32m      });[m
[32m+[m
[32m+[m[32m      child.on('error', (err) => {[m
[32m+[m[32m        resolve({ ok: false, error: 'ffmpeg failed to start: ' + err.message });[m
[32m+[m[32m      });[m
[32m+[m
[32m+[m[32m      child.on('close', (code) => {[m
[32m+[m[32m        if (code === 0) {[m
[32m+[m[32m          resolve({ ok: true, outputPath: outputPath });[m
[32m+[m[32m        } else {[m
[32m+[m[32m          resolve({[m
[32m+[m[32m            ok: false,[m
[32m+[m[32m            error: 'ffmpeg exited with code ' + code,[m
[32m+[m[32m            log: stderrBuf.slice(-2000)[m
[32m+[m[32m          });[m
[32m+[m[32m        }[m
[32m+[m[32m      });[m
[32m+[m[32m    });[m
[32m+[m[32m  }[m
[32m+[m
[32m+[m[32m  // First attempt with the best available encoder[m
[32m+[m[32m  let result = await runConversion(primaryEncoder);[m
[32m+[m
[32m+[m[32m  // GPU encoders sometimes appear in the encoder list but fail at runtime[m
[32m+[m[32m  // (old drivers, missing license, locked GPU). Auto-fall-back to libx264.[m
[32m+[m[32m  const isGpu = primaryEncoder !== 'libx264';[m
[32m+[m[32m  const isVideoFormat = (format === 'mp4' || format === 'mov');[m
[32m+[m[32m  if (!result.ok && isGpu && isVideoFormat) {[m
[32m+[m[32m    try {[m
[32m+[m[32m      if (event && event.sender && !event.sender.isDestroyed()) {[m
[32m+[m[32m        event.sender.send('ep:convert-progress', { pct: 0, encoder: 'libx264', fellBack: true });[m
[32m+[m[32m      }[m
[32m+[m[32m    } catch (e) {}[m
[32m+[m[32m    result = await runConversion('libx264');[m
[32m+[m[32m  }[m
[32m+[m
[32m+[m[32m  // Clean up temp input[m
[32m+[m[32m  try { fs.unlinkSync(tmpInputPath); } catch (e) {}[m
[32m+[m
[32m+[m[32m  return result;[m
[32m+[m[32m});[m
[32m+[m
[32m+[m[32m// ---------------------------------------------------------[m
[32m+[m[32m// Auto-updater event wiring (silent unless update found)[m
[32m+[m[32m// ---------------------------------------------------------[m
[32m+[m[32mautoUpdater.on('update-downloaded', () => {[m
[32m+[m[32m  // Quietly install on quit; user doesn't need a popup mid-session.[m
[32m+[m[32m  // A future version could show a "Restart to update" toast.[m
[32m+[m[32m});[m
[32m+[m
[32m+[m[32mautoUpdater.on('error', (err) => {[m
[32m+[m[32m  console.warn('Auto-update error:', err && err.message ? err.message : err);[m
[32m+[m[32m});[m
