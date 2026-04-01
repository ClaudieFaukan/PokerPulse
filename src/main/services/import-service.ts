import fs from 'fs';
import path from 'path';
import { getDatabase } from '../database/schema';
import { getOrCreatePlayer, insertAction } from '../database/queries';
import { parseFileContent, parseSummaryContent, isSummaryFile, hasEmbeddedSummary, ParsedHand, Room } from '../../parsers/index';
import { calculateChipEV } from '../../engine/ev-calculator';

export interface ImportProgress {
  current: number;
  total: number;
  handsImported: number;
  tournamentsImported: number;
  errors: string[];
}

export interface ImportResult {
  filesProcessed: number;
  handsImported: number;
  tournamentsImported: number;
  summariesImported: number;
  errors: string[];
}

/**
 * Collect all .txt and .xml files from paths (files or directories).
 */
export function collectFiles(inputPaths: string[]): string[] {
  const files: string[] = [];

  for (const p of inputPaths) {
    try {
      const stat = fs.statSync(p);
      if (stat.isDirectory()) {
        const entries = fs.readdirSync(p, { recursive: true }) as string[];
        for (const entry of entries) {
          const fullPath = path.join(p, entry);
          if (isHandHistoryFile(fullPath) && fs.statSync(fullPath).isFile()) {
            files.push(fullPath);
          }
        }
      } else if (isHandHistoryFile(p)) {
        files.push(p);
      }
    } catch {
      // Skip inaccessible paths
    }
  }

  return files;
}

function isHandHistoryFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return ext === '.txt' || ext === '.xml';
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

/**
 * Import files into the database (async to avoid blocking the main process).
 */
export async function importFiles(
  filePaths: string[],
  heroNames?: Partial<Record<Room, string>>,
  onProgress?: (progress: ImportProgress) => void
): Promise<ImportResult> {
  const db = getDatabase();
  const allFiles = collectFiles(filePaths);
  const errors: string[] = [];
  let handsImported = 0;
  let tournamentsImported = 0;
  let summariesImported = 0;

  // Separate hand history files from summary files
  const handFiles: string[] = [];
  const summaryFiles: string[] = [];
  for (const f of allFiles) {
    const filename = path.basename(f);
    // Quick check by filename — avoid reading content twice
    if (/summary/i.test(filename) || /^TS\d/.test(filename)) {
      summaryFiles.push(f);
    } else {
      handFiles.push(f);
    }
  }

  const totalFiles = handFiles.length + summaryFiles.length;

  // Pass 1: Import hand histories (creates tournaments)
  for (let i = 0; i < handFiles.length; i++) {
    const filePath = handFiles[i];
    try {
      const content = fs.readFileSync(filePath, 'utf-8').replace(/^\uFEFF/, '');
      const filename = path.basename(filePath);

      const result = parseFileContent(content, heroNames);

      if (result.errors.length > 0) {
        errors.push(...result.errors.map((e) => `${filename}: ${e}`));
      }

      for (const hand of result.hands) {
        try {
          const handDbId = insertParsedHand(db, hand);
          if (handDbId) {
            handsImported++;
            // Calculate chip EV for all-in hands with showdown
            computeAndStoreEV(db, hand, handDbId);
          }
        } catch (err: any) {
          if (!err.message?.includes('UNIQUE')) {
            errors.push(`${filename}: ${err.message}`);
          }
        }
      }

      // PMU XML files contain embedded summary data (place, win, buyin)
      if (hasEmbeddedSummary(content)) {
        try {
          const summary = parseSummaryContent(content);
          if (summary) {
            const inserted = insertTournamentSummary(db, summary);
            if (inserted) summariesImported++;
          }
        } catch {
          // Non-critical — summary extraction failed but hands are imported
        }
      }
    } catch (err: any) {
      errors.push(`${path.basename(filePath)}: ${err.message}`);
    }

    onProgress?.({
      current: i + 1,
      total: totalFiles,
      handsImported,
      tournamentsImported,
      errors,
    });

    if (i % 5 === 0) await yieldToEventLoop();
  }

  // Pass 2: Import summaries (updates existing tournaments with prize/position/players)
  for (let i = 0; i < summaryFiles.length; i++) {
    const filePath = summaryFiles[i];
    try {
      const content = fs.readFileSync(filePath, 'utf-8').replace(/^\uFEFF/, '');
      const summary = parseSummaryContent(content);
      if (summary) {
        const inserted = insertTournamentSummary(db, summary);
        if (inserted) summariesImported++;
      }
    } catch (err: any) {
      errors.push(`${path.basename(filePath)}: ${err.message}`);
    }

    onProgress?.({
      current: handFiles.length + i + 1,
      total: totalFiles,
      handsImported,
      tournamentsImported,
      errors,
    });
  }

  // Backfill tournament start_time from earliest hand if not set
  db.exec(`
    UPDATE tournaments SET start_time = (
      SELECT MIN(datetime) FROM hands WHERE hands.tournament_id = tournaments.id
    ) WHERE start_time IS NULL
  `);

  return {
    filesProcessed: allFiles.length,
    handsImported,
    tournamentsImported,
    summariesImported,
    errors,
  };
}

/**
 * Insert a parsed hand and all its actions into the database.
 * Returns the DB id if inserted, or null if duplicate.
 */
function insertParsedHand(db: ReturnType<typeof getDatabase>, hand: ParsedHand): number | null {
  // Ensure tournament exists
  const tournamentDbId = getOrCreateTournament(db, hand);

  // Find hero
  const hero = hand.players.find((p) => p.isHero);
  const heroSeat = hero?.seat;

  // Determine hero position
  const heroPosition = heroSeat ? determineHeroPosition(hand) : null;

  // Calculate hero won amount
  const heroWon = hand.winners
    .filter((w) => w.player === hero?.name)
    .reduce((sum, w) => sum + w.amount, 0);

  // Check if went to showdown
  const wentToShowdown = hand.showdownHands.length > 0;
  const heroWonAtShowdown = wentToShowdown
    ? hand.winners.some((w) => w.player === hero?.name)
    : null;

  // Check if hero was all-in
  const isHeroAllin = hand.actions.some(
    (a) => a.player === hero?.name && a.action === 'allin'
  );

  // Insert hand
  const handResult = db.prepare(`
    INSERT OR IGNORE INTO hands (
      tournament_id, hand_number, room, datetime,
      level, small_blind, big_blind, ante,
      flop_card1, flop_card2, flop_card3, turn_card, river_card,
      hero_seat, hero_position, hero_card1, hero_card2,
      hero_stack_before, hero_won,
      total_pot, num_players,
      is_hero_allin, went_to_showdown, hero_won_at_showdown,
      raw_text
    ) VALUES (
      @tournament_id, @hand_number, @room, @datetime,
      @level, @small_blind, @big_blind, @ante,
      @flop_card1, @flop_card2, @flop_card3, @turn_card, @river_card,
      @hero_seat, @hero_position, @hero_card1, @hero_card2,
      @hero_stack_before, @hero_won,
      @total_pot, @num_players,
      @is_hero_allin, @went_to_showdown, @hero_won_at_showdown,
      @raw_text
    )
  `).run({
    tournament_id: tournamentDbId,
    hand_number: hand.handId,
    room: hand.room,
    datetime: hand.datetime.toISOString(),
    level: hand.level,
    small_blind: hand.smallBlind,
    big_blind: hand.bigBlind,
    ante: hand.ante,
    flop_card1: hand.board.flop?.[0] || null,
    flop_card2: hand.board.flop?.[1] || null,
    flop_card3: hand.board.flop?.[2] || null,
    turn_card: hand.board.turn || null,
    river_card: hand.board.river || null,
    hero_seat: heroSeat || null,
    hero_position: heroPosition,
    hero_card1: hand.heroCards[0] || null,
    hero_card2: hand.heroCards[1] || null,
    hero_stack_before: hero?.stack || null,
    hero_won: heroWon,
    total_pot: hand.pot,
    num_players: hand.players.length,
    is_hero_allin: isHeroAllin ? 1 : 0,
    went_to_showdown: wentToShowdown ? 1 : 0,
    hero_won_at_showdown: heroWonAtShowdown === null ? null : heroWonAtShowdown ? 1 : 0,
    raw_text: hand.rawText,
  });

  if (handResult.changes === 0) return null; // Duplicate

  const handDbId = handResult.lastInsertRowid as number;

  // Insert actions
  const insertActionStmt = db.prepare(`
    INSERT INTO actions (hand_id, street, action_order, player_id, action_type, amount, is_hero)
    VALUES (@hand_id, @street, @action_order, @player_id, @action_type, @amount, @is_hero)
  `);

  const insertAllActions = db.transaction(() => {
    for (let i = 0; i < hand.actions.length; i++) {
      const action = hand.actions[i];
      const player = getOrCreatePlayer(action.player, hand.room, action.player === hero?.name);

      insertActionStmt.run({
        hand_id: handDbId,
        street: action.street,
        action_order: i,
        player_id: player.id,
        action_type: action.action,
        amount: action.amount || null,
        is_hero: action.player === hero?.name ? 1 : 0,
      });
    }
  });

  insertAllActions();
  return handDbId;
}

/**
 * Get or create a tournament record and return its DB id.
 */
function getOrCreateTournament(db: ReturnType<typeof getDatabase>, hand: ParsedHand): number {
  const existing = db.prepare(
    'SELECT id FROM tournaments WHERE room = ? AND tournament_id = ?'
  ).get(hand.room, hand.tournamentId) as { id: number } | undefined;

  if (existing) return existing.id;

  const result = db.prepare(`
    INSERT INTO tournaments (room, tournament_id, name, buy_in, fee)
    VALUES (@room, @tournament_id, @name, @buy_in, @fee)
  `).run({
    room: hand.room,
    tournament_id: hand.tournamentId,
    name: hand.tournamentName,
    buy_in: hand.buyIn,
    fee: hand.fee,
  });

  return result.lastInsertRowid as number;
}

/**
 * Insert or update tournament from summary data.
 */
function insertTournamentSummary(
  db: ReturnType<typeof getDatabase>,
  summary: import('../../parsers/types').ParsedTournamentSummary
): boolean {
  const existing = db.prepare(
    'SELECT id FROM tournaments WHERE room = ? AND tournament_id = ?'
  ).get(summary.room, summary.tournamentId) as { id: number } | undefined;

  if (existing) {
    // Update with summary data
    db.prepare(`
      UPDATE tournaments SET
        name = @name,
        buy_in = @buy_in,
        fee = @fee,
        bounty = @bounty,
        prize_pool = @prize_pool,
        total_players = @total_players,
        start_time = @start_time,
        end_time = @end_time,
        hero_finish_position = @hero_finish_position,
        hero_prize = @hero_prize,
        hero_bounties_won = @hero_bounties_won,
        tournament_type = @tournament_type,
        speed = @speed,
        is_rebuy = @is_rebuy,
        is_knockout = @is_knockout,
        payout_structure = @payout_structure
      WHERE id = @id
    `).run({
      id: existing.id,
      name: summary.tournamentName,
      buy_in: summary.buyIn,
      fee: summary.fee,
      bounty: summary.bounty || 0,
      prize_pool: summary.prizePool,
      total_players: summary.totalPlayers,
      start_time: summary.startTime.toISOString(),
      end_time: summary.endTime.toISOString(),
      hero_finish_position: summary.heroFinishPosition,
      hero_prize: summary.heroPrize,
      hero_bounties_won: summary.heroBountiesWon || 0,
      tournament_type: summary.tournamentType,
      speed: summary.speed,
      is_rebuy: summary.isRebuy ? 1 : 0,
      is_knockout: summary.isKnockout ? 1 : 0,
      payout_structure: JSON.stringify(summary.payoutStructure),
    });
    return true;
  }

  // Insert new
  db.prepare(`
    INSERT INTO tournaments (
      room, tournament_id, name, buy_in, fee, bounty,
      prize_pool, total_players, start_time, end_time,
      hero_finish_position, hero_prize, hero_bounties_won,
      tournament_type, speed, is_rebuy, is_knockout, payout_structure
    ) VALUES (
      @room, @tournament_id, @name, @buy_in, @fee, @bounty,
      @prize_pool, @total_players, @start_time, @end_time,
      @hero_finish_position, @hero_prize, @hero_bounties_won,
      @tournament_type, @speed, @is_rebuy, @is_knockout, @payout_structure
    )
  `).run({
    room: summary.room,
    tournament_id: summary.tournamentId,
    name: summary.tournamentName,
    buy_in: summary.buyIn,
    fee: summary.fee,
    bounty: summary.bounty || 0,
    prize_pool: summary.prizePool,
    total_players: summary.totalPlayers,
    start_time: summary.startTime.toISOString(),
    end_time: summary.endTime.toISOString(),
    hero_finish_position: summary.heroFinishPosition,
    hero_prize: summary.heroPrize,
    hero_bounties_won: summary.heroBountiesWon || 0,
    tournament_type: summary.tournamentType,
    speed: summary.speed,
    is_rebuy: summary.isRebuy ? 1 : 0,
    is_knockout: summary.isKnockout ? 1 : 0,
    payout_structure: JSON.stringify(summary.payoutStructure),
  });

  return true;
}

/**
 * Compute and store chip EV for all-in hands with showdown cards.
 */
function computeAndStoreEV(db: ReturnType<typeof getDatabase>, hand: ParsedHand, handDbId: number): void {
  try {
    const hero = hand.players.find((p) => p.isHero);
    if (!hero) return;

    // Only compute EV for hands where hero went all-in
    const heroAllin = hand.actions.some(
      (a) => a.player === hero.name && a.action === 'allin'
    );
    if (!heroAllin) return;

    // Need hero cards
    if (!hand.heroCards[0] || !hand.heroCards[1]) return;

    // Need at least one villain's showdown cards
    const villainHands = hand.showdownHands
      .filter((s) => s.player !== hero.name)
      .map((s) => s.cards);
    if (villainHands.length === 0) return;

    // Collect board cards at time of all-in (use whatever board was dealt)
    const board: string[] = [];
    if (hand.board.flop) board.push(...hand.board.flop);
    if (hand.board.turn) board.push(hand.board.turn);
    if (hand.board.river) board.push(hand.board.river);

    // Hero's actual winnings
    const heroWon = hand.winners
      .filter((w) => w.player === hero.name)
      .reduce((sum, w) => sum + w.amount, 0);

    const result = calculateChipEV(
      hand.heroCards as [string, string],
      villainHands,
      board,
      hand.pot,
      heroWon
    );

    db.prepare(
      'UPDATE hands SET hero_allin_ev = ?, hero_ev_diff = ? WHERE id = ?'
    ).run(result.chipEV, result.evDiff, handDbId);
  } catch {
    // Non-critical — EV calculation failure shouldn't block import
  }
}

/**
 * Simple position determination from hero seat and button seat.
 */
function determineHeroPosition(hand: ParsedHand): string {
  const seats = hand.players.map((p) => p.seat).sort((a, b) => a - b);
  const hero = hand.players.find((p) => p.isHero);
  if (!hero) return 'UNK';

  const n = seats.length;
  const btnIdx = seats.indexOf(hand.buttonSeat);
  const heroIdx = seats.indexOf(hero.seat);
  if (btnIdx === -1 || heroIdx === -1) return 'UNK';

  const dist = (heroIdx - btnIdx + n) % n;

  if (dist === 0) return 'BTN';
  if (dist === 1) return 'SB';
  if (dist === 2) return 'BB';

  const remaining = n - 3;
  if (remaining <= 0) return 'UNK';

  const fromBB = dist - 2;
  if (fromBB === remaining) return 'CO';
  if (fromBB === 1) return 'UTG';
  if (fromBB === 2 && remaining > 2) return 'UTG1';
  if (fromBB <= Math.ceil(remaining / 2)) return 'MP';
  return 'MP1';
}
