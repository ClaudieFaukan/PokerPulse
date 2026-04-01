import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import { initDatabase } from './database/schema';
import { registerImportHandlers } from './ipc/import';
import { registerStatsHandlers } from './ipc/stats';
import { registerHandsHandlers } from './ipc/hands';
import { registerSettingsHandlers } from './ipc/settings';
import { registerCoachHandlers } from './ipc/coach';
import { registerPlayersHandlers } from './ipc/players';
import { registerAnalysisExportHandlers } from './ipc/analysis-export';

let mainWindow: BrowserWindow | null = null;

const isDev = !app.isPackaged;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    title: 'PokerPulse',
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#1a1a2e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  initDatabase();
  registerImportHandlers();
  registerStatsHandlers();
  registerHandsHandlers();
  registerSettingsHandlers();
  registerCoachHandlers();
  registerPlayersHandlers();
  registerAnalysisExportHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
