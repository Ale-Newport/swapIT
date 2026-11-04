import { describe, expect, it } from 'vitest';
import { FILE_TYPES, fileType, titleFromContent } from './fileTypes';

describe('titleFromContent', () => {
  it('names a note after its first heading', () => {
    expect(titleFromContent('# Meeting with Ana\n\nnotes')).toBe('Meeting with Ana');
  });

  it('skips blank lines and list markers', () => {
    expect(titleFromContent('\n\n- [ ] buy milk\n')).toBe('buy milk');
  });

  it('strips characters a file name cannot hold', () => {
    expect(titleFromContent('Plan: A/B test?')).toBe('Plan AB test');
  });

  it('returns empty for nothing', () => {
    expect(titleFromContent('   \n  ')).toBe('');
  });

  it('is capped', () => {
    expect(titleFromContent('x'.repeat(200)).length).toBeLessThanOrEqual(60);
  });
});

describe('file types', () => {
  it('has unique ids and extensions', () => {
    expect(new Set(FILE_TYPES.map((t) => t.id)).size).toBe(FILE_TYPES.length);
    expect(new Set(FILE_TYPES.map((t) => t.ext)).size).toBe(FILE_TYPES.length);
  });

  it('falls back to text', () => {
    expect(fileType('nope').id).toBe('txt');
  });

  it('makes shell scripts executable and starts them with a shebang', () => {
    const sh = fileType('sh');
    expect(sh.executable).toBe(true);
    expect(sh.template({ title: '', date: new Date() }).startsWith('#!/usr/bin/env bash')).toBe(true);
  });

  it('seeds a markdown note from its title', () => {
    expect(fileType('md').template({ title: 'Ideas', date: new Date() })).toBe('# Ideas\n\n');
    expect(fileType('md').template({ title: '', date: new Date() })).toBe('');
  });
});
