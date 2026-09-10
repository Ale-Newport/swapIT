import { EMAIL_DOMAINS, LOCALES, type Locale } from './data';

/**
 * Fictional records for filling a test database, a design mockup or a CSV
 * importer. Nothing here describes a real person: see `data.ts` for the reserved
 * ranges and invented lists every field is drawn from.
 */

export type Random = () => number;

export const random: Random = () => {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return buffer[0] / 4294967296;
};

export const MAX_ROWS = 1000;

export type FieldKey =
  | 'id'
  | 'firstName'
  | 'lastName'
  | 'fullName'
  | 'email'
  | 'username'
  | 'phone'
  | 'street'
  | 'city'
  | 'region'
  | 'postcode'
  | 'country'
  | 'company'
  | 'jobTitle'
  | 'dateOfBirth';

export const FIELDS: Array<{ key: FieldKey; label: string }> = [
  { key: 'id', label: 'ID' },
  { key: 'firstName', label: 'First name' },
  { key: 'lastName', label: 'Last name' },
  { key: 'fullName', label: 'Full name' },
  { key: 'email', label: 'Email' },
  { key: 'username', label: 'Username' },
  { key: 'phone', label: 'Phone' },
  { key: 'street', label: 'Street address' },
  { key: 'city', label: 'City' },
  { key: 'region', label: 'Region' },
  { key: 'postcode', label: 'Postcode' },
  { key: 'country', label: 'Country' },
  { key: 'company', label: 'Company' },
  { key: 'jobTitle', label: 'Job title' },
  { key: 'dateOfBirth', label: 'Date of birth' },
];

export const DEFAULT_FIELDS: FieldKey[] = [
  'id',
  'fullName',
  'email',
  'phone',
  'street',
  'city',
  'region',
  'postcode',
  'country',
  'company',
  'jobTitle',
  'dateOfBirth',
];

export type Person = Record<FieldKey, string>;

function pick<T>(list: T[], rand: Random): T {
  return list[Math.floor(rand() * list.length) % list.length];
}

function digits(count: number, rand: Random): string {
  let out = '';
  for (let i = 0; i < count; i += 1) out += Math.floor(rand() * 10);
  return out;
}

function between(min: number, max: number, rand: Random): number {
  return min + Math.floor(rand() * (max - min + 1));
}

/** Strip accents and punctuation so a name can become an e-mail local part. */
export function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '');
}

/**
 * A number nobody can answer: the North American 555-01xx range reserved for
 * fiction, and a Spanish 000 prefix that no operator is allowed to use.
 */
export function fakePhone(locale: Locale, rand: Random): string {
  if (locale === 'es') {
    return `+34 000 ${digits(2, rand)} ${digits(2, rand)} ${digits(2, rand)}`;
  }
  return `+1 (555) 555-01${digits(2, rand)}`;
}

export function fakeEmail(first: string, last: string, rand: Random): string {
  const local = `${slugify(first)}.${slugify(last)}`;
  const tail = rand() < 0.45 ? String(between(2, 99, rand)) : '';
  return `${local}${tail}@${pick(EMAIL_DOMAINS, rand)}`;
}

function isoDate(rand: Random): string {
  const year = between(1955, 2006, rand);
  const month = between(1, 12, rand);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const day = between(1, daysInMonth, rand);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function makePerson(locale: Locale, rand: Random = random): Person {
  const pool = LOCALES[locale];
  const first = pick(pool.firstNames, rand);
  const last =
    locale === 'es'
      ? `${pick(pool.lastNames, rand)} ${pick(pool.lastNames, rand)}`
      : pick(pool.lastNames, rand);
  const streetName = pick(pool.streetNames, rand);
  const number = between(1, 240, rand);
  const street =
    locale === 'es'
      ? `${pick(pool.streetTypes, rand)} ${streetName}, ${number}`
      : `${number} ${streetName} ${pick(pool.streetTypes, rand)}`;
  const suffix = pick(pool.companySuffix, rand);
  const company = `${pick(pool.companyFirst, rand)} ${pick(pool.companySecond, rand)}${suffix ? ` ${suffix}` : ''}`;
  const usernameTail = String(between(10, 99, rand));

  return {
    id: crypto.randomUUID(),
    firstName: first,
    lastName: last,
    fullName: `${first} ${last}`,
    email: fakeEmail(first, last.split(' ')[0], rand),
    username: `${slugify(first).slice(0, 1)}${slugify(last.split(' ')[0])}${usernameTail}`,
    phone: fakePhone(locale, rand),
    street,
    city: pick(pool.cities, rand),
    region: pick(pool.regions, rand),
    postcode: locale === 'es' ? String(between(1000, 52999, rand)).padStart(5, '0') : digits(5, rand),
    country: pool.country,
    company,
    jobTitle: pick(pool.jobTitles, rand),
    dateOfBirth: isoDate(rand),
  };
}

export function makePeople(locale: Locale, count: number, rand: Random = random): Person[] {
  const total = Math.max(1, Math.min(MAX_ROWS, Math.round(count) || 1));
  return Array.from({ length: total }, () => makePerson(locale, rand));
}

// ------------------------------------------------------------------ exports

export type ExportFormat = 'json' | 'csv' | 'sql';

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toCsv(people: Person[], fields: FieldKey[]): string {
  const header = fields.map((f) => csvCell(FIELDS.find((x) => x.key === f)?.label ?? f)).join(',');
  const rows = people.map((person) => fields.map((f) => csvCell(person[f])).join(','));
  return [header, ...rows].join('\n');
}

export function toJson(people: Person[], fields: FieldKey[]): string {
  const rows = people.map((person) => Object.fromEntries(fields.map((f) => [f, person[f]])));
  return JSON.stringify(rows, null, 2);
}

function sqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export function toSql(people: Person[], fields: FieldKey[], table: string): string {
  const name = table.trim().replace(/[^A-Za-z0-9_]/g, '') || 'people';
  const columns = fields.map((f) => f.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)).join(', ');
  return people
    .map((person) => `INSERT INTO ${name} (${columns}) VALUES (${fields.map((f) => sqlLiteral(person[f])).join(', ')});`)
    .join('\n');
}

export function exportPeople(
  people: Person[],
  fields: FieldKey[],
  format: ExportFormat,
  table: string,
): string {
  if (fields.length === 0) return '';
  switch (format) {
    case 'json':
      return toJson(people, fields);
    case 'csv':
      return toCsv(people, fields);
    case 'sql':
      return toSql(people, fields, table);
  }
}

export { LOCALES };
export type { Locale };
