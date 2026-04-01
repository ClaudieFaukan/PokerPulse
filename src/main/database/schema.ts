import Database from 'better-sqlite3';
import path from 'path';
import { app } from 'electron';
import { runMigrations } from './migrations';

let db: Database.Database | null = null;

export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

export function initDatabase(): void {
  const userDataPath = app.getPath('userData');
  const dbPath = path.join(userDataPath, 'data.db');

  db = new Database(dbPath);

  // Performance settings
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  createTables(db);
  runMigrations(db);
}

function createTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      room TEXT NOT NULL,
      is_hero BOOLEAN DEFAULT FALSE,
      UNIQUE(name, room)
    );

    CREATE TABLE IF NOT EXISTS tournaments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room TEXT NOT NULL,
      tournament_id TEXT NOT NULL,
      name TEXT,
      buy_in REAL NOT NULL,
      fee REAL DEFAULT 0,
      effective_cost REAL DEFAULT NULL,
      bounty REAL DEFAULT 0,
      prize_pool REAL,
      total_players INTEGER,
      start_time DATETIME,
      end_time DATETIME,
      hero_finish_position INTEGER,
      hero_prize REAL DEFAULT 0,
      hero_bounties_won REAL DEFAULT 0,
      tournament_type TEXT,
      speed TEXT,
      is_rebuy BOOLEAN DEFAULT FALSE,
      is_knockout BOOLEAN DEFAULT FALSE,
      payout_structure TEXT,
      UNIQUE(room, tournament_id)
    );

    CREATE TABLE IF NOT EXISTS hands (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tournament_id INTEGER REFERENCES tournaments(id),
      hand_number TEXT NOT NULL,
      room TEXT NOT NULL,
      datetime DATETIME NOT NULL,
      level INTEGER,
      small_blind REAL NOT NULL,
      big_blind REAL NOT NULL,
      ante REAL DEFAULT 0,
      flop_card1 TEXT,
      flop_card2 TEXT,
      flop_card3 TEXT,
      turn_card TEXT,
      river_card TEXT,
      hero_seat INTEGER,
      hero_position TEXT,
      hero_card1 TEXT,
      hero_card2 TEXT,
      hero_stack_before REAL,
      hero_stack_after REAL,
      hero_won REAL DEFAULT 0,
      hero_allin_ev REAL,
      hero_ev_diff REAL,
      total_pot REAL,
      rake REAL DEFAULT 0,
      num_players INTEGER,
      players_remaining INTEGER,
      is_hero_allin BOOLEAN DEFAULT FALSE,
      went_to_showdown BOOLEAN DEFAULT FALSE,
      hero_won_at_showdown BOOLEAN,
      raw_text TEXT,
      UNIQUE(room, hand_number)
    );

    CREATE TABLE IF NOT EXISTS actions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hand_id INTEGER REFERENCES hands(id),
      street TEXT NOT NULL,
      action_order INTEGER NOT NULL,
      player_id INTEGER REFERENCES players(id),
      action_type TEXT NOT NULL,
      amount REAL,
      is_hero BOOLEAN DEFAULT FALSE
    );

    CREATE TABLE IF NOT EXISTS player_stats_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id INTEGER REFERENCES players(id),
      tournament_id INTEGER,
      hands_played INTEGER DEFAULT 0,
      vpip_hands INTEGER DEFAULT 0,
      pfr_hands INTEGER DEFAULT 0,
      three_bet_opportunities INTEGER DEFAULT 0,
      three_bet_made INTEGER DEFAULT 0,
      cbet_flop_opportunities INTEGER DEFAULT 0,
      cbet_flop_made INTEGER DEFAULT 0,
      cbet_turn_opportunities INTEGER DEFAULT 0,
      cbet_turn_made INTEGER DEFAULT 0,
      wtsd_opportunities INTEGER DEFAULT 0,
      wtsd_made INTEGER DEFAULT 0,
      wsd_opportunities INTEGER DEFAULT 0,
      wsd_won INTEGER DEFAULT 0,
      fold_to_cbet_flop_opportunities INTEGER DEFAULT 0,
      fold_to_cbet_flop_made INTEGER DEFAULT 0,
      steal_opportunities INTEGER DEFAULT 0,
      steal_made INTEGER DEFAULT 0,
      fold_bb_to_steal_opportunities INTEGER DEFAULT 0,
      fold_bb_to_steal_made INTEGER DEFAULT 0,
      limp_preflop INTEGER DEFAULT 0,
      af_bets INTEGER DEFAULT 0,
      af_calls INTEGER DEFAULT 0,
      total_won REAL DEFAULT 0,
      total_ev_won REAL DEFAULT 0,
      updated_at DATETIME
    );

    CREATE INDEX IF NOT EXISTS idx_hands_tournament ON hands(tournament_id);
    CREATE INDEX IF NOT EXISTS idx_hands_datetime ON hands(datetime);
    CREATE INDEX IF NOT EXISTS idx_actions_hand ON actions(hand_id);
    CREATE INDEX IF NOT EXISTS idx_actions_player ON actions(player_id);
    CREATE INDEX IF NOT EXISTS idx_player_stats_player ON player_stats_cache(player_id);
    CREATE INDEX IF NOT EXISTS idx_tournaments_room ON tournaments(room);
    CREATE INDEX IF NOT EXISTS idx_tournaments_buyin ON tournaments(buy_in);
  `);
}
