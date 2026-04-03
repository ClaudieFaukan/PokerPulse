import { useState, useCallback } from 'react';
import type { TableState, PlayerState, PlayerEquity } from '../../hooks/useReplayerState';

interface QuickPlayerStats {
  vpip: number;
  pfr: number;
  threeBet: number;
  hands: number;
}

interface TableViewProps {
  state: TableState;
  buttonSeat: number;
  bountyChipRatio?: number; // how many chips 1€ of bounty is worth
  currentBB?: number;       // current big blind for BB conversion
  showBB?: boolean;         // display stacks/bets in BB instead of chips
  playerStats?: Record<string, QuickPlayerStats>;
  equities?: PlayerEquity[] | null; // current equity per player (all-in)
  onPlayerClick?: (playerName: string) => void;
}

/** Format a chip amount — optionally as BB */
function formatAmount(amount: number, showBB?: boolean, bb?: number): string {
  if (showBB && bb && bb > 0) {
    const bbVal = amount / bb;
    return bbVal % 1 === 0 ? `${bbVal}bb` : `${bbVal.toFixed(1)}bb`;
  }
  return amount.toLocaleString();
}

// Visual positions around the table — counter-clockwise from bottom
// So the NEXT player in action order (clockwise) sits to the LEFT visually
// This matches real poker: if you're CO, BTN is to your left
const LAYOUT_6: { x: number; y: number }[] = [
  { x: 50, y: 92 },  // 0: bottom center (hero seat)
  { x: 5, y: 65 },   // 1: left bottom (next in action = left)
  { x: 5, y: 35 },   // 2: left top
  { x: 50, y: 8 },   // 3: top center
  { x: 95, y: 35 },  // 4: right top
  { x: 95, y: 65 },  // 5: right bottom
];

const LAYOUT_9: { x: number; y: number }[] = [
  { x: 50, y: 92 },  // 0: bottom center
  { x: 15, y: 78 },  // 1: left
  { x: 2, y: 50 },   // 2
  { x: 15, y: 22 },  // 3
  { x: 38, y: 8 },   // 4
  { x: 62, y: 8 },   // 5
  { x: 85, y: 22 },  // 6
  { x: 98, y: 50 },  // 7
  { x: 85, y: 78 },  // 8: right
];

function chipOffset(px: number, py: number): { x: number; y: number } {
  const cx = 50, cy = 50;
  const dx = cx - px, dy = cy - py;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const norm = dist > 0 ? 18 / dist : 0;
  return { x: px + dx * norm, y: py + dy * norm };
}

/**
 * Determine position labels for each player based on button seat.
 */
function getPositionLabels(players: PlayerState[], buttonSeat: number): Map<number, string> {
  const labels = new Map<number, string>();
  const seats = players.map((p) => p.seat).sort((a, b) => a - b);
  const n = seats.length;
  if (n === 0) return labels;

  const btnIdx = seats.indexOf(buttonSeat);
  if (btnIdx === -1) return labels;

  for (let i = 0; i < n; i++) {
    const dist = (i - btnIdx + n) % n;
    let label = '';
    if (dist === 0) label = 'BTN';
    else if (dist === 1) label = 'SB';
    else if (dist === 2) label = 'BB';
    else {
      const remaining = n - 3;
      const fromBB = dist - 2;
      if (remaining <= 0) label = '';
      else if (fromBB === remaining) label = 'CO';
      else if (fromBB === 1) label = 'UTG';
      else if (fromBB === 2 && remaining >= 4) label = 'UTG+1';
      else if (fromBB === remaining - 1 && remaining >= 4) label = 'HJ';
      else label = 'MP';
    }
    labels.set(seats[i], label);
  }

  return labels;
}

export default function TableView({ state, buttonSeat, bountyChipRatio, currentBB, showBB, playerStats, equities, onPlayerClick }: TableViewProps) {
  // Which player index sits at position 0 (bottom). Default: hero.
  const [anchorPlayerIdx, setAnchorPlayerIdx] = useState<number | null>(null);

  const numPlayers = state.players.length;
  const layout = numPlayers <= 6 ? LAYOUT_6 : LAYOUT_9;
  const positionLabels = getPositionLabels(state.players, buttonSeat);

  // Find hero index by default
  const heroIdx = state.players.findIndex((p) => p.isHero);
  const anchor = anchorPlayerIdx ?? (heroIdx >= 0 ? heroIdx : 0);

  // Assign visual positions: anchor player goes to slot 0, others follow clockwise
  const seatAssignments = state.players.map((p, i) => {
    const visualSlot = (i - anchor + numPlayers) % numPlayers;
    const pos = layout[visualSlot % layout.length];
    return { player: p, pos, playerIdx: i };
  });

  const handleContextMenu = useCallback((e: React.MouseEvent, playerIdx: number) => {
    e.preventDefault();
    setAnchorPlayerIdx(playerIdx);
  }, []);

  return (
    <div className="relative w-full" style={{ paddingBottom: '56%' }}>
      <div className="absolute inset-0">
        {/* Table felt */}
        <div className="absolute inset-8 rounded-[50%] bg-gradient-to-b from-emerald-900/80 to-emerald-950/80 border-4 border-emerald-800/60 shadow-[inset_0_0_60px_rgba(0,0,0,0.4)]" />
        <div className="absolute inset-14 rounded-[50%] border border-emerald-700/30" />

        {/* Center: Pot + Board */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
          {state.board.length > 0 && (
            <div className="flex gap-1 justify-center mb-2">
              {state.board.map((card, i) => (
                <CardDisplay key={i} card={card} />
              ))}
              {Array.from({ length: 5 - state.board.length }).map((_, i) => (
                <div key={`empty-${i}`} className="w-10 h-14 rounded bg-emerald-800/40 border border-emerald-700/30" />
              ))}
            </div>
          )}
          {state.pot > 0 && (
            <div className="flex items-center justify-center gap-1.5">
              <ChipStack amount={state.pot} />
              <span className="text-sm text-yellow-400 font-mono font-bold">{formatAmount(state.pot, showBB, currentBB)}</span>
            </div>
          )}

          {/* Hero equity decision panel */}
          {state.heroDecision && (
            <div className="mt-2 bg-black/60 rounded-lg px-3 py-2 border border-poker-green/40 text-xs">
              <div className="flex items-center gap-3">
                <div className="text-center">
                  <p className="text-gray-500 text-[9px]">A payer</p>
                  <p className="text-white font-mono font-bold">{state.heroDecision.toCall.toLocaleString()}</p>
                </div>
                <div className="text-center">
                  <p className="text-gray-500 text-[9px]">Cotes du pot</p>
                  <p className="text-blue-400 font-mono font-bold">{state.heroDecision.odds}</p>
                </div>
                <div className="text-center">
                  <p className="text-gray-500 text-[9px]">Equity requise</p>
                  <p className="text-yellow-400 font-mono font-bold">{state.heroDecision.equityNeeded}%</p>
                </div>
                {state.heroDecision.equityWithBounty !== null ? (
                  <div className="text-center border-l border-orange-500/30 pl-3">
                    <p className="text-gray-500 text-[9px]">Avec bounty</p>
                    <p className="text-orange-400 font-mono font-bold">{state.heroDecision.equityWithBounty}%</p>
                    <p className="text-orange-400/60 text-[8px]">+{state.heroDecision.bountyChips.toLocaleString()} chips dead money</p>
                  </div>
                ) : !state.heroDecision.heroCoversBettor && state.heroDecision.bountyChips === 0 ? null : (
                  <div className="text-center border-l border-gray-600 pl-3">
                    <p className="text-gray-500 text-[9px]">Bounty</p>
                    <p className="text-gray-500 font-mono text-[10px]">Pas de KO possible</p>
                    <p className="text-gray-600 text-[8px]">(adversaire vous couvre)</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Player bet chips (between player and center) */}
        {seatAssignments.map(({ player, pos }) => {
          if (player.currentBet <= 0) return null;
          const cp = chipOffset(pos.x, pos.y);
          return (
            <div
              key={`bet-${player.seat}`}
              className="absolute -translate-x-1/2 -translate-y-1/2 flex items-center gap-1"
              style={{ left: `${cp.x}%`, top: `${cp.y}%` }}
            >
              <ChipStack amount={player.currentBet} small />
              <span className="text-[10px] font-mono text-yellow-300 font-bold">
                {formatAmount(player.currentBet, showBB, currentBB)}
              </span>
            </div>
          );
        })}

        {/* Player seats */}
        {seatAssignments.map(({ player, pos, playerIdx }) => (
          <PlayerSeat
            key={player.seat}
            player={player}
            x={pos.x}
            y={pos.y}
            isButton={player.seat === buttonSeat}
            positionLabel={positionLabels.get(player.seat) || ''}
            bountyChipRatio={bountyChipRatio}
            currentBB={currentBB}
            showBB={showBB}
            quickStats={playerStats?.[player.name]}
            equity={equities?.find((e) => e.name === player.name)?.equity}
            onPlayerClick={onPlayerClick}
            onContextMenu={(e) => handleContextMenu(e, playerIdx)}
          />
        ))}
      </div>
    </div>
  );
}

function PlayerSeat({ player, x, y, isButton, positionLabel, onContextMenu, bountyChipRatio, currentBB, showBB, quickStats, equity, onPlayerClick }: {
  player: PlayerState;
  x: number;
  y: number;
  isButton: boolean;
  positionLabel: string;
  onContextMenu: (e: React.MouseEvent) => void;
  bountyChipRatio?: number;
  currentBB?: number;
  showBB?: boolean;
  quickStats?: QuickPlayerStats;
  equity?: number;
  onPlayerClick?: (name: string) => void;
}) {
  const opacity = player.folded ? 'opacity-40' : 'opacity-100';

  const actionColor = player.lastAction?.startsWith('FOLD') ? 'text-gray-500'
    : player.lastAction?.startsWith('CHECK') ? 'text-gray-400'
    : player.lastAction?.startsWith('CALL') ? 'text-blue-400'
    : player.lastAction?.startsWith('BET') || player.lastAction?.startsWith('RAISE') ? 'text-yellow-400'
    : player.lastAction?.startsWith('ALL') ? 'text-red-400'
    : 'text-gray-500';

  const posColor: Record<string, string> = {
    BTN: 'bg-white/90 text-black',
    SB: 'bg-blue-500/80 text-white',
    BB: 'bg-yellow-500/80 text-black',
    UTG: 'bg-red-500/60 text-white',
    'UTG+1': 'bg-red-400/50 text-white',
    MP: 'bg-purple-500/60 text-white',
    HJ: 'bg-orange-500/60 text-white',
    CO: 'bg-emerald-500/60 text-white',
  };

  return (
    <div
      className={`absolute -translate-x-1/2 -translate-y-1/2 ${opacity} transition-opacity`}
      style={{ left: `${x}%`, top: `${y}%` }}
      onContextMenu={onContextMenu}
      title="Clic droit pour placer ici"
    >
      {/* Dealer button */}
      {isButton && (
        <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-white text-black text-[9px] font-bold flex items-center justify-center shadow z-10">
          D
        </div>
      )}

      {/* Cards */}
      <div className="flex gap-0.5 justify-center mb-1 h-8">
        {player.cards ? (
          <>
            <MiniCard card={player.cards[0]} />
            <MiniCard card={player.cards[1]} />
          </>
        ) : !player.folded ? (
          <>
            <div className="w-5 h-7 rounded-sm bg-blue-900 border border-blue-700/50" />
            <div className="w-5 h-7 rounded-sm bg-blue-900 border border-blue-700/50" />
          </>
        ) : null}
      </div>

      {/* Equity bar */}
      {equity != null && !player.folded && (
        <div className="mb-1 w-20 mx-auto">
          <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                equity >= 0.5 ? 'bg-emerald-400' : equity >= 0.3 ? 'bg-yellow-400' : 'bg-red-400'
              }`}
              style={{ width: `${(equity * 100).toFixed(0)}%` }}
            />
          </div>
          <p className={`text-[10px] font-mono font-bold text-center ${
            equity >= 0.5 ? 'text-emerald-400' : equity >= 0.3 ? 'text-yellow-400' : 'text-red-400'
          }`}>
            {(equity * 100).toFixed(1)}%
          </p>
        </div>
      )}

      {/* Player box */}
      <div
        className={`rounded-lg px-2 py-1 text-center min-w-20 border transition-colors ${
          player.isActive
            ? 'bg-poker-green/30 border-poker-green'
            : player.isHero
              ? 'bg-blue-900/50 border-blue-700/50'
              : 'bg-gray-900/80 border-gray-700/40'
        } ${!player.isHero && onPlayerClick ? 'cursor-pointer hover:border-gray-500' : ''}`}
        onClick={!player.isHero && onPlayerClick ? () => onPlayerClick(player.name) : undefined}
      >
        <p className={`text-[10px] font-medium truncate ${player.isHero ? 'text-poker-green' : 'text-gray-300'}`}>
          {player.name}
        </p>
        <p className="text-xs font-mono text-gray-400">
          {formatAmount(player.stack, showBB, currentBB)}
        </p>
        {player.bounty > 0 && (() => {
          const chipValue = bountyChipRatio ? player.bounty * bountyChipRatio : 0;
          const bbValue = chipValue && currentBB ? chipValue / currentBB : 0;
          const cashHalf = player.bounty / 2;
          return (
            <p className="text-[9px] font-mono text-orange-400" title={chipValue > 0
              ? `Prime: ${player.bounty.toFixed(2)}€ → vous gagnez ${cashHalf.toFixed(2)}€ cash = ${Math.round(chipValue).toLocaleString()} jetons = ${bbValue.toFixed(2)}bb de dead money`
              : `Bounty: ${player.bounty.toFixed(2)}€`
            }>
              {player.bounty.toFixed(2)}€
              {bbValue > 0 ? (
                <span className="text-orange-300 ml-0.5">
                  (+{bbValue.toFixed(1)}bb)
                </span>
              ) : null}
            </p>
          );
        })()}
        {/* Mini HUD stats */}
        {quickStats && quickStats.hands > 0 && !player.isHero && (
          <p className="text-[8px] font-mono text-cyan-400/80 mt-0.5" title={`VPIP/PFR (${quickStats.hands} mains)`}>
            {quickStats.vpip}/{quickStats.pfr}
            <span className="text-cyan-400/50 ml-0.5">({quickStats.hands})</span>
          </p>
        )}
      </div>

      {/* Position label + last action */}
      <div className="flex items-center justify-center gap-1 mt-0.5">
        {positionLabel && (
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${posColor[positionLabel] || 'bg-gray-600/50 text-gray-300'}`}>
            {positionLabel}
          </span>
        )}
        {player.lastAction && (
          <span className={`text-[10px] font-bold ${actionColor}`}>
            {player.lastAction}
          </span>
        )}
      </div>
    </div>
  );
}

function ChipStack({ amount, small = false }: { amount: number; small?: boolean }) {
  const chipColors = amount >= 10000 ? ['#e8b923', '#d4a017']
    : amount >= 1000 ? ['#2d6a4f', '#1b4332']
    : amount >= 100 ? ['#1d4ed8', '#1e3a8a']
    : ['#dc2626', '#991b1b'];

  const size = small ? 12 : 16;
  const numChips = Math.min(small ? 3 : 5, Math.max(1, Math.ceil(Math.log10(Math.max(amount, 1)))));

  return (
    <div className="flex flex-col-reverse items-center" style={{ height: size + numChips * 2 }}>
      {Array.from({ length: numChips }).map((_, i) => (
        <div
          key={i}
          className="rounded-full border border-white/30"
          style={{
            width: size,
            height: size * 0.5,
            background: `linear-gradient(135deg, ${chipColors[0]}, ${chipColors[1]})`,
            marginTop: i > 0 ? -3 : 0,
            boxShadow: '0 1px 2px rgba(0,0,0,0.4)',
          }}
        />
      ))}
    </div>
  );
}

function CardDisplay({ card }: { card: string }) {
  if (!card || card.length < 2) return null;
  const suit = card[1];
  const isRed = suit === 'h' || suit === 'd';
  const suitSymbol = { h: '♥', d: '♦', c: '♣', s: '♠' }[suit] || suit;

  return (
    <div className="w-10 h-14 rounded bg-white flex flex-col items-center justify-center shadow-md">
      <span className={`text-sm font-bold leading-none ${isRed ? 'text-red-600' : 'text-gray-900'}`}>
        {card[0]}
      </span>
      <span className={`text-base leading-none ${isRed ? 'text-red-600' : 'text-gray-900'}`}>
        {suitSymbol}
      </span>
    </div>
  );
}

function MiniCard({ card }: { card: string }) {
  if (!card || card.length < 2) return null;
  const suit = card[1];
  const isRed = suit === 'h' || suit === 'd';
  const suitSymbol = { h: '♥', d: '♦', c: '♣', s: '♠' }[suit] || suit;

  return (
    <div className="w-5 h-7 rounded-sm bg-white flex flex-col items-center justify-center shadow text-[8px]">
      <span className={`font-bold leading-none ${isRed ? 'text-red-600' : 'text-gray-900'}`}>
        {card[0]}
      </span>
      <span className={`leading-none ${isRed ? 'text-red-600' : 'text-gray-900'}`}>
        {suitSymbol}
      </span>
    </div>
  );
}
