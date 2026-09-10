import { describe, expect, it } from 'vitest';
import {
  describeKind,
  detectKind,
  explain,
  isOpenableUrl,
  parseICalDate,
  parseVCard,
  parseWifi,
  toOpenableUrl,
} from './logic';

describe('detectKind', () => {
  it('recognises every payload Toolbox can generate', () => {
    expect(detectKind('https://example.com')).toBe('url');
    expect(detectKind('WIFI:T:WPA;S:Net;P:pw;;')).toBe('wifi');
    expect(detectKind('BEGIN:VCARD\r\nVERSION:3.0\r\nEND:VCARD')).toBe('vcard');
    expect(detectKind('MECARD:N:Ada;;')).toBe('vcard');
    expect(detectKind('BEGIN:VEVENT\r\nSUMMARY:Launch\r\nEND:VEVENT')).toBe('event');
    expect(detectKind('mailto:a@b.co?subject=Hi')).toBe('email');
    expect(detectKind('tel:+34600123456')).toBe('phone');
    expect(detectKind('SMSTO:+34600123456:Hola')).toBe('sms');
    expect(detectKind('geo:40.4168,-3.7038')).toBe('geo');
  });

  it('is case-insensitive about the scheme', () => {
    expect(detectKind('wifi:T:nopass;S:Guest;;')).toBe('wifi');
    expect(detectKind('HTTPS://EXAMPLE.COM')).toBe('url');
    expect(detectKind('begin:vcard\nend:vcard')).toBe('vcard');
  });

  it('treats a bare domain as a link but leaves other text alone', () => {
    expect(detectKind('example.com/menu')).toBe('url');
    expect(detectKind('toolbox.app')).toBe('url');
    expect(detectKind('1.5')).toBe('text');
    expect(detectKind('Table 4, ask for the special')).toBe('text');
    expect(detectKind('ada@example.com')).toBe('email');
  });

  it('gives every kind a human label', () => {
    expect(describeKind('wifi')).toBe('Wi-Fi network');
    expect(describeKind('text')).toBe('Plain text');
  });
});

describe('opening links safely', () => {
  it('only calls http and https openable', () => {
    expect(isOpenableUrl('https://example.com')).toBe(true);
    expect(isOpenableUrl('http://example.com/a')).toBe(true);
    expect(isOpenableUrl('javascript:alert(1)')).toBe(false);
    expect(isOpenableUrl('file:///etc/passwd')).toBe(false);
    expect(isOpenableUrl('data:text/html,<script>')).toBe(false);
  });

  it('adds https:// to a bare domain and refuses anything else', () => {
    expect(toOpenableUrl('example.com/menu')).toBe('https://example.com/menu');
    expect(toOpenableUrl('https://example.com')).toBe('https://example.com');
    expect(toOpenableUrl('WIFI:T:WPA;S:Net;P:pw;;')).toBeNull();
    expect(toOpenableUrl('javascript:alert(1)')).toBeNull();
  });
});

describe('Wi-Fi payloads', () => {
  it('reads the four fields', () => {
    expect(parseWifi('WIFI:T:WPA;S:Casa;P:hunter2;H:true;;')).toEqual({
      ssid: 'Casa',
      password: 'hunter2',
      encryption: 'WPA',
      hidden: true,
    });
  });

  it('unescapes separators inside the SSID and password', () => {
    const parsed = parseWifi('WIFI:T:WPA;S:Home\\;Net;P:p\\:a\\,s\\"s\\\\word;;');
    expect(parsed?.ssid).toBe('Home;Net');
    expect(parsed?.password).toBe('p:a,s"s\\word');
  });

  it('handles open networks and missing fields', () => {
    expect(parseWifi('WIFI:T:nopass;S:Guest;;')).toEqual({
      ssid: 'Guest',
      password: '',
      encryption: 'nopass',
      hidden: false,
    });
    expect(parseWifi('WIFI:S:OnlyName;;')?.encryption).toBe('');
    expect(parseWifi('not a wifi payload')).toBeNull();
  });

  it('describes the security type in words', () => {
    expect(explain('WIFI:T:nopass;S:Guest;;').details).toContainEqual({
      label: 'Security',
      value: 'Open — no password',
    });
    expect(explain('WIFI:T:WPA;S:Casa;P:pw;;').details).toContainEqual({
      label: 'Security',
      value: 'WPA / WPA2',
    });
  });

  it('marks the password so the UI can treat it carefully', () => {
    const password = explain('WIFI:T:WPA;S:Casa;P:hunter2;;').details.find((d) => d.label === 'Password');
    expect(password).toEqual({ label: 'Password', value: 'hunter2', secret: true });
  });
});

describe('vCard', () => {
  const card = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    'N:Lovelace;Ada;;;',
    'FN:Ada Lovelace',
    'ORG:Analytical\\, Engines Ltd',
    'TITLE:Mathematician',
    'TEL;TYPE=CELL,VOICE:+442079460958',
    'EMAIL;TYPE=INTERNET:ada@example.com',
    'URL:https://example.com',
    'ADR;TYPE=HOME:;;12 Baker St;London;;NW1;UK',
    'NOTE:Met at the fair\\; follow up',
    'END:VCARD',
  ].join('\r\n');

  it('pulls out the fields with friendly labels', () => {
    const details = parseVCard(card);
    expect(details).toContainEqual({ label: 'Name', value: 'Ada Lovelace' });
    expect(details).toContainEqual({ label: 'Organisation', value: 'Analytical, Engines Ltd' });
    expect(details).toContainEqual({ label: 'Mobile phone', value: '+442079460958' });
    expect(details).toContainEqual({ label: 'Note', value: 'Met at the fair; follow up' });
  });

  it('joins the address components in reading order', () => {
    expect(parseVCard(card)).toContainEqual({ label: 'Address', value: '12 Baker St, London, NW1, UK' });
  });

  it('skips structural properties', () => {
    const labels = parseVCard(card).map((d) => d.label);
    expect(labels).not.toContain('BEGIN');
    expect(labels).not.toContain('VERSION');
  });

  it('falls back to N when there is no FN', () => {
    const minimal = 'BEGIN:VCARD\r\nVERSION:3.0\r\nN:Turing;Alan;;;\r\nEND:VCARD';
    expect(parseVCard(minimal)[0]).toEqual({ label: 'Name', value: 'Alan Turing' });
  });

  it('unfolds the continuation lines long values are wrapped into', () => {
    const folded = 'BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Ada\r\nNOTE:a very long\r\n  note that wrapped\r\nEND:VCARD';
    expect(parseVCard(folded)).toContainEqual({ label: 'Note', value: 'a very long note that wrapped' });
  });

  it('turns escaped newlines back into real ones', () => {
    const card2 = 'BEGIN:VCARD\r\nFN:Ada\r\nNOTE:first\\nsecond\r\nEND:VCARD';
    expect(parseVCard(card2)).toContainEqual({ label: 'Note', value: 'first\nsecond' });
  });

  it('reads the older MECARD format too', () => {
    const details = parseVCard('MECARD:N:Lovelace,Ada;TEL:+442079460958;EMAIL:ada@example.com;;');
    expect(details).toContainEqual({ label: 'Name', value: 'Lovelace Ada' });
    expect(details).toContainEqual({ label: 'Email', value: 'ada@example.com' });
  });
});

describe('other payloads', () => {
  it('decodes mailto query parameters', () => {
    const details = explain('mailto:a@b.co?subject=Hi%20there&body=One%20%26%20two').details;
    expect(details).toEqual([
      { label: 'To', value: 'a@b.co' },
      { label: 'Subject', value: 'Hi there' },
      { label: 'Message', value: 'One & two' },
    ]);
  });

  it('splits an SMSTO payload into number and message', () => {
    expect(explain('SMSTO:+34600123456:See you at 8').details).toEqual([
      { label: 'Number', value: '+34600123456' },
      { label: 'Message', value: 'See you at 8' },
    ]);
    expect(explain('SMSTO:+34600123456:').details).toEqual([{ label: 'Number', value: '+34600123456' }]);
  });

  it('splits a geo payload and ignores its query part', () => {
    expect(explain('geo:40.4168,-3.7038?q=Madrid').details).toEqual([
      { label: 'Latitude', value: '40.4168' },
      { label: 'Longitude', value: '-3.7038' },
    ]);
  });

  it('strips the tel: scheme from a phone number', () => {
    expect(explain('tel:+34600123456').details).toEqual([{ label: 'Number', value: '+34600123456' }]);
  });

  it('formats iCalendar stamps and leaves unknown ones alone', () => {
    expect(parseICalDate('20240131')).toBe('2024-01-31');
    expect(parseICalDate('not-a-date')).toBe('not-a-date');
    expect(parseICalDate('20240131T143000Z')).toBe(
      new Date(Date.UTC(2024, 0, 31, 14, 30, 0)).toLocaleString(),
    );
  });

  it('reads an event back into labelled fields', () => {
    const details = explain(
      'BEGIN:VEVENT\r\nSUMMARY:Toolbox launch\r\nDTSTART:20240601T070000Z\r\nLOCATION:Madrid\r\nEND:VEVENT',
    ).details;
    expect(details).toContainEqual({ label: 'Title', value: 'Toolbox launch' });
    expect(details).toContainEqual({ label: 'Location', value: 'Madrid' });
    expect(details.find((d) => d.label === 'Starts')).toBeTruthy();
  });

  it('leaves plain text without a breakdown', () => {
    expect(explain('just some words')).toEqual({ kind: 'text', details: [] });
  });
});
