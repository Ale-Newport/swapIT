import { describe, expect, it } from 'vitest';
import { isWrongPassword, summariseFailures, wrongPasswordMessage } from './logic';

describe('isWrongPassword', () => {
  it("recognises the backend's rejected-password message", () => {
    expect(isWrongPassword('That password does not open this document.')).toBe(true);
  });

  it('leaves other failures alone', () => {
    expect(isWrongPassword('The file is damaged and could not be read.')).toBe(false);
  });
});

describe('summariseFailures', () => {
  it('splits password failures from everything else', () => {
    const summary = summariseFailures([
      { name: 'a.pdf', message: 'That password does not open this document.' },
      { name: 'b.pdf', message: 'Removing PDF protection failed: damaged file' },
    ]);
    expect(summary.wrongPassword).toEqual(['a.pdf']);
    expect(summary.other).toHaveLength(1);
    expect(summary.other[0].name).toBe('b.pdf');
  });

  it('returns empty lists for a clean run', () => {
    expect(summariseFailures([])).toEqual({ wrongPassword: [], other: [] });
  });
});

describe('wrongPasswordMessage', () => {
  it('keeps the single-document case short', () => {
    expect(wrongPasswordMessage(['a.pdf'], 1)).toBe('That password does not open this document.');
  });

  it('says so plainly when nothing opened', () => {
    expect(wrongPasswordMessage(['a.pdf', 'b.pdf'], 2)).toBe(
      'That password does not open any of these 2 documents.',
    );
  });

  it('names the documents when only some failed', () => {
    expect(wrongPasswordMessage(['b.pdf'], 3)).toBe(
      'That password does not open 1 of the 3 documents: b.pdf.',
    );
  });

  it('says nothing when no password failed', () => {
    expect(wrongPasswordMessage([], 4)).toBe('');
  });
});
