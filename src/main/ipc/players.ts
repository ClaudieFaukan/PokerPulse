import { ipcMain } from 'electron';
import { getDatabase } from '../database/schema';
import { calculateStats, PlayerStats } from '../../engine/stats';
import { ParsedHand, ParsedAction, ParsedPlayer } from '../../parsers/types';

export function registerPlayersHandlers(): void {
  /**
   * Search players by name with quick SQL-based stats (VPIP/PFR).
   */
  ipcMain.handle('players:search', async (_event, query: string) => {
    const db = getDatabase();
    const search = `%${query}%`;

    return db.prepare(`
      SELECT
        p.id, p.name, p.room, p.is_hero,
        COUNT(DISTINCT a.hand_id) as hands_played,
        ROUND(100.0 * SUM(CASE WHEN a.street = 'preflop' AND a.action_type IN ('call','raise','allin','bet') THEN 1 ELSE 0 END) / MAX(COUNT(DISTINCT a.hand_id), 1), 1) as vpip,
        ROUND(100.0 * SUM(CASE WHEN a.street = 'preflop' AND a.action_type IN ('raise','allin') THEN 1 ELSE 0 END) / MAX(COUNT(DISTINCT a.hand_id), 1), 1) as pfr
      FROM players p
      JOIN actions a ON a.player_id = p.id
      WHERE p.name LIKE ? AND p.is_hero = 0
      GROUP BY p.id
      HAVING hands_played > 0
      ORDER BY hands_played DESC
      LIMIT 100
    `).all(search);
  });

  /**
   * Get full stats for a specific player using the stats engine.
   */
  ipcMain.handle('players:stats', async (_event, playerId: number) => {
    const db = getDatabase();

    const player = db.prepare('SELECT * FROM players WHERE id = ?').get(playerId) as any;
    if (!player) return null;

    // Get all hand IDs where this player has actions
    const handIds = db.prepare(`
      SELECT DISTINCT a.hand_id
      FROM actions a
      WHERE a.player_id = ?
    `).all(playerId) as { hand_id: number }[];

    if (handIds.length === 0) return { player, stats: null, handsPlayed: 0 };

    // Rebuild ParsedHand objects (same pattern as coach.ts)
    const parsedHands: ParsedHand[] = [];

    for (const { hand_id } of handIds) {
      const h = db.prepare('SELECT * FROM hands WHERE id = ?').get(hand_id) as any;
      if (!h) continue;

      const actions = db.prepare(`
        SELECT a.*, p.name as player_name
        FROM actions a
        JOIN players p ON a.player_id = p.id
        WHERE a.hand_id = ?
        ORDER BY a.action_order
      `).all(hand_id) as any[];

      const players = parsePlayersFromRaw(h.raw_text || '', h.room);
      const buttonSeat = parseButtonSeat(h.raw_text || '', h.room);

      const parsedActions: ParsedAction[] = actions.map((a: any) => ({
        street: a.street,
        player: a.player_name,
        action: a.action_type,
        amount: a.amount || undefined,
      }));

      parsedHands.push({
        handId: h.hand_number,
        room: h.room,
        tournamentId: String(h.tournament_id),
        tournamentName: '',
        buyIn: 0,
        fee: 0,
        datetime: new Date(h.datetime),
        level: h.level || 1,
        smallBlind: h.small_blind,
        bigBlind: h.big_blind,
        ante: h.ante || 0,
        buttonSeat,
        tableSize: h.num_players || players.length,
        players,
        heroCards: [h.hero_card1 || '', h.hero_card2 || ''],
        board: {
          flop: h.flop_card1 ? [h.flop_card1, h.flop_card2, h.flop_card3] : undefined,
          turn: h.turn_card || undefined,
          river: h.river_card || undefined,
        },
        actions: parsedActions,
        pot: h.total_pot || 0,
        winners: [],
        showdownHands: [],
        rawText: h.raw_text || '',
      });
    }

    const stats = calculateStats(parsedHands, player.name);

    return {
      player,
      stats,
      handsPlayed: stats.handsPlayed,
    };
  });

  /**
   * Get quick stats for multiple players at once (for replayer HUD).
   */
  ipcMain.handle('players:quick-stats', async (_event, playerNames: { name: string; room: string }[]) => {
    const db = getDatabase();
    const results: Record<string, { vpip: number; pfr: number; threeBet: number; hands: number }> = {};

    for (const { name, room } of playerNames) {
      const row = db.prepare(`
        SELECT
          COUNT(DISTINCT a.hand_id) as hands,
          ROUND(100.0 * SUM(CASE WHEN a.street = 'preflop' AND a.action_type IN ('call','raise','allin','bet') THEN 1 ELSE 0 END) / MAX(COUNT(DISTINCT a.hand_id), 1), 1) as vpip,
          ROUND(100.0 * SUM(CASE WHEN a.street = 'preflop' AND a.action_type IN ('raise','allin') THEN 1 ELSE 0 END) / MAX(COUNT(DISTINCT a.hand_id), 1), 1) as pfr
        FROM players p
        JOIN actions a ON a.player_id = p.id
        WHERE p.name = ? AND p.room = ?
      `).get(name, room) as any;

      if (row && row.hands > 0) {
        // 3bet approximation: raises that are re-raises (3rd+ raise preflop)
        // For quick stats, estimate from PFR * factor — full calc needs ParsedHand reconstruction
        results[name] = {
          vpip: row.vpip || 0,
          pfr: row.pfr || 0,
          threeBet: 0, // Will be filled by full stats if available
          hands: row.hands,
        };
      }
    }

    return results;
  });
}

function parsePlayersFromRaw(rawText: string, room: string): ParsedPlayer[] {
  const players: ParsedPlayer[] = [];
  if (!rawText) return players;

  // PMU XML format
  if (room === 'pmu' && rawText.includes('<player ')) {
    const heroName = rawText.match(/<nickname>(.+?)<\/nickname>/)?.[1] || '';
    const playerRegex = /<player\s+([^>]+)\/>/g;
    let m;
    const seen = new Set<string>();
    while ((m = playerRegex.exec(rawText)) !== null) {
      const attrs = m[1];
      const seat = parseInt(attrs.match(/seat="(\d+)"/)?.[1] || '0', 10);
      const name = attrs.match(/name="([^"]+)"/)?.[1] || '';
      const chips = parseFloat((attrs.match(/chips="([^"]+)"/)?.[1] || '0').replace(/\s/g, ''));
      if (seat > 0 && name && !seen.has(name)) {
        seen.add(name);
        players.push({ seat, name, stack: chips, isHero: name === heroName });
      }
    }
    return players;
  }

  // Text format (Winamax/PokerStars)
  const seatRegex = /^Seat\s+(\d+):\s+(.+?)\s+\((\d+)(?:\s+in chips)?\)/gm;
  let m;
  while ((m = seatRegex.exec(rawText)) !== null) {
    players.push({ seat: parseInt(m[1], 10), name: m[2], stack: parseFloat(m[3]), isHero: false });
  }
  const dealtMatch = rawText.match(/Dealt to\s+(.+?)\s+\[/);
  if (dealtMatch) {
    for (const p of players) p.isHero = p.name === dealtMatch[1];
  }

  return players;
}

function parseButtonSeat(rawText: string, room: string): number {
  if (!rawText) return 1;
  if (room === 'pmu') {
    const m = rawText.match(/<player\s[^>]*dealer="1"[^>]*seat="(\d+)"/) ||
              rawText.match(/<player\s[^>]*seat="(\d+)"[^>]*dealer="1"/);
    if (m) return parseInt(m[1], 10);
  }
  const m1 = rawText.match(/Seat\s+#(\d+)\s+is the button/);
  if (m1) return parseInt(m1[1], 10);
  const m2 = rawText.match(/Button:\s+Seat\s+(\d+)/);
  if (m2) return parseInt(m2[1], 10);
  return 1;
}
