import { getDatabase } from './schema';

export function insertTournament(data: {
  room: string;
  tournament_id: string;
  name?: string;
  buy_in: number;
  fee?: number;
  bounty?: number;
  tournament_type?: string;
  speed?: string;
  is_rebuy?: boolean;
  is_knockout?: boolean;
}) {
  const db = getDatabase();
  return db.prepare(`
    INSERT OR IGNORE INTO tournaments (room, tournament_id, name, buy_in, fee, bounty, tournament_type, speed, is_rebuy, is_knockout)
    VALUES (@room, @tournament_id, @name, @buy_in, @fee, @bounty, @tournament_type, @speed, @is_rebuy, @is_knockout)
  `).run(data);
}

export function getTournamentByRoomId(room: string, tournamentId: string) {
  const db = getDatabase();
  return db.prepare('SELECT * FROM tournaments WHERE room = ? AND tournament_id = ?').get(room, tournamentId);
}

export function insertHand(data: Record<string, unknown>) {
  const db = getDatabase();
  const columns = Object.keys(data);
  const placeholders = columns.map((c) => `@${c}`);
  return db.prepare(`
    INSERT OR IGNORE INTO hands (${columns.join(', ')})
    VALUES (${placeholders.join(', ')})
  `).run(data);
}

export function getOrCreatePlayer(name: string, room: string, isHero = false) {
  const db = getDatabase();
  const existing = db.prepare('SELECT * FROM players WHERE name = ? AND room = ?').get(name, room);
  if (existing) return existing as { id: number; name: string; room: string; is_hero: boolean };

  const result = db.prepare('INSERT INTO players (name, room, is_hero) VALUES (?, ?, ?)').run(name, room, isHero ? 1 : 0);
  return { id: result.lastInsertRowid as number, name, room, is_hero: isHero };
}

export function insertAction(data: {
  hand_id: number;
  street: string;
  action_order: number;
  player_id: number;
  action_type: string;
  amount?: number;
  is_hero?: boolean;
}) {
  const db = getDatabase();
  return db.prepare(`
    INSERT INTO actions (hand_id, street, action_order, player_id, action_type, amount, is_hero)
    VALUES (@hand_id, @street, @action_order, @player_id, @action_type, @amount, @is_hero)
  `).run(data);
}
