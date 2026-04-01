import { ParsedHand, ParsedTournamentSummary, Street, ActionType, ParsedAction, ParsedPlayer } from '../types';
import * as P from './patterns';

/**
 * Split a file content into individual hand text blocks.
 */
export function splitHands(fileContent: string): string[] {
  const hands: string[] = [];
  const lines = fileContent.split('\n');
  let currentHand: string[] = [];

  for (const line of lines) {
    if (line.startsWith('Winamax Poker - ') && currentHand.length > 0) {
      hands.push(currentHand.join('\n'));
      currentHand = [line];
    } else {
      currentHand.push(line);
    }
  }

  if (currentHand.length > 0 && currentHand.some((l) => l.startsWith('Winamax Poker'))) {
    hands.push(currentHand.join('\n'));
  }

  return hands;
}

/**
 * Parse a single Winamax hand history text block into a ParsedHand.
 */
export function parseHand(rawText: string, heroName?: string): ParsedHand | null {
  try {
    const lines = rawText.split('\n').map((l) => l.trim());

    // Parse header
    const headerLine = lines[0];
    const headerMatch = headerLine.match(P.HEADER);
    if (!headerMatch) return null;

    const [, tournamentName, buyInStr, feeStr, levelStr, handId, val1Str, val2Str, val3Str, datetimeStr] = headerMatch;

    const buyIn = parseFloat(buyInStr.replace(',', '.'));
    const fee = parseFloat(feeStr.replace(',', '.'));
    const level = parseInt(levelStr, 10);

    // Winamax format: (SB/BB) when no ante, (Ante/SB/BB) when ante exists
    let smallBlind: number;
    let bigBlind: number;
    let ante: number;
    if (val3Str) {
      // 3 values: Ante/SB/BB
      ante = parseFloat(val1Str);
      smallBlind = parseFloat(val2Str);
      bigBlind = parseFloat(val3Str);
    } else {
      // 2 values: SB/BB
      smallBlind = parseFloat(val1Str);
      bigBlind = parseFloat(val2Str);
      ante = 0;
    }
    const datetime = parseWinamaxDate(datetimeStr);

    // Parse table line — extract real tournament ID from table name
    // Table: 'Monster Stack(1063515057)#026' 6-max (real money) Seat #1 is the button
    const tableLine = lines.find((l) => l.startsWith('Table:'));
    const tableMatch = tableLine?.match(P.TABLE);
    const tableSize = tableMatch ? parseInt(tableMatch[3], 10) : 9;
    const buttonSeat = tableMatch ? parseInt(tableMatch[4], 10) : 1;

    // Tournament ID: prefer the one from table line (e.g. 1063515057), fallback to handId first segment
    const tournamentId = tableMatch?.[2] || handId.split('-')[0] || handId;

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

    // Mark hero in players if not already done
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

    // Parse actions by section
    const actions = parseActions(lines, detectedHero);

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
      room: 'winamax',
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
function parseActions(lines: string[], heroName: string): ParsedAction[] {
  const actions: ParsedAction[] = [];
  let currentStreet: Street | null = null;
  let inSummary = false;

  for (const line of lines) {
    // Detect section changes
    const sectionMatch = line.match(P.SECTION);
    if (sectionMatch) {
      const section = sectionMatch[1].toUpperCase();
      if (section === 'ANTE/BLINDS' || section === 'PRE-FLOP') {
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

    if (!currentStreet || inSummary) continue;

    // Parse ante
    const anteMatch = line.match(P.ACTION_ANTE);
    if (anteMatch) {
      actions.push({
        street: currentStreet,
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
        street: currentStreet,
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
        street: currentStreet,
        player: bbMatch[1],
        action: 'post_blind',
        amount: parseFloat(bbMatch[2]),
      });
      continue;
    }

    // Parse raise (must be before bet/call to avoid partial matches)
    const raiseMatch = line.match(P.ACTION_RAISE);
    if (raiseMatch) {
      const totalAmount = parseFloat(raiseMatch[3]);
      // Check if this is an all-in raise
      const isAllin = line.includes('all-in');
      actions.push({
        street: currentStreet,
        player: raiseMatch[1],
        action: isAllin ? 'allin' : 'raise',
        amount: totalAmount,
      });
      continue;
    }

    // Parse call
    const callMatch = line.match(P.ACTION_CALL);
    if (callMatch) {
      const isAllin = line.includes('all-in');
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
      const isAllin = line.includes('all-in');
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
 * Parse Winamax date format: "2024/01/15 20:30:00" UTC
 */
function parseWinamaxDate(dateStr: string): Date {
  // Format: 2024/01/15 20:30:00
  const [datePart, timePart] = dateStr.split(' ');
  const [year, month, day] = datePart.split('/');
  const [hour, min, sec] = timePart.split(':');
  return new Date(Date.UTC(
    parseInt(year), parseInt(month) - 1, parseInt(day),
    parseInt(hour), parseInt(min), parseInt(sec)
  ));
}

/**
 * Parse a full Winamax file containing multiple hands.
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
