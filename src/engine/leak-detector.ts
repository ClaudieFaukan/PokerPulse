import { ParsedHand, ParsedAction } from '../parsers/types';

export interface LeakFlag {
  handId: string;
  severity: 'info' | 'warning' | 'error';
  category: string;
  description: string;
  suggestion: string;
}

/**
 * Run all leak detection rules on a set of hands for the hero.
 */
export function detectLeaks(hands: ParsedHand[], heroName: string): LeakFlag[] {
  const flags: LeakFlag[] = [];

  for (const hand of hands) {
    const hero = hand.players.find((p) => p.name === heroName);
    if (!hero) continue;

    const position = getPosition(hand, heroName);
    const preflopActions = hand.actions.filter((a) => a.street === 'preflop');
    const heroPreflop = preflopActions.filter(
      (a) => a.player === heroName && !['post_blind', 'post_ante'].includes(a.action)
    );
    const heroCards = hand.heroCards.join(' ');

    // ─── PREFLOP LEAKS ───

    // 1. Open Limp
    checkOpenLimp(hand, heroName, position, preflopActions, heroPreflop, heroCards, flags);

    // 2. Fold BB with good pot odds
    checkFoldBBGoodOdds(hand, heroName, position, preflopActions, heroPreflop, heroCards, flags);

    // 3. Missed steal in late position
    checkMissedSteal(hand, heroName, position, preflopActions, heroPreflop, heroCards, flags);

    // 4. Wide UTG open
    checkWideUTGOpen(hand, heroName, position, heroPreflop, heroCards, flags);

    // 5. No 3-bet with premiums
    checkNo3BetPremiums(hand, heroName, preflopActions, heroPreflop, heroCards, flags);

    // 6. Flat call 3-bet OOP
    checkFlat3BetOOP(hand, heroName, position, preflopActions, heroPreflop, heroCards, flags);

    // ─── POSTFLOP LEAKS ───

    const flopActions = hand.actions.filter((a) => a.street === 'flop');
    const heroSawFlop = flopActions.some((a) => a.player === heroName);

    if (heroSawFlop) {
      // 7. Missed c-bet on dry board
      checkMissedCbetDryBoard(hand, heroName, preflopActions, flopActions, heroCards, flags);

      // 8. Check-fold after being PFR aggressor
      checkCheckFoldAfterPFR(hand, heroName, preflopActions, flopActions, heroCards, flags);

      // 9. Min-bet suspect
      checkMinBet(hand, heroName, flags);

      // 10. Passive with strong hand
      checkPassiveStrongHand(hand, heroName, heroCards, flags);
    }

    // ─── TOURNAMENT LEAKS ───
    // 11 & 12 require tournament context (players remaining, bubble) — simplified versions

    // 11. Fold too tight late tournament (simplified: check if hero folded many hands in a row)
    // This is tracked across hands, handled separately below

    // 12. Call too light on bubble (simplified)
  }

  return flags;
}

// ─── RULE IMPLEMENTATIONS ───

function checkOpenLimp(
  hand: ParsedHand, heroName: string, position: string,
  preflopActions: ParsedAction[], heroPreflop: ParsedAction[],
  heroCards: string, flags: LeakFlag[]
) {
  if (heroPreflop.length === 0 || heroPreflop[0].action !== 'call') return;

  // Check if folded to hero (open limp)
  const isFoldedTo = preflopActions.every((a) => {
    if (a.player === heroName) return true;
    if (['post_blind', 'post_ante'].includes(a.action)) return true;
    return a.action === 'fold';
  });

  if (!isFoldedTo) return;

  // Exception: SB limp when folded to (can be acceptable)
  if (position === 'SB') return;

  flags.push({
    handId: hand.handId,
    severity: 'warning',
    category: 'Open Limp',
    description: `Open limp avec ${heroCards} en ${position}.`,
    suggestion: `Vous avez limpé ${heroCards} en ${position}. En règle générale, il vaut mieux ouvrir en raise ou fold.`,
  });
}

function checkFoldBBGoodOdds(
  hand: ParsedHand, heroName: string, position: string,
  preflopActions: ParsedAction[], heroPreflop: ParsedAction[],
  heroCards: string, flags: LeakFlag[]
) {
  if (position !== 'BB') return;
  if (!heroPreflop.some((a) => a.action === 'fold')) return;

  // Count callers and pot size to estimate odds
  const callers = preflopActions.filter(
    (a) => a.action === 'call' && a.player !== heroName
  ).length;
  const raisers = preflopActions.filter(
    (a) => ['raise', 'allin'].includes(a.action) && a.player !== heroName
  ).length;

  // If there are 2+ callers after a raise, pot odds are likely good
  if (raisers >= 1 && callers >= 2) {
    const potEstimate = hand.bigBlind + (raisers * hand.bigBlind * 2.5) + (callers * hand.bigBlind * 2.5);
    const toCall = hand.bigBlind * 1.5; // rough estimate
    const odds = potEstimate / toCall;

    if (odds >= 3) {
      flags.push({
        handId: hand.handId,
        severity: 'warning',
        category: 'Fold BB bonnes cotes',
        description: `Fold ${heroCards} en BB avec des cotes d'environ ${odds.toFixed(1)}:1.`,
        suggestion: `Vous avez fold ${heroCards} en BB alors que vous aviez des cotes d'environ ${odds.toFixed(1)}:1. Avec ces cotes, presque toutes les mains sont rentables à défendre.`,
      });
    }
  }
}

function checkMissedSteal(
  hand: ParsedHand, heroName: string, position: string,
  preflopActions: ParsedAction[], heroPreflop: ParsedAction[],
  heroCards: string, flags: LeakFlag[]
) {
  if (!['CO', 'BTN'].includes(position)) return;
  if (!heroPreflop.some((a) => a.action === 'fold')) return;

  // Check if folded to hero
  const foldedTo = isFoldedToPlayer(preflopActions, heroName);
  if (!foldedTo) return;

  // Check if hand is in top 40% (simplified: any hand with a card >= T or a pair)
  if (isPlayableStealHand(hand.heroCards)) {
    flags.push({
      handId: hand.handId,
      severity: 'info',
      category: 'Steal manqué',
      description: `Fold ${heroCards} au ${position} avec fold devant.`,
      suggestion: `Spot de steal manqué. Vous avez fold ${heroCards} au ${position} avec fold devant. C'est un open raise standard.`,
    });
  }
}

function checkWideUTGOpen(
  hand: ParsedHand, heroName: string, position: string,
  heroPreflop: ParsedAction[], heroCards: string, flags: LeakFlag[]
) {
  if (position !== 'UTG') return;
  if (!heroPreflop.some((a) => ['raise', 'allin'].includes(a.action))) return;

  // Check if hand is outside top 15%
  if (!isTop15Hand(hand.heroCards)) {
    flags.push({
      handId: hand.handId,
      severity: 'info',
      category: 'Open UTG trop large',
      description: `Open raise UTG avec ${heroCards}.`,
      suggestion: `Open UTG avec ${heroCards} est potentiellement trop large. Le range standard UTG est d'environ 12-15%.`,
    });
  }
}

function checkNo3BetPremiums(
  hand: ParsedHand, heroName: string,
  preflopActions: ParsedAction[], heroPreflop: ParsedAction[],
  heroCards: string, flags: LeakFlag[]
) {
  // Check if hero has QQ+/AKs
  if (!isPremiumHand(hand.heroCards)) return;

  // Check if there was an open raise before hero
  let raisesBefore = 0;
  for (const a of preflopActions) {
    if (a.player === heroName) break;
    if (['raise', 'allin'].includes(a.action)) raisesBefore++;
  }

  if (raisesBefore !== 1) return; // Need exactly one raise (open raise)

  // Hero should 3-bet, check if they only called
  if (heroPreflop.some((a) => a.action === 'call') && !heroPreflop.some((a) => ['raise', 'allin'].includes(a.action))) {
    flags.push({
      handId: hand.handId,
      severity: 'warning',
      category: 'Pas de 3-bet premium',
      description: `Flat call avec ${heroCards} face à un open raise.`,
      suggestion: `Vous avez seulement call avec ${heroCards} face à un open. Les mains premium doivent presque toujours être 3-bet.`,
    });
  }
}

function checkFlat3BetOOP(
  hand: ParsedHand, heroName: string, position: string,
  preflopActions: ParsedAction[], heroPreflop: ParsedAction[],
  heroCards: string, flags: LeakFlag[]
) {
  // OOP = hero will be out of position postflop (not BTN, not last to act)
  if (position === 'BTN') return;

  // Check if facing a 3-bet (2 raises before hero)
  let raisesBefore = 0;
  for (const a of preflopActions) {
    if (a.player === heroName) break;
    if (['raise', 'allin'].includes(a.action)) raisesBefore++;
  }

  if (raisesBefore < 2) return;

  // Hero calls (flat)
  if (heroPreflop.some((a) => a.action === 'call')) {
    flags.push({
      handId: hand.handId,
      severity: 'warning',
      category: 'Flat call 3-bet OOP',
      description: `Flat call d'un 3-bet OOP avec ${heroCards} en ${position}.`,
      suggestion: `Flat call d'un 3-bet OOP avec ${heroCards}. C'est souvent un spot de 4-bet ou fold plutôt que de flat OOP.`,
    });
  }
}

function checkMissedCbetDryBoard(
  hand: ParsedHand, heroName: string,
  preflopActions: ParsedAction[], flopActions: ParsedAction[],
  heroCards: string, flags: LeakFlag[]
) {
  // Was hero the preflop aggressor?
  const wasAggressor = getLastRaiser(preflopActions) === heroName;
  if (!wasAggressor) return;

  // Is it heads-up on flop?
  const flopPlayers = new Set(flopActions.map((a) => a.player));
  if (flopPlayers.size > 2) return; // Only flag HU pots

  // Did hero check instead of c-bet?
  const heroFlopActions = flopActions.filter((a) => a.player === heroName);
  if (!heroFlopActions.some((a) => a.action === 'check')) return;
  if (heroFlopActions.some((a) => ['bet', 'raise', 'allin'].includes(a.action))) return;

  // Is board dry?
  if (hand.board.flop && isDryBoard(hand.board.flop)) {
    const boardStr = hand.board.flop.join(' ');
    flags.push({
      handId: hand.handId,
      severity: 'info',
      category: 'C-bet manqué board sec',
      description: `Check au flop [${boardStr}] après avoir ouvert preflop.`,
      suggestion: `Board très favorable pour un c-bet. [${boardStr}] est sec et vous étiez l'agresseur preflop.`,
    });
  }
}

function checkCheckFoldAfterPFR(
  hand: ParsedHand, heroName: string,
  preflopActions: ParsedAction[], flopActions: ParsedAction[],
  heroCards: string, flags: LeakFlag[]
) {
  const wasAggressor = getLastRaiser(preflopActions) === heroName;
  if (!wasAggressor) return;

  const heroFlopActions = flopActions.filter((a) => a.player === heroName);
  const hasCheck = heroFlopActions.some((a) => a.action === 'check');
  const hasFold = heroFlopActions.some((a) => a.action === 'fold');

  if (hasCheck && hasFold) {
    const boardStr = hand.board.flop ? hand.board.flop.join(' ') : '';
    flags.push({
      handId: hand.handId,
      severity: 'info',
      category: 'Check-fold après PFR',
      description: `Check-fold au flop [${boardStr}] après avoir ouvert preflop avec ${heroCards}.`,
      suggestion: `Vous avez check-fold le flop après avoir ouvert preflop. Envisagez un c-bet ou un check-call avec ${heroCards} sur [${boardStr}].`,
    });
  }
}

function checkMinBet(hand: ParsedHand, heroName: string, flags: LeakFlag[]) {
  const postflopActions = hand.actions.filter(
    (a) => a.street !== 'preflop' && a.player === heroName && a.action === 'bet'
  );

  for (const action of postflopActions) {
    if (action.amount && action.amount <= hand.bigBlind && hand.pot > hand.bigBlind * 5) {
      flags.push({
        handId: hand.handId,
        severity: 'info',
        category: 'Min-bet suspect',
        description: `Min-bet de ${action.amount} dans un pot de ~${hand.pot}.`,
        suggestion: `Min-bet de ${action.amount} dans un pot de ${hand.pot}. Ce sizing ne met pas de pression. Envisagez un sizing de 33-75% du pot.`,
      });
      break; // One flag per hand
    }
  }
}

function checkPassiveStrongHand(
  hand: ParsedHand, heroName: string, heroCards: string, flags: LeakFlag[]
) {
  if (!hand.board.flop) return;

  const handStrength = getHandStrength(hand.heroCards, hand.board.flop);
  if (handStrength < 3) return; // Only flag sets or better (3 = set, 4+ = better)

  // Count streets where hero only checked/called
  const postflopActions = hand.actions.filter(
    (a) => a.street !== 'preflop' && a.player === heroName
  );

  const passiveStreets = new Set<string>();
  let aggressiveOnAnyStreet = false;

  for (const a of postflopActions) {
    if (['check', 'call'].includes(a.action)) {
      passiveStreets.add(a.street);
    }
    if (['bet', 'raise', 'allin'].includes(a.action)) {
      aggressiveOnAnyStreet = true;
    }
  }

  if (!aggressiveOnAnyStreet && passiveStreets.size >= 2) {
    const strengthName = handStrength >= 4 ? 'quads/full house' : handStrength === 3 ? 'un set' : 'une main forte';
    flags.push({
      handId: hand.handId,
      severity: 'warning',
      category: 'Passif main forte',
      description: `Check-call passif avec ${heroCards} (${strengthName}) sur 2+ streets.`,
      suggestion: `Vous avez joué ${heroCards} passivement sur [${hand.board.flop.join(' ')}] avec ${strengthName}. Envisagez de raise pour build le pot.`,
    });
  }
}

// ─── HELPER FUNCTIONS ───

function getPosition(hand: ParsedHand, playerName: string): string {
  const seats = hand.players.map((p) => p.seat).sort((a, b) => a - b);
  const player = hand.players.find((p) => p.name === playerName);
  if (!player) return 'UNK';

  const n = seats.length;
  const btnIdx = seats.indexOf(hand.buttonSeat);
  const playerIdx = seats.indexOf(player.seat);
  if (btnIdx === -1 || playerIdx === -1) return 'UNK';

  const dist = (playerIdx - btnIdx + n) % n;
  if (dist === 0) return 'BTN';
  if (dist === 1) return 'SB';
  if (dist === 2) return 'BB';
  const remaining = n - 3;
  if (remaining <= 0) return 'UNK';
  const fromBB = dist - 2;
  if (fromBB === remaining) return 'CO';
  if (fromBB === 1) return 'UTG';
  return 'MP';
}

function isFoldedToPlayer(preflopActions: ParsedAction[], playerName: string): boolean {
  for (const a of preflopActions) {
    if (a.player === playerName) return true;
    if (!['post_blind', 'post_ante', 'fold'].includes(a.action)) return false;
  }
  return false;
}

function getLastRaiser(preflopActions: ParsedAction[]): string {
  let last = '';
  for (const a of preflopActions) {
    if (['raise', 'allin'].includes(a.action)) last = a.player;
  }
  return last;
}

const RANK_ORDER = '23456789TJQKA';

function rankValue(r: string): number {
  return RANK_ORDER.indexOf(r.toUpperCase());
}

function isPlayableStealHand(cards: [string, string]): boolean {
  const r1 = rankValue(cards[0][0]);
  const r2 = rankValue(cards[1][0]);
  // Top ~40%: any pair, any ace, any two cards T+, suited connectors 54s+
  if (r1 === r2) return true; // Pair
  if (r1 >= rankValue('A') || r2 >= rankValue('A')) return true; // Any ace
  if (r1 >= rankValue('T') && r2 >= rankValue('T')) return true; // Two broadways
  if (r1 >= rankValue('9') || r2 >= rankValue('9')) return true; // One high card
  return false;
}

function isTop15Hand(cards: [string, string]): boolean {
  const r1 = rankValue(cards[0][0]);
  const r2 = rankValue(cards[1][0]);
  const suited = cards[0][1] === cards[1][1];
  const high = Math.max(r1, r2);
  const low = Math.min(r1, r2);

  // Pairs 77+
  if (r1 === r2 && r1 >= rankValue('7')) return true;
  // AK, AQ, AJ, ATs+
  if (high === rankValue('A') && low >= rankValue('T')) return true;
  if (high === rankValue('A') && low >= rankValue('J')) return true;
  // KQ, KJs
  if (high === rankValue('K') && low >= rankValue('Q')) return true;
  if (high === rankValue('K') && low >= rankValue('J') && suited) return true;
  // QJs
  if (high === rankValue('Q') && low === rankValue('J') && suited) return true;
  return false;
}

function isPremiumHand(cards: [string, string]): boolean {
  const r1 = rankValue(cards[0][0]);
  const r2 = rankValue(cards[1][0]);
  const suited = cards[0][1] === cards[1][1];

  // QQ, KK, AA
  if (r1 === r2 && r1 >= rankValue('Q')) return true;
  // AKs
  if (Math.max(r1, r2) === rankValue('A') && Math.min(r1, r2) === rankValue('K') && suited) return true;
  return false;
}

function isDryBoard(flop: [string, string, string]): boolean {
  const suits = flop.map((c) => c[1]);
  const ranks = flop.map((c) => rankValue(c[0])).sort((a, b) => a - b);

  // Two-tone or monotone = not dry
  const suitCounts = new Map<string, number>();
  for (const s of suits) suitCounts.set(s, (suitCounts.get(s) || 0) + 1);
  if ([...suitCounts.values()].some((c) => c >= 2)) {
    // Two-tone is borderline, monotone is definitely not dry
    if ([...suitCounts.values()].some((c) => c >= 3)) return false;
  }

  // Connected = not dry (gap of ≤2 between adjacent ranks)
  if (ranks[2] - ranks[0] <= 4) {
    // Check for straight draws
    if (ranks[1] - ranks[0] <= 2 && ranks[2] - ranks[1] <= 2) return false;
  }

  return true;
}

function getHandStrength(heroCards: [string, string], flop: [string, string, string]): number {
  const heroRanks = heroCards.map((c) => c[0]);
  const boardRanks = flop.map((c) => c[0]);

  // Check for set (pair in hand matching a board card)
  if (heroRanks[0] === heroRanks[1] && boardRanks.includes(heroRanks[0])) return 3;

  // Check for two pair
  const matches = heroRanks.filter((r) => boardRanks.includes(r)).length;
  if (matches >= 2) return 2;

  // Check for pair
  if (matches >= 1) return 1;

  return 0;
}

/**
 * Generate a formatted prompt for Claude analysis.
 */
export function generateClaudePrompt(hand: ParsedHand, heroName: string, flag: LeakFlag): string {
  const hero = hand.players.find((p) => p.name === heroName);
  if (!hero) return '';

  const position = getPosition(hand, heroName);
  const stackBB = Math.round(hero.stack / hand.bigBlind);

  const lines: string[] = [];
  lines.push(`Je joue un MTT de poker (${hand.buyIn}€ + ${hand.fee}€).`);
  lines.push(`Nous sommes au level ${hand.level} (${hand.smallBlind}/${hand.bigBlind}${hand.ante > 0 ? ` ante ${hand.ante}` : ''}).`);
  lines.push('');
  lines.push(`Ma position : ${position}`);
  lines.push(`Mon stack : ${stackBB}bb (${hero.stack} jetons)`);
  lines.push(`Ma main : ${hand.heroCards.join(' ')}`);
  lines.push('');
  lines.push('Stacks à la table :');
  for (const p of hand.players) {
    const pPos = getPosition(hand, p.name);
    const pBB = Math.round(p.stack / hand.bigBlind);
    lines.push(`  ${pPos}: ${p.name} (${pBB}bb)`);
  }
  lines.push('');

  // Group actions by street
  let currentStreet = '';
  for (const a of hand.actions) {
    if (a.street !== currentStreet) {
      currentStreet = a.street;
      if (currentStreet === 'flop' && hand.board.flop) {
        lines.push(`Flop : [${hand.board.flop.join(' ')}]`);
      } else if (currentStreet === 'turn' && hand.board.turn) {
        lines.push(`Turn : [${hand.board.turn}]`);
      } else if (currentStreet === 'river' && hand.board.river) {
        lines.push(`River : [${hand.board.river}]`);
      } else if (currentStreet === 'preflop') {
        lines.push('Action preflop :');
      }
    }
    const amountStr = a.amount ? ` ${a.amount}` : '';
    lines.push(`  ${a.player} ${a.action}${amountStr}`);
  }

  if (hand.showdownHands.length > 0) {
    lines.push('');
    lines.push('Showdown :');
    for (const s of hand.showdownHands) {
      lines.push(`  ${s.player} montre [${s.cards.join(' ')}]`);
    }
  }

  if (hand.winners.length > 0) {
    lines.push(`Résultat : ${hand.winners.map((w) => `${w.player} gagne ${w.amount}`).join(', ')}`);
  }

  lines.push('');
  lines.push(`Le coach automatique a identifié cette main comme potentiellement problématique :`);
  lines.push(`Flag : ${flag.description}`);
  lines.push(`Suggestion : ${flag.suggestion}`);
  lines.push('');
  lines.push(`Peux-tu analyser cette main en détail ? Qu'est-ce que tu aurais fait différemment et pourquoi ? Considère l'ICM, les dynamiques de table, et les ranges théoriques.`);

  return lines.join('\n');
}
