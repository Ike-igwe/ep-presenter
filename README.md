# EP Presenter — Electron App

Desktop app wrapper for EP Presenter (forex trading presentation tool). Built with Electron + electron-builder.

---

## Prerequisites

- **Node.js 18+** and **npm** installed ([nodejs.org](https://nodejs.org))
- **Windows 10/11** for `.exe` building (Electron can build for Windows from any OS but it's easiest on Windows itself)

---

## First-time setup

```bash
cd ep-presenter-electron
npm install
```

This downloads Electron (~200 MB) and electron-builder. Takes 2–5 minutes depending on connection.

---

## Running in development

```bash
npm start
```

Opens EP Presenter in an Electron window. DevTools open automatically in dev mode (press `Ctrl+Shift+I` to toggle).

---

## Building installers

### Both formats (NSIS installer + portable)
```bash
npm run build:win
```

### Installer only
```bash
npm run build:win-installer
```

### Portable only
```bash
npm run build:win-portable
```

Output goes to `./dist/`:
- **`EP-Presenter-Setup-1.0.0.exe`** — NSIS installer with Start Menu shortcut, desktop shortcut, uninstaller
- **`EP-Presenter-Portable-1.0.0.exe`** — single-file portable; double-click to run, no install needed

### What to expect when users run the unsigned build

Because the `.exe` is not code-signed, Windows SmartScreen will show a blue "Windows protected your PC" warning on first run. Users must click **More info → Run anyway**.

To fix this properly, buy a code-signing certificate (~$100/year from DigiCert, Sectigo, etc.) and configure `win.certificateFile` in `package.json`. Not required for personal use or testing.

---

## Publishing a release (with auto-updates)

### 1. Create a GitHub repo

If you don't already have one:
```bash
# In the ep-presenter-electron folder
git init
git add .
git commit -m "Initial Electron build"
gh repo create ep-presenter --private --source=. --push
```

### 2. Update `package.json`

Replace `YOUR_GITHUB_USERNAME` in the `build.publish` section with your actual GitHub username.

### 3. Set your GitHub token

electron-builder needs a token to upload to GitHub Releases:

```bash
# Windows (PowerShell)
$env:GH_TOKEN="ghp_yourTokenHere"

# Or set it permanently in Windows:
# System Properties → Environment Variables → User variables → New:
#   GH_TOKEN = ghp_yourTokenHere
```

Create a token at [github.com/settings/tokens](https://github.com/settings/tokens) with `repo` scope.

### 4. Bump version and release

```bash
# Update version in package.json (e.g. 1.0.0 → 1.0.1)
npm run release
```

This builds, then uploads the `.exe` files + a `latest.yml` manifest to a GitHub release. The running app will detect the new version on next launch and prompt to update.

---

## Folder structure

```
ep-presenter-electron/
├── package.json          Build config + scripts
├── main.js               Electron main process (window, menu, updates)
├── preload.js            Bridge between menu and renderer
├── renderer/
│   └── index.html        The EP Presenter app itself
├── build/
│   ├── icon.ico          Windows icon (placeholder — replace with your own)
│   └── icon.png          PNG fallback (256×256)
└── dist/                 Build output (created by build scripts)
```

---

## Replacing the icon

The included `icon.ico` is a placeholder with the EP brand. For production:

1. Design a 512×512 PNG in your brand colors
2. Convert to `.ico` at [convertio.co/png-ico](https://convertio.co/png-ico) (pick sizes 16, 24, 32, 48, 64, 128, 256)
3. Replace `build/icon.ico` and `build/icon.png`
4. Rebuild

---

## Troubleshooting

**"electron-builder not found"** → Run `npm install` first.

**Build fails with "code signing"** → You set a certificate path that doesn't exist. Unset it in `package.json`.

**App won't launch after install** → Check Event Viewer. Most likely missing VC++ redistributables — install from [microsoft.com](https://aka.ms/vs/17/release/vc_redist.x64.exe).

**TradingView widgets not loading** → Should work out of the box since the built app serves over `file://` but Electron treats it specially. If they still don't appear, check DevTools console for errors.

**Mic/camera permission loops** → Electron's permission handler in `main.js` auto-approves media requests. If you want stricter behavior, edit the `setPermissionRequestHandler` in `main.js`.

---

## Keyboard shortcuts (provided by the menu)

- `Ctrl+N` — New deck
- `Ctrl+O` — Open .json deck
- `Ctrl+S` — Save deck
- `F5` — Start presentation
- `F6` — Open Presenter View
- `Ctrl+Shift+I` — Toggle DevTools
- `F11` — Toggle fullscreen
- (Plus all the in-app shortcuts: `V T P H E C L W R` for tools + navigation)

---

## License

UNLICENSED — Ike Igwe / Eze Profit. Personal use + internal distribution only.
