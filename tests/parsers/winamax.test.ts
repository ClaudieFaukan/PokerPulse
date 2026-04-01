import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseHand, parseFile, splitHands } from '../../src/parsers/winamax/parser';
import { parseSummary } from '../../src/parsers/winamax/summary-parser';

const fixturesDir = join(__dirname, '../fixtures');

function loadFixture(name: string): string {
  return readFileSync(join(fixturesDir, name), 'utf-8');
}

describe('Winamax Parser', () => {
  describe('splitHands', () => {
    it('splits a file into individual hands', () => {
      const content = loadFixture('winamax-tournament.txt');
      const hands = splitHands(content);
      expect(hands.length).toBe(2);
    });
  });

  describe('parseHand — complete hand', () => {
    const content = loadFixture('winamax-tournament.txt');
    const hands = splitHands(content);
    const hand = parseHand(hands[0], 'HeroName')!;

    it('returns a valid parsed hand', () => {
      expect(hand).not.toBeNull();
    });

    it('parses the hand ID', () => {
      expect(hand.handId).toBe('123456-89-1234567890');
    });

    it('parses room as winamax', () => {
      expect(hand.room).toBe('winamax');
    });

    it('parses tournament name', () => {
      expect(hand.tournamentName).toBe('Freeroll 500€');
    });

    it('parses buy-in from the header', () => {
      expect(hand.buyIn).toBe(5);
      expect(hand.fee).toBe(0.5);
    });

    it('parses the level', () => {
      expect(hand.level).toBe(4);
    });

    it('parses blinds and antes', () => {
      expect(hand.smallBlind).toBe(25);
      expect(hand.bigBlind).toBe(50);
      expect(hand.ante).toBe(5);
    });

    it('parses the datetime in UTC', () => {
      expect(hand.datetime.toISOString()).toBe('2024-01-15T20:30:00.000Z');
    });

    it('parses all 9 players', () => {
      expect(hand.players.length).toBe(9);
    });

    it('parses player stacks', () => {
      const hero = hand.players.find((p) => p.name === 'HeroName');
      expect(hero).toBeDefined();
      expect(hero!.stack).toBe(4200);
      expect(hero!.isHero).toBe(true);
    });

    it('parses button seat', () => {
      expect(hand.buttonSeat).toBe(3);
    });

    it('parses table size', () => {
      expect(hand.tableSize).toBe(9);
    });

    it('parses hero cards', () => {
      expect(hand.heroCards).toEqual(['Ah', 'Kd']);
    });

    it('parses the flop', () => {
      expect(hand.board.flop).toEqual(['Ks', '7h', '2d']);
    });

    it('parses the turn', () => {
      expect(hand.board.turn).toBe('Jc');
    });

    it('does not parse a river (hand ended on turn)', () => {
      expect(hand.board.river).toBeUndefined();
    });

    it('parses antes as actions', () => {
      const antes = hand.actions.filter((a) => a.action === 'post_ante');
      expect(antes.length).toBe(9);
      expect(antes[0].amount).toBe(5);
    });

    it('parses blinds as actions', () => {
      const blinds = hand.actions.filter((a) => a.action === 'post_blind');
      expect(blinds.length).toBe(2);
      expect(blinds[0].amount).toBe(25); // SB
      expect(blinds[1].amount).toBe(50); // BB
    });

    it('parses preflop actions', () => {
      const preflopActions = hand.actions.filter(
        (a) => a.street === 'preflop' && !['post_ante', 'post_blind'].includes(a.action)
      );
      // Player6 folds, Player7 raises, Player8 folds, Player9 folds, Player1 folds, Player2 folds
      // HeroName raises, Player4 folds, Player5 folds, Player7 calls
      expect(preflopActions.length).toBe(10);
    });

    it('parses raise amounts as total (to)', () => {
      const heroRaise = hand.actions.find(
        (a) => a.player === 'HeroName' && a.action === 'raise' && a.street === 'preflop'
      );
      expect(heroRaise).toBeDefined();
      expect(heroRaise!.amount).toBe(300);
    });

    it('parses flop actions', () => {
      const flopActions = hand.actions.filter((a) => a.street === 'flop');
      // Player7 checks, HeroName bets 250, Player7 calls 250
      expect(flopActions.length).toBe(3);
    });

    it('parses turn actions', () => {
      const turnActions = hand.actions.filter((a) => a.street === 'turn');
      // Player7 checks, HeroName bets 600, Player7 folds
      expect(turnActions.length).toBe(3);
    });

    it('parses the winner', () => {
      expect(hand.winners.length).toBe(1);
      expect(hand.winners[0].player).toBe('HeroName');
      expect(hand.winners[0].amount).toBe(1320);
    });

    it('parses total pot', () => {
      expect(hand.pot).toBe(1320);
    });
  });

  describe('parseHand — showdown hand', () => {
    const content = loadFixture('winamax-tournament.txt');
    const hands = splitHands(content);
    const hand = parseHand(hands[1], 'HeroName')!;

    it('parses showdown hands', () => {
      expect(hand.showdownHands.length).toBe(2);
      const villain = hand.showdownHands.find((s) => s.player === 'Player6');
      expect(villain).toBeDefined();
      expect(villain!.cards).toEqual(['Ac', 'Kh']);
    });

    it('parses river card', () => {
      expect(hand.board.river).toBe('3h');
    });

    it('winner is Player6', () => {
      expect(hand.winners[0].player).toBe('Player6');
      expect(hand.winners[0].amount).toBe(2290);
    });
  });

  describe('parseHand — all-in multiway', () => {
    const content = loadFixture('winamax-allin.txt');
    const hand = parseHand(content, 'HeroName')!;

    it('parses all-in hand', () => {
      expect(hand).not.toBeNull();
    });

    it('parses 5 players', () => {
      expect(hand.players.length).toBe(5);
    });

    it('parses buy-in 20€ + 2€', () => {
      expect(hand.buyIn).toBe(20);
      expect(hand.fee).toBe(2);
    });

    it('parses all-in actions', () => {
      const allins = hand.actions.filter((a) => a.action === 'allin');
      expect(allins.length).toBe(3); // AllinPlayer2, ShortStack, AllinPlayer1
    });

    it('parses showdown with 4 players', () => {
      expect(hand.showdownHands.length).toBe(4);
    });

    it('parses multiple collected pots', () => {
      // HeroName collected from side pot 2, side pot 1, and main pot
      const heroWinnings = hand.winners.filter((w) => w.player === 'HeroName');
      expect(heroWinnings.length).toBe(3);
      const total = heroWinnings.reduce((sum, w) => sum + w.amount, 0);
      expect(total).toBe(10050);
    });

    it('parses total pot', () => {
      expect(hand.pot).toBe(10050);
    });

    it('parses hero pocket aces', () => {
      expect(hand.heroCards).toEqual(['As', 'Ac']);
    });

    it('parses full board', () => {
      expect(hand.board.flop).toEqual(['Th', '7c', '2d']);
      expect(hand.board.turn).toBe('5s');
      expect(hand.board.river).toBe('Qh');
    });
  });

  describe('parseFile', () => {
    it('parses a multi-hand file', () => {
      const content = loadFixture('winamax-tournament.txt');
      const result = parseFile(content, 'HeroName');
      expect(result.hands.length).toBe(2);
      expect(result.errors.length).toBe(0);
    });
  });

  describe('parseHand — auto-detects hero from Dealt line', () => {
    const content = loadFixture('winamax-tournament.txt');
    const hands = splitHands(content);
    const hand = parseHand(hands[0])!; // No heroName passed

    it('auto-detects hero', () => {
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
      expect(parseHand('this is not a poker hand')).toBeNull();
    });

    it('returns null for partial header', () => {
      expect(parseHand('Winamax Poker - broken data')).toBeNull();
    });
  });
});

describe('Winamax Summary Parser', () => {
  const content = loadFixture('winamax-summary.txt');
  const summary = parseSummary(content)!;

  it('returns a valid summary', () => {
    expect(summary).not.toBeNull();
  });

  it('parses tournament name', () => {
    expect(summary.tournamentName).toBe('Freeroll 500€');
  });

  it('parses tournament ID', () => {
    expect(summary.tournamentId).toBe('123456789');
  });

  it('parses buy-in', () => {
    expect(summary.buyIn).toBe(5);
    expect(summary.fee).toBe(0.5);
  });

  it('parses prize pool', () => {
    expect(summary.prizePool).toBe(2500);
  });

  it('parses total players', () => {
    expect(summary.totalPlayers).toBe(500);
  });

  it('parses start time', () => {
    expect(summary.startTime.toISOString()).toBe('2026-01-15T20:00:00.000Z');
  });

  it('parses hero finish position', () => {
    expect(summary.heroFinishPosition).toBe(23);
  });

  it('parses hero prize', () => {
    expect(summary.heroPrize).toBe(15.50);
  });

  it('defaults to MTT type', () => {
    expect(summary.tournamentType).toBe('MTT');
  });

  it('defaults to regular speed', () => {
    expect(summary.speed).toBe('regular');
  });
});
