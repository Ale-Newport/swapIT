import { describe, expect, it } from 'vitest';
import type { FileInfo, FileKind } from '@/core/types';
import {
  LAYOUT_TYPES,
  RING_CAPACITY,
  applyLayout,
  arrange,
  layoutKeyFor,
  leaves,
  listActions,
  placement,
  sanitizeLayouts,
  splitByState,
  toLayout,
} from './layouts';
import type { RadialItem } from './model';

const file = (kind: FileKind): FileInfo => ({ path: '/x', name: 'x', stem: 'x', extension: '', mime: '', kind, size: 1, isDir: kind === 'folder' });

const item = (id: string): RadialItem => ({ id, label: id, title: id, icon: 'Box', mode: 'task', run: async () => undefined });
const items = (n: number) => Array.from({ length: n }, (_, i) => item(`a${i + 1}`));

function depth(list: RadialItem[]): number {
  return 1 + Math.max(0, ...list.map((i) => (i.children ? depth(i.children) : 0)));
}

describe('which layout a selection uses', () => {
  it('maps every kind of file to one of the customisable types', () => {
    const types = new Set(LAYOUT_TYPES.map((t) => t.key));
    const kinds: FileKind[] = ['image', 'svg', 'video', 'audio', 'pdf', 'document', 'archive', 'text', 'data', 'code', 'font', 'folder', 'other'];
    for (const kind of kinds) expect(types.has(layoutKeyFor([file(kind)])), kind).toBe(true);
  });

  it('groups text, data and code, and sends mixes and the unknown to “mixed”', () => {
    expect(layoutKeyFor([])).toBe('create');
    expect(layoutKeyFor([file('image'), file('image')])).toBe('image');
    expect(layoutKeyFor([file('text')])).toBe('text');
    expect(layoutKeyFor([file('data')])).toBe('text');
    expect(layoutKeyFor([file('code')])).toBe('text');
    expect(layoutKeyFor([file('image'), file('video')])).toBe('mixed');
    expect(layoutKeyFor([file('other')])).toBe('mixed');
    expect(layoutKeyFor([file('font')])).toBe('mixed');
  });
});

describe('reading a hand-edited settings file', () => {
  it('keeps good layouts and drops everything else', () => {
    expect(sanitizeLayouts(undefined)).toEqual({});
    expect(sanitizeLayouts('nope')).toEqual({});
    expect(sanitizeLayouts([1, 2])).toEqual({});
    expect(
      sanitizeLayouts({
        image: { order: ['a', 'b', 'a', 7, ''], off: ['b', null] },
        bogus: { order: ['a'], off: [] },
        video: { order: [], off: [] },
        pdf: 'x',
        audio: { order: ['m'] },
      }),
    ).toEqual({
      image: { order: ['a', 'b'], off: ['b'] },
      audio: { order: ['m'], off: [] },
    });
  });
});

describe('the list of actions', () => {
  const candidates = items(6);
  const shipped = new Set(['a1', 'a2', 'a4']);

  it('starts from the standard ring when nothing is saved', () => {
    const list = listActions(candidates, shipped);
    expect(list.map((a) => a.item.id)).toEqual(['a1', 'a2', 'a3', 'a4', 'a5', 'a6']);
    expect(list.filter((a) => a.on).map((a) => a.item.id)).toEqual(['a1', 'a2', 'a4']);
  });

  it('starts with no more switched on than the rings can hold', () => {
    const many = items(25);
    const list = listActions(many, new Set(many.map((i) => i.id)));
    expect(list.filter((a) => a.on)).toHaveLength(RING_CAPACITY);
    expect(list.slice(0, RING_CAPACITY).every((a) => a.on)).toBe(true);
    expect(list.slice(RING_CAPACITY).every((a) => !a.on)).toBe(true);
  });

  it('follows the saved order and switches', () => {
    const list = listActions(candidates, shipped, { order: ['a4', 'a1', 'a3', 'a2'], off: ['a2'] });
    expect(list.slice(0, 4).map((a) => [a.item.id, a.on])).toEqual([
      ['a4', true],
      ['a1', true],
      ['a3', true],
      ['a2', false],
    ]);
  });

  it('puts actions the saved list has never seen last, on only if the standard ring had them', () => {
    const list = listActions(candidates, shipped, { order: ['a2', 'a1'], off: [] });
    expect(list.map((a) => a.item.id)).toEqual(['a2', 'a1', 'a3', 'a4', 'a5', 'a6']);
    expect(list.map((a) => a.on)).toEqual([true, true, false, true, false, false]);
  });

  it('ignores saved actions this selection cannot do, without losing the rest', () => {
    const list = listActions(candidates, shipped, { order: ['gone', 'a3', 'a1'], off: [] });
    expect(list.slice(0, 2).map((a) => a.item.id)).toEqual(['a3', 'a1']);
    expect(list.some((a) => a.item.id === 'gone')).toBe(false);
  });

  it('round-trips through the saved shape: what is on first, then what is off', () => {
    const list = listActions(candidates, shipped, { order: ['a3', 'a1', 'a2'], off: ['a1'] });
    const { on, off } = splitByState(list);
    const saved = toLayout(on, off);
    expect(saved.off).toEqual(off.map((i) => i.id));
    expect(saved.order.slice(0, on.length)).toEqual(on.map((i) => i.id));
    expect(new Set(saved.order).size).toBe(saved.order.length);
    // Saving and reading it back changes nothing.
    expect(listActions(candidates, shipped, saved).map((a) => [a.item.id, a.on])).toEqual(list.map((a) => [a.item.id, a.on]).sort((x, y) => Number(y[1]) - Number(x[1])));
  });
});

describe('arranging actions into rings', () => {
  for (const n of [0, 1, 5, 6, 7, 10, 11, 12, 15, 16, 17, 30]) {
    it(`${n} actions: six petals a ring, three rings deep, none lost before the limit`, () => {
      const root = arrange(items(n));
      expect(root.length).toBeLessThanOrEqual(6);
      expect(depth(root)).toBeLessThanOrEqual(3);
      const check = (list: RadialItem[]) => {
        expect(list.length).toBeLessThanOrEqual(6);
        for (const i of list) if (i.children) check(i.children);
      };
      check(root);
      const reached = leaves(root).map((i) => i.id);
      expect(new Set(reached).size).toBe(reached.length);
      expect(reached).toEqual(items(Math.min(n, RING_CAPACITY)).map((i) => i.id));
    });
  }

  it('holds sixteen in all, and a single ring up to six', () => {
    expect(RING_CAPACITY).toBe(16);
    expect(arrange(items(6)).map((i) => i.id)).toEqual(items(6).map((i) => i.id));
    expect(arrange(items(7))).toHaveLength(6);
    expect(arrange(items(7))[5].children).toHaveLength(2);
  });

  it('agrees with `placement` about where each action ends up', () => {
    for (const n of [3, 6, 7, 11, 12, 16, 20]) {
      const root = arrange(items(n));
      const onRing = new Set(root.filter((i) => !i.children).map((i) => i.id));
      const inRings = new Set(leaves(root).map((i) => i.id));
      for (let i = 0; i < n; i++) {
        const where = placement(i, n);
        const id = `a${i + 1}`;
        expect(onRing.has(id), `${n}: ${id} on the ring`).toBe(where === 'ring');
        expect(inRings.has(id), `${n}: ${id} reachable`).toBe(where !== 'typing');
      }
    }
  });
});

describe('applying a layout', () => {
  const candidates = items(8);
  const standard = candidates.slice(0, 3);

  it('leaves the standard ring alone without one', () => {
    expect(applyLayout(standard, candidates, undefined)).toBe(standard);
  });

  it('builds the ring from what is on, in order', () => {
    const root = applyLayout(standard, candidates, { order: ['a5', 'a1', 'a2', 'a3', 'a4', 'a6', 'a7', 'a8'], off: ['a2', 'a3', 'a4', 'a6'] });
    expect(root.map((i) => i.id)).toEqual(['a5', 'a1', 'a7', 'a8']);
  });

  it('falls back to the standard ring when everything is switched off', () => {
    const everything = candidates.map((i) => i.id);
    expect(applyLayout(standard, candidates, { order: everything, off: everything })).toBe(standard);
  });
});
