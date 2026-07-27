// EP Presenter — Electron main process
// =========================================================
// This file boots the Electron window, wires up auto-update, and implements
// the IPC handlers the renderer talks to:
//   ep:get-version              → app version string
//   ep:open-external            → open URL in default browser
//   ep:list-desktop-sources     → list screens/windows for screen-share picker
//   ep:show-in-folder           → reveal a file in OS file explorer
//   ep:probe-encoders           → detect available H.264 encoders (GPU first)
//   ep:convert-video            → spawn ffmpeg to transcode a recorded webm
//   ep:convert-progress         → (event, not handler) per-frame progress %
// =========================================================

const { app, BrowserWindow, Menu, shell, ipcMain, dialog, desktopCapturer, session } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const { autoUpdater } = require('electron-updater');

// Auto-update behavior:
// - autoDownload:false so we can ASK the user before downloading (otherwise
//   the download starts silently and the "Download / Later" dialog is meaningless).
// - autoInstallOnAppQuit:true so once downloaded (after user consent), it
//   installs cleanly when the app exits.
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

// ---------------------------------------------------------
// FORCE DISCRETE GPU (hybrid-graphics laptops)
// ---------------------------------------------------------
// Confirmed via WEBGL_debug_renderer_info that Electron was binding to the
// Intel UHD integrated GPU while an RTX 4060 sat idle. On hybrid laptops
// Windows hands Chromium the power-saving adapter by default. The iGPU shares
// system memory and cannot keep up with compositing a 2561x1601 capture into a
// 2560x1440 canvas at 30fps — which surfaced as recording lag, plus
// 'GPU state invalid after WaitForGetOffsetInRange' and the WGC
// 'ProcessFrame failed' flood. All three are the same overloaded adapter.
//
// force_high_performance_gpu asks Chromium for the discrete adapter directly,
// so this does not depend on NVIDIA Control Panel or Windows Graphics settings
// being configured on every machine the app is installed on.
app.commandLine.appendSwitch('force_high_performance_gpu');

// Verify after launch with, in DevTools:
//   (function(){var g=document.createElement('canvas').getContext('webgl');
//    var d=g.getExtension('WEBGL_debug_renderer_info');
//    console.log(g.getParameter(d.UNMASKED_RENDERER_WEBGL));})()
// It should now report NVIDIA rather than Intel.

// Hardware acceleration stays ON — disabling it was only ever a diagnostic and
// costs rendering performance everywhere in the app.
// app.disableHardwareAcceleration();

// WGC (Windows Graphics Capture) workaround — currently DISABLED.
// It was needed only while Electron was stuck on the Intel iGPU, which could
// not keep up and made WGC fail with 'ProcessFrame failed'. On the discrete
// GPU, WGC works and is more efficient than the DXGI fallback.
// If 'ProcessFrame failed' ever floods the terminal again, remove the // from
// the single line below. Keep it on ONE line — splitting it breaks the file.
// app.commandLine.appendSwitch('disable-features', 'AllowWgcScreenCapturer,AllowWgcWindowCapturer');

// ---------------------------------------------------------
// FFmpeg binary resolution
// ---------------------------------------------------------
// In dev: ffmpeg-static returns the path inside node_modules.
// In packaged app: the binary is unpacked from app.asar to app.asar.unpacked
// (configured via "asarUnpack" in package.json's "build" section).
// We rewrite the path at runtime so spawn() can find it.
function resolveFfmpegPath() {
  let p;
  try {
    p = require('ffmpeg-static');
  } catch (e) {
    return null;
  }
  if (!p) return null;
  // When packaged, ffmpeg-static returns a path containing "app.asar" — the
  // binary is actually at the corresponding "app.asar.unpacked" path.
  if (p.includes('app.asar') && !p.includes('app.asar.unpacked')) {
    p = p.replace('app.asar', 'app.asar.unpacked');
  }
  // Verify the file exists; if not, return null so the caller can show an error.
  try {
    if (!fs.existsSync(p)) return null;
  } catch (e) {
    return null;
  }
  return p;
}

// ---------------------------------------------------------
// Window
// ---------------------------------------------------------
let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 720,
    backgroundColor: '#0a0a0c',
    title: 'EP Presenter',
    icon: path.join(__dirname, 'build', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  // Screen-share picker support: when the renderer calls getDisplayMedia(),
  // Electron asks us how to handle it. useSystemPicker uses the OS picker on
  // newer Electron versions; if unavailable, the renderer's custom picker
  // (built on listDesktopSources) takes over.
  if (session && session.defaultSession && session.defaultSession.setDisplayMediaRequestHandler) {
    session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
      // Default: let the renderer's custom picker drive (it calls
      // listDesktopSources → getUserMedia with chromeMediaSourceId). So we
      // just deny the getDisplayMedia call here; the renderer falls back.
      callback(null);
    }, { useSystemPicker: false });
  }

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWindow.on('closed', () => { mainWindow = null; });

  // Build a minimal app menu (File, Edit, View, Present, Window, Help)
  buildAppMenu();
}

function buildAppMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    {
      label: 'File',
      submenu: [
        { role: isMac ? 'close' : 'quit' }
      ]
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    {
      label: 'Present',
      submenu: [
        { label: 'Start Presentation (F5)', click: () => mainWindow && mainWindow.webContents.executeJavaScript('typeof startPresent === "function" && startPresent()') }
      ]
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        { label: 'EP Presenter on the web', click: () => shell.openExternal('https://ikeigwe.com') },
        { label: 'Check for Updates', click: () => checkForUpdates(true) },
        { type: 'separator' },
        { label: 'About EP Presenter', click: () => showAboutDialog() }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// About dialog — shown when the user picks Help → About EP Presenter
function showAboutDialog() {
  const version = app.getVersion();
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'About EP Presenter',
    message: 'EP Presenter v' + version,
    detail: [
      'Professional presentation tool for educators,',
      'content creators, and trainers.',
      '',
      '© 2026 IKEIGWE AI Solutions Ltd',
      'Built by Ike Igwe — ikeigwe.com',
      'Originally designed for Eze Profit forex training'
    ].join('\n'),
    buttons: ['OK', 'Visit ikeigwe.com'],
    defaultId: 0,
    cancelId: 0
  }).then(result => {
    if (result.response === 1) shell.openExternal('https://ikeigwe.com');
  });
}

// ---------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------
app.whenReady().then(() => {
  createWindow();
  // Auto-update check on startup (silent if no update; dialog flow if update exists)
  setTimeout(() => checkForUpdates(false), 3000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ---------------------------------------------------------
// IPC: simple
// ---------------------------------------------------------
ipcMain.handle('ep:get-version', () => app.getVersion());

ipcMain.handle('ep:open-external', async (_event, url) => {
  if (!url || typeof url !== 'string') return false;
  try { await shell.openExternal(url); return true; } catch (e) { return false; }
});

// Returns array of { id, name, thumbnail (data URL), appIcon (data URL or null) }.
// Renderer uses this to build its custom screen-source picker.
ipcMain.handle('ep:list-desktop-sources', async () => {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 320, height: 180 },
      fetchWindowIcons: true
    });
    return sources.map(s => ({
      id: s.id,
      name: s.name,
      thumbnail: s.thumbnail ? s.thumbnail.toDataURL() : null,
      appIcon: s.appIcon ? s.appIcon.toDataURL() : null
    }));
  } catch (e) {
    console.error('listDesktopSources failed:', e);
    return [];
  }
});

ipcMain.handle('ep:show-in-folder', async (_event, filePath) => {
  if (!filePath || typeof filePath !== 'string') return false;
  try { shell.showItemInFolder(filePath); return true; } catch (e) { return false; }
});

// ---------------------------------------------------------
// IPC: save-webm — direct disk save without browser download
// ---------------------------------------------------------
// The renderer's previous WebM save used a temporary <a download> trick which
// caused Chromium to write the file to a `.tmp` first and then rename. When
// rename failed for any reason (large file, AV interception, locked path) the
// `.tmp` was left orphaned alongside the saved .webm. This handler replaces
// that flow: open a real Save dialog, write the bytes via fs.writeFileSync.
// No temp file pattern, no orphan files.
ipcMain.handle('ep:save-webm', async (_event, args) => {
  const { sourceData, suggestedFilename } = args || {};
  if (!sourceData) return { ok: false, error: 'No data provided' };

  const defaultName = (suggestedFilename || 'ep-recording-' + Date.now()) + '.webm';
  const saveResult = await dialog.showSaveDialog(mainWindow, {
    title: 'Save recording',
    defaultPath: path.join(app.getPath('downloads'), defaultName),
    filters: [{ name: 'WebM video', extensions: ['webm'] }]
  });
  if (saveResult.canceled || !saveResult.filePath) {
    return { ok: false, canceled: true };
  }
  try {
    const buf = Buffer.from(sourceData);
    fs.writeFileSync(saveResult.filePath, buf);
    return { ok: true, outputPath: saveResult.filePath };
  } catch (e) {
    return { ok: false, error: 'Failed to write file: ' + e.message };
  }
});

// ---------------------------------------------------------
// FFMPEG: encoder probe
// ---------------------------------------------------------
// Runs `ffmpeg -encoders` once per session, scans output for hardware H.264
// encoders, returns them in preference order: NVIDIA → Intel → AMD → CPU.
// The renderer caches the result.
let _encoderCache = null;

ipcMain.handle('ep:probe-encoders', async () => {
  if (_encoderCache) return _encoderCache;
  const ffmpegPath = resolveFfmpegPath();
  if (!ffmpegPath) {
    _encoderCache = ['libx264'];
    return _encoderCache;
  }
  return new Promise((resolve) => {
    let buf = '';
    const child = spawn(ffmpegPath, ['-hide_banner', '-encoders'], { windowsHide: true });
    const timer = setTimeout(() => {
      try { child.kill(); } catch (e) {}
      _encoderCache = ['libx264'];
      resolve(_encoderCache);
    }, 4000);
    child.stdout.on('data', d => { buf += d.toString(); });
    child.stderr.on('data', d => { buf += d.toString(); });
    child.on('close', () => {
      clearTimeout(timer);
      const list = [];
      // Order matters: prefer GPU encoders, fall back to CPU.
      if (/h264_nvenc/i.test(buf)) list.push('h264_nvenc');
      if (/h264_qsv/i.test(buf))   list.push('h264_qsv');
      if (/h264_amf/i.test(buf))   list.push('h264_amf');
      if (/libx264/i.test(buf))    list.push('libx264');
      if (list.length === 0) list.push('libx264'); // fallback
      _encoderCache = list;
      resolve(list);
    });
    child.on('error', () => {
      clearTimeout(timer);
      _encoderCache = ['libx264'];
      resolve(_encoderCache);
    });
  });
});

// ---------------------------------------------------------
// FFMPEG: build args per format / quality / encoder
// ---------------------------------------------------------
// Quality presets map to ffmpeg's speed/quality tradeoff:
//   fast     → ultrafast preset, higher CRF (bigger file, ~realtime on CPU)
//   balanced → medium preset, mid CRF (default)
//   high     → slow preset, low CRF (best quality, slowest)
// GPU encoders use their own preset names (NVENC: p1..p7, QSV/AMF: speed/quality).
function buildFfmpegArgs(format, inputPath, outputPath, opts) {
  opts = opts || {};
  const quality = opts.quality || 'fast';
  const encoder = opts.encoder || 'libx264';

  if (format === 'mp4' || format === 'mov') {
    const args = ['-y', '-i', inputPath];
    // Video codec selection
    if (encoder === 'h264_nvenc') {
      // NVENC presets: p1=fastest, p7=slowest. CQ is constant-quality (lower = better).
      const nvPreset = quality === 'fast' ? 'p2' : quality === 'balanced' ? 'p4' : 'p6';
      const nvCq     = quality === 'fast' ? '28' : quality === 'balanced' ? '23' : '20';
      args.push('-c:v', 'h264_nvenc', '-preset', nvPreset, '-cq', nvCq, '-rc', 'vbr');
    } else if (encoder === 'h264_qsv') {
      const qsvPreset = quality === 'fast' ? 'veryfast' : quality === 'balanced' ? 'medium' : 'slow';
      const qsvQ      = quality === 'fast' ? '28' : quality === 'balanced' ? '23' : '20';
      args.push('-c:v', 'h264_qsv', '-preset', qsvPreset, '-global_quality', qsvQ);
    } else if (encoder === 'h264_amf') {
      const amfQuality = quality === 'fast' ? 'speed' : quality === 'balanced' ? 'balanced' : 'quality';
      const amfQp      = quality === 'fast' ? '28' : quality === 'balanced' ? '23' : '20';
      args.push('-c:v', 'h264_amf', '-quality', amfQuality, '-rc', 'cqp', '-qp_i', amfQp, '-qp_p', amfQp);
    } else {
      // libx264 (CPU fallback). ultrafast is genuinely fast — fine for daily lesson exports.
      const x264Preset = quality === 'fast' ? 'ultrafast' : quality === 'balanced' ? 'medium' : 'slow';
      const x264Crf    = quality === 'fast' ? '24' : quality === 'balanced' ? '20' : '18';
      args.push('-c:v', 'libx264', '-preset', x264Preset, '-crf', x264Crf);
    }
    // Common video output flags
    args.push('-pix_fmt', 'yuv420p');
    if (format === 'mp4') args.push('-movflags', '+faststart');
    // Audio: AAC at decent bitrate
    args.push('-c:a', 'aac', '-b:a', '192k');
    args.push(outputPath);
    return args;
  }

  if (format === 'mp3') {
    return ['-y', '-i', inputPath, '-vn', '-c:a', 'libmp3lame', '-q:a', '2', outputPath];
  }

  if (format === 'gif') {
    // Single-pass palette filter. Quality preset trades fps + width for file size.
    const fpsMap   = { fast: 12, balanced: 15, high: 20 };
    const widthMap = { fast: 640, balanced: 800, high: 960 };
    const fps = fpsMap[quality] || 15;
    const w   = widthMap[quality] || 800;
    return [
      '-y', '-i', inputPath,
      '-vf', 'fps=' + fps + ',scale=' + w + ':-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse',
      '-loop', '0',
      outputPath
    ];
  }

  return null;
}

// ---------------------------------------------------------
// FFMPEG: convert-video handler
// ---------------------------------------------------------
// Renderer passes:
//   sourceData: ArrayBuffer of the recorded WebM
//   format: 'mp4' | 'mov' | 'gif' | 'mp3'
//   suggestedFilename: e.g. 'ep-recording-1735000000000'
//   opts: { quality: 'fast'|'balanced'|'high' }
// We:
//   1. Show a Save dialog so user picks output location
//   2. Write the WebM to a temp .webm file
//   3. Pick the best encoder (GPU > CPU)
//   4. Spawn ffmpeg, parse stderr for progress, stream % to renderer
//   5. On non-zero exit with a GPU encoder, retry with libx264 (fallback)
//   6. Resolve with { ok, outputPath } or { ok: false, error / canceled }
ipcMain.handle('ep:convert-video', async (event, args) => {
  const { sourceData, format, suggestedFilename, opts } = args || {};
  if (!sourceData || !format) return { ok: false, error: 'Missing arguments' };

  const ffmpegPath = resolveFfmpegPath();
  if (!ffmpegPath) {
    return { ok: false, error: 'FFmpeg binary not available. Reinstall the app.' };
  }

  const formatMeta = {
    mp4: { ext: 'mp4', label: 'MP4 video (H.264 + AAC)' },
    mov: { ext: 'mov', label: 'QuickTime MOV (H.264 + AAC)' },
    gif: { ext: 'gif', label: 'Animated GIF' },
    mp3: { ext: 'mp3', label: 'MP3 audio' }
  };
  const meta = formatMeta[format];
  if (!meta) return { ok: false, error: 'Unsupported format: ' + format };

  // Save dialog
  const defaultName = (suggestedFilename || 'ep-recording-' + Date.now()) + '.' + meta.ext;
  const saveResult = await dialog.showSaveDialog(mainWindow, {
    title: 'Save converted recording',
    defaultPath: path.join(app.getPath('downloads'), defaultName),
    filters: [{ name: meta.label, extensions: [meta.ext] }]
  });
  if (saveResult.canceled || !saveResult.filePath) {
    return { ok: false, canceled: true };
  }
  const outputPath = saveResult.filePath;

  // Write the input bytes to a temp .webm file
  const tmpInputPath = path.join(os.tmpdir(), 'ep-conv-input-' + Date.now() + '.webm');
  try {
    const buf = Buffer.from(sourceData);
    fs.writeFileSync(tmpInputPath, buf);
  } catch (e) {
    return { ok: false, error: 'Failed to stage temp file: ' + e.message };
  }

  // Decide encoder. Probe lazily if we haven't already.
  let encoderList = _encoderCache;
  if (!encoderList) {
    encoderList = await new Promise(resolve => {
      let buf = '';
      const c = spawn(ffmpegPath, ['-hide_banner', '-encoders'], { windowsHide: true });
      const t = setTimeout(() => { try { c.kill(); } catch (e) {} resolve(['libx264']); }, 4000);
      c.stdout.on('data', d => { buf += d.toString(); });
      c.stderr.on('data', d => { buf += d.toString(); });
      c.on('close', () => {
        clearTimeout(t);
        const list = [];
        if (/h264_nvenc/i.test(buf)) list.push('h264_nvenc');
        if (/h264_qsv/i.test(buf))   list.push('h264_qsv');
        if (/h264_amf/i.test(buf))   list.push('h264_amf');
        if (/libx264/i.test(buf))    list.push('libx264');
        if (!list.length) list.push('libx264');
        _encoderCache = list;
        resolve(list);
      });
      c.on('error', () => { clearTimeout(t); resolve(['libx264']); });
    });
  }
  // For GIF/MP3 the encoder choice doesn't matter, but we still pick one
  // for the args builder so the function signature stays uniform.
  const primaryEncoder = encoderList[0];

  // Run the conversion. Returns a promise resolving to { ok, outputPath?, error? }.
  function runConversion(encoderToUse) {
    const ffArgs = buildFfmpegArgs(format, tmpInputPath, outputPath, {
      quality: (opts && opts.quality) || 'fast',
      encoder: encoderToUse
    });
    if (!ffArgs) return Promise.resolve({ ok: false, error: 'Could not build ffmpeg args' });

    return new Promise((resolve) => {
      const child = spawn(ffmpegPath, ffArgs, { windowsHide: true });
      let stderrBuf = '';
      let totalDurationMs = null;

      // Notify renderer which encoder is in use (for the progress label)
      try {
        if (event && event.sender && !event.sender.isDestroyed()) {
          event.sender.send('ep:convert-progress', { pct: 0, encoder: encoderToUse });
        }
      } catch (e) {}

      child.stderr.on('data', (chunk) => {
        const s = chunk.toString();
        stderrBuf += s;
        // Cap stderr buffer so very long encodes don't balloon memory
        if (stderrBuf.length > 16000) stderrBuf = stderrBuf.slice(-8000);

        // Parse total duration (first line containing "Duration: HH:MM:SS.MS")
        if (totalDurationMs === null) {
          const dm = s.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
          if (dm) {
            totalDurationMs = (parseInt(dm[1], 10) * 3600 + parseInt(dm[2], 10) * 60 + parseFloat(dm[3])) * 1000;
          }
        }
        // Parse current time so we can compute %
        const tm = s.match(/time=\s*(\d+):(\d+):(\d+\.\d+)/);
        if (tm && totalDurationMs && totalDurationMs > 0) {
          const curMs = (parseInt(tm[1], 10) * 3600 + parseInt(tm[2], 10) * 60 + parseFloat(tm[3])) * 1000;
          const pct = Math.max(0, Math.min(100, Math.round((curMs / totalDurationMs) * 100)));
          try {
            if (event && event.sender && !event.sender.isDestroyed()) {
              event.sender.send('ep:convert-progress', { pct: pct, encoder: encoderToUse });
            }
          } catch (e) {}
        }
      });

      child.on('error', (err) => {
        resolve({ ok: false, error: 'ffmpeg failed to start: ' + err.message });
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve({ ok: true, outputPath: outputPath });
        } else {
          resolve({
            ok: false,
            error: 'ffmpeg exited with code ' + code,
            log: stderrBuf.slice(-2000)
          });
        }
      });
    });
  }

  // First attempt with the best available encoder
  let result = await runConversion(primaryEncoder);

  // GPU encoders sometimes appear in the encoder list but fail at runtime
  // (old drivers, missing license, locked GPU). Auto-fall-back to libx264.
  const isGpu = primaryEncoder !== 'libx264';
  const isVideoFormat = (format === 'mp4' || format === 'mov');
  if (!result.ok && isGpu && isVideoFormat) {
    try {
      if (event && event.sender && !event.sender.isDestroyed()) {
        event.sender.send('ep:convert-progress', { pct: 0, encoder: 'libx264', fellBack: true });
      }
    } catch (e) {}
    result = await runConversion('libx264');
  }

  // Clean up temp input
  try { fs.unlinkSync(tmpInputPath); } catch (e) {}

  return result;
});

// ---------------------------------------------------------
// Auto-updater wrapper + dialog flow
// ---------------------------------------------------------
// User-friendly update flow (replaces silent checkForUpdatesAndNotify).
//
// When an update is found:
//   1. Dialog: "EP Presenter X.Y.Z is available — Download / Later"
//   2. If user picks Download, autoUpdater.downloadUpdate() runs
//   3. Dialog: "Update downloaded — Restart now / Later"
//   4. Either restart immediately or it installs on next quit
//
// Called from two places:
//   - 3 seconds after launch (userInitiated=false — silent if no update)
//   - Help → Check for Updates (userInitiated=true — shows "up to date" dialog)
function checkForUpdates(userInitiated) {
  // Auto-updater only works in packaged builds (it needs a signed app and
  // the latest.yml metadata next to the .exe). In `npm start` dev mode,
  // skip silently — but tell the user if they explicitly checked.
  if (!app.isPackaged) {
    if (userInitiated && mainWindow) {
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
    if (userInitiated && mainWindow) {
      dialog.showMessageBox(mainWindow, {
        type: 'error',
        message: 'Update check failed',
        detail: String(err && err.message || err)
      });
    }
  });

  // For user-initiated checks: if no update, show "up to date" dialog.
  // The .once() registration is fresh per check — won't fire on later checks.
  if (userInitiated) {
    autoUpdater.once('update-not-available', () => {
      if (mainWindow) {
        dialog.showMessageBox(mainWindow, {
          type: 'info',
          message: 'You are up to date',
          detail: 'EP Presenter ' + app.getVersion() + ' is the latest version.'
        });
      }
    });
  }
}

// Update is AVAILABLE on the server (not yet downloaded). Ask the user
// before downloading so we don't eat their bandwidth without consent.
autoUpdater.on('update-available', (info) => {
  if (!mainWindow) return;
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

// Update has finished downloading. Ask whether to restart now or later.
// If they pick Later, autoInstallOnAppQuit:true means it'll install on next quit.
autoUpdater.on('update-downloaded', () => {
  if (!mainWindow) return;
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
  console.warn('Auto-update error:', err && err.message ? err.message : err);
});
