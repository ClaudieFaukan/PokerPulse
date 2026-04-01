import { ipcMain, dialog } from 'electron';
import { loadSettings, saveSettings } from '../services/settings-service';
import { getDatabase } from '../database/schema';

export function registerSettingsHandlers(): void {
  ipcMain.handle('settings:get', async () => {
    return loadSettings();
  });

  ipcMain.handle('settings:save', async (_event, settings: any) => {
    return saveSettings(settings);
  });

  ipcMain.handle('settings:reset-db', async () => {
    const { response } = await dialog.showMessageBox({
      type: 'warning',
      buttons: ['Annuler', 'Réinitialiser'],
      defaultId: 0,
      cancelId: 0,
      title: 'Réinitialiser la base de données',
      message: 'Êtes-vous sûr de vouloir supprimer toutes les données ?',
      detail: 'Tous les tournois, mains et statistiques seront supprimés. Cette action est irréversible.',
    });

    if (response === 1) {
      const db = getDatabase();
      db.exec(`
        DELETE FROM actions;
        DELETE FROM hands;
        DELETE FROM player_stats_cache;
        DELETE FROM tournaments;
        DELETE FROM players;
      `);
      return { success: true };
    }

    return { success: false };
  });
}
