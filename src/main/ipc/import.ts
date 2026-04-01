import fs from 'fs';
import { ipcMain, dialog, BrowserWindow } from 'electron';
import { importFiles } from '../services/import-service';
import { loadSettings } from '../services/settings-service';

function getHeroNames() {
  const settings = loadSettings();
  const heroNames: Partial<Record<'winamax' | 'pokerstars' | 'pmu', string>> = {};
  if (settings.heroNames.winamax) heroNames.winamax = settings.heroNames.winamax;
  if (settings.heroNames.pokerstars) heroNames.pokerstars = settings.heroNames.pokerstars;
  if (settings.heroNames.pmu) heroNames.pmu = settings.heroNames.pmu;
  return Object.keys(heroNames).length > 0 ? heroNames : undefined;
}

function dirHasFiles(dirPath: string): boolean {
  try {
    if (!fs.existsSync(dirPath)) return false;
    const entries = fs.readdirSync(dirPath, { recursive: true }) as string[];
    return entries.some((e) => {
      const ext = e.split('.').pop()?.toLowerCase();
      return ext === 'txt' || ext === 'xml';
    });
  } catch {
    return false;
  }
}

export function registerImportHandlers(): void {
  ipcMain.handle('import:select-files', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Hand History', extensions: ['txt', 'xml'] },
      ],
    });
    return result.canceled ? [] : result.filePaths;
  });

  ipcMain.handle('import:select-folder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('import:files', async (_event, filePaths: string[]) => {
    const win = BrowserWindow.getFocusedWindow();
    const heroNames = getHeroNames();

    const result = await importFiles(filePaths, heroNames, (progress) => {
      win?.webContents.send('import:progress', progress);
    });

    return {
      imported: result.handsImported,
      filesProcessed: result.filesProcessed,
      tournamentsImported: result.tournamentsImported,
      summariesImported: result.summariesImported,
      errors: result.errors,
    };
  });

  // Import from configured HH folders in settings
  ipcMain.handle('import:from-settings', async (_event) => {
    const win = BrowserWindow.getFocusedWindow();
    const settings = loadSettings();
    const heroNames = getHeroNames();

    const folders: string[] = [];
    for (const room of ['winamax', 'pokerstars', 'pmu'] as const) {
      let folder = settings.hhFolders[room];
      if (folder) {
        // Expand ~ to home dir
        let expanded = folder.replace(/^~/, process.env.HOME || '');
        // Fallback: PokerStars → PokerStarsFR (French client)
        if (room === 'pokerstars' && !dirHasFiles(expanded)) {
          const frExpanded = expanded.replace('/PokerStars/', '/PokerStarsFR/');
          if (frExpanded !== expanded && dirHasFiles(frExpanded)) {
            expanded = frExpanded;
          }
        }
        folders.push(expanded);
      }
    }

    if (folders.length === 0) {
      return {
        imported: 0,
        filesProcessed: 0,
        tournamentsImported: 0,
        summariesImported: 0,
        errors: ['Aucun dossier HH configuré. Allez dans Settings > Comptes.'],
      };
    }

    const result = await importFiles(folders, heroNames, (progress) => {
      win?.webContents.send('import:progress', progress);
    });

    return {
      imported: result.handsImported,
      filesProcessed: result.filesProcessed,
      tournamentsImported: result.tournamentsImported,
      summariesImported: result.summariesImported,
      errors: result.errors,
    };
  });
}
