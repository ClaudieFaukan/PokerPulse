import { Room } from '../types';

export function detectRoom(content: string): Room | null {
  const firstLines = content.slice(0, 500);

  if (firstLines.startsWith('Winamax Poker')) {
    return 'winamax';
  }

  if (firstLines.startsWith('PokerStars Hand') || firstLines.startsWith('PokerStars Tournament') || firstLines.startsWith('Main PokerStars')) {
    return 'pokerstars';
  }

  if (firstLines.includes('<session') || firstLines.includes('History for hand')) {
    return 'pmu';
  }

  return null;
}
