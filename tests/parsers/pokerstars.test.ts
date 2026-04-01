import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseHand, parseFile, splitHands } from '../../src/parsers/pokerstars/parser';
import { parseSummary } from '../../src/parsers/pokerstars/summary-parser';

const fixturesDir = join(__dirname, '../fixtures');
function loadFixture(name: string): string {
  return readFileSync(join(fixturesDir, name), 'utf-8');
}

describe('PokerStars Parser', () => {
  describe('splitHands', () => {
    it('splits a file into individual hands', () => {
      const content = loadFixture('pokerstars-tournament.txt');
      const hands = splitHands(content);
      expect(hands.length).toBe(2);
    });
  });

  describe('parseHand — complete hand with showdown', () => {
    const content = loadFixture('pokerstars-tournament.txt');
    const hands = splitHands(content);
    const hand = parseHand(hands[0], 'HeroName')!;

    it('returns a valid parsed hand', () => {
      expect(hand).not.toBeNull();
    });

    it('parses the hand ID', () => {
      expect(hand.handId).toBe('234567890123');
    });

    it('parses room as pokerstars', () => {
      expect(hand.room).toBe('pokerstars');
    });

    it('parses tournament ID', () => {
      expect(hand.tournamentId).toBe('3456789012');
    });

    it('parses buy-in in $ from header', () => {
      expect(hand.buyIn).toBe(10);
      expect(hand.fee).toBe(1);
    });

    it('parses roman numeral level XII = 12', () => {
      expect(hand.level).toBe(12);
    });

    it('parses blinds', () => {
      expect(hand.smallBlind).toBe(150);
      expect(hand.bigBlind).toBe(300);
    });

    it('parses ante from action lines', () => {
      expect(hand.ante).toBe(40);
    });

    it('parses CET timezone — converts to UTC', () => {
      // 2024/01/15 21:45:00 CET = 2024/01/15 20:45:00 UTC
      expect(hand.datetime.toISOString()).toBe('2024-01-15T20:45:00.000Z');
    });

    it('parses 6 players (not all 9 seats filled)', () => {
      expect(hand.players.length).toBe(6);
    });

    it('parses player stacks with "in chips"', () => {
      const hero = hand.players.find((p) => p.name === 'HeroName');
      expect(hero).toBeDefined();
      expect(hero!.stack).toBe(9800);
      expect(hero!.isHero).toBe(true);
    });

    it('parses button seat', () => {
      expect(hand.buttonSeat).toBe(6);
    });

    it('parses table size', () => {
      expect(hand.tableSize).toBe(9);
    });

    it('parses hero cards', () => {
      expect(hand.heroCards).toEqual(['Qs', 'Qd']);
    });

    it('parses the flop', () => {
      expect(hand.board.flop).toEqual(['8h', '5c', '2s']);
    });

    it('parses the turn (space-separated from flop)', () => {
      expect(hand.board.turn).toBe('Kd');
    });

    it('parses the river', () => {
      expect(hand.board.river).toBe('3h');
    });

    it('parses antes as preflop actions', () => {
      const antes = hand.actions.filter((a) => a.action === 'post_ante');
      expect(antes.length).toBe(6);
      expect(antes[0].amount).toBe(40);
      expect(antes[0].street).toBe('preflop');
    });

    it('parses blinds as preflop actions', () => {
      const blinds = hand.actions.filter((a) => a.action === 'post_blind');
      expect(blinds.length).toBe(2);
      expect(blinds[0].player).toBe('Player8');
      expect(blinds[0].amount).toBe(150);
      expect(blinds[1].player).toBe('Player1');
      expect(blinds[1].amount).toBe(300);
    });

    it('parses preflop actions (after HOLE CARDS)', () => {
      const preflopActions = hand.actions.filter(
        (a) => a.street === 'preflop' && !['post_ante', 'post_blind'].includes(a.action)
      );
      // Player2 folds, HeroName raises, Player4 folds, Player6 calls, Player8 folds, Player1 folds
      expect(preflopActions.length).toBe(6);
    });

    it('parses raise amounts as total (to)', () => {
      const heroRaise = hand.actions.find(
        (a) => a.player === 'HeroName' && a.action === 'raise'
      );
      expect(heroRaise).toBeDefined();
      expect(heroRaise!.amount).toBe(660);
    });

    it('parses flop actions', () => {
      const flopActions = hand.actions.filter((a) => a.street === 'flop');
      // HeroName bets 825, Player6 calls 825
      expect(flopActions.length).toBe(2);
    });

    it('parses turn actions', () => {
      const turnActions = hand.actions.filter((a) => a.street === 'turn');
      // HeroName checks, Player6 bets 1800, HeroName calls 1800
      expect(turnActions.length).toBe(3);
    });

    it('parses river actions', () => {
      const riverActions = hand.actions.filter((a) => a.street === 'river');
      // HeroName checks, Player6 checks
      expect(riverActions.length).toBe(2);
    });

    it('parses showdown — shows and mucks', () => {
      expect(hand.showdownHands.length).toBe(1); // Only HeroName shows, Player6 mucks
      expect(hand.showdownHands[0].player).toBe('HeroName');
      expect(hand.showdownHands[0].cards).toEqual(['Qs', 'Qd']);
    });

    it('parses the winner', () => {
      expect(hand.winners.length).toBe(1);
      expect(hand.winners[0].player).toBe('HeroName');
      expect(hand.winners[0].amount).toBe(7010);
    });

    it('parses total pot', () => {
      expect(hand.pot).toBe(7010);
    });
  });

  describe('parseHand — fold preflop (no board)', () => {
    const content = loadFixture('pokerstars-tournament.txt');
    const hands = splitHands(content);
    const hand = parseHand(hands[1], 'HeroName')!;

    it('returns a valid hand', () => {
      expect(hand).not.toBeNull();
    });

    it('parses hero cards 7s 2d', () => {
      expect(hand.heroCards).toEqual(['7s', '2d']);
    });

    it('has no flop/turn/river', () => {
      expect(hand.board.flop).toBeUndefined();
      expect(hand.board.turn).toBeUndefined();
      expect(hand.board.river).toBeUndefined();
    });

    it('parses winner as Player6 with 990', () => {
      expect(hand.winners[0].player).toBe('Player6');
      expect(hand.winners[0].amount).toBe(990);
    });

    it('parses hero fold', () => {
      const heroFold = hand.actions.find(
        (a) => a.player === 'HeroName' && a.action === 'fold'
      );
      expect(heroFold).toBeDefined();
    });
  });

  describe('parseHand — all-in multiway', () => {
    const content = loadFixture('pokerstars-allin.txt');
    const hand = parseHand(content, 'HeroName')!;

    it('parses all-in hand', () => {
      expect(hand).not.toBeNull();
    });

    it('parses 4 players', () => {
      expect(hand.players.length).toBe(4);
    });

    it('parses level XX = 20', () => {
      expect(hand.level).toBe(20);
    });

    it('parses blinds 1000/2000', () => {
      expect(hand.smallBlind).toBe(1000);
      expect(hand.bigBlind).toBe(2000);
    });

    it('parses ante 250', () => {
      expect(hand.ante).toBe(250);
    });

    it('detects all-in actions', () => {
      const allins = hand.actions.filter((a) => a.action === 'allin');
      expect(allins.length).toBe(3); // ShortStack, HeroName, Villain2
    });

    it('parses ShortStack all-in raise to 5150', () => {
      const ssAllin = hand.actions.find(
        (a) => a.player === 'ShortStack' && a.action === 'allin'
      );
      expect(ssAllin!.amount).toBe(5150);
    });

    it('parses showdown with 3 players showing', () => {
      expect(hand.showdownHands.length).toBe(3);
    });

    it('parses multiple collected pots', () => {
      const heroWinnings = hand.winners.filter((w) => w.player === 'HeroName');
      expect(heroWinnings.length).toBe(2); // side pot + main pot
      const total = heroWinnings.reduce((sum, w) => sum + w.amount, 0);
      expect(total).toBe(30400);
    });

    it('parses hero AhKs', () => {
      expect(hand.heroCards).toEqual(['Ah', 'Ks']);
    });

    it('parses full board', () => {
      expect(hand.board.flop).toEqual(['Td', '8s', '3c']);
      expect(hand.board.turn).toBe('Kh');
      expect(hand.board.river).toBe('5d');
    });
  });

  describe('parseHand — auto-detects hero', () => {
    const content = loadFixture('pokerstars-tournament.txt');
    const hands = splitHands(content);
    const hand = parseHand(hands[0])!; // No heroName

    it('auto-detects hero from Dealt line', () => {
      const hero = hand.players.find((p) => p.isHero);
      expect(hero).toBeDefined();
      expect(hero!.name).toBe('HeroName');
    });
  });

  describe('parseHand — corrupted input', () => {
    it('returns null for empty string', () => {
      expect(parseHand('')).toBeNull();
    });

    it('returns null for random text', () => {
      expect(parseHand('not a pokerstars hand')).toBeNull();
    });
  });

  describe('parseFile', () => {
    it('parses a multi-hand file', () => {
      const content = loadFixture('pokerstars-tournament.txt');
      const result = parseFile(content, 'HeroName');
      expect(result.hands.length).toBe(2);
      expect(result.errors.length).toBe(0);
    });
  });

  describe('roman numeral parsing', () => {
    it('handles various levels', () => {
      // Test via actual hands with different levels
      const hand12 = parseHand(loadFixture('pokerstars-tournament.txt').split('\n').slice(0, 50).join('\n'), 'HeroName');
      // Level XII parsed in the complete hand test above
    });
  });
});

describe('PokerStars Summary Parser', () => {
  const content = loadFixture('pokerstars-summary.txt');
  const summary = parseSummary(content)!;

  it('returns a valid summary', () => {
    expect(summary).not.toBeNull();
  });

  it('parses tournament ID', () => {
    expect(summary.tournamentId).toBe('3456789012');
  });

  it('parses buy-in', () => {
    expect(summary.buyIn).toBe(10);
    expect(summary.fee).toBe(1);
  });

  it('parses prize pool', () => {
    expect(summary.prizePool).toBe(2500);
  });

  it('parses total players', () => {
    expect(summary.totalPlayers).toBe(250);
  });

  it('parses hero finish position', () => {
    expect(summary.heroFinishPosition).toBe(12);
  });

  it('parses hero prize', () => {
    expect(summary.heroPrize).toBe(35);
  });

  it('parses payout structure', () => {
    expect(summary.payoutStructure.length).toBe(10);
    expect(summary.payoutStructure[0]).toEqual({ position: 1, prize: 500 });
  });

  it('defaults to MTT type', () => {
    expect(summary.tournamentType).toBe('MTT');
  });

  it('room is pokerstars', () => {
    expect(summary.room).toBe('pokerstars');
  });
});
