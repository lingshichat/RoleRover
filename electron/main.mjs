import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, ipcMain, safeStorage, shell, protocol } from 'electron';
import electronUpdater from 'electron-updater';
import { createHandler } from 'next-electron-rsc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const WINDOW_STATE_FILE = 'window-state.json';
const SECURE_SETTINGS_FILE = 'secure-settings.json';
const { autoUpdater } = electronUpdater;

let mainWindow = null;
let stopIntercept = null;

const isDevelopment = !app.isPackaged;

function ensureDirectory(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function getJsonFilePath(fileName) {
  const userDataDir = app.getPath('userData');
  ensureDirectory(userDataDir);
  return path.join(userDataDir, fileName);
}

function readJsonFile(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) {
      return fallback;
    }

    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJsonFile(filePath, value) {
  ensureDirectory(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
}

function getWindowState() {
  const defaultState = { width: 1440, height: 960 };
  return readJsonFile(getJsonFilePath(WINDOW_STATE_FILE), defaultState);
}

function saveWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  const bounds = mainWindow.getBounds();
  writeJsonFile(getJsonFilePath(WINDOW_STATE_FILE), bounds);
}

function getDesktopDataDirectory() {
  const dataDir = path.join(app.getPath('userData'), 'data');
  ensureDirectory(dataDir);
  return dataDir;
}

function getDatabasePath() {
  return path.join(getDesktopDataDirectory(), 'jade.db');
}

function getSecureSettingsStorePath() {
  return getJsonFilePath(SECURE_SETTINGS_FILE);
}

function readSecureSettingsStore() {
  return readJsonFile(getSecureSettingsStorePath(), {});
}

function encryptValue(value) {
  if (!value) {
    return null;
  }

  if (safeStorage.isEncryptionAvailable()) {
    return {
      encrypted: true,
      value: safeStorage.encryptString(value).toString('base64'),
    };
  }

  return {
    encrypted: false,
    value: Buffer.from(value, 'utf8').toString('base64'),
  };
}

function decryptValue(entry) {
  if (!entry?.value) {
    return null;
  }

  const buffer = Buffer.from(entry.value, 'base64');

  if (entry.encrypted) {
    try {
      return safeStorage.decryptString(buffer);
    } catch {
      return null;
    }
  }

  return buffer.toString('utf8');
}

function registerDesktopIpc() {
  ipcMain.handle('desktop:get-app-info', () => ({
    name: app.getName(),
    version: app.getVersion(),
    isPackaged: app.isPackaged,
  }));

  ipcMain.handle('desktop:secure-setting:get', (_event, key) => {
    const store = readSecureSettingsStore();
    return decryptValue(store[key]);
  });

  ipcMain.handle('desktop:secure-setting:set', (_event, key, value) => {
    const store = readSecureSettingsStore();
    if (!value) {
      delete store[key];
    } else {
      store[key] = encryptValue(value);
    }
    writeJsonFile(getSecureSettingsStorePath(), store);
  });

  ipcMain.handle('desktop:secure-setting:delete', (_event, key) => {
    const store = readSecureSettingsStore();
    delete store[key];
    writeJsonFile(getSecureSettingsStorePath(), store);
  });
}

function buildNextHandler() {
  const standaloneDir = path.join(ROOT_DIR, '.next', 'standalone');

  return createHandler({
    dev: isDevelopment,
    dir: standaloneDir,
    protocol,
    debug: isDevelopment,
    turbo: true,
  });
}

const nextHandler = buildNextHandler();

function maybeCheckForUpdates() {
  if (!app.isPackaged) {
    return;
  }

  if (!process.env.ROLEROVER_ENABLE_UPDATER) {
    return;
  }

  autoUpdater.checkForUpdatesAndNotify().catch((error) => {
    console.error('[desktop] Failed to check for updates:', error);
  });
}

async function createMainWindow() {
  const { width, height, x, y } = getWindowState();

  mainWindow = new BrowserWindow({
    width,
    height,
    x,
    y,
    minWidth: 1200,
    minHeight: 760,
    show: false,
    backgroundColor: '#fafafa',
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('close', saveWindowState);
  mainWindow.on('resize', saveWindowState);
  mainWindow.on('move', saveWindowState);
  mainWindow.on('closed', () => {
    mainWindow = null;
    if (typeof stopIntercept === 'function') {
      stopIntercept();
      stopIntercept = null;
    }
  });

  stopIntercept = await nextHandler.createInterceptor({
    session: mainWindow.webContents.session,
  });

  await mainWindow.loadURL(`${nextHandler.localhostUrl}/zh/dashboard`);

  if (isDevelopment) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

function bootstrapDesktopEnvironment() {
  process.env.NEXT_PUBLIC_AUTH_ENABLED = 'false';
  process.env.SQLITE_PATH = process.env.SQLITE_PATH || getDatabasePath();
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

app.setAppUserModelId('com.rolerover.desktop');

app.on('second-instance', () => {
  if (!mainWindow) {
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.focus();
});

app.whenReady().then(async () => {
  bootstrapDesktopEnvironment();
  registerDesktopIpc();
  await createMainWindow();
  maybeCheckForUpdates();
});

app.on('activate', async () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    await createMainWindow();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
