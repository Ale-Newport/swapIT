import { describe, it, expect } from 'vitest';
import {
  cssSnippet,
  decodedByteLength,
  encodedFilename,
  htmlSnippet,
  splitDataUrl,
  truncateForDisplay,
} from './logic';

describe('splitDataUrl', () => {
  it('separates the mime type from the payload', () => {
    expect(splitDataUrl('data:image/png;base64,iVBORw0KGgo=')).toEqual({
      mime: 'image/png',
      payload: 'iVBORw0KGgo=',
    });
  });

  it('handles a data URL with no mime type', () => {
    expect(splitDataUrl('data:;base64,QUJD')).toEqual({ mime: 'application/octet-stream', payload: 'QUJD' });
  });

  it('returns null for anything that is not a data URL', () => {
    expect(splitDataUrl('iVBORw0KGgo=')).toBeNull();
    expect(splitDataUrl('')).toBeNull();
    expect(splitDataUrl('https://example.com/a.png')).toBeNull();
  });
});

describe('decodedByteLength', () => {
  it('accounts for padding', () => {
    expect(decodedByteLength('QQ==')).toBe(1);
    expect(decodedByteLength('QUI=')).toBe(2);
    expect(decodedByteLength('QUJD')).toBe(3);
    expect(decodedByteLength('')).toBe(0);
  });

  it('ignores line breaks in a wrapped payload', () => {
    expect(decodedByteLength('QUJD\nQUJD\n')).toBe(6);
  });
});

describe('snippets', () => {
  const url = 'data:image/png;base64,iVBORw0KGgo=';

  it('quotes the URL so the base64 padding cannot break the CSS', () => {
    expect(cssSnippet(url)).toContain('url("data:image/png;base64,iVBORw0KGgo=")');
  });

  it('escapes quotes in the alt text', () => {
    expect(htmlSnippet(url, 'a "wide" shot')).toBe(`<img src="${url}" alt="a &quot;wide&quot; shot">`);
  });
});

describe('truncateForDisplay', () => {
  it('leaves short strings alone', () => {
    expect(truncateForDisplay('abc', 10)).toEqual({ text: 'abc', hidden: 0 });
  });

  it('reports exactly how much was hidden', () => {
    const result = truncateForDisplay('a'.repeat(1000), 100);
    expect(result.text).toHaveLength(100);
    expect(result.hidden).toBe(900);
  });
});

describe('encodedFilename', () => {
  it('swaps the image extension for .base64.txt', () => {
    expect(encodedFilename('logo.png')).toBe('logo.base64.txt');
    expect(encodedFilename('holiday.photo.jpeg')).toBe('holiday.photo.base64.txt');
    expect(encodedFilename('noextension')).toBe('noextension.base64.txt');
    expect(encodedFilename('.hidden')).toBe('image.base64.txt');
  });
});
