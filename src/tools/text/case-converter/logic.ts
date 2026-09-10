export type CaseMode =
  | 'lower'
  | 'upper'
  | 'title'
  | 'sentence'
  | 'camel'
  | 'pascal'
  | 'snake'
  | 'kebab'
  | 'constant'
  | 'dot'
  | 'train'
  | 'alternating'
  | 'inverse';

/** Words that stay lowercase in a title unless they open or close it. */
export const SMALL_WORDS = new Set([
  'a', 'an', 'and', 'as', 'at', 'but', 'by', 'en', 'for', 'from', 'if', 'in', 'into', 'nor',
  'of', 'on', 'onto', 'or', 'over', 'per', 'so', 'the', 'to', 'up', 'upon', 'v', 'via', 'vs',
  'with', 'yet',
]);

/** Split a string into its component words, understanding camelCase humps. */
export function splitWords(input: string): string[] {
  return input
    .replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, '$1 $2')
    .replace(/(\p{Lu}+)(\p{Lu}\p{Ll})/gu, '$1 $2')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

function capitalise(word: string): string {
  return word.replace(/\p{L}/u, (c) => c.toUpperCase());
}

/** Title Case a single line, keeping small words down unless first or last. */
export function titleCaseLine(line: string): string {
  const tokens = line.split(/(\s+)/);
  const wordIndexes = tokens.map((t, i) => (/\S/.test(t) ? i : -1)).filter((i) => i >= 0);
  const firstWord = wordIndexes[0];
  const lastWord = wordIndexes[wordIndexes.length - 1];
  return tokens
    .map((token, i) => {
      if (!/\S/.test(token)) return token;
      const edge = i === firstWord || i === lastWord;
      // Hyphenated compounds get the same treatment on each side.
      return token
        .split('-')
        .map((part, partIndex, parts) => {
          const lower = part.toLowerCase();
          const bare = lower.replace(/[^\p{L}\p{N}]/gu, '');
          const partEdge = edge && (partIndex === 0 || partIndex === parts.length - 1);
          if (!partEdge && SMALL_WORDS.has(bare)) return lower;
          return capitalise(lower);
        })
        .join('-');
    })
    .join('');
}

export function titleCase(text: string): string {
  return text.split('\n').map(titleCaseLine).join('\n');
}

/** Lowercase everything, then raise the first letter of each sentence. */
export function sentenceCase(text: string): string {
  return text
    .toLowerCase()
    .replace(/(^|[.!?…]["')\]]?\s+|\n[ \t]*)(\p{L})/gu, (_m, lead: string, letter: string) => lead + letter.toUpperCase());
}

export function alternatingCase(text: string): string {
  let upper = false;
  let out = '';
  for (const ch of text) {
    if (/\p{L}/u.test(ch)) {
      out += upper ? ch.toUpperCase() : ch.toLowerCase();
      upper = !upper;
    } else {
      out += ch;
    }
  }
  return out;
}

export function inverseCase(text: string): string {
  let out = '';
  for (const ch of text) {
    const upper = ch.toUpperCase();
    const lower = ch.toLowerCase();
    out += ch === lower && ch !== upper ? upper : ch === upper && ch !== lower ? lower : ch;
  }
  return out;
}

function joinWords(line: string, mode: CaseMode): string {
  const parts = splitWords(line);
  if (parts.length === 0) return '';
  const lower = parts.map((w) => w.toLowerCase());
  switch (mode) {
    case 'camel':
      return lower.map((w, i) => (i === 0 ? w : capitalise(w))).join('');
    case 'pascal':
      return lower.map(capitalise).join('');
    case 'snake':
      return lower.join('_');
    case 'kebab':
      return lower.join('-');
    case 'constant':
      return lower.join('_').toUpperCase();
    case 'dot':
      return lower.join('.');
    case 'train':
      return lower.map(capitalise).join('-');
    default:
      return line;
  }
}

/** Identifier styles are applied per line so a list of names stays a list. */
const PER_LINE: CaseMode[] = ['camel', 'pascal', 'snake', 'kebab', 'constant', 'dot', 'train'];

export function convertCase(text: string, mode: CaseMode): string {
  switch (mode) {
    case 'lower':
      return text.toLowerCase();
    case 'upper':
      return text.toUpperCase();
    case 'title':
      return titleCase(text);
    case 'sentence':
      return sentenceCase(text);
    case 'alternating':
      return alternatingCase(text);
    case 'inverse':
      return inverseCase(text);
    default:
      if (PER_LINE.includes(mode)) {
        return text.split('\n').map((line) => joinWords(line, mode)).join('\n');
      }
      return text;
  }
}
