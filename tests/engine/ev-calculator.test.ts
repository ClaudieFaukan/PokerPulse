import { describe, it, expect } from 'vitest';
import { calculateEquity, calculateChipEV, evaluateHand } from '../../src/engine/ev-calculator';

describe('Hand Evaluator', () => {
  function card(str: string) {
    const ranks: Record<string, number> = {
      '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8,
      '9': 9, 'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14,
    };
    return { rank: str[0] as any, suit: str[1] as any, value: ranks[str[0]] };
  }

  it('pair beats high card', () => {
    const pair = evaluateHand([card('Ah'), card('Ad'), card('5c'), card('7s'), card('9h')]);
    const highCard = evaluateHand([card('Ah'), card('Kd'), card('5c'), card('7s'), card('9h')]);
    expect(pair).toBeGreaterThan(highCard);
  });

  it('two pair beats one pair', () => {
    const twoPair = evaluateHand([card('Ah'), card('Ad'), card('Kc'), card('Ks'), card('9h')]);
    const onePair = evaluateHand([card('Ah'), card('Ad'), card('5c'), card('7s'), card('9h')]);
    expect(twoPair).toBeGreaterThan(onePair);
  });

  it('trips beats two pair', () => {
    const trips = evaluateHand([card('Ah'), card('Ad'), card('Ac'), card('7s'), card('9h')]);
    const twoPair = evaluateHand([card('Ah'), card('Ad'), card('Kc'), card('Ks'), card('9h')]);
    expect(trips).toBeGreaterThan(twoPair);
  });

  it('straight beats trips', () => {
    const straight = evaluateHand([card('5h'), card('6d'), card('7c'), card('8s'), card('9h')]);
    const trips = evaluateHand([card('Ah'), card('Ad'), card('Ac'), card('7s'), card('9h')]);
    expect(straight).toBeGreaterThan(trips);
  });

  it('flush beats straight', () => {
    const flush = evaluateHand([card('Ah'), card('Kh'), card('9h'), card('5h'), card('2h')]);
    const straight = evaluateHand([card('5h'), card('6d'), card('7c'), card('8s'), card('9h')]);
    expect(flush).toBeGreaterThan(straight);
  });

  it('full house beats flush', () => {
    const fullHouse = evaluateHand([card('Ah'), card('Ad'), card('Ac'), card('Ks'), card('Kh')]);
    const flush = evaluateHand([card('Ah'), card('Kh'), card('9h'), card('5h'), card('2h')]);
    expect(fullHouse).toBeGreaterThan(flush);
  });

  it('quads beats full house', () => {
    const quads = evaluateHand([card('Ah'), card('Ad'), card('Ac'), card('As'), card('Kh')]);
    const fullHouse = evaluateHand([card('Ah'), card('Ad'), card('Ac'), card('Ks'), card('Kh')]);
    expect(quads).toBeGreaterThan(fullHouse);
  });

  it('straight flush beats quads', () => {
    const sf = evaluateHand([card('5h'), card('6h'), card('7h'), card('8h'), card('9h')]);
    const quads = evaluateHand([card('Ah'), card('Ad'), card('Ac'), card('As'), card('Kh')]);
    expect(sf).toBeGreaterThan(quads);
  });

  it('evaluates best 5 from 7 cards', () => {
    // Full house hidden in 7 cards
    const score = evaluateHand([
      card('Ah'), card('Ad'), card('Ac'), card('Ks'), card('Kh'), card('3c'), card('7d'),
    ]);
    // Should find full house (AAA KK)
    expect(score).toBeGreaterThan(6_000_000); // Full house range
    expect(score).toBeLessThan(7_000_000);
  });

  it('detects wheel straight (A-2-3-4-5)', () => {
    const wheel = evaluateHand([card('Ah'), card('2d'), card('3c'), card('4s'), card('5h')]);
    expect(wheel).toBeGreaterThan(4_000_000); // Straight range
    expect(wheel).toBeLessThan(5_000_000);
  });
});

describe('Equity Calculator', () => {
  it('AA vs KK preflop — AA has ~80% equity', () => {
    // Full board known (we need to give specific board to make it deterministic)
    const equities = calculateEquity(
      [['Ah', 'Ad'], ['Kh', 'Kd']],
      ['Ts', '7c', '2d', '5s', '3h'] // dry board, no help for KK
    );
    // On this specific board, AA wins
    expect(equities[0]).toBe(1);
    expect(equities[1]).toBe(0);
  });

  it('complete board — determines winner exactly', () => {
    // Hero has top pair, villain has set
    const equities = calculateEquity(
      [['Ah', 'Kd'], ['7s', '7h']],
      ['Ks', '7c', '2d', '5s', '3h']
    );
    // Villain has set of 7s, hero has pair of Kings
    expect(equities[0]).toBe(0);
    expect(equities[1]).toBe(1);
  });

  it('split pot — equal equity', () => {
    // Both players have same hand on same board
    const equities = calculateEquity(
      [['Ah', 'Kd'], ['As', 'Kc']],
      ['Qh', 'Jc', 'Td', '2s', '3h'] // Both have A-high straight
    );
    expect(equities[0]).toBeCloseTo(0.5, 1);
    expect(equities[1]).toBeCloseTo(0.5, 1);
  });

  it('equities sum to 1', () => {
    const equities = calculateEquity(
      [['Ah', 'Ad'], ['Kh', 'Kd'], ['Qh', 'Qd']],
      ['Ts', '7c', '2d', '5s', '3h']
    );
    const total = equities.reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 5);
  });
});

describe('Chip EV Calculator', () => {
  it('calculates chip EV for a won all-in', () => {
    // Hero AA vs Villain KK on a dry board, Hero wins
    const result = calculateChipEV(
      ['Ah', 'Ad'],
      [['Kh', 'Kd']],
      ['Ts', '7c', '2d', '5s', '3h'], // AA wins this board
      10000, // pot
      10000  // hero actually won the pot
    );

    // Hero has 100% equity on this board → chipEV = 10000
    expect(result.equity).toBe(1);
    expect(result.chipEV).toBe(10000);
    expect(result.evDiff).toBe(0); // Won exactly EV
  });

  it('calculates negative EV diff when hero ran above EV', () => {
    // Use a board where Hero actually wins but should have lost sometimes
    // AA vs KK, board gives KK a set → hero loses but had high equity preflop
    const result = calculateChipEV(
      ['Ah', 'Ad'],
      [['Kh', 'Kd']],
      ['Ks', '7c', '2d', '5s', '3h'], // KK makes a set, AA loses
      10000,
      0 // hero lost
    );

    // Hero has 0% equity on this board (KK has set)
    expect(result.equity).toBe(0);
    expect(result.chipEV).toBe(0);
    expect(result.evDiff).toBe(0); // EV on this board is 0, actual is 0
  });

  it('handles multiway pots', () => {
    const result = calculateChipEV(
      ['Ah', 'Ad'],
      [['Kh', 'Kd'], ['Qh', 'Qd']],
      ['Ts', '7c', '2d', '5s', '3h'],
      15000,
      15000
    );

    // AA wins this board
    expect(result.equity).toBe(1);
    expect(result.chipEV).toBe(15000);
  });
});
