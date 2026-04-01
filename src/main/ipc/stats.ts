import { ipcMain } from 'electron';
import { getDatabase } from '../database/schema';

interface StatsFilters {
  dateFrom?: string;
  dateTo?: string;
  rooms?: string[];
  buyInMin?: number;
  buyInMax?: number;
  tournamentTypes?: string[];
}

export function registerStatsHandlers(): void {
  ipcMain.handle('stats:get', async (_event, filters: StatsFilters) => {
    const db = getDatabase();
    return getHeroStats(db, filters);
  });

  ipcMain.handle('stats:dashboard', async (_event, filters: StatsFilters) => {
    const db = getDatabase();

    const profitCurve = getProfitCurve(db, filters);
    const stats = getHeroStats(db, filters);
    const overview = getTournamentOverview(db, filters);

    return { profitCurve, stats, overview };
  });
}

function buildTournamentWhere(filters: StatsFilters): { where: string; params: any[] } {
  const clauses: string[] = [];
  const params: any[] = [];

  if (filters.dateFrom) {
    clauses.push('COALESCE(t.start_time, (SELECT MIN(datetime) FROM hands WHERE hands.tournament_id = t.id)) >= ?');
    params.push(filters.dateFrom);
  }
  if (filters.dateTo) {
    clauses.push('COALESCE(t.start_time, (SELECT MIN(datetime) FROM hands WHERE hands.tournament_id = t.id)) <= ?');
    params.push(filters.dateTo);
  }
  if (filters.rooms && filters.rooms.length > 0) {
    clauses.push(`t.room IN (${filters.rooms.map(() => '?').join(',')})`);
    params.push(...filters.rooms);
  }
  if (filters.buyInMin != null) {
    clauses.push('t.buy_in >= ?');
    params.push(filters.buyInMin);
  }
  if (filters.buyInMax != null) {
    clauses.push('t.buy_in <= ?');
    params.push(filters.buyInMax);
  }
  if (filters.tournamentTypes && filters.tournamentTypes.length > 0) {
    clauses.push(`t.tournament_type IN (${filters.tournamentTypes.map(() => '?').join(',')})`);
    params.push(...filters.tournamentTypes);
  }

  const where = clauses.length > 0 ? 'WHERE ' + clauses.join(' AND ') : '';
  return { where, params };
}

function getProfitCurve(db: ReturnType<typeof getDatabase>, filters: StatsFilters) {
  const { where, params } = buildTournamentWhere(filters);

  return db.prepare(`
    SELECT
      t.id,
      t.name,
      t.room,
      t.buy_in,
      t.fee,
      t.hero_prize,
      t.hero_finish_position,
      t.total_players,
      t.start_time,
      (t.hero_prize - COALESCE(t.effective_cost, t.buy_in + t.bounty + t.fee)) as profit
    FROM tournaments t
    ${where}
    ORDER BY t.start_time ASC
  `).all(...params);
}

function getHeroStats(db: ReturnType<typeof getDatabase>, filters: StatsFilters) {
  const { where, params } = buildTournamentWhere(filters);

  // Get aggregate action stats from hands in matching tournaments
  const handWhere = where ? where.replace(/t\./g, 'tour.') : '';
  const handParams = [...params];

  const actionStats = db.prepare(`
    SELECT
      COUNT(DISTINCT h.id) as total_hands,
      SUM(CASE WHEN a.street = 'preflop' AND a.action_type IN ('call', 'raise', 'allin', 'bet') AND a.is_hero = 1 THEN 1 ELSE 0 END) as vpip_hands,
      SUM(CASE WHEN a.street = 'preflop' AND a.action_type IN ('raise', 'allin') AND a.is_hero = 1 THEN 1 ELSE 0 END) as pfr_hands,
      SUM(CASE WHEN h.went_to_showdown = 1 THEN 1 ELSE 0 END) as wtsd_hands,
      SUM(CASE WHEN h.hero_won_at_showdown = 1 THEN 1 ELSE 0 END) as wsd_hands
    FROM hands h
    LEFT JOIN actions a ON a.hand_id = h.id
    LEFT JOIN tournaments tour ON h.tournament_id = tour.id
    ${handWhere}
  `).get(...handParams) as any;

  const totalHands = actionStats?.total_hands || 0;

  return {
    totalHands,
    vpip: totalHands > 0 ? ((actionStats?.vpip_hands || 0) / totalHands * 100).toFixed(1) : '0',
    pfr: totalHands > 0 ? ((actionStats?.pfr_hands || 0) / totalHands * 100).toFixed(1) : '0',
    wtsd: totalHands > 0 ? ((actionStats?.wtsd_hands || 0) / totalHands * 100).toFixed(1) : '0',
    wsd: (actionStats?.wtsd_hands || 0) > 0
      ? ((actionStats?.wsd_hands || 0) / actionStats.wtsd_hands * 100).toFixed(1)
      : '0',
  };
}

function getTournamentOverview(db: ReturnType<typeof getDatabase>, filters: StatsFilters) {
  const { where, params } = buildTournamentWhere(filters);

  const result = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN hero_prize > 0 THEN 1 ELSE 0 END) as itm,
      SUM(hero_prize - COALESCE(effective_cost, buy_in + bounty + fee)) as profit,
      SUM(COALESCE(effective_cost, buy_in + bounty + fee)) as invested,
      AVG(buy_in) as avg_buyin
    FROM tournaments t
    ${where}
  `).get(...params) as any;

  const total = result?.total || 0;
  const invested = result?.invested || 0;

  return {
    total,
    itm: result?.itm || 0,
    itmPct: total > 0 ? ((result?.itm || 0) / total * 100).toFixed(1) : '0',
    profit: result?.profit || 0,
    roi: invested > 0 ? ((result?.profit || 0) / invested * 100).toFixed(1) : '0',
    avgBuyin: result?.avg_buyin || 0,
  };
}
