import { useState, useEffect } from 'react';

interface PlayerStatsModalProps {
  playerId: number;
  playerName: string;
  playerRoom: string;
  onClose: () => void;
}

interface StatDef {
  key: string;
  label: string;
  refMin: number;
  refMax: number;
}

const PREFLOP_STATS: StatDef[] = [
  { key: 'vpip', label: 'VPIP', refMin: 18, refMax: 24 },
  { key: 'pfr', label: 'PFR', refMin: 14, refMax: 20 },
  { key: 'threeBet', label: '3-Bet', refMin: 7, refMax: 12 },
  { key: 'fourBet', label: '4-Bet', refMin: 2, refMax: 5 },
  { key: 'foldTo3Bet', label: 'Fold to 3B', refMin: 55, refMax: 65 },
  { key: 'steal', label: 'Steal', refMin: 30, refMax: 45 },
  { key: 'foldBBToSteal', label: 'Fold BB/Steal', refMin: 55, refMax: 70 },
  { key: 'limp', label: 'Limp', refMin: 0, refMax: 3 },
];

const POSTFLOP_STATS: StatDef[] = [
  { key: 'cbetFlop', label: 'C-Bet Flop', refMin: 55, refMax: 70 },
  { key: 'cbetTurn', label: 'C-Bet Turn', refMin: 40, refMax: 60 },
  { key: 'foldToCbetFlop', label: 'Fold to CB', refMin: 40, refMax: 55 },
  { key: 'wtsd', label: 'WTSD %', refMin: 25, refMax: 32 },
  { key: 'wsd', label: 'W$SD %', refMin: 48, refMax: 55 },
  { key: 'wwsf', label: 'WWSF %', refMin: 44, refMax: 52 },
  { key: 'af', label: 'AF', refMin: 2.5, refMax: 4.0 },
  { key: 'afq', label: 'AFq %', refMin: 35, refMax: 50 },
];

function getStatColor(value: number, refMin: number, refMax: number): string {
  if (value >= refMin && value <= refMax) return 'text-emerald-400';
  const tolerance = (refMax - refMin) * 0.3;
  if (value >= refMin - tolerance && value <= refMax + tolerance) return 'text-yellow-400';
  return 'text-red-400';
}

export default function PlayerStatsModal({ playerId, playerName, playerRoom, onClose }: PlayerStatsModalProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const result = await window.api.getPlayerStats(playerId);
      if (!cancelled) {
        setData(result);
        setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [playerId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-poker-darker rounded-xl border border-poker-border p-5 w-[480px] max-h-[80vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold">{playerName}</h3>
            <span className={`text-[10px] uppercase px-1.5 py-0.5 rounded font-medium ${
              playerRoom === 'winamax' ? 'bg-red-500/20 text-red-400' :
              playerRoom === 'pokerstars' ? 'bg-blue-500/20 text-blue-400' :
              'bg-yellow-500/20 text-yellow-400'
            }`}>
              {playerRoom}
            </span>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xl leading-none">&times;</button>
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin w-6 h-6 border-2 border-poker-green border-t-transparent rounded-full" />
          </div>
        ) : !data?.stats ? (
          <p className="text-gray-500 text-sm text-center py-8">Pas assez de données.</p>
        ) : (
          <>
            <div className="text-center mb-4">
              <span className="text-2xl font-bold font-mono text-gray-200">{data.stats.handsPlayed}</span>
              <span className="text-xs text-gray-500 ml-1">mains</span>
            </div>

            {/* Preflop */}
            <div className="mb-4">
              <h4 className="text-[10px] uppercase tracking-wider text-gray-500 mb-2 border-b border-poker-border pb-1">Preflop</h4>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                {PREFLOP_STATS.map((s) => {
                  const val = data.stats[s.key] ?? 0;
                  return (
                    <div key={s.key} className="flex justify-between text-xs py-0.5">
                      <span className="text-gray-400">{s.label}</span>
                      <span className={`font-mono font-bold ${getStatColor(val, s.refMin, s.refMax)}`}>
                        {typeof val === 'number' ? val.toFixed(1) : val}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Postflop */}
            <div>
              <h4 className="text-[10px] uppercase tracking-wider text-gray-500 mb-2 border-b border-poker-border pb-1">Postflop</h4>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                {POSTFLOP_STATS.map((s) => {
                  const val = data.stats[s.key] ?? 0;
                  const isAF = s.key === 'af';
                  return (
                    <div key={s.key} className="flex justify-between text-xs py-0.5">
                      <span className="text-gray-400">{s.label}</span>
                      <span className={`font-mono font-bold ${getStatColor(val, s.refMin, s.refMax)}`}>
                        {typeof val === 'number' ? (isAF ? val.toFixed(2) : val.toFixed(1)) : val}{isAF ? '' : '%'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
