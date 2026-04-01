import { ParsedTournamentSummary, TournamentType, Speed } from '../types';

/**
 * Parse a Winamax tournament summary file.
 * Real format example:
 *   Winamax Poker - Tournament summary : SUNDAY SURPRISE(1079728573)
 *   Player : ForgeMage
 *   Buy-In : 5€ + 4€ + 1€         (buy-in + bounty + fee) for KO
 *   Buy-In : 4.50€ + 0.50€         (buy-in + fee) for normal
 *   Registered players : 11141
 *   Type : knockout | normal | flight
 *   Speed : normal | turbo
 *   Prizepool : 82265€
 *   Tournament started 2026/03/22 19:00:04 UTC
 *   You finished in 2665th place
 *   You won 14.04€                  (ITM prize)
 *   You won Bounty 43.74€           (bounty winnings)
 */
export function parseSummary(fileContent: string): ParsedTournamentSummary | null {
  try {
    // Some files contain multiple summary blocks (e.g. Late Registration + final result).
    // The last block holds the definitive tournament result, so we parse only that one.
    const blocks = fileContent.split(/(?=Winamax Poker - Tournament summary\s*:)/);
    const lastBlock = blocks[blocks.length - 1];
    const lines = lastBlock.split('\n').map((l) => l.trim());
    const fullText = lastBlock;

    // Tournament name + ID from header
    // "Winamax Poker - Tournament summary : SUNDAY SURPRISE(1079728573)"
    const headerMatch = fullText.match(/Tournament summary\s*:\s*(.+?)(?:\((\d+)\))?$/m);
    let tournamentName = '';
    let tournamentId = '';
    if (headerMatch) {
      tournamentName = headerMatch[1].trim();
      tournamentId = headerMatch[2] || '';
    }
    if (!tournamentName && !tournamentId) return null;

    // Also try to extract ID from name if embedded
    if (!tournamentId) {
      const idInName = tournamentName.match(/\((\d+)\)/);
      if (idInName) {
        tournamentId = idInName[1];
        tournamentName = tournamentName.replace(/\(\d+\)/, '').trim();
      }
    }

    // Buy-In: handles 2-part (normal) and 3-part (KO)
    // "Buy-In : 5€ + 4€ + 1€" → buyIn=5, bounty=4, fee=1
    // "Buy-In : 4.50€ + 0.50€" → buyIn=4.50, fee=0.50
    let buyIn = 0;
    let fee = 0;
    let bounty = 0;
    for (const line of lines) {
      const buyInMatch = line.match(/^Buy-In\s*:\s*([\d.,]+)€?\s*\+\s*([\d.,]+)€?(?:\s*\+\s*([\d.,]+)€?)?/);
      if (buyInMatch) {
        if (buyInMatch[3]) {
          // 3-part: buy-in + bounty + fee
          buyIn = parseFloat(buyInMatch[1].replace(',', '.'));
          bounty = parseFloat(buyInMatch[2].replace(',', '.'));
          fee = parseFloat(buyInMatch[3].replace(',', '.'));
        } else {
          // 2-part: buy-in + fee
          buyIn = parseFloat(buyInMatch[1].replace(',', '.'));
          fee = parseFloat(buyInMatch[2].replace(',', '.'));
        }
        break;
      }
    }

    // Registered players
    let totalPlayers = 0;
    for (const line of lines) {
      const m = line.match(/^Registered players\s*:\s*(\d+)/);
      if (m) { totalPlayers = parseInt(m[1], 10); break; }
    }

    // Prizepool (no space in real files)
    let prizePool = 0;
    for (const line of lines) {
      const m = line.match(/^Prizepool\s*:\s*([\d.,]+)/);
      if (m) { prizePool = parseFloat(m[1].replace(',', '.')); break; }
    }

    // Tournament started
    let startTime = new Date();
    for (const line of lines) {
      const m = line.match(/^Tournament started\s+(\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2})\s*UTC/);
      if (m) { startTime = parseWinamaxDate(m[1]); break; }
    }

    // Finish position
    let heroFinishPosition = 0;
    for (const line of lines) {
      const m = line.match(/^You finished in (\d+)/);
      if (m) { heroFinishPosition = parseInt(m[1], 10); break; }
    }

    // Parse winnings from "You won" line
    // Formats:
    //   "You won 14.04€"                    — ITM only
    //   "You won Bounty 43.74€"             — bounty only (no ITM)
    //   "You won 2.05€ + Bounty 3.50€"      — ITM + bounty combined
    let heroPrize = 0;
    let heroBountiesWon = 0;
    for (const line of lines) {
      if (!line.startsWith('You won')) continue;

      // Combined: "You won 2.05€ + Bounty 3.50€"
      const combinedMatch = line.match(/^You won ([\d.,]+)€\s*\+\s*Bounty\s*([\d.,]+)€/);
      if (combinedMatch) {
        heroPrize = parseFloat(combinedMatch[1].replace(',', '.'));
        heroBountiesWon = parseFloat(combinedMatch[2].replace(',', '.'));
        break;
      }

      // Bounty only: "You won Bounty 43.74€"
      const bountyMatch = line.match(/^You won Bounty\s*([\d.,]+)€/);
      if (bountyMatch) {
        heroBountiesWon = parseFloat(bountyMatch[1].replace(',', '.'));
        break;
      }

      // ITM only: "You won 14.04€"
      const itmMatch = line.match(/^You won ([\d.,]+)€/);
      if (itmMatch) {
        heroPrize = parseFloat(itmMatch[1].replace(',', '.'));
        break;
      }
    }

    // Type
    let typeStr = '';
    for (const line of lines) {
      const m = line.match(/^Type\s*:\s*(.+)/);
      if (m) { typeStr = m[1].trim().toLowerCase(); break; }
    }

    // Speed
    let speedStr = '';
    for (const line of lines) {
      const m = line.match(/^Speed\s*:\s*(.+)/);
      if (m) { speedStr = m[1].trim().toLowerCase(); break; }
    }

    // Determine tournament type
    let tournamentType: TournamentType = 'MTT';
    const nameLower = tournamentName.toLowerCase();
    if (/spin|expresso/i.test(nameLower)) tournamentType = 'SPIN';
    else if (/satellite|qualifier/i.test(nameLower)) tournamentType = 'SAT';
    else if (/sit.*go|sng/i.test(nameLower)) tournamentType = 'SNG';

    // Determine speed
    let speed: Speed = 'regular';
    if (speedStr === 'turbo' || /turbo/i.test(nameLower)) speed = 'turbo';
    if (/hyper/i.test(speedStr) || /hyper/i.test(nameLower)) speed = 'hyper-turbo';

    const isKnockout = typeStr === 'knockout' || bounty > 0 || /ko|knockout|bounty/i.test(nameLower);
    const isRebuy = /re-?buy/i.test(fullText);

    // Total prize = ITM prize + bounties
    // hero_prize stores total winnings (ITM + bounties combined)
    const totalHeroPrize = heroPrize + heroBountiesWon;

    return {
      room: 'winamax',
      tournamentId,
      tournamentName,
      buyIn,
      fee,
      bounty: bounty > 0 ? bounty : undefined,
      prizePool,
      totalPlayers,
      startTime,
      endTime: startTime, // End time not always available
      heroFinishPosition,
      heroPrize: totalHeroPrize,
      heroBountiesWon: heroBountiesWon > 0 ? heroBountiesWon : undefined,
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

function parseWinamaxDate(dateStr: string): Date {
  const [datePart, timePart] = dateStr.split(' ');
  const [year, month, day] = datePart.split('/');
  const [hour, min, sec] = timePart.split(':');
  return new Date(Date.UTC(
    parseInt(year), parseInt(month) - 1, parseInt(day),
    parseInt(hour), parseInt(min), parseInt(sec)
  ));
}
