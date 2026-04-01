import { ParsedTournamentSummary, TournamentType, Speed } from '../types';

const SUMMARY_HEADER = /^PokerStars Tournament #(\d+)/;
const SUMMARY_BUYIN = /Buy-In:\s*[$€]?([\d.]+)\s*\/\s*[$€]?([\d.]+)/;
const SUMMARY_BUYIN_ALT = /[$€]?([\d.]+)\+[$€]?([\d.]+)/;
const SUMMARY_PLAYERS = /(\d+)\s+players/;
const SUMMARY_PRIZEPOOL = /Total Prize Pool:\s*[$€]?([\d.,]+)/;
const SUMMARY_NAME = /Tournament #\d+,\s*(.+?)(?:\s*$|\s*Buy-In)/;
const SUMMARY_START = /Tournament started\s+(\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2})/;
const SUMMARY_END = /Tournament finished\s+(\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2})/;
const SUMMARY_HERO_LINE = /You finished in (\d+)(?:st|nd|rd|th)?\s+place/i;
const SUMMARY_HERO_PRIZE = /and received\s+[$€]?([\d.,]+)/i;
const SUMMARY_PAYOUT_LINE = /^\s*(\d+):\s+.+?\s+[$€]?([\d.,]+)/;

const SPEED_TURBO = /turbo/i;
const SPEED_HYPER = /hyper/i;
const TYPE_SNG = /sit\s*(?:&|and)\s*go|sng/i;
const TYPE_SPIN = /spin/i;
const TYPE_SAT = /satellite|qualifier/i;
const IS_REBUY = /re-?buy/i;
const IS_KNOCKOUT = /knockout|bounty|pko/i;

export function parseSummary(fileContent: string): ParsedTournamentSummary | null {
  try {
    const lines = fileContent.split('\n').map((l) => l.trim());
    const fullText = fileContent;

    // Tournament ID
    let tournamentId = '';
    for (const line of lines) {
      const m = line.match(SUMMARY_HEADER);
      if (m) { tournamentId = m[1]; break; }
    }
    if (!tournamentId) return null;

    // Tournament name
    let tournamentName = `Tournament #${tournamentId}`;
    const nameMatch = fullText.match(SUMMARY_NAME);
    if (nameMatch) tournamentName = nameMatch[1].trim();

    // Buy-in
    let buyIn = 0, fee = 0;
    for (const line of lines) {
      const m = line.match(SUMMARY_BUYIN) || line.match(SUMMARY_BUYIN_ALT);
      if (m) {
        buyIn = parseFloat(m[1]);
        fee = parseFloat(m[2]);
        break;
      }
    }

    // Prize pool
    let prizePool = 0;
    for (const line of lines) {
      const m = line.match(SUMMARY_PRIZEPOOL);
      if (m) { prizePool = parseFloat(m[1].replace(',', '')); break; }
    }

    // Total players
    let totalPlayers = 0;
    for (const line of lines) {
      const m = line.match(SUMMARY_PLAYERS);
      if (m) { totalPlayers = parseInt(m[1], 10); break; }
    }

    // Dates
    let startTime = new Date();
    let endTime = new Date();
    for (const line of lines) {
      const sm = line.match(SUMMARY_START);
      if (sm) startTime = parsePSDate(sm[1]);
      const em = line.match(SUMMARY_END);
      if (em) endTime = parsePSDate(em[1]);
    }

    // Hero finish
    let heroFinishPosition = 0;
    let heroPrize = 0;
    for (const line of lines) {
      const posM = line.match(SUMMARY_HERO_LINE);
      if (posM) {
        heroFinishPosition = parseInt(posM[1], 10);
        const prizeM = line.match(SUMMARY_HERO_PRIZE);
        if (prizeM) heroPrize = parseFloat(prizeM[1].replace(',', ''));
      }
    }

    // Payout structure
    const payoutStructure: { position: number; prize: number }[] = [];
    for (const line of lines) {
      const m = line.match(SUMMARY_PAYOUT_LINE);
      if (m) {
        payoutStructure.push({
          position: parseInt(m[1], 10),
          prize: parseFloat(m[2].replace(',', '')),
        });
      }
    }

    // Type/speed/flags
    let tournamentType: TournamentType = 'MTT';
    if (TYPE_SPIN.test(fullText)) tournamentType = 'SPIN';
    else if (TYPE_SAT.test(fullText)) tournamentType = 'SAT';
    else if (TYPE_SNG.test(fullText)) tournamentType = 'SNG';

    let speed: Speed = 'regular';
    if (SPEED_HYPER.test(fullText)) speed = 'hyper-turbo';
    else if (SPEED_TURBO.test(fullText)) speed = 'turbo';

    const isRebuy = IS_REBUY.test(fullText);
    const isKnockout = IS_KNOCKOUT.test(fullText);

    return {
      room: 'pokerstars',
      tournamentId,
      tournamentName,
      buyIn,
      fee,
      bounty: isKnockout ? buyIn / 2 : undefined,
      prizePool,
      totalPlayers,
      startTime,
      endTime,
      heroFinishPosition,
      heroPrize,
      heroBountiesWon: undefined,
      payoutStructure,
      tournamentType,
      speed,
      isRebuy,
      isKnockout,
    };
  } catch {
    return null;
  }
}

/**
 * Parse tournament results embedded in PokerStars hand history files.
 * PokerStars embeds finish positions and ticket prizes directly in hand lines:
 *   "Player finished the tournament in 2nd place"
 *   "Player wins the tournament - congratulations!"
 *   "Player wins a '€10 Step 3 MTT Power Path ticket' ticket"
 */
export function parseEmbeddedResults(fileContent: string): ParsedTournamentSummary | null {
  try {
    // Detect hero from "Dealt to" lines
    const heroMatch = fileContent.match(/Dealt to\s+(.+?)\s+\[/);
    if (!heroMatch) return null;
    const heroName = heroMatch[1];

    // Extract tournament info from first hand header
    const headerMatch = fileContent.match(
      /PokerStars Hand #\d+:\s+Tournament #(\d+),\s*[$€]?([\d.]+)\+[$€]?([\d.]+)/
    );
    if (!headerMatch) return null;

    const tournamentId = headerMatch[1];
    const buyIn = parseFloat(headerMatch[2]);
    const fee = parseFloat(headerMatch[3]);

    // Check if this file contains tournament end markers
    const WINS_TOURNAMENT = /^(.+?) wins the tournament/m;
    const FINISHED_PLACE = /^(.+?) finished the tournament in (\d+)(?:st|nd|rd|th) place/gm;
    const WINS_TICKET = /^(.+?) wins a '([^']+)' ticket/m;

    const winnerMatch = fileContent.match(WINS_TOURNAMENT);
    if (!winnerMatch) return null; // No tournament result in this file

    const winnerName = winnerMatch[1];

    // Collect all finish positions
    let heroFinishPosition = 0;
    let totalPlayers = 1; // At least the winner
    let match;
    while ((match = FINISHED_PLACE.exec(fileContent)) !== null) {
      const playerName = match[1];
      const position = parseInt(match[2], 10);
      if (position > totalPlayers) totalPlayers = position;
      if (playerName === heroName) heroFinishPosition = position;
    }

    // Winner = position 1
    if (winnerName === heroName) heroFinishPosition = 1;

    // Extract ticket prize
    let heroPrize = 0;
    const ticketMatch = fileContent.match(WINS_TICKET);
    if (ticketMatch && ticketMatch[1] === heroName) {
      const ticketDesc = ticketMatch[2];
      const amountMatch = ticketDesc.match(/[$€]([\d.]+)/);
      if (amountMatch) heroPrize = parseFloat(amountMatch[1]);
    }

    // Extract prize from "and received" format (cash prizes)
    if (heroPrize === 0) {
      const receivedPattern = new RegExp(
        escapeRegex(heroName) + String.raw`.*?received\s+[$€]?([\d.,]+)`,
        'im'
      );
      const receivedMatch = fileContent.match(receivedPattern);
      if (receivedMatch) heroPrize = parseFloat(receivedMatch[1].replace(',', ''));
    }

    // Extract table size for total players if not enough finish lines
    const tableMatch = fileContent.match(/(\d+)-max/);
    if (tableMatch) {
      const tableMax = parseInt(tableMatch[1], 10);
      if (tableMax > totalPlayers) totalPlayers = tableMax;
    }

    // Determine tournament type
    const fullText = fileContent;
    let tournamentType: TournamentType = 'MTT';
    if (TYPE_SPIN.test(fullText)) tournamentType = 'SPIN';
    else if (TYPE_SAT.test(fullText) || ticketMatch) tournamentType = 'SAT';
    else if (TYPE_SNG.test(fullText) || totalPlayers <= 10) tournamentType = 'SNG';

    let speed: Speed = 'regular';
    if (SPEED_HYPER.test(fullText)) speed = 'hyper-turbo';
    else if (SPEED_TURBO.test(fullText)) speed = 'turbo';

    const isRebuy = IS_REBUY.test(fullText);
    const isKnockout = IS_KNOCKOUT.test(fullText);

    // Extract start/end times from first and last hand
    const dateMatches = [...fullText.matchAll(/PokerStars Hand #\d+.*?(\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2})\s*(CET|ET|UTC)?/g)];
    let startTime = new Date();
    let endTime = new Date();
    if (dateMatches.length > 0) {
      startTime = parsePSDateWithTz(dateMatches[0][1], dateMatches[0][2]);
      endTime = parsePSDateWithTz(dateMatches[dateMatches.length - 1][1], dateMatches[dateMatches.length - 1][2]);
    }

    return {
      room: 'pokerstars',
      tournamentId,
      tournamentName: `Tournament #${tournamentId}`,
      buyIn,
      fee,
      bounty: isKnockout ? buyIn / 2 : undefined,
      prizePool: 0, // Not available in hand history
      totalPlayers,
      startTime,
      endTime,
      heroFinishPosition,
      heroPrize,
      heroBountiesWon: undefined,
      payoutStructure: [],
      tournamentType,
      speed,
      isRebuy,
      isKnockout,
    };
  } catch {
    return null;
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parsePSDateWithTz(dateStr: string, tz?: string): Date {
  const [datePart, timePart] = dateStr.trim().split(/\s+/);
  const [year, month, day] = datePart.split('/');
  const [hour, min, sec] = timePart.split(':');
  const d = new Date(Date.UTC(
    parseInt(year), parseInt(month) - 1, parseInt(day),
    parseInt(hour), parseInt(min), parseInt(sec)
  ));
  if (tz === 'CET') d.setUTCHours(d.getUTCHours() - 1);
  else if (tz === 'ET') d.setUTCHours(d.getUTCHours() + 5);
  return d;
}

function parsePSDate(dateStr: string): Date {
  const [datePart, timePart] = dateStr.split(/\s+/);
  const [year, month, day] = datePart.split('/');
  const [hour, min, sec] = timePart.split(':');
  return new Date(Date.UTC(
    parseInt(year), parseInt(month) - 1, parseInt(day),
    parseInt(hour), parseInt(min), parseInt(sec)
  ));
}
