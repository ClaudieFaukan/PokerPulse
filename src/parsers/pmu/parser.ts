import { ParsedHand, ParsedAction, ParsedPlayer, Street, ActionType } from '../types';
import * as P from './patterns';

/**
 * Detect whether the content is XML or text format.
 */
export function isXmlFormat(content: string): boolean {
  const trimmed = content.trim();
  return trimmed.startsWith('<') || trimmed.includes('<session');
}

/**
 * Split a PMU text file into individual hand blocks.
 */
export function splitHands(fileContent: string): string[] {
  if (isXmlFormat(fileContent)) {
    return splitHandsXml(fileContent);
  }
  return splitHandsText(fileContent);
}

function splitHandsText(fileContent: string): string[] {
  const hands: string[] = [];
  const lines = fileContent.split('\n');
  let currentHand: string[] = [];

  for (const line of lines) {
    if (P.HEADER.test(line) && currentHand.length > 0) {
      hands.push(currentHand.join('\n'));
      currentHand = [line];
    } else {
      currentHand.push(line);
    }
  }

  if (currentHand.length > 0 && currentHand.some((l) => P.HEADER.test(l))) {
    hands.push(currentHand.join('\n'));
  }

  return hands;
}

function splitHandsXml(fileContent: string): string[] {
  // Each <game ...>...</game> is a hand
  const gameRegex = /<game\b[^>]*>[\s\S]*?<\/game>/g;
  const matches = fileContent.match(gameRegex);
  if (!matches) return [];

  // We need session-level info too, extract it once
  const sessionHeader = fileContent.match(/<session[\s\S]*?<\/general>/)?.[0] || '';
  return matches.map((game) => sessionHeader + '\n' + game);
}

/**
 * Parse a single PMU hand — auto-detects text vs XML.
 */
export function parseHand(rawText: string, heroName?: string): ParsedHand | null {
  if (isXmlFormat(rawText)) {
    return parseHandXml(rawText, heroName);
  }
  return parseHandText(rawText, heroName);
}

// ─── TEXT FORMAT PARSER ───

function parseHandText(rawText: string, heroName?: string): ParsedHand | null {
  try {
    const lines = rawText.split('\n').map((l) => l.trim());

    // Hand ID
    let handId = '';
    for (const line of lines) {
      const m = line.match(P.HEADER);
      if (m) { handId = m[1]; break; }
    }
    if (!handId) return null;

    // Date
    let datetime = new Date();
    for (const line of lines) {
      const m = line.match(P.START_DATE);
      if (m) {
        datetime = parsePmuDate(m[1]);
        break;
      }
    }

    // Table info
    let tournamentId = '';
    let smallBlind = 0;
    let bigBlind = 0;
    let ante = 0;
    let tableName = '';
    for (const line of lines) {
      const m = line.match(P.TABLE_INFO);
      if (m) {
        tableName = m[1];
        tournamentId = m[2];
        smallBlind = parseFloat(m[3]);
        bigBlind = parseFloat(m[4]);
        ante = m[5] ? parseFloat(m[5]) : 0;
        break;
      }
    }

    // Seats
    const players: ParsedPlayer[] = [];
    for (const line of lines) {
      const m = line.match(P.SEAT);
      if (m) {
        players.push({
          seat: parseInt(m[1], 10),
          name: m[2],
          stack: parseFloat(m[3]),
          isHero: heroName ? m[2] === heroName : false,
        });
      }
    }

    // Button
    let buttonSeat = 1;
    for (const line of lines) {
      const m = line.match(P.BUTTON);
      if (m) { buttonSeat = parseInt(m[1], 10); break; }
    }

    // Dealt cards
    let heroCards: [string, string] = ['', ''];
    let detectedHero = heroName || '';
    for (const line of lines) {
      const m = line.match(P.DEALT);
      if (m) {
        detectedHero = m[1];
        heroCards = [m[2], m[3]];
        break;
      }
    }

    if (detectedHero) {
      for (const p of players) {
        p.isHero = p.name === detectedHero;
      }
    }

    // Board
    const board: ParsedHand['board'] = {};
    for (const line of lines) {
      const fm = line.match(P.FLOP);
      if (fm) { board.flop = [fm[1], fm[2], fm[3]]; continue; }
      const tm = line.match(P.TURN);
      if (tm) { board.turn = tm[1]; continue; }
      const rm = line.match(P.RIVER);
      if (rm) { board.river = rm[1]; }
    }

    // Actions
    const actions = parseActionsText(lines);

    // Winners
    const winners: { player: string; amount: number }[] = [];
    for (const line of lines) {
      const m = line.match(P.WINS);
      if (m) {
        winners.push({ player: m[1], amount: parseFloat(m[2]) });
      }
    }

    // Showdown
    const showdownHands: { player: string; cards: [string, string] }[] = [];
    for (const line of lines) {
      const m = line.match(P.SHOWS);
      if (m) {
        showdownHands.push({ player: m[1], cards: [m[2], m[3]] });
      }
    }

    // Total pot — sum of winners
    const pot = winners.reduce((sum, w) => sum + w.amount, 0);

    // Estimate level from blinds
    const level = Math.max(1, Math.floor(bigBlind / 50));

    return {
      handId,
      room: 'pmu',
      tournamentId,
      tournamentName: tableName,
      buyIn: 0, // Not available in hand history, comes from summary
      fee: 0,
      datetime,
      level,
      smallBlind,
      bigBlind,
      ante,
      buttonSeat,
      tableSize: players.length,
      players,
      heroCards,
      board,
      actions,
      pot,
      winners,
      showdownHands,
      rawText,
    };
  } catch {
    return null;
  }
}

function parseActionsText(lines: string[]): ParsedAction[] {
  const actions: ParsedAction[] = [];
  let currentStreet: Street = 'preflop';

  for (const line of lines) {
    // Detect street changes
    if (P.FLOP.test(line)) { currentStreet = 'flop'; continue; }
    if (P.TURN.test(line)) { currentStreet = 'turn'; continue; }
    if (P.RIVER.test(line)) { currentStreet = 'river'; continue; }

    // Blinds and antes
    const sbm = line.match(P.SMALL_BLIND);
    if (sbm) {
      actions.push({ street: 'preflop', player: sbm[2], action: 'post_blind', amount: parseFloat(sbm[3]) });
      continue;
    }
    const bbm = line.match(P.BIG_BLIND);
    if (bbm) {
      actions.push({ street: 'preflop', player: bbm[2], action: 'post_blind', amount: parseFloat(bbm[3]) });
      continue;
    }
    const am = line.match(P.ANTE);
    if (am) {
      actions.push({ street: 'preflop', player: am[2], action: 'post_ante', amount: parseFloat(am[3]) });
      continue;
    }

    // All-in (check before raise/bet/call to avoid partial match)
    const allm = line.match(P.ACTION_ALLIN);
    if (allm) {
      actions.push({ street: currentStreet, player: allm[1], action: 'allin', amount: parseFloat(allm[2]) });
      continue;
    }

    // Raise
    const rm = line.match(P.ACTION_RAISE);
    if (rm) {
      actions.push({ street: currentStreet, player: rm[1], action: 'raise', amount: parseFloat(rm[2]) });
      continue;
    }

    // Call
    const cm = line.match(P.ACTION_CALL);
    if (cm) {
      actions.push({ street: currentStreet, player: cm[1], action: 'call', amount: parseFloat(cm[2]) });
      continue;
    }

    // Bet
    const bm = line.match(P.ACTION_BET);
    if (bm) {
      actions.push({ street: currentStreet, player: bm[1], action: 'bet', amount: parseFloat(bm[2]) });
      continue;
    }

    // Check
    const chm = line.match(P.ACTION_CHECK);
    if (chm) {
      actions.push({ street: currentStreet, player: chm[1], action: 'check' });
      continue;
    }

    // Fold
    const fm = line.match(P.ACTION_FOLD);
    if (fm) {
      actions.push({ street: currentStreet, player: fm[1], action: 'fold' });
      continue;
    }
  }

  return actions;
}

// ─── XML FORMAT PARSER ───

/**
 * Convert PMU card format (SuitRank like "D9", "SK", "HQ") to standard (RankSuit like "9d", "Ks", "Qh").
 * Also handles "X" for unknown cards.
 */
function convertPmuCard(pmuCard: string): string {
  if (!pmuCard || pmuCard === 'X') return '';
  const suitMap: Record<string, string> = { S: 's', H: 'h', D: 'd', C: 'c' };
  const suit = suitMap[pmuCard[0]] || pmuCard[0].toLowerCase();
  const rank = pmuCard.slice(1);
  // Convert rank: "10" -> "T", others stay
  const rankNorm = rank === '10' ? 'T' : rank;
  return rankNorm + suit;
}

/**
 * Parse a number that may contain spaces (e.g. "50 000" -> 50000).
 */
function parseSpacedNumber(str: string): number {
  return parseFloat(str.replace(/\s/g, '')) || 0;
}

function parseHandXml(rawText: string, heroName?: string): ParsedHand | null {
  try {
    // Extract hero name from session general
    let detectedHero = heroName || '';
    const nicknameMatch = rawText.match(/<nickname>(.+?)<\/nickname>/);
    if (nicknameMatch && !detectedHero) {
      detectedHero = nicknameMatch[1];
    }

    // Extract tournament info from session general
    const tournamentNameMatch = rawText.match(/<tournamentname>(.+?)<\/tournamentname>/);
    const tournamentCodeMatch = rawText.match(/<tournamentcode>(.+?)<\/tournamentcode>/);
    const buyinMatch = rawText.match(/<buyin>(.+?)<\/buyin>/);
    const totalBuyinMatch = rawText.match(/<totalbuyin>(.+?)<\/totalbuyin>/);
    const placeMatch = rawText.match(/<place>(\d+)<\/place>/);

    // Extract game code (hand ID)
    const gameCodeMatch = rawText.match(/<game\s+gamecode="(\d+)"/);
    if (!gameCodeMatch) return null;
    const handId = gameCodeMatch[1];

    // Extract session code (tournament ID)
    const sessionMatch = rawText.match(/<session\s+sessioncode="(\d+)"/);
    const tournamentId = tournamentCodeMatch?.[1] || sessionMatch?.[1] || '';

    // Extract date
    const dateMatch = rawText.match(/<game[^>]*>[\s\S]*?<startdate>(.+?)<\/startdate>/);
    const datetime = dateMatch ? new Date(dateMatch[1]) : new Date();

    // Extract blinds from game general
    const sbMatch = rawText.match(/<game[^>]*>[\s\S]*?<smallblind>([\d\s]+)<\/smallblind>/);
    const bbMatch = rawText.match(/<game[^>]*>[\s\S]*?<bigblind>([\d\s]+)<\/bigblind>/);
    const anteMatch = rawText.match(/<game[^>]*>[\s\S]*?<ante>([\d\s]+)<\/ante>/);
    let smallBlind = sbMatch ? parseSpacedNumber(sbMatch[1]) : 0;
    let bigBlind = bbMatch ? parseSpacedNumber(bbMatch[1]) : 0;
    let ante = anteMatch ? parseSpacedNumber(anteMatch[1]) : 0;

    // Extract players — flexible attribute order
    const players: ParsedPlayer[] = [];
    const playerRegex = /<player\s+([^>]+)\/>/g;
    let pm;
    let buttonSeat = 1;
    while ((pm = playerRegex.exec(rawText)) !== null) {
      const attrs = pm[1];
      const seat = parseInt(attrs.match(/seat="(\d+)"/)?.[1] || '0', 10);
      const name = attrs.match(/name="([^"]+)"/)?.[1] || '';
      const chips = parseSpacedNumber(attrs.match(/chips="([^"]+)"/)?.[1] || '0');
      const dealer = attrs.match(/dealer="(\d+)"/)?.[1] || '0';
      const win = parseSpacedNumber(attrs.match(/win="([^"]+)"/)?.[1] || '0');

      if (seat > 0 && name) {
        players.push({
          seat,
          name,
          stack: chips,
          isHero: name === detectedHero,
        });
        if (dealer === '1') buttonSeat = seat;
      }
    }

    // Extract rounds and actions
    const actions: ParsedAction[] = [];
    let heroCards: [string, string] = ['', ''];
    const board: ParsedHand['board'] = {};
    const showdownHands: { player: string; cards: [string, string] }[] = [];

    const roundRegex = /<round\s+no="(\d+)"[^>]*>([\s\S]*?)<\/round>/g;
    let roundMatch;
    while ((roundMatch = roundRegex.exec(rawText)) !== null) {
      const roundNo = parseInt(roundMatch[1], 10);
      const roundContent = roundMatch[2];

      const streetMap: Record<number, Street> = {
        0: 'preflop', 1: 'preflop', 2: 'flop', 3: 'turn', 4: 'river',
      };
      const street = streetMap[roundNo] || 'preflop';

      // Parse board cards from <cards type="Flop/Turn/River">
      const boardCardsMatch = roundContent.match(/<cards\s+type="(Flop|Turn|River)">(.+?)<\/cards>/);
      if (boardCardsMatch) {
        const cardType = boardCardsMatch[1];
        const cardStrs = boardCardsMatch[2].trim().split(/\s+/).map(convertPmuCard).filter(Boolean);
        if (cardType === 'Flop' && cardStrs.length >= 3) {
          board.flop = [cardStrs[0], cardStrs[1], cardStrs[2]] as [string, string, string];
        } else if (cardType === 'Turn' && cardStrs.length >= 1) {
          board.turn = cardStrs[0];
        } else if (cardType === 'River' && cardStrs.length >= 1) {
          board.river = cardStrs[0];
        }
      }

      // Parse pocket cards for all players
      const pocketRegex = /<cards\s+player="([^"]+)"\s+type="Pocket">(.+?)<\/cards>/g;
      let pocketMatch;
      while ((pocketMatch = pocketRegex.exec(roundContent)) !== null) {
        const playerName = pocketMatch[1];
        const cardStrs = pocketMatch[2].trim().split(/\s+/);
        if (cardStrs.length >= 2 && cardStrs[0] !== 'X') {
          const c1 = convertPmuCard(cardStrs[0]);
          const c2 = convertPmuCard(cardStrs[1]);
          if (c1 && c2) {
            if (playerName === detectedHero) {
              heroCards = [c1, c2];
            }
            // Cards visible at showdown (if not hero and not "X X")
            if (playerName !== detectedHero) {
              showdownHands.push({ player: playerName, cards: [c1, c2] });
            }
          }
        }
      }

      // Parse actions — handle spaces in sum
      const actionRegex = /<action\s+no="\d+"\s+player="([^"]+)"\s+sum="([^"]+)"\s+type="(\d+)"\s*\/>/g;
      let am;
      while ((am = actionRegex.exec(roundContent)) !== null) {
        const player = am[1];
        const typeCode = am[3];
        const amount = parseSpacedNumber(am[2]);

        const actionType = P.XML_ACTION_TYPES[typeCode];
        if (actionType) {
          actions.push({
            street,
            player,
            action: actionType as ActionType,
            amount: amount || undefined,
          });
        }
      }
    }

    // Winners from player attributes
    const winners: { player: string; amount: number }[] = [];
    for (const p of players) {
      const winMatch = rawText.match(new RegExp(`name="${p.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*win="([\\d\\s]+)"`));
      if (winMatch) {
        const winAmount = parseSpacedNumber(winMatch[1]);
        if (winAmount > 0) {
          winners.push({ player: p.name, amount: winAmount });
        }
      }
    }

    const pot = winners.reduce((sum, w) => sum + w.amount, 0);

    // Parse buy-in from session
    let buyIn = 0;
    let fee = 0;
    let bounty = 0;
    if (totalBuyinMatch) {
      buyIn = parseFloat(totalBuyinMatch[1].replace(/[€\s]/g, '').replace(',', '.')) || 0;
    }

    return {
      handId,
      room: 'pmu',
      tournamentId,
      tournamentName: tournamentNameMatch?.[1] || '',
      buyIn,
      fee,
      datetime,
      level: Math.max(1, Math.floor(bigBlind / 50)),
      smallBlind,
      bigBlind,
      ante,
      buttonSeat,
      tableSize: players.length,
      players,
      heroCards,
      board,
      actions,
      pot,
      winners,
      showdownHands,
      rawText,
    };
  } catch {
    return null;
  }
}

// ─── UTILS ───

function parsePmuDate(dateStr: string): Date {
  // Format: Mon Jan 15 20:00:00 CET 2024
  try {
    // Remove timezone name for reliable parsing
    const cleaned = dateStr.replace(/\s+(CET|CEST|ET|EST|UTC)\s+/, ' ');
    return new Date(cleaned);
  } catch {
    return new Date();
  }
}

/**
 * Parse a full PMU file containing multiple hands.
 */
export function parseFile(fileContent: string, heroName?: string): { hands: ParsedHand[]; errors: string[] } {
  const rawHands = splitHands(fileContent);
  const hands: ParsedHand[] = [];
  const errors: string[] = [];

  for (let i = 0; i < rawHands.length; i++) {
    const parsed = parseHand(rawHands[i], heroName);
    if (parsed) {
      hands.push(parsed);
    } else {
      errors.push(`Failed to parse hand #${i + 1}`);
    }
  }

  return { hands, errors };
}
