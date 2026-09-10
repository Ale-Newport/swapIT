export interface SlugOptions {
  separator: '-' | '_';
  stripStopWords: boolean;
  /** 0 means no limit. Truncation always falls on a word boundary. */
  maxLength: number;
}

/**
 * Characters that do not decompose on their own — everything with a plain
 * combining accent (á, ñ, ü, č…) is handled by the NFD pass below.
 */
export const TRANSLITERATE: Record<string, string> = {
  'æ': 'ae',
  'œ': 'oe',
  'ø': 'o',
  'ß': 'ss',
  'ð': 'd',
  'þ': 'th',
  'đ': 'd',
  'ħ': 'h',
  'ı': 'i',
  'ł': 'l',
  'ŀ': 'l',
  'ŋ': 'ng',
  'ŧ': 't',
  'ə': 'e',
  'ĸ': 'k',
  '§': 'section',
  '©': 'c',
  '®': 'r',
  '°': 'deg',
  'µ': 'u',
  'ª': 'a',
  'º': 'o',
  '€': 'eur',
  '£': 'gbp',
  '$': 'usd',
  '¥': 'jpy',
  '&': ' and ',
  '@': ' at ',
  '+': ' plus ',
  '½': ' 1-2',
  '¼': ' 1-4',
  '¾': ' 3-4',
};

const ENGLISH_STOP_WORDS = [
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'for', 'from', 'how', 'if', 'in', 'into',
  'is', 'it', 'its', 'of', 'on', 'or', 'that', 'the', 'this', 'to', 'was', 'what', 'when', 'where',
  'which', 'who', 'will', 'with', 'you', 'your',
];

const SPANISH_STOP_WORDS = [
  'al', 'como', 'con', 'de', 'del', 'el', 'en', 'la', 'las', 'lo', 'los', 'para', 'por', 'que',
  'se', 'su', 'sus', 'un', 'una', 'unos', 'unas', 'y', 'o',
];

export const STOP_WORDS = new Set([...ENGLISH_STOP_WORDS, ...SPANISH_STOP_WORDS]);

/** Fold accents and known ligatures down to plain ASCII letters. */
export function transliterate(text: string): string {
  let out = '';
  for (const ch of text.toLowerCase()) {
    out += TRANSLITERATE[ch] ?? ch;
  }
  return out.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function truncateOnWordBoundary(words: string[], separator: string, maxLength: number): string[] {
  if (maxLength <= 0) return words;
  const kept: string[] = [];
  let length = 0;
  for (const word of words) {
    const added = kept.length === 0 ? word.length : word.length + separator.length;
    if (length + added > maxLength) break;
    kept.push(word);
    length += added;
  }
  // A single word longer than the limit still has to be cut somewhere.
  if (kept.length === 0 && words.length > 0) return [words[0].slice(0, maxLength)];
  return kept;
}

export function slugifyLine(line: string, opts: SlugOptions): string {
  const folded = transliterate(line);
  const all = folded.split(/[^a-z0-9]+/).filter(Boolean);
  let words = all;
  if (opts.stripStopWords) {
    const kept = all.filter((w) => !STOP_WORDS.has(w));
    // Never let the stop-word list empty a slug completely.
    if (kept.length > 0) words = kept;
  }
  return truncateOnWordBoundary(words, opts.separator, opts.maxLength).join(opts.separator);
}

export interface SlugResult {
  output: string;
  slugs: string[];
  /** Slugs that appear more than once — they would collide as URLs. */
  duplicates: number;
  /** Lines that produced nothing at all. */
  empty: number;
}

export function slugifyText(text: string, opts: SlugOptions): SlugResult {
  const lines = text.split(/\r?\n/);
  const slugs = lines.map((line) => slugifyLine(line, opts));
  const counts = new Map<string, number>();
  for (const slug of slugs) {
    if (!slug) continue;
    counts.set(slug, (counts.get(slug) ?? 0) + 1);
  }
  return {
    output: slugs.join('\n'),
    slugs,
    duplicates: [...counts.values()].filter((n) => n > 1).length,
    empty: slugs.filter((s, i) => !s && lines[i].trim() !== '').length,
  };
}
