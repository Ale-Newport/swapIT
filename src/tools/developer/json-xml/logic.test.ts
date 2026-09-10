import { describe, expect, it } from 'vitest';
import { detectFormat, isValidElementName, jsonToXml, prepareRoot, xmlToJson } from './logic';

const XML_OPTS = { rootName: 'root', indent: 2, attributePrefix: '@_', declaration: false };
const JSON_OPTS = { indent: 0, attributePrefix: '@_', parseValues: true };

describe('detectFormat', () => {
  it('spots XML by its opening angle bracket', () => {
    expect(detectFormat('  <note>hi</note>')).toBe('xml');
    expect(detectFormat('<?xml version="1.0"?><a/>')).toBe('xml');
  });

  it('treats anything else as JSON', () => {
    expect(detectFormat('{"a":1}')).toBe('json');
  });
});

describe('isValidElementName', () => {
  it('accepts ordinary names', () => {
    expect(isValidElementName('note')).toBe(true);
    expect(isValidElementName('_x.y-z2')).toBe(true);
  });

  it('rejects names XML cannot use', () => {
    expect(isValidElementName('2fast')).toBe(false);
    expect(isValidElementName('has space')).toBe(false);
    expect(isValidElementName('')).toBe(false);
  });
});

describe('prepareRoot', () => {
  it('keeps a document that already has one root key', () => {
    expect(prepareRoot({ note: { to: 'Ada' } }, 'root')).toEqual({ note: { to: 'Ada' } });
  });

  it('wraps a multi-key object in the root element', () => {
    expect(prepareRoot({ a: 1, b: 2 }, 'root')).toEqual({ root: { a: 1, b: 2 } });
  });

  it('wraps an array so each entry becomes an item element', () => {
    expect(prepareRoot([1, 2], 'root')).toEqual({ root: { item: [1, 2] } });
  });

  it('wraps a single key whose value is an array, which would repeat the root', () => {
    expect(prepareRoot({ a: [1, 2] }, 'root')).toEqual({ root: { a: [1, 2] } });
  });
});

describe('jsonToXml', () => {
  it('uses the single top-level key as the root element', () => {
    expect(jsonToXml('{"note":{"to":"Ada","from":"Linus"}}', XML_OPTS).output).toBe(
      '<note>\n  <to>Ada</to>\n  <from>Linus</from>\n</note>\n',
    );
  });

  it('turns prefixed keys into attributes', () => {
    expect(jsonToXml('{"note":{"@_id":"7","to":"Ada"}}', XML_OPTS).output).toBe(
      '<note id="7">\n  <to>Ada</to>\n</note>\n',
    );
  });

  it('honours a different attribute prefix', () => {
    expect(jsonToXml('{"note":{"$id":"7"}}', { ...XML_OPTS, attributePrefix: '$' }).output).toBe('<note id="7"/>\n');
  });

  it('repeats an element for each array entry', () => {
    expect(jsonToXml('{"list":{"item":[1,2]}}', XML_OPTS).output).toBe(
      '<list>\n  <item>1</item>\n  <item>2</item>\n</list>\n',
    );
  });

  it('wraps a top-level array in the configured root', () => {
    expect(jsonToXml('[1,2]', { ...XML_OPTS, rootName: 'numbers' }).output).toBe(
      '<numbers>\n  <item>1</item>\n  <item>2</item>\n</numbers>\n',
    );
  });

  it('escapes characters that would break the markup', () => {
    expect(jsonToXml('{"a":"x < y & z"}', XML_OPTS).output).toContain('&lt; y &amp; z');
  });

  it('adds the declaration when asked', () => {
    expect(jsonToXml('{"a":1}', { ...XML_OPTS, declaration: true }).output).toBe(
      '<?xml version="1.0" encoding="UTF-8"?>\n<a>1</a>\n',
    );
  });

  it('honours the indent width', () => {
    expect(jsonToXml('{"a":{"b":1}}', { ...XML_OPTS, indent: 4 }).output).toBe('<a>\n    <b>1</b>\n</a>\n');
  });

  it('refuses an unusable root name', () => {
    expect(() => jsonToXml('{"a":1,"b":2}', { ...XML_OPTS, rootName: '2 items' })).toThrow(/not a usable element name/);
  });

  it('reports where the JSON is malformed', () => {
    expect(() => jsonToXml('{"a":}', XML_OPTS)).toThrow(/not valid JSON/);
  });
});

describe('xmlToJson', () => {
  it('reads elements and attributes', () => {
    expect(xmlToJson('<note id="7"><to>Ada</to></note>', JSON_OPTS).output).toBe('{"note":{"to":"Ada","@_id":7}}');
  });

  it('collects repeated elements into an array', () => {
    expect(xmlToJson('<list><item>1</item><item>2</item></list>', JSON_OPTS).output).toBe('{"list":{"item":[1,2]}}');
  });

  it('keeps values as strings when parsing is off', () => {
    expect(xmlToJson('<a x="1">2</a>', { ...JSON_OPTS, parseValues: false }).output).toBe('{"a":{"#text":"2","@_x":"1"}}');
  });

  it('puts mixed content under #text', () => {
    expect(xmlToJson('<a><b x="1">text</b></a>', JSON_OPTS).output).toBe('{"a":{"b":{"#text":"text","@_x":1}}}');
  });

  it('decodes entities and CDATA', () => {
    expect(xmlToJson('<a>x &amp; y</a>', JSON_OPTS).output).toBe('{"a":"x & y"}');
    expect(xmlToJson('<a><![CDATA[x < y]]></a>', JSON_OPTS).output).toBe('{"a":"x < y"}');
  });

  it('drops the XML declaration', () => {
    expect(xmlToJson('<?xml version="1.0"?><a>1</a>', JSON_OPTS).output).toBe('{"a":1}');
  });

  it('reports the line of a mismatched tag', () => {
    expect(() => xmlToJson('<a>\n<b></a>', JSON_OPTS)).toThrow(/line 2/);
  });

  it('rejects a document with no elements', () => {
    expect(() => xmlToJson('<?xml version="1.0"?>', JSON_OPTS)).toThrow(/no XML elements/);
    expect(() => xmlToJson('<!-- just a comment -->', JSON_OPTS)).toThrow(/no XML elements/);
  });

  it('round-trips a document through JSON and back', () => {
    const xml = '<note id="7"><to>Ada</to><tags><tag>a</tag><tag>b</tag></tags></note>';
    const json = xmlToJson(xml, JSON_OPTS);
    const back = jsonToXml(json.output, { ...XML_OPTS, indent: 0 });
    expect(back.output.replace(/\n/g, '')).toBe(xml);
  });
});
