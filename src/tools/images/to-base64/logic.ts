export interface DataUrlParts {
  mime: string;
  /** The Base64 payload on its own, without the `data:…;base64,` prefix. */
  payload: string;
}

/** Above this the string is longer than most build tools and editors enjoy. */
export const INLINE_WARNING_BYTES = 2 * 1024 * 1024;

export function splitDataUrl(dataUrl: string): DataUrlParts | null {
  const match = /^data:([^;,]*)(;[^,]*)?,(.*)$/s.exec(dataUrl.trim());
  if (!match) return null;
  return { mime: match[1] || 'application/octet-stream', payload: match[3] };
}

/** How many bytes a Base64 payload decodes to, padding accounted for. */
export function decodedByteLength(payload: string): number {
  const clean = payload.replace(/\s+/g, '');
  if (!clean) return 0;
  const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((clean.length * 3) / 4) - padding);
}

/** Past this a textarea full of Base64 makes the window stutter. */
export const MAX_TEXTAREA_CHARS = 500_000;

/**
 * Shorten a very long string for display only. The copy buttons always hand over
 * the full value, so the returned `hidden` count has to be shown next to it.
 */
export function truncateForDisplay(text: string, limit: number): { text: string; hidden: number } {
  if (text.length <= limit) return { text, hidden: 0 };
  return { text: text.slice(0, limit), hidden: text.length - limit };
}

export function cssSnippet(dataUrl: string): string {
  return `background-image: url("${dataUrl}");\nbackground-size: cover;\nbackground-repeat: no-repeat;`;
}

export function htmlSnippet(dataUrl: string, alt = ''): string {
  return `<img src="${dataUrl}" alt="${alt.replace(/"/g, '&quot;')}">`;
}

/** A safe stem for the .txt file the encoded string can be saved to. */
export function encodedFilename(name: string): string {
  const stem = name.replace(/\.[^./]+$/, '') || 'image';
  return `${stem}.base64.txt`;
}
