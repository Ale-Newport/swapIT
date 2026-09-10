import { describe, expect, it } from 'vitest';
import {
  AMBIGUOUS,
  DEFAULT_SYMBOLS,
  DIGITS,
  LOWERCASE,
  UPPERCASE,
  WORDS,
  characterGroups,
  formatCrackTime,
  generatePassphrase,
  generatePassword,
  passphraseEntropy,
  passwordEntropy,
  poolFor,
  randomInt,
  strengthFor,
  type PasswordOptions,
} from './logic';

const base: PasswordOptions = {
  length: 16,
  lowercase: true,
  uppercase: true,
  digits: true,
  symbols: true,
  symbolSet: DEFAULT_SYMBOLS,
  excludeAmbiguous: false,
  requireEach: true,
};

describe('randomInt', () => {
  it('stays inside the range and covers it', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i += 1) {
      const n = randomInt(6);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(6);
      seen.add(n);
    }
    expect(seen.size).toBe(6);
  });

  it('always returns 0 for a single choice and refuses an empty set', () => {
    expect(randomInt(1)).toBe(0);
    expect(() => randomInt(0)).toThrow();
  });
});

describe('characterGroups', () => {
  it('drops look-alike characters from every group when asked', () => {
    const groups = characterGroups({ ...base, excludeAmbiguous: true });
    const joined = groups.join('');
    for (const ch of AMBIGUOUS) expect(joined).not.toContain(ch);
    expect(joined).toContain('o');
    expect(joined).toContain('2');
  });

  it('de-duplicates a custom symbol set and ignores whitespace', () => {
    const groups = characterGroups({ ...base, lowercase: false, uppercase: false, digits: false, symbolSet: '## $ $ !' });
    expect(groups).toEqual(['#$!']);
  });

  it('drops a set that is empty after exclusions', () => {
    const groups = characterGroups({
      ...base,
      lowercase: false,
      uppercase: false,
      digits: false,
      symbolSet: '',
    });
    expect(groups).toEqual([]);
  });
});

describe('generatePassword', () => {
  it('produces exactly the requested length', () => {
    for (const length of [8, 16, 33, 128]) {
      expect(generatePassword({ ...base, length })).toHaveLength(length);
    }
  });

  it('guarantees one character from every selected set, not just usually', () => {
    for (let i = 0; i < 300; i += 1) {
      const pw = generatePassword({ ...base, length: 4 });
      expect([...pw].some((c) => LOWERCASE.includes(c))).toBe(true);
      expect([...pw].some((c) => UPPERCASE.includes(c))).toBe(true);
      expect([...pw].some((c) => DIGITS.includes(c))).toBe(true);
      expect([...pw].some((c) => DEFAULT_SYMBOLS.includes(c))).toBe(true);
    }
  });

  it('does not park the guaranteed characters at the front', () => {
    // Without a shuffle, position 0 would always be lowercase.
    const firsts = new Set(
      Array.from({ length: 200 }, () => generatePassword({ ...base, length: 8 })[0]).map((c) =>
        LOWERCASE.includes(c) ? 'lower' : UPPERCASE.includes(c) ? 'upper' : DIGITS.includes(c) ? 'digit' : 'symbol',
      ),
    );
    expect(firsts.size).toBeGreaterThan(1);
  });

  it('never emits an excluded character', () => {
    for (let i = 0; i < 200; i += 1) {
      const pw = generatePassword({ ...base, length: 40, excludeAmbiguous: true });
      for (const ch of pw) expect(AMBIGUOUS).not.toContain(ch);
    }
  });

  it('refuses to run with no character sets selected', () => {
    expect(() =>
      generatePassword({ ...base, lowercase: false, uppercase: false, digits: false, symbols: false }),
    ).toThrow(/at least one kind/i);
  });

  it('explains when the length cannot fit one of each', () => {
    expect(() => generatePassword({ ...base, length: 3 })).toThrow(/at least 4 characters/i);
  });

  it('still fills the length when the guarantee is off', () => {
    const pw = generatePassword({ ...base, requireEach: false, length: 20 });
    expect(pw).toHaveLength(20);
    for (const ch of pw) expect(poolFor(base)).toContain(ch);
  });
});

describe('generatePassphrase', () => {
  const list = ['alpha', 'bravo', 'charlie'];

  it('joins the requested number of words with the separator', () => {
    const phrase = generatePassphrase(
      { words: 4, separator: '-', capitalisation: 'lower', includeNumber: false },
      randomInt,
      list,
    );
    expect(phrase.split('-')).toHaveLength(4);
    for (const word of phrase.split('-')) expect(list).toContain(word);
  });

  it('adds a two-digit tail as its own element', () => {
    for (let i = 0; i < 100; i += 1) {
      const parts = generatePassphrase(
        { words: 2, separator: '.', capitalisation: 'title', includeNumber: true },
        randomInt,
        list,
      ).split('.');
      expect(parts).toHaveLength(3);
      expect(Number(parts[2])).toBeGreaterThanOrEqual(10);
      expect(Number(parts[2])).toBeLessThanOrEqual(99);
      expect(parts[0][0]).toBe(parts[0][0].toUpperCase());
    }
  });

  it('uppercases every word when asked', () => {
    const phrase = generatePassphrase(
      { words: 3, separator: ' ', capitalisation: 'upper', includeNumber: false },
      randomInt,
      list,
    );
    expect(phrase).toBe(phrase.toUpperCase());
  });

  it('refuses a zero-word phrase', () => {
    expect(() =>
      generatePassphrase({ words: 0, separator: '-', capitalisation: 'lower', includeNumber: false }, randomInt, list),
    ).toThrow();
  });
});

describe('entropy', () => {
  it('is log2(pool) per character', () => {
    expect(passwordEntropy(64, 10)).toBeCloseTo(60, 10);
    expect(passwordEntropy(26, 8)).toBeCloseTo(8 * Math.log2(26), 10);
  });

  it('is zero when there is nothing to choose from', () => {
    expect(passwordEntropy(1, 20)).toBe(0);
    expect(passwordEntropy(90, 0)).toBe(0);
  });

  it('counts words for a passphrase and ignores deterministic capitalisation', () => {
    const lower = passphraseEntropy({ words: 5, separator: '-', capitalisation: 'lower', includeNumber: false }, 1024);
    const title = passphraseEntropy({ words: 5, separator: '-', capitalisation: 'title', includeNumber: false }, 1024);
    expect(lower).toBeCloseTo(50, 10);
    expect(title).toBe(lower);
  });

  it('credits the number tail with log2(90) bits', () => {
    const withNumber = passphraseEntropy(
      { words: 4, separator: '-', capitalisation: 'lower', includeNumber: true },
      1024,
    );
    expect(withNumber).toBeCloseTo(40 + Math.log2(90), 10);
  });

  it('uses the real bundled word list size', () => {
    expect(WORDS.length).toBeGreaterThan(700);
    expect(new Set(WORDS).size).toBe(WORDS.length);
  });
});

describe('strengthFor', () => {
  it('brackets the crack time from the bits', () => {
    expect(strengthFor(30).tone).toBe('danger');
    expect(strengthFor(30).crackTime).toBe('instantly');
    expect(strengthFor(70).tone).toBe('warn');
    expect(strengthFor(128).tone).toBe('success');
    expect(strengthFor(128).label).toBe('Very strong');
  });

  it('scales with the assumed guess rate', () => {
    const fast = strengthFor(60, 1e11).seconds;
    const slow = strengthFor(60, 1e5).seconds;
    expect(slow / fast).toBeCloseTo(1e6, 0);
  });

  it('reads out long times in words', () => {
    expect(formatCrackTime(0.4)).toBe('instantly');
    expect(formatCrackTime(90)).toBe('about 2 minutes');
    expect(formatCrackTime(31_557_600 * 5)).toBe('about 5 years');
    expect(formatCrackTime(31_557_600 * 5e6)).toMatch(/million years/);
    expect(formatCrackTime(Number.POSITIVE_INFINITY)).toMatch(/universe/);
  });
});
