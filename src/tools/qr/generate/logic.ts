import { create } from 'qrcode';

/**
 * Everything a QR code needs before it becomes pixels: the payload encoders for
 * each content type, the module matrix, and the SVG renderer that has to agree
 * with the canvas renderer exactly.
 *
 * All of it is pure so the encoders can be tested against the real formats — a
 * mis-escaped Wi-Fi password is invisible until someone's phone refuses to join
 * the network.
 */

// ------------------------------------------------------------------ content

export type QrContentType =
  | 'url'
  | 'text'
  | 'wifi'
  | 'email'
  | 'phone'
  | 'sms'
  | 'whatsapp'
  | 'vcard'
  | 'geo'
  | 'event';

export type WifiEncryption = 'WPA' | 'WEP' | 'nopass';

export interface QrFormState {
  url: string;
  text: string;
  wifiSsid: string;
  wifiPassword: string;
  wifiEncryption: WifiEncryption;
  wifiHidden: boolean;
  emailTo: string;
  emailSubject: string;
  emailBody: string;
  phone: string;
  smsNumber: string;
  smsMessage: string;
  waNumber: string;
  waMessage: string;
  vcFirstName: string;
  vcLastName: string;
  vcOrg: string;
  vcTitle: string;
  vcPhone: string;
  vcEmail: string;
  vcUrl: string;
  vcStreet: string;
  vcCity: string;
  vcRegion: string;
  vcPostalCode: string;
  vcCountry: string;
  vcNote: string;
  geoLatitude: string;
  geoLongitude: string;
  evTitle: string;
  evLocation: string;
  evDescription: string;
  evStart: string;
  evEnd: string;
}

export const EMPTY_FORM: QrFormState = {
  url: '',
  text: '',
  wifiSsid: '',
  wifiPassword: '',
  wifiEncryption: 'WPA',
  wifiHidden: false,
  emailTo: '',
  emailSubject: '',
  emailBody: '',
  phone: '',
  smsNumber: '',
  smsMessage: '',
  waNumber: '',
  waMessage: '',
  vcFirstName: '',
  vcLastName: '',
  vcOrg: '',
  vcTitle: '',
  vcPhone: '',
  vcEmail: '',
  vcUrl: '',
  vcStreet: '',
  vcCity: '',
  vcRegion: '',
  vcPostalCode: '',
  vcCountry: '',
  vcNote: '',
  geoLatitude: '',
  geoLongitude: '',
  evTitle: '',
  evLocation: '',
  evDescription: '',
  evStart: '',
  evEnd: '',
};

export const CONTENT_TYPES: Array<{ value: QrContentType; label: string; blurb: string }> = [
  { value: 'url', label: 'Link', blurb: 'Open a web page' },
  { value: 'text', label: 'Text', blurb: 'Show plain text' },
  { value: 'wifi', label: 'Wi-Fi', blurb: 'Join a network' },
  { value: 'email', label: 'Email', blurb: 'Start an email' },
  { value: 'phone', label: 'Phone', blurb: 'Dial a number' },
  { value: 'sms', label: 'SMS', blurb: 'Send a text message' },
  { value: 'whatsapp', label: 'WhatsApp', blurb: 'Open a chat' },
  { value: 'vcard', label: 'Contact', blurb: 'Save a contact card' },
  { value: 'geo', label: 'Location', blurb: 'Drop a map pin' },
  { value: 'event', label: 'Event', blurb: 'Add to calendar' },
];

// ------------------------------------------------------------------ escaping

/** Wi-Fi payloads separate fields with `;`, so those characters must be escaped. */
export function escapeWifiValue(value: string): string {
  return value.replace(/([\\;,:"])/g, '\\$1');
}

/** vCard and iCalendar share the same text escaping rules. */
export function escapeVCardValue(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

/** Keep a leading `+` (country code) and drop the formatting a human typed. */
export function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, '');
  return trimmed.startsWith('+') ? `+${digits}` : digits;
}

// ------------------------------------------------------------------ encoders

export function encodeUrl(form: Pick<QrFormState, 'url'>): string {
  const raw = form.url.trim();
  if (!raw) throw new Error('Enter the web address this QR code should open.');
  if (/\s/.test(raw)) throw new Error('A web address cannot contain spaces — check the link and try again.');
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return raw;
  return `https://${raw}`;
}

export function encodeText(form: Pick<QrFormState, 'text'>): string {
  if (!form.text.trim()) throw new Error('Type the text this QR code should carry.');
  return form.text;
}

export function encodeWifi(
  form: Pick<QrFormState, 'wifiSsid' | 'wifiPassword' | 'wifiEncryption' | 'wifiHidden'>,
): string {
  const ssid = form.wifiSsid.trim();
  if (!ssid) throw new Error('Enter the network name (SSID) the code should connect to.');
  const open = form.wifiEncryption === 'nopass';
  if (!open && !form.wifiPassword) {
    throw new Error('Enter the Wi-Fi password, or set the security type to "No password".');
  }
  const parts = [`T:${form.wifiEncryption}`, `S:${escapeWifiValue(ssid)}`];
  if (!open) parts.push(`P:${escapeWifiValue(form.wifiPassword)}`);
  if (form.wifiHidden) parts.push('H:true');
  return `WIFI:${parts.join(';')};;`;
}

export function encodeEmail(form: Pick<QrFormState, 'emailTo' | 'emailSubject' | 'emailBody'>): string {
  const to = form.emailTo.trim();
  if (!to) throw new Error('Enter the address the email should be sent to.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    throw new Error(`"${to}" does not look like an email address.`);
  }
  const query: string[] = [];
  if (form.emailSubject.trim()) query.push(`subject=${encodeURIComponent(form.emailSubject.trim())}`);
  if (form.emailBody.trim()) query.push(`body=${encodeURIComponent(form.emailBody)}`);
  return `mailto:${to}${query.length ? `?${query.join('&')}` : ''}`;
}

export function encodePhone(form: Pick<QrFormState, 'phone'>): string {
  const number = normalizePhone(form.phone);
  if (!number.replace('+', '')) throw new Error('Enter the phone number the code should dial.');
  return `tel:${number}`;
}

export function encodeSms(form: Pick<QrFormState, 'smsNumber' | 'smsMessage'>): string {
  const number = normalizePhone(form.smsNumber);
  if (!number.replace('+', '')) throw new Error('Enter the number the text message should go to.');
  const message = form.smsMessage.trim();
  return message ? `SMSTO:${number}:${message}` : `SMSTO:${number}:`;
}

export function encodeWhatsApp(form: Pick<QrFormState, 'waNumber' | 'waMessage'>): string {
  const digits = form.waNumber.replace(/\D/g, '');
  if (!digits) throw new Error('Enter the WhatsApp number, including its country code.');
  if (digits.length < 7) {
    throw new Error('WhatsApp links need the full number with its country code, for example 34600123456.');
  }
  const message = form.waMessage.trim();
  return `https://wa.me/${digits}${message ? `?text=${encodeURIComponent(message)}` : ''}`;
}

type VCardFields = Pick<
  QrFormState,
  | 'vcFirstName'
  | 'vcLastName'
  | 'vcOrg'
  | 'vcTitle'
  | 'vcPhone'
  | 'vcEmail'
  | 'vcUrl'
  | 'vcStreet'
  | 'vcCity'
  | 'vcRegion'
  | 'vcPostalCode'
  | 'vcCountry'
  | 'vcNote'
>;

export function encodeVCard(form: VCardFields): string {
  const first = form.vcFirstName.trim();
  const last = form.vcLastName.trim();
  const org = form.vcOrg.trim();
  if (!first && !last && !org) {
    throw new Error('Add at least a name or an organisation to the contact card.');
  }
  const esc = escapeVCardValue;
  const fullName = [first, last].filter(Boolean).join(' ') || org;
  const lines = ['BEGIN:VCARD', 'VERSION:3.0', `N:${esc(last)};${esc(first)};;;`, `FN:${esc(fullName)}`];
  if (org) lines.push(`ORG:${esc(org)}`);
  if (form.vcTitle.trim()) lines.push(`TITLE:${esc(form.vcTitle.trim())}`);
  if (form.vcPhone.trim()) lines.push(`TEL;TYPE=CELL,VOICE:${esc(normalizePhone(form.vcPhone))}`);
  if (form.vcEmail.trim()) lines.push(`EMAIL;TYPE=INTERNET:${esc(form.vcEmail.trim())}`);
  if (form.vcUrl.trim()) lines.push(`URL:${esc(form.vcUrl.trim())}`);
  const address = [form.vcStreet, form.vcCity, form.vcRegion, form.vcPostalCode, form.vcCountry].map((v) =>
    v.trim(),
  );
  if (address.some(Boolean)) lines.push(`ADR;TYPE=HOME:;;${address.map(esc).join(';')}`);
  if (form.vcNote.trim()) lines.push(`NOTE:${esc(form.vcNote.trim())}`);
  lines.push('END:VCARD');
  return lines.join('\r\n');
}

export function encodeGeo(form: Pick<QrFormState, 'geoLatitude' | 'geoLongitude'>): string {
  const rawLat = form.geoLatitude.trim();
  const rawLng = form.geoLongitude.trim();
  if (!rawLat || !rawLng) throw new Error('Enter both a latitude and a longitude.');
  const lat = Number(rawLat);
  const lng = Number(rawLng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error('Latitude and longitude have to be numbers, for example 40.4168 and -3.7038.');
  }
  if (lat < -90 || lat > 90) throw new Error('Latitude has to be between -90 and 90.');
  if (lng < -180 || lng > 180) throw new Error('Longitude has to be between -180 and 180.');
  return `geo:${lat},${lng}`;
}

/** iCalendar UTC timestamp: 20240131T143000Z. */
export function formatUtcStamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

/** Read the `YYYY-MM-DDTHH:MM` an `<input type="datetime-local">` produces, in local time. */
export function parseLocalDateTime(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!match) throw new Error('Pick a date and a time for the event.');
  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    match[6] ? Number(match[6]) : 0,
  );
  if (Number.isNaN(date.getTime())) throw new Error('That date and time could not be read.');
  return date;
}

export function encodeEvent(
  form: Pick<QrFormState, 'evTitle' | 'evLocation' | 'evDescription' | 'evStart' | 'evEnd'>,
): string {
  const title = form.evTitle.trim();
  if (!title) throw new Error('Give the event a title.');
  if (!form.evStart.trim()) throw new Error('Pick the date and time the event starts.');
  const start = parseLocalDateTime(form.evStart);
  const end = form.evEnd.trim() ? parseLocalDateTime(form.evEnd) : new Date(start.getTime() + 3_600_000);
  if (end.getTime() <= start.getTime()) throw new Error('The event has to end after it starts.');
  const esc = escapeVCardValue;
  const lines = [
    'BEGIN:VEVENT',
    `SUMMARY:${esc(title)}`,
    `DTSTART:${formatUtcStamp(start)}`,
    `DTEND:${formatUtcStamp(end)}`,
  ];
  if (form.evLocation.trim()) lines.push(`LOCATION:${esc(form.evLocation.trim())}`);
  if (form.evDescription.trim()) lines.push(`DESCRIPTION:${esc(form.evDescription.trim())}`);
  lines.push('END:VEVENT');
  return lines.join('\r\n');
}

/** Turn the whole form into the string that actually goes inside the QR code. */
export function payloadFor(type: QrContentType, form: QrFormState): string {
  switch (type) {
    case 'url':
      return encodeUrl(form);
    case 'text':
      return encodeText(form);
    case 'wifi':
      return encodeWifi(form);
    case 'email':
      return encodeEmail(form);
    case 'phone':
      return encodePhone(form);
    case 'sms':
      return encodeSms(form);
    case 'whatsapp':
      return encodeWhatsApp(form);
    case 'vcard':
      return encodeVCard(form);
    case 'geo':
      return encodeGeo(form);
    case 'event':
      return encodeEvent(form);
  }
}

/** Filename stem suggested when exporting, e.g. `qr-wifi`. */
export function suggestedName(type: QrContentType): string {
  return `qr-${type}`;
}

// ------------------------------------------------------------------ matrix

export type ErrorCorrection = 'L' | 'M' | 'Q' | 'H';
export type ModuleShape = 'square' | 'rounded' | 'dots';
export type EyeShape = 'square' | 'rounded' | 'circle';
export type GradientDirection = 'horizontal' | 'vertical' | 'diagonal' | 'antidiagonal';

export interface QrStyle {
  foreground: string;
  /** Second gradient stop, or null for a solid fill. */
  gradientTo: string | null;
  gradientDirection: GradientDirection;
  background: string;
  transparentBackground: boolean;
  moduleShape: ModuleShape;
  eyeShape: EyeShape;
  /** Quiet zone, in modules. The QR spec asks for at least 4. */
  margin: number;
  errorCorrection: ErrorCorrection;
}

export const DEFAULT_STYLE: QrStyle = {
  foreground: '#111111',
  gradientTo: null,
  gradientDirection: 'diagonal',
  background: '#ffffff',
  transparentBackground: false,
  moduleShape: 'square',
  eyeShape: 'square',
  margin: 4,
  errorCorrection: 'M',
};

/** Side of a finder pattern, in modules. */
export const EYE_SIZE = 7;

/** Build the module matrix. Throws a readable error when the payload is too long. */
export function buildMatrix(text: string, errorCorrection: ErrorCorrection): boolean[][] {
  let qr;
  try {
    qr = create(text, { errorCorrectionLevel: errorCorrection });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/too big|big to be stored|data too long/i.test(message)) {
      throw new Error(
        `That content is too long for a single QR code at error correction ${errorCorrection}. Shorten it, or drop to a lower level such as L.`,
      );
    }
    throw new Error(`This content could not be encoded as a QR code. ${message}`);
  }
  const { size, data } = qr.modules;
  const bits: boolean[][] = [];
  for (let row = 0; row < size; row += 1) {
    const line: boolean[] = new Array(size);
    for (let col = 0; col < size; col += 1) line[col] = data[row * size + col] === 1;
    bits.push(line);
  }
  return bits;
}

/** Top-left corners of the three finder patterns, as [row, col]. */
export function eyeOrigins(size: number): Array<[number, number]> {
  return [
    [0, 0],
    [0, size - EYE_SIZE],
    [size - EYE_SIZE, 0],
  ];
}

/** Finder-pattern modules are drawn as whole eyes, never as individual modules. */
export function isEyeModule(size: number, row: number, col: number): boolean {
  return eyeOrigins(size).some(
    ([r0, c0]) => row >= r0 && row < r0 + EYE_SIZE && col >= c0 && col < c0 + EYE_SIZE,
  );
}

/** Horizontal runs of dark data modules — one SVG rect instead of a dozen. */
export function darkRuns(bits: boolean[][]): Array<[row: number, col: number, length: number]> {
  const size = bits.length;
  const runs: Array<[number, number, number]> = [];
  for (let row = 0; row < size; row += 1) {
    let start = -1;
    for (let col = 0; col <= size; col += 1) {
      const dark = col < size && bits[row][col] && !isEyeModule(size, row, col);
      if (dark && start < 0) start = col;
      else if (!dark && start >= 0) {
        runs.push([row, start, col - start]);
        start = -1;
      }
    }
  }
  return runs;
}

/** Gradient end points in module coordinates, so canvas and SVG agree. */
export function gradientVector(
  direction: GradientDirection,
  span: number,
): { x1: number; y1: number; x2: number; y2: number } {
  switch (direction) {
    case 'horizontal':
      return { x1: 0, y1: 0, x2: span, y2: 0 };
    case 'vertical':
      return { x1: 0, y1: 0, x2: 0, y2: span };
    case 'antidiagonal':
      return { x1: 0, y1: span, x2: span, y2: 0 };
    default:
      return { x1: 0, y1: 0, x2: span, y2: span };
  }
}

// ------------------------------------------------------------------ contrast

export function parseHexColor(hex: string): { r: number; g: number; b: number } | null {
  const value = hex.trim().replace(/^#/, '');
  const full =
    value.length === 3 || value.length === 4
      ? value
          .slice(0, 3)
          .split('')
          .map((c) => c + c)
          .join('')
      : value.slice(0, 6);
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

function channelLuminance(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number | null {
  const rgb = parseHexColor(hex);
  if (!rgb) return null;
  return 0.2126 * channelLuminance(rgb.r) + 0.7152 * channelLuminance(rgb.g) + 0.0722 * channelLuminance(rgb.b);
}

/** WCAG contrast ratio, 1 (identical) to 21 (black on white). */
export function contrastRatio(a: string, b: string): number | null {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  if (la === null || lb === null) return null;
  const [light, dark] = la >= lb ? [la, lb] : [lb, la];
  return (light + 0.05) / (dark + 0.05);
}

// ------------------------------------------------------------------ svg

export interface SvgLogo {
  /** A data: URL, so the SVG stays a single self-contained file. */
  href: string;
  /** Logo width as a fraction of the code width. */
  ratio: number;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function round(value: number): string {
  return Number(value.toFixed(3)).toString();
}

/**
 * The SVG twin of the canvas renderer. Both work in module units — one unit is
 * one module — so the vector export matches the preview pixel for pixel.
 */
export function buildQrSvg(
  bits: boolean[][],
  style: QrStyle,
  options: { pixelSize: number; logo?: SvgLogo | null } = { pixelSize: 512 },
): string {
  const size = bits.length;
  const total = size + style.margin * 2;
  const gradient = style.gradientTo ? gradientVector(style.gradientDirection, size) : null;
  const fill = gradient ? 'url(#qrFill)' : escapeXml(style.foreground);
  const parts: string[] = [];

  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
      `width="${options.pixelSize}" height="${options.pixelSize}" ` +
      `viewBox="0 0 ${total} ${total}"${style.moduleShape === 'square' && style.eyeShape === 'square' ? ' shape-rendering="crispEdges"' : ''}>`,
  );

  if (gradient) {
    // `userSpaceOnUse` coordinates are read in the user space of the element
    // that references the gradient — every module lives inside the
    // `translate(margin margin)` group below, which already supplies the quiet
    // zone. Adding the margin here too would shift the ramp a full margin away
    // from the code, so these stay in plain code-area coordinates.
    parts.push(
      '<defs>' +
        `<linearGradient id="qrFill" gradientUnits="userSpaceOnUse" x1="${round(gradient.x1)}" y1="${round(gradient.y1)}" x2="${round(gradient.x2)}" y2="${round(gradient.y2)}">` +
        `<stop offset="0" stop-color="${escapeXml(style.foreground)}"/>` +
        `<stop offset="1" stop-color="${escapeXml(style.gradientTo as string)}"/>` +
        '</linearGradient></defs>',
    );
  }

  if (!style.transparentBackground) {
    parts.push(`<rect width="${total}" height="${total}" fill="${escapeXml(style.background)}"/>`);
  }

  parts.push(`<g transform="translate(${style.margin} ${style.margin})" fill="${fill}">`);

  // Data modules.
  if (style.moduleShape === 'square') {
    for (const [row, col, length] of darkRuns(bits)) {
      parts.push(`<rect x="${col}" y="${row}" width="${length}" height="1"/>`);
    }
  } else {
    for (let row = 0; row < size; row += 1) {
      for (let col = 0; col < size; col += 1) {
        if (!bits[row][col] || isEyeModule(size, row, col)) continue;
        parts.push(
          style.moduleShape === 'dots'
            ? `<circle cx="${round(col + 0.5)}" cy="${round(row + 0.5)}" r="0.42"/>`
            : `<rect x="${col}" y="${row}" width="1" height="1" rx="0.32"/>`,
        );
      }
    }
  }

  // Finder patterns: a one-module ring plus a solid centre.
  for (const [row, col] of eyeOrigins(size)) {
    if (style.eyeShape === 'circle') {
      parts.push(
        `<circle cx="${round(col + 3.5)}" cy="${round(row + 3.5)}" r="3" fill="none" stroke="${fill}" stroke-width="1"/>`,
        `<circle cx="${round(col + 3.5)}" cy="${round(row + 3.5)}" r="1.5"/>`,
      );
    } else {
      const rx = style.eyeShape === 'rounded' ? 1.75 : 0;
      const innerRx = style.eyeShape === 'rounded' ? 0.75 : 0;
      parts.push(
        `<rect x="${round(col + 0.5)}" y="${round(row + 0.5)}" width="6" height="6" rx="${rx}" fill="none" stroke="${fill}" stroke-width="1"/>`,
        `<rect x="${col + 2}" y="${row + 2}" width="3" height="3" rx="${innerRx}"/>`,
      );
    }
  }

  parts.push('</g>');

  if (options.logo) {
    const logoSpan = size * options.logo.ratio;
    const pad = Math.max(0.5, logoSpan * 0.08);
    const boxSpan = logoSpan + pad * 2;
    const boxOrigin = style.margin + (size - boxSpan) / 2;
    const logoOrigin = style.margin + (size - logoSpan) / 2;
    parts.push(
      `<rect x="${round(boxOrigin)}" y="${round(boxOrigin)}" width="${round(boxSpan)}" height="${round(boxSpan)}" rx="${round(Math.min(1.5, boxSpan / 6))}" fill="${escapeXml(style.transparentBackground ? '#ffffff' : style.background)}"/>`,
      // Both spellings of the attribute: SVG 2 renderers read `href`, older
      // drawing apps only understand `xlink:href`.
      `<image href="${escapeXml(options.logo.href)}" xlink:href="${escapeXml(options.logo.href)}" x="${round(logoOrigin)}" y="${round(logoOrigin)}" width="${round(logoSpan)}" height="${round(logoSpan)}" preserveAspectRatio="xMidYMid meet"/>`,
    );
  }

  parts.push('</svg>');
  return parts.join('');
}
