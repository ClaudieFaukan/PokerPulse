import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store/appStore';

interface Hand {
  id: number;
  hand_number: string;
  room: string;
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
  went_to_showdown: boolean;
  is_hero_allin: boolean;
  tournament_id: number;
}

const PAGE_SIZE = 50;

export default function HandHistory() {
  const navigate = useNavigate();
  const { filters } = useAppStore();
  const [hands, setHands] = useState<Hand[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [filterShowdown, setFilterShowdown] = useState(false);
  const [filterAllin, setFilterAllin] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const data = await window.api.getHands({
          room: filters.rooms.length === 1 ? filters.rooms[0] : undefined,
          dateFrom: filters.dateFrom,
          dateTo: filters.dateTo,
          limit: 5000,
        });
        if (!cancelled) {
          setHands(data);
          setPage(0);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [filters]);

  // Client-side filtering
  const filtered = hands.filter((h) => {
    if (filterShowdown && !h.went_to_showdown) return false;
    if (filterAllin && !h.is_hero_allin) return false;
    if (search) {
      const q = search.toLowerCase();
      const cards = `${h.hero_card1 || ''}${h.hero_card2 || ''}`.toLowerCase();
      const pos = (h.hero_position || '').toLowerCase();
      if (!cards.includes(q) && !pos.includes(q) && !h.hand_number.includes(q)) return false;
    }
    return true;
  });

  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Historique des mains</h2>
        <span className="text-sm text-gray-500">{filtered.length} main(s)</span>
      </div>

      {/* Search + filters */}
      <div className="flex items-center gap-3">
        <input
          type="text"
          placeholder="Rechercher (cartes, position, ID)..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          className="flex-1 max-w-xs bg-poker-card border border-poker-border rounded px-3 py-1.5 text-sm text-gray-200 placeholder-gray-600 focus:border-poker-green focus:outline-none"
        />
        <button
          onClick={() => { setFilterShowdown(!filterShowdown); setPage(0); }}
          className={`px-3 py-1.5 text-xs rounded transition-colors ${
            filterShowdown ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'bg-poker-card border border-poker-border text-gray-500'
          }`}
        >
          Showdown
        </button>
        <button
          onClick={() => { setFilterAllin(!filterAllin); setPage(0); }}
          className={`px-3 py-1.5 text-xs rounded transition-colors ${
            filterAllin ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-poker-card border border-poker-border text-gray-500'
          }`}
        >
          All-in
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin w-8 h-8 border-2 border-poker-green border-t-transparent rounded-full" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-poker-card rounded-lg border border-poker-border p-8 text-center text-gray-500">
          <p>Aucune main trouvée.</p>
        </div>
      ) : (
        <>
          <div className="bg-poker-card rounded-lg border border-poker-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-poker-border text-gray-500 text-xs uppercase tracking-wider">
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">Room</th>
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
                {paged.map((h) => (
                  <tr
                    key={h.id}
                    onClick={() => navigate(`/replayer/${h.id}`)}
                    className="border-b border-poker-border/50 hover:bg-white/5 cursor-pointer transition-colors"
                  >
                    <td className="px-3 py-2 text-gray-400 text-xs">
                      {h.datetime ? new Date(h.datetime).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`px-1.5 py-0.5 text-[10px] rounded font-medium uppercase ${
                        h.room === 'winamax' ? 'bg-red-500/20 text-red-400' :
                        h.room === 'pokerstars' ? 'bg-blue-500/20 text-blue-400' :
                        'bg-yellow-500/20 text-yellow-400'
                      }`}>
                        {h.room}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-400 text-xs">
                      {h.small_blind}/{h.big_blind}
                    </td>
                    <td className="px-3 py-2 text-xs font-medium text-gray-300">{h.hero_position || '—'}</td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {h.hero_card1 && h.hero_card2 ? (
                        <>
                          <CardText card={h.hero_card1} />
                          <CardText card={h.hero_card2} />
                        </>
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
