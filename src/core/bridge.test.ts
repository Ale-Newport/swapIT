import { describe, expect, it } from 'vitest';
import { asToolboxError, toBatch } from './bridge';

/**
 * `toBatch` sits between every backend command and the result panel. Rust
 * commands return three different shapes — a BatchResult, a single FileResult,
 * or an array of FileResults — and the UI has to render all of them.
 */
describe('toBatch', () => {
  it('passes a BatchResult through untouched', () => {
    const batch = { results: [{ path: '/a.jpg', name: 'a.jpg', size: 10, disposition: 'created' }], failures: [], cancelled: false, elapsedMs: 5 };
    expect(toBatch(batch)).toBe(batch);
  });

  it('wraps a single FileResult', () => {
    const single = { path: '/a.jpg', name: 'a.jpg', size: 10, disposition: 'created' };
    const batch = toBatch(single);
    expect(batch.results).toHaveLength(1);
    expect(batch.results[0].name).toBe('a.jpg');
    expect(batch.failures).toEqual([]);
  });

  it('wraps an array of FileResults', () => {
    const many = [
      { path: '/a.jpg', name: 'a.jpg', size: 10, disposition: 'created' },
      { path: '/b.jpg', name: 'b.jpg', size: 20, disposition: 'renamed' },
    ];
    expect(toBatch(many).results).toHaveLength(2);
  });

  it('returns an empty batch for data commands rather than throwing', () => {
    // probe_media, ocr_files and friends return their own shapes; the result
    // panel must degrade to "nothing produced" instead of crashing.
    expect(toBatch([{ duration: 12, codec: 'h264' }]).results).toEqual([]);
    expect(toBatch({ text: 'hello' }).results).toEqual([]);
    expect(toBatch(null).results).toEqual([]);
    expect(toBatch(undefined).results).toEqual([]);
    expect(toBatch('a string').results).toEqual([]);
  });
});

describe('asToolboxError', () => {
  it('passes a structured backend error through', () => {
    const err = { message: 'FFmpeg is required.', details: 'brew install ffmpeg', kind: 'missing_dependency' };
    expect(asToolboxError(err)).toBe(err);
  });

  it('turns a thrown Error into the same shape', () => {
    const e = asToolboxError(new Error('boom'));
    expect(e.message).toBe('boom');
    expect(e.kind).toBe('internal');
  });

  it('never produces an empty message', () => {
    expect(asToolboxError(null).message.length).toBeGreaterThan(0);
    expect(asToolboxError(undefined).message.length).toBeGreaterThan(0);
    expect(asToolboxError('plain string').message).toBe('plain string');
  });
});
