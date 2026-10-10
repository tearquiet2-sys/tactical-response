// Tactical Response - Electron entry point
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 1100,
    minHeight: 650,
    backgroundColor: '#0b0e12',
    title: 'Tactical Response',
    icon: path.join(__dirname, 'build', 'icon.ico'),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      backgroundThrottling: false
    }
  });
  win.setMenu(null);
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
  win.once('ready-to-show', () => { win.maximize(); win.show(); });
  // Demo mode: TR_AUTOPLAY=<missionId> lets the built-in autopilot play the campaign live
  if (process.env.TR_AUTOPLAY) {
    win.webContents.once('did-finish-load', () => {
      const m = parseInt(process.env.TR_AUTOPLAY, 10) || 1;
      win.webContents.executeJavaScript(`
        (async () => {
          await new Promise(r => setTimeout(r, 2500));
          const s = document.createElement('script'); s.src = 'js/autoplay.js'; document.body.appendChild(s);
          await new Promise(r => setTimeout(r, 400));
          TR.Save.data.settings.hints = false;
          AP.campaign(${m});
        })(); 1`);
    });
  }
  // Self-test: TR_SNAPSHOT=<file.png> captures the window after a few seconds and quits
  if (process.env.TR_SNAPSHOT) {
    win.webContents.on('console-message', (_e, level, msg) => { if (level >= 2) console.error('[renderer]', msg); });
    setTimeout(async () => {
      if (process.env.TR_SNAPSHOT_JS) await win.webContents.executeJavaScript(process.env.TR_SNAPSHOT_JS).catch((e) => console.error(e));
      setTimeout(async () => {
        const img = await win.webContents.capturePage();
        require('fs').writeFileSync(process.env.TR_SNAPSHOT, img.toPNG());
        app.quit();
      }, 3500);
    }, 2500);
  }
}

const fs = require('fs');
const saveFile = (name) => path.join(app.getPath('userData'), 'saves', String(name).replace(/[^a-z0-9_-]/gi, '') + '.json');
ipcMain.on('save:read', (e, name) => {
  try { e.returnValue = fs.readFileSync(saveFile(name), 'utf8'); } catch (err) { e.returnValue = null; }
});
ipcMain.on('save:write', (e, name, text) => {
  try {
    const f = saveFile(name);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    if (text == null) { try { fs.unlinkSync(f); } catch (err) { /* none */ } e.returnValue = true; return; }
    fs.writeFileSync(f + '.tmp', text, 'utf8');
    fs.renameSync(f + '.tmp', f);
    e.returnValue = true;
  } catch (err) { e.returnValue = false; }
});
ipcMain.on('app:quit', () => app.quit());
ipcMain.on('app:fullscreen', (_e, on) => { if (win) win.setFullScreen(!!on); });

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
