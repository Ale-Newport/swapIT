import { describe, expect, it } from 'vitest';
import { describeAwake, formatRemaining } from './awake';

describe('keep awake wording', () => {
  it('formats what is left in the unit people think in', () => {
    expect(formatRemaining(10_000)).toBe('1 min');
    expect(formatRemaining(45 * 60_000)).toBe('45 min');
    expect(formatRemaining(60 * 60_000)).toBe('1 h');
    expect(formatRemaining(80 * 60_000)).toBe('1 h 20 min');
  });

  it('says whether closing the lid is covered', () => {
    const plugged = describeAwake({ active: true, startedAt: 0, endsAt: null, onBattery: false });
    expect(plugged.detail).toBe('Until you stop it · lid can be closed');
    const battery = describeAwake({ active: true, startedAt: 0, endsAt: Date.now() + 3_600_000, onBattery: true });
    expect(battery.detail).toMatch(/^Until .+ · plug in to close the lid$/);
  });
});
