import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseHand, parseFile, splitHands, isXmlFormat } from '../../src/parsers/pmu/parser';

const fixturesDir = join(__dirname, '../fixtures');
function loadFixture(name: string): string {
  return readFileSync(join(fixturesDir, name), 'utf-8');
}

describe('PMU Parser — Format Detection', () => {
  it('detects text format', () => {
    const content = loadFixture('pmu-tournament.txt');
    expect(isXmlFormat(content)).toBe(false);
  });

  it('detects XML format', () => {
    const content = loadFixture('pmu-tournament.xml');
    expect(isXmlFormat(content)).toBe(true);
  });
});

describe('PMU Parser — Text Format', () => {
  describe('splitHands', () => {
    it('splits a text file into individual hands', () => {
      const content = loadFixture('pmu-tournament.txt');
      const hands = splitHands(content);
      expect(hands.length).toBe(2);
    });
  });

  describe('parseHand — complete hand (text)', () => {
    const content = loadFixture('pmu-tournament.txt');
    const hands = splitHands(content);
    const hand = parseHand(hands[0], 'HeroName')!;

    it('returns a valid parsed hand', () => {
      expect(hand).not.toBeNull();
    });

    it('parses the hand ID', () => {
      expect(hand.handId).toBe('12345678-12');
    });

    it('parses room as pmu', () => {
      expect(hand.room).toBe('pmu');
    });

    it('parses tournament ID', () => {
      expect(hand.tournamentId).toBe('12345678');
    });

    it('parses blinds and ante', () => {
      expect(hand.smallBlind).toBe(50);
      expect(hand.bigBlind).toBe(100);
      expect(hand.ante).toBe(10);
    });

    it('parses 6 players', () => {
      expect(hand.players.length).toBe(6);
    });

    it('parses player stacks', () => {
      const hero = hand.players.find((p) => p.name === 'HeroName');
      expect(hero).toBeDefined();
      expect(hero!.stack).toBe(6200);
      expect(hero!.isHero).toBe(true);
    });

    it('parses button seat', () => {
      expect(hand.buttonSeat).toBe(5);
    });

    it('parses hero cards', () => {
      expect(hand.heroCards).toEqual(['Jh', 'Ts']);
    });

    it('parses the flop', () => {
      expect(hand.board.flop).toEqual(['Qh', '9c', '8d']);
    });

    it('parses the turn', () => {
      expect(hand.board.turn).toBe('Kc');
    });

    it('has no river (hand ended on turn)', () => {
      expect(hand.board.river).toBeUndefined();
    });

    it('parses antes as actions', () => {
      const antes = hand.actions.filter((a) => a.action === 'post_ante');
      expect(antes.length).toBe(6);
      expect(antes[0].amount).toBe(10);
    });

    it('parses blinds as actions', () => {
      const blinds = hand.actions.filter((a) => a.action === 'post_blind');
      expect(blinds.length).toBe(2);
      expect(blinds[0].player).toBe('Player6'); // SB
      expect(blinds[0].amount).toBe(50);
      expect(blinds[1].player).toBe('Player1'); // BB
      expect(blinds[1].amount).toBe(100);
    });

    it('parses preflop actions', () => {
      const preflopActions = hand.actions.filter(
        (a) => a.street === 'preflop' && !['post_ante', 'post_blind'].includes(a.action)
      );
      // Player3 folds, Player4 folds, Player5 folds, HeroName raises, Player6 folds, Player1 calls
      expect(preflopActions.length).toBe(6);
    });

    it('parses flop actions', () => {
      const flopActions = hand.actions.filter((a) => a.street === 'flop');
      // Player1 checks, HeroName bets, Player1 calls
      expect(flopActions.length).toBe(3);
    });

    it('parses turn actions', () => {
      const turnActions = hand.actions.filter((a) => a.street === 'turn');
      // Player1 checks, HeroName bets, Player1 folds
      expect(turnActions.length).toBe(3);
    });

    it('parses winner', () => {
      expect(hand.winners.length).toBe(1);
      expect(hand.winners[0].player).toBe('HeroName');
      expect(hand.winners[0].amount).toBe(1580);
    });

    it('parses pot from winner amount', () => {
      expect(hand.pot).toBe(1580);
    });
  });

  describe('parseHand — all-in with showdown (text)', () => {
    const content = loadFixture('pmu-tournament.txt');
    const hands = splitHands(content);
    const hand = parseHand(hands[1], 'HeroName')!;

    it('parses all-in action', () => {
      const allins = hand.actions.filter((a) => a.action === 'allin');
      expect(allins.length).toBe(1);
      expect(allins[0].player).toBe('Player4');
      expect(allins[0].amount).toBe(4830);
    });

    it('parses showdown hands', () => {
      expect(hand.showdownHands.length).toBe(2);
      const villain = hand.showdownHands.find((s) => s.player === 'Player4');
      expect(villain).toBeDefined();
      expect(villain!.cards).toEqual(['Qd', 'Qs']);
    });

    it('parses full board', () => {
      expect(hand.board.flop).toEqual(['Ah', '7c', '2d']);
      expect(hand.board.turn).toBe('5s');
      expect(hand.board.river).toBe('Td');
    });

    it('parses hero AcKh', () => {
      expect(hand.heroCards).toEqual(['Ac', 'Kh']);
    });

    it('parses winner', () => {
      expect(hand.winners[0].player).toBe('HeroName');
      expect(hand.winners[0].amount).toBe(10290);
    });
  });

  describe('parseHand — auto-detects hero', () => {
    const content = loadFixture('pmu-tournament.txt');
    const hands = splitHands(content);
    const hand = parseHand(hands[0])!;

    it('auto-detects hero from Dealt line', () => {
      const hero = hand.players.find((p) => p.isHero);
      expect(hero).toBeDefined();
      expect(hero!.name).toBe('HeroName');
    });
  });

  describe('parseFile — text format', () => {
    it('parses a multi-hand file', () => {
      const content = loadFixture('pmu-tournament.txt');
      const result = parseFile(content, 'HeroName');
      expect(result.hands.length).toBe(2);
      expect(result.errors.length).toBe(0);
    });
  });
});

describe('PMU Parser — XML Format', () => {
  describe('splitHands', () => {
    it('splits XML into individual game blocks', () => {
      const content = loadFixture('pmu-tournament.xml');
      const hands = splitHands(content);
      expect(hands.length).toBe(2);
    });
  });

  describe('parseHand — XML game 1', () => {
    const content = loadFixture('pmu-tournament.xml');
    const hands = splitHands(content);
    const hand = parseHand(hands[0], 'HeroName')!;

    it('returns a valid parsed hand', () => {
      expect(hand).not.toBeNull();
    });

    it('parses hand ID from gamecode', () => {
      expect(hand.handId).toBe('123456789');
    });

    it('parses room as pmu', () => {
      expect(hand.room).toBe('pmu');
    });

    it('parses tournament ID from sessioncode', () => {
      expect(hand.tournamentId).toBe('12345');
    });

    it('parses 6 players', () => {
      expect(hand.players.length).toBe(6);
    });

    it('parses player stacks from chips attribute', () => {
      const hero = hand.players.find((p) => p.name === 'HeroName');
      expect(hero).toBeDefined();
      expect(hero!.stack).toBe(6200);
      expect(hero!.isHero).toBe(true);
    });

    it('parses button from dealer attribute', () => {
      expect(hand.buttonSeat).toBe(5);
    });

    it('parses hero cards from Pocket cards', () => {
      expect(hand.heroCards).toEqual(['Jh', 'Ts']);
    });

    it('parses antes from type=15 actions', () => {
      const antes = hand.actions.filter((a) => a.action === 'post_ante');
      expect(antes.length).toBe(6);
    });

    it('parses blinds from type 1 and 2', () => {
      const blinds = hand.actions.filter((a) => a.action === 'post_blind');
      expect(blinds.length).toBe(2);
      expect(blinds[0].player).toBe('Player6'); // SB
      expect(blinds[0].amount).toBe(50);
      expect(blinds[1].player).toBe('Player1'); // BB
      expect(blinds[1].amount).toBe(100);
    });

    it('parses preflop actions (round 1)', () => {
      const preflopActions = hand.actions.filter(
        (a) => a.street === 'preflop' && !['post_ante', 'post_blind'].includes(a.action)
      );
      // Player3 folds, Player4 folds, Player5 folds, HeroName raises, Player6 folds, Player1 calls
      expect(preflopActions.length).toBe(6);
    });

    it('parses flop board from community attribute', () => {
      expect(hand.board.flop).toEqual(['Qh', '9c', '8d']);
    });

    it('parses turn card', () => {
      expect(hand.board.turn).toBe('Kc');
    });

    it('parses flop actions (round 2)', () => {
      const flopActions = hand.actions.filter((a) => a.street === 'flop');
      // Player1 checks, HeroName bets, Player1 calls
      expect(flopActions.length).toBe(3);
    });

    it('parses turn actions (round 3)', () => {
      const turnActions = hand.actions.filter((a) => a.street === 'turn');
      // Player1 checks, HeroName bets, Player1 folds
      expect(turnActions.length).toBe(3);
    });

    it('parses winner from win attribute', () => {
      expect(hand.winners.length).toBe(1);
      expect(hand.winners[0].player).toBe('HeroName');
      expect(hand.winners[0].amount).toBe(1850);
    });
  });

  describe('parseHand — XML game 2', () => {
    const content = loadFixture('pmu-tournament.xml');
    const hands = splitHands(content);
    const hand = parseHand(hands[1], 'HeroName')!;

    it('parses second game', () => {
      expect(hand).not.toBeNull();
      expect(hand.handId).toBe('123456790');
    });

    it('parses hero cards AcKh', () => {
      expect(hand.heroCards).toEqual(['Ac', 'Kh']);
    });

    it('parses 4 players', () => {
      expect(hand.players.length).toBe(4);
    });

    it('parses winner', () => {
      expect(hand.winners[0].player).toBe('HeroName');
      expect(hand.winners[0].amount).toBe(2100);
    });
  });

  describe('parseHand — auto-detects hero from nickname tag', () => {
    const content = loadFixture('pmu-tournament.xml');
    const hands = splitHands(content);
    const hand = parseHand(hands[0])!; // No heroName passed

    it('auto-detects hero from <nickname>', () => {
      const hero = hand.players.find((p) => p.isHero);
      expect(hero).toBeDefined();
      expect(hero!.name).toBe('HeroName');
    });
  });

  describe('parseFile — XML format', () => {
    it('parses a multi-game XML file', () => {
      const content = loadFixture('pmu-tournament.xml');
      const result = parseFile(content, 'HeroName');
      expect(result.hands.length).toBe(2);
      expect(result.errors.length).toBe(0);
    });
  });
});

describe('PMU Parser — Corrupted Input', () => {
  it('returns null for empty string', () => {
    expect(parseHand('')).toBeNull();
  });

  it('returns null for random text', () => {
    expect(parseHand('not a pmu hand')).toBeNull();
  });

  it('returns null for broken XML', () => {
    expect(parseHand('<session><broken')).toBeNull();
  });
});
