import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Import() {
  const navigate = useNavigate();
  const [isDragging, setIsDragging] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{
    imported: number;
    filesProcessed: number;
    tournamentsImported: number;
    summariesImported: number;
    errors: string[];
  } | null>(null);

  const handleImportFromSettings = async () => {
    setImporting(true);
    setResult(null);
    try {
      const res = await window.api.importFromSettings();
      setResult(res);
    } finally {
      setImporting(false);
    }
  };

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    const paths = files.map((f) => f.path).filter(Boolean);

    if (paths.length > 0) {
      setImporting(true);
      try {
        const res = await window.api.importFiles(paths);
        setResult(res);
      } finally {
        setImporting(false);
      }
    }
  }, []);

  const handleSelectFiles = async () => {
    const paths = await window.api.selectFiles();
    if (paths.length > 0) {
      setImporting(true);
      try {
        const res = await window.api.importFiles(paths);
        setResult(res);
      } finally {
        setImporting(false);
      }
    }
  };

  const handleSelectFolder = async () => {
    const folder = await window.api.selectFolder();
    if (folder) {
      setImporting(true);
      try {
        const res = await window.api.importFiles([folder]);
        setResult(res);
      } finally {
        setImporting(false);
      }
    }
  };

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-2xl font-bold">Importer</h2>

      {/* Quick import from settings */}
      <div className="bg-poker-card rounded-lg border border-poker-border p-6">
        <h3 className="text-lg font-semibold mb-2">Import rapide</h3>
        <p className="text-sm text-gray-500 mb-4">
          Importer automatiquement depuis les dossiers configurés dans Settings &gt; Comptes.
        </p>
        {importing ? (
          <div className="flex items-center gap-3">
            <div className="animate-spin w-5 h-5 border-2 border-poker-green border-t-transparent rounded-full" />
            <span className="text-gray-400">Import en cours...</span>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <button
              onClick={handleImportFromSettings}
              className="px-5 py-2.5 bg-poker-green text-white rounded-md hover:bg-poker-green/80 transition-colors font-medium"
            >
              Importer depuis mes rooms
            </button>
            <button
              onClick={() => navigate('/settings')}
              className="px-4 py-2.5 text-sm text-gray-500 hover:text-gray-300 transition-colors"
            >
              Configurer les dossiers
            </button>
          </div>
        )}
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-lg p-10 text-center transition-colors ${
          isDragging
            ? 'border-poker-green bg-poker-green/10'
            : 'border-poker-border hover:border-gray-500'
        }`}
      >
        {!importing && (
          <>
            <p className="text-gray-300 mb-2">
              Ou glissez-déposez vos fichiers ici
            </p>
            <p className="text-sm text-gray-500 mb-4">
              Formats supportés : .txt (Winamax, PokerStars, PMU) et .xml (iPoker)
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={handleSelectFiles}
                className="px-4 py-2 bg-poker-card border border-poker-border text-gray-300 rounded-md hover:bg-white/5 transition-colors text-sm"
              >
                Sélectionner des fichiers
              </button>
              <button
                onClick={handleSelectFolder}
                className="px-4 py-2 bg-poker-card border border-poker-border text-gray-300 rounded-md hover:bg-white/5 transition-colors text-sm"
              >
                Sélectionner un dossier
              </button>
            </div>
          </>
        )}
      </div>

      {/* Result */}
      {result && (
        <div className={`rounded-lg border p-4 ${
          result.errors.length > 0 && result.imported === 0
            ? 'bg-red-500/10 border-red-500/30'
            : 'bg-poker-card border-poker-border'
        }`}>
          {result.imported > 0 ? (
            <p className="text-poker-green font-medium">
              {result.imported} main(s) importée(s) depuis {result.filesProcessed} fichier(s)
            </p>
          ) : (
            <p className="text-gray-400">
              Aucune nouvelle main trouvée dans {result.filesProcessed} fichier(s).
            </p>
          )}
          {result.tournamentsImported > 0 && (
            <p className="text-sm text-gray-400 mt-1">
              {result.tournamentsImported} tournoi(s) trouvé(s)
            </p>
          )}
          {result.summariesImported > 0 && (
            <p className="text-sm text-gray-400">
              {result.summariesImported} résumé(s) importé(s)
            </p>
          )}
          {result.errors.length > 0 && (
            <div className="mt-2">
              <p className="text-poker-red text-sm">{result.errors.length} erreur(s) :</p>
              <ul className="text-xs text-gray-400 mt-1 space-y-1 max-h-40 overflow-y-auto">
                {result.errors.slice(0, 20).map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
                {result.errors.length > 20 && (
                  <li className="text-gray-600">... et {result.errors.length - 20} autres</li>
                )}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
