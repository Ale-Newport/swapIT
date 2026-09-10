/** Counting rules shared by the counter UI and its tests. */

export interface TextStats {
  characters: number;
  charactersNoSpaces: number;
  words: number;
  sentences: number;
  paragraphs: number;
  lines: number;
  uniqueWords: number;
  readingLabel: string;
}

export interface LineReportRow {
  n: number;
  text: string;
  length: number;
  over: boolean;
}

/**
 * A word is a run of letters or digits, optionally joined by an apostrophe,
 * hyphen or underscore — so "don't" and "state-of-the-art" count once each.
 */
const WORD_RE = /[\p{L}\p{N}]+(?:['’_-][\p{L}\p{N}]+)*/gu;

export function words(text: string): string[] {
  return text.match(WORD_RE) ?? [];
}

export function readingTime(wordCount: number, wpm = 200): string {
  if (wordCount === 0) return '—';
  const minutes = wordCount / wpm;
  if (minutes < 0.5) return 'under a minute';
  return `about ${Math.max(1, Math.round(minutes))} min`;
}

export function countText(text: string, wpm = 200): TextStats {
  const found = words(text);
  const unique = new Set(found.map((w) => w.toLowerCase()));
  const sentences = text.split(/[.!?…]+/).filter((part) => /[\p{L}\p{N}]/u.test(part)).length;
  const paragraphs = text.split(/\n[ \t]*\n/).filter((part) => part.trim().length > 0).length;
  return {
    characters: text.length,
    charactersNoSpaces: text.replace(/\s/g, '').length,
    words: found.length,
    sentences,
    paragraphs,
    lines: text.length === 0 ? 0 : text.split('\n').length,
    uniqueWords: unique.size,
    readingLabel: readingTime(found.length, wpm),
  };
}

export function lineReport(text: string, limit: number): LineReportRow[] {
  if (text.length === 0) return [];
  return text.split('\n').map((line, i) => ({
    n: i + 1,
    text: line,
    length: line.length,
    over: line.length > limit,
  }));
}

/** The plain-text summary the copy and save buttons hand over. */
export function statsToText(stats: TextStats, limit: number, over: number): string {
  return [
    `Characters           ${stats.characters}`,
    `Characters (no spaces) ${stats.charactersNoSpaces}`,
    `Words                ${stats.words}`,
    `Unique words         ${stats.uniqueWords}`,
    `Sentences            ${stats.sentences}`,
    `Paragraphs           ${stats.paragraphs}`,
    `Lines                ${stats.lines}`,
    `Reading time         ${stats.readingLabel}`,
    `Lines over ${limit}      ${over}`,
  ].join('\n');
}
