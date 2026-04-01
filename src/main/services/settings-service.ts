import fs from 'fs';
import path from 'path';
import { app } from 'electron';

export interface AppSettings {
  // Comptes
  heroNames: {
    winamax: string;
    pokerstars: string;
    pmu: string;
  };
  hhFolders: {
    winamax: string;
    pokerstars: string;
    pmu: string;
  };

  // Import
  watchFolder: string;
  autoImport: boolean;
  fileEncoding: string;

  // Calcul
  icmMethod: 'exact' | 'montecarlo';
  icmIterations: number;
  autoICM: boolean;

  // Affichage
  theme: 'dark' | 'light';
  currency: 'EUR' | 'USD' | 'GBP';
  dateFormat: 'DD/MM/YYYY' | 'MM/DD/YYYY';

  // Coach IA
  anthropicApiKey: string;
  claudeModel: string;
  monthlyBudget: number;
  monthlyUsage: number;

  // Données
  dbPath: string;
}

const DEFAULT_SETTINGS: AppSettings = {
  heroNames: { winamax: '', pokerstars: '', pmu: '' },
  hhFolders: {
    winamax: '~/Library/Application Support/winamax/documents/accounts/',
    pokerstars: '~/Library/Application Support/PokerStarsFR/HandHistory/',
    pmu: '~/Library/Containers/fr.pmu.poker.macos/Data/Library/Application Support/PMU Online Poker/',
  },
  watchFolder: '',
  autoImport: false,
  fileEncoding: 'utf-8',
  icmMethod: 'exact',
  icmIterations: 10000,
  autoICM: true,
  theme: 'dark',
  currency: 'EUR',
  dateFormat: 'DD/MM/YYYY',
  anthropicApiKey: '',
  claudeModel: 'claude-sonnet-4-6',
  monthlyBudget: 10,
  monthlyUsage: 0,
  dbPath: '',
};

let settingsPath = '';

function getSettingsPath(): string {
  if (!settingsPath) {
    const userDataPath = app.getPath('userData');
    settingsPath = path.join(userDataPath, 'settings.json');
  }
  return settingsPath;
}

export function loadSettings(): AppSettings {
  try {
    const filePath = getSettingsPath();
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const saved = JSON.parse(raw);
      // Merge with defaults to handle new fields
      return { ...DEFAULT_SETTINGS, ...saved };
    }
  } catch {
    // Corrupted settings file, use defaults
  }

  const settings = { ...DEFAULT_SETTINGS };
  settings.dbPath = path.join(app.getPath('userData'), 'data.db');
  return settings;
}

export function saveSettings(settings: Partial<AppSettings>): AppSettings {
  const current = loadSettings();
  const merged = { ...current, ...settings };

  try {
    const filePath = getSettingsPath();
    fs.writeFileSync(filePath, JSON.stringify(merged, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save settings:', err);
  }

  return merged;
}
