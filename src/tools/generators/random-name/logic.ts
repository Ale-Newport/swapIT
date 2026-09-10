/**
 * Random names from small built-in pools, plus the adjective-noun codenames that
 * are handy for branches, test environments and demo accounts.
 *
 * These are ordinary given names, not descriptions of anyone: use them for
 * placeholders and fixtures, never as stand-ins for real people.
 */

export type Locale = 'en' | 'es' | 'both';
export type NameKind = 'first' | 'last' | 'full' | 'codename';
export type GenderPool = 'any' | 'neutral';

export type Random = () => number;

export const random: Random = () => {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return buffer[0] / 4294967296;
};

export const MAX_COUNT = 500;

const EN_FEMININE = [
  'Amara', 'Beatrix', 'Carmen', 'Cassidy', 'Dahlia', 'Edith', 'Esme', 'Freya', 'Greta', 'Harriet',
  'Imogen', 'Juno', 'Lena', 'Mabel', 'Nadia', 'Odette', 'Phoebe', 'Rosalind', 'Sabine', 'Tabitha',
  'Ursula', 'Wilhelmina', 'Yolanda', 'Zora',
];

const EN_MASCULINE = [
  'Caleb', 'Cyrus', 'Desmond', 'Elliot', 'Felix', 'Gideon', 'Hugo', 'Isaac', 'Jasper', 'Keaton',
  'Linus', 'Nolan', 'Orson', 'Quentin', 'Silas', 'Theo', 'Vernon', 'Xavier', 'Zachary', 'Milo',
];

const EN_NEUTRAL = [
  'Alex', 'Ari', 'Ash', 'Aubrey', 'Bailey', 'Blair', 'Cameron', 'Charlie', 'Ellis', 'Emery',
  'Finley', 'Frankie', 'Harper', 'Jamie', 'Jordan', 'Kai', 'Lennox', 'Marlow', 'Morgan', 'Noor',
  'Parker', 'Quinn', 'Reese', 'Riley', 'Robin', 'Rowan', 'Sage', 'Sasha', 'Sky', 'Tatum', 'Wren',
];

const EN_SURNAMES = [
  'Ashby', 'Barlowe', 'Cavendish', 'Doyle', 'Ellery', 'Fairweather', 'Grimsby', 'Halloway', 'Ingram',
  'Jarvis', 'Kingsley', 'Lockwood', 'Mercer', 'Nightingale', 'Osgood', 'Pennington', 'Quimby',
  'Rutherford', 'Sinclair', 'Thackeray', 'Underwood', 'Vance', 'Whitlock', 'Yarrow', 'Bramwell',
  'Corrigan', 'Danforth', 'Eastwick', 'Fenmore', 'Galloway', 'Hartwell',
];

const ES_FEMININE = [
  'Adriana', 'Ana', 'Beatriz', 'Carmen', 'Clara', 'Elena', 'Elisa', 'Fátima', 'Inés', 'Irene',
  'Julia', 'Leire', 'Lucía', 'Marta', 'Miriam', 'Nuria', 'Paula', 'Rocío', 'Sara', 'Silvia',
  'Teresa', 'Valeria', 'Ximena',
];

const ES_MASCULINE = [
  'Alejandro', 'Álvaro', 'Andrés', 'Bruno', 'Daniel', 'Diego', 'Emilio', 'Gonzalo', 'Hugo', 'Iván',
  'Javier', 'Manuel', 'Mateo', 'Óscar', 'Pablo', 'Rubén', 'Sergio', 'Vicente',
];

const ES_NEUTRAL = ['Alex', 'Ariel', 'Cruz', 'Guadalupe', 'Lupe', 'Mar', 'Noa', 'Reyes', 'Trinidad', 'Yael'];

const ES_SURNAMES = [
  'Álvarez', 'Benítez', 'Cabrera', 'Carrasco', 'Castaño', 'Delgado', 'Escudero', 'Fuentes', 'Gallardo',
  'Herrero', 'Ibáñez', 'Jurado', 'Lorenzo', 'Maldonado', 'Nieto', 'Olmedo', 'Pardo', 'Quintana',
  'Rueda', 'Salgado', 'Tejedor', 'Ureña', 'Valverde', 'Zamora', 'Bermejo', 'Cortés', 'Duarte',
  'Esteban', 'Figueroa', 'Guzmán',
];

export const ADJECTIVES = [
  'amber', 'ancient', 'blazing', 'bold', 'brave', 'brisk', 'calm', 'clever', 'copper', 'cosmic',
  'crimson', 'crisp', 'curious', 'daring', 'dawn', 'deep', 'distant', 'eager', 'electric', 'ember',
  'faint', 'fearless', 'fierce', 'firm', 'frosted', 'gentle', 'gilded', 'golden', 'grand', 'hidden',
  'humble', 'idle', 'iron', 'jade', 'keen', 'kind', 'lively', 'lofty', 'lucid', 'lunar', 'mellow',
  'mighty', 'misty', 'noble', 'nimble', 'northern', 'patient', 'polished', 'proud', 'quick', 'quiet',
  'rapid', 'restless', 'rugged', 'rustic', 'scarlet', 'secret', 'shaded', 'sharp', 'silent', 'silver',
  'sleepy', 'smooth', 'solar', 'solid', 'steady', 'stormy', 'sturdy', 'sunny', 'swift', 'tidy',
  'tranquil', 'trusty', 'twilight', 'urban', 'velvet', 'vivid', 'wandering', 'warm', 'wild', 'wise',
];

export const NOUNS = [
  'anchor', 'anvil', 'archive', 'atlas', 'aurora', 'basin', 'beacon', 'bison', 'bramble', 'bridge',
  'canyon', 'cascade', 'cedar', 'cinder', 'citadel', 'comet', 'compass', 'coral', 'cove', 'crane',
  'crater', 'delta', 'dune', 'echo', 'ember', 'falcon', 'fathom', 'ferry', 'fjord', 'forge',
  'foundry', 'garden', 'glacier', 'glade', 'harbor', 'harvest', 'heron', 'horizon', 'island',
  'juniper', 'kestrel', 'lagoon', 'lantern', 'ledger', 'lighthouse', 'lookout', 'meadow', 'meridian',
  'monsoon', 'nebula', 'orbit', 'otter', 'outpost', 'paddock', 'pier', 'pilot', 'pinnacle', 'prairie',
  'quarry', 'quill', 'rampart', 'ravine', 'reef', 'ridge', 'rookery', 'sable', 'sentinel', 'shipyard',
  'signal', 'spire', 'station', 'summit', 'tempest', 'terrace', 'thicket', 'tundra', 'valley',
  'vantage', 'vessel', 'voyage', 'willow', 'zenith',
];

function pick<T>(list: T[], rand: Random): T {
  return list[Math.floor(rand() * list.length) % list.length];
}

export function firstNamePool(locale: Locale, gender: GenderPool): string[] {
  const en = gender === 'neutral' ? EN_NEUTRAL : [...EN_FEMININE, ...EN_MASCULINE, ...EN_NEUTRAL];
  const es = gender === 'neutral' ? ES_NEUTRAL : [...ES_FEMININE, ...ES_MASCULINE, ...ES_NEUTRAL];
  if (locale === 'en') return en;
  if (locale === 'es') return es;
  return [...en, ...es];
}

export function surnamePool(locale: Locale): string[] {
  if (locale === 'en') return EN_SURNAMES;
  if (locale === 'es') return ES_SURNAMES;
  return [...EN_SURNAMES, ...ES_SURNAMES];
}

export type Separator = '-' | '_' | ' ' | '';

export interface NameOptions {
  kind: NameKind;
  locale: Locale;
  gender: GenderPool;
  count: number;
  separator: Separator;
  /** Append a two-digit number to a codename. */
  codenameNumber: boolean;
  /** Spanish full names carry two surnames. */
  twoSurnames: boolean;
}

export function makeCodename(options: Pick<NameOptions, 'separator' | 'codenameNumber'>, rand: Random = random): string {
  const parts = [pick(ADJECTIVES, rand), pick(NOUNS, rand)];
  if (options.codenameNumber) parts.push(String(10 + Math.floor(rand() * 90)));
  return parts.join(options.separator);
}

export function makeName(options: NameOptions, rand: Random = random): string {
  if (options.kind === 'codename') return makeCodename(options, rand);
  const first = pick(firstNamePool(options.locale, options.gender), rand);
  const surnames = surnamePool(options.locale);
  if (options.kind === 'first') return first;
  const last = options.twoSurnames ? `${pick(surnames, rand)} ${pick(surnames, rand)}` : pick(surnames, rand);
  if (options.kind === 'last') return last;
  return `${first} ${last}`;
}

export function makeNames(options: NameOptions, rand: Random = random): string[] {
  const total = Math.max(1, Math.min(MAX_COUNT, Math.round(options.count) || 1));
  return Array.from({ length: total }, () => makeName(options, rand));
}
