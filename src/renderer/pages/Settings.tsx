import { useState, useEffect } from 'react';

interface AppSettings {
  heroNames: { winamax: string; pokerstars: string; pmu: string };
  hhFolders: { winamax: string; pokerstars: string; pmu: string };
  watchFolder: string;
  autoImport: boolean;
  fileEncoding: string;
  icmMethod: 'exact' | 'montecarlo';
  icmIterations: number;
  autoICM: boolean;
  theme: 'dark' | 'light';
  currency: 'EUR' | 'USD' | 'GBP';
  dateFormat: 'DD/MM/YYYY' | 'MM/DD/YYYY';
  anthropicApiKey: string;
  claudeModel: string;
  monthlyBudget: number;
  monthlyUsage: number;
  dbPath: string;
}

const TABS = [
  { id: 'comptes', label: 'Comptes' },
  { id: 'import', label: 'Import' },
  { id: 'calcul', label: 'Calcul' },
  { id: 'affichage', label: 'Affichage' },
  { id: 'coach', label: 'Coach IA' },
  { id: 'donnees', label: 'Données' },
];

export default function Settings() {
  const [tab, setTab] = useState('comptes');
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    window.api.getSettings().then(setSettings);
  }, []);

  const update = (patch: Partial<AppSettings>) => {
    if (!settings) return;
    setSettings({ ...settings, ...patch });
    setSaved(false);
  };

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      await window.api.saveSettings(settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  if (!settings) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin w-8 h-8 border-2 border-poker-green border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Settings</h2>
        <button
          onClick={save}
          disabled={saving}
          className="px-4 py-2 text-sm bg-poker-green text-white rounded-md hover:bg-poker-green/80 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Sauvegarde...' : saved ? 'Sauvegardé !' : 'Sauvegarder'}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-poker-border">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm transition-colors border-b-2 -mb-px ${
              tab === t.id
                ? 'border-poker-green text-poker-green'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="bg-poker-card rounded-lg border border-poker-border p-5">
        {tab === 'comptes' && (
          <div className="space-y-5">
            <h3 className="text-lg font-semibold mb-4">Pseudos par room</h3>
            {(['winamax', 'pokerstars', 'pmu'] as const).map((room) => (
              <div key={room} className="space-y-2">
                <label className="text-sm text-gray-400 capitalize">{room}</label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-xs text-gray-600">Pseudo</span>
                    <input
                      type="text"
                      value={settings.heroNames[room]}
                      onChange={(e) => update({ heroNames: { ...settings.heroNames, [room]: e.target.value } })}
                      placeholder={`Pseudo ${room}`}
                      className="w-full bg-poker-dark border border-poker-border rounded px-3 py-1.5 text-sm text-gray-200 focus:border-poker-green focus:outline-none mt-1"
                    />
                  </div>
                  <div>
                    <span className="text-xs text-gray-600">Dossier HH</span>
                    <input
                      type="text"
                      value={settings.hhFolders[room]}
                      onChange={(e) => update({ hhFolders: { ...settings.hhFolders, [room]: e.target.value } })}
                      placeholder="Chemin du dossier"
                      className="w-full bg-poker-dark border border-poker-border rounded px-3 py-1.5 text-sm text-gray-200 focus:border-poker-green focus:outline-none mt-1"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'import' && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold mb-4">Import</h3>
            <Field label="Dossier de surveillance">
              <input
                type="text"
                value={settings.watchFolder}
                onChange={(e) => update({ watchFolder: e.target.value })}
                placeholder="Chemin du dossier à surveiller"
                className="w-full bg-poker-dark border border-poker-border rounded px-3 py-1.5 text-sm text-gray-200 focus:border-poker-green focus:outline-none"
              />
            </Field>
            <Field label="Import automatique">
              <Toggle checked={settings.autoImport} onChange={(v) => update({ autoImport: v })} />
            </Field>
            <Field label="Encodage des fichiers">
              <select
                value={settings.fileEncoding}
                onChange={(e) => update({ fileEncoding: e.target.value })}
                className="bg-poker-dark border border-poker-border rounded px-3 py-1.5 text-sm text-gray-200 focus:border-poker-green focus:outline-none"
              >
                <option value="utf-8">UTF-8</option>
                <option value="latin1">Latin-1 (ISO-8859-1)</option>
                <option value="utf-16">UTF-16</option>
              </select>
            </Field>
          </div>
        )}

        {tab === 'calcul' && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold mb-4">Calcul ICM</h3>
            <Field label="Méthode ICM">
              <select
                value={settings.icmMethod}
                onChange={(e) => update({ icmMethod: e.target.value as any })}
                className="bg-poker-dark border border-poker-border rounded px-3 py-1.5 text-sm text-gray-200 focus:border-poker-green focus:outline-none"
              >
                <option value="exact">Malmuth-Harville (exact)</option>
                <option value="montecarlo">Monte Carlo (approximation)</option>
              </select>
            </Field>
            {settings.icmMethod === 'montecarlo' && (
              <Field label="Itérations Monte Carlo">
                <input
                  type="number"
                  value={settings.icmIterations}
                  onChange={(e) => update({ icmIterations: parseInt(e.target.value) || 10000 })}
                  min={1000}
                  max={100000}
                  step={1000}
                  className="w-32 bg-poker-dark border border-poker-border rounded px-3 py-1.5 text-sm text-gray-200 focus:border-poker-green focus:outline-none"
                />
              </Field>
            )}
            <Field label="Calcul ICM automatique à l'import">
              <Toggle checked={settings.autoICM} onChange={(v) => update({ autoICM: v })} />
            </Field>
          </div>
        )}

        {tab === 'affichage' && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold mb-4">Affichage</h3>
            <Field label="Thème">
              <select
                value={settings.theme}
                onChange={(e) => update({ theme: e.target.value as any })}
                className="bg-poker-dark border border-poker-border rounded px-3 py-1.5 text-sm text-gray-200 focus:border-poker-green focus:outline-none"
              >
                <option value="dark">Dark</option>
                <option value="light">Light</option>
              </select>
            </Field>
            <Field label="Devise">
              <select
                value={settings.currency}
                onChange={(e) => update({ currency: e.target.value as any })}
                className="bg-poker-dark border border-poker-border rounded px-3 py-1.5 text-sm text-gray-200 focus:border-poker-green focus:outline-none"
              >
                <option value="EUR">€ EUR</option>
                <option value="USD">$ USD</option>
                <option value="GBP">£ GBP</option>
              </select>
            </Field>
            <Field label="Format de date">
              <select
                value={settings.dateFormat}
                onChange={(e) => update({ dateFormat: e.target.value as any })}
                className="bg-poker-dark border border-poker-border rounded px-3 py-1.5 text-sm text-gray-200 focus:border-poker-green focus:outline-none"
              >
                <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                <option value="MM/DD/YYYY">MM/DD/YYYY</option>
              </select>
            </Field>
          </div>
        )}

        {tab === 'coach' && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold mb-4">Coach IA (Claude)</h3>
            <Field label="Clé API Anthropic">
              <input
                type="password"
                value={settings.anthropicApiKey}
                onChange={(e) => update({ anthropicApiKey: e.target.value })}
                placeholder="sk-ant-..."
                className="w-full bg-poker-dark border border-poker-border rounded px-3 py-1.5 text-sm text-gray-200 focus:border-poker-green focus:outline-none"
              />
              <p className="text-xs text-gray-600 mt-1">Optionnel. Sans clé, le bouton "Analyser" copie le prompt dans le presse-papier.</p>
            </Field>
            <Field label="Modèle">
              <select
                value={settings.claudeModel}
                onChange={(e) => update({ claudeModel: e.target.value })}
                className="bg-poker-dark border border-poker-border rounded px-3 py-1.5 text-sm text-gray-200 focus:border-poker-green focus:outline-none"
              >
                <option value="claude-sonnet-4-6">Claude Sonnet 4.6</option>
                <option value="claude-opus-4-6">Claude Opus 4.6</option>
              </select>
            </Field>
            <Field label="Budget mensuel max">
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={settings.monthlyBudget}
                  onChange={(e) => update({ monthlyBudget: parseFloat(e.target.value) || 0 })}
                  min={0}
                  step={1}
                  className="w-24 bg-poker-dark border border-poker-border rounded px-3 py-1.5 text-sm text-gray-200 focus:border-poker-green focus:outline-none"
                />
                <span className="text-sm text-gray-500">€</span>
              </div>
            </Field>
            <Field label="Usage ce mois">
              <span className="text-sm font-mono text-gray-400">
                {settings.monthlyUsage.toFixed(2)}€ / {settings.monthlyBudget}€
              </span>
            </Field>
          </div>
        )}

        {tab === 'donnees' && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold mb-4">Données</h3>
            <Field label="Base de données SQLite">
              <span className="text-xs font-mono text-gray-500 break-all">{settings.dbPath}</span>
            </Field>
            <div className="flex gap-3 pt-4">
              <button className="px-4 py-2 text-sm bg-poker-dark border border-poker-border rounded text-gray-400 hover:text-gray-200 transition-colors">
                Exporter (JSON)
              </button>
              <button className="px-4 py-2 text-sm bg-poker-dark border border-poker-border rounded text-gray-400 hover:text-gray-200 transition-colors">
                Exporter (CSV)
              </button>
              <button
                onClick={async () => {
                  const result = await window.api.resetDatabase();
                  if (result.success) {
                    window.location.reload();
                  }
                }}
                className="px-4 py-2 text-sm bg-red-500/20 border border-red-500/30 rounded text-red-400 hover:bg-red-500/30 transition-colors ml-auto"
              >
                Réinitialiser la base
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-4">
      <label className="w-48 shrink-0 text-sm text-gray-400 pt-1.5">{label}</label>
      <div className="flex-1">{children}</div>
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative w-10 h-5 rounded-full transition-colors ${
        checked ? 'bg-poker-green' : 'bg-poker-border'
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
          checked ? 'translate-x-5' : ''
        }`}
      />
    </button>
  );
}
