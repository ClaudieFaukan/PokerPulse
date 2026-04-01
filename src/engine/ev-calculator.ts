/**
 * Chip EV Calculator
 *
 * Calculates expected value for all-in situations where all cards are known
 * (went to showdown). Uses card enumeration to compute exact equity.
 */

// Card representation
type Suit = 'h' | 'd' | 'c' | 's';
type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K' | 'A';

interface Card {
  rank: Rank;
  suit: Suit;
  value: number; // 2-14 (A=14)
}

const RANK_VALUES: Record<string, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8,
  '9': 9, 'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14,
};

/**
 * Parse a card string like "Ah" into a Card object.
 */
function parseCard(str: string): Card {
  const rank = str[0] as Rank;
  const suit = str[1] as Suit;
  return { rank, suit, value: RANK_VALUES[rank] };
}

/**
 * Build a full 52-card deck.
 */
function buildDeck(): Card[] {
  const deck: Card[] = [];
  const ranks: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
  const suits: Suit[] = ['h', 'd', 'c', 's'];
  for (const rank of ranks) {
    for (const suit of suits) {
      deck.push({ rank, suit, value: RANK_VALUES[rank] });
    }
  }
  return deck;
}

function cardKey(c: Card): string {
  return `${c.rank}${c.suit}`;
}

/**
 * Evaluate the best 5-card hand from 7 cards.
 * Returns a numeric score where higher is better.
 *
 * Hand rankings (high bits determine category):
 * 8: Straight flush
 * 7: Four of a kind
 * 6: Full house
 * 5: Flush
 * 4: Straight
 * 3: Three of a kind
 * 2: Two pair
 * 1: One pair
 * 0: High card
 */
export function evaluateHand(cards: Card[]): number {
  if (cards.length < 5) return 0;

  // Get all 5-card combinations from 7 cards
  let bestScore = 0;
  const combos = combinations(cards, 5);

  for (const hand of combos) {
    const score = evaluate5Cards(hand);
    if (score > bestScore) bestScore = score;
  }

  return bestScore;
}

function evaluate5Cards(cards: Card[]): number {
  const sorted = [...cards].sort((a, b) => b.value - a.value);
  const values = sorted.map((c) => c.value);

  const isFlush = sorted.every((c) => c.suit === sorted[0].suit);
  const isStraight = checkStraight(values);

  // Count ranks
  const counts = new Map<number, number>();
  for (const v of values) {
    counts.set(v, (counts.get(v) || 0) + 1);
  }

  const countArr = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);

  // Straight flush
  if (isFlush && isStraight) {
    return 8_000_000 + highCardStraight(values);
  }

  // Four of a kind
  if (countArr[0][1] === 4) {
    return 7_000_000 + countArr[0][0] * 100 + countArr[1][0];
  }

  // Full house
  if (countArr[0][1] === 3 && countArr[1][1] === 2) {
    return 6_000_000 + countArr[0][0] * 100 + countArr[1][0];
  }

  // Flush
  if (isFlush) {
    return 5_000_000 + values[0] * 10000 + values[1] * 1000 + values[2] * 100 + values[3] * 10 + values[4];
  }

  // Straight
  if (isStraight) {
    return 4_000_000 + highCardStraight(values);
  }

  // Three of a kind
  if (countArr[0][1] === 3) {
    const kickers = countArr.filter((c) => c[1] !== 3).map((c) => c[0]).sort((a, b) => b - a);
    return 3_000_000 + countArr[0][0] * 10000 + kickers[0] * 100 + (kickers[1] || 0);
  }

  // Two pair
  if (countArr[0][1] === 2 && countArr[1][1] === 2) {
    const pairs = [countArr[0][0], countArr[1][0]].sort((a, b) => b - a);
    const kicker = countArr.find((c) => c[1] === 1)?.[0] || 0;
    return 2_000_000 + pairs[0] * 1500 + pairs[1] * 100 + kicker;
  }

  // One pair
  if (countArr[0][1] === 2) {
    const kickers = countArr.filter((c) => c[1] !== 2).map((c) => c[0]).sort((a, b) => b - a);
    return 1_000_000 + countArr[0][0] * 10000 + kickers[0] * 100 + kickers[1] * 10 + (kickers[2] || 0);
  }

  // High card
  return values[0] * 10000 + values[1] * 1000 + values[2] * 100 + values[3] * 10 + values[4];
}

function checkStraight(values: number[]): boolean {
  const sorted = [...new Set(values)].sort((a, b) => b - a);
  if (sorted.length < 5) return false;

  // Normal straight
  if (sorted[0] - sorted[4] === 4 && sorted.length === 5) return true;

  // Wheel (A-2-3-4-5)
  if (sorted[0] === 14 && sorted[1] === 5 && sorted[2] === 4 && sorted[3] === 3 && sorted[4] === 2) {
    return true;
  }

  return false;
}

function highCardStraight(values: number[]): number {
  const sorted = [...new Set(values)].sort((a, b) => b - a);
  // Wheel: A-2-3-4-5 → high card is 5
  if (sorted[0] === 14 && sorted[1] === 5) return 5;
  return sorted[0];
}

function combinations<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const [first, ...rest] = arr;
  const withFirst = combinations(rest, k - 1).map((c) => [first, ...c]);
  const withoutFirst = combinations(rest, k);
  return [...withFirst, ...withoutFirst];
}

/**
 * Calculate exact equity for each player in an all-in situation.
 *
 * @param playerHands - Array of [card1, card2] for each player involved
 * @param board - Known board cards (flop/turn/river, 0-5 cards)
 * @returns Array of equity percentages (0-1) for each player
 */
export function calculateEquity(
  playerHands: [string, string][],
  board: string[]
): number[] {
  const numPlayers = playerHands.length;
  if (numPlayers === 0) return [];

  const usedCards = new Set<string>();

  // Parse player hands
  const parsedHands: Card[][] = playerHands.map((h) => {
    const cards = [parseCard(h[0]), parseCard(h[1])];
    cards.forEach((c) => usedCards.add(cardKey(c)));
    return cards;
  });

  // Parse board
  const parsedBoard = board.map((b) => {
    const c = parseCard(b);
    usedCards.add(cardKey(c));
    return c;
  });

  // Remaining deck
  const deck = buildDeck().filter((c) => !usedCards.has(cardKey(c)));

  // Cards needed to complete the board
  const cardsNeeded = 5 - parsedBoard.length;

  // Enumerate all possible remaining boards
  const wins = new Array(numPlayers).fill(0);
  let totalRuns = 0;

  if (cardsNeeded === 0) {
    // Board is complete, just evaluate
    const scores = parsedHands.map((hand) => evaluateHand([...hand, ...parsedBoard]));
    const maxScore = Math.max(...scores);
    const winners = scores.filter((s) => s === maxScore).length;
    for (let i = 0; i < numPlayers; i++) {
      wins[i] = scores[i] === maxScore ? 1 / winners : 0;
    }
    totalRuns = 1;
  } else {
    // Enumerate remaining cards
    const boardCombos = combinations(deck, cardsNeeded);

    for (const combo of boardCombos) {
      const fullBoard = [...parsedBoard, ...combo];
      const scores = parsedHands.map((hand) => evaluateHand([...hand, ...fullBoard]));
      const maxScore = Math.max(...scores);
      const winners = scores.filter((s) => s === maxScore).length;

      for (let i = 0; i < numPlayers; i++) {
        if (scores[i] === maxScore) {
          wins[i] += 1 / winners;
        }
      }
      totalRuns++;
    }
  }

  return wins.map((w) => w / totalRuns);
}

/**
 * Calculate chip EV for a hero in an all-in situation.
 *
 * @param heroCards - Hero's hole cards [card1, card2]
 * @param villainHands - Array of villain hole cards
 * @param board - Board cards at time of all-in
 * @param pot - Total pot at time of all-in
 * @param heroActualWin - What hero actually won
 * @returns chipEV and diff
 */
export function calculateChipEV(
  heroCards: [string, string],
  villainHands: [string, string][],
  board: string[],
  pot: number,
  heroActualWin: number
): { equity: number; chipEV: number; evDiff: number } {
  const allHands: [string, string][] = [heroCards, ...villainHands];
  const equities = calculateEquity(allHands, board);

  const heroEquity = equities[0];
  const chipEV = heroEquity * pot;
  const evDiff = chipEV - heroActualWin;

  return {
    equity: heroEquity,
    chipEV,
    evDiff,
  };
}
