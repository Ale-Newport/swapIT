import { describe, expect, it } from 'vitest';
import {
  RULE_ORDER,
  activeRules,
  countChanged,
  countConflicts,
  defaultRule,
  describeRule,
  isEffective,
  keyed,
  moveRule,
  normalizeExtension,
  todayStamp,
  type KeyedRule,
  type RenamePreview,
} from './logic';

describe('defaultRule', () => {
  it('produces a rule for every type the backend understands', () => {
    for (const type of RULE_ORDER) {
      expect(defaultRule(type).type).toBe(type);
    }
  });

  it('starts numbering at 1 with three digits, which is what people expect', () => {
    const rule = defaultRule('sequence');
    expect(rule).toEqual({ type: 'sequence', start: 1, padding: 3, separator: '_', position: 'suffix' });
  });
});

describe('isEffective', () => {
  it('treats an empty text rule as not yet worth sending', () => {
    expect(isEffective({ type: 'prefix', text: '' })).toBe(false);
    expect(isEffective({ type: 'prefix', text: 'IMG_' })).toBe(true);
  });

  it('ignores a find-and-replace with nothing to find, even with a replacement', () => {
    expect(isEffective({ type: 'replace', find: '', replace: 'x', all: true })).toBe(false);
  });

  it('accepts a replacement that deletes text', () => {
    expect(isEffective({ type: 'replace', find: 'draft', replace: '', all: true })).toBe(true);
  });

  it('rejects an extension that is only a dot or blanks', () => {
    expect(isEffective({ type: 'changeExtension', ext: '  ' })).toBe(false);
    expect(isEffective({ type: 'changeExtension', ext: '.jpg' })).toBe(true);
  });

  it('always applies rules that need no input', () => {
    expect(isEffective({ type: 'slugify' })).toBe(true);
    expect(isEffective({ type: 'transliterate' })).toBe(true);
    expect(isEffective({ type: 'case', mode: 'upper' })).toBe(true);
  });
});

describe('activeRules', () => {
  it('drops half-typed rules but keeps the order of the rest', () => {
    const rules: KeyedRule[] = [
      keyed({ type: 'prefix', text: 'IMG_' }),
      keyed({ type: 'suffix', text: '' }),
      keyed({ type: 'case', mode: 'lower' }),
    ];
    expect(activeRules(rules)).toEqual([
      { type: 'prefix', text: 'IMG_' },
      { type: 'case', mode: 'lower' },
    ]);
  });

  it('returns nothing when every rule is still empty', () => {
    expect(activeRules([keyed({ type: 'regex', pattern: '', replace: 'x' })])).toEqual([]);
  });
});

describe('normalizeExtension', () => {
  it('strips dots, spaces and case', () => {
    expect(normalizeExtension('  .JPG ')).toBe('jpg');
    expect(normalizeExtension('...png')).toBe('png');
    expect(normalizeExtension('tar.gz')).toBe('tar.gz');
  });
});

describe('describeRule', () => {
  it('prompts for the missing input instead of describing a no-op', () => {
    expect(describeRule({ type: 'prefix', text: '' })).toMatch(/type the text/i);
  });

  it('shows the padded first number for a sequence', () => {
    expect(describeRule({ type: 'sequence', start: 7, padding: 4, separator: '-', position: 'prefix' })).toContain(
      '0007-',
    );
  });
});

describe('moveRule', () => {
  const rules: KeyedRule[] = [
    { key: 'a', rule: { type: 'slugify' } },
    { key: 'b', rule: { type: 'transliterate' } },
    { key: 'c', rule: { type: 'case', mode: 'lower' } },
  ];

  it('swaps a rule with its neighbour', () => {
    expect(moveRule(rules, 1, -1).map((r) => r.key)).toEqual(['b', 'a', 'c']);
    expect(moveRule(rules, 1, 1).map((r) => r.key)).toEqual(['a', 'c', 'b']);
  });

  it('refuses to move past either end and returns the list untouched', () => {
    expect(moveRule(rules, 0, -1)).toBe(rules);
    expect(moveRule(rules, 2, 1)).toBe(rules);
    expect(moveRule(rules, 9, -1)).toBe(rules);
  });
});

describe('preview counters', () => {
  const previews: RenamePreview[] = [
    { path: '/a/1.jpg', from: '1.jpg', to: '1.jpg', conflict: false },
    { path: '/a/2.jpg', from: '2.jpg', to: 'x.jpg', conflict: true },
    { path: '/a/3.jpg', from: '3.jpg', to: 'x.jpg', conflict: true },
  ];

  it('counts collisions and real changes separately', () => {
    expect(countConflicts(previews)).toBe(2);
    expect(countChanged(previews)).toBe(2);
  });

  it('reports nothing for an empty preview', () => {
    expect(countConflicts([])).toBe(0);
    expect(countChanged([])).toBe(0);
  });
});

describe('todayStamp', () => {
  it('pads month and day so names sort correctly', () => {
    expect(todayStamp(new Date(2024, 0, 5))).toBe('2024-01-05');
    expect(todayStamp(new Date(2024, 11, 31))).toBe('2024-12-31');
  });
});
