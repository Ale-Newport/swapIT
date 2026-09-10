import { describe, it, expect } from 'vitest';
import { STATUS_CODES, searchStatuses, statusClass } from './data';

describe('the table', () => {
  it('has no duplicate codes and stays in order', () => {
    const codes = STATUS_CODES.map((s) => s.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect([...codes].sort((a, b) => a - b)).toEqual(codes);
  });

  it('includes the codes people actually look up', () => {
    const codes = new Set(STATUS_CODES.map((s) => s.code));
    for (const code of [100, 200, 204, 301, 304, 400, 404, 418, 421, 422, 425, 426, 428, 429, 431, 451, 500, 503, 511]) {
      expect(codes.has(code)).toBe(true);
    }
  });

  it('marks the bodyless responses', () => {
    const bodyless = STATUS_CODES.filter((s) => !s.body).map((s) => s.code);
    expect(bodyless).toEqual([100, 101, 102, 103, 204, 205, 304]);
  });

  it('marks exactly the heuristically cacheable codes', () => {
    const cacheable = STATUS_CODES.filter((s) => s.cacheable === 'default').map((s) => s.code);
    expect(cacheable).toEqual([200, 203, 204, 206, 300, 301, 308, 404, 405, 410, 414, 501]);
  });
});

describe('statusClass', () => {
  it('groups by the leading digit', () => {
    expect(statusClass(100)).toBe('1xx');
    expect(statusClass(204)).toBe('2xx');
    expect(statusClass(451)).toBe('4xx');
    expect(statusClass(511)).toBe('5xx');
  });
});

describe('searchStatuses', () => {
  it('finds by code, name and meaning', () => {
    // 410 mentions 404 in its meaning, so a free-text search finds both — the code itself leads.
    expect(searchStatuses('404', 'all')[0].code).toBe(404);
    expect(searchStatuses('404', 'all').map((s) => s.code)).toEqual([404, 410]);
    expect(searchStatuses('teapot', 'all').map((s) => s.code)).toEqual([418]);
    expect(searchStatuses('rate limited', 'all').map((s) => s.code)).toEqual([429]);
  });

  it('filters by class', () => {
    const redirects = searchStatuses('', '3xx');
    expect(redirects.length).toBeGreaterThan(5);
    expect(redirects.every((s) => statusClass(s.code) === '3xx')).toBe(true);
    expect(searchStatuses('404', '5xx')).toEqual([]);
  });

  it('returns everything for an empty query', () => {
    expect(searchStatuses('   ', 'all')).toHaveLength(STATUS_CODES.length);
  });
});
