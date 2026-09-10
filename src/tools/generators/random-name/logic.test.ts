import { describe, expect, it } from 'vitest';
import {
  ADJECTIVES,
  MAX_COUNT,
  NOUNS,
  firstNamePool,
  makeCodename,
  makeName,
  makeNames,
  surnamePool,
  type NameOptions,
} from './logic';

const base: NameOptions = {
  kind: 'full',
  locale: 'en',
  gender: 'any',
  count: 10,
  separator: '-',
  codenameNumber: false,
  twoSurnames: false,
};

describe('pools', () => {
  it('narrows to the gender-neutral list when asked', () => {
    const any = firstNamePool('en', 'any');
    const neutral = firstNamePool('en', 'neutral');
    expect(neutral.length).toBeLessThan(any.length);
    for (const name of neutral) expect(any).toContain(name);
  });

  it('combines both locales when neither is chosen', () => {
    expect(surnamePool('both').length).toBe(surnamePool('en').length + surnamePool('es').length);
    expect(firstNamePool('both', 'neutral').length).toBe(
      firstNamePool('en', 'neutral').length + firstNamePool('es', 'neutral').length,
    );
  });
});

describe('makeName', () => {
  it('returns one word for first or last, and two for a full name', () => {
    expect(makeName({ ...base, kind: 'first' }).split(' ')).toHaveLength(1);
    expect(makeName({ ...base, kind: 'last' }).split(' ')).toHaveLength(1);
    expect(makeName({ ...base, kind: 'full' }).split(' ')).toHaveLength(2);
  });

  it('adds a second surname for the Spanish convention', () => {
    expect(makeName({ ...base, locale: 'es', twoSurnames: true }).split(' ')).toHaveLength(3);
    expect(makeName({ ...base, kind: 'last', locale: 'es', twoSurnames: true }).split(' ')).toHaveLength(2);
  });

  it('only draws names that are in the pools', () => {
    for (let i = 0; i < 200; i += 1) {
      const [first, last] = makeName(base).split(' ');
      expect(firstNamePool('en', 'any')).toContain(first);
      expect(surnamePool('en')).toContain(last);
    }
  });
});

describe('makeCodename', () => {
  it('joins an adjective and a noun with the chosen separator', () => {
    for (const separator of ['-', '_', ' '] as const) {
      const codename = makeCodename({ separator, codenameNumber: false });
      const [adjective, noun, extra] = codename.split(separator);
      expect(ADJECTIVES).toContain(adjective);
      expect(NOUNS).toContain(noun);
      expect(extra).toBeUndefined();
    }
  });

  it('appends a two-digit number when asked', () => {
    for (let i = 0; i < 100; i += 1) {
      const parts = makeCodename({ separator: '-', codenameNumber: true }).split('-');
      expect(parts).toHaveLength(3);
      expect(Number(parts[2])).toBeGreaterThanOrEqual(10);
      expect(Number(parts[2])).toBeLessThanOrEqual(99);
    }
  });

  it('can run the words together with no separator', () => {
    const codename = makeCodename({ separator: '', codenameNumber: false });
    expect(codename).toMatch(/^[a-z]+$/);
  });

  it('has enough combinations to be useful for branch names', () => {
    expect(ADJECTIVES.length * NOUNS.length).toBeGreaterThan(5000);
    const seen = new Set(Array.from({ length: 200 }, () => makeCodename({ separator: '-', codenameNumber: false })));
    expect(seen.size).toBeGreaterThan(180);
  });
});

describe('makeNames', () => {
  it('returns the requested count, capped', () => {
    expect(makeNames({ ...base, count: 37 })).toHaveLength(37);
    expect(makeNames({ ...base, count: 0 })).toHaveLength(1);
    expect(makeNames({ ...base, count: MAX_COUNT + 100 })).toHaveLength(MAX_COUNT);
  });
});
