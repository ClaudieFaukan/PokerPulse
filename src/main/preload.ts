import { contextBridge, ipcRenderer } from 'electron';

const api = {
  // Import
  importFiles: (filePaths: string[]) => ipcRenderer.invoke('import:files', filePaths),
  importFromSettings: () => ipcRenderer.invoke('import:from-settings'),
  selectFiles: () => ipcRenderer.invoke('import:select-files'),
  selectFolder: () => ipcRenderer.invoke('import:select-folder'),
  onImportProgress: (callback: (progress: { current: number; total: number; errors: string[] }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: any) => callback(progress);
    ipcRenderer.on('import:progress', handler);
    return () => ipcRenderer.removeListener('import:progress', handler);
  },

  // Stats
  getStats: (filters: any) => ipcRenderer.invoke('stats:get', filters),
  getDashboardData: (filters: any) => ipcRenderer.invoke('stats:dashboard', filters),

  // Hands
  getHands: (filters: any) => ipcRenderer.invoke('hands:list', filters),
  getHand: (id: number) => ipcRenderer.invoke('hands:get', id),
  getTournaments: (filters: any) => ipcRenderer.invoke('hands:tournaments', filters),
  getTournament: (id: number) => ipcRenderer.invoke('hands:tournament', id),
  updateTournamentCost: (id: number, effectiveCost: number | null) => ipcRenderer.invoke('hands:tournament:update-cost', id, effectiveCost),

  // Coach
  detectLeaks: (filters?: { limit?: number }) => ipcRenderer.invoke('coach:detect-leaks', filters),

  // Players
  searchPlayers: (query: string) => ipcRenderer.invoke('players:search', query),
  getPlayerStats: (playerId: number) => ipcRenderer.invoke('players:stats', playerId),
  getPlayerQuickStats: (players: { name: string; room: string }[]) => ipcRenderer.invoke('players:quick-stats', players),

  // Analysis export
  exportTournamentAnalysis: (tournamentId: number) => ipcRenderer.invoke('analysis:export-tournament', tournamentId),

  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings: any) => ipcRenderer.invoke('settings:save', settings),
  resetDatabase: () => ipcRenderer.invoke('settings:reset-db'),
};

contextBridge.exposeInMainWorld('api', api);

export type ApiType = typeof api;
