import { ParsedHand, Room } from './types';
import { detectRoom } from './common/detector';
import { parseFile as parseWinamax } from './winamax/parser';
import { parseFile as parsePokerStars } from './pokerstars/parser';
import { parseFile as parsePmu } from './pmu/parser';
import { parseSummary as parseWinamaxSummary } from './winamax/summary-parser';
import { parseSummary as parsePokerStarsSummary, parseEmbeddedResults as parsePokerStarsEmbedded } from './pokerstars/summary-parser';
import { parseSessionSummary as parsePmuSession } from './pmu/session-parser';
import { ParsedTournamentSummary } from './types';

export { detectRoom } from './common/detector';
export { ParsedHand, ParsedTournamentSummary, Room } from './types';

/**
 * Parse a file content, auto-detecting the room.
 */
export function parseFileContent(
  content: string,
  heroNames?: Partial<Record<Room, string>>
): { hands: ParsedHand[]; errors: string[]; room: Room | null } {
  const room = detectRoom(content);
  if (!room) {
    return { hands: [], errors: ['Unknown file format — could not detect room'], room: null };
  }

  const heroName = heroNames?.[room];

  switch (room) {
    case 'winamax':
      return { ...parseWinamax(content, heroName), room };
    case 'pokerstars':
      return { ...parsePokerStars(content, heroName), room };
    case 'pmu':
      return { ...parsePmu(content, heroName), room };
  }
}

/**
 * Try to parse a file as a tournament summary.
 */
export function parseSummaryContent(content: string): ParsedTournamentSummary | null {
  // Winamax summary files
  if (content.includes('Tournament summary')) {
    return parseWinamaxSummary(content);
  }

  // PokerStars summary files (TS files)
  if (content.includes('PokerStars Tournament')) {
    return parsePokerStarsSummary(content);
  }

  // PMU XML session files contain summary data in <session>/<general>
  if (content.includes('<session')) {
    return parsePmuSession(content);
  }

  // PokerStars hand histories with embedded tournament results
  if (content.includes('PokerStars Hand') && /wins the tournament/m.test(content)) {
    return parsePokerStarsEmbedded(content);
  }

  return null;
}

/**
 * Check if a file looks like a tournament summary (not hand history).
 */
export function isSummaryFile(filename: string, content: string): boolean {
  // Winamax: *_summary_*.txt
  if (/summary/i.test(filename)) return true;
  // PokerStars: TS*.txt
  if (/^TS\d/.test(filename)) return true;
  // Content check
  if (content.includes('Tournament summary')) return true;
  return false;
}

/**
 * Check if a file contains embedded summary data (like PMU XML or PokerStars tournament results).
 * These files are BOTH hand histories and summaries.
 */
export function hasEmbeddedSummary(content: string): boolean {
  // PMU XML files
  if (content.includes('<session') && content.includes('<place>')) return true;
  // PokerStars hand histories with tournament end markers
  if (content.includes('PokerStars Hand') && /wins the tournament/m.test(content)) return true;
  return false;
}
