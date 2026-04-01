import { ipcMain, dialog, BrowserWindow } from 'electron';
import fs from 'fs';
import { getDatabase } from '../database/schema';
import { calculateStats } from '../../engine/stats';
import { ParsedHand, ParsedAction, ParsedPlayer } from '../../parsers/types';

export function registerAnalysisExportHandlers(): void {
  ipcMain.handle('analysis:export-tournament', async (_event, tournamentDbId: number) => {
    const db = getDatabase();

    const tournament = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(tournamentDbId) as any;
    if (!tournament) return { success: false, error: 'Tournoi introuvable' };

    const hands = db.prepare('SELECT * FROM hands WHERE tournament_id = ? ORDER BY datetime').all(tournamentDbId) as any[];
    if (hands.length === 0) return { success: false, error: 'Aucune main' };

    // Rebuild ParsedHand objects for stats calculation
    const parsedHands: ParsedHand[] = [];
    const allPlayerNames = new Set<string>();
    let heroName = '';

    for (const h of hands) {
      const actions = db.prepare(`
        SELECT a.*, p.name as player_name
        FROM actions a JOIN players p ON a.player_id = p.id
        WHERE a.hand_id = ? ORDER BY a.action_order
      `).all(h.id) as any[];

      const players = parsePlayersFromRaw(h.raw_text || '', h.room);
      const buttonSeat = parseButtonSeat(h.raw_text || '', h.room);

      for (const p of players) {
        allPlayerNames.add(p.name);
        if (p.isHero) heroName = p.name;
      }

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
        tournamentName: tournament.name || '',
        buyIn: tournament.buy_in || 0,
        fee: tournament.fee || 0,
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

    // Calculate hero stats
    const heroStats = heroName ? calculateStats(parsedHands, heroName) : null;

    // Calculate opponent stats (only those with >= 5 hands)
    const opponentStats: { name: string; stats: ReturnType<typeof calculateStats> }[] = [];
    for (const name of allPlayerNames) {
      if (name === heroName) continue;
      const stats = calculateStats(parsedHands, name);
      if (stats.handsPlayed >= 5) {
        opponentStats.push({ name, stats });
      }
    }
    opponentStats.sort((a, b) => b.stats.handsPlayed - a.stats.handsPlayed);

    // Build the analysis file
    const lines: string[] = [];

    // === HEADER ===
    lines.push('=== TOURNAMENT ANALYSIS ===');
    lines.push(`Name: ${tournament.name || 'N/A'} | Room: ${tournament.room} | Type: ${tournament.tournament_type || 'MTT'}${tournament.is_knockout ? ' KO' : ''}`);
    const totalCost = tournament.buy_in + (tournament.bounty || 0) + tournament.fee;
    lines.push(`Buy-in: ${totalCost.toFixed(2)}€${tournament.bounty > 0 ? ` (${tournament.buy_in}+${tournament.bounty}+${tournament.fee})` : ` (${tournament.buy_in}+${tournament.fee})`}`);
    lines.push(`Players: ${tournament.total_players || '?'} | Finish: ${tournament.hero_finish_position || '?'}${tournament.total_players ? `/${tournament.total_players}` : ''} | Prize: ${(tournament.hero_prize || 0).toFixed(2)}€`);
    lines.push(`Hero: ${heroName} | Hands played: ${hands.length}`);
    lines.push('');

    // === HERO STATS ===
    if (heroStats) {
      lines.push('=== HERO STATS ===');
      lines.push(`VPIP: ${heroStats.vpip.toFixed(1)}% | PFR: ${heroStats.pfr.toFixed(1)}% | 3-Bet: ${heroStats.threeBet.toFixed(1)}% | 4-Bet: ${heroStats.fourBet.toFixed(1)}%`);
      lines.push(`Steal: ${heroStats.steal.toFixed(1)}% | Fold to 3B: ${heroStats.foldTo3Bet.toFixed(1)}% | Fold BB/Steal: ${heroStats.foldBBToSteal.toFixed(1)}% | Limp: ${heroStats.limp.toFixed(1)}%`);
      lines.push(`C-Bet Flop: ${heroStats.cbetFlop.toFixed(1)}% | C-Bet Turn: ${heroStats.cbetTurn.toFixed(1)}% | Fold to CB: ${heroStats.foldToCbetFlop.toFixed(1)}%`);
      lines.push(`WTSD: ${heroStats.wtsd.toFixed(1)}% | W$SD: ${heroStats.wsd.toFixed(1)}% | WWSF: ${heroStats.wwsf.toFixed(1)}% | AF: ${heroStats.af.toFixed(2)} | AFq: ${heroStats.afq.toFixed(1)}%`);
      lines.push('');
    }

    // === OPPONENT PROFILES ===
    if (opponentStats.length > 0) {
      lines.push('=== OPPONENT PROFILES ===');
      for (const { name, stats } of opponentStats) {
        const profile = classifyPlayer(stats);
        lines.push(`${name} (${stats.handsPlayed}h): V${stats.vpip.toFixed(0)}/P${stats.pfr.toFixed(0)}/3B${stats.threeBet.toFixed(0)} CB${stats.cbetFlop.toFixed(0)} F3B${stats.foldTo3Bet.toFixed(0)} — ${profile}`);
      }
      lines.push('');
    }

    // === HANDS ===
    lines.push(`=== HANDS (${hands.length}) ===`);
    lines.push('Legend: ★=all-in SD=showdown');
    lines.push('');

    for (let i = 0; i < parsedHands.length; i++) {
      const hand = parsedHands[i];
      const dbHand = hands[i];
      const bb = hand.bigBlind;
      if (bb <= 0) continue;

      const hero = hand.players.find((p) => p.isHero);
      if (!hero) continue;

      const stackBB = (hero.stack / bb).toFixed(1);
      const position = getPosition(hand, hero);
      const isAllin = dbHand.is_hero_allin;
      const isShowdown = dbHand.went_to_showdown;
      const evDiff = dbHand.hero_ev_diff;
      const markers = [isAllin ? '★' : '', isShowdown ? 'SD' : ''].filter(Boolean).join(' ');

      // Hand header
      const anteStr = hand.ante > 0 ? `/${hand.ante}` : '';
      lines.push(`#${i + 1} | Lv${hand.level} (${hand.smallBlind}/${bb}${anteStr}) | ${position} | ${stackBB}bb | [${hand.heroCards[0]} ${hand.heroCards[1]}]${markers ? ' ' + markers : ''}`);

      // Actions by street
      const streets = groupActionsByStreet(hand);
      for (const [street, streetActions] of streets) {
        const boardStr = getBoardForStreet(hand, street);
        const actionStr = streetActions
          .filter((a) => a.action !== 'post_ante' && a.action !== 'post_blind')
          .map((a) => formatAction(a, heroName, bb))
          .join(', ');

        if (actionStr) {
          lines.push(`  ${capitalize(street)}${boardStr}: ${actionStr}`);
        }
      }

      // Result
      const won = dbHand.hero_won || 0;
      const wonBB = (won / bb).toFixed(1);
      let resultStr = won > 0 ? `→ Won +${wonBB}bb` : won < 0 ? `→ Lost ${wonBB}bb` : '→ 0bb';
      if (evDiff != null && Math.abs(evDiff) > 0.01) {
        const evBB = (evDiff / bb).toFixed(1);
        resultStr += ` (EV diff: ${evDiff > 0 ? '+' : ''}${evBB}bb)`;
      }
      lines.push(`  ${resultStr}`);
      lines.push('');
    }

    // Prompt at the end
    lines.push('=== INSTRUCTIONS POUR L\'ANALYSE ===');
    lines.push('Analyse ce tournoi MTT en détail. Pour chaque main intéressante:');
    lines.push('1. Identifie si mon play est correct ou non, et pourquoi');
    lines.push('2. Propose une alternative si mon play est suboptimal');
    lines.push('3. Considère: ICM, profondeur de stack (M-ratio), profil des adversaires, position');
    lines.push('');
    lines.push('Synthèse attendue:');
    lines.push('- Mes 3 principaux leaks avec exemples de mains');
    lines.push('- Mes 3 points forts');
    lines.push('- Axes de progression prioritaires');
    lines.push('- Pour chaque leak, cite les mains # concernées');

    const content = lines.join('\n');

    // Save dialog
    const win = BrowserWindow.getFocusedWindow();
    const safeName = (tournament.name || 'tournament').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50);
    const result = await dialog.showSaveDialog(win!, {
      title: 'Enregistrer l\'analyse du tournoi',
      defaultPath: `analyse_${safeName}_${tournament.tournament_id}.txt`,
      filters: [{ name: 'Text', extensions: ['txt'] }],
    });

    if (result.canceled || !result.filePath) return { success: false, error: 'Annulé' };

    fs.writeFileSync(result.filePath, content, 'utf-8');
    return { success: true, filePath: result.filePath, size: content.length };
  });
}

// === Helpers ===

function getPosition(hand: ParsedHand, player: ParsedPlayer): string {
  const seats = hand.players.map((p) => p.seat).sort((a, b) => a - b);
  const n = seats.length;
  const btnIdx = seats.indexOf(hand.buttonSeat);
  const heroIdx = seats.indexOf(player.seat);
  if (btnIdx === -1 || heroIdx === -1) return '?';

  const dist = (heroIdx - btnIdx + n) % n;
  if (dist === 0) return 'BTN';
  if (dist === 1) return 'SB';
  if (dist === 2) return 'BB';
  const remaining = n - 3;
  if (remaining <= 0) return '?';
  const fromBB = dist - 2;
  if (fromBB === remaining) return 'CO';
  if (fromBB === 1) return 'UTG';
  if (fromBB === 2 && remaining >= 4) return 'UTG+1';
  if (fromBB === remaining - 1 && remaining >= 4) return 'HJ';
  return 'MP';
}

function groupActionsByStreet(hand: ParsedHand): [string, ParsedAction[]][] {
  const streets = new Map<string, ParsedAction[]>();
  for (const a of hand.actions) {
    if (!streets.has(a.street)) streets.set(a.street, []);
    streets.get(a.street)!.push(a);
  }
  return [...streets.entries()];
}

function getBoardForStreet(hand: ParsedHand, street: string): string {
  if (street === 'flop' && hand.board.flop) return ` [${hand.board.flop.join(' ')}]`;
  if (street === 'turn' && hand.board.turn) return ` [${hand.board.turn}]`;
  if (street === 'river' && hand.board.river) return ` [${hand.board.river}]`;
  return '';
}

function formatAction(a: ParsedAction, heroName: string, bb: number): string {
  const name = a.player === heroName ? 'Hero' : a.player;
  const amtBB = a.amount ? `${(a.amount / bb).toFixed(1)}bb` : '';
  switch (a.action) {
    case 'fold': return `${name} folds`;
    case 'check': return `${name} checks`;
    case 'call': return `${name} calls ${amtBB}`;
    case 'bet': return `${name} bets ${amtBB}`;
    case 'raise': return `${name} raises ${amtBB}`;
    case 'allin': return `${name} ALL-IN ${amtBB}`;
    default: return `${name} ${a.action}`;
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function classifyPlayer(stats: ReturnType<typeof calculateStats>): string {
  const { vpip, pfr, af } = stats;
  const gap = vpip - pfr;

  if (vpip > 35 && gap > 15) return 'loose passive (fish)';
  if (vpip > 30 && pfr > 20) return 'loose aggressive (LAG)';
  if (vpip > 30) return 'loose passive';
  if (vpip < 18 && pfr < 14) return 'tight passive (nit)';
  if (vpip >= 18 && vpip <= 26 && pfr >= 14 && pfr <= 22) return 'tight aggressive (TAG reg)';
  if (vpip < 15) return 'ultra nit';
  if (af > 4) return 'hyper aggressive';
  if (gap > 10) return 'passive caller';
  return 'standard';
}

function parsePlayersFromRaw(rawText: string, room: string): ParsedPlayer[] {
  const players: ParsedPlayer[] = [];
  if (!rawText) return players;

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

  const seatRegex = /^Seat\s+(\d+):\s+(.+?)\s+\((\d+)(?:,\s*[\d.,]+€?\s*bounty)?(?:\s+in chips)?\)/gm;
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
