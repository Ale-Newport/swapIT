import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FIELDS,
  MAX_ROWS,
  exportPeople,
  fakePhone,
  makePeople,
  makePerson,
  slugify,
  toCsv,
  toSql,
  type Person,
} from './logic';

describe('every record is obviously fictional', () => {
  it('only ever uses reserved e-mail domains', () => {
    for (const locale of ['en', 'es'] as const) {
      for (const person of makePeople(locale, 60)) {
        expect(person.email).toMatch(/@example\.(com|org|net)$/);
      }
    }
  });

  it('uses the 555-01xx range reserved for fiction in English', () => {
    for (let i = 0; i < 100; i += 1) {
      expect(makePerson('en').phone).toMatch(/^\+1 \(555\) 555-01\d{2}$/);
    }
  });

  it('uses an impossible 000 prefix for Spanish numbers', () => {
    for (let i = 0; i < 100; i += 1) {
      expect(makePerson('es').phone).toMatch(/^\+34 000 \d{2} \d{2} \d{2}$/);
    }
    expect(fakePhone('es', () => 0)).toBe('+34 000 00 00 00');
  });
});

describe('makePerson', () => {
  it('fills every field with something', () => {
    for (const locale of ['en', 'es'] as const) {
      const person = makePerson(locale);
      for (const [key, value] of Object.entries(person)) {
        expect(value.length, `${locale} ${key} should not be empty`).toBeGreaterThan(0);
      }
    }
  });

  it('builds the full name from the first and last name', () => {
    const person = makePerson('en');
    expect(person.fullName).toBe(`${person.firstName} ${person.lastName}`);
  });

  it('gives Spanish records two surnames and a Spanish street form', () => {
    const person = makePerson('es');
    expect(person.lastName.split(' ')).toHaveLength(2);
    expect(person.street).toMatch(/^(Calle|Avenida|Paseo|Plaza|Ronda|Travesía) .+, \d+$/);
    expect(person.country).toBe('España');
  });

  it('numbers English streets in front, as addresses there run', () => {
    expect(makePerson('en').street).toMatch(/^\d+ .+ (Street|Road|Lane|Avenue|Court|Way|Terrace|Drive)$/);
  });

  it('produces a real calendar date of birth', () => {
    for (let i = 0; i < 200; i += 1) {
      const dob = makePerson('en').dateOfBirth;
      expect(dob).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      const [year, month, day] = dob.split('-').map(Number);
      const parsed = new Date(Date.UTC(year, month - 1, day));
      expect(parsed.getUTCMonth()).toBe(month - 1);
      expect(parsed.getUTCDate()).toBe(day);
      expect(year).toBeGreaterThanOrEqual(1955);
      expect(year).toBeLessThanOrEqual(2006);
    }
  });

  it('gives every row its own id', () => {
    const people = makePeople('en', 200);
    expect(new Set(people.map((p) => p.id)).size).toBe(200);
  });

  it('caps the batch and never returns nothing', () => {
    expect(makePeople('en', 0)).toHaveLength(1);
    expect(makePeople('en', MAX_ROWS + 500)).toHaveLength(MAX_ROWS);
  });
});

describe('slugify', () => {
  it('strips accents and punctuation', () => {
    expect(slugify('Álvaro')).toBe('alvaro');
    expect(slugify('Ximena Núñez')).toBe('ximena.nunez');
    expect(slugify("O'Hara")).toBe('o.hara');
  });
});

describe('exports', () => {
  const person: Person = {
    ...makePerson('en'),
    fullName: 'Quote " and, comma',
    company: "Sinclair's Systems",
    jobTitle: 'Line one\nline two',
  };

  it('quotes CSV cells that contain a comma, a quote or a newline', () => {
    const csv = toCsv([person], ['fullName', 'company', 'jobTitle']);
    expect(csv.split('\n')[0]).toBe('Full name,Company,Job title');
    expect(csv).toContain('"Quote "" and, comma"');
    expect(csv).toContain('"Line one\nline two"');
  });

  it('doubles apostrophes in SQL literals and snake-cases the columns', () => {
    const sql = toSql([person], ['fullName', 'company'], 'users');
    expect(sql.startsWith('INSERT INTO users (full_name, company) VALUES (')).toBe(true);
    expect(sql).toContain("'Sinclair''s Systems'");
    expect(sql.trimEnd().endsWith(');')).toBe(true);
  });

  it('falls back to a safe table name', () => {
    expect(toSql([person], ['company'], '  drop table; --')).toContain('INSERT INTO droptable ');
    expect(toSql([person], ['company'], '   ')).toContain('INSERT INTO people ');
  });

  it('writes JSON containing only the chosen fields', () => {
    const parsed = JSON.parse(exportPeople([person], ['email', 'city'], 'json', 'people')) as Array<
      Record<string, string>
    >;
    expect(Object.keys(parsed[0])).toEqual(['email', 'city']);
  });

  it('returns nothing when no field is selected', () => {
    expect(exportPeople([person], [], 'csv', 'people')).toBe('');
  });

  it('exports every default field for a whole batch', () => {
    const people = makePeople('es', 25);
    const csv = exportPeople(people, DEFAULT_FIELDS, 'csv', 'people');
    expect(csv.split('\n')).toHaveLength(26);
  });
});
