import { ParsedAction, ParsedHand, Street } from '../parsers/types';

/**
 * All HUD stats for a player across a set of hands.
 */
export interface PlayerStats {
  handsPlayed: number;

  // Preflop
  vpip: number;       // % of hands voluntarily put money in pot
  pfr: number;        // % of hands raised preflop
  threeBet: number;   // % 3-bet when had opportunity
  fourBet: number;    // % 4-bet when had opportunity
  foldTo3Bet: number; // % fold facing a 3-bet
  steal: number;      // % steal attempts from CO/BTN/SB
  foldBBToSteal: number; // % fold BB vs steal
  limp: number;       // % open limp

  // Postflop
  cbetFlop: number;   // % c-bet on flop
  cbetTurn: number;   // % c-bet on turn (double barrel)
  foldToCbetFlop: number; // % fold to c-bet on flop
  wtsd: number;       // % went to showdown (of hands that saw flop)
  wsd: number;        // % won at showdown
  wwsf: number;       // % won when saw flop
  af: number;         // aggression factor: (bets + raises) / calls
  afq: number;        // aggression frequency: (bets + raises) / (bets + raises + calls + folds) * 100

  // Raw counters (for incremental updates)
  counters: StatsCounters;
}

export interface StatsCounters {
  handsPlayed: number;
  vpipHands: number;
  pfrHands: number;
  threeBetOpportunities: number;
  threeBetMade: number;
  fourBetOpportunities: number;
  fourBetMade: number;
  foldTo3BetOpportunities: number;
  foldTo3BetMade: number;
  stealOpportunities: number;
  stealMade: number;
  foldBBToStealOpportunities: number;
  foldBBToStealMade: number;
  limpCount: number;
  limpOpportunities: number;
  cbetFlopOpportunities: number;
  cbetFlopMade: number;
  cbetTurnOpportunities: number;
  cbetTurnMade: number;
  foldToCbetFlopOpportunities: number;
  foldToCbetFlopMade: number;
  sawFlop: number;
  wentToShowdown: number;
  wonAtShowdown: number;
  wonWhenSawFlop: number;
  totalBetsRaises: number;
  totalCalls: number;
  totalFolds: number;
}

function emptyCounters(): StatsCounters {
  return {
    handsPlayed: 0, vpipHands: 0, pfrHands: 0,
    threeBetOpportunities: 0, threeBetMade: 0,
    fourBetOpportunities: 0, fourBetMade: 0,
    foldTo3BetOpportunities: 0, foldTo3BetMade: 0,
    stealOpportunities: 0, stealMade: 0,
    foldBBToStealOpportunities: 0, foldBBToStealMade: 0,
    limpCount: 0, limpOpportunities: 0,
    cbetFlopOpportunities: 0, cbetFlopMade: 0,
    cbetTurnOpportunities: 0, cbetTurnMade: 0,
    foldToCbetFlopOpportunities: 0, foldToCbetFlopMade: 0,
    sawFlop: 0, wentToShowdown: 0, wonAtShowdown: 0, wonWhenSawFlop: 0,
    totalBetsRaises: 0, totalCalls: 0, totalFolds: 0,
  };
}

/**
 * Calculate stats for a specific player from a set of hands.
 */
export function calculateStats(hands: ParsedHand[], playerName: string): PlayerStats {
  const counters = emptyCounters();

  for (const hand of hands) {
    analyzeHand(hand, playerName, counters);
  }

  return buildStats(counters);
}

/**
 * Analyze a single hand and update counters for the given player.
 */
export function analyzeHand(hand: ParsedHand, playerName: string, counters: StatsCounters): void {
  const player = hand.players.find((p) => p.name === playerName);
  if (!player) return;

  counters.handsPlayed++;

  const preflopActions = hand.actions.filter((a) => a.street === 'preflop');
  const playerPreflopActions = preflopActions.filter(
    (a) => a.player === playerName && !['post_blind', 'post_ante'].includes(a.action)
  );

  // Determine player position
  const position = getPosition(hand, playerName);
  const isBB = position === 'BB';
  const isSB = position === 'SB';

  // ─── VPIP ───
  // VPIP = voluntarily put money in pot. Excludes posting blinds.
  // BB checking (no raise facing) does NOT count as VPIP.
  const voluntaryActions = playerPreflopActions.filter(
    (a) => ['call', 'raise', 'allin', 'bet'].includes(a.action)
  );
  if (voluntaryActions.length > 0) {
    // If BB and only action is check, don't count
    const isOnlyBBCheck = isBB && playerPreflopActions.length === 1 && playerPreflopActions[0].action === 'check';
    if (!isOnlyBBCheck) {
      counters.vpipHands++;
    }
  }

  // ─── PFR ───
  // PFR = raised preflop (open raise, 3-bet, 4-bet, etc.)
  const raiseActions = playerPreflopActions.filter(
    (a) => ['raise', 'allin'].includes(a.action)
  );
  if (raiseActions.length > 0) {
    counters.pfrHands++;
  }

  // ─── Preflop raise sequence analysis ───
  const raiseSequence = analyzePreflopRaises(preflopActions, playerName);

  // ─── 3-Bet ───
  if (raiseSequence.had3BetOpportunity) {
    counters.threeBetOpportunities++;
    if (raiseSequence.made3Bet) counters.threeBetMade++;
  }

  // ─── 4-Bet ───
  if (raiseSequence.had4BetOpportunity) {
    counters.fourBetOpportunities++;
    if (raiseSequence.made4Bet) counters.fourBetMade++;
  }

  // ─── Fold to 3-Bet ───
  if (raiseSequence.facing3Bet) {
    counters.foldTo3BetOpportunities++;
    if (raiseSequence.foldedTo3Bet) counters.foldTo3BetMade++;
  }

  // ─── Steal ───
  // Steal = open raise from CO, BTN, or SB when folded to them
  if (['CO', 'BTN', 'SB'].includes(position)) {
    const foldedToPlayer = isFoldedTo(preflopActions, playerName);
    if (foldedToPlayer) {
      counters.stealOpportunities++;
      if (raiseActions.length > 0) {
        counters.stealMade++;
      }
    }
  }

  // ─── Fold BB to Steal ───
  if (isBB) {
    const stealAttempt = isStealAttempt(preflopActions, hand, playerName);
    if (stealAttempt) {
      counters.foldBBToStealOpportunities++;
      if (playerPreflopActions.some((a) => a.action === 'fold')) {
        counters.foldBBToStealMade++;
      }
    }
  }

  // ─── Limp ───
  // Open limp = first voluntary action is a call (not a raise)
  if (!isBB && !isSB) {
    const foldedToPlayer = isFoldedTo(preflopActions, playerName);
    if (foldedToPlayer) {
      counters.limpOpportunities++;
      if (playerPreflopActions.length > 0 && playerPreflopActions[0].action === 'call') {
        counters.limpCount++;
      }
    }
  }

  // ─── Postflop analysis ───
  const flopActions = hand.actions.filter((a) => a.street === 'flop');
  const turnActions = hand.actions.filter((a) => a.street === 'turn');
  const riverActions = hand.actions.filter((a) => a.street === 'river');
  const playerSawFlop = flopActions.some((a) => a.player === playerName);

  if (playerSawFlop) {
    counters.sawFlop++;
  }

  // ─── C-Bet Flop ───
  if (playerSawFlop) {
    const wasAggressor = isPreflopAggressor(preflopActions, playerName);
    if (wasAggressor) {
      const firstToAct = isFirstToActOrCheckedTo(flopActions, playerName);
      if (firstToAct) {
        counters.cbetFlopOpportunities++;
        const playerFlopActions = flopActions.filter((a) => a.player === playerName);
        if (playerFlopActions.some((a) => ['bet', 'raise', 'allin'].includes(a.action))) {
          counters.cbetFlopMade++;
        }
      }
    }
  }

  // ─── C-Bet Turn (double barrel) ───
  if (turnActions.some((a) => a.player === playerName)) {
    const cbetOnFlop = flopActions.some(
      (a) => a.player === playerName && ['bet', 'raise', 'allin'].includes(a.action)
    );
    if (cbetOnFlop) {
      const firstToActTurn = isFirstToActOrCheckedTo(turnActions, playerName);
      if (firstToActTurn) {
        counters.cbetTurnOpportunities++;
        const playerTurnActions = turnActions.filter((a) => a.player === playerName);
        if (playerTurnActions.some((a) => ['bet', 'raise', 'allin'].includes(a.action))) {
          counters.cbetTurnMade++;
        }
      }
    }
  }

  // ─── Fold to C-Bet Flop ───
  if (playerSawFlop) {
    const facingCbet = isFacingCbet(flopActions, preflopActions, playerName);
    if (facingCbet) {
      counters.foldToCbetFlopOpportunities++;
      const playerFlopActions = flopActions.filter((a) => a.player === playerName);
      if (playerFlopActions.some((a) => a.action === 'fold')) {
        counters.foldToCbetFlopMade++;
      }
    }
  }

  // ─── WTSD / W$SD / WWSF ───
  const wentToShowdown = hand.showdownHands.some((s) => s.player === playerName) ||
    (hand.showdownHands.length > 0 && hand.winners.some((w) => w.player === playerName));

  if (playerSawFlop && wentToShowdown) {
    counters.wentToShowdown++;
  }

  if (wentToShowdown && hand.winners.some((w) => w.player === playerName)) {
    counters.wonAtShowdown++;
  }

  if (playerSawFlop && hand.winners.some((w) => w.player === playerName)) {
    counters.wonWhenSawFlop++;
  }

  // ─── Aggression (postflop only) ───
  const postflopActions = hand.actions.filter(
    (a) => a.street !== 'preflop' && a.player === playerName
  );

  for (const action of postflopActions) {
    if (['bet', 'raise', 'allin'].includes(action.action)) {
      counters.totalBetsRaises++;
    } else if (action.action === 'call') {
      counters.totalCalls++;
    } else if (action.action === 'fold') {
      counters.totalFolds++;
    }
  }
}

/**
 * Build final stats percentages from raw counters.
 */
export function buildStats(c: StatsCounters): PlayerStats {
  const pct = (num: number, den: number) => den > 0 ? (num / den) * 100 : 0;

  return {
    handsPlayed: c.handsPlayed,
    vpip: pct(c.vpipHands, c.handsPlayed),
    pfr: pct(c.pfrHands, c.handsPlayed),
    threeBet: pct(c.threeBetMade, c.threeBetOpportunities),
    fourBet: pct(c.fourBetMade, c.fourBetOpportunities),
    foldTo3Bet: pct(c.foldTo3BetMade, c.foldTo3BetOpportunities),
    steal: pct(c.stealMade, c.stealOpportunities),
    foldBBToSteal: pct(c.foldBBToStealMade, c.foldBBToStealOpportunities),
    limp: pct(c.limpCount, c.limpOpportunities),
    cbetFlop: pct(c.cbetFlopMade, c.cbetFlopOpportunities),
    cbetTurn: pct(c.cbetTurnMade, c.cbetTurnOpportunities),
    foldToCbetFlop: pct(c.foldToCbetFlopMade, c.foldToCbetFlopOpportunities),
    wtsd: pct(c.wentToShowdown, c.sawFlop),
    wsd: pct(c.wonAtShowdown, c.wentToShowdown),
    wwsf: pct(c.wonWhenSawFlop, c.sawFlop),
    af: c.totalCalls > 0 ? c.totalBetsRaises / c.totalCalls : 0,
    afq: pct(c.totalBetsRaises, c.totalBetsRaises + c.totalCalls + c.totalFolds),
    counters: c,
  };
}

// ─── HELPERS ───

/**
 * Determine player position relative to button.
 */
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
  if (fromBB === 2 && remaining > 2) return 'UTG1';
  if (fromBB <= Math.ceil(remaining / 2)) return 'MP';
  return 'MP1';
}

/**
 * Check if it was folded to the player (no voluntary actions before them).
 */
function isFoldedTo(preflopActions: ParsedAction[], playerName: string): boolean {
  for (const a of preflopActions) {
    if (a.player === playerName) return true;
    if (!['post_blind', 'post_ante'].includes(a.action)) {
      if (a.action !== 'fold') return false;
    }
  }
  return false;
}

/**
 * Analyze the preflop raise sequence to detect 3-bet / 4-bet opportunities.
 */
function analyzePreflopRaises(preflopActions: ParsedAction[], playerName: string) {
  const voluntaryActions = preflopActions.filter(
    (a) => !['post_blind', 'post_ante'].includes(a.action)
  );

  let raiseCount = 0;
  let playerRaised = false;
  let playerFolded = false;
  let had3BetOpportunity = false;
  let made3Bet = false;
  let had4BetOpportunity = false;
  let made4Bet = false;
  let facing3Bet = false;
  let foldedTo3Bet = false;

  // Track the raise sequence
  let lastRaiserBeforePlayer: string | null = null;
  let raiseCountBeforePlayer = 0;

  for (const a of voluntaryActions) {
    if (a.player === playerName) {
      if (['raise', 'allin'].includes(a.action)) {
        playerRaised = true;
        if (raiseCount === 1) {
          // Player is 3-betting
          made3Bet = true;
        } else if (raiseCount === 2) {
          // Player is 4-betting
          made4Bet = true;
        }
        raiseCount++;
      } else if (a.action === 'fold') {
        playerFolded = true;
        // Was player facing a 3-bet (they had open-raised and someone re-raised)?
        if (raiseCountBeforePlayer >= 2) {
          facing3Bet = true;
          foldedTo3Bet = true;
        }
      } else if (a.action === 'call') {
        // Calling a 3-bet
        if (raiseCountBeforePlayer >= 2) {
          facing3Bet = true;
        }
      }
    } else {
      if (['raise', 'allin'].includes(a.action)) {
        raiseCount++;
        raiseCountBeforePlayer = raiseCount;
        lastRaiserBeforePlayer = a.player;

        // After someone open-raises, player has a 3-bet opportunity
        if (raiseCount === 1) {
          // Next players have 3-bet opportunity
        }
      }
    }
  }

  // Determine opportunities
  // 3-bet opportunity: there was exactly 1 raise before the player acted, and player hadn't acted yet
  // We need to check if player had the chance to 3-bet
  let raisesBeforePlayerFirstAction = 0;
  for (const a of voluntaryActions) {
    if (a.player === playerName) {
      if (raisesBeforePlayerFirstAction === 1) {
        had3BetOpportunity = true;
      }
      if (raisesBeforePlayerFirstAction === 2) {
        had4BetOpportunity = true;
      }
      break;
    }
    if (['raise', 'allin'].includes(a.action)) {
      raisesBeforePlayerFirstAction++;
    }
  }

  // Also check: player open-raised, someone 3-bet, player has 4-bet opportunity
  let playerOpenRaised = false;
  let raisesAfterPlayerRaise = 0;
  let reachedPlayerSecondAction = false;
  for (const a of voluntaryActions) {
    if (a.player === playerName && ['raise', 'allin'].includes(a.action) && !playerOpenRaised) {
      playerOpenRaised = true;
      continue;
    }
    if (playerOpenRaised && !reachedPlayerSecondAction) {
      if (['raise', 'allin'].includes(a.action)) {
        raisesAfterPlayerRaise++;
      }
      if (a.player === playerName) {
        reachedPlayerSecondAction = true;
        if (raisesAfterPlayerRaise >= 1) {
          facing3Bet = true;
          had4BetOpportunity = true;
          if (['raise', 'allin'].includes(a.action)) {
            made4Bet = true;
          } else if (a.action === 'fold') {
            foldedTo3Bet = true;
          }
        }
      }
    }
  }

  return {
    had3BetOpportunity,
    made3Bet,
    had4BetOpportunity,
    made4Bet,
    facing3Bet,
    foldedTo3Bet,
  };
}

/**
 * Check if the player was the last preflop aggressor (the one who made the last raise).
 */
function isPreflopAggressor(preflopActions: ParsedAction[], playerName: string): boolean {
  let lastRaiser = '';
  for (const a of preflopActions) {
    if (['raise', 'allin', 'bet'].includes(a.action) && !['post_blind', 'post_ante'].includes(a.action)) {
      lastRaiser = a.player;
    }
  }
  return lastRaiser === playerName;
}

/**
 * Check if the player is first to act or it was checked to them on a street.
 */
function isFirstToActOrCheckedTo(streetActions: ParsedAction[], playerName: string): boolean {
  for (const a of streetActions) {
    if (a.player === playerName) return true;
    if (a.action !== 'check') return false;
  }
  return false;
}

/**
 * Check if the player is facing a continuation bet on the flop.
 */
function isFacingCbet(
  flopActions: ParsedAction[],
  preflopActions: ParsedAction[],
  playerName: string
): boolean {
  // Find the preflop aggressor
  let aggressor = '';
  for (const a of preflopActions) {
    if (['raise', 'allin'].includes(a.action)) {
      aggressor = a.player;
    }
  }

  if (!aggressor || aggressor === playerName) return false;

  // Check if aggressor bet the flop before the player acted
  let aggressorBet = false;
  for (const a of flopActions) {
    if (a.player === aggressor && ['bet', 'raise', 'allin'].includes(a.action)) {
      aggressorBet = true;
    }
    if (a.player === playerName && aggressorBet) {
      return true;
    }
  }

  return false;
}

/**
 * Check if a steal attempt was made (open raise from CO/BTN/SB, folded to them).
 */
function isStealAttempt(
  preflopActions: ParsedAction[],
  hand: ParsedHand,
  bbPlayerName: string
): boolean {
  // Find the first voluntary non-fold action
  for (const a of preflopActions) {
    if (['post_blind', 'post_ante'].includes(a.action)) continue;
    if (a.action === 'fold') continue;

    // First non-fold action — is it from CO/BTN/SB?
    if (a.player === bbPlayerName) return false;
    const pos = getPosition(hand, a.player);
    return ['CO', 'BTN', 'SB'].includes(pos) && ['raise', 'allin'].includes(a.action);
  }

  return false;
}
