import { ParsedHand } from '../types';

/**
 * Normalizes card notation to a consistent format: "Ah", "Ks", etc.
 */
export function normalizeCard(card: string): string {
  return card.trim();
}

/**
 * Determines hero position from seat number and button seat.
 */
export function determinePosition(
  heroSeat: number,
  buttonSeat: number,
  seats: number[],
  tableSize: number
): string {
  const activeSeatCount = seats.length;
  const sortedSeats = [...seats].sort((a, b) => a - b);

  // Find positions relative to button
  const buttonIndex = sortedSeats.indexOf(buttonSeat);
  const heroIndex = sortedSeats.indexOf(heroSeat);

  if (buttonIndex === -1 || heroIndex === -1) return 'UNK';

  // Distance from button (clockwise)
  const distance = (heroIndex - buttonIndex + activeSeatCount) % activeSeatCount;

  if (distance === 0) return 'BTN';
  if (distance === 1) return 'SB';
  if (distance === 2) return 'BB';

  // For remaining positions, count from UTG
  const positionsFromBB = distance - 2;
  const remainingPositions = activeSeatCount - 3; // minus BTN, SB, BB

  if (remainingPositions <= 0) return 'UNK';

  if (positionsFromBB === remainingPositions) return 'CO';
  if (positionsFromBB === 1) return 'UTG';
  if (positionsFromBB === 2 && remainingPositions > 2) return 'UTG1';
  if (positionsFromBB <= remainingPositions / 2) return 'MP';
  return 'MP1';
}

/**
 * Validates a parsed hand has minimum required data.
 */
export function validateParsedHand(hand: Partial<ParsedHand>): hand is ParsedHand {
  return !!(
    hand.handId &&
    hand.room &&
    hand.datetime &&
    hand.players &&
    hand.players.length > 0 &&
    hand.heroCards &&
    hand.actions &&
    hand.actions.length > 0
  );
}
