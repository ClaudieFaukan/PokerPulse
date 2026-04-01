import { ipcMain } from 'electron';
import { getDatabase } from '../database/schema';
import { detectLeaks, generateClaudePrompt, LeakFlag } from '../../engine/leak-detector';
import { ParsedHand, ParsedAction, ParsedPlayer } from '../../parsers/types';
import { loadSettings } from '../services/settings-service';

export function registerCoachHandlers(): void {
  ipcMain.handle('coach:detect-leaks', async (_event, filters?: { limit?: number }) => {
    const db = getDatabase();
    const settings = loadSettings();

    // Get hero name (try all rooms)
    const heroName = settings.heroNames.winamax || settings.heroNames.pokerstars || settings.heroNames.pmu;
    if (!heroName) {
      return { flags: [], error: 'Aucun pseudo configuré dans Settings > Comptes.' };
    }

    // Fetch recent hands with actions from DB
    const limit = filters?.limit || 500;
    const hands = db.prepare(`
      SELECT h.*, t.name as tournament_name, t.buy_in as t_buy_in, t.fee as t_fee, t.bounty as t_bounty
      FROM hands h
      LEFT JOIN tournaments t ON h.tournament_id = t.id
      ORDER BY h.datetime DESC
      LIMIT ?
    `).all(limit) as any[];

    // Rebuild ParsedHand objects from DB data for the leak detector
    const parsedHands: ParsedHand[] = [];

    for (const h of hands) {
      // Get actions for this hand
      const actions = db.prepare(`
        SELECT a.*, p.name as player_name
        FROM actions a
        JOIN players p ON a.player_id = p.id
        WHERE a.hand_id = ?
        ORDER BY a.action_order
      `).all(h.id) as any[];

      // Rebuild players from raw_text
      const players = parsePlayersFromRaw(h.raw_text || '');

      // Determine button seat from raw_text
      const buttonSeat = parseButtonSeat(h.raw_text || '');

      const parsedActions: ParsedAction[] = actions.map((a: any) => ({
        street: a.street,
        player: a.player_name,
        action: a.action_type,
        amount: a.amount || undefined,
      }));

      const parsedHand: ParsedHand = {
        handId: h.hand_number,
        room: h.room,
        tournamentId: String(h.tournament_id),
        tournamentName: h.tournament_name || '',
        buyIn: h.t_buy_in || 0,
        fee: h.t_fee || 0,
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
        winners: [], // Not needed for leak detection
        showdownHands: [],
        rawText: h.raw_text || '',
      };

      parsedHands.push(parsedHand);
    }

    // Run leak detection
    const flags = detectLeaks(parsedHands, heroName);

    // Enrich flags with DB hand IDs and Claude prompts
    const enrichedFlags = flags.map((flag) => {
      const hand = parsedHands.find((h) => h.handId === flag.handId);
      const dbHand = hands.find((h: any) => h.hand_number === flag.handId);

      return {
        ...flag,
        handDbId: dbHand?.id,
        tournamentName: dbHand?.tournament_name,
        heroCards: hand ? hand.heroCards.join(' ') : '',
        prompt: hand ? generateClaudePrompt(hand, heroName, flag) : '',
      };
    });

    return { flags: enrichedFlags };
  });
}

function parsePlayersFromRaw(rawText: string): ParsedPlayer[] {
  const players: ParsedPlayer[] = [];
  const seatRegex = /^Seat\s+(\d+):\s+(.+?)\s+\((\d+)(?:\s+in chips)?\)/gm;
  let m;
  while ((m = seatRegex.exec(rawText)) !== null) {
    players.push({
      seat: parseInt(m[1], 10),
      name: m[2],
      stack: parseFloat(m[3]),
      isHero: false,
    });
  }

  // Detect hero from Dealt line
  const dealtMatch = rawText.match(/Dealt to\s+(.+?)\s+\[/);
  if (dealtMatch) {
    for (const p of players) {
      p.isHero = p.name === dealtMatch[1];
    }
  }

  // PMU XML: parse from player tags
  if (players.length === 0 && rawText.includes('<player')) {
    const playerRegex = /<player\s+([^>]+)\/>/g;
    while ((m = playerRegex.exec(rawText)) !== null) {
      const attrs = m[1];
      const seat = parseInt(attrs.match(/seat="(\d+)"/)?.[1] || '0', 10);
      const name = attrs.match(/name="([^"]+)"/)?.[1] || '';
      const chips = parseFloat((attrs.match(/chips="([^"]+)"/)?.[1] || '0').replace(/\s/g, ''));
      if (seat > 0 && name) {
        players.push({ seat, name, stack: chips, isHero: false });
      }
    }
  }

  return players;
}

function parseButtonSeat(rawText: string): number {
  const m1 = rawText.match(/Seat\s+#(\d+)\s+is the button/);
  if (m1) return parseInt(m1[1], 10);
  const m2 = rawText.match(/Button:\s+Seat\s+(\d+)/);
  if (m2) return parseInt(m2[1], 10);
  const m3 = rawText.match(/dealer="1"[^>]*seat="(\d+)"/);
  if (m3) return parseInt(m3[1], 10);
  return 1;
}
