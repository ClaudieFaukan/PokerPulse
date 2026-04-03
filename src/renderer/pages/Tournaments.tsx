import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store/appStore';
import FilterBar from '../components/charts/FilterBar';

interface Tournament {
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
  hero_finish_position: number;
  hero_prize: number;
  hero_bounties_won: number;
  is_knockout: boolean;
  tournament_type: string;
  speed: string;
  hand_count: number;
  profit: number;
}

type SortKey = 'start_time' | 'room' | 'name' | 'buy_in' | 'total_players' | 'hero_finish_position' | 'hero_prize' | 'profit' | 'hand_count';
type SortDir = 'asc' | 'desc';

const PAGE_SIZE = 25;

export default function Tournaments() {
  const { filters } = useAppStore();
  const navigate = useNavigate();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('start_time');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(0);

  // Local filters
  const [searchName, setSearchName] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const data = await window.api.getTournaments({
          room: filters.rooms.length === 1 ? filters.rooms[0] : undefined,
          dateFrom: filters.dateFrom,
          dateTo: filters.dateTo,
          buyInMin: filters.buyInMin,
          buyInMax: filters.buyInMax,
          tournamentType: filters.tournamentTypes.length === 1 ? filters.tournamentTypes[0] : undefined,
        });
        if (!cancelled) {
          setTournaments(data);
          setPage(0);
        }
      } catch (err) {
        console.error('Failed to load tournaments:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [filters]);

  // Client-side filtering (search by name)
  const filtered = useMemo(() => {
    if (!searchName) return tournaments;
    const q = searchName.toLowerCase();
    return tournaments.filter((t) => {
      const name = (t.name || '').toLowerCase();
      const id = (t.tournament_id || '').toLowerCase();
      return name.includes(q) || id.includes(q);
    });
  }, [tournaments, searchName]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      let va: any = a[sortKey];
      let vb: any = b[sortKey];
      if (sortKey === 'start_time') { va = va || ''; vb = vb || ''; }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return copy;
  }, [filtered, sortKey, sortDir]);

  const paged = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const totalProfit = filtered.reduce((s, t) => s + (t.profit || 0), 0);
  const totalInvested = filtered.reduce((s, t) => s + (t.effective_cost != null ? t.effective_cost : t.buy_in + (t.bounty || 0) + t.fee), 0);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Tournois</h2>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-gray-500">{filtered.length} tournoi(s)</span>
          <span className={`font-mono font-medium ${totalProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {totalProfit >= 0 ? '+' : ''}{totalProfit.toFixed(2)}€
          </span>
          {totalInvested > 0 && (
            <span className="text-gray-500">
              ROI: <span className={`font-mono ${totalProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {(totalProfit / totalInvested * 100).toFixed(1)}%
              </span>
            </span>
          )}
        </div>
      </div>

      <FilterBar searchSlot={
        <input
          type="text"
          placeholder="Rechercher par nom..."
          value={searchName}
          onChange={(e) => { setSearchName(e.target.value); setPage(0); }}
          className="w-48 bg-poker-dark border border-poker-border rounded px-3 py-1 text-xs text-gray-200 placeholder-gray-600 focus:border-poker-green focus:outline-none"
        />
      } />

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin w-8 h-8 border-2 border-poker-green border-t-transparent rounded-full" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-poker-card rounded-lg border border-poker-border p-8 text-center text-gray-500">
          <p>Aucun tournoi trouvé.</p>
        </div>
      ) : (
        <>
          <div className="bg-poker-card rounded-lg border border-poker-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-poker-border text-gray-500 text-xs uppercase tracking-wider">
                  <SortHeader label="Date" sortKey="start_time" current={sortKey} dir={sortDir} onClick={toggleSort} />
                  <SortHeader label="Room" sortKey="room" current={sortKey} dir={sortDir} onClick={toggleSort} />
                  <SortHeader label="Tournoi" sortKey="name" current={sortKey} dir={sortDir} onClick={toggleSort} />
                  <SortHeader label="Buy-in" sortKey="buy_in" current={sortKey} dir={sortDir} onClick={toggleSort} align="right" />
                  <SortHeader label="Mains" sortKey="hand_count" current={sortKey} dir={sortDir} onClick={toggleSort} align="right" />
                  <SortHeader label="Joueurs" sortKey="total_players" current={sortKey} dir={sortDir} onClick={toggleSort} align="right" />
                  <SortHeader label="Finish" sortKey="hero_finish_position" current={sortKey} dir={sortDir} onClick={toggleSort} align="right" />
                  <SortHeader label="Prize" sortKey="hero_prize" current={sortKey} dir={sortDir} onClick={toggleSort} align="right" />
                  <SortHeader label="Profit" sortKey="profit" current={sortKey} dir={sortDir} onClick={toggleSort} align="right" />
                </tr>
              </thead>
              <tbody>
                {paged.map((t) => {
                  const cost = t.effective_cost != null ? t.effective_cost : t.buy_in + (t.bounty || 0) + t.fee;
                  return (
                    <tr
                      key={t.id}
                      onClick={() => navigate(`/tournaments/${t.id}`)}
                      className="border-b border-poker-border/50 hover:bg-white/5 cursor-pointer transition-colors"
                    >
                      <td className="px-3 py-2.5 text-gray-400 text-xs">
                        <div>{t.start_time ? new Date(t.start_time).toLocaleDateString('fr-FR') : '—'}</div>
                        {t.start_time && (
                          <div className="text-gray-600 text-[10px]">{new Date(t.start_time).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</div>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <RoomBadge room={t.room} />
                      </td>
                      <td className="px-3 py-2.5 truncate max-w-48">
                        <div className="text-gray-300">{t.name || `#${t.tournament_id}`}</div>
                        <div className="text-[10px] text-gray-600 font-mono">#{t.tournament_id}</div>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-gray-300">
                        {cost.toFixed(2)}€
                        {t.effective_cost != null && t.effective_cost !== t.buy_in + (t.bounty || 0) + t.fee && (
                          <span className="text-[9px] text-yellow-500 ml-1" title={`Buy-in original: ${t.buy_in}€${t.bounty ? ` + ${t.bounty}€ KO` : ''} + ${t.fee}€`}>*</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-gray-400">
                        {t.hand_count || '—'}
                      </td>
                      <td className="px-3 py-2.5 text-right text-gray-400">
                        {t.total_players || '—'}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-gray-300">
                        {t.hero_finish_position
                          ? `${t.hero_finish_position}${t.total_players ? `/${t.total_players}` : ''}`
                          : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-gray-300">
                        {(t.hero_prize || 0).toFixed(2)}€
                        {t.hero_bounties_won > 0 && (
                          <span className="text-[10px] text-yellow-400 ml-1" title={`dont ${t.hero_bounties_won.toFixed(2)}€ de bounties`}>
                            ({t.hero_bounties_won.toFixed(2)}€ KO)
                          </span>
                        )}
                      </td>
                      <td className={`px-3 py-2.5 text-right font-mono font-medium ${
                        (t.profit || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'
                      }`}>
                        {(t.profit || 0) >= 0 ? '+' : ''}{(t.profit || 0).toFixed(2)}€
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => setPage(Math.max(0, page - 1))}
                disabled={page === 0}
                className="px-3 py-1 text-xs rounded bg-poker-card border border-poker-border text-gray-400 hover:text-gray-200 disabled:opacity-30"
              >
                Précédent
              </button>
              <span className="text-xs text-gray-500">{page + 1} / {totalPages}</span>
              <button
                onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                disabled={page >= totalPages - 1}
                className="px-3 py-1 text-xs rounded bg-poker-card border border-poker-border text-gray-400 hover:text-gray-200 disabled:opacity-30"
              >
                Suivant
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SortHeader({
  label, sortKey, current, dir, onClick, align = 'left',
}: {
  label: string; sortKey: SortKey; current: SortKey; dir: SortDir;
  onClick: (key: SortKey) => void; align?: 'left' | 'right';
}) {
  const isActive = current === sortKey;
  return (
    <th
      onClick={() => onClick(sortKey)}
      className={`px-3 py-2 cursor-pointer select-none hover:text-gray-300 transition-colors ${
        align === 'right' ? 'text-right' : 'text-left'
      } ${isActive ? 'text-poker-green' : ''}`}
    >
      {label}
      {isActive && <span className="ml-1">{dir === 'asc' ? '↑' : '↓'}</span>}
    </th>
  );
}

function RoomBadge({ room }: { room: string }) {
  const colors: Record<string, string> = {
    winamax: 'bg-red-500/20 text-red-400',
    pokerstars: 'bg-blue-500/20 text-blue-400',
    pmu: 'bg-yellow-500/20 text-yellow-400',
  };
  return (
    <span className={`px-1.5 py-0.5 text-[10px] rounded font-medium uppercase ${colors[room] || 'bg-gray-500/20 text-gray-400'}`}>
      {room}
    </span>
  );
}
