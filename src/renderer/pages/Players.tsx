import { useState, useCallback } from 'react';
import PlayerStatsModal from '../components/PlayerStatsModal';

interface PlayerResult {
  id: number;
  name: string;
  room: string;
  hands_played: number;
  vpip: number;
  pfr: number;
}

export default function Players() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlayerResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerResult | null>(null);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setLoading(true);
    setSearched(true);
    const data = await window.api.searchPlayers(query.trim());
    setResults(data);
    setLoading(false);
  }, [query]);

  return (
    <div className="p-6 space-y-4">
      <h2 className="text-2xl font-bold">Joueurs</h2>

      {/* Search bar */}
      <div className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="Rechercher un joueur..."
          className="flex-1 bg-poker-card border border-poker-border rounded-lg px-4 py-2 text-sm text-gray-200 placeholder-gray-600 focus:border-poker-green focus:outline-none"
        />
        <button
          onClick={handleSearch}
          disabled={loading || !query.trim()}
          className="px-5 py-2 bg-poker-green text-white text-sm rounded-lg hover:bg-poker-green/80 disabled:opacity-50 transition-colors"
        >
          {loading ? 'Recherche...' : 'Rechercher'}
        </button>
      </div>

      {/* Results */}
      {searched && (
        <div className="bg-poker-card rounded-lg border border-poker-border overflow-hidden">
          {results.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-8">Aucun joueur trouvé.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-poker-border text-gray-500 text-xs uppercase tracking-wider">
                  <th className="px-4 py-2.5 text-left">Joueur</th>
                  <th className="px-4 py-2.5 text-left">Room</th>
                  <th className="px-4 py-2.5 text-right">Mains</th>
                  <th className="px-4 py-2.5 text-right">VPIP</th>
                  <th className="px-4 py-2.5 text-right">PFR</th>
                  <th className="px-4 py-2.5 text-right">Gap</th>
                </tr>
              </thead>
              <tbody>
                {results.map((p) => {
                  const gap = p.vpip - p.pfr;
                  return (
                    <tr
                      key={p.id}
                      onClick={() => setSelectedPlayer(p)}
                      className="border-b border-poker-border/50 hover:bg-white/5 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-2.5 font-medium text-gray-200">{p.name}</td>
                      <td className="px-4 py-2.5">
                        <span className={`px-1.5 py-0.5 text-[10px] rounded font-medium uppercase ${
                          p.room === 'winamax' ? 'bg-red-500/20 text-red-400' :
                          p.room === 'pokerstars' ? 'bg-blue-500/20 text-blue-400' :
                          'bg-yellow-500/20 text-yellow-400'
                        }`}>
                          {p.room}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-gray-400">{p.hands_played}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-gray-300">{p.vpip}%</td>
                      <td className="px-4 py-2.5 text-right font-mono text-gray-300">{p.pfr}%</td>
                      <td className={`px-4 py-2.5 text-right font-mono ${gap > 10 ? 'text-red-400' : gap > 6 ? 'text-yellow-400' : 'text-emerald-400'}`}>
                        {gap.toFixed(1)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Stats modal */}
      {selectedPlayer && (
        <PlayerStatsModal
          playerId={selectedPlayer.id}
          playerName={selectedPlayer.name}
          playerRoom={selectedPlayer.room}
          onClose={() => setSelectedPlayer(null)}
        />
      )}
    </div>
  );
}
