import { describe, it, expect } from 'vitest';
import { calculateICM, calculateICMExact, calculateICMMonteCarlo, calculateDollarEV } from '../../src/engine/icm';

describe('ICM Calculator — Exact', () => {
  it('1 player gets full first prize', () => {
    const equities = calculateICM([5000], [100]);
    expect(equities[0]).toBe(100);
  });

  it('2 players — proportional to stacks weighted by payouts', () => {
    // 2 players, equal stacks → equal equity
    const equities = calculateICM([5000, 5000], [60, 40]);
    expect(equities[0]).toBeCloseTo(50, 0); // (60+40)/2 = 50
    expect(equities[1]).toBeCloseTo(50, 0);
  });

  it('2 players — unequal stacks', () => {
    // Player1 has 75% of chips
    const equities = calculateICM([7500, 2500], [60, 40]);
    // P1 wins 1st 75% of the time: 0.75*60 + 0.25*40 = 45+10 = 55
    // P2 wins 1st 25% of the time: 0.25*60 + 0.75*40 = 15+30 = 45
    expect(equities[0]).toBeCloseTo(55, 0);
    expect(equities[1]).toBeCloseTo(45, 0);
  });

  it('3 players with payouts [50, 30, 20]', () => {
    const equities = calculateICMExact([5000, 3000, 2000], [50, 30, 20]);
    const total = equities.reduce((a, b) => a + b, 0);
    // Total equity should equal total payouts
    expect(total).toBeCloseTo(100, 1);
    // Biggest stack should have most equity
    expect(equities[0]).toBeGreaterThan(equities[1]);
    expect(equities[1]).toBeGreaterThan(equities[2]);
  });

  it('3 players equal stacks → equal equity', () => {
    const equities = calculateICMExact([5000, 5000, 5000], [50, 30, 20]);
    const total = equities.reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(100, 1);
    // All should be approximately 33.33
    expect(equities[0]).toBeCloseTo(33.33, 0);
    expect(equities[1]).toBeCloseTo(33.33, 0);
    expect(equities[2]).toBeCloseTo(33.33, 0);
  });

  it('handles zero-stack player', () => {
    const equities = calculateICMExact([5000, 0, 5000], [60, 30, 10]);
    // Zero-stack player gets 0 equity (can't win any position)
    expect(equities[1]).toBe(0);
    // The two active players split the remaining equity
    // Total should be 60+30 = 90 (3rd place goes to zero-stack implicitly but our model gives 0)
    expect(equities[0]).toBeCloseTo(equities[2], 1); // Equal stacks → equal equity
    expect(equities[0] + equities[2]).toBeCloseTo(90, 1);
  });

  it('ICM pressure: equal stacks worth less than chip-chop', () => {
    // Classic ICM demonstration: the big stack's equity is less than proportional
    const equities = calculateICMExact([8000, 2000], [70, 30]);
    // Chip-chop: P1=80%, P2=20% of prize pool → 80, 20
    // ICM: P1 < 80, P2 > 20
    expect(equities[0]).toBeLessThan(80);
    expect(equities[1]).toBeGreaterThan(20);
  });

  it('more payouts than players', () => {
    const equities = calculateICMExact([5000, 5000], [50, 30, 20]);
    const total = equities.reduce((a, b) => a + b, 0);
    // Only 2 players, so only first 2 payouts apply
    expect(total).toBeCloseTo(80, 1); // 50 + 30
  });
});

describe('ICM Calculator — Monte Carlo', () => {
  it('Monte Carlo approximation ≈ exact for 3 players (±2%)', () => {
    const stacks = [5000, 3000, 2000];
    const payouts = [50, 30, 20];

    const exact = calculateICMExact(stacks, payouts);
    const monteCarlo = calculateICMMonteCarlo(stacks, payouts, 50000);

    for (let i = 0; i < stacks.length; i++) {
      expect(monteCarlo[i]).toBeCloseTo(exact[i], 0); // Within ±1 unit
    }
  });

  it('Monte Carlo handles many players', () => {
    const stacks = Array.from({ length: 20 }, (_, i) => 1000 + i * 500);
    const payouts = [100, 60, 40, 30, 20, 15, 10, 8, 6, 5];

    const equities = calculateICMMonteCarlo(stacks, payouts, 5000);

    // Total should approximate sum of payouts
    const totalPayouts = payouts.reduce((a, b) => a + b, 0);
    const totalEquity = equities.reduce((a, b) => a + b, 0);
    expect(totalEquity).toBeCloseTo(totalPayouts, -1); // Within ±10

    // Biggest stack should have most equity
    const maxStackIdx = stacks.indexOf(Math.max(...stacks));
    const maxEquityIdx = equities.indexOf(Math.max(...equities));
    expect(maxEquityIdx).toBe(maxStackIdx);
  });
});

describe('ICM — $EV calculation', () => {
  it('calculates dollar EV difference', () => {
    const payouts = [60, 40];
    const stacksBefore = [5000, 5000];

    // Hero (idx 0) wins 2000 chips → stacks become [7000, 3000]
    const stacksAfterReal = [7000, 3000];

    // But EV says hero should have won 1500 → stacks become [6500, 3500]
    const stacksAfterEV = [6500, 3500];

    const result = calculateDollarEV(stacksBefore, stacksAfterReal, stacksAfterEV, 0, payouts);

    // Hero ran above EV, so diff should be negative (EV < real)
    expect(result.dollarEVBefore).toBeCloseTo(50, 0); // Equal stacks
    expect(result.dollarEVAfterReal).toBeGreaterThan(result.dollarEVAfterEV);
    expect(result.diff).toBeLessThan(0);
  });
});
