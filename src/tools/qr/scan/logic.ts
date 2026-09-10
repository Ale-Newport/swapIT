/**
 * Making sense of what came out of a QR code. Everything here is pure string
 * work: what kind of payload it is, and the readable breakdown behind it.
 *
 * The payloads are written by whoever made the code, so the parsers have to
 * survive missing fields, odd casing and escaped separators rather than assume
 * a well-formed input.
 */

export type ScanKind =
  | 'url'
  | 'wifi'
  | 'vcard'
  | 'email'
  | 'phone'
  | 'sms'
  | 'geo'
  | 'event'
  | 'text';

export interface Detail {
  label: string;
  value: string;
  /** Marked so the UI can offer a one-click copy for passwords and the like. */
  secret?: boolean;
}

const KIND_LABELS: Record<ScanKind, string> = {
  url: 'Link',
  wifi: 'Wi-Fi network',
  vcard: 'Contact card',
  email: 'Email',
  phone: 'Phone number',
  sms: 'Text message',
  geo: 'Location',
  event: 'Calendar event',
  text: 'Plain text',
};

export function describeKind(kind: ScanKind): string {
  return KIND_LABELS[kind];
}

export function detectKind(text: string): ScanKind {
  const value = text.trim();
  if (/^wifi:/i.test(value)) return 'wifi';
  if (/^begin:vcard/i.test(value) || /^mecard:/i.test(value)) return 'vcard';
  if (/^begin:(vevent|vcalendar)/i.test(value)) return 'event';
  if (/^mailto:/i.test(value)) return 'email';
  if (/^(tel|facetime):/i.test(value)) return 'phone';
  if (/^(smsto|sms|mmsto):/i.test(value)) return 'sms';
  if (/^geo:/i.test(value)) return 'geo';
  if (/^https?:\/\//i.test(value)) return 'url';
  // A bare host reads as a link to a person, so treat it as one — but only when
  // it really looks like a domain, so "1.5" and "v2.0" stay plain text.
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,24}(\/\S*)?$/i.test(value)) return 'url';
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return 'url';
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'email';
  return 'text';
}

/** Only these can be handed to the system opener without surprising the user. */
export function isOpenableUrl(text: string): boolean {
  return /^https?:\/\/\S+$/i.test(text.trim());
}

/** Add the scheme a bare host is missing so the opener knows what to do. */
export function toOpenableUrl(text: string): string | null {
  const value = text.trim();
  if (isOpenableUrl(value)) return value;
  if (detectKind(value) === 'url' && !/^[a-z][a-z0-9+.-]*:/i.test(value)) return `https://${value}`;
  return null;
}

// ------------------------------------------------------------------ helpers

/** Split on a separator that a backslash can escape, keeping the escapes. */
function splitEscaped(input: string, separator: string): string[] {
  const parts: string[] = [];
  let current = '';
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (char === '\\' && i + 1 < input.length) {
      current += char + input[i + 1];
      i += 1;
      continue;
    }
    if (char === separator) {
      parts.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  parts.push(current);
  return parts;
}

function indexOfUnescaped(input: string, char: string): number {
  for (let i = 0; i < input.length; i += 1) {
    if (input[i] === '\\') {
      i += 1;
      continue;
    }
    if (input[i] === char) return i;
  }
  return -1;
}

function unescapeSimple(value: string): string {
  return value.replace(/\\(.)/g, '$1');
}

/** vCard and iCalendar turn a real newline into a literal `\n`. */
function unescapeVCard(value: string): string {
  return value.replace(/\\([nN])|\\(.)/g, (_match, newline: string | undefined, other: string | undefined) =>
    newline ? '\n' : (other ?? ''),
  );
}

// ------------------------------------------------------------------ wifi

export interface WifiPayload {
  ssid: string;
  password: string;
  encryption: string;
  hidden: boolean;
}

export function parseWifi(text: string): WifiPayload | null {
  const match = /^wifi:(.*)$/is.exec(text.trim());
  if (!match) return null;
  const result: WifiPayload = { ssid: '', password: '', encryption: '', hidden: false };
  for (const chunk of splitEscaped(match[1], ';')) {
    if (!chunk) continue;
    const colon = indexOfUnescaped(chunk, ':');
    if (colon < 0) continue;
    const key = chunk.slice(0, colon).trim().toUpperCase();
    const value = unescapeSimple(chunk.slice(colon + 1));
    if (key === 'S') result.ssid = value;
    else if (key === 'P') result.password = value;
    else if (key === 'T') result.encryption = value;
    else if (key === 'H') result.hidden = /^(true|1|yes)$/i.test(value.trim());
  }
  return result.ssid || result.password ? result : null;
}

function wifiSecurityLabel(raw: string): string {
  const value = raw.trim().toUpperCase();
  if (!value || value === 'NOPASS') return 'Open — no password';
  if (value === 'WPA') return 'WPA / WPA2';
  if (value === 'WPA2-EAP') return 'WPA2 Enterprise';
  return value;
}

// ------------------------------------------------------------------ vcard

const VCARD_LABELS: Record<string, string> = {
  FN: 'Name',
  ORG: 'Organisation',
  TITLE: 'Job title',
  ROLE: 'Role',
  TEL: 'Phone',
  EMAIL: 'Email',
  URL: 'Website',
  ADR: 'Address',
  NOTE: 'Note',
  BDAY: 'Birthday',
  NICKNAME: 'Nickname',
};

const TYPE_LABELS: Record<string, string> = {
  CELL: 'Mobile',
  WORK: 'Work',
  HOME: 'Home',
  FAX: 'Fax',
};

/** Unfold the continuation lines vCard uses to wrap long values. */
function unfold(text: string): string[] {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const out: string[] = [];
  for (const line of lines) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && out.length) {
      out[out.length - 1] += line.slice(1);
    } else {
      out.push(line);
    }
  }
  return out.filter((line) => line.trim().length > 0);
}

export function parseVCard(text: string): Detail[] {
  const trimmed = text.trim();
  if (/^mecard:/i.test(trimmed)) return parseMeCard(trimmed);

  const details: Detail[] = [];
  let hasFullName = false;
  const nameParts: string[] = [];

  for (const line of unfold(trimmed)) {
    const colon = indexOfUnescaped(line, ':');
    if (colon < 0) continue;
    const rawName = line.slice(0, colon);
    const rawValue = line.slice(colon + 1);
    const segments = splitEscaped(rawName, ';');
    const property = segments[0].trim().toUpperCase();
    if (['BEGIN', 'END', 'VERSION', 'PRODID', 'REV', 'UID', 'PHOTO'].includes(property)) continue;

    const params = segments
      .slice(1)
      .join(';')
      .toUpperCase()
      .split(/[;,=]/)
      .map((p) => p.trim());
    const typeLabel = Object.keys(TYPE_LABELS).find((t) => params.includes(t));

    if (property === 'N') {
      // Family;Given;Middle;Prefix;Suffix — only used when FN is missing.
      const [family, given] = splitEscaped(rawValue, ';').map(unescapeVCard);
      nameParts.push([given, family].filter(Boolean).join(' ').trim());
      continue;
    }

    if (property === 'ADR') {
      const components = splitEscaped(rawValue, ';').map(unescapeVCard);
      const address = [components[2], components[3], components[4], components[5], components[6]]
        .filter((part) => part && part.trim())
        .join(', ');
      if (address) details.push({ label: 'Address', value: address });
      continue;
    }

    const value = unescapeVCard(rawValue).trim();
    if (!value) continue;
    if (property === 'FN') hasFullName = true;

    const base = VCARD_LABELS[property];
    if (!base) continue;
    const label = typeLabel && (property === 'TEL' || property === 'EMAIL') ? `${TYPE_LABELS[typeLabel]} ${base.toLowerCase()}` : base;
    details.push({ label, value });
  }

  if (!hasFullName) {
    const name = nameParts.find(Boolean);
    if (name) details.unshift({ label: 'Name', value: name });
  }
  return details;
}

/** The older MECARD format some Japanese phones still produce. */
function parseMeCard(text: string): Detail[] {
  const body = text.replace(/^mecard:/i, '');
  const labels: Record<string, string> = {
    N: 'Name',
    TEL: 'Phone',
    EMAIL: 'Email',
    URL: 'Website',
    ADR: 'Address',
    ORG: 'Organisation',
    NOTE: 'Note',
  };
  const details: Detail[] = [];
  for (const chunk of splitEscaped(body, ';')) {
    const colon = indexOfUnescaped(chunk, ':');
    if (colon < 0) continue;
    const key = chunk.slice(0, colon).trim().toUpperCase();
    const value = unescapeSimple(chunk.slice(colon + 1)).replace(/,/g, ' ').trim();
    if (!value || !labels[key]) continue;
    details.push({ label: labels[key], value });
  }
  return details;
}

// ------------------------------------------------------------------ others

function decodeQueryValue(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '));
  } catch {
    return value;
  }
}

function parseMailto(text: string): Detail[] {
  const body = text.trim().slice('mailto:'.length);
  const [address, query = ''] = body.split('?');
  const details: Detail[] = [];
  if (address) details.push({ label: 'To', value: decodeQueryValue(address) });
  for (const pair of query.split('&')) {
    if (!pair) continue;
    const [key, ...rest] = pair.split('=');
    const value = decodeQueryValue(rest.join('='));
    if (!value) continue;
    const label = key.toLowerCase() === 'subject' ? 'Subject' : key.toLowerCase() === 'body' ? 'Message' : key;
    details.push({ label, value });
  }
  return details;
}

function parseSms(text: string): Detail[] {
  const value = text.trim();
  const withoutScheme = value.replace(/^(smsto|mmsto|sms):/i, '');
  const separator = withoutScheme.indexOf(':');
  const number = separator >= 0 ? withoutScheme.slice(0, separator) : withoutScheme;
  const message = separator >= 0 ? withoutScheme.slice(separator + 1) : '';
  const details: Detail[] = [];
  if (number) details.push({ label: 'Number', value: number });
  if (message.trim()) details.push({ label: 'Message', value: message });
  return details;
}

function parseGeo(text: string): Detail[] {
  const body = text.trim().slice('geo:'.length).split('?')[0];
  const [latitude, longitude] = body.split(',');
  const details: Detail[] = [];
  if (latitude) details.push({ label: 'Latitude', value: latitude });
  if (longitude) details.push({ label: 'Longitude', value: longitude });
  return details;
}

/** iCalendar stamps: 20240131T143000Z, or a floating local time without the Z. */
export function parseICalDate(value: string): string {
  const match = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(value.trim());
  if (!match) return value;
  const [, year, month, day, hour, minute, second, zulu] = match;
  if (!hour) return `${year}-${month}-${day}`;
  const date = zulu
    ? new Date(Date.UTC(+year, +month - 1, +day, +hour, +minute, second ? +second : 0))
    : new Date(+year, +month - 1, +day, +hour, +minute, second ? +second : 0);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function parseEvent(text: string): Detail[] {
  const labels: Record<string, string> = {
    SUMMARY: 'Title',
    DTSTART: 'Starts',
    DTEND: 'Ends',
    LOCATION: 'Location',
    DESCRIPTION: 'Description',
    ORGANIZER: 'Organiser',
  };
  const details: Detail[] = [];
  for (const line of unfold(text)) {
    const colon = indexOfUnescaped(line, ':');
    if (colon < 0) continue;
    const property = splitEscaped(line.slice(0, colon), ';')[0].trim().toUpperCase();
    const label = labels[property];
    if (!label) continue;
    const raw = unescapeVCard(line.slice(colon + 1)).trim();
    if (!raw) continue;
    details.push({ label, value: property.startsWith('DT') ? parseICalDate(raw) : raw });
  }
  return details;
}

/** The full breakdown the scanner shows under a decoded payload. */
export function explain(text: string): { kind: ScanKind; details: Detail[] } {
  const kind = detectKind(text);
  switch (kind) {
    case 'wifi': {
      const wifi = parseWifi(text);
      if (!wifi) return { kind, details: [] };
      const details: Detail[] = [
        { label: 'Network', value: wifi.ssid },
        { label: 'Security', value: wifiSecurityLabel(wifi.encryption) },
      ];
      if (wifi.password) details.push({ label: 'Password', value: wifi.password, secret: true });
      if (wifi.hidden) details.push({ label: 'Visibility', value: 'Hidden network' });
      return { kind, details };
    }
    case 'vcard':
      return { kind, details: parseVCard(text) };
    case 'email':
      return {
        kind,
        details: /^mailto:/i.test(text.trim()) ? parseMailto(text) : [{ label: 'Address', value: text.trim() }],
      };
    case 'phone':
      return { kind, details: [{ label: 'Number', value: text.trim().replace(/^(tel|facetime):/i, '') }] };
    case 'sms':
      return { kind, details: parseSms(text) };
    case 'geo':
      return { kind, details: parseGeo(text) };
    case 'event':
      return { kind, details: parseEvent(text) };
    default:
      return { kind, details: [] };
  }
}
