import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useReplayerState, ReplayerHand } from '../hooks/useReplayerState';
import TableView from '../components/replayer/TableView';
import ActionLog from '../components/replayer/ActionLog';
import Controls from '../components/replayer/Controls';
import PlayerStatsModal from '../components/PlayerStatsModal';

export interface QuickPlayerStats {
  vpip: number;
  pfr: number;
  threeBet: number;
  hands: number;
}

interface TournamentContext {
  name: string;
  buyIn: number;
  fee: number;
  bounty: number;
  totalPlayers: number;
  heroFinishPosition: number;
  heroPrize: number;
  tournamentType: string;
  isKnockout: boolean;
  prizePool: number;
  itmEstimate: number;
  playersRemaining: number;
  handNumber: number;
  totalHands: number;
  nearBubble: boolean;
  inTheMoney: boolean;
  nearFinalTable: boolean;
  atFinalTable: boolean;
}

export default function Replayer() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [hand, setHand] = useState<ReplayerHand | null>(null);
  const [tournamentCtx, setTournamentCtx] = useState<TournamentContext | null>(null);
  const [prevHandId, setPrevHandId] = useState<number | null>(null);
  const [nextHandId, setNextHandId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showBB, setShowBB] = useState(false);
  const [playerStats, setPlayerStats] = useState<Record<string, QuickPlayerStats>>({});
  const [selectedPlayer, setSelectedPlayer] = useState<{ id: number; name: string; room: string } | null>(null);
  const statsCache = useRef<Record<string, Record<string, QuickPlayerStats>>>({});

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await window.api.getHand(parseInt(id!, 10));
        if (cancelled) return;

        if (!data) {
          setError('Main introuvable.');
          setHand(null);
          return;
        }

        const players = parsePlayersFromRaw(data.raw_text, data.room);
        const buttonSeat = parseButtonSeat(data.raw_text, data.room);
        const showdownCards = parseShowdownCards(data.raw_text);

        const replayerHand = { ...data, players, buttonSeat, showdownCards };
        setHand(replayerHand);
        setTournamentCtx(data.tournamentContext || null);
        setPrevHandId(data.prevHandId || null);
        setNextHandId(data.nextHandId || null);

        // Load quick stats for table players (use cache by room)
        const room = data.room;
        const cached = statsCache.current[room];
        const uncachedPlayers = players.filter((p) => !p.isHero && !(cached && cached[p.name]));

        if (uncachedPlayers.length > 0) {
          const quickStats = await window.api.getPlayerQuickStats(
            uncachedPlayers.map((p) => ({ name: p.name, room }))
          );
          if (!cancelled) {
            if (!statsCache.current[room]) statsCache.current[room] = {};
            Object.assign(statsCache.current[room], quickStats);
          }
        }

        if (!cancelled) {
          // Merge cached + new stats for current table
          const tableStats: Record<string, QuickPlayerStats> = {};
          const roomCache = statsCache.current[room] || {};
          for (const p of players) {
            if (roomCache[p.name]) tableStats[p.name] = roomCache[p.name];
          }
          setPlayerStats(tableStats);
        }
      } catch (err: any) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [id]);

  const {
    tableState, currentEquities, streetEquities, actionIndex, totalActions, stepIndex, totalSteps, isPlaying, speed,
    setSpeed, togglePlay, next, prev, goToStart, goToEnd, goTo,
  } = useReplayerState(hand, tournamentCtx?.bountyChipRatio);

  const handleAnalyze = async () => {
    if (!hand) return;
    // Build a prompt for Claude with full context
    const lines: string[] = [];

    if (tournamentCtx) {
      lines.push(`Je joue un ${tournamentCtx.isKnockout ? 'KO ' : ''}MTT "${tournamentCtx.name}" (${tournamentCtx.buyIn + (tournamentCtx.bounty || 0) + tournamentCtx.fee}€).`);
      if (tournamentCtx.totalPlayers > 0) {
        lines.push(`${tournamentCtx.totalPlayers} joueurs inscrits, ITM estimé ~${tournamentCtx.itmEstimate} places.`);
        if (tournamentCtx.playersRemaining > 0) {
          lines.push(`Il reste environ ${tournamentCtx.playersRemaining} joueurs.`);
          if (tournamentCtx.nearBubble) lines.push('*** NOUS SOMMES PROCHES DE LA BULLE ITM ***');
          if (tournamentCtx.atFinalTable) lines.push('*** TABLE FINALE ***');
          else if (tournamentCtx.nearFinalTable) lines.push('*** PROCHE DE LA TABLE FINALE ***');
        }
      }
      lines.push('');
    }

    lines.push(`Level ${hand.level} (${hand.small_blind}/${hand.big_blind}${hand.ante > 0 ? ` ante ${hand.ante}` : ''})`);
    lines.push(`Ma main : ${hand.hero_card1} ${hand.hero_card2}`);
    lines.push('');

    lines.push('Stacks à la table :');
    for (const p of hand.players) {
      const bb = Math.round(p.stack / hand.big_blind);
      lines.push(`  ${p.name}${p.isHero ? ' (Hero)' : ''}: ${bb}bb (${p.stack})`);
    }
    lines.push('');

    let currentStreet = '';
    for (const a of hand.actions) {
      if (a.street !== currentStreet) {
        currentStreet = a.street;
        if (currentStreet === 'flop' && hand.flop_card1) lines.push(`\nFlop: [${hand.flop_card1} ${hand.flop_card2} ${hand.flop_card3}]`);
        else if (currentStreet === 'turn' && hand.turn_card) lines.push(`Turn: [${hand.turn_card}]`);
        else if (currentStreet === 'river' && hand.river_card) lines.push(`River: [${hand.river_card}]`);
        else if (currentStreet === 'preflop') lines.push('Action preflop :');
      }
      if (!['post_ante', 'post_blind'].includes(a.action_type)) {
        lines.push(`  ${a.player_name} ${a.action_type}${a.amount ? ' ' + a.amount : ''}`);
      }
    }

    lines.push('\nAnalyse cette main en détail. Qu\'est-ce que tu aurais fait différemment et pourquoi ? Considère l\'ICM, les dynamiques de table, et les ranges théoriques.');

    await navigator.clipboard.writeText(lines.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!id) {
    return (
      <div className="p-6">
        <h2 className="text-2xl font-bold mb-6">Replayer</h2>
        <div className="bg-poker-card rounded-lg border border-poker-border p-8 text-center text-gray-500">
          <p>Sélectionnez une main depuis l'historique ou un tournoi.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin w-8 h-8 border-2 border-poker-green border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error || !hand) {
    return (
      <div className="p-6">
        <h2 className="text-2xl font-bold mb-6">Replayer</h2>
        <div className="bg-poker-card rounded-lg border border-poker-border p-8 text-center text-red-400">
          <p>{error || 'Main introuvable.'}</p>
        </div>
      </div>
    );
  }

  const heroCards: [string, string] | null =
    hand.hero_card1 && hand.hero_card2 ? [hand.hero_card1, hand.hero_card2] : null;

  const heroFoldedPreflop = hand.actions.some(
    (a) => a.is_hero && a.action_type === 'fold' && a.street === 'preflop'
  );
  const handPlayed = !heroFoldedPreflop;

  return (
    <div className="p-4 space-y-2 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="text-gray-500 hover:text-gray-300 transition-colors text-sm">
            ← Retour
          </button>
          <h2 className="text-lg font-bold">Main #{hand.hand_number}</h2>
          <span className="text-xs text-gray-500">
            Lv{hand.level} ({hand.small_blind}/{hand.big_blind}{hand.ante > 0 ? `/${hand.ante}` : ''})
          </span>
          <span className={`px-1.5 py-0.5 text-[10px] rounded font-medium uppercase ${
            hand.room === 'winamax' ? 'bg-red-500/20 text-red-400' :
            hand.room === 'pokerstars' ? 'bg-blue-500/20 text-blue-400' :
            'bg-yellow-500/20 text-yellow-400'
          }`}>
            {hand.room}
          </span>
          {/* M-ratio & effective stack */}
          {(() => {
            const hero = tableState.players.find((p) => p.isHero);
            if (!hero || hand.big_blind <= 0) return null;
            const mRatio = hero.stack / (hand.small_blind + hand.big_blind);
            const opponents = tableState.players.filter((p) => !p.isHero && !p.folded);
            const effectiveStack = opponents.length > 0
              ? Math.min(hero.stack, Math.min(...opponents.map((p) => p.stack)))
              : hero.stack;
            const effBB = effectiveStack / hand.big_blind;
            const mColor = mRatio < 5 ? 'text-red-400' : mRatio < 10 ? 'text-yellow-400' : mRatio < 20 ? 'text-blue-400' : 'text-emerald-400';
            return (
              <div className="flex items-center gap-2 ml-2">
                <span className={`text-xs font-mono ${mColor}`} title="M-ratio (stack / blinds+antes)">
                  M={mRatio.toFixed(1)}
                </span>
                <span className="text-xs font-mono text-gray-500" title="Stack effectif en BB">
                  Eff={effBB.toFixed(1)}bb
                </span>
              </div>
            );
          })()}
        </div>

        <div className="flex items-center gap-2">
          {/* BB toggle */}
          <div className="flex items-center gap-1 bg-poker-dark rounded border border-poker-border">
            <button
              onClick={() => setShowBB(false)}
              className={`px-2 py-1 text-[10px] rounded transition-colors ${!showBB ? 'bg-poker-green text-white' : 'text-gray-400 hover:text-gray-200'}`}
            >
              Chips
            </button>
            <button
              onClick={() => setShowBB(true)}
              className={`px-2 py-1 text-[10px] rounded transition-colors ${showBB ? 'bg-poker-green text-white' : 'text-gray-400 hover:text-gray-200'}`}
            >
              BB
            </button>
          </div>
          {/* Analyze button */}
          <button
            onClick={handleAnalyze}
            className="px-3 py-1 text-xs bg-poker-blue/20 border border-poker-blue/30 rounded text-poker-blue hover:bg-poker-blue/30 transition-colors"
          >
            {copied ? 'Copié !' : 'Analyser avec Claude'}
          </button>
        </div>
      </div>

      {/* Tournament context bar */}
      {tournamentCtx && tournamentCtx.totalPlayers > 0 && (
        <div className="flex items-center gap-3 px-3 py-1.5 bg-poker-card rounded border border-poker-border text-xs">
          <span className="text-gray-400 truncate max-w-48">{tournamentCtx.name}</span>
          <span className="text-gray-600">|</span>
          <span className="text-gray-400">{tournamentCtx.totalPlayers} joueurs</span>
          {tournamentCtx.playersRemaining > 0 && (
            <>
              <span className="text-gray-600">|</span>
              <span className="text-gray-300">~{tournamentCtx.playersRemaining} restants</span>
            </>
          )}
          {tournamentCtx.itmEstimate > 0 && (
            <>
              <span className="text-gray-600">|</span>
              <span className="text-gray-400">ITM ~{tournamentCtx.itmEstimate} places</span>
            </>
          )}
          {tournamentCtx.nearBubble && (
            <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-400 rounded font-bold animate-pulse">
              BULLE
            </span>
          )}
          {tournamentCtx.atFinalTable && (
            <span className="px-2 py-0.5 bg-red-500/20 text-red-400 rounded font-bold">
              TABLE FINALE
            </span>
          )}
          {tournamentCtx.nearFinalTable && !tournamentCtx.atFinalTable && (
            <span className="px-2 py-0.5 bg-orange-500/20 text-orange-400 rounded font-bold">
              PROCHE FT
            </span>
          )}
          <span className="ml-auto text-gray-600">
            Main {tournamentCtx.handNumber}/{tournamentCtx.totalHands}
          </span>
        </div>
      )}

      {/* Main content: Table + Action log */}
      <div className="grid grid-cols-[1fr_320px] gap-3 flex-1 min-h-0">
        <div className="bg-poker-card rounded-lg border border-poker-border p-2 flex items-center justify-center">
          <div className="w-full max-w-2xl">
            <TableView
              state={tableState}
              buttonSeat={hand.buttonSeat}
              bountyChipRatio={tournamentCtx?.bountyChipRatio}
              currentBB={hand.big_blind}
              showBB={showBB}
              playerStats={playerStats}
              equities={currentEquities}
              onPlayerClick={(name) => {
                // Find player ID for modal
                window.api.searchPlayers(name).then((results: any[]) => {
                  const match = results.find((r: any) => r.name === name && r.room === hand.room);
                  if (match) setSelectedPlayer({ id: match.id, name: match.name, room: match.room });
                });
              }}
            />
          </div>
        </div>
        <div className="flex flex-col gap-2 min-h-0">
          <ActionLog
            actions={hand.actions}
            currentIndex={actionIndex}
            heroCards={heroCards}
            board={tableState.board}
            pot={tableState.pot}
            showBB={showBB}
            currentBB={hand.big_blind}
          />

          {/* Equity evolution panel */}
          {streetEquities.length > 0 && (
            <div className="bg-poker-card rounded-lg border border-poker-border p-3 shrink-0">
              <h4 className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">Evolution Equity</h4>
              <div className="space-y-1">
                {/* Player legend */}
                <div className="flex flex-wrap gap-2 mb-1.5">
                  {streetEquities[0].players.map((p) => {
                    const isHero = hand.players.find((hp) => hp.isHero)?.name === p.name;
                    return (
                      <span key={p.name} className={`text-[9px] font-medium ${isHero ? 'text-poker-green' : 'text-gray-400'}`}>
                        {p.name}
                      </span>
                    );
                  })}
                </div>
                {/* Street rows */}
                <table className="w-full text-[10px]">
                  <thead>
                    <tr className="text-gray-600">
                      <th className="text-left font-normal w-14">Street</th>
                      {streetEquities[0].players.map((p) => (
                        <th key={p.name} className="text-right font-normal">{p.name.slice(0, 8)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {streetEquities.map((se) => {
                      const isCurrentStreet = (
                        (se.street === 'Preflop' && tableState.board.length === 0) ||
                        (se.street === 'Flop' && tableState.board.length === 3) ||
                        (se.street === 'Turn' && tableState.board.length === 4) ||
                        (se.street === 'River' && tableState.board.length === 5)
                      );
                      return (
                        <tr key={se.street} className={isCurrentStreet ? 'bg-white/5' : ''}>
                          <td className="text-gray-500 py-0.5">{se.street}</td>
                          {se.players.map((p) => (
                            <td key={p.name} className={`text-right font-mono py-0.5 ${
                              p.equity >= 0.5 ? 'text-emerald-400' : p.equity >= 0.3 ? 'text-yellow-400' : 'text-red-400'
                            } ${isCurrentStreet ? 'font-bold' : ''}`}>
                              {(p.equity * 100).toFixed(1)}%
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Player stats modal */}
      {selectedPlayer && (
        <PlayerStatsModal
          playerId={selectedPlayer.id}
          playerName={selectedPlayer.name}
          playerRoom={selectedPlayer.room}
          onClose={() => setSelectedPlayer(null)}
        />
      )}

      {/* Controls */}
      <Controls
        actionIndex={stepIndex}
        totalActions={totalSteps}
        isPlaying={isPlaying}
        speed={speed}
        handPlayed={handPlayed}
        onTogglePlay={togglePlay}
        onNext={next}
        onPrev={prev}
        onGoToStart={goToStart}
        onGoToEnd={goToEnd}
        onGoTo={goTo}
        onSetSpeed={setSpeed}
        onPrevHand={prevHandId ? () => navigate(`/replayer/${prevHandId}`) : undefined}
        onNextHand={nextHandId ? () => navigate(`/replayer/${nextHandId}`) : undefined}
      />
    </div>
  );
}

function parsePlayersFromRaw(rawText: string, room: string): ReplayerHand['players'] {
  const players: ReplayerHand['players'] = [];
  if (!rawText) return players;

  // PMU XML format
  if (room === 'pmu' && rawText.includes('<player ')) {
    const heroName = rawText.match(/<nickname>(.+?)<\/nickname>/)?.[1] || '';
    const playerRegex = /<player\s+([^>]+)\/>/g;
    let pm;
    while ((pm = playerRegex.exec(rawText)) !== null) {
      const attrs = pm[1];
      const seat = parseInt(attrs.match(/seat="(\d+)"/)?.[1] || '0', 10);
      const name = attrs.match(/name="([^"]+)"/)?.[1] || '';
      const chips = parseFloat((attrs.match(/chips="([^"]+)"/)?.[1] || '0').replace(/\s/g, ''));
      if (seat > 0 && name) {
        players.push({ seat, name, stack: chips, bounty: 0, isHero: name === heroName });
      }
    }
    // Deduplicate: XML repeats players per game, keep first occurrence (highest chips = start of hand)
    const seen = new Set<string>();
    const unique: ReplayerHand['players'] = [];
    for (const p of players) {
      if (!seen.has(p.name)) { seen.add(p.name); unique.push(p); }
    }
    return unique;
  }

  // Text format (Winamax / PokerStars)
  const lines = rawText.split('\n');
  const seatRegex = /^Seat\s+(\d+):\s+(.+?)\s+\((\d+)(?:,\s*([\d.,]+)€?\s*bounty)?(?:\s+in chips)?\)/;

  for (const line of lines) {
    const m = line.trim().match(seatRegex);
    if (m) {
      const bountyStr = m[4];
      const bounty = bountyStr ? parseFloat(bountyStr.replace(',', '.')) : 0;
      players.push({
        seat: parseInt(m[1], 10),
        name: m[2],
        stack: parseFloat(m[3]),
        bounty,
        isHero: false,
      });
    }
  }

  const dealtRegex = /Dealt to\s+(.+?)\s+\[/;
  for (const line of lines) {
    const m = line.trim().match(dealtRegex);
    if (m) {
      for (const p of players) p.isHero = p.name === m[1];
      break;
    }
  }

  return players;
}

function parseShowdownCards(rawText: string): Map<string, [string, string]> {
  const cards = new Map<string, [string, string]>();
  if (!rawText) return cards;

  // PMU XML: <cards player="Name" type="Pocket">HK S9</cards>
  if (rawText.includes('<cards ')) {
    const pocketRegex = /<cards\s+player="([^"]+)"\s+type="Pocket">(.+?)<\/cards>/g;
    let pm;
    while ((pm = pocketRegex.exec(rawText)) !== null) {
      const cardStrs = pm[2].trim().split(/\s+/);
      if (cardStrs.length >= 2 && cardStrs[0] !== 'X') {
        const c1 = convertPmuCardForReplayer(cardStrs[0]);
        const c2 = convertPmuCardForReplayer(cardStrs[1]);
        if (c1 && c2) cards.set(pm[1], [c1, c2]);
      }
    }
  }

  // Winamax/PS: "Player shows [Ah 3s]"
  const showRegex = /^(.+?)\s+shows\s+\[(\w{2})\s+(\w{2})\]/gm;
  let m;
  while ((m = showRegex.exec(rawText)) !== null) {
    cards.set(m[1].trim(), [m[2], m[3]]);
  }

  return cards;
}

/** Convert PMU card format (e.g. "HK", "D9", "S10") to standard ("Kh", "9d", "Ts") */
function convertPmuCardForReplayer(pmuCard: string): string {
  if (!pmuCard || pmuCard === 'X') return '';
  const suitMap: Record<string, string> = { S: 's', H: 'h', D: 'd', C: 'c' };
  const suit = suitMap[pmuCard[0]] || pmuCard[0].toLowerCase();
  const rank = pmuCard.slice(1);
  const rankNorm = rank === '10' ? 'T' : rank;
  return rankNorm + suit;
}

function parseButtonSeat(rawText: string, room: string): number {
  if (!rawText) return 1;
  // PMU XML: dealer="1" in player tag
  if (room === 'pmu' && rawText.includes('<player ')) {
    const dealerMatch = rawText.match(/<player\s[^>]*dealer="1"[^>]*seat="(\d+)"/);
    if (dealerMatch) return parseInt(dealerMatch[1], 10);
    // Attribute order may vary
    const dealerMatch2 = rawText.match(/<player\s[^>]*seat="(\d+)"[^>]*dealer="1"/);
    if (dealerMatch2) return parseInt(dealerMatch2[1], 10);
  }
  // PokerStars
  const m1 = rawText.match(/Seat\s+#(\d+)\s+is the button/);
  if (m1) return parseInt(m1[1], 10);
  // Winamax
  const m2 = rawText.match(/Button:\s+Seat\s+(\d+)/);
  if (m2) return parseInt(m2[1], 10);
  return 1;
}
