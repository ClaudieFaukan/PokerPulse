/**
 * ICM (Independent Chip Model) Calculator
 *
 * Converts chip stacks into prize pool equity using the Malmuth-Harville model.
 * For > 15 players, falls back to Monte Carlo approximation.
 */

/**
 * Calculate ICM equity for each player.
 *
 * @param stacks - Array of chip stacks for all remaining players
 * @param payouts - Prize amounts for each finishing position [1st, 2nd, 3rd, ...]
 * @returns Array of equity values in $ for each player (same order as stacks)
 */
export function calculateICM(stacks: number[], payouts: number[]): number[] {
  if (stacks.length === 0) return [];
  if (stacks.length === 1) return [payouts[0] || 0];

  // Use Monte Carlo for large fields
  if (stacks.length > 15) {
    return calculateICMMonteCarlo(stacks, payouts, 10000);
  }

  return calculateICMExact(stacks, payouts);
}

/**
 * Exact ICM using Malmuth-Harville recursive model.
 */
export function calculateICMExact(stacks: number[], payouts: number[]): number[] {
  const n = stacks.length;
  const totalChips = stacks.reduce((a, b) => a + b, 0);

  if (totalChips === 0) return new Array(n).fill(0);

  const equities = new Array(n).fill(0);
  const numPayouts = Math.min(payouts.length, n);

  for (let i = 0; i < n; i++) {
    for (let p = 0; p < numPayouts; p++) {
      equities[i] += probabilityOfFinishing(i, p, stacks, totalChips) * payouts[p];
    }
  }

  return equities;
}

/**
 * Recursive probability that player `playerIdx` finishes at position `position`.
 * position 0 = 1st place, position 1 = 2nd place, etc.
 */
function probabilityOfFinishing(
  playerIdx: number,
  position: number,
  stacks: number[],
  totalChips: number
): number {
  const n = stacks.length;

  if (stacks[playerIdx] === 0) return 0;

  // Base case: probability of finishing 1st = stack / total
  if (position === 0) {
    return stacks[playerIdx] / totalChips;
  }

  let prob = 0;

  for (let j = 0; j < n; j++) {
    if (j === playerIdx || stacks[j] === 0) continue;

    // Probability that player j finishes 1st
    const pjFirst = stacks[j] / totalChips;

    // Remove player j and calculate recursively
    const newStacks = [...stacks];
    const removedStack = newStacks[j];
    newStacks[j] = 0;
    const newTotal = totalChips - removedStack;

    prob += pjFirst * probabilityOfFinishing(playerIdx, position - 1, newStacks, newTotal);
  }

  return prob;
}

/**
 * Monte Carlo approximation of ICM for large fields.
 *
 * Simulates finishing order by repeatedly selecting a "winner" (survivor)
 * proportional to stack size. The last player eliminated finishes last.
 * The first player selected as winner finishes 1st, etc.
 */
export function calculateICMMonteCarlo(
  stacks: number[],
  payouts: number[],
  iterations: number = 10000
): number[] {
  const n = stacks.length;
  const totalEquities = new Array(n).fill(0);
  const numPayouts = Math.min(payouts.length, n);

  for (let iter = 0; iter < iterations; iter++) {
    // Build finish order by picking winners proportional to stack
    // finishOrder[0] = 1st place, finishOrder[1] = 2nd place, etc.
    const remaining = stacks.map((s, i) => ({ idx: i, stack: s }));
    const finishOrder: number[] = [];

    while (remaining.length > 1) {
      const total = remaining.reduce((sum, p) => sum + p.stack, 0);
      if (total === 0) {
        // All zero stacks — random order
        while (remaining.length > 0) {
          const rIdx = Math.floor(Math.random() * remaining.length);
          finishOrder.push(remaining[rIdx].idx);
          remaining.splice(rIdx, 1);
        }
        break;
      }

      // Pick winner proportional to stack
      let rand = Math.random() * total;
      let winnerIdx = 0;
      for (let i = 0; i < remaining.length; i++) {
        rand -= remaining[i].stack;
        if (rand <= 0) {
          winnerIdx = i;
          break;
        }
      }

      finishOrder.push(remaining[winnerIdx].idx);
      remaining.splice(winnerIdx, 1);
    }

    if (remaining.length === 1) {
      finishOrder.push(remaining[0].idx);
    }

    // Assign payouts: finishOrder[0] = 1st place gets payouts[0], etc.
    for (let pos = 0; pos < numPayouts && pos < finishOrder.length; pos++) {
      totalEquities[finishOrder[pos]] += payouts[pos];
    }
  }

  return totalEquities.map((eq) => eq / iterations);
}

/**
 * Calculate the $EV difference for a hand.
 *
 * @param stacksBefore - All player stacks before the hand
 * @param stacksAfterReal - All player stacks after real outcome
 * @param stacksAfterEV - All player stacks after EV-adjusted outcome
 * @param heroIdx - Index of the hero in the stacks arrays
 * @param payouts - Tournament payout structure
 * @returns $EV difference (positive = ran bad, negative = ran good)
 */
export function calculateDollarEV(
  stacksBefore: number[],
  stacksAfterReal: number[],
  stacksAfterEV: number[],
  heroIdx: number,
  payouts: number[]
): { dollarEVBefore: number; dollarEVAfterReal: number; dollarEVAfterEV: number; diff: number } {
  const icmBefore = calculateICM(stacksBefore, payouts);
  const icmAfterReal = calculateICM(stacksAfterReal, payouts);
  const icmAfterEV = calculateICM(stacksAfterEV, payouts);

  return {
    dollarEVBefore: icmBefore[heroIdx],
    dollarEVAfterReal: icmAfterReal[heroIdx],
    dollarEVAfterEV: icmAfterEV[heroIdx],
    diff: icmAfterEV[heroIdx] - icmAfterReal[heroIdx],
  };
}
