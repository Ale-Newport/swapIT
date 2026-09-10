import { describe, expect, it } from 'vitest';
import jsQR from 'jsqr';
import {
  EMPTY_FORM,
  buildMatrix,
  buildQrSvg,
  contrastRatio,
  darkRuns,
  encodeEmail,
  encodeEvent,
  encodeGeo,
  encodePhone,
  encodeSms,
  encodeText,
  encodeUrl,
  encodeVCard,
  encodeWhatsApp,
  encodeWifi,
  escapeVCardValue,
  escapeWifiValue,
  formatUtcStamp,
  isEyeModule,
  normalizePhone,
  parseHexColor,
  payloadFor,
  DEFAULT_STYLE,
  type QrFormState,
  type QrStyle,
} from './logic';

function form(patch: Partial<QrFormState>): QrFormState {
  return { ...EMPTY_FORM, ...patch };
}

/**
 * Paint a matrix into a plain RGBA buffer so jsQR can read it back without a
 * canvas. This is what makes the encoder tests meaningful: the assertion is not
 * "we produced the string we expected", it is "a real decoder reads that string
 * out of a real QR code".
 */
function rasterize(bits: boolean[][], scale = 5, margin = 4) {
  const size = bits.length;
  const width = (size + margin * 2) * scale;
  const data = new Uint8ClampedArray(width * width * 4).fill(255);
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      if (!bits[row][col]) continue;
      for (let y = 0; y < scale; y += 1) {
        for (let x = 0; x < scale; x += 1) {
          const px = ((row + margin) * scale + y) * width + (col + margin) * scale + x;
          data[px * 4] = 0;
          data[px * 4 + 1] = 0;
          data[px * 4 + 2] = 0;
        }
      }
    }
  }
  return { data, width };
}

function roundTrip(payload: string): string | null {
  const { data, width } = rasterize(buildMatrix(payload, 'M'));
  return jsQR(data, width, width)?.data ?? null;
}

describe('URL and text', () => {
  it('adds https:// only when no scheme is present', () => {
    expect(encodeUrl({ url: 'example.com/path' })).toBe('https://example.com/path');
    expect(encodeUrl({ url: 'http://example.com' })).toBe('http://example.com');
    expect(encodeUrl({ url: 'mailto:a@b.co' })).toBe('mailto:a@b.co');
  });

  it('rejects blank input and embedded spaces', () => {
    expect(() => encodeUrl({ url: '   ' })).toThrow(/enter the web address/i);
    expect(() => encodeUrl({ url: 'example.com/a b' })).toThrow(/spaces/i);
  });

  it('keeps plain text byte for byte, including newlines', () => {
    expect(encodeText({ text: 'line one\nline two ' })).toBe('line one\nline two ');
    expect(() => encodeText({ text: '\n  ' })).toThrow();
  });
});

describe('Wi-Fi payloads', () => {
  it('escapes the five reserved characters', () => {
    expect(escapeWifiValue('a;b,c:d"e\\f')).toBe('a\\;b\\,c\\:d\\"e\\\\f');
  });

  it('escapes a backslash exactly once', () => {
    expect(escapeWifiValue('C:\\net')).toBe('C\\:\\\\net');
  });

  it('builds the standard WIFI: payload', () => {
    expect(
      encodeWifi({ wifiSsid: 'Café', wifiPassword: 'hunter2', wifiEncryption: 'WPA', wifiHidden: false }),
    ).toBe('WIFI:T:WPA;S:Café;P:hunter2;;');
  });

  it('adds H:true only for hidden networks', () => {
    expect(
      encodeWifi({ wifiSsid: 'Net', wifiPassword: 'pw', wifiEncryption: 'WEP', wifiHidden: true }),
    ).toBe('WIFI:T:WEP;S:Net;P:pw;H:true;;');
  });

  it('omits the password field for open networks', () => {
    expect(
      encodeWifi({ wifiSsid: 'Guest', wifiPassword: '', wifiEncryption: 'nopass', wifiHidden: false }),
    ).toBe('WIFI:T:nopass;S:Guest;;');
  });

  it('demands an SSID, and a password unless the network is open', () => {
    expect(() =>
      encodeWifi({ wifiSsid: ' ', wifiPassword: 'x', wifiEncryption: 'WPA', wifiHidden: false }),
    ).toThrow(/network name/i);
    expect(() =>
      encodeWifi({ wifiSsid: 'Net', wifiPassword: '', wifiEncryption: 'WPA', wifiHidden: false }),
    ).toThrow(/password/i);
  });

  it('survives a decode round trip with reserved characters in the password', () => {
    const payload = encodeWifi({
      wifiSsid: 'Home;Net',
      wifiPassword: 'p:a,s"s\\word',
      wifiEncryption: 'WPA',
      wifiHidden: true,
    });
    expect(roundTrip(payload)).toBe(payload);
  });
});

describe('email, phone, SMS and WhatsApp', () => {
  it('encodes the subject and body as query parameters', () => {
    expect(
      encodeEmail({ emailTo: 'a@b.co', emailSubject: 'Hi there', emailBody: 'One & two' }),
    ).toBe('mailto:a@b.co?subject=Hi%20there&body=One%20%26%20two');
  });

  it('omits the query string when there is nothing to add', () => {
    expect(encodeEmail({ emailTo: 'a@b.co', emailSubject: '', emailBody: '  ' })).toBe('mailto:a@b.co');
  });

  it('rejects an address that is not an address', () => {
    expect(() => encodeEmail({ emailTo: 'nope', emailSubject: '', emailBody: '' })).toThrow(/email address/i);
  });

  it('keeps a leading + and drops human formatting', () => {
    expect(normalizePhone('+34 600 123 456')).toBe('+34600123456');
    expect(normalizePhone('(555) 010-9999')).toBe('5550109999');
    expect(encodePhone({ phone: '+1 (555) 010-9999' })).toBe('tel:+15550109999');
    expect(() => encodePhone({ phone: '+' })).toThrow();
  });

  it('builds SMSTO payloads with and without a message', () => {
    expect(encodeSms({ smsNumber: '+15550109999', smsMessage: 'Hello' })).toBe('SMSTO:+15550109999:Hello');
    expect(encodeSms({ smsNumber: '5550109999', smsMessage: '  ' })).toBe('SMSTO:5550109999:');
  });

  it('strips the + for wa.me and insists on a country code', () => {
    expect(encodeWhatsApp({ waNumber: '+34 600 123 456', waMessage: 'Hola señor' })).toBe(
      'https://wa.me/34600123456?text=Hola%20se%C3%B1or',
    );
    expect(() => encodeWhatsApp({ waNumber: '600123', waMessage: '' })).toThrow(/country code/i);
    expect(() => encodeWhatsApp({ waNumber: 'abc', waMessage: '' })).toThrow();
  });
});

describe('vCard', () => {
  const contact = form({
    vcFirstName: 'Ada',
    vcLastName: 'Lovelace',
    vcOrg: 'Analytical, Engines Ltd',
    vcTitle: 'Mathematician',
    vcPhone: '+44 20 7946 0958',
    vcEmail: 'ada@example.com',
    vcUrl: 'https://example.com',
    vcStreet: '12 Baker St',
    vcCity: 'London',
    vcPostalCode: 'NW1',
    vcCountry: 'UK',
    vcNote: 'Met at the fair; follow up',
  });

  it('uses CRLF line endings', () => {
    const card = encodeVCard(contact);
    expect(card.split('\r\n').length).toBeGreaterThan(8);
    expect(card).not.toMatch(/[^\r]\n/);
  });

  it('escapes commas, semicolons and backslashes in values', () => {
    expect(escapeVCardValue('a,b;c\\d')).toBe('a\\,b\\;c\\\\d');
    expect(escapeVCardValue('line\nbreak')).toBe('line\\nbreak');
    expect(encodeVCard(contact)).toContain('ORG:Analytical\\, Engines Ltd');
    expect(encodeVCard(contact)).toContain('NOTE:Met at the fair\\; follow up');
  });

  it('writes N and FN, and an ADR with all seven components', () => {
    const card = encodeVCard(contact);
    expect(card).toContain('N:Lovelace;Ada;;;');
    expect(card).toContain('FN:Ada Lovelace');
    const adr = card.split('\r\n').find((line) => line.startsWith('ADR'));
    expect(adr).toBe('ADR;TYPE=HOME:;;12 Baker St;London;;NW1;UK');
    expect(adr?.slice('ADR;TYPE=HOME:'.length).split(';')).toHaveLength(7);
  });

  it('falls back to the organisation when there is no personal name', () => {
    const card = encodeVCard(form({ vcOrg: 'Toolbox' }));
    expect(card).toContain('FN:Toolbox');
    expect(card).toContain('N:;;;;');
  });

  it('refuses a card with neither a name nor an organisation', () => {
    expect(() => encodeVCard(form({ vcEmail: 'a@b.co' }))).toThrow(/name or an organisation/i);
  });

  it('survives a decode round trip', () => {
    const card = encodeVCard(contact);
    expect(roundTrip(card)).toBe(card);
  });
});

describe('geo', () => {
  it('encodes a coordinate pair', () => {
    expect(encodeGeo({ geoLatitude: ' 40.4168 ', geoLongitude: '-3.7038' })).toBe('geo:40.4168,-3.7038');
  });

  it('rejects out-of-range and non-numeric coordinates', () => {
    expect(() => encodeGeo({ geoLatitude: '91', geoLongitude: '0' })).toThrow(/latitude/i);
    expect(() => encodeGeo({ geoLatitude: '0', geoLongitude: '181' })).toThrow(/longitude/i);
    expect(() => encodeGeo({ geoLatitude: 'north', geoLongitude: '0' })).toThrow(/numbers/i);
    expect(() => encodeGeo({ geoLatitude: '', geoLongitude: '2' })).toThrow(/both/i);
  });
});

describe('calendar event', () => {
  it('formats UTC stamps as YYYYMMDDTHHMMSSZ', () => {
    expect(formatUtcStamp(new Date(Date.UTC(2024, 0, 31, 14, 30, 5)))).toBe('20240131T143005Z');
    expect(formatUtcStamp(new Date(Date.UTC(2024, 11, 1, 0, 0, 0)))).toBe('20241201T000000Z');
  });

  it('converts the local wall time the picker produces into UTC', () => {
    const event = encodeEvent({
      evTitle: 'Launch',
      evLocation: '',
      evDescription: '',
      evStart: '2024-06-01T09:00',
      evEnd: '2024-06-01T10:30',
    });
    expect(event).toContain(`DTSTART:${formatUtcStamp(new Date('2024-06-01T09:00'))}`);
    expect(event).toContain(`DTEND:${formatUtcStamp(new Date('2024-06-01T10:30'))}`);
  });

  it('defaults to a one-hour event when no end time is given', () => {
    const event = encodeEvent({
      evTitle: 'Standup',
      evLocation: 'Room 2',
      evDescription: '',
      evStart: '2024-06-01T09:00',
      evEnd: '',
    });
    expect(event).toContain(`DTEND:${formatUtcStamp(new Date('2024-06-01T10:00'))}`);
    expect(event).toContain('LOCATION:Room 2');
  });

  it('wraps the event in BEGIN/END:VEVENT with CRLF endings', () => {
    const lines = encodeEvent({
      evTitle: 'Party',
      evLocation: '',
      evDescription: '',
      evStart: '2024-06-01T09:00',
      evEnd: '',
    }).split('\r\n');
    expect(lines[0]).toBe('BEGIN:VEVENT');
    expect(lines[lines.length - 1]).toBe('END:VEVENT');
  });

  it('rejects an event that ends before it starts, or has no title', () => {
    expect(() =>
      encodeEvent({
        evTitle: 'Backwards',
        evLocation: '',
        evDescription: '',
        evStart: '2024-06-01T10:00',
        evEnd: '2024-06-01T09:00',
      }),
    ).toThrow(/end after it starts/i);
    expect(() =>
      encodeEvent({ evTitle: '', evLocation: '', evDescription: '', evStart: '2024-06-01T10:00', evEnd: '' }),
    ).toThrow(/title/i);
  });
});

describe('payloadFor', () => {
  it('routes each content type to its own encoder', () => {
    expect(payloadFor('url', form({ url: 'toolbox.app' }))).toBe('https://toolbox.app');
    expect(payloadFor('phone', form({ phone: '5550100' }))).toBe('tel:5550100');
    expect(payloadFor('geo', form({ geoLatitude: '1', geoLongitude: '2' }))).toBe('geo:1,2');
  });
});

describe('module matrix', () => {
  it('produces a square matrix of the version size', () => {
    const bits = buildMatrix('HELLO', 'M');
    expect(bits.length).toBe(21);
    expect(bits.every((row) => row.length === 21)).toBe(true);
  });

  it('grows with the error correction level', () => {
    const payload = 'x'.repeat(200);
    expect(buildMatrix(payload, 'H').length).toBeGreaterThan(buildMatrix(payload, 'L').length);
  });

  it('explains itself when the content cannot fit', () => {
    expect(() => buildMatrix('x'.repeat(4000), 'H')).toThrow(/too long|could not be encoded/i);
  });

  it('marks all three finder patterns as eye modules', () => {
    const size = 21;
    expect(isEyeModule(size, 0, 0)).toBe(true);
    expect(isEyeModule(size, 6, 6)).toBe(true);
    expect(isEyeModule(size, 0, 20)).toBe(true);
    expect(isEyeModule(size, 20, 0)).toBe(true);
    expect(isEyeModule(size, 20, 20)).toBe(false);
    expect(isEyeModule(size, 7, 7)).toBe(false);
  });

  it('never emits a run that overlaps an eye', () => {
    const bits = buildMatrix('https://example.com/some/path', 'Q');
    const size = bits.length;
    for (const [row, col, length] of darkRuns(bits)) {
      for (let i = 0; i < length; i += 1) {
        expect(bits[row][col + i]).toBe(true);
        expect(isEyeModule(size, row, col + i)).toBe(false);
      }
    }
  });

  it('merges neighbouring dark modules into a single run and splits at gaps', () => {
    // A blank version-1 grid with two runs placed clear of the finder patterns.
    const bits = Array.from({ length: 21 }, () => new Array<boolean>(21).fill(false));
    bits[10][9] = true;
    bits[10][10] = true;
    bits[10][12] = true;
    expect(darkRuns(bits)).toEqual([
      [10, 9, 2],
      [10, 12, 1],
    ]);
  });

  it('drops dark modules that fall inside a finder pattern', () => {
    const bits = Array.from({ length: 21 }, () => new Array<boolean>(21).fill(false));
    bits[3][3] = true; // inside the top-left eye
    expect(darkRuns(bits)).toEqual([]);
  });
});

describe('SVG export', () => {
  const bits = buildMatrix('https://example.com', 'M');

  it('sizes the viewBox to the code plus its quiet zone', () => {
    const svg = buildQrSvg(bits, { ...DEFAULT_STYLE, margin: 4 }, { pixelSize: 512 });
    expect(svg).toContain(`viewBox="0 0 ${bits.length + 8} ${bits.length + 8}"`);
    expect(svg).toContain('width="512"');
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.endsWith('</svg>')).toBe(true);
  });

  it('paints a background rect unless the background is transparent', () => {
    expect(buildQrSvg(bits, DEFAULT_STYLE, { pixelSize: 256 })).toContain('<rect width=');
    const transparent = buildQrSvg(bits, { ...DEFAULT_STYLE, transparentBackground: true }, { pixelSize: 256 });
    expect(transparent).not.toContain(`<rect width="${bits.length + 8}"`);
  });

  it('defines a gradient only when a second colour is set', () => {
    expect(buildQrSvg(bits, DEFAULT_STYLE, { pixelSize: 256 })).not.toContain('linearGradient');
    const gradient = buildQrSvg(bits, { ...DEFAULT_STYLE, gradientTo: '#ff0055' }, { pixelSize: 256 });
    expect(gradient).toContain('<linearGradient id="qrFill"');
    expect(gradient).toContain('url(#qrFill)');
  });

  it('spans the gradient across the code, not the quiet zone', () => {
    // The modules sit inside `translate(margin margin)`, and userSpaceOnUse
    // coordinates are read in that same space — adding the margin here as well
    // would drag the whole ramp one quiet zone off the code.
    const svg = buildQrSvg(
      bits,
      { ...DEFAULT_STYLE, margin: 4, gradientTo: '#ff0055', gradientDirection: 'diagonal' },
      { pixelSize: 256 },
    );
    expect(svg).toContain(
      `<linearGradient id="qrFill" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${bits.length}" y2="${bits.length}">`,
    );
    expect(svg).toContain('<g transform="translate(4 4)"');
  });

  it('keeps every gradient direction inside the code area', () => {
    const span = bits.length;
    const corners: Record<string, [number, number, number, number]> = {
      horizontal: [0, 0, span, 0],
      vertical: [0, 0, 0, span],
      diagonal: [0, 0, span, span],
      antidiagonal: [0, span, span, 0],
    };
    for (const [direction, [x1, y1, x2, y2]] of Object.entries(corners)) {
      const svg = buildQrSvg(
        bits,
        {
          ...DEFAULT_STYLE,
          gradientTo: '#ff0055',
          gradientDirection: direction as QrStyle['gradientDirection'],
        },
        { pixelSize: 256 },
      );
      expect(svg).toContain(`x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"`);
    }
  });

  it('draws circles for dot modules and rects for square ones', () => {
    expect(buildQrSvg(bits, { ...DEFAULT_STYLE, moduleShape: 'dots' }, { pixelSize: 256 })).toContain('<circle');
    const square = buildQrSvg(bits, DEFAULT_STYLE, { pixelSize: 256 });
    expect(square).toContain('shape-rendering="crispEdges"');
  });

  it('embeds a logo as a self-contained data URL', () => {
    const svg = buildQrSvg(bits, DEFAULT_STYLE, {
      pixelSize: 256,
      logo: { href: 'data:image/png;base64,AAAA', ratio: 0.2 },
    });
    expect(svg).toContain('<image href="data:image/png;base64,AAAA"');
  });

  it('escapes a colour value rather than letting it break the markup', () => {
    const svg = buildQrSvg(bits, { ...DEFAULT_STYLE, background: '"><script>' }, { pixelSize: 64 });
    expect(svg).not.toContain('<script>');
  });
});

describe('contrast', () => {
  it('reads 3- and 6-digit hex', () => {
    expect(parseHexColor('#fff')).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseHexColor('000000')).toEqual({ r: 0, g: 0, b: 0 });
    expect(parseHexColor('nope')).toBeNull();
  });

  it('scores black on white at 21 and a colour against itself at 1', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#3366cc', '#3366cc')).toBeCloseTo(1, 5);
  });

  it('is symmetric and null for unreadable input', () => {
    expect(contrastRatio('#123456', '#abcdef')).toBeCloseTo(contrastRatio('#abcdef', '#123456') as number, 10);
    expect(contrastRatio('rgb(0,0,0)', '#fff')).toBeNull();
  });
});

describe('end to end', () => {
  it('decodes every content type back to the exact payload it encoded', () => {
    const samples = [
      payloadFor('url', form({ url: 'example.com/menu?table=4' })),
      payloadFor('email', form({ emailTo: 'hi@example.com', emailSubject: 'Order', emailBody: 'Two please' })),
      payloadFor('sms', form({ smsNumber: '+15550109999', smsMessage: 'On my way' })),
      payloadFor('whatsapp', form({ waNumber: '+34600123456', waMessage: 'Hola' })),
      payloadFor('geo', form({ geoLatitude: '40.4168', geoLongitude: '-3.7038' })),
      payloadFor(
        'event',
        form({ evTitle: 'Toolbox launch', evStart: '2024-06-01T09:00', evLocation: 'Madrid' }),
      ),
    ];
    for (const payload of samples) {
      expect(roundTrip(payload)).toBe(payload);
    }
  });

  it('carries accents, dashes and other scripts through unharmed', () => {
    // A Spanish SSID or a Japanese label has to survive the UTF-8 byte mode the
    // encoder falls back to, or the scannability badge would cry wolf.
    for (const payload of [
      encodeWifi({ wifiSsid: 'Café', wifiPassword: 'contraseña', wifiEncryption: 'WPA', wifiHidden: false }),
      encodeText({ text: 'Días — año 2024' }),
      encodeText({ text: '日本語' }),
    ]) {
      expect(roundTrip(payload)).toBe(payload);
    }
  });
});
