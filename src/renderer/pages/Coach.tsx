import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

interface LeakFlag {
  handId: string;
  severity: 'info' | 'warning' | 'error';
  category: string;
  description: string;
  suggestion: string;
  handDbId?: number;
  tournamentName?: string;
  heroCards?: string;
  prompt?: string;
}

type SeverityFilter = 'all' | 'info' | 'warning' | 'error';

const SEVERITY_COLORS = {
  info: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  warning: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  error: 'bg-red-500/20 text-red-400 border-red-500/30',
};

const SEVERITY_LABELS = {
  info: 'Info',
  warning: 'Attention',
  error: 'Leak',
};

const LEAK_RULES = [
  { category: 'Open Limp', severity: 'warning', desc: 'Open limp (call au lieu de raise quand personne n\'est entré dans le pot). Exception : SB.' },
  { category: 'Fold BB bonnes cotes', severity: 'warning', desc: 'Fold en BB avec des cotes > 3:1 (raise + 2 callers minimum).' },
  { category: 'Steal manqué', severity: 'info', desc: 'Fold au CO/BTN avec une main jouable (top 40%) quand tout a foldé devant.' },
  { category: 'Open UTG trop large', severity: 'info', desc: 'Open raise UTG avec une main hors du top 15%.' },
  { category: 'Pas de 3-bet premium', severity: 'warning', desc: 'Flat call avec QQ+/AKs face à un open raise au lieu de 3-bet.' },
  { category: 'Flat call 3-bet OOP', severity: 'warning', desc: 'Flat call d\'un 3-bet hors de position (spot de 4-bet or fold).' },
  { category: 'C-bet manqué board sec', severity: 'info', desc: 'Pas de c-bet au flop sur un board sec (rainbow, déconnecté) en HU pot après avoir ouvert preflop.' },
  { category: 'Check-fold après PFR', severity: 'info', desc: 'Check-fold au flop après avoir été l\'agresseur preflop.' },
  { category: 'Min-bet suspect', severity: 'info', desc: 'Min-bet dans un pot > 5bb — sizing trop faible qui ne met pas de pression.' },
  { category: 'Passif main forte', severity: 'warning', desc: 'Check-call passif sur 2+ streets avec un set ou mieux (pas de raise pour build le pot).' },
];

export default function Coach() {
  const navigate = useNavigate();
  const [flags, setFlags] = useState<LeakFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showRules, setShowRules] = useState(false);
  const [handLimit, setHandLimit] = useState(500);

  const loadLeaks = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await window.api.detectLeaks({ limit: handLimit });
      if (result.error) {
        setError(result.error);
        setFlags([]);
      } else {
        setFlags(result.flags);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLeaks();
  }, [handLimit]);

  const filtered = useMemo(() => {
    return flags.filter((f) => {
      if (severityFilter !== 'all' && f.severity !== severityFilter) return false;
      if (categoryFilter !== 'all' && f.category !== categoryFilter) return false;
      return true;
    });
  }, [flags, severityFilter, categoryFilter]);

  const categories = useMemo(() => {
    const cats = new Set(flags.map((f) => f.category));
    return ['all', ...cats];
  }, [flags]);

  const distribution = useMemo(() => {
    const d = { info: 0, warning: 0, error: 0 };
    for (const f of flags) d[f.severity]++;
    return d;
  }, [flags]);

  const handleCopyPrompt = async (flag: LeakFlag) => {
    if (flag.prompt) {
      await navigator.clipboard.writeText(flag.prompt);
      setCopiedId(flag.handId);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold">Coach</h2>
          <button
            onClick={() => setShowRules(!showRules)}
            className="px-2 py-1 text-xs bg-poker-card border border-poker-border rounded text-gray-400 hover:text-gray-200 transition-colors"
            title="Voir les règles de détection"
          >
            {showRules ? 'Masquer les règles' : 'Règles de détection'}
          </button>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={handLimit}
            onChange={(e) => setHandLimit(parseInt(e.target.value))}
            className="bg-poker-card border border-poker-border rounded px-2 py-1 text-xs text-gray-300 focus:border-poker-green focus:outline-none"
          >
            <option value={200}>200 dernières mains</option>
            <option value={500}>500 dernières mains</option>
            <option value={1000}>1000 dernières mains</option>
            <option value={2000}>2000 dernières mains</option>
          </select>
          <button
            onClick={loadLeaks}
            disabled={loading}
            className="px-3 py-1 text-xs bg-poker-green text-white rounded hover:bg-poker-green/80 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Analyse...' : 'Relancer l\'analyse'}
          </button>
        </div>
      </div>

      {/* Rules tooltip */}
      {showRules && (
        <div className="bg-poker-card rounded-lg border border-poker-border p-4">
          <h3 className="text-sm font-semibold text-gray-300 mb-3">Leaks recherchés (10 règles)</h3>
          <div className="grid grid-cols-2 gap-2">
            {LEAK_RULES.map((rule) => (
              <div key={rule.category} className="flex items-start gap-2 text-xs">
                <span className={`px-1.5 py-0.5 rounded shrink-0 mt-0.5 ${
                  rule.severity === 'warning' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-blue-500/20 text-blue-400'
                }`}>
                  {rule.severity === 'warning' ? 'ATT' : 'INFO'}
                </span>
                <div>
                  <span className="text-gray-300 font-medium">{rule.category}</span>
                  <p className="text-gray-500 mt-0.5">{rule.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin w-8 h-8 border-2 border-poker-green border-t-transparent rounded-full" />
        </div>
      ) : flags.length === 0 && !error ? (
        <div className="bg-poker-card rounded-lg border border-poker-border p-8 text-center text-gray-500">
          <p className="text-lg mb-2">Aucun leak détecté</p>
          <p className="text-sm">Sur les {handLimit} dernières mains analysées. Essayez d'augmenter le nombre ou vérifiez vos pseudos dans Settings.</p>
        </div>
      ) : flags.length > 0 && (
        <>
          {/* Distribution */}
          <div className="grid grid-cols-3 gap-3">
            <DistCard label="Info" count={distribution.info} color="text-blue-400" bg="bg-blue-500/10" />
            <DistCard label="Attention" count={distribution.warning} color="text-yellow-400" bg="bg-yellow-500/10" />
            <DistCard label="Leak" count={distribution.error} color="text-red-400" bg="bg-red-500/10" />
          </div>

          {/* Filters */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <span className="text-xs text-gray-500">Sévérité</span>
              {(['all', 'error', 'warning', 'info'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setSeverityFilter(s)}
                  className={`px-2.5 py-1 text-xs rounded transition-colors ${
                    severityFilter === s
                      ? 'bg-poker-green text-white'
                      : 'bg-poker-dark text-gray-500 hover:text-gray-300'
                  }`}
                >
                  {s === 'all' ? 'Tout' : SEVERITY_LABELS[s]}
                </button>
              ))}
            </div>

            <div className="w-px h-5 bg-poker-border" />

            <div className="flex items-center gap-1">
              <span className="text-xs text-gray-500">Catégorie</span>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="bg-poker-dark border border-poker-border rounded px-2 py-1 text-xs text-gray-300 focus:border-poker-green focus:outline-none"
              >
                {categories.map((c) => (
                  <option key={c} value={c}>{c === 'all' ? 'Toutes' : c}</option>
                ))}
              </select>
            </div>

            <span className="ml-auto text-xs text-gray-500">{filtered.length} play(s) douteux</span>
          </div>

          {/* Flag list */}
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {filtered.map((flag, i) => (
              <div
                key={`${flag.handId}-${i}`}
                className="bg-poker-card rounded-lg border border-poker-border p-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`px-2 py-0.5 text-[10px] rounded border font-medium ${SEVERITY_COLORS[flag.severity]}`}>
                        {SEVERITY_LABELS[flag.severity]}
                      </span>
                      <span className="text-xs text-gray-500 font-medium">{flag.category}</span>
                      {flag.heroCards && (
                        <span className="text-xs font-mono text-gray-400">[{flag.heroCards}]</span>
                      )}
                      {flag.tournamentName && (
                        <span className="text-xs text-gray-600">— {flag.tournamentName}</span>
                      )}
                    </div>
                    <p className="text-sm text-gray-300 mb-1">{flag.description}</p>
                    <p className="text-xs text-gray-500">{flag.suggestion}</p>
                  </div>

                  <div className="flex flex-col gap-1 shrink-0">
                    {flag.handDbId && (
                      <button
                        onClick={() => navigate(`/replayer/${flag.handDbId}`)}
                        className="px-3 py-1.5 text-xs bg-poker-dark border border-poker-border rounded text-gray-400 hover:text-gray-200 transition-colors"
                      >
                        Voir la main
                      </button>
                    )}
                    {flag.prompt && (
                      <button
                        onClick={() => handleCopyPrompt(flag)}
                        className="px-3 py-1.5 text-xs bg-poker-blue/20 border border-poker-blue/30 rounded text-poker-blue hover:bg-poker-blue/30 transition-colors"
                      >
                        {copiedId === flag.handId ? 'Copié !' : 'Analyser avec Claude'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function DistCard({ label, count, color, bg }: { label: string; count: number; color: string; bg: string }) {
  return (
    <div className={`rounded-lg border border-poker-border p-3 ${bg}`}>
      <p className="text-[10px] uppercase tracking-wider text-gray-500">{label}</p>
      <p className={`text-2xl font-bold font-mono ${color}`}>{count}</p>
    </div>
  );
}
