import { useCallback, useMemo, useState } from 'react';
import { TextTool, type TextTransformResult } from '@/components/tool';
import { Field, Segmented, Select, Switch } from '@/components/ui';
import { MODES, transform, type Direction, type Mode } from './logic';

const DELIMITERS = [
  { value: ',', label: 'Comma  ,' },
  { value: ';', label: 'Semicolon  ;' },
  { value: '\t', label: 'Tab' },
  { value: '|', label: 'Pipe  |' },
];

const SAMPLES: Record<Mode, string> = {
  json: 'She said "hello"\nand left.',
  js: `it's a "test" with ${'${total}'} inside`,
  sql: "O'Brien & Sons",
  shell: "rm -rf 'my folder'/*",
  csv: 'Smith, John\t"nickname"',
  regex: 'price: $9.99 (final?)',
  xml: `<b>Tom & "Jerry"</b>`,
};

export default function StringEscape() {
  const [mode, setMode] = useState<Mode>('json');
  const [direction, setDirection] = useState<Direction>('escape');
  const [wrap, setWrap] = useState(false);
  const [ascii, setAscii] = useState(false);
  const [delimiter, setDelimiter] = useState(',');

  const info = useMemo(() => MODES.find((m) => m.id === mode) ?? MODES[0], [mode]);

  const run = useCallback(
    (input: string): TextTransformResult => {
      const output = transform(input, mode, direction, { wrap, ascii, delimiter });
      const difference = output.length - input.length;
      return {
        output,
        stats: [
          { label: 'Mode', value: info.label },
          { label: 'Characters', value: output.length.toLocaleString() },
          { label: 'Change', value: `${difference >= 0 ? '+' : ''}${difference.toLocaleString()}` },
        ],
      };
    },
    [mode, direction, wrap, ascii, delimiter, info.label],
  );

  return (
    <TextTool
      transform={run}
      saveExtension="txt"
      inputLabel={direction === 'escape' ? 'Raw text' : 'Escaped text'}
      outputLabel={direction === 'escape' ? 'Escaped' : 'Raw text'}
      placeholder={direction === 'escape' ? 'Paste the text you need to embed somewhere…' : 'Paste the escaped text…'}
      sampleText={SAMPLES[mode]}
      options={
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-4">
            <Field label="Target syntax" className="w-56">
              <Select
                value={mode}
                onChange={(e) => setMode(e.target.value as Mode)}
                options={MODES.map((m) => ({ value: m.id, label: m.label }))}
              />
            </Field>
            <Field label="Direction">
              <Segmented
                value={direction}
                onChange={setDirection}
                options={[
                  { value: 'escape', label: 'Escape' },
                  { value: 'unescape', label: 'Unescape' },
                ]}
              />
            </Field>
            {direction === 'escape' && (
              <Field inline label={info.wrapLabel} hint="Produces a complete literal">
                <Switch checked={wrap} onCheckedChange={setWrap} />
              </Field>
            )}
            {direction === 'escape' && (mode === 'json' || mode === 'js') && (
              <Field inline label="Escape non-ASCII" hint="Turn é and 🙂 into \u sequences">
                <Switch checked={ascii} onCheckedChange={setAscii} />
              </Field>
            )}
            {mode === 'csv' && direction === 'escape' && (
              <Field label="Delimiter" className="w-40">
                <Select value={delimiter} onChange={(e) => setDelimiter(e.target.value)} options={DELIMITERS} />
              </Field>
            )}
          </div>
          <p className="text-[11.5px] text-ink-faint">
            {direction === 'escape'
              ? info.hint
              : `Reads ${info.label.toLowerCase()} escaping back into plain text. Surrounding quotes are dropped when the text has a matching pair.`}
          </p>
        </div>
      }
    />
  );
}
