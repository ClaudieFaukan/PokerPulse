import { describe, it, expect } from 'vitest';
import { calculateStats, analyzeHand, buildStats, StatsCounters, PlayerStats } from '../../src/engine/stats';
import { ParsedHand, ParsedAction, ParsedPlayer } from '../../src/parsers/types';

// ─── HAND BUILDER HELPERS ───

function makeHand(overrides: Partial<ParsedHand> = {}): ParsedHand {
  return {
    handId: 'test-1',
    room: 'winamax',
    tournamentId: '1',
    tournamentName: 'Test',
    buyIn: 10,
    fee: 1,
    datetime: new Date(),
    level: 1,
    smallBlind: 50,
    bigBlind: 100,
    ante: 10,
    buttonSeat: 5,
    tableSize: 6,
    players: [
      { seat: 1, name: 'UTG', stack: 5000, isHero: false },
      { seat: 2, name: 'MP', stack: 5000, isHero: false },
      { seat: 3, name: 'CO', stack: 5000, isHero: false },
      { seat: 4, name: 'Hero', stack: 5000, isHero: true },
      { seat: 5, name: 'BTN', stack: 5000, isHero: false },
      { seat: 6, name: 'SB', stack: 5000, isHero: false },
      // seat order: BTN=5, SB=6, BB=1, UTG=2(??)
      // Let me redo: for 6-max with BTN at seat 5:
      // BTN=5 -> SB=6 -> BB=1 -> UTG=2 -> MP=3 -> CO=4
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

// With BTN=5, 6 players at seats 1-6:
// BTN=seat5, SB=seat6, BB=seat1, UTG=seat2, MP=seat3, CO=seat4
// Hero is at seat4 = CO position

function statsFor(hands: ParsedHand[], player = 'Hero'): PlayerStats {
  return calculateStats(hands, player);
}

// ─── VPIP TESTS ───

describe('VPIP', () => {
  it('counts voluntary call as VPIP', () => {
    const hand = makeHand({
      actions: [
        { street: 'preflop', player: 'UTG', action: 'raise', amount: 200 },
        { street: 'preflop', player: 'MP', action: 'fold' },
        { street: 'preflop', player: 'Hero', action: 'call', amount: 200 },
        { street: 'preflop', player: 'BTN', action: 'fold' },
        { street: 'preflop', player: 'SB', action: 'fold' },
        { street: 'preflop', player: 'BB', action: 'fold' },
      ],
    });
    const stats = statsFor([hand]);
    expect(stats.vpip).toBe(100);
  });

  it('counts voluntary raise as VPIP', () => {
    const hand = makeHand({
      actions: [
        { street: 'preflop', player: 'UTG', action: 'fold' },
        { street: 'preflop', player: 'MP', action: 'fold' },
        { street: 'preflop', player: 'Hero', action: 'raise', amount: 250 },
        { street: 'preflop', player: 'BTN', action: 'fold' },
        { street: 'preflop', player: 'SB', action: 'fold' },
        { street: 'preflop', player: 'BB', action: 'fold' },
      ],
    });
    const stats = statsFor([hand]);
    expect(stats.vpip).toBe(100);
  });

  it('does NOT count fold as VPIP', () => {
    const hand = makeHand({
      actions: [
        { street: 'preflop', player: 'UTG', action: 'raise', amount: 200 },
        { street: 'preflop', player: 'MP', action: 'fold' },
        { street: 'preflop', player: 'Hero', action: 'fold' },
      ],
    });
    const stats = statsFor([hand]);
    expect(stats.vpip).toBe(0);
  });

  it('BB check (no raise facing) does NOT count as VPIP', () => {
    // BB player at seat 1
    const hand = makeHand({
      actions: [
        { street: 'preflop', player: 'UTG', action: 'fold' },
        { street: 'preflop', player: 'MP', action: 'fold' },
        { street: 'preflop', player: 'Hero', action: 'fold' },
        { street: 'preflop', player: 'BTN', action: 'fold' },
        { street: 'preflop', player: 'SB', action: 'call', amount: 50 },
        // BB gets to check
      ],
    });
    // BB = seat 1 = player "UTG" in our setup... let me test with the BB player
    // Actually in our setup: BTN=5, SB=6, BB=1 which is "UTG" name...
    // Let me test BB checking by using BB player name
    const bbHand = makeHand({
      players: [
        { seat: 1, name: 'BB_Player', stack: 5000, isHero: false },
        { seat: 2, name: 'UTG', stack: 5000, isHero: false },
        { seat: 3, name: 'MP', stack: 5000, isHero: false },
        { seat: 4, name: 'CO', stack: 5000, isHero: false },
        { seat: 5, name: 'BTN', stack: 5000, isHero: false },
        { seat: 6, name: 'SB', stack: 5000, isHero: false },
      ],
      buttonSeat: 5,
      actions: [
        { street: 'preflop', player: 'SB', action: 'post_blind', amount: 50 },
        { street: 'preflop', player: 'BB_Player', action: 'post_blind', amount: 100 },
        { street: 'preflop', player: 'UTG', action: 'fold' },
        { street: 'preflop', player: 'MP', action: 'fold' },
        { street: 'preflop', player: 'CO', action: 'fold' },
        { street: 'preflop', player: 'BTN', action: 'fold' },
        { street: 'preflop', player: 'SB', action: 'call', amount: 50 },
        { street: 'preflop', player: 'BB_Player', action: 'check' },
      ],
    });
    const stats = statsFor([bbHand], 'BB_Player');
    expect(stats.vpip).toBe(0); // BB check is NOT voluntary
  });
});

// ─── PFR TESTS ───

describe('PFR', () => {
  it('counts open raises', () => {
    const hand = makeHand({
      actions: [
        { street: 'preflop', player: 'UTG', action: 'fold' },
        { street: 'preflop', player: 'MP', action: 'fold' },
        { street: 'preflop', player: 'Hero', action: 'raise', amount: 250 },
        { street: 'preflop', player: 'BTN', action: 'fold' },
      ],
    });
    const stats = statsFor([hand]);
    expect(stats.pfr).toBe(100);
  });

  it('counts 3-bets as PFR', () => {
    const hand = makeHand({
      actions: [
        { street: 'preflop', player: 'UTG', action: 'raise', amount: 200 },
        { street: 'preflop', player: 'MP', action: 'fold' },
        { street: 'preflop', player: 'Hero', action: 'raise', amount: 600 },
      ],
    });
    const stats = statsFor([hand]);
    expect(stats.pfr).toBe(100);
  });

  it('does NOT count calls as PFR', () => {
    const hand = makeHand({
      actions: [
        { street: 'preflop', player: 'UTG', action: 'raise', amount: 200 },
        { street: 'preflop', player: 'MP', action: 'fold' },
        { street: 'preflop', player: 'Hero', action: 'call', amount: 200 },
      ],
    });
    const stats = statsFor([hand]);
    expect(stats.pfr).toBe(0);
  });
});

// ─── 3-BET TESTS ───

describe('3-Bet%', () => {
  it('counts 3-bet when facing an open raise', () => {
    const hand = makeHand({
      actions: [
        { street: 'preflop', player: 'UTG', action: 'raise', amount: 200 },
        { street: 'preflop', player: 'MP', action: 'fold' },
        { street: 'preflop', player: 'Hero', action: 'raise', amount: 600 },
      ],
    });
    const stats = statsFor([hand]);
    expect(stats.threeBet).toBe(100);
  });

  it('does NOT count open raise as 3-bet', () => {
    const hand = makeHand({
      actions: [
        { street: 'preflop', player: 'UTG', action: 'fold' },
        { street: 'preflop', player: 'MP', action: 'fold' },
        { street: 'preflop', player: 'Hero', action: 'raise', amount: 250 },
      ],
    });
    const stats = statsFor([hand]);
    // No 3-bet opportunity (0 raises before Hero)
    expect(stats.counters.threeBetOpportunities).toBe(0);
  });

  it('counts missed 3-bet opportunity as 0%', () => {
    const hand = makeHand({
      actions: [
        { street: 'preflop', player: 'UTG', action: 'raise', amount: 200 },
        { street: 'preflop', player: 'MP', action: 'fold' },
        { street: 'preflop', player: 'Hero', action: 'call', amount: 200 },
      ],
    });
    const stats = statsFor([hand]);
    expect(stats.counters.threeBetOpportunities).toBe(1);
    expect(stats.threeBet).toBe(0);
  });
});

// ─── STEAL TESTS ───

describe('Steal%', () => {
  it('counts steal from CO when folded to', () => {
    // Hero is at seat 4 = CO
    const hand = makeHand({
      actions: [
        { street: 'preflop', player: 'UTG', action: 'fold' },
        { street: 'preflop', player: 'MP', action: 'fold' },
        { street: 'preflop', player: 'Hero', action: 'raise', amount: 250 },
        { street: 'preflop', player: 'BTN', action: 'fold' },
        { street: 'preflop', player: 'SB', action: 'fold' },
      ],
    });
    // Hero at seat 4, BTN at seat 5 → Hero is CO
    const stats = statsFor([hand]);
    expect(stats.counters.stealOpportunities).toBe(1);
    expect(stats.counters.stealMade).toBe(1);
    expect(stats.steal).toBe(100);
  });

  it('does not count steal when not folded to', () => {
    const hand = makeHand({
      actions: [
        { street: 'preflop', player: 'UTG', action: 'raise', amount: 200 },
        { street: 'preflop', player: 'MP', action: 'fold' },
        { street: 'preflop', player: 'Hero', action: 'raise', amount: 600 }, // This is a 3-bet, not a steal
      ],
    });
    const stats = statsFor([hand]);
    expect(stats.counters.stealOpportunities).toBe(0);
  });
});

// ─── C-BET TESTS ───

describe('C-Bet Flop%', () => {
  it('counts c-bet when preflop aggressor bets flop', () => {
    const hand = makeHand({
      actions: [
        { street: 'preflop', player: 'UTG', action: 'fold' },
        { street: 'preflop', player: 'MP', action: 'fold' },
        { street: 'preflop', player: 'Hero', action: 'raise', amount: 250 },
        { street: 'preflop', player: 'BTN', action: 'call', amount: 250 },
        { street: 'preflop', player: 'SB', action: 'fold' },
        { street: 'flop', player: 'Hero', action: 'bet', amount: 300 },
        { street: 'flop', player: 'BTN', action: 'call', amount: 300 },
      ],
      board: { flop: ['Ks', '7h', '2d'] },
    });
    const stats = statsFor([hand]);
    expect(stats.counters.cbetFlopOpportunities).toBe(1);
    expect(stats.counters.cbetFlopMade).toBe(1);
    expect(stats.cbetFlop).toBe(100);
  });

  it('c-bet opportunity = aggressor preflop + first to act or checked to', () => {
    const hand = makeHand({
      actions: [
        { street: 'preflop', player: 'UTG', action: 'fold' },
        { street: 'preflop', player: 'MP', action: 'fold' },
        { street: 'preflop', player: 'Hero', action: 'raise', amount: 250 },
        { street: 'preflop', player: 'BTN', action: 'call', amount: 250 },
        { street: 'preflop', player: 'SB', action: 'fold' },
        // Villain acts first on flop and bets — no c-bet opportunity for Hero
        { street: 'flop', player: 'BTN', action: 'bet', amount: 300 },
        { street: 'flop', player: 'Hero', action: 'call', amount: 300 },
      ],
      board: { flop: ['Ks', '7h', '2d'] },
    });
    const stats = statsFor([hand]);
    expect(stats.counters.cbetFlopOpportunities).toBe(0);
  });

  it('missed c-bet = check when had opportunity', () => {
    const hand = makeHand({
      actions: [
        { street: 'preflop', player: 'UTG', action: 'fold' },
        { street: 'preflop', player: 'MP', action: 'fold' },
        { street: 'preflop', player: 'Hero', action: 'raise', amount: 250 },
        { street: 'preflop', player: 'BTN', action: 'call', amount: 250 },
        { street: 'preflop', player: 'SB', action: 'fold' },
        { street: 'flop', player: 'Hero', action: 'check' },
        { street: 'flop', player: 'BTN', action: 'bet', amount: 200 },
        { street: 'flop', player: 'Hero', action: 'fold' },
      ],
      board: { flop: ['Ks', '7h', '2d'] },
    });
    const stats = statsFor([hand]);
    expect(stats.counters.cbetFlopOpportunities).toBe(1);
    expect(stats.counters.cbetFlopMade).toBe(0);
    expect(stats.cbetFlop).toBe(0);
  });
});

// ─── WTSD / W$SD TESTS ───

describe('WTSD%', () => {
  it('counts only players who saw the flop', () => {
    // Hero sees flop and goes to showdown
    const hand = makeHand({
      actions: [
        { street: 'preflop', player: 'Hero', action: 'raise', amount: 250 },
        { street: 'preflop', player: 'BTN', action: 'call', amount: 250 },
        { street: 'flop', player: 'Hero', action: 'bet', amount: 300 },
        { street: 'flop', player: 'BTN', action: 'call', amount: 300 },
        { street: 'turn', player: 'Hero', action: 'check' },
        { street: 'turn', player: 'BTN', action: 'check' },
        { street: 'river', player: 'Hero', action: 'check' },
        { street: 'river', player: 'BTN', action: 'check' },
      ],
      board: { flop: ['Ks', '7h', '2d'], turn: 'Jc', river: '3h' },
      showdownHands: [
        { player: 'Hero', cards: ['Ah', 'Kd'] },
        { player: 'BTN', cards: ['Qs', 'Qd'] },
      ],
      winners: [{ player: 'Hero', amount: 1200 }],
    });
    const stats = statsFor([hand]);
    expect(stats.counters.sawFlop).toBe(1);
    expect(stats.counters.wentToShowdown).toBe(1);
    expect(stats.wtsd).toBe(100);
  });

  it('does NOT count folded before flop hands in WTSD', () => {
    const hand = makeHand({
      actions: [
        { street: 'preflop', player: 'UTG', action: 'raise', amount: 200 },
        { street: 'preflop', player: 'Hero', action: 'fold' },
      ],
    });
    const stats = statsFor([hand]);
    expect(stats.counters.sawFlop).toBe(0);
    expect(stats.wtsd).toBe(0);
  });
});

describe('W$SD%', () => {
  it('calculates won at showdown correctly', () => {
    const hand = makeHand({
      actions: [
        { street: 'preflop', player: 'Hero', action: 'raise', amount: 250 },
        { street: 'preflop', player: 'BTN', action: 'call', amount: 250 },
        { street: 'flop', player: 'Hero', action: 'bet', amount: 300 },
        { street: 'flop', player: 'BTN', action: 'call', amount: 300 },
      ],
      board: { flop: ['Ks', '7h', '2d'] },
      showdownHands: [
        { player: 'Hero', cards: ['Ah', 'Kd'] },
        { player: 'BTN', cards: ['Qs', 'Qd'] },
      ],
      winners: [{ player: 'Hero', amount: 1200 }],
    });
    const stats = statsFor([hand]);
    expect(stats.wsd).toBe(100);
  });

  it('lost at showdown = 0% WSD', () => {
    const hand = makeHand({
      actions: [
        { street: 'preflop', player: 'Hero', action: 'raise', amount: 250 },
        { street: 'preflop', player: 'BTN', action: 'call', amount: 250 },
        { street: 'flop', player: 'Hero', action: 'bet', amount: 300 },
        { street: 'flop', player: 'BTN', action: 'call', amount: 300 },
      ],
      board: { flop: ['Ks', '7h', '2d'] },
      showdownHands: [
        { player: 'Hero', cards: ['Ah', 'Kd'] },
        { player: 'BTN', cards: ['Ks', 'Kh'] },
      ],
      winners: [{ player: 'BTN', amount: 1200 }],
    });
    const stats = statsFor([hand]);
    expect(stats.counters.wentToShowdown).toBe(1);
    expect(stats.counters.wonAtShowdown).toBe(0);
    expect(stats.wsd).toBe(0);
  });
});

// ─── AF TESTS ───

describe('Aggression Factor', () => {
  it('AF = (bets + raises) / calls', () => {
    const hand = makeHand({
      actions: [
        { street: 'preflop', player: 'Hero', action: 'raise', amount: 250 },
        { street: 'preflop', player: 'BTN', action: 'call', amount: 250 },
        // Postflop: Hero bets twice, calls once -> AF = 2/1 = 2
        { street: 'flop', player: 'Hero', action: 'bet', amount: 300 },
        { street: 'flop', player: 'BTN', action: 'call', amount: 300 },
        { street: 'turn', player: 'Hero', action: 'bet', amount: 500 },
        { street: 'turn', player: 'BTN', action: 'raise', amount: 1200 },
        { street: 'turn', player: 'Hero', action: 'call', amount: 700 },
      ],
      board: { flop: ['Ks', '7h', '2d'], turn: 'Jc' },
    });
    const stats = statsFor([hand]);
    // Postflop: 2 bets, 1 call -> AF = 2/1 = 2
    expect(stats.af).toBe(2);
  });

  it('AF = 0 when no postflop actions', () => {
    const hand = makeHand({
      actions: [
        { street: 'preflop', player: 'Hero', action: 'raise', amount: 250 },
        { street: 'preflop', player: 'BTN', action: 'fold' },
      ],
    });
    const stats = statsFor([hand]);
    expect(stats.af).toBe(0);
  });

  it('AFq = (bets+raises) / (bets+raises+calls+folds) * 100', () => {
    const hand = makeHand({
      actions: [
        { street: 'preflop', player: 'Hero', action: 'raise', amount: 250 },
        { street: 'preflop', player: 'BTN', action: 'call', amount: 250 },
        // Postflop: 1 bet, 1 fold -> AFq = 1 / (1+0+1) * 100 = 50%
        { street: 'flop', player: 'BTN', action: 'bet', amount: 300 },
        { street: 'flop', player: 'Hero', action: 'raise', amount: 800 },
        { street: 'flop', player: 'BTN', action: 'call', amount: 500 },
        { street: 'turn', player: 'Hero', action: 'check' },
        { street: 'turn', player: 'BTN', action: 'bet', amount: 500 },
        { street: 'turn', player: 'Hero', action: 'fold' },
      ],
      board: { flop: ['Ks', '7h', '2d'], turn: 'Jc' },
    });
    const stats = statsFor([hand]);
    // Hero postflop: raise (1 bet/raise), fold (1 fold) -> AFq = 1/(1+0+1)*100 = 50
    expect(stats.afq).toBe(50);
  });
});

// ─── FOLD TO C-BET ───

describe('Fold to C-Bet Flop%', () => {
  it('counts fold to c-bet', () => {
    const hand = makeHand({
      actions: [
        { street: 'preflop', player: 'UTG', action: 'raise', amount: 200 },
        { street: 'preflop', player: 'Hero', action: 'call', amount: 200 },
        // UTG is aggressor, bets flop, Hero faces c-bet
        { street: 'flop', player: 'UTG', action: 'bet', amount: 300 },
        { street: 'flop', player: 'Hero', action: 'fold' },
      ],
      board: { flop: ['Ks', '7h', '2d'] },
    });
    const stats = statsFor([hand]);
    expect(stats.counters.foldToCbetFlopOpportunities).toBe(1);
    expect(stats.counters.foldToCbetFlopMade).toBe(1);
    expect(stats.foldToCbetFlop).toBe(100);
  });

  it('does not count when Hero was the aggressor', () => {
    const hand = makeHand({
      actions: [
        { street: 'preflop', player: 'Hero', action: 'raise', amount: 250 },
        { street: 'preflop', player: 'BTN', action: 'call', amount: 250 },
        { street: 'flop', player: 'Hero', action: 'bet', amount: 300 },
        { street: 'flop', player: 'BTN', action: 'fold' },
      ],
      board: { flop: ['Ks', '7h', '2d'] },
    });
    const stats = statsFor([hand]);
    expect(stats.counters.foldToCbetFlopOpportunities).toBe(0);
  });
});

// ─── LIMP TESTS ───

describe('Limp%', () => {
  it('detects open limp', () => {
    // Hero at CO (seat 4), folded to them, they call (limp)
    const hand = makeHand({
      actions: [
        { street: 'preflop', player: 'UTG', action: 'fold' },
        { street: 'preflop', player: 'MP', action: 'fold' },
        { street: 'preflop', player: 'Hero', action: 'call', amount: 100 }, // open limp
      ],
    });
    const stats = statsFor([hand]);
    expect(stats.counters.limpCount).toBe(1);
    expect(stats.limp).toBe(100);
  });

  it('does not count call facing a raise as limp', () => {
    const hand = makeHand({
      actions: [
        { street: 'preflop', player: 'UTG', action: 'raise', amount: 200 },
        { street: 'preflop', player: 'MP', action: 'fold' },
        { street: 'preflop', player: 'Hero', action: 'call', amount: 200 },
      ],
    });
    const stats = statsFor([hand]);
    expect(stats.counters.limpCount).toBe(0);
  });
});

// ─── MULTI-HAND STATS ───

describe('Multi-hand stats calculation', () => {
  it('aggregates correctly over multiple hands', () => {
    const hand1 = makeHand({
      handId: 'h1',
      actions: [
        { street: 'preflop', player: 'Hero', action: 'raise', amount: 250 },
        { street: 'preflop', player: 'BTN', action: 'fold' },
      ],
    });

    const hand2 = makeHand({
      handId: 'h2',
      actions: [
        { street: 'preflop', player: 'UTG', action: 'raise', amount: 200 },
        { street: 'preflop', player: 'MP', action: 'fold' },
        { street: 'preflop', player: 'Hero', action: 'fold' },
      ],
    });

    const hand3 = makeHand({
      handId: 'h3',
      actions: [
        { street: 'preflop', player: 'UTG', action: 'raise', amount: 200 },
        { street: 'preflop', player: 'MP', action: 'fold' },
        { street: 'preflop', player: 'Hero', action: 'call', amount: 200 },
        { street: 'preflop', player: 'BTN', action: 'fold' },
      ],
    });

    const stats = statsFor([hand1, hand2, hand3]);
    expect(stats.handsPlayed).toBe(3);
    // VPIP: hand1 (raise=yes), hand2 (fold=no), hand3 (call=yes) -> 2/3 = 66.7%
    expect(stats.vpip).toBeCloseTo(66.67, 0);
    // PFR: hand1 (raise=yes), hand2 (fold=no), hand3 (call=no) -> 1/3 = 33.3%
    expect(stats.pfr).toBeCloseTo(33.33, 0);
  });
});

// ─── EDGE CASES ───

describe('Edge cases', () => {
  it('handles empty hands array', () => {
    const stats = statsFor([]);
    expect(stats.handsPlayed).toBe(0);
    expect(stats.vpip).toBe(0);
    expect(stats.af).toBe(0);
  });

  it('handles player not found in hand', () => {
    const hand = makeHand();
    const stats = calculateStats([hand], 'NonExistentPlayer');
    expect(stats.handsPlayed).toBe(0);
  });

  it('AF does not divide by zero when no calls', () => {
    const hand = makeHand({
      actions: [
        { street: 'preflop', player: 'Hero', action: 'raise', amount: 250 },
        { street: 'preflop', player: 'BTN', action: 'call', amount: 250 },
        { street: 'flop', player: 'Hero', action: 'bet', amount: 300 },
        { street: 'flop', player: 'BTN', action: 'fold' },
      ],
      board: { flop: ['Ks', '7h', '2d'] },
    });
    const stats = statsFor([hand]);
    // 1 bet, 0 calls -> AF = 0 (we return 0 when no calls to avoid Infinity)
    expect(stats.af).toBe(0);
    // But AFq should be 100% (all actions are aggressive)
    expect(stats.afq).toBe(100);
  });
});
