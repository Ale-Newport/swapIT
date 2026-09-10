import { describe, it, expect } from 'vitest';
import { buildQuery, duplicateKeys, extractQuery, groupPairs, keyPath, parsePairs, safeDecode } from './logic';

describe('extractQuery', () => {
  it('takes the query out of a full URL and drops the fragment', () => {
    expect(extractQuery('https://example.com/search?q=cats&page=2#results')).toBe('q=cats&page=2');
  });

  it('accepts a bare query string with or without the question mark', () => {
    expect(extractQuery('?a=1&b=2')).toBe('a=1&b=2');
    expect(extractQuery('a=1&b=2')).toBe('a=1&b=2');
    expect(extractQuery('  ?a=1  ')).toBe('a=1');
  });

  it('handles a path with a query and a URL with no query', () => {
    expect(extractQuery('/products?id=9')).toBe('id=9');
    expect(extractQuery('https://example.com/plain')).toBe('');
    expect(extractQuery('')).toBe('');
    expect(extractQuery('#only-a-hash')).toBe('');
  });
});

describe('parsePairs', () => {
  it('splits on the first equals only', () => {
    expect(parsePairs('token=abc=def')).toEqual([{ key: 'token', value: 'abc=def' }]);
  });

  it('decodes percent escapes and plus signs', () => {
    expect(parsePairs('q=hello+world&city=S%C3%A3o%20Paulo')).toEqual([
      { key: 'q', value: 'hello world' },
      { key: 'city', value: 'São Paulo' },
    ]);
  });

  it('keeps a valueless key, and tells it apart from an empty value', () => {
    expect(parsePairs('debug&verbose=')).toEqual([
      { key: 'debug', value: '', valueless: true },
      { key: 'verbose', value: '' },
    ]);
  });

  it('survives a broken percent escape', () => {
    expect(safeDecode('100%')).toBe('100%');
    expect(parsePairs('a=100%')).toEqual([{ key: 'a', value: '100%' }]);
  });

  it('ignores empty segments', () => {
    expect(parsePairs('&&a=1&&b=2&')).toEqual([
      { key: 'a', value: '1' },
      { key: 'b', value: '2' },
    ]);
  });
});

describe('keyPath', () => {
  it('reads bracket notation', () => {
    expect(keyPath('a')).toEqual(['a']);
    expect(keyPath('a[]')).toEqual(['a', '']);
    expect(keyPath('a[b]')).toEqual(['a', 'b']);
    expect(keyPath('filter[price][min]')).toEqual(['filter', 'price', 'min']);
  });

  it('leaves an unbalanced key alone', () => {
    expect(keyPath('a[b')).toEqual(['a[b']);
  });
});

describe('groupPairs', () => {
  it('turns repeated keys into arrays', () => {
    expect(groupPairs(parsePairs('tag=a&tag=b&tag=c'))).toEqual({ tag: ['a', 'b', 'c'] });
  });

  it('handles empty-bracket arrays', () => {
    expect(groupPairs(parsePairs('id[]=1&id[]=2'))).toEqual({ id: ['1', '2'] });
  });

  it('nests bracket objects', () => {
    expect(groupPairs(parsePairs('filter[price][min]=10&filter[price][max]=99&filter[color]=red'))).toEqual({
      filter: { price: { min: '10', max: '99' }, color: 'red' },
    });
  });

  it('mixes arrays of objects', () => {
    expect(groupPairs(parsePairs('items[][sku]=A1&items[][sku]=B2'))).toEqual({
      items: [{ sku: 'A1' }, { sku: 'B2' }],
    });
  });

  it('keeps scalars and structures side by side', () => {
    expect(groupPairs(parsePairs('page=2&sort[by]=name&sort[dir]=asc'))).toEqual({
      page: '2',
      sort: { by: 'name', dir: 'asc' },
    });
  });
});

describe('buildQuery', () => {
  it('encodes by default and can be told not to', () => {
    const pairs = [{ key: 'q', value: 'hello world & more' }];
    expect(buildQuery(pairs)).toBe('q=hello%20world%20%26%20more');
    expect(buildQuery(pairs, { encode: false })).toBe('q=hello world & more');
  });

  it('sorts keys when asked', () => {
    const pairs = [
      { key: 'b', value: '2' },
      { key: 'a', value: '1' },
      { key: 'c', value: '3' },
    ];
    expect(buildQuery(pairs, { sortKeys: true })).toBe('a=1&b=2&c=3');
    expect(buildQuery(pairs)).toBe('b=2&a=1&c=3');
  });

  it('adds the question mark only when there is something to write', () => {
    expect(buildQuery([{ key: 'a', value: '1' }], { leadingQuestionMark: true })).toBe('?a=1');
    expect(buildQuery([], { leadingQuestionMark: true })).toBe('');
    expect(buildQuery([{ key: '  ', value: '' }])).toBe('');
  });

  it('round trips through parse', () => {
    const original = 'q=hello%20world&tag=a&tag=b&filter%5Bmin%5D=10';
    expect(buildQuery(parsePairs(original))).toBe(original);
  });

  it('never adds an equals sign to a bare key', () => {
    expect(buildQuery(parsePairs('debug&verbose='))).toBe('debug&verbose=');
    expect(buildQuery(parsePairs('?flag'), { leadingQuestionMark: true })).toBe('?flag');
    // Give the bare key a value and it becomes an ordinary pair.
    expect(buildQuery([{ key: 'debug', value: 'on', valueless: true }])).toBe('debug=on');
  });
});

describe('duplicateKeys', () => {
  it('lists keys used more than once', () => {
    expect(duplicateKeys(parsePairs('a=1&b=2&a=3&b=4&c=5'))).toEqual(['a', 'b']);
    expect(duplicateKeys(parsePairs('a=1&b=2'))).toEqual([]);
  });
});
