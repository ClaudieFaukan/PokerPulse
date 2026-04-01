import { ParsedHand, ParsedAction, ParsedPlayer, Street } from '../types';
import * as P from './patterns';

/**
 * Split a PokerStars file into individual hand text blocks.
 * Hands are separated by blank lines, each starting with "PokerStars Hand".
 */
export function splitHands(fileContent: string): string[] {
  const hands: string[] = [];
  const lines = fileContent.split('\n');
  let currentHand: string[] = [];

  for (const line of lines) {
    if (line.startsWith('PokerStars Hand') && currentHand.length > 0) {
      hands.push(currentHand.join('\n'));
      currentHand = [line];
    } else {
      currentHand.push(line);
    }
  }

  if (currentHand.length > 0 && currentHand.some((l) => l.startsWith('PokerStars Hand'))) {
    hands.push(currentHand.join('\n'));
  }

  return hands;
}

/**
 * Convert PokerStars roman numeral level to integer.
 */
function parseRomanLevel(roman: string): number {
  // Handle both roman numerals and plain numbers
  const num = parseInt(roman, 10);
  if (!isNaN(num)) return num;

  const romanMap: Record<string, number> = {
    I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000,
  };

  let result = 0;
  const upper = roman.toUpperCase();
  for (let i = 0; i < upper.length; i++) {
    const current = romanMap[upper[i]] || 0;
    const next = romanMap[upper[i + 1]] || 0;
    if (current < next) {
      result -= current;
    } else {
      result += current;
    }
  }
  return result;
}

/**
 * Parse a PokerStars date with timezone handling.
 * Format: "2024/01/15 21:45:00" with CET or ET suffix
 */
function parsePokerStarsDate(dateStr: string, tz?: string): Date {
  const [datePart, timePart] = dateStr.trim().split(/\s+/);
  const [year, month, day] = datePart.split('/');
  const [hour, min, sec] = timePart.split(':');

  const d = new Date(Date.UTC(
    parseInt(year), parseInt(month) - 1, parseInt(day),
    parseInt(hour), parseInt(min), parseInt(sec)
  ));

  // Adjust for timezone offset
  if (tz === 'CET') {
    d.setUTCHours(d.getUTCHours() - 1); // CET = UTC+1
  } else if (tz === 'ET') {
    d.setUTCHours(d.getUTCHours() + 5); // ET = UTC-5
  }
  // UTC stays as-is

  return d;
}

/**
 * Parse a single PokerStars hand history text block.
 */
export function parseHand(rawText: string, heroName?: string): ParsedHand | null {
  try {
    const lines = rawText.split('\n').map((l) => l.trim());

    // Parse header
    const headerLine = lines[0];
    const headerMatch = headerLine.match(P.HEADER);
    if (!headerMatch) return null;

    const [, handId, tournamentId, buyInStr, feeStr, levelRoman, sbStr, bbStr, datetimeStr, tz] = headerMatch;

    const buyIn = parseFloat(buyInStr);
    const fee = parseFloat(feeStr);
    const level = parseRomanLevel(levelRoman);
    const smallBlind = parseFloat(sbStr);
    const bigBlind = parseFloat(bbStr);
    const datetime = parsePokerStarsDate(datetimeStr, tz);

    // Check for ante in header (some formats have SB/BB/Ante)
    let ante = 0;
    const anteHeaderMatch = headerLine.match(P.HEADER_WITH_ANTE);
    if (anteHeaderMatch) {
      ante = parseFloat(anteHeaderMatch[3]);
    }

    // Parse tournament name from table line (use tournament ID as name)
    const tournamentName = `Tournament #${tournamentId}`;

    // Parse table line
    const tableLine = lines.find((l) => l.startsWith('Table'));
    const tableMatch = tableLine?.match(P.TABLE);
    const tableSize = tableMatch ? parseInt(tableMatch[3], 10) : 9;
    const buttonSeat = tableMatch ? parseInt(tableMatch[4], 10) : 1;

    // Parse seats
    const players: ParsedPlayer[] = [];
    for (const line of lines) {
      const seatMatch = line.match(P.SEAT);
      if (seatMatch) {
        players.push({
          seat: parseInt(seatMatch[1], 10),
          name: seatMatch[2],
          stack: parseFloat(seatMatch[3]),
          isHero: heroName ? seatMatch[2] === heroName : false,
        });
      }
    }

    // Detect ante from action lines if not in header
    if (ante === 0) {
      for (const line of lines) {
        const anteMatch = line.match(P.ACTION_ANTE);
        if (anteMatch) {
          ante = parseFloat(anteMatch[2]);
          break;
        }
      }
    }

    // Parse dealt cards
    let heroCards: [string, string] = ['', ''];
    let detectedHero = heroName || '';
    for (const line of lines) {
      const dealtMatch = line.match(P.DEALT);
      if (dealtMatch) {
        detectedHero = dealtMatch[1];
        heroCards = [dealtMatch[2], dealtMatch[3]];
        break;
      }
    }

    // Mark hero in players
    if (detectedHero) {
      for (const p of players) {
        p.isHero = p.name === detectedHero;
      }
    }

    // Parse board
    const board: ParsedHand['board'] = {};
    for (const line of lines) {
      const flopMatch = line.match(P.FLOP);
      if (flopMatch) {
        board.flop = [flopMatch[1], flopMatch[2], flopMatch[3]];
        continue;
      }
      const turnMatch = line.match(P.TURN);
      if (turnMatch) {
        board.turn = turnMatch[1];
        continue;
      }
      const riverMatch = line.match(P.RIVER);
      if (riverMatch) {
        board.river = riverMatch[1];
      }
    }

    // Parse actions
    const actions = parseActions(lines);

    // Parse winners
    const winners: { player: string; amount: number }[] = [];
    for (const line of lines) {
      const collectedMatch = line.match(P.COLLECTED);
      if (collectedMatch) {
        winners.push({
          player: collectedMatch[1],
          amount: parseFloat(collectedMatch[2]),
        });
      }
    }

    // Parse showdown hands
    const showdownHands: { player: string; cards: [string, string] }[] = [];
    for (const line of lines) {
      const showsMatch = line.match(P.SHOWS);
      if (showsMatch) {
        showdownHands.push({
          player: showsMatch[1],
          cards: [showsMatch[2], showsMatch[3]],
        });
      }
    }

    // Parse total pot
    let pot = 0;
    for (const line of lines) {
      const potMatch = line.match(P.TOTAL_POT);
      if (potMatch) {
        pot = parseFloat(potMatch[1]);
        break;
      }
    }

    return {
      handId,
      room: 'pokerstars',
      tournamentId,
      tournamentName,
      buyIn,
      fee,
      datetime,
      level,
      smallBlind,
      bigBlind,
      ante,
      buttonSeat,
      tableSize,
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

/**
 * Parse all actions from the hand, organized by street.
 */
function parseActions(lines: string[]): ParsedAction[] {
  const actions: ParsedAction[] = [];
  let currentStreet: Street | null = null;
  let inSummary = false;

  for (const line of lines) {
    // Detect section changes
    const sectionMatch = line.match(P.SECTION);
    if (sectionMatch) {
      const section = sectionMatch[1].toUpperCase();
      if (section === 'HOLE CARDS') {
        currentStreet = 'preflop';
      } else if (section.startsWith('FLOP')) {
        currentStreet = 'flop';
      } else if (section.startsWith('TURN')) {
        currentStreet = 'turn';
      } else if (section.startsWith('RIVER')) {
        currentStreet = 'river';
      } else if (section === 'SHOW DOWN' || section === 'SUMMARY') {
        inSummary = true;
        currentStreet = null;
      }
      continue;
    }

    // Antes are before HOLE CARDS section — treat as preflop
    if (!currentStreet && !inSummary) {
      // Parse ante
      const anteMatch = line.match(P.ACTION_ANTE);
      if (anteMatch) {
        actions.push({
          street: 'preflop',
          player: anteMatch[1],
          action: 'post_ante',
          amount: parseFloat(anteMatch[2]),
        });
        continue;
      }

      // Parse small blind
      const sbMatch = line.match(P.ACTION_BLIND_SB);
      if (sbMatch) {
        actions.push({
          street: 'preflop',
          player: sbMatch[1],
          action: 'post_blind',
          amount: parseFloat(sbMatch[2]),
        });
        continue;
      }

      // Parse big blind
      const bbMatch = line.match(P.ACTION_BLIND_BB);
      if (bbMatch) {
        actions.push({
          street: 'preflop',
          player: bbMatch[1],
          action: 'post_blind',
          amount: parseFloat(bbMatch[2]),
        });
        continue;
      }
    }

    if (!currentStreet || inSummary) continue;

    const isAllin = P.ALLIN_MARKER.test(line);

    // Parse raise
    const raiseMatch = line.match(P.ACTION_RAISE);
    if (raiseMatch) {
      actions.push({
        street: currentStreet,
        player: raiseMatch[1],
        action: isAllin ? 'allin' : 'raise',
        amount: parseFloat(raiseMatch[3]), // "to" amount = total
      });
      continue;
    }

    // Parse call
    const callMatch = line.match(P.ACTION_CALL);
    if (callMatch) {
      actions.push({
        street: currentStreet,
        player: callMatch[1],
        action: isAllin ? 'allin' : 'call',
        amount: parseFloat(callMatch[2]),
      });
      continue;
    }

    // Parse bet
    const betMatch = line.match(P.ACTION_BET);
    if (betMatch) {
      actions.push({
        street: currentStreet,
        player: betMatch[1],
        action: isAllin ? 'allin' : 'bet',
        amount: parseFloat(betMatch[2]),
      });
      continue;
    }

    // Parse check
    const checkMatch = line.match(P.ACTION_CHECK);
    if (checkMatch) {
      actions.push({
        street: currentStreet,
        player: checkMatch[1],
        action: 'check',
      });
      continue;
    }

    // Parse fold
    const foldMatch = line.match(P.ACTION_FOLD);
    if (foldMatch) {
      actions.push({
        street: currentStreet,
        player: foldMatch[1],
        action: 'fold',
      });
      continue;
    }
  }

  return actions;
}

/**
 * Parse a full PokerStars file containing multiple hands.
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
