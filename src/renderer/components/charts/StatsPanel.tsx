interface StatDef {
  label: string;
  key: string;
  format?: 'pct' | 'ratio' | 'number' | 'currency';
  refMin?: number;
  refMax?: number;
  suffix?: string;
}

const PREFLOP_STATS: StatDef[] = [
  { label: 'VPIP', key: 'vpip', format: 'pct', refMin: 18, refMax: 24 },
  { label: 'PFR', key: 'pfr', format: 'pct', refMin: 14, refMax: 20 },
  { label: '3-Bet', key: 'threeBet', format: 'pct', refMin: 7, refMax: 12 },
  { label: '4-Bet', key: 'fourBet', format: 'pct', refMin: 2, refMax: 5 },
  { label: 'Fold to 3B', key: 'foldTo3Bet', format: 'pct', refMin: 55, refMax: 65 },
  { label: 'Steal', key: 'steal', format: 'pct', refMin: 30, refMax: 45 },
  { label: 'Fold BB/Steal', key: 'foldBBToSteal', format: 'pct', refMin: 55, refMax: 70 },
  { label: 'Limp', key: 'limp', format: 'pct', refMin: 0, refMax: 3 },
];

const POSTFLOP_STATS: StatDef[] = [
  { label: 'C-Bet Flop', key: 'cbetFlop', format: 'pct', refMin: 55, refMax: 70 },
  { label: 'C-Bet Turn', key: 'cbetTurn', format: 'pct', refMin: 40, refMax: 60 },
  { label: 'Fold to CB', key: 'foldToCbetFlop', format: 'pct', refMin: 40, refMax: 55 },
  { label: 'WTSD', key: 'wtsd', format: 'pct', refMin: 25, refMax: 32 },
  { label: 'W$SD', key: 'wsd', format: 'pct', refMin: 48, refMax: 55 },
  { label: 'WWSF', key: 'wwsf', format: 'pct', refMin: 44, refMax: 52 },
  { label: 'AF', key: 'af', format: 'ratio', refMin: 2.5, refMax: 4.0 },
  { label: 'AFq', key: 'afq', format: 'pct', refMin: 35, refMax: 50 },
];

interface StatsPanelProps {
  stats: Record<string, number | string>;
  handsPlayed?: number | string;
}

function getColor(value: number | string, refMin?: number, refMax?: number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num) || refMin == null || refMax == null) return 'text-gray-200';
  if (num >= refMin && num <= refMax) return 'text-emerald-400';
  // Slightly out of range
  const tolerance = (refMax - refMin) * 0.3;
  if (num >= refMin - tolerance && num <= refMax + tolerance) return 'text-yellow-400';
  return 'text-red-400';
}

function formatValue(value: number | string, format?: string): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '—';
  if (format === 'pct') return `${num.toFixed(1)}%`;
  if (format === 'ratio') return num.toFixed(2);
  if (format === 'currency') return `${num.toFixed(2)}€`;
  return num.toFixed(0);
}

function StatRow({ stat, value }: { stat: StatDef; value: number | string }) {
  const color = getColor(value, stat.refMin, stat.refMax);

  return (
    <div className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-white/5">
      <span className="text-xs text-gray-400">{stat.label}</span>
      <span className={`text-sm font-mono font-medium ${color}`}>
        {formatValue(value, stat.format)}
      </span>
    </div>
  );
}

export default function StatsPanel({ stats, handsPlayed }: StatsPanelProps) {
  return (
    <div className="space-y-4">
      {/* Hands count */}
      {handsPlayed != null && (
        <div className="text-center pb-2 border-b border-poker-border">
          <span className="text-2xl font-bold font-mono text-gray-200">{Number(handsPlayed).toLocaleString()}</span>
          <span className="text-xs text-gray-500 ml-2">mains</span>
        </div>
      )}

      {/* Preflop */}
      <div>
        <h4 className="text-xs uppercase tracking-wider text-gray-500 mb-1 px-2">Préflop</h4>
        {PREFLOP_STATS.map((stat) => (
          <StatRow key={stat.key} stat={stat} value={stats[stat.key] || 0} />
        ))}
      </div>

      {/* Postflop */}
      <div>
        <h4 className="text-xs uppercase tracking-wider text-gray-500 mb-1 px-2">Postflop</h4>
        {POSTFLOP_STATS.map((stat) => (
          <StatRow key={stat.key} stat={stat} value={stats[stat.key] || 0} />
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 px-2 pt-2 border-t border-poker-border text-[10px] text-gray-600">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400" /> Norme reg</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-400" /> Légèrement off</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400" /> Leak potentiel</span>
      </div>
    </div>
  );
}
