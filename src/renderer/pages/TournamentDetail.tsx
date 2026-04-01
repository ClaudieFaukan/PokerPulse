import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';

interface TournamentData {
  id: number;
  room: string;
  tournament_id: string;
  name: string;
  buy_in: number;
  fee: number;
  bounty: number;
  effective_cost: number | null;
  prize_pool: number;
  total_players: number;
  start_time: string;
  end_time: string;
  hero_finish_position: number;
  hero_prize: number;
  tournament_type: string;
  speed: string;
  hands: HandData[];
}

interface HandData {
  id: number;
  hand_number: string;
  datetime: string;
  level: number;
  small_blind: number;
  big_blind: number;
  hero_card1: string;
  hero_card2: string;
  hero_position: string;
  hero_stack_before: number;
  hero_won: number;
  total_pot: number;
  num_players: number;
  went_to_showdown: boolean;
  is_hero_allin: boolean;
  hero_allin_ev: number | null;
  hero_ev_diff: number | null;
}

export default function TournamentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<TournamentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingCost, setEditingCost] = useState(false);
  const [costInput, setCostInput] = useState('');

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const result = await window.api.getTournament(parseInt(id!, 10));
        if (!cancelled) setData(result);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin w-8 h-8 border-2 border-poker-green border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6 text-gray-500">Tournoi introuvable.</div>
    );
  }

  const effectiveCost = data.effective_cost != null ? data.effective_cost : data.buy_in + (data.bounty || 0) + data.fee;
  const profit = (data.hero_prize || 0) - effectiveCost;

  const handleSaveCost = async () => {
    const parsed = parseFloat(costInput);
    if (isNaN(parsed) || parsed < 0) return;
    const updated = await window.api.updateTournamentCost(data.id, parsed);
    setData((prev) => prev ? { ...prev, effective_cost: updated.effective_cost } : prev);
    setEditingCost(false);
  };

  const handleResetCost = async () => {
    const updated = await window.api.updateTournamentCost(data.id, null);
    setData((prev) => prev ? { ...prev, effective_cost: updated.effective_cost } : prev);
    setEditingCost(false);
  };

  // Stack progression data with EV line
  // stackEV tracks what stack would be if hero won/lost exactly EV at each all-in
  let evCumDiff = 0;
  let hasEvData = false;
  const stackData = data.hands.map((h, i) => {
    if (h.hero_ev_diff != null) {
      evCumDiff += h.hero_ev_diff;
      hasEvData = true;
    }
    return {
      index: i + 1,
      stack: h.hero_stack_before || 0,
      stackEV: hasEvData ? (h.hero_stack_before || 0) - evCumDiff : undefined,
      level: h.level,
      bb: h.big_blind,
    };
  });

  return (
    <div className="p-6 space-y-4">
      {/* Back + title */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/tournaments')}
          className="text-gray-500 hover:text-gray-300 transition-colors"
        >
          ← Retour
        </button>
        <h2 className="text-2xl font-bold truncate">{data.name || `Tournament #${data.tournament_id}`}</h2>
        <span className={`px-2 py-0.5 text-xs rounded font-medium uppercase ${
          data.room === 'winamax' ? 'bg-red-500/20 text-red-400' :
          data.room === 'pokerstars' ? 'bg-blue-500/20 text-blue-400' :
          'bg-yellow-500/20 text-yellow-400'
        }`}>
          {data.room}
        </span>
        </div>
        {/* Action buttons */}
        {data.hands.length > 0 && (
          <div className="flex items-center gap-2">
            <button
              onClick={async () => {
                const result = await window.api.exportTournamentAnalysis(data.id);
                if (result.success) {
                  alert(`Fichier exporté (${Math.round((result.size || 0) / 1024)}KB)\n${result.filePath}`);
                }
              }}
              className="px-4 py-2 text-sm bg-poker-blue/20 border border-poker-blue/30 text-poker-blue rounded-md hover:bg-poker-blue/30 transition-colors"
            >
              Analyser mon tournoi
            </button>
            <button
              onClick={() => navigate(`/replayer/${data.hands[0].id}`)}
              className="px-4 py-2 text-sm bg-poker-green text-white rounded-md hover:bg-poker-green/80 transition-colors"
            >
              Commencer la review
            </button>
          </div>
        )}
      </div>

      {/* Overview cards */}
      <div className="grid grid-cols-7 gap-3">
        <InfoCard label="Buy-in" value={
          data.bounty > 0
            ? `${data.buy_in}€ + ${data.bounty}€ + ${data.fee}€`
            : `${data.buy_in}€ + ${data.fee}€`
        } />
        {/* Editable effective cost */}
        <div className="bg-poker-dark rounded-lg border border-poker-border p-3">
          <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-0.5">Coût effectif</p>
          {editingCost ? (
            <div className="flex items-center gap-1">
              <input
                type="number"
                autoFocus
                value={costInput}
                onChange={(e) => setCostInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSaveCost(); if (e.key === 'Escape') setEditingCost(false); }}
                min={0}
                step={0.01}
                className="w-16 bg-poker-card border border-poker-green rounded px-1.5 py-0.5 text-sm font-mono text-gray-200 focus:outline-none"
              />
              <button onClick={handleSaveCost} className="text-xs text-poker-green hover:text-emerald-300">OK</button>
              {data.effective_cost != null && (
                <button onClick={handleResetCost} className="text-xs text-gray-500 hover:text-gray-300" title="Réinitialiser au buy-in">x</button>
              )}
            </div>
          ) : (
            <p
              className="text-lg font-bold font-mono text-gray-200 cursor-pointer hover:text-poker-green transition-colors group"
              onClick={() => { setCostInput(effectiveCost.toFixed(2)); setEditingCost(true); }}
              title="Cliquer pour modifier (ex: 0 pour un ticket gratuit)"
            >
              {effectiveCost.toFixed(2)}€
              <span className="text-[10px] text-gray-600 ml-1 opacity-0 group-hover:opacity-100">modifier</span>
            </p>
          )}
        </div>
        <InfoCard label="Joueurs" value={data.total_players?.toString() || '—'} />
        <InfoCard label="Finish" value={
          data.hero_finish_position
            ? `${data.hero_finish_position}${data.total_players ? `/${data.total_players}` : ''}`
            : '—'
        } />
        <InfoCard label="Prize" value={`${(data.hero_prize || 0).toFixed(2)}€`} />
        <InfoCard
          label="Profit"
          value={`${profit >= 0 ? '+' : ''}${profit.toFixed(2)}€`}
          color={profit >= 0 ? 'text-emerald-400' : 'text-red-400'}
        />
        <InfoCard label="Mains" value={data.hands.length.toString()} />
      </div>

      {/* Review stats */}
      {data.hands.length > 0 && (() => {
        // All-in stats
        const allinHands = data.hands.filter((h) => h.is_hero_allin);
        const allinWithEV = allinHands.filter((h) => h.hero_ev_diff != null);
        const totalEvDiff = allinWithEV.reduce((s, h) => s + (h.hero_ev_diff || 0), 0);
        const allinWon = allinHands.filter((h) => h.hero_won > 0).length;

        // Stack in BB over time — zone distribution
        const bbStacks = data.hands
          .filter((h) => h.big_blind > 0 && h.hero_stack_before > 0)
          .map((h) => h.hero_stack_before / h.big_blind);
        const dangerZone = bbStacks.filter((bb) => bb < 10).length;
        const shortZone = bbStacks.filter((bb) => bb >= 10 && bb < 20).length;
        const mediumZone = bbStacks.filter((bb) => bb >= 20 && bb < 40).length;
        const deepZone = bbStacks.filter((bb) => bb >= 40).length;
        const total = bbStacks.length || 1;

        // Average M-ratio
        const mRatios = data.hands
          .filter((h) => h.big_blind > 0 && h.hero_stack_before > 0)
          .map((h) => {
            const orbit = h.small_blind + h.big_blind + (h.num_players || 6) * 0; // ante not in hand data, approximate
            return h.hero_stack_before / (h.small_blind + h.big_blind);
          });
        const avgM = mRatios.length > 0 ? mRatios.reduce((a, b) => a + b, 0) / mRatios.length : 0;

        return (
          <div className="grid grid-cols-3 gap-3">
            {/* EV Summary */}
            <div className="bg-poker-card rounded-lg border border-poker-border p-3">
              <h4 className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">All-in EV</h4>
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-400">Mains all-in</span>
                  <span className="font-mono text-gray-300">{allinHands.length}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-400">Gagnées</span>
                  <span className="font-mono text-gray-300">{allinWon}/{allinHands.length}</span>
                </div>
                {allinWithEV.length > 0 && (
                  <div className="flex justify-between text-xs pt-1 border-t border-poker-border/50">
                    <span className="text-gray-400">Run</span>
                    <span className={`font-mono font-bold ${totalEvDiff > 0 ? 'text-emerald-400' : totalEvDiff < 0 ? 'text-red-400' : 'text-gray-400'}`}>
                      {totalEvDiff > 0 ? '+' : ''}{Math.round(totalEvDiff).toLocaleString()} chips
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* BB Stack Distribution */}
            <div className="bg-poker-card rounded-lg border border-poker-border p-3">
              <h4 className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">Distribution stack (BB)</h4>
              <div className="space-y-1">
                <StackZoneBar label="< 10bb" pct={dangerZone / total * 100} color="bg-red-500" />
                <StackZoneBar label="10-20bb" pct={shortZone / total * 100} color="bg-yellow-500" />
                <StackZoneBar label="20-40bb" pct={mediumZone / total * 100} color="bg-blue-500" />
                <StackZoneBar label="40bb+" pct={deepZone / total * 100} color="bg-emerald-500" />
              </div>
            </div>

            {/* M-ratio / general */}
            <div className="bg-poker-card rounded-lg border border-poker-border p-3">
              <h4 className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">Profondeur</h4>
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-400">M-ratio moyen</span>
                  <span className={`font-mono font-bold ${avgM < 10 ? 'text-red-400' : avgM < 20 ? 'text-yellow-400' : 'text-emerald-400'}`}>
                    {avgM.toFixed(1)}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-400">Stack BB min</span>
                  <span className="font-mono text-gray-300">{bbStacks.length > 0 ? Math.round(Math.min(...bbStacks)) : '—'}bb</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-400">Stack BB max</span>
                  <span className="font-mono text-gray-300">{bbStacks.length > 0 ? Math.round(Math.max(...bbStacks)) : '—'}bb</span>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Stack progression chart */}
      {stackData.length > 0 && (
        <div className="bg-poker-card rounded-lg border border-poker-border p-4">
          <h3 className="text-sm font-medium text-gray-400 mb-2">Progression du stack</h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={stackData} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2a4a" />
                <XAxis dataKey="index" stroke="#555" tick={{ fontSize: 10, fill: '#666' }} />
                <YAxis stroke="#555" tick={{ fontSize: 10, fill: '#666' }} />
                <Tooltip
                  contentStyle={{ background: '#16162a', border: '1px solid #2a2a4a', borderRadius: '8px', fontSize: '11px' }}
                  labelStyle={{ color: '#888' }}
                  formatter={((value: any, name: string) => [
                    `${Number(value).toLocaleString()} chips`,
                    name === 'stack' ? 'Stack réel' : 'Stack EV'
                  ]) as any}
                  labelFormatter={(idx) => `Main ${idx}`}
                />
                {hasEvData && (
                  <Legend
                    verticalAlign="top"
                    height={24}
                    formatter={(value: string) => value === 'stack' ? 'Stack réel' : 'Stack EV'}
                    wrapperStyle={{ fontSize: '10px', color: '#888' }}
                  />
                )}
                <Area
                  type="monotone"
                  dataKey="stack"
                  stroke="#2d6a4f"
                  fill="#2d6a4f"
                  fillOpacity={0.15}
                  strokeWidth={1.5}
                />
                {hasEvData && (
                  <Line
                    type="monotone"
                    dataKey="stackEV"
                    stroke="#f4a261"
                    strokeWidth={1.5}
                    strokeDasharray="4 3"
                    dot={false}
                    connectNulls
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Hands list */}
      <div className="bg-poker-card rounded-lg border border-poker-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-poker-border text-gray-500 text-xs uppercase tracking-wider">
              <th className="px-3 py-2 text-left">#</th>
              <th className="px-3 py-2 text-left">Level</th>
              <th className="px-3 py-2 text-left">Position</th>
              <th className="px-3 py-2 text-left">Cartes</th>
              <th className="px-3 py-2 text-right">Stack</th>
              <th className="px-3 py-2 text-right">Pot</th>
              <th className="px-3 py-2 text-right">Résultat</th>
              <th className="px-3 py-2 text-center">Info</th>
            </tr>
          </thead>
          <tbody>
            {data.hands.map((h, i) => (
              <tr
                key={h.id}
                onClick={() => navigate(`/replayer/${h.id}`)}
                className="border-b border-poker-border/50 hover:bg-white/5 cursor-pointer transition-colors"
              >
                <td className="px-3 py-2 text-gray-500 text-xs">{i + 1}</td>
                <td className="px-3 py-2 text-gray-400 text-xs">
                  Lv{h.level} ({h.small_blind}/{h.big_blind})
                </td>
                <td className="px-3 py-2">
                  <span className="text-xs font-medium text-gray-300">{h.hero_position || '—'}</span>
                </td>
                <td className="px-3 py-2 font-mono text-xs">
                  {h.hero_card1 && h.hero_card2 ? (
                    <span>
                      <CardText card={h.hero_card1} />
                      <CardText card={h.hero_card2} />
                    </span>
                  ) : '—'}
                </td>
                <td className="px-3 py-2 text-right font-mono text-gray-400 text-xs">
                  {h.hero_stack_before?.toLocaleString() || '—'}
                </td>
                <td className="px-3 py-2 text-right font-mono text-gray-400 text-xs">
                  {h.total_pot?.toLocaleString() || '—'}
                </td>
                <td className={`px-3 py-2 text-right font-mono text-xs font-medium ${
                  (h.hero_won || 0) > 0 ? 'text-emerald-400' :
                  (h.hero_won || 0) < 0 ? 'text-red-400' : 'text-gray-500'
                }`}>
                  {h.hero_won > 0 ? '+' : ''}{h.hero_won?.toLocaleString() || '0'}
                </td>
                <td className="px-3 py-2 text-center">
                  {h.is_hero_allin && <span className="text-[10px] bg-red-500/20 text-red-400 px-1 rounded">AI</span>}
                  {h.went_to_showdown && <span className="text-[10px] bg-blue-500/20 text-blue-400 px-1 rounded ml-1">SD</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function InfoCard({ label, value, color = 'text-gray-200' }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-poker-dark rounded-lg border border-poker-border p-3">
      <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-0.5">{label}</p>
      <p className={`text-lg font-bold font-mono ${color}`}>{value}</p>
    </div>
  );
}

function StackZoneBar({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <div className="flex items-center gap-2 text-[10px]">
      <span className="w-12 text-gray-400 text-right">{label}</span>
      <div className="flex-1 h-3 bg-poker-dark rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${Math.max(pct, 1)}%` }} />
      </div>
      <span className="w-8 text-gray-500 font-mono">{Math.round(pct)}%</span>
    </div>
  );
}

function CardText({ card }: { card: string }) {
  if (!card || card.length < 2) return <span>{card}</span>;
  const suit = card[1];
  const isRed = suit === 'h' || suit === 'd';
  const suitSymbol = { h: '♥', d: '♦', c: '♣', s: '♠' }[suit] || suit;
  return (
    <span className={isRed ? 'text-red-400' : 'text-gray-200'}>
      {card[0]}{suitSymbol}{' '}
    </span>
  );
}
