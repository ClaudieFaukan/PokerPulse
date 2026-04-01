import { ipcMain } from 'electron';
import { getDatabase } from '../database/schema';

interface HandFilters {
  tournamentId?: number;
  room?: string;
  dateFrom?: string;
  dateTo?: string;
  heroOnly?: boolean;
  limit?: number;
  offset?: number;
}

interface TournamentFilters {
  room?: string;
  dateFrom?: string;
  dateTo?: string;
  buyInMin?: number;
  buyInMax?: number;
  tournamentType?: string;
  limit?: number;
  offset?: number;
}

export function registerHandsHandlers(): void {
  ipcMain.handle('hands:list', async (_event, filters: HandFilters) => {
    const db = getDatabase();
    let sql = 'SELECT * FROM hands WHERE 1=1';
    const params: any[] = [];

    if (filters.tournamentId) {
      sql += ' AND tournament_id = ?';
      params.push(filters.tournamentId);
    }
    if (filters.room) {
      sql += ' AND room = ?';
      params.push(filters.room);
    }
    if (filters.dateFrom) {
      sql += ' AND datetime >= ?';
      params.push(filters.dateFrom);
    }
    if (filters.dateTo) {
      sql += ' AND datetime <= ?';
      params.push(filters.dateTo);
    }

    sql += ' ORDER BY datetime DESC';

    if (filters.limit) {
      sql += ' LIMIT ?';
      params.push(filters.limit);
      if (filters.offset) {
        sql += ' OFFSET ?';
        params.push(filters.offset);
      }
    }

    return db.prepare(sql).all(...params);
  });

  ipcMain.handle('hands:get', async (_event, id: number) => {
    const db = getDatabase();

    const hand = db.prepare('SELECT * FROM hands WHERE id = ?').get(id) as any;
    if (!hand) return null;

    const actions = db.prepare(`
      SELECT a.*, p.name as player_name
      FROM actions a
      JOIN players p ON a.player_id = p.id
      WHERE a.hand_id = ?
      ORDER BY a.action_order
    `).all(id);

    // Load tournament context
    let tournamentContext = null;
    if (hand.tournament_id) {
      const tournament = db.prepare(`
        SELECT name, buy_in, fee, bounty, total_players, hero_finish_position,
               hero_prize, tournament_type, is_knockout, prize_pool
        FROM tournaments WHERE id = ?
      `).get(hand.tournament_id) as any;

      if (tournament) {
        const handCount = db.prepare('SELECT COUNT(*) as count FROM hands WHERE tournament_id = ?').get(hand.tournament_id) as any;
        const handPosition = db.prepare('SELECT COUNT(*) as count FROM hands WHERE tournament_id = ? AND datetime <= ?').get(hand.tournament_id, hand.datetime) as any;

        // Get starting stack and base bounty from first hand of tournament
        const firstHand = db.prepare('SELECT raw_text FROM hands WHERE tournament_id = ? ORDER BY datetime ASC LIMIT 1').get(hand.tournament_id) as any;
        let startingStack = 0;
        let baseBounty = 0;
        if (firstHand?.raw_text) {
          // Parse first seat line to get starting stack and bounty
          const seatMatch = firstHand.raw_text.match(/^Seat\s+\d+:\s+.+?\s+\((\d+)(?:,\s*([\d.,]+)€?\s*bounty)?\)/m);
          if (seatMatch) {
            startingStack = parseInt(seatMatch[1], 10);
            if (seatMatch[2]) baseBounty = parseFloat(seatMatch[2].replace(',', '.'));
          }
        }

        const totalPlayers = tournament.total_players || 0;
        const finishPos = tournament.hero_finish_position || 0;

        // Estimate ITM (typically ~15% of field)
        const itmEstimate = totalPlayers > 0 ? Math.ceil(totalPlayers * 0.15) : 0;

        // Estimate players remaining:
        // - At hand 1 (start): totalPlayers remaining
        // - At last hand: heroFinishPosition remaining (hero busted at that position)
        // - Linear interpolation between these two known points
        let playersRemaining = 0;
        if (totalPlayers > 0 && finishPos > 0 && handCount.count > 1) {
          const progress = (handPosition.count - 1) / (handCount.count - 1); // 0 at first hand, 1 at last
          playersRemaining = Math.round(totalPlayers - progress * (totalPlayers - finishPos));
          playersRemaining = Math.max(finishPos, Math.min(totalPlayers, playersRemaining));
        } else if (totalPlayers > 0) {
          playersRemaining = totalPlayers;
        }

        tournamentContext = {
          name: tournament.name,
          buyIn: tournament.buy_in,
          fee: tournament.fee,
          bounty: tournament.bounty,
          totalPlayers,
          heroFinishPosition: tournament.hero_finish_position,
          heroPrize: tournament.hero_prize,
          tournamentType: tournament.tournament_type,
          isKnockout: tournament.is_knockout,
          prizePool: tournament.prize_pool,
          itmEstimate,
          playersRemaining,
          handNumber: handPosition.count,
          totalHands: handCount.count,
          nearBubble: playersRemaining > 0 && itmEstimate > 0 && playersRemaining <= itmEstimate * 1.3 && playersRemaining >= itmEstimate * 0.8,
          inTheMoney: playersRemaining > 0 && itmEstimate > 0 && playersRemaining <= itmEstimate,
          nearFinalTable: playersRemaining > 0 && playersRemaining <= 18,
          atFinalTable: playersRemaining > 0 && playersRemaining <= 9,
          startingStack,
          baseBounty,
          // Bounty chip ratio: chip value per 1€ of bounty
          // When you eliminate a player, you get HALF their bounty in cash
          // That cash = (bounty/2) which represents (bounty/2 / totalBuyIn) of the buy-in
          // In chips: (bounty/2 / totalBuyIn) * startingStack
          // Simplified: bounty * startingStack / (2 * totalBuyIn)
          // So ratio = startingStack / (2 * totalBuyIn)
          bountyChipRatio: (tournament.buy_in + (tournament.bounty || 0) + tournament.fee) > 0
            ? startingStack / (2 * (tournament.buy_in + (tournament.bounty || 0) + tournament.fee))
            : 0,
        };
      }
    }

    // Find prev/next hand IDs within the same tournament
    let prevHandId: number | null = null;
    let nextHandId: number | null = null;
    if (hand.tournament_id) {
      const prev = db.prepare(
        'SELECT id FROM hands WHERE tournament_id = ? AND datetime < ? ORDER BY datetime DESC LIMIT 1'
      ).get(hand.tournament_id, hand.datetime) as any;
      const next = db.prepare(
        'SELECT id FROM hands WHERE tournament_id = ? AND datetime > ? ORDER BY datetime ASC LIMIT 1'
      ).get(hand.tournament_id, hand.datetime) as any;
      // Handle same datetime — use id ordering as tiebreaker
      if (!prev) {
        const prevById = db.prepare(
          'SELECT id FROM hands WHERE tournament_id = ? AND id < ? ORDER BY id DESC LIMIT 1'
        ).get(hand.tournament_id, hand.id) as any;
        prevHandId = prevById?.id || null;
      } else {
        prevHandId = prev.id;
      }
      if (!next) {
        const nextById = db.prepare(
          'SELECT id FROM hands WHERE tournament_id = ? AND id > ? ORDER BY id ASC LIMIT 1'
        ).get(hand.tournament_id, hand.id) as any;
        nextHandId = nextById?.id || null;
      } else {
        nextHandId = next.id;
      }
    }

    return { ...hand, actions, tournamentContext, prevHandId, nextHandId };
  });

  ipcMain.handle('hands:tournaments', async (_event, filters: TournamentFilters) => {
    const db = getDatabase();
    let sql = `
      SELECT t.*,
        (SELECT COUNT(*) FROM hands h WHERE h.tournament_id = t.id) as hand_count,
        (t.hero_prize - COALESCE(t.effective_cost, t.buy_in + t.bounty + t.fee)) as profit
      FROM tournaments t
      WHERE 1=1
    `;
    const params: any[] = [];

    if (filters.room) {
      sql += ' AND t.room = ?';
      params.push(filters.room);
    }
    if (filters.dateFrom) {
      sql += ' AND COALESCE(t.start_time, (SELECT MIN(datetime) FROM hands WHERE hands.tournament_id = t.id)) >= ?';
      params.push(filters.dateFrom);
    }
    if (filters.dateTo) {
      sql += ' AND COALESCE(t.start_time, (SELECT MIN(datetime) FROM hands WHERE hands.tournament_id = t.id)) <= ?';
      params.push(filters.dateTo);
    }
    if (filters.buyInMin != null) {
      sql += ' AND t.buy_in >= ?';
      params.push(filters.buyInMin);
    }
    if (filters.buyInMax != null) {
      sql += ' AND t.buy_in <= ?';
      params.push(filters.buyInMax);
    }
    if (filters.tournamentType) {
      sql += ' AND t.tournament_type = ?';
      params.push(filters.tournamentType);
    }

    sql += ' ORDER BY t.start_time DESC';

    if (filters.limit) {
      sql += ' LIMIT ?';
      params.push(filters.limit);
      if (filters.offset) {
        sql += ' OFFSET ?';
        params.push(filters.offset);
      }
    }

    return db.prepare(sql).all(...params);
  });

  ipcMain.handle('hands:tournament', async (_event, id: number) => {
    const db = getDatabase();

    const tournament = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(id);
    if (!tournament) return null;

    const hands = db.prepare(`
      SELECT * FROM hands WHERE tournament_id = ? ORDER BY datetime
    `).all(id);

    return { ...tournament, hands };
  });

  ipcMain.handle('hands:tournament:update-cost', async (_event, id: number, effectiveCost: number | null) => {
    const db = getDatabase();
    db.prepare('UPDATE tournaments SET effective_cost = ? WHERE id = ?').run(effectiveCost, id);
    return db.prepare('SELECT * FROM tournaments WHERE id = ?').get(id);
  });
}
