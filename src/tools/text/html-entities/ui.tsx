import { useCallback, useState } from 'react';
import { TextTool, type TextTransformResult } from '@/components/tool';
import { Field, Segmented, Select } from '@/components/ui';
import { countEntities, decodeEntities, encodeEntities, NAMED_COUNT, type EncodeMode } from './logic';

const MODE_HINTS: Record<EncodeMode, string> = {
  essential:
    'Escapes only & < > " and \' — the five characters that change how markup parses. Everything else, accents and emoji included, stays readable.',
  named: `Uses a named entity wherever one exists (${NAMED_COUNT} of them: &eacute;, &mdash;, &euro;, &hearts;…). Characters with no name, such as CJK, are left as they are — pick a numeric mode to escape those too.`,
  decimal: 'Escapes the five markup characters and everything outside printable ASCII as &#38; style numbers. Tabs and line breaks are kept.',
  hex: 'Same as decimal but written &#x26; style, which is what CSS and XML tooling tend to emit.',
  nonAscii:
    'Leaves markup alone and escapes only characters above ASCII, so an accented paragraph survives a Latin-1 pipeline without touching the tags around it.',
};

const MODE_OPTIONS = [
  { value: 'essential', label: 'Named — the essential five' },
  { value: 'named', label: 'Named — everywhere possible' },
  { value: 'decimal', label: 'Numeric decimal (&#38;)' },
  { value: 'hex', label: 'Numeric hex (&#x26;)' },
  { value: 'nonAscii', label: 'Non-ASCII characters only' },
];

const SAMPLE = `<p class="lead">Tom & Jerry's caf\u00E9 \u2014 5\u20AC, 20\u00A0% off</p>`;
const SAMPLE_ENCODED = '&lt;p class=&quot;lead&quot;&gt;Tom &amp; Jerry&apos;s caf&eacute; &mdash; 5&euro;, 20&nbsp;% off&lt;/p&gt;';

export default function HtmlEntities() {
  const [direction, setDirection] = useState<'encode' | 'decode'>('encode');
  const [mode, setMode] = useState<EncodeMode>('essential');

  const transform = useCallback(
    (input: string): TextTransformResult => {
      if (direction === 'decode') {
        const report = decodeEntities(input);
        const notes: string[] = [];
        if (report.unknown.length) {
          notes.push(
            `${report.unknown.length} entit${report.unknown.length === 1 ? 'y is' : 'ies are'} not recognised and ${
              report.unknown.length === 1 ? 'was' : 'were'
            } left untouched: ${report.unknown.slice(0, 6).join(' ')}${report.unknown.length > 6 ? '…' : ''}`,
          );
        }
        if (report.missingSemicolon.length) {
          notes.push(
            `${report.missingSemicolon.join(', ')} ${
              report.missingSemicolon.length === 1 ? 'is' : 'are'
            } missing the closing semicolon, so ${report.missingSemicolon.length === 1 ? 'it was' : 'they were'} left as-is.`,
          );
        }
        return {
          output: report.output,
          warning: notes.length ? notes.join(' ') : undefined,
          stats: [
            { label: 'Entities decoded', value: report.decoded.toLocaleString() },
            { label: 'Length', value: `${input.length.toLocaleString()} → ${report.output.length.toLocaleString()}` },
          ],
        };
      }

      const output = encodeEntities(input, mode);
      return {
        output,
        stats: [
          { label: 'Entities written', value: countEntities(output).toLocaleString() },
          { label: 'Length', value: `${input.length.toLocaleString()} → ${output.length.toLocaleString()}` },
        ],
      };
    },
    [direction, mode],
  );

  return (
    <TextTool
      transform={transform}
      saveExtension="html"
      inputLabel={direction === 'encode' ? 'Text or markup' : 'Text with entities'}
      outputLabel={direction === 'encode' ? 'Escaped' : 'Unescaped'}
      placeholder={direction === 'encode' ? SAMPLE : SAMPLE_ENCODED}
      sampleText={direction === 'encode' ? SAMPLE : SAMPLE_ENCODED}
      options={
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-4">
            <Field label="Direction">
              <Segmented
                value={direction}
                onChange={setDirection}
                options={[
                  { value: 'encode', label: 'Encode' },
                  { value: 'decode', label: 'Decode' },
                ]}
              />
            </Field>
            {direction === 'encode' && (
              <Field label="Escape as" className="min-w-[240px]">
                <Select
                  value={mode}
                  onChange={(e) => setMode(e.target.value as EncodeMode)}
                  options={MODE_OPTIONS}
                />
              </Field>
            )}
          </div>
          <p className="text-[11.5px] leading-[1.5] text-ink-faint">
            {direction === 'encode'
              ? MODE_HINTS[mode]
              : 'Named, decimal and hexadecimal entities are all understood, and the markup around them is left intact. Decoding runs against this Mac’s own HTML parser — nothing is sent anywhere.'}
          </p>
        </div>
      }
    />
  );
}
