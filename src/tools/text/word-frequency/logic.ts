export type StopWordSet = 'none' | 'english' | 'spanish' | 'both';

export interface FrequencyOptions {
  caseSensitive: boolean;
  stopWords: StopWordSet;
  /** Words shorter than this are ignored. */
  minLength: number;
  /** 0 shows every word. */
  topN: number;
}

export interface FrequencyRow {
  rank: number;
  word: string;
  count: number;
  /** Share of the counted words, 0–100. */
  share: number;
}

export interface FrequencyResult {
  rows: FrequencyRow[];
  /** Words found before any filtering. */
  totalWords: number;
  /** Words left after the stop-word and length filters. */
  countedWords: number;
  uniqueWords: number;
}

export const ENGLISH_STOP_WORDS = [
  'a', 'about', 'after', 'all', 'also', 'am', 'an', 'and', 'any', 'are', 'as', 'at', 'be', 'because',
  'been', 'but', 'by', 'can', 'could', 'did', 'do', 'does', 'for', 'from', 'had', 'has', 'have', 'he',
  'her', 'here', 'him', 'his', 'how', 'i', 'if', 'in', 'into', 'is', 'it', 'its', 'just', 'me', 'more',
  'my', 'no', 'not', 'now', 'of', 'on', 'one', 'only', 'or', 'other', 'our', 'out', 'over', 'said',
  'she', 'so', 'some', 'such', 'than', 'that', 'the', 'their', 'them', 'then', 'there', 'these', 'they',
  'this', 'those', 'to', 'too', 'up', 'us', 'very', 'was', 'we', 'were', 'what', 'when', 'where',
  'which', 'while', 'who', 'why', 'will', 'with', 'would', 'you', 'your',
];

export const SPANISH_STOP_WORDS = [
  'a', 'al', 'algo', 'ante', 'antes', 'aqui', 'aquí', 'como', 'con', 'contra', 'cual', 'cuando', 'de',
  'del', 'desde', 'donde', 'dos', 'e', 'el', 'él', 'ella', 'ellos', 'en', 'entre', 'era', 'es', 'esa',
  'ese', 'eso', 'esta', 'está', 'este', 'esto', 'fue', 'ha', 'hasta', 'hay', 'la', 'las', 'le', 'les',
  'lo', 'los', 'más', 'mas', 'me', 'mi', 'muy', 'no', 'nos', 'o', 'para', 'pero', 'poco', 'por',
  'porque', 'que', 'qué', 'se', 'ser', 'si', 'sí', 'sin', 'sobre', 'son', 'su', 'sus', 'también',
  'te', 'tiene', 'todo', 'tu', 'un', 'una', 'uno', 'unos', 'y', 'ya',
];

export function stopWordSet(which: StopWordSet): Set<string> {
  switch (which) {
    case 'english':
      return new Set(ENGLISH_STOP_WORDS);
    case 'spanish':
      return new Set(SPANISH_STOP_WORDS);
    case 'both':
      return new Set([...ENGLISH_STOP_WORDS, ...SPANISH_STOP_WORDS]);
    default:
      return new Set();
  }
}

/** Letters and digits, with apostrophes and hyphens allowed inside a word. */
const WORD_RE = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu;

export function tokenize(text: string): string[] {
  return text.match(WORD_RE) ?? [];
}

export function wordFrequency(text: string, opts: FrequencyOptions): FrequencyResult {
  const tokens = tokenize(text);
  const stop = stopWordSet(opts.stopWords);
  const counts = new Map<string, number>();
  let countedWords = 0;

  for (const token of tokens) {
    const word = opts.caseSensitive ? token : token.toLowerCase();
    if (word.length < opts.minLength) continue;
    // Stop-word lists are lower case, so compare on the folded form either way.
    if (stop.size > 0 && stop.has(word.toLowerCase())) continue;
    counts.set(word, (counts.get(word) ?? 0) + 1);
    countedWords += 1;
  }

  const ranked = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([word, count], i) => ({
      rank: i + 1,
      word,
      count,
      share: countedWords === 0 ? 0 : (count / countedWords) * 100,
    }));

  return {
    rows: opts.topN > 0 ? ranked.slice(0, opts.topN) : ranked,
    totalWords: tokens.length,
    countedWords,
    uniqueWords: counts.size,
  };
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toCsv(rows: FrequencyRow[]): string {
  const header = 'rank,word,count,share';
  const body = rows.map((r) => [r.rank, csvCell(r.word), r.count, `${r.share.toFixed(2)}%`].join(','));
  return [header, ...body].join('\n');
}
