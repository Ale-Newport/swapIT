import { describe, expect, it } from 'vitest';
import {
  CENTER,
  DEAD_ZONE,
  RING,
  hitSlot,
  petalAnchor,
  petalPath,
  polar,
  slotCenterAngle,
  unwrapAngle,
} from './geometry';

describe('slots', () => {
  it('puts slot 0 at 12 o’clock and walks clockwise', () => {
    const top = polar(100, slotCenterAngle(0, 8));
    expect(top.x).toBeCloseTo(CENTER);
    expect(top.y).toBeCloseTo(CENTER - 100);
    const right = polar(100, slotCenterAngle(2, 8));
    expect(right.x).toBeCloseTo(CENTER + 100);
    expect(right.y).toBeCloseTo(CENTER);
  });

  it('anchors petal content on the mid radius', () => {
    const p = petalAnchor(8, 0);
    expect(p.x).toBeCloseTo(CENTER);
    expect(p.y).toBeCloseTo(CENTER - (RING.inner + RING.outer) / 2);
  });
});

describe('hitSlot', () => {
  const at = (x: number, y: number) => ({ x: CENTER + x, y: CENTER + y });
  const MID = (RING.inner + RING.outer) / 2;

  it('ignores the dead zone in the middle', () => {
    expect(hitSlot(at(0, -(DEAD_ZONE - 4)), 8)).toBeNull();
    expect(hitSlot(at(0, 0), 8)).toBeNull();
  });

  it('finds the slot under the pointer', () => {
    expect(hitSlot(at(0, -MID), 8)).toBe(0);
    expect(hitSlot(at(MID, 0), 8)).toBe(2);
    expect(hitSlot(at(0, MID), 8)).toBe(4);
    expect(hitSlot(at(-MID, 0), 8)).toBe(6);
    // Six slots — what the ring uses — put slot 1 at two o'clock and slot 3 at six.
    expect(hitSlot(at(0, MID), 6)).toBe(3);
    expect(hitSlot(polar(MID, slotCenterAngle(1, 6)), 6)).toBe(1);
  });

  it('treats the seam between slots consistently', () => {
    // 22.5° either side of the top is the 7|0 and 0|1 boundary for 8 slots.
    const justLeft = polar(MID, slotCenterAngle(0, 8) - 0.3);
    const justRight = polar(MID, slotCenterAngle(0, 8) + 0.3);
    expect(hitSlot(justLeft, 8)).toBe(0);
    expect(hitSlot(justRight, 8)).toBe(0);
    expect(hitSlot(polar(MID, slotCenterAngle(0, 8) - 0.45), 8)).toBe(7);
  });

  it('keeps selecting while the pointer flicks past the ring, then gives up', () => {
    expect(hitSlot(at(0, -(RING.outer + 30)), 8)).toBe(0);
    expect(hitSlot(at(0, -900), 8)).toBeNull();
  });

  it('returns null for empty lattice positions', () => {
    expect(hitSlot(at(MID, 0), 8, 2)).toBeNull();
  });
});

describe('petalPath', () => {
  it('draws a closed path with four fillets for every slot count', () => {
    for (let slots = 3; slots <= 8; slots++) {
      for (let i = 0; i < slots; i++) {
        const d = petalPath(slots, i);
        expect(d.startsWith('M ')).toBe(true);
        expect(d.endsWith('Z')).toBe(true);
        expect(d).not.toContain('NaN');
        expect(d.match(/ A /g)?.length ?? 0).toBe(6);
      }
    }
  });

  it('stays inside the ring radii', () => {
    const d = petalPath(8, 3);
    const nums = d.replace(/[A-Za-z]/g, ' ').split(/\s+/).filter(Boolean).map(Number);
    // Pull out the on-curve points: every command ends with an x y pair, but arcs also
    // carry radii and flags, so check the coarse bounding box instead.
    const xs: number[] = [];
    const ys: number[] = [];
    const commands = d.split(/(?=[MLAZ])/);
    for (const c of commands) {
      const n = c.slice(1).trim().split(/\s+/).map(Number);
      if (c[0] === 'A') {
        xs.push(n[5]);
        ys.push(n[6]);
      } else if (c[0] === 'M' || c[0] === 'L') {
        xs.push(n[0]);
        ys.push(n[1]);
      }
    }
    expect(nums.length).toBeGreaterThan(10);
    for (let i = 0; i < xs.length; i++) {
      const r = Math.hypot(xs[i] - CENTER, ys[i] - CENTER);
      expect(r).toBeGreaterThanOrEqual(RING.inner - 0.5);
      expect(r).toBeLessThanOrEqual(RING.outer + 0.5);
    }
  });
});

describe('unwrapAngle', () => {
  it('takes the short way around the seam', () => {
    const start = (7 * Math.PI * 2) / 8;
    const next = unwrapAngle(start, 0);
    expect(next).toBeCloseTo(Math.PI * 2);
    expect(unwrapAngle(0.1, Math.PI * 2 - 0.1)).toBeCloseTo(-0.1);
  });
});
