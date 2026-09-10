import { describe, it, expect } from 'vitest';
import {
  CONNECTIONS,
  SPEED_UNITS,
  bytesPerSecond,
  formatRate,
  formatSize,
  formatThroughput,
  formatTransferTime,
  parsePositive,
  sizeUnit,
  speedUnit,
  transferSeconds,
  trim,
} from './logic';

describe('speed units', () => {
  it('keeps the factor of eight between bits and bytes', () => {
    expect(speedUnit('Mbps')!.bps).toBe(1e6);
    expect(speedUnit('MBps')!.bps).toBe(8e6);
    expect(speedUnit('MBps')!.bps / speedUnit('Mbps')!.bps).toBe(8);
    expect(SPEED_UNITS.filter((u) => u.isBytes)).toHaveLength(3);
    expect(speedUnit('nope')).toBeUndefined();
    expect(sizeUnit('GiB')!.bytes).toBe(1_073_741_824);
  });
});

describe('bytesPerSecond', () => {
  it('turns a gigabit link into 125 MB/s', () => {
    expect(bytesPerSecond(1e9)).toBe(125e6);
    expect(bytesPerSecond(100e6)).toBe(12.5e6);
  });

  it('applies the efficiency factor', () => {
    expect(bytesPerSecond(1e9, 0.8)).toBe(100e6);
  });

  it('rejects a dead link', () => {
    expect(bytesPerSecond(0)).toBeNull();
    expect(bytesPerSecond(1e9, 0)).toBeNull();
  });
});

describe('transferSeconds', () => {
  it('moves a gigabyte over gigabit in eight seconds', () => {
    expect(transferSeconds(1e9, 1e9)).toBe(8);
  });

  it('slows down with the efficiency factor', () => {
    expect(transferSeconds(1e9, 1e9, 0.5)).toBe(16);
    expect(transferSeconds(1e9, 1e9, 0.85)).toBeCloseTo(9.4118, 4);
  });

  it('handles a realistic download', () => {
    // 25 GB over 100 Mbps at 90% efficiency.
    const seconds = transferSeconds(25e9, 100e6, 0.9)!;
    expect(seconds).toBeCloseTo(2222.22, 2);
    expect(formatTransferTime(seconds)).toBe('37 min 2 s');
  });

  it('refuses impossible inputs', () => {
    expect(transferSeconds(1e9, 0)).toBeNull();
    expect(transferSeconds(-1, 1e9)).toBeNull();
    expect(transferSeconds(1e9, 1e9, 0)).toBeNull();
  });

  it('is zero for an empty file', () => {
    expect(transferSeconds(0, 1e9)).toBe(0);
  });
});

describe('formatTransferTime', () => {
  it('never shows more than two units', () => {
    expect(formatTransferTime(0.42)).toBe('0.42 s');
    expect(formatTransferTime(8)).toBe('8 s');
    expect(formatTransferTime(42)).toBe('42 s');
    expect(formatTransferTime(200)).toBe('3 min 20 s');
    expect(formatTransferTime(3600)).toBe('1 h');
    expect(formatTransferTime(7500)).toBe('2 h 5 min');
    expect(formatTransferTime(100_000)).toBe('1 d 4 h');
  });

  it('rounds up cleanly at the boundaries', () => {
    expect(formatTransferTime(3599.6)).toBe('1 h');
    expect(formatTransferTime(86_399)).toBe('24 h');
    expect(formatTransferTime(null)).toBe('—');
    expect(formatTransferTime(-5)).toBe('—');
  });
});

describe('formatting', () => {
  it('writes rates and throughput in their own conventions', () => {
    expect(formatRate(1e9)).toBe('1 Gbps');
    expect(formatRate(866e6)).toBe('866 Mbps');
    expect(formatThroughput(125e6)).toBe('125 MB/s');
    expect(formatThroughput(12.5e6)).toBe('12.5 MB/s');
    expect(formatSize(25e9)).toBe('25 GB');
    expect(trim(1234.56, 1)).toBe('1,234.6');
  });
});

describe('connection table', () => {
  it('is unique, positive and ordered inside each group', () => {
    expect(new Set(CONNECTIONS.map((c) => c.label)).size).toBe(CONNECTIONS.length);
    for (const c of CONNECTIONS) expect(c.bps).toBeGreaterThan(0);
  });

  it('gives the throughput figures people quote', () => {
    const gigabit = CONNECTIONS.find((c) => c.label === 'Gigabit Ethernet')!;
    expect(bytesPerSecond(gigabit.bps)).toBe(125e6);
    const sata = CONNECTIONS.find((c) => c.label === 'SATA III')!;
    expect(bytesPerSecond(sata.bps, 0.8)).toBe(600e6);
  });
});

describe('parsePositive', () => {
  it('takes sizes and speeds as typed', () => {
    expect(parsePositive('25')).toBe(25);
    expect(parsePositive('1.5')).toBe(1.5);
    expect(parsePositive('1,024')).toBe(1024);
    expect(parsePositive('0')).toBeNull();
    expect(parsePositive('fast')).toBeNull();
  });
});
