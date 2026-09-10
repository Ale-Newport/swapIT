import { describe, it, expect } from 'vitest';
import { alternatingCase, convertCase, inverseCase, sentenceCase, splitWords, titleCase } from './logic';

describe('splitWords', () => {
  it('breaks camelCase humps apart', () => {
    expect(splitWords('userProfileSettings')).toEqual(['user', 'Profile', 'Settings']);
  });

  it('keeps acronyms together but separates the following word', () => {
    expect(splitWords('parseHTMLDocument')).toEqual(['parse', 'HTML', 'Document']);
  });

  it('treats punctuation and digits as separators or word parts', () => {
    expect(splitWords('order_id-42 (final)')).toEqual(['order', 'id', '42', 'final']);
  });

  it('returns nothing for a line without letters or digits', () => {
    expect(splitWords('  --- ')).toEqual([]);
  });
});

describe('titleCase', () => {
  it('keeps small words lowercase in the middle', () => {
    expect(titleCase('the lord of the rings')).toBe('The Lord of the Rings');
  });

  it('capitalises a small word when it is first or last', () => {
    expect(titleCase('a room with a view of')).toBe('A Room with a View Of');
  });

  it('normalises shouty input', () => {
    expect(titleCase('WAR AND PEACE')).toBe('War and Peace');
  });

  it('handles hyphenated compounds on both sides', () => {
    expect(titleCase('state-of-the-art design')).toBe('State-of-the-Art Design');
  });

  it('works line by line', () => {
    expect(titleCase('one and two\nthree or four')).toBe('One and Two\nThree or Four');
  });

  it('leaves surrounding punctuation alone', () => {
    expect(titleCase('"hello world"')).toBe('"Hello World"');
  });
});

describe('sentenceCase', () => {
  it('capitalises after terminators only', () => {
    expect(sentenceCase('hello there. how ARE you? fine!')).toBe('Hello there. How are you? Fine!');
  });

  it('starts each new line', () => {
    expect(sentenceCase('first line\nsecond line')).toBe('First line\nSecond line');
  });
});

describe('identifier styles', () => {
  const line = 'User profile settings';
  it('camelCase', () => expect(convertCase(line, 'camel')).toBe('userProfileSettings'));
  it('PascalCase', () => expect(convertCase(line, 'pascal')).toBe('UserProfileSettings'));
  it('snake_case', () => expect(convertCase(line, 'snake')).toBe('user_profile_settings'));
  it('kebab-case', () => expect(convertCase(line, 'kebab')).toBe('user-profile-settings'));
  it('CONSTANT_CASE', () => expect(convertCase(line, 'constant')).toBe('USER_PROFILE_SETTINGS'));
  it('dot.case', () => expect(convertCase(line, 'dot')).toBe('user.profile.settings'));
  it('Train-Case', () => expect(convertCase(line, 'train')).toBe('User-Profile-Settings'));

  it('converts every line independently', () => {
    expect(convertCase('first name\nlast name', 'snake')).toBe('first_name\nlast_name');
  });

  it('keeps blank lines blank instead of dropping them', () => {
    expect(convertCase('a b\n\nc d', 'kebab')).toBe('a-b\n\nc-d');
  });

  it('round-trips an existing identifier', () => {
    expect(convertCase('getUserByID', 'snake')).toBe('get_user_by_id');
  });
});

describe('alternatingCase', () => {
  it('starts lowercase and flips on letters only', () => {
    expect(alternatingCase('alternating')).toBe('aLtErNaTiNg');
  });

  it('does not let spaces or digits consume a turn', () => {
    expect(alternatingCase('ab cd')).toBe('aB cD');
  });
});

describe('inverseCase', () => {
  it('swaps each letter and leaves the rest', () => {
    expect(inverseCase('Hello, World 42!')).toBe('hELLO, wORLD 42!');
  });

  it('handles accented letters', () => {
    expect(inverseCase('Ñandú')).toBe('ñANDÚ');
  });
});
