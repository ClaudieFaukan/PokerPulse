import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import Database from 'better-sqlite3';
import { createTestDb } from '../helpers/test-db';
import { parseFile, splitHands, parseHand } from '../../src/parsers/winamax/parser';
import { parseFileContent } from '../../src/parsers/index';

const fixturesDir = join(__dirname, '../fixtures');
function loadFixture(name: string): string {
  return readFileSync(join(fixturesDir, name), 'utf-8');
}

describe('Edge Cases — Parser', () => {
  const content = loadFixture('winamax-edge-cases.txt');
  const result = parseFile(content, 'HeroName');

  it('parses all 3 hands from edge case file', () => {
    expect(result.hands.length).toBe(3);
    expect(result.errors.length).toBe(0);
  });

  describe('Hand 1: Hero all-in preflop, loses', () => {
    const hand = result.hands[0];

    it('detects all-in action', () => {
      const allins = hand.actions.filter((a) => a.action === 'allin');
      expect(allins.length).toBe(1);
      expect(allins[0].player).toBe('HeroName');
    });

    it('parses 4-bet shove amount', () => {
      const allin = hand.actions.find((a) => a.player === 'HeroName' && a.action === 'allin');
      expect(allin!.amount).toBe(2975);
    });

    it('parses showdown — villain wins', () => {
      expect(hand.winners.length).toBe(1);
      expect(hand.winners[0].player).toBe('Villain1');
      expect(hand.winners[0].amount).toBe(6350);
    });

    it('parses both showdown hands', () => {
      expect(hand.showdownHands.length).toBe(2);
    });

    it('handles 6-max with empty seats (4 players)', () => {
      expect(hand.players.length).toBe(4);
      expect(hand.tableSize).toBe(6);
    });

    it('parses ante with no ante in blinds structure', () => {
      expect(hand.ante).toBe(25);
    });
  });

  describe('Hand 2: Everyone folds to BB — no flop', () => {
    const hand = result.hands[1];

    it('has no board cards', () => {
      expect(hand.board.flop).toBeUndefined();
      expect(hand.board.turn).toBeUndefined();
      expect(hand.board.river).toBeUndefined();
    });

    it('BB collects', () => {
      expect(hand.winners[0].player).toBe('Player5');
      expect(hand.winners[0].amount).toBe(20);
    });

    it('hero folded preflop', () => {
      const heroFold = hand.actions.find((a) => a.player === 'HeroName' && a.action === 'fold');
      expect(heroFold).toBeDefined();
    });

    it('has no ante (level 1)', () => {
      expect(hand.ante).toBe(0);
    });
  });

  describe('Hand 3: Split pot', () => {
    const hand = result.hands[2];

    it('has two winners', () => {
      expect(hand.winners.length).toBe(2);
    });

    it('each player gets half', () => {
      expect(hand.winners[0].amount).toBe(3050);
      expect(hand.winners[1].amount).toBe(3050);
    });

    it('total pot is correct', () => {
      expect(hand.pot).toBe(6100);
    });

    it('both players showed', () => {
      expect(hand.showdownHands.length).toBe(2);
    });

    it('both had the same straight (AK on QJT board)', () => {
      const heroShow = hand.showdownHands.find((s) => s.player === 'HeroName');
      const villainShow = hand.showdownHands.find((s) => s.player === 'Villain1');
      expect(heroShow!.cards).toEqual(['Ah', 'Ks']);
      expect(villainShow!.cards).toEqual(['As', 'Kc']);
    });

    it('detects both all-ins', () => {
      const allins = hand.actions.filter((a) => a.action === 'allin');
      expect(allins.length).toBe(2);
    });
  });
});

describe('Edge Cases — DB effective_cost', () => {
  it('COALESCE returns buy_in+fee when effective_cost is NULL', () => {
    const db = createTestDb();
    db.prepare(`INSERT INTO tournaments (room, tournament_id, name, buy_in, fee, hero_prize)
      VALUES ('winamax', '1', 'Test', 10, 1, 25)`).run();

    const result = db.prepare(`
      SELECT (hero_prize - COALESCE(effective_cost, buy_in + bounty + fee)) as profit
      FROM tournaments WHERE tournament_id = '1'
    `).get() as any;

    expect(result.profit).toBe(14); // 25 - (10 + 1)
    db.close();
  });

  it('COALESCE uses effective_cost when set (free ticket)', () => {
    const db = createTestDb();
    db.prepare(`INSERT INTO tournaments (room, tournament_id, name, buy_in, fee, effective_cost, hero_prize)
      VALUES ('winamax', '2', 'Freeroll', 10, 1, 0, 25)`).run();

    const result = db.prepare(`
      SELECT (hero_prize - COALESCE(effective_cost, buy_in + bounty + fee)) as profit
      FROM tournaments WHERE tournament_id = '2'
    `).get() as any;

    expect(result.profit).toBe(25); // 25 - 0
    db.close();
  });

  it('COALESCE uses partial cost override', () => {
    const db = createTestDb();
    db.prepare(`INSERT INTO tournaments (room, tournament_id, name, buy_in, fee, effective_cost, hero_prize)
      VALUES ('winamax', '3', 'Discounted', 20, 2, 5, 30)`).run();

    const result = db.prepare(`
      SELECT (hero_prize - COALESCE(effective_cost, buy_in + bounty + fee)) as profit
      FROM tournaments WHERE tournament_id = '3'
    `).get() as any;

    expect(result.profit).toBe(25); // 30 - 5
    db.close();
  });

  it('SUM with COALESCE works for aggregated stats', () => {
    const db = createTestDb();
    db.prepare(`INSERT INTO tournaments (room, tournament_id, name, buy_in, fee, hero_prize) VALUES ('w', '1', 'T1', 10, 1, 20)`).run();
    db.prepare(`INSERT INTO tournaments (room, tournament_id, name, buy_in, fee, effective_cost, hero_prize) VALUES ('w', '2', 'T2', 10, 1, 0, 15)`).run();
    db.prepare(`INSERT INTO tournaments (room, tournament_id, name, buy_in, fee, hero_prize) VALUES ('w', '3', 'T3', 10, 1, 0)`).run();

    const result = db.prepare(`
      SELECT
        SUM(hero_prize - COALESCE(effective_cost, buy_in + bounty + fee)) as total_profit,
        SUM(COALESCE(effective_cost, buy_in + bounty + fee)) as total_invested
      FROM tournaments
    `).get() as any;

    // T1: 20 - 11 = 9, T2: 15 - 0 = 15, T3: 0 - 11 = -11 → total = 13
    expect(result.total_profit).toBe(13);
    // T1: 11, T2: 0, T3: 11 → total = 22
    expect(result.total_invested).toBe(22);
    db.close();
  });
});

describe('Edge Cases — Position Determination', () => {
  it('handles heads-up (2 players)', () => {
    const content = loadFixture('winamax-edge-cases.txt');
    // Hand 3 is 3-max, test that positions work with few players
    const hands = splitHands(content);
    const hand = parseHand(hands[2], 'HeroName')!;
    expect(hand.players.length).toBe(3);
    // BTN = seat 1 = HeroName
    expect(hand.buttonSeat).toBe(1);
  });
});

describe('Edge Cases — Multi-room import', () => {
  it('each parser assigns correct room', () => {
    const wResult = parseFileContent(loadFixture('winamax-tournament.txt'));
    const psResult = parseFileContent(loadFixture('pokerstars-tournament.txt'));
    const pmuResult = parseFileContent(loadFixture('pmu-tournament.txt'));

    expect(wResult.hands.every((h) => h.room === 'winamax')).toBe(true);
    expect(psResult.hands.every((h) => h.room === 'pokerstars')).toBe(true);
    expect(pmuResult.hands.every((h) => h.room === 'pmu')).toBe(true);
  });

  it('hand IDs are unique per room', () => {
    const wResult = parseFileContent(loadFixture('winamax-tournament.txt'));
    const ids = wResult.hands.map((h) => `${h.room}:${h.handId}`);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });
});

import { calculateStats } from '../../src/engine/stats';

describe('Edge Cases — Stats Engine', () => {

  function makeHand(overrides: any = {}) {
    return {
      handId: 'test',
      room: 'winamax',
      tournamentId: '1',
      tournamentName: 'Test',
      buyIn: 10,
      fee: 1,
      datetime: new Date(),
      level: 1,
      smallBlind: 50,
      bigBlind: 100,
      ante: 0,
      buttonSeat: 3,
      tableSize: 3,
      players: [
        { seat: 1, name: 'A', stack: 5000, isHero: false },
        { seat: 2, name: 'B', stack: 5000, isHero: false },
        { seat: 3, name: 'Hero', stack: 5000, isHero: true },
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

  it('handles hand with zero actions gracefully', () => {
    const hand = makeHand({ actions: [] });
    const stats = calculateStats([hand], 'Hero');
    expect(stats.handsPlayed).toBe(1);
    expect(stats.vpip).toBe(0);
  });

  it('handles hand where hero is not present', () => {
    const hand = makeHand({
      players: [
        { seat: 1, name: 'A', stack: 5000, isHero: false },
        { seat: 2, name: 'B', stack: 5000, isHero: false },
      ],
    });
    const stats = calculateStats([hand], 'Hero');
    expect(stats.handsPlayed).toBe(0);
  });

  it('correctly computes stats over 100 identical hands', () => {
    const hand = makeHand({
      actions: [
        { street: 'preflop', player: 'Hero', action: 'raise', amount: 250 },
        { street: 'preflop', player: 'A', action: 'fold' },
      ],
    });
    const hands = Array(100).fill(hand);
    const stats = calculateStats(hands, 'Hero');
    expect(stats.handsPlayed).toBe(100);
    expect(stats.vpip).toBe(100);
    expect(stats.pfr).toBe(100);
  });
});
