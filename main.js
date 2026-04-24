// =========================================================
// EP Presenter — Electron main process
// =========================================================
// This file runs in Node.js context (not the browser renderer).
// It creates the browser window, defines the application menu,
// and wires up auto-update checking.
// =========================================================

const { app, BrowserWindow, Menu, shell, dialog, ipcMain, session, desktopCapturer } = require('electron');
const path = require('path');

// Auto-update support (loaded lazily so dev mode doesn't crash without a signed build)
let autoUpdater = null;
try {
  autoUpdater = require('electron-updater').autoUpdater;
  autoUpdater.autoDownload = false;   // Ask user before downloading
  autoUpdater.autoInstallOnAppQuit = true;
} catch (e) {
  console.warn('electron-updater not available; auto-updates disabled:', e.message);
}

// Keep a global reference to the main window so it isn't garbage collected
let mainWindow = null;
// Optional presenter view window (opened from within the app via window.open)
let presenterWindow = null;

const isDev = !app.isPackaged;

// =========================================================
// WINDOW CREATION
// =========================================================
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'EP Presenter',
    backgroundColor: '#1a1a1a',
    icon: path.join(__dirname, 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    show: false,   // don't show until ready-to-show fires (prevents white flash)
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
      // Features required by EP Presenter's web stack:
      webviewTag: false,
      spellcheck: true
    }
  });

  // Load the app's HTML
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Show once content is ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (isDev) mainWindow.webContents.openDevTools({ mode: 'detach' });
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Intercept window.open calls — route to the presenter window handler
  mainWindow.webContents.setWindowOpenHandler(({ url, features, frameName }) => {
    // The in-app "Presenter View" feature opens a 2nd window via window.open('','ep-presenter-view',...)
    if (frameName === 'ep-presenter-view') {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 1100,
          height: 720,
          title: 'EP Presenter — Presenter View',
          backgroundColor: '#0a0a0c',
          icon: path.join(__dirname, 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
          webPreferences: {
            contextIsolation: true,
            nodeIntegration: false
          }
        }
      };
    }
    // External http/https links → open in default browser, not the app
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  // External links clicked inside the app → default browser
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);
    const currentUrl = new URL(mainWindow.webContents.getURL());
    if (parsedUrl.origin !== currentUrl.origin && !parsedUrl.protocol.startsWith('file')) {
      event.preventDefault();
      shell.openExternal(navigationUrl);
    }
  });
}

// =========================================================
// APPLICATION MENU — EP-branded custom menu
// =========================================================
function buildAppMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New Deck',
          accelerator: 'CmdOrCtrl+N',
          click: () => mainWindow && mainWindow.webContents.send('ep:new-deck')
        },
        { type: 'separator' },
        {
          label: 'Open…',
          accelerator: 'CmdOrCtrl+O',
          click: () => mainWindow && mainWindow.webContents.send('ep:trigger-open')
        },
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          click: () => mainWindow && mainWindow.webContents.send('ep:trigger-save')
        },
        { type: 'separator' },
        {
          label: 'Import PowerPoint (.pptx)…',
          click: () => mainWindow && mainWindow.webContents.send('ep:trigger-import-pptx')
        },
        {
          label: 'Export PDF',
          click: () => mainWindow && mainWindow.webContents.send('ep:trigger-export-pdf')
        },
        {
          label: 'Export PowerPoint (.pptx)',
          click: () => mainWindow && mainWindow.webContents.send('ep:trigger-export-pptx')
        },
        { type: 'separator' },
        { role: 'quit', label: 'Quit EP Presenter' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools', accelerator: 'CmdOrCtrl+Shift+I' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Present',
      submenu: [
        {
          label: 'Start Presentation',
          accelerator: 'F5',
          click: () => mainWindow && mainWindow.webContents.send('ep:start-present')
        },
        {
          label: 'Open Presenter View',
          accelerator: 'F6',
          click: () => mainWindow && mainWindow.webContents.send('ep:open-presenter-view')
        }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { role: 'close' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Visit ikeigwe.com',
          click: () => shell.openExternal('https://ikeigwe.com')
        },
        {
          label: 'The Trading Edge',
          click: () => shell.openExternal('https://ikeigwe.com')
        },
        { type: 'separator' },
        {
          label: 'Check for Updates…',
          click: () => checkForUpdates(true)
        },
        { type: 'separator' },
        {
          label: 'About EP Presenter',
          click: () => showAboutDialog()
        }
      ]
    }
  ];
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function showAboutDialog() {
  const version = app.getVersion();
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'About EP Presenter',
    message: 'EP Presenter',
    detail: [
      'Version ' + version,
      '',
      'Eze Profit — forex trading education presentation tool.',
      'Built by Ike Igwe for traders who teach.',
      '',
      'https://ikeigwe.com'
    ].join('\n'),
    buttons: ['OK', 'Visit ikeigwe.com'],
    defaultId: 0,
    cancelId: 0
  }).then(result => {
    if (result.response === 1) shell.openExternal('https://ikeigwe.com');
  });
}

// =========================================================
// AUTO-UPDATE
// =========================================================
function checkForUpdates(userInitiated = false) {
  if (!autoUpdater) {
    if (userInitiated) {
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        message: 'Auto-updates unavailable',
        detail: 'electron-updater is not loaded. Check the console for details.'
      });
    }
    return;
  }
  if (isDev) {
    if (userInitiated) {
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        message: 'Development build',
        detail: 'Auto-updates only run in the packaged app.'
      });
    }
    return;
  }

  autoUpdater.checkForUpdates().catch(err => {
    console.error('Update check failed:', err);
    if (userInitiated) {
      dialog.showMessageBox(mainWindow, {
        type: 'error',
        message: 'Update check failed',
        detail: String(err && err.message || err)
      });
    }
  });

  if (userInitiated) {
    autoUpdater.once('update-not-available', () => {
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        message: 'You are up to date',
        detail: 'EP Presenter ' + app.getVersion() + ' is the latest version.'
      });
    });
  }
}

if (autoUpdater) {
  autoUpdater.on('update-available', (info) => {
    dialog.showMessageBox(mainWindow, {
      type: 'question',
      buttons: ['Download', 'Later'],
      defaultId: 0,
      cancelId: 1,
      title: 'Update available',
      message: 'EP Presenter ' + info.version + ' is available',
      detail: 'Current version: ' + app.getVersion() + '\nDownload now?'
    }).then(result => {
      if (result.response === 0) autoUpdater.downloadUpdate();
    });
  });

  autoUpdater.on('update-downloaded', () => {
    dialog.showMessageBox(mainWindow, {
      type: 'question',
      buttons: ['Restart now', 'Later'],
      defaultId: 0,
      cancelId: 1,
      title: 'Update ready',
      message: 'Update downloaded. Restart to install?'
    }).then(result => {
      if (result.response === 0) autoUpdater.quitAndInstall();
    });
  });

  autoUpdater.on('error', (err) => {
    console.error('Auto-updater error:', err);
  });
}

// =========================================================
// APP LIFECYCLE
// =========================================================
app.whenReady().then(() => {
  // Standard browser permissions — media (camera/mic) and display-media (screen share)
  // must be allowed for EP Presenter's webcam overlay + screen share element to work.
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowed = [
      'media',           // camera + mic
      'display-capture', // screen share (getDisplayMedia)
      'clipboard-read',
      'clipboard-sanitized-write',
      'fullscreen'
    ];
    callback(allowed.includes(permission));
  });

  // No setDisplayMediaRequestHandler — this makes getDisplayMedia() reject in the
  // packaged build, which triggers our renderer's fallback to the custom picker
  // built on top of desktopCapturer. We do this because:
  // 1. Windows 11's native picker (useSystemPicker: true) had inconsistent behavior
  // 2. Our custom picker gives us full UI control, branding, refresh button, etc.
  // 3. Predictable behavior across Windows 10 and 11

  buildAppMenu();
  createMainWindow();

  // Check for updates 3s after launch (non-blocking, silent if no update)
  setTimeout(() => checkForUpdates(false), 3000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// =========================================================
// RENDERER ↔ MAIN IPC
// =========================================================
// Keyboard shortcuts and menu items in the renderer can ask main to do things.
ipcMain.handle('ep:get-version', () => app.getVersion());
ipcMain.handle('ep:open-external', (_event, url) => {
  if (typeof url === 'string' && (url.startsWith('http://') || url.startsWith('https://'))) {
    shell.openExternal(url);
    return true;
  }
  return false;
});

// List the user's available screens and windows so the renderer can
// show a custom picker UI. Thumbnails are returned as data URLs.
ipcMain.handle('ep:list-desktop-sources', async () => {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 320, height: 180 },
      fetchWindowIcons: true
    });
    return sources.map((s) => ({
      id: s.id,
      name: s.name,
      display_id: s.display_id,
      thumbnail: s.thumbnail ? s.thumbnail.toDataURL() : null,
      appIcon: s.appIcon ? s.appIcon.toDataURL() : null
    }));
  } catch (err) {
    console.error('list-desktop-sources failed:', err);
    return [];
  }
});
