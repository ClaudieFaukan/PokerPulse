import { describe, it, expect } from 'vitest';
import { detectLeaks, generateClaudePrompt, LeakFlag } from '../../src/engine/leak-detector';
import { ParsedHand } from '../../src/parsers/types';

// BTN=5, SB=6, BB=1, UTG=2, MP=3, CO=4 (Hero at seat 4 = CO)
function makeHand(overrides: Partial<ParsedHand> = {}): ParsedHand {
  return {
    handId: 'test-1',
    room: 'winamax',
    tournamentId: '1',
    tournamentName: 'Test',
    buyIn: 10,
    fee: 1,
    datetime: new Date(),
    level: 5,
    smallBlind: 50,
    bigBlind: 100,
    ante: 10,
    buttonSeat: 5,
    tableSize: 6,
    players: [
      { seat: 1, name: 'BB_P', stack: 5000, isHero: false },
      { seat: 2, name: 'UTG_P', stack: 5000, isHero: false },
      { seat: 3, name: 'MP_P', stack: 5000, isHero: false },
      { seat: 4, name: 'Hero', stack: 5000, isHero: true },
      { seat: 5, name: 'BTN_P', stack: 5000, isHero: false },
      { seat: 6, name: 'SB_P', stack: 5000, isHero: false },
    ],
    heroCards: ['Ah', 'Kd'],
    board: {},
    actions: [],
    pot: 0,
    winners: [],
    showdownHands: [],
    rawText: '',
    ...overrides,
  };
}

function findFlag(flags: LeakFlag[], category: string): LeakFlag | undefined {
  return flags.find((f) => f.category === category);
}

describe('Leak Detector', () => {
  describe('1. Open Limp', () => {
    it('detects open limp in CO', () => {
      const hand = makeHand({
        heroCards: ['9h', '8h'],
        actions: [
          { street: 'preflop', player: 'UTG_P', action: 'fold' },
          { street: 'preflop', player: 'MP_P', action: 'fold' },
          { street: 'preflop', player: 'Hero', action: 'call', amount: 100 },
        ],
      });
      const flags = detectLeaks([hand], 'Hero');
      expect(findFlag(flags, 'Open Limp')).toBeDefined();
      expect(findFlag(flags, 'Open Limp')!.severity).toBe('warning');
    });

    it('does NOT flag limp in SB when folded to', () => {
      // Hero at SB (seat 6)
      const hand = makeHand({
        heroCards: ['9h', '8h'],
        players: [
          { seat: 1, name: 'BB_P', stack: 5000, isHero: false },
          { seat: 2, name: 'UTG_P', stack: 5000, isHero: false },
          { seat: 3, name: 'MP_P', stack: 5000, isHero: false },
          { seat: 4, name: 'CO_P', stack: 5000, isHero: false },
          { seat: 5, name: 'BTN_P', stack: 5000, isHero: false },
          { seat: 6, name: 'Hero', stack: 5000, isHero: true },
        ],
        actions: [
          { street: 'preflop', player: 'UTG_P', action: 'fold' },
          { street: 'preflop', player: 'MP_P', action: 'fold' },
          { street: 'preflop', player: 'CO_P', action: 'fold' },
          { street: 'preflop', player: 'BTN_P', action: 'fold' },
          { street: 'preflop', player: 'Hero', action: 'call', amount: 50 },
        ],
      });
      const flags = detectLeaks([hand], 'Hero');
      expect(findFlag(flags, 'Open Limp')).toBeUndefined();
    });

    it('does NOT flag call facing a raise', () => {
      const hand = makeHand({
        heroCards: ['9h', '8h'],
        actions: [
          { street: 'preflop', player: 'UTG_P', action: 'raise', amount: 250 },
          { street: 'preflop', player: 'MP_P', action: 'fold' },
          { street: 'preflop', player: 'Hero', action: 'call', amount: 250 },
        ],
      });
      const flags = detectLeaks([hand], 'Hero');
      expect(findFlag(flags, 'Open Limp')).toBeUndefined();
    });
  });

  describe('2. Fold BB with good odds', () => {
    it('detects fold BB with multiway pot', () => {
      const hand = makeHand({
        heroCards: ['3h', '2d'],
        players: [
          { seat: 1, name: 'Hero', stack: 5000, isHero: true }, // BB
          { seat: 2, name: 'UTG_P', stack: 5000, isHero: false },
          { seat: 3, name: 'MP_P', stack: 5000, isHero: false },
          { seat: 4, name: 'CO_P', stack: 5000, isHero: false },
          { seat: 5, name: 'BTN_P', stack: 5000, isHero: false },
          { seat: 6, name: 'SB_P', stack: 5000, isHero: false },
        ],
        buttonSeat: 5,
        actions: [
          { street: 'preflop', player: 'UTG_P', action: 'raise', amount: 250 },
          { street: 'preflop', player: 'MP_P', action: 'call', amount: 250 },
          { street: 'preflop', player: 'CO_P', action: 'call', amount: 250 },
          { street: 'preflop', player: 'BTN_P', action: 'fold' },
          { street: 'preflop', player: 'SB_P', action: 'fold' },
          { street: 'preflop', player: 'Hero', action: 'fold' },
        ],
      });
      const flags = detectLeaks([hand], 'Hero');
      expect(findFlag(flags, 'Fold BB bonnes cotes')).toBeDefined();
    });
  });

  describe('3. Missed steal', () => {
    it('detects missed steal in CO with playable hand', () => {
      const hand = makeHand({
        heroCards: ['Ts', '9s'],
        actions: [
          { street: 'preflop', player: 'UTG_P', action: 'fold' },
          { street: 'preflop', player: 'MP_P', action: 'fold' },
          { street: 'preflop', player: 'Hero', action: 'fold' },
        ],
      });
      const flags = detectLeaks([hand], 'Hero');
      expect(findFlag(flags, 'Steal manqué')).toBeDefined();
    });

    it('does NOT flag missed steal with trash hand', () => {
      const hand = makeHand({
        heroCards: ['3h', '2d'],
        actions: [
          { street: 'preflop', player: 'UTG_P', action: 'fold' },
          { street: 'preflop', player: 'MP_P', action: 'fold' },
          { street: 'preflop', player: 'Hero', action: 'fold' },
        ],
      });
      const flags = detectLeaks([hand], 'Hero');
      expect(findFlag(flags, 'Steal manqué')).toBeUndefined();
    });
  });

  describe('5. No 3-bet with premiums', () => {
    it('detects flat call QQ+ facing open raise', () => {
      const hand = makeHand({
        heroCards: ['Ks', 'Kd'],
        actions: [
          { street: 'preflop', player: 'UTG_P', action: 'raise', amount: 250 },
          { street: 'preflop', player: 'MP_P', action: 'fold' },
          { street: 'preflop', player: 'Hero', action: 'call', amount: 250 },
        ],
      });
      const flags = detectLeaks([hand], 'Hero');
      expect(findFlag(flags, 'Pas de 3-bet premium')).toBeDefined();
    });

    it('does NOT flag when hero 3-bets premiums', () => {
      const hand = makeHand({
        heroCards: ['As', 'Ad'],
        actions: [
          { street: 'preflop', player: 'UTG_P', action: 'raise', amount: 250 },
          { street: 'preflop', player: 'MP_P', action: 'fold' },
          { street: 'preflop', player: 'Hero', action: 'raise', amount: 700 },
        ],
      });
      const flags = detectLeaks([hand], 'Hero');
      expect(findFlag(flags, 'Pas de 3-bet premium')).toBeUndefined();
    });
  });

  describe('7. Missed c-bet on dry board', () => {
    it('detects missed c-bet on dry flop', () => {
      const hand = makeHand({
        heroCards: ['Ah', 'Qd'],
        board: { flop: ['Kc', '7s', '2h'] }, // Dry: rainbow, no straight draws
        actions: [
          { street: 'preflop', player: 'UTG_P', action: 'fold' },
          { street: 'preflop', player: 'MP_P', action: 'fold' },
          { street: 'preflop', player: 'Hero', action: 'raise', amount: 250 },
          { street: 'preflop', player: 'BTN_P', action: 'call', amount: 250 },
          { street: 'preflop', player: 'SB_P', action: 'fold' },
          { street: 'preflop', player: 'BB_P', action: 'fold' },
          { street: 'flop', player: 'Hero', action: 'check' },
          { street: 'flop', player: 'BTN_P', action: 'bet', amount: 300 },
          { street: 'flop', player: 'Hero', action: 'fold' },
        ],
      });
      const flags = detectLeaks([hand], 'Hero');
      expect(findFlag(flags, 'C-bet manqué board sec')).toBeDefined();
    });
  });

  describe('8. Check-fold after PFR', () => {
    it('detects check-fold at flop after opening preflop', () => {
      const hand = makeHand({
        heroCards: ['Jh', 'Td'],
        board: { flop: ['Ac', '8s', '3h'] },
        actions: [
          { street: 'preflop', player: 'Hero', action: 'raise', amount: 250 },
          { street: 'preflop', player: 'BTN_P', action: 'call', amount: 250 },
          { street: 'flop', player: 'Hero', action: 'check' },
          { street: 'flop', player: 'BTN_P', action: 'bet', amount: 300 },
          { street: 'flop', player: 'Hero', action: 'fold' },
        ],
      });
      const flags = detectLeaks([hand], 'Hero');
      expect(findFlag(flags, 'Check-fold après PFR')).toBeDefined();
    });
  });

  describe('10. Passive with strong hand', () => {
    it('detects check-call with a set on 2 streets', () => {
      const hand = makeHand({
        heroCards: ['7h', '7d'],
        board: { flop: ['7c', 'Ks', '2h'], turn: 'Jc' },
        actions: [
          { street: 'preflop', player: 'UTG_P', action: 'raise', amount: 250 },
          { street: 'preflop', player: 'Hero', action: 'call', amount: 250 },
          { street: 'flop', player: 'UTG_P', action: 'bet', amount: 300 },
          { street: 'flop', player: 'Hero', action: 'call', amount: 300 },
          { street: 'turn', player: 'UTG_P', action: 'bet', amount: 600 },
          { street: 'turn', player: 'Hero', action: 'call', amount: 600 },
        ],
        winners: [{ player: 'Hero', amount: 2500 }],
      });
      const flags = detectLeaks([hand], 'Hero');
      expect(findFlag(flags, 'Passif main forte')).toBeDefined();
      expect(findFlag(flags, 'Passif main forte')!.severity).toBe('warning');
    });

    it('does NOT flag when hero raises with strong hand', () => {
      const hand = makeHand({
        heroCards: ['7h', '7d'],
        board: { flop: ['7c', 'Ks', '2h'] },
        actions: [
          { street: 'preflop', player: 'UTG_P', action: 'raise', amount: 250 },
          { street: 'preflop', player: 'Hero', action: 'call', amount: 250 },
          { street: 'flop', player: 'UTG_P', action: 'bet', amount: 300 },
          { street: 'flop', player: 'Hero', action: 'raise', amount: 800 },
        ],
      });
      const flags = detectLeaks([hand], 'Hero');
      expect(findFlag(flags, 'Passif main forte')).toBeUndefined();
    });
  });
});

describe('Claude Prompt Generator', () => {
  it('generates a complete prompt with all hand info', () => {
    const hand = makeHand({
      heroCards: ['Ah', 'Kd'],
      board: { flop: ['Ks', '7h', '2d'], turn: 'Jc' },
      actions: [
        { street: 'preflop', player: 'UTG_P', action: 'fold' },
        { street: 'preflop', player: 'Hero', action: 'raise', amount: 250 },
        { street: 'preflop', player: 'BTN_P', action: 'call', amount: 250 },
        { street: 'flop', player: 'Hero', action: 'bet', amount: 300 },
        { street: 'flop', player: 'BTN_P', action: 'call', amount: 300 },
      ],
      winners: [{ player: 'Hero', amount: 1200 }],
    });

    const flag: LeakFlag = {
      handId: 'test-1',
      severity: 'info',
      category: 'Test',
      description: 'Test description',
      suggestion: 'Test suggestion',
    };

    const prompt = generateClaudePrompt(hand, 'Hero', flag);

    expect(prompt).toContain('MTT de poker');
    expect(prompt).toContain('10€');
    expect(prompt).toContain('level 5');
    expect(prompt).toContain('Ma main : Ah Kd');
    expect(prompt).toContain('Hero');
    expect(prompt).toContain('raise 250');
    expect(prompt).toContain('Flop : [Ks 7h 2d]');
    expect(prompt).toContain('Test description');
    expect(prompt).toContain('Test suggestion');
    expect(prompt).toContain('analyser cette main');
  });
});
