import { ParsedTournamentSummary, TournamentType, Speed } from '../types';

/**
 * Extract tournament summary info from a PMU/iPoker XML session file.
 * PMU stores all info (place, win, buyin) in the <session>/<general> block.
 */
export function parseSessionSummary(fileContent: string): ParsedTournamentSummary | null {
  try {
    // Only parse XML files with session tag
    if (!fileContent.includes('<session')) return null;

    // Extract session-level general block (before any <game>)
    const generalMatch = fileContent.match(/<session[^>]*>[\s\S]*?<general>([\s\S]*?)<\/general>/);
    if (!generalMatch) return null;
    const general = generalMatch[1];

    const get = (tag: string): string => {
      const m = general.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
      return m ? m[1].trim() : '';
    };

    const tournamentName = get('tournamentname');
    const tournamentCode = get('tournamentcode');
    const nickname = get('nickname');
    const placeStr = get('place');
    const winStr = get('win');
    const buyinStr = get('buyin');
    const totalBuyinStr = get('totalbuyin');
    const startDateStr = get('startdate');
    const tablesize = get('tablesize');

    // Session code = our tournament ID
    const sessionMatch = fileContent.match(/<session\s+sessioncode="(\d+)"/);
    const sessionCode = sessionMatch?.[1] || '';

    // Tournament ID: prefer tournamentcode, fallback to sessioncode
    const tournamentId = tournamentCode || sessionCode;
    if (!tournamentId) return null;

    // Parse place
    let heroFinishPosition = placeStr && placeStr !== 'N/A' ? parseInt(placeStr, 10) || 0 : 0;

    // Parse win amount: "14,72€" or "0" or "N/A"
    let heroPrize = 0;
    if (winStr && winStr !== 'N/A' && winStr !== '0') {
      heroPrize = parseFloat(winStr.replace(/[€\s]/g, '').replace(',', '.')) || 0;
    }

    // Parse total buyin: "2€"
    let totalCost = 0;
    if (totalBuyinStr) {
      totalCost = parseFloat(totalBuyinStr.replace(/[€\s]/g, '').replace(',', '.')) || 0;
    }

    // Parse buyin detail: "1,10€ + 0,70€ + 0,20€" or "4,50€ + 0,50€"
    let buyIn = 0;
    let fee = 0;
    let bounty = 0;
    if (buyinStr) {
      const parts = buyinStr.split('+').map((s) => parseFloat(s.replace(/[€\s]/g, '').replace(',', '.')) || 0);
      if (parts.length === 3) {
        buyIn = parts[0];
        bounty = parts[1];
        fee = parts[2];
      } else if (parts.length === 2) {
        buyIn = parts[0];
        fee = parts[1];
      } else if (parts.length === 1) {
        buyIn = parts[0];
      }
    }

    // Detect hero rebuys and addons from player attributes
    // The max rebuy/addon value across all hands = total rebuys/addons for the session
    let heroRebuys = 0;
    let heroAddons = 0;
    if (nickname) {
      const escapedName = nickname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const heroPlayerRegex = new RegExp(`name="${escapedName}"[^>]*rebuy="(\\d+)"`, 'g');
      let hpm;
      while ((hpm = heroPlayerRegex.exec(fileContent)) !== null) {
        heroRebuys = Math.max(heroRebuys, parseInt(hpm[1], 10) || 0);
      }
      const heroAddonRegex = new RegExp(`name="${escapedName}"[^>]*addon="(\\d+)"`, 'g');
      while ((hpm = heroAddonRegex.exec(fileContent)) !== null) {
        heroAddons = Math.max(heroAddons, parseInt(hpm[1], 10) || 0);
      }
    }

    // If totalbuyin doesn't match sum, trust totalbuyin
    if (totalCost > 0 && Math.abs(totalCost - (buyIn + bounty + fee)) > 0.01) {
      // Use totalbuyin as the real cost, approximate the split
      buyIn = totalCost - bounty - fee;
      if (buyIn < 0) buyIn = totalCost;
    }

    // Determine tournament type from name
    let tournamentType: TournamentType = 'MTT';
    const nameLower = tournamentName.toLowerCase();
    if (/twister|spin/i.test(nameLower)) tournamentType = 'SPIN';
    else if (/satellite|qualifier/i.test(nameLower)) tournamentType = 'SAT';
    else if (/sit.*go|sng/i.test(nameLower)) tournamentType = 'SNG';

    let speed: Speed = 'regular';
    if (/turbo/i.test(nameLower)) speed = 'turbo';
    if (/hyper/i.test(nameLower)) speed = 'hyper-turbo';

    const isKnockout = bounty > 0 || /ko|knockout|bounty|mystery/i.test(nameLower);
    const isRebuy = /re-?buy/i.test(nameLower) || heroRebuys > 0;

    // Note: PMU rebuy attribute is boolean (0/1), not a count.
    // Cannot reliably determine number of rebuys from the XML.
    // Users should use the "effective cost" override for rebuy tournaments.

    const startTime = startDateStr ? new Date(startDateStr) : new Date();

    // Extract total players for single-table tournaments (Twister/SNG)
    // For MTTs, table players ≠ tournament field — leave as 0
    let totalPlayers = 0;
    const isSingleTable = tournamentType === 'SPIN' || tournamentType === 'SNG';

    if (isSingleTable) {
      const firstGameMatch = fileContent.match(/<game\s+gamecode[^>]*>[\s\S]*?<players>([\s\S]*?)<\/players>/);
      if (firstGameMatch) {
        const firstGamePlayers = firstGameMatch[1].match(/<player\s/g);
        if (firstGamePlayers) totalPlayers = firstGamePlayers.length;
      }
    }

    // For N/A position on single-table tournaments: infer from last hand if hero busted
    if (heroFinishPosition === 0 && nickname && isSingleTable && totalPlayers > 0) {
      const inferredPos = inferPositionFromLastHand(fileContent, nickname, totalPlayers);
      if (inferredPos > 0) heroFinishPosition = inferredPos;
    }

    return {
      room: 'pmu',
      tournamentId,
      tournamentName,
      buyIn,
      fee,
      bounty: bounty > 0 ? bounty : undefined,
      prizePool: 0, // Not available in PMU XML
      totalPlayers,
      startTime,
      endTime: startTime,
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

/**
 * For Twisters/SNGs where PMU wrote N/A, infer finish position from last hand.
 * If hero ends with 0 chips, they busted — position = players remaining in that hand.
 */
function inferPositionFromLastHand(fileContent: string, heroName: string, totalPlayers: number): number {
  // Only infer for small tournaments (Twister/SNG)
  if (totalPlayers === 0 || totalPlayers > 10) return 0;

  // Find the last game block
  const gameBlocks = fileContent.split(/<game\s+gamecode/);
  if (gameBlocks.length < 2) return 0;

  const lastGame = gameBlocks[gameBlocks.length - 1];
  const playersBlock = lastGame.match(/<players>([\s\S]*?)<\/players>/);
  if (!playersBlock) return 0;

  const escapedName = heroName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Attributes can be in any order (alphabetical in PMU: bet, chips, ..., name, ..., win)
  const heroPattern = new RegExp(
    `<player\\s[^/]*name="${escapedName}"[^/]*/>`
  );
  const heroLine = playersBlock[1].match(heroPattern);
  if (!heroLine) return 0;

  const chipsM = heroLine[0].match(/chips="([\d\s]+)"/);
  const betM = heroLine[0].match(/bet="([\d\s]+)"/);
  const winM = heroLine[0].match(/win="([\d\s]+)"/);
  const heroMatch = chipsM && betM && winM ? [null, chipsM[1], betM[1], winM[1]] : null;
  if (!heroMatch) return 0;

  const chips = parseInt(heroMatch[1]!.replace(/\s/g, ''), 10) || 0;
  const bet = parseInt(heroMatch[2]!.replace(/\s/g, ''), 10) || 0;
  const win = parseInt(heroMatch[3]!.replace(/\s/g, ''), 10) || 0;
  const endChips = chips - bet + win;

  if (endChips > 0) return 0; // Hero didn't bust — can't determine position

  // Hero busted: count players in this hand = players remaining when hero busted
  const playerLines = playersBlock[1].match(/<player\s/g);
  return playerLines ? playerLines.length : 0;
}
