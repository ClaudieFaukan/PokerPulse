import { describe, it, expect } from 'vitest';
import { detectRoom } from '../../src/parsers/common/detector';

describe('detectRoom', () => {
  it('detects Winamax from file content', () => {
    const content = 'Winamax Poker - Tournament "Freeroll" buyIn: 5€ + 0.50€ level: 4';
    expect(detectRoom(content)).toBe('winamax');
  });

  it('detects PokerStars from file content', () => {
    const content = 'PokerStars Hand #234567890123: Tournament #3456789012';
    expect(detectRoom(content)).toBe('pokerstars');
  });

  it('detects PMU from XML content', () => {
    const content = '<session sessioncode="12345">';
    expect(detectRoom(content)).toBe('pmu');
  });

  it('detects PMU from text content', () => {
    const content = '***** History for hand #12345678-12 *****';
    expect(detectRoom(content)).toBe('pmu');
  });

  it('returns null for unknown format', () => {
    const content = 'Some random text file';
    expect(detectRoom(content)).toBeNull();
  });
});
