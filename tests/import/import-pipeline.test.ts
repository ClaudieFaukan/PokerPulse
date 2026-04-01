import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import Database from 'better-sqlite3';
import { createTestDb } from '../helpers/test-db';
import { parseFileContent, parseSummaryContent, isSummaryFile, detectRoom } from '../../src/parsers/index';

const fixturesDir = join(__dirname, '../fixtures');
function loadFixture(name: string): string {
  return readFileSync(join(fixturesDir, name), 'utf-8');
}

describe('Import Pipeline — parseFileContent', () => {
  it('auto-detects and parses Winamax file', () => {
    const content = loadFixture('winamax-tournament.txt');
    const result = parseFileContent(content, { winamax: 'HeroName' });
    expect(result.room).toBe('winamax');
    expect(result.hands.length).toBe(2);
    expect(result.errors.length).toBe(0);
  });

  it('auto-detects and parses PokerStars file', () => {
    const content = loadFixture('pokerstars-tournament.txt');
    const result = parseFileContent(content, { pokerstars: 'HeroName' });
    expect(result.room).toBe('pokerstars');
    expect(result.hands.length).toBe(2);
    expect(result.errors.length).toBe(0);
  });

  it('auto-detects and parses PMU text file', () => {
    const content = loadFixture('pmu-tournament.txt');
    const result = parseFileContent(content, { pmu: 'HeroName' });
    expect(result.room).toBe('pmu');
    expect(result.hands.length).toBe(2);
    expect(result.errors.length).toBe(0);
  });

  it('auto-detects and parses PMU XML file', () => {
    const content = loadFixture('pmu-tournament.xml');
    const result = parseFileContent(content, { pmu: 'HeroName' });
    expect(result.room).toBe('pmu');
    expect(result.hands.length).toBe(2);
    expect(result.errors.length).toBe(0);
  });

  it('returns error for unknown format', () => {
    const result = parseFileContent('random text that is not poker');
    expect(result.room).toBeNull();
    expect(result.hands.length).toBe(0);
    expect(result.errors.length).toBe(1);
  });
});

describe('Import Pipeline — Summary Detection', () => {
  it('detects Winamax summary file by name', () => {
    expect(isSummaryFile('20240115_summary_MTT123456.txt', '')).toBe(true);
  });

  it('detects PokerStars summary file by name', () => {
    expect(isSummaryFile('TS20240115 T3456789012.txt', '')).toBe(true);
  });

  it('detects Winamax summary by content', () => {
    expect(isSummaryFile('file.txt', 'Tournament summary : ...')).toBe(true);
  });

  it('does not flag regular hand history as summary', () => {
    expect(isSummaryFile('20240115_MTT123456.txt', 'Winamax Poker -')).toBe(false);
  });
});

describe('Import Pipeline — Summary Parsing', () => {
  it('parses Winamax summary', () => {
    const content = loadFixture('winamax-summary.txt');
    const summary = parseSummaryContent(content);
    expect(summary).not.toBeNull();
    expect(summary!.room).toBe('winamax');
    expect(summary!.tournamentId).toBe('123456789');
    expect(summary!.tournamentName).toBe('Freeroll 500€');
    expect(summary!.prizePool).toBe(2500);
    expect(summary!.heroPrize).toBe(15.5);
    expect(summary!.heroFinishPosition).toBe(23);
  });

  it('parses PokerStars summary', () => {
    const content = loadFixture('pokerstars-summary.txt');
    const summary = parseSummaryContent(content);
    expect(summary).not.toBeNull();
    expect(summary!.room).toBe('pokerstars');
    expect(summary!.prizePool).toBe(2500);
  });
});

describe('Import Pipeline — DB Insertion', () => {
  it('inserts parsed hands into the database', () => {
    const db = createTestDb();
    const content = loadFixture('winamax-tournament.txt');
    const result = parseFileContent(content, { winamax: 'HeroName' });

    // Insert tournament
    const tourResult = db.prepare(`
      INSERT INTO tournaments (room, tournament_id, name, buy_in, fee)
      VALUES (?, ?, ?, ?, ?)
    `).run('winamax', result.hands[0].tournamentId, result.hands[0].tournamentName, 5, 0.5);

    const tourId = tourResult.lastInsertRowid;

    // Insert hands
    for (const hand of result.hands) {
      const hero = hand.players.find((p) => p.isHero);
      const heroWon = hand.winners
        .filter((w) => w.player === hero?.name)
        .reduce((sum, w) => sum + w.amount, 0);

      db.prepare(`
        INSERT OR IGNORE INTO hands (
          tournament_id, hand_number, room, datetime,
          level, small_blind, big_blind, ante,
          hero_card1, hero_card2, hero_won, total_pot, num_players, raw_text
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        tourId, hand.handId, hand.room, hand.datetime.toISOString(),
        hand.level, hand.smallBlind, hand.bigBlind, hand.ante,
        hand.heroCards[0], hand.heroCards[1], heroWon, hand.pot, hand.players.length, hand.rawText
      );
    }

    // Verify
    const hands = db.prepare('SELECT * FROM hands').all();
    expect(hands.length).toBe(2);

    const tournaments = db.prepare('SELECT * FROM tournaments').all();
    expect(tournaments.length).toBe(1);

    db.close();
  });

  it('handles duplicate hands (UNIQUE constraint)', () => {
    const db = createTestDb();

    db.prepare(`
      INSERT INTO tournaments (room, tournament_id, name, buy_in) VALUES (?, ?, ?, ?)
    `).run('winamax', '123', 'Test', 5);

    // Insert first hand
    db.prepare(`
      INSERT INTO hands (tournament_id, hand_number, room, datetime, small_blind, big_blind, total_pot, raw_text)
      VALUES (1, 'hand-1', 'winamax', '2024-01-15', 25, 50, 100, 'raw')
    `).run();

    // Insert duplicate — should be ignored (OR IGNORE)
    const result = db.prepare(`
      INSERT OR IGNORE INTO hands (tournament_id, hand_number, room, datetime, small_blind, big_blind, total_pot, raw_text)
      VALUES (1, 'hand-1', 'winamax', '2024-01-15', 25, 50, 100, 'raw')
    `).run();

    expect(result.changes).toBe(0);

    const hands = db.prepare('SELECT * FROM hands').all();
    expect(hands.length).toBe(1);

    db.close();
  });

  it('inserts actions with player references', () => {
    const db = createTestDb();

    // Setup tournament and hand
    db.prepare(`INSERT INTO tournaments (room, tournament_id, name, buy_in) VALUES (?, ?, ?, ?)`).run('winamax', '123', 'Test', 5);
    db.prepare(`
      INSERT INTO hands (tournament_id, hand_number, room, datetime, small_blind, big_blind, total_pot, raw_text)
      VALUES (1, 'hand-1', 'winamax', '2024-01-15', 25, 50, 100, 'raw')
    `).run();

    // Create player
    db.prepare(`INSERT INTO players (name, room, is_hero) VALUES (?, ?, ?)`).run('HeroName', 'winamax', 1);

    // Insert actions
    db.prepare(`
      INSERT INTO actions (hand_id, street, action_order, player_id, action_type, amount, is_hero)
      VALUES (1, 'preflop', 0, 1, 'raise', 300, 1)
    `).run();

    db.prepare(`
      INSERT INTO actions (hand_id, street, action_order, player_id, action_type, amount, is_hero)
      VALUES (1, 'flop', 1, 1, 'bet', 250, 1)
    `).run();

    const actions = db.prepare('SELECT * FROM actions WHERE hand_id = 1 ORDER BY action_order').all() as any[];
    expect(actions.length).toBe(2);
    expect(actions[0].action_type).toBe('raise');
    expect(actions[0].amount).toBe(300);
    expect(actions[1].street).toBe('flop');

    db.close();
  });

  it('inserts tournament summary and updates existing', () => {
    const db = createTestDb();

    // Insert initial tournament from hand parsing
    db.prepare(`
      INSERT INTO tournaments (room, tournament_id, name, buy_in, fee)
      VALUES (?, ?, ?, ?, ?)
    `).run('winamax', '123456789', 'Freeroll 500€', 5, 0.5);

    // Simulate summary update
    db.prepare(`
      UPDATE tournaments SET
        prize_pool = ?,
        total_players = ?,
        hero_finish_position = ?,
        hero_prize = ?,
        payout_structure = ?
      WHERE room = ? AND tournament_id = ?
    `).run(2500, 500, 23, 15.5, '[{"position":1,"prize":500}]', 'winamax', '123456789');

    const tour = db.prepare('SELECT * FROM tournaments WHERE tournament_id = ?').get('123456789') as any;
    expect(tour.prize_pool).toBe(2500);
    expect(tour.total_players).toBe(500);
    expect(tour.hero_finish_position).toBe(23);
    expect(tour.hero_prize).toBe(15.5);

    db.close();
  });
});

describe('Import Pipeline — Multi-room parsing', () => {
  it('parses hands from all 3 rooms and assigns correct room', () => {
    const winamax = parseFileContent(loadFixture('winamax-tournament.txt'), { winamax: 'HeroName' });
    const pokerstars = parseFileContent(loadFixture('pokerstars-tournament.txt'), { pokerstars: 'HeroName' });
    const pmu = parseFileContent(loadFixture('pmu-tournament.txt'), { pmu: 'HeroName' });

    expect(winamax.hands.every((h) => h.room === 'winamax')).toBe(true);
    expect(pokerstars.hands.every((h) => h.room === 'pokerstars')).toBe(true);
    expect(pmu.hands.every((h) => h.room === 'pmu')).toBe(true);

    // All have hero detected
    expect(winamax.hands.every((h) => h.players.some((p) => p.isHero))).toBe(true);
    expect(pokerstars.hands.every((h) => h.players.some((p) => p.isHero))).toBe(true);
    expect(pmu.hands.every((h) => h.players.some((p) => p.isHero))).toBe(true);
  });
});

describe('Import Pipeline — file extension filtering', () => {
  function isHandHistoryFile(filePath: string): boolean {
    const ext = filePath.split('.').pop()?.toLowerCase();
    return ext === 'txt' || ext === 'xml';
  }

  it('accepts .txt files', () => {
    expect(isHandHistoryFile('test.txt')).toBe(true);
  });

  it('accepts .xml files', () => {
    expect(isHandHistoryFile('test.xml')).toBe(true);
  });

  it('rejects .pdf files', () => {
    expect(isHandHistoryFile('test.pdf')).toBe(false);
  });

  it('rejects files without extension', () => {
    expect(isHandHistoryFile('noextension')).toBe(false);
  });
});
