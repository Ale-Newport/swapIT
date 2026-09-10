import { WORDS } from './words';

/**
 * Password and passphrase generation. Every random choice comes from
 * `crypto.getRandomValues` through `randomInt`, which uses rejection sampling so
 * the distribution stays uniform — a plain modulo would quietly favour the low
 * end of the range.
 */

export const LOWERCASE = 'abcdefghijklmnopqrstuvwxyz';
export const UPPERCASE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
export const DIGITS = '0123456789';
export const DEFAULT_SYMBOLS = '!@#$%^&*()-_=+[]{};:,.?/';
/** Characters that look like each other in most fonts. */
export const AMBIGUOUS = '0O1lI|';

export const MIN_LENGTH = 8;
export const MAX_LENGTH = 128;

/** Guesses per second the crack estimate assumes: a fast offline GPU attack. */
export const GUESSES_PER_SECOND = 1e11;

export type RandomInt = (maxExclusive: number) => number;

/** Uniform integer in [0, maxExclusive) from the platform CSPRNG. */
export const randomInt: RandomInt = (maxExclusive) => {
  if (maxExclusive <= 0) throw new Error('Cannot pick from an empty set.');
  if (maxExclusive === 1) return 0;
  const limit = Math.floor(0xffffffff / maxExclusive) * maxExclusive;
  const buffer = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buffer);
    if (buffer[0] < limit) return buffer[0] % maxExclusive;
  }
};

export interface CharsetOptions {
  lowercase: boolean;
  uppercase: boolean;
  digits: boolean;
  symbols: boolean;
  symbolSet: string;
  excludeAmbiguous: boolean;
}

export interface PasswordOptions extends CharsetOptions {
  length: number;
  requireEach: boolean;
}

function uniqueChars(input: string): string {
  const seen = new Set<string>();
  let out = '';
  for (const ch of input) {
    if (ch.trim() === '' || seen.has(ch)) continue;
    seen.add(ch);
    out += ch;
  }
  return out;
}

/** The selected character groups, already stripped of anything excluded. */
export function characterGroups(options: CharsetOptions): string[] {
  const strip = (set: string) =>
    options.excludeAmbiguous ? [...set].filter((c) => !AMBIGUOUS.includes(c)).join('') : set;
  const groups: string[] = [];
  if (options.lowercase) groups.push(strip(LOWERCASE));
  if (options.uppercase) groups.push(strip(UPPERCASE));
  if (options.digits) groups.push(strip(DIGITS));
  if (options.symbols) groups.push(strip(uniqueChars(options.symbolSet)));
  return groups.filter((g) => g.length > 0);
}

export function poolFor(options: CharsetOptions): string {
  return uniqueChars(characterGroups(options).join(''));
}

function shuffle(chars: string[], rng: RandomInt): string[] {
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = rng(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars;
}

export function generatePassword(options: PasswordOptions, rng: RandomInt = randomInt): string {
  const groups = characterGroups(options);
  if (groups.length === 0) {
    throw new Error('Turn on at least one kind of character — there is nothing to build a password from.');
  }
  const length = Math.round(options.length);
  if (length < 1) throw new Error('Ask for a password of at least one character.');
  if (options.requireEach && length < groups.length) {
    throw new Error(
      `Guaranteeing one of each kind needs at least ${groups.length} characters. Raise the length or turn a character set off.`,
    );
  }
  const pool = poolFor(options);
  const chars: string[] = [];
  if (options.requireEach) {
    for (const group of groups) chars.push(group[rng(group.length)]);
  }
  while (chars.length < length) chars.push(pool[rng(pool.length)]);
  return shuffle(chars, rng).join('');
}

export type Capitalisation = 'lower' | 'title' | 'upper';

export interface PassphraseOptions {
  words: number;
  separator: string;
  capitalisation: Capitalisation;
  includeNumber: boolean;
}

/** The two-digit tail a passphrase can carry: 10–99, so 90 possibilities. */
const NUMBER_CHOICES = 90;

export function generatePassphrase(
  options: PassphraseOptions,
  rng: RandomInt = randomInt,
  list: string[] = WORDS,
): string {
  const count = Math.round(options.words);
  if (count < 1) throw new Error('A passphrase needs at least one word.');
  const parts: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const word = list[rng(list.length)];
    parts.push(
      options.capitalisation === 'upper'
        ? word.toUpperCase()
        : options.capitalisation === 'title'
          ? word[0].toUpperCase() + word.slice(1)
          : word,
    );
  }
  if (options.includeNumber) parts.push(String(10 + rng(NUMBER_CHOICES)));
  return parts.join(options.separator);
}

// ------------------------------------------------------------------ strength

/**
 * Entropy of a uniformly random string: log2(pool) bits per character.
 * This is the honest number only when every character really is drawn at random
 * from the whole pool — see the note the UI shows alongside it.
 */
export function passwordEntropy(poolSize: number, length: number): number {
  if (poolSize <= 1 || length <= 0) return 0;
  return Math.log2(poolSize) * length;
}

export function passphraseEntropy(options: PassphraseOptions, listSize: number = WORDS.length): number {
  const words = Math.max(0, Math.round(options.words));
  // Capitalisation is applied to every word the same way, so it adds nothing.
  return words * Math.log2(listSize) + (options.includeNumber ? Math.log2(NUMBER_CHOICES) : 0);
}

export type StrengthTone = 'danger' | 'warn' | 'success';

export interface Strength {
  bits: number;
  label: string;
  tone: StrengthTone;
  /** Seconds to find it on average at GUESSES_PER_SECOND. */
  seconds: number;
  crackTime: string;
}

const SECOND = 1;
const MINUTE = 60;
const HOUR = 3600;
const DAY = 86400;
const MONTH = 2_629_800;
const YEAR = 31_557_600;

export function formatCrackTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return 'longer than the universe has existed';
  if (seconds < SECOND) return 'instantly';
  if (seconds < MINUTE) return `about ${Math.max(1, Math.round(seconds))} seconds`;
  if (seconds < HOUR) return `about ${Math.round(seconds / MINUTE)} minutes`;
  if (seconds < DAY) return `about ${Math.round(seconds / HOUR)} hours`;
  if (seconds < MONTH) return `about ${Math.round(seconds / DAY)} days`;
  if (seconds < YEAR) return `about ${Math.round(seconds / MONTH)} months`;
  const years = seconds / YEAR;
  if (years < 1000) return `about ${Math.round(years)} years`;
  if (years < 1e6) return `about ${Math.round(years / 1000).toLocaleString()} thousand years`;
  if (years < 1e9) return `about ${Math.round(years / 1e6).toLocaleString()} million years`;
  if (years < 1e12) return `about ${Math.round(years / 1e9).toLocaleString()} billion years`;
  if (years < 1e15) return `about ${Math.round(years / 1e12).toLocaleString()} trillion years`;
  return 'far longer than the age of the universe';
}

export function strengthFor(bits: number, guessesPerSecond = GUESSES_PER_SECOND): Strength {
  // On average an attacker finds it after half the keyspace.
  const seconds = Math.pow(2, bits - 1) / guessesPerSecond;
  const label =
    bits < 40 ? 'Very weak' : bits < 60 ? 'Weak' : bits < 80 ? 'Reasonable' : bits < 100 ? 'Strong' : 'Very strong';
  const tone: StrengthTone = bits < 60 ? 'danger' : bits < 80 ? 'warn' : 'success';
  return { bits, label, tone, seconds, crackTime: formatCrackTime(seconds) };
}

export { WORDS };
