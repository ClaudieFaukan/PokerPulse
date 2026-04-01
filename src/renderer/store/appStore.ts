import { create } from 'zustand';

export interface Filters {
  dateFrom?: string;
  dateTo?: string;
  activePeriod?: number; // days selected (0 = all, 7/30/90/180/365)
  rooms: ('winamax' | 'pokerstars' | 'pmu')[];
  buyInMin?: number;
  buyInMax?: number;
  tournamentTypes: string[];
  playerCountMin?: number;
  playerCountMax?: number;
}

interface AppState {
  // Filters
  filters: Filters;
  setFilters: (filters: Partial<Filters>) => void;
  resetFilters: () => void;

  // Import
  isImporting: boolean;
  importProgress: { current: number; total: number } | null;
  setImporting: (importing: boolean) => void;
  setImportProgress: (progress: { current: number; total: number } | null) => void;

  // Navigation
  currentHandId: number | null;
  setCurrentHandId: (id: number | null) => void;

  // Settings
  heroNames: { winamax: string; pokerstars: string; pmu: string };
  setHeroNames: (names: Partial<{ winamax: string; pokerstars: string; pmu: string }>) => void;
}

const defaultFilters: Filters = {
  rooms: [],
  tournamentTypes: [],
};

export const useAppStore = create<AppState>((set) => ({
  filters: defaultFilters,
  setFilters: (newFilters) =>
    set((state) => ({ filters: { ...state.filters, ...newFilters } })),
  resetFilters: () => set({ filters: defaultFilters }),

  isImporting: false,
  importProgress: null,
  setImporting: (importing) => set({ isImporting: importing }),
  setImportProgress: (progress) => set({ importProgress: progress }),

  currentHandId: null,
  setCurrentHandId: (id) => set({ currentHandId: id }),

  heroNames: { winamax: '', pokerstars: '', pmu: '' },
  setHeroNames: (names) =>
    set((state) => ({ heroNames: { ...state.heroNames, ...names } })),
}));
