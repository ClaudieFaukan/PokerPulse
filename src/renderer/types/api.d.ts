export {};

declare global {
  interface Window {
    api: {
      importFiles: (filePaths: string[]) => Promise<{ imported: number; filesProcessed: number; tournamentsImported: number; summariesImported: number; errors: string[] }>;
      importFromSettings: () => Promise<{ imported: number; filesProcessed: number; tournamentsImported: number; summariesImported: number; errors: string[] }>;
      selectFiles: () => Promise<string[]>;
      selectFolder: () => Promise<string | null>;
      onImportProgress: (callback: (progress: { current: number; total: number; errors: string[] }) => void) => () => void;
      getStats: (filters: any) => Promise<any>;
      getDashboardData: (filters: any) => Promise<any>;
      getHands: (filters: any) => Promise<any[]>;
      getHand: (id: number) => Promise<any>;
      getTournaments: (filters: any) => Promise<any[]>;
      getTournament: (id: number) => Promise<any>;
      updateTournamentCost: (id: number, effectiveCost: number | null) => Promise<any>;
      detectLeaks: (filters?: { limit?: number }) => Promise<{ flags: any[]; error?: string }>;
      searchPlayers: (query: string) => Promise<any[]>;
      getPlayerStats: (playerId: number) => Promise<any>;
      getPlayerQuickStats: (players: { name: string; room: string }[]) => Promise<Record<string, { vpip: number; pfr: number; threeBet: number; hands: number }>>;
      exportTournamentAnalysis: (tournamentId: number) => Promise<{ success: boolean; filePath?: string; size?: number; error?: string }>;
      getSettings: () => Promise<any>;
      saveSettings: (settings: any) => Promise<void>;
      resetDatabase: () => Promise<{ success: boolean }>;
    };
  }
}
