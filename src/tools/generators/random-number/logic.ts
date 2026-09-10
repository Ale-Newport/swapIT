/**
 * Random numbers and dice. Everything random goes through an injectable `Rng`
 * so the parsing and sampling rules can be tested without randomness.
 */

export type Rng = (maxExclusive: number) => number;

/** Uniform integer in [0, maxExclusive) from the platform CSPRNG. */
export const randomInt: Rng = (maxExclusive) => {
  if (maxExclusive <= 0) throw new Error('Cannot pick a number from an empty range.');
  if (maxExclusive === 1) return 0;
  const limit = Math.floor(0xffffffff / maxExclusive) * maxExclusive;
  const buffer = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buffer);
    if (buffer[0] < limit) return buffer[0] % maxExclusive;
  }
};

// ------------------------------------------------------------------ numbers

export const MAX_COUNT = 10000;
export const MAX_PRECISION = 6;

export type SortOrder = 'none' | 'asc' | 'desc';

export interface NumberOptions {
  min: number;
  max: number;
  /** Decimal places. 0 means whole numbers. */
  precision: number;
  count: number;
  allowDuplicates: boolean;
  sort: SortOrder;
}

interface Grid {
  lo: number;
  hi: number;
  scale: number;
  distinct: number;
}

/**
 * Decimals are just integers on a finer grid: with two decimal places, 1.00–1.05
 * is six possible values. Working in that index space makes "no duplicates"
 * exact for decimals as well as whole numbers, and dodges float drift.
 */
export function gridFor(min: number, max: number, precision: number): Grid {
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    throw new Error('Both ends of the range have to be real numbers.');
  }
  const places = Math.max(0, Math.min(MAX_PRECISION, Math.round(precision)));
  const scale = 10 ** places;
  const a = Math.round(min * scale);
  const b = Math.round(max * scale);
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  if (!Number.isSafeInteger(lo) || !Number.isSafeInteger(hi)) {
    throw new Error('That range is too wide for this many decimal places. Use fewer decimals or a smaller range.');
  }
  return { lo, hi, scale, distinct: hi - lo + 1 };
}

/** How many different values the range can produce at this precision. */
export function distinctValues(min: number, max: number, precision: number): number {
  return gridFor(min, max, precision).distinct;
}

function sampleIndices(distinct: number, take: number, rng: Rng): number[] {
  // When a large share of the range is wanted, shuffling the whole range is both
  // faster and free of retry loops; otherwise reject-and-retry stays cheap.
  if (distinct <= 200_000 && take > distinct / 8) {
    const pool = Array.from({ length: distinct }, (_, i) => i);
    for (let i = 0; i < take; i += 1) {
      const j = i + rng(distinct - i);
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, take);
  }
  const seen = new Set<number>();
  const out: number[] = [];
  while (out.length < take) {
    const value = rng(distinct);
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

export function generateNumbers(options: NumberOptions, rng: Rng = randomInt): number[] {
  const grid = gridFor(options.min, options.max, options.precision);
  const wanted = Math.max(1, Math.min(MAX_COUNT, Math.round(options.count) || 1));
  const take = options.allowDuplicates ? wanted : Math.min(wanted, grid.distinct);

  const indices = options.allowDuplicates
    ? Array.from({ length: take }, () => rng(grid.distinct))
    : sampleIndices(grid.distinct, take, rng);

  const values = indices.map((i) => (grid.lo + i) / grid.scale);
  if (options.sort === 'asc') values.sort((a, b) => a - b);
  if (options.sort === 'desc') values.sort((a, b) => b - a);
  return values;
}

export function formatNumber(value: number, precision: number): string {
  const places = Math.max(0, Math.min(MAX_PRECISION, Math.round(precision)));
  return value.toFixed(places);
}

// ------------------------------------------------------------------ dice

export const MAX_DICE = 500;
export const MAX_SIDES = 1000;

export interface DiceTerm {
  count: number;
  sides: number;
  sign: 1 | -1;
}

export interface DiceNotation {
  terms: DiceTerm[];
  modifier: number;
  totalDice: number;
  /** Tidied form of what was typed, e.g. "2d6 + 1d4 − 1". */
  canonical: string;
}

const TOKEN = /([+-]?)(?:(\d*)d(\d+)|(\d+))/g;

/** Parse `3d6+2`, `d20`, `2d6 + 1d4 - 1` and friends. */
export function parseDice(input: string): DiceNotation {
  const raw = input.trim();
  if (!raw) throw new Error('Type a roll such as 3d6+2, d20 or 2d8-1.');
  const compact = raw.toLowerCase().replace(/\s+/g, '');

  const terms: DiceTerm[] = [];
  let modifier = 0;
  let consumed = 0;
  TOKEN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TOKEN.exec(compact)) !== null) {
    if (match.index !== consumed) break;
    consumed = TOKEN.lastIndex;
    const sign: 1 | -1 = match[1] === '-' ? -1 : 1;
    if (match[3] !== undefined) {
      const count = match[2] === '' ? 1 : parseInt(match[2], 10);
      const sides = parseInt(match[3], 10);
      if (count < 1) throw new Error('Roll at least one die — 0d6 has nothing to throw.');
      if (sides < 2) throw new Error('A die needs at least two sides, so d1 and d0 are out.');
      if (sides > MAX_SIDES) throw new Error(`A d${sides} is beyond the d${MAX_SIDES} limit.`);
      terms.push({ count, sides, sign });
    } else {
      modifier += sign * parseInt(match[4], 10);
    }
  }

  if (consumed !== compact.length) {
    throw new Error(`"${raw}" is not dice notation. Write it like 3d6+2, d20 or 2d6+1d4-1.`);
  }
  if (terms.length === 0) throw new Error(`"${raw}" has no dice in it. Write it like 3d6+2.`);

  const totalDice = terms.reduce((sum, t) => sum + t.count, 0);
  if (totalDice > MAX_DICE) {
    throw new Error(`That is ${totalDice} dice in one throw; ${MAX_DICE} is the limit.`);
  }

  const canonical =
    terms
      .map((t, i) => `${i === 0 ? (t.sign === -1 ? '−' : '') : t.sign === -1 ? ' − ' : ' + '}${t.count}d${t.sides}`)
      .join('') + (modifier === 0 ? '' : `${modifier < 0 ? ' − ' : ' + '}${Math.abs(modifier)}`);

  return { terms, modifier, totalDice, canonical };
}

export interface DiceRoll {
  term: DiceTerm;
  values: number[];
  subtotal: number;
}

export interface DiceResult {
  rolls: DiceRoll[];
  modifier: number;
  total: number;
}

export function rollDice(notation: DiceNotation, rng: Rng = randomInt): DiceResult {
  const rolls = notation.terms.map((term) => {
    const values = Array.from({ length: term.count }, () => rng(term.sides) + 1);
    const sum = values.reduce((a, b) => a + b, 0);
    return { term, values, subtotal: term.sign * sum };
  });
  const total = rolls.reduce((sum, r) => sum + r.subtotal, 0) + notation.modifier;
  return { rolls, modifier: notation.modifier, total };
}

/** Lowest and highest a notation can produce, for context next to a result. */
export function diceRange(notation: DiceNotation): { min: number; max: number } {
  let min = notation.modifier;
  let max = notation.modifier;
  for (const term of notation.terms) {
    const low = term.count;
    const high = term.count * term.sides;
    if (term.sign === 1) {
      min += low;
      max += high;
    } else {
      min -= high;
      max -= low;
    }
  }
  return { min, max };
}
