import { useRef, useEffect } from 'react';
import type { ReplayerAction } from '../../hooks/useReplayerState';

interface ActionLogProps {
  actions: ReplayerAction[];
  currentIndex: number;
  heroCards: [string, string] | null;
  board: string[];
  pot: number;
  showBB?: boolean;
  currentBB?: number;
}

function fmtAmt(amount: number, showBB?: boolean, bb?: number): string {
  if (showBB && bb && bb > 0) {
    const v = amount / bb;
    return v % 1 === 0 ? `${v}bb` : `${v.toFixed(1)}bb`;
  }
  return amount.toLocaleString();
}

const STREET_LABELS: Record<string, string> = {
  preflop: 'Preflop',
  flop: 'Flop',
  turn: 'Turn',
  river: 'River',
};

const ACTION_LABELS: Record<string, string> = {
  post_ante: 'ante',
  post_blind: 'blind',
  fold: 'folds',
  check: 'checks',
  call: 'calls',
  bet: 'bets',
  raise: 'raises to',
  allin: 'ALL-IN',
};

export default function ActionLog({ actions, currentIndex, heroCards, board, pot, showBB, currentBB }: ActionLogProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [currentIndex]);

  // Group actions by street
  let lastStreet = '';

  return (
    <div
      ref={scrollRef}
      className="bg-poker-darker rounded-lg border border-poker-border p-3 h-72 overflow-y-auto text-xs font-mono space-y-0.5"
    >
      {actions.map((action, i) => {
        const showStreetHeader = action.street !== lastStreet;
        lastStreet = action.street;
        const isActive = i === currentIndex;
        const isPast = i <= currentIndex;

        return (
          <div key={i}>
            {showStreetHeader && (
              <div className="text-gray-500 font-sans font-medium pt-2 pb-1 border-b border-poker-border/50 mb-1">
                --- {STREET_LABELS[action.street] || action.street}
                {action.street === 'flop' && board.length >= 3 && (
                  <span className="ml-2">
                    [<CardInline card={board[0]} /> <CardInline card={board[1]} /> <CardInline card={board[2]} />]
                  </span>
                )}
                {action.street === 'turn' && board.length >= 4 && (
                  <span className="ml-1">[<CardInline card={board[3]} />]</span>
                )}
                {action.street === 'river' && board.length >= 5 && (
                  <span className="ml-1">[<CardInline card={board[4]} />]</span>
                )}
                <span className="ml-2 text-gray-600">(Pot: {fmtAmt(pot, showBB, currentBB)})</span>
                {' ---'}
              </div>
            )}
            <div
              ref={isActive ? activeRef : undefined}
              className={`py-0.5 px-1 rounded transition-colors ${
                isActive ? 'bg-poker-green/20 text-gray-100' :
                isPast ? 'text-gray-400' : 'text-gray-600'
              }`}
            >
              <span className={action.is_hero ? 'text-poker-green font-semibold' : ''}>
                {action.player_name}
              </span>
              {' '}
              <span className={getActionColor(action.action_type)}>
                {ACTION_LABELS[action.action_type] || action.action_type}
              </span>
              {action.amount != null && action.amount > 0 && (
                <span className="text-gray-300"> {fmtAmt(action.amount, showBB, currentBB)}</span>
              )}
              {action.is_hero && heroCards && ['post_ante', 'post_blind'].includes(action.action_type) === false && (
                <span className="ml-2 text-gray-600">
                  [<CardInline card={heroCards[0]} /> <CardInline card={heroCards[1]} />]
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function getActionColor(action: string): string {
  switch (action) {
    case 'fold': return 'text-gray-500';
    case 'check': return 'text-gray-400';
    case 'call': return 'text-blue-400';
    case 'bet':
    case 'raise': return 'text-yellow-400';
    case 'allin': return 'text-red-400 font-bold';
    default: return 'text-gray-500';
  }
}

function CardInline({ card }: { card: string }) {
  if (!card || card.length < 2) return <span>{card}</span>;
  const suit = card[1];
  const isRed = suit === 'h' || suit === 'd';
  const suitSymbol = { h: '♥', d: '♦', c: '♣', s: '♠' }[suit] || suit;
  return (
    <span className={isRed ? 'text-red-400' : 'text-gray-100'}>
      {card[0]}{suitSymbol}
    </span>
  );
}
