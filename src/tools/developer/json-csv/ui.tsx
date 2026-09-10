import { useCallback, useMemo, useRef, useState } from 'react';
import { TextTool, type TextTransformResult } from '@/components/tool';
import { Field, NumberInput, Segmented, Select, Switch } from '@/components/ui';
import { csvToJson, detectFormat, jsonToCsv, type Direction, type EmptyPolicy } from './logic';

const SAMPLE = `[
  { "id": 1, "user": { "name": "Ada", "langs": ["en", "fr"] }, "active": true },
  { "id": 2, "user": { "name": "Linus", "langs": ["fi"] }, "active": false }
]`;

const DELIMITERS = [
  { value: 'auto', label: 'Auto / comma' },
  { value: ',', label: 'Comma  ,' },
  { value: ';', label: 'Semicolon  ;' },
  { value: '\t', label: 'Tab' },
  { value: '|', label: 'Pipe  |' },
];

const EMPTY_OPTIONS = [
  { value: 'null', label: 'null' },
  { value: 'string', label: 'Empty string' },
  { value: 'omit', label: 'Leave the key out' },
];

export default function JsonCsv() {
  const [direction, setDirection] = useState<Direction>('auto');
  const [delimiter, setDelimiter] = useState('auto');
  const [header, setHeader] = useState(true);
  const [inferTypes, setInferTypes] = useState(true);
  const [empty, setEmpty] = useState<EmptyPolicy>('null');
  const [indent, setIndent] = useState(2);
  const [produced, setProduced] = useState<string | null>(null);

  /**
   * TextTool owns the input, so the format that actually came out is only known
   * inside `transform` — which runs during TextTool's render. Record it in a
   * ref and publish it right after that render, so Save offers the extension of
   * the text on screen rather than the one the Direction control implies.
   */
  const producedRef = useRef<string | null>(null);
  const noteProduced = useCallback((ext: string) => {
    if (producedRef.current === ext) return;
    producedRef.current = ext;
    queueMicrotask(() => setProduced(ext));
  }, []);

  const transform = useCallback(
    (input: string): TextTransformResult => {
      const from = direction === 'auto' ? detectFormat(input) : direction === 'jsonToCsv' ? 'json' : 'csv';
      if (from === 'json') {
        const result = jsonToCsv(input, { delimiter: delimiter === 'auto' ? ',' : delimiter });
        noteProduced('csv');
        return {
          output: result.output,
          stats: [
            { label: 'Input', value: 'JSON' },
            { label: 'Rows', value: result.rowCount.toLocaleString() },
            { label: 'Columns', value: result.columns.length.toLocaleString() },
          ],
        };
      }
      const result = csvToJson(input, {
        header,
        inferTypes,
        empty,
        indent,
        delimiter: delimiter === 'auto' ? '' : delimiter,
      });
      noteProduced('json');
      return {
        output: result.output,
        stats: [
          { label: 'Input', value: 'CSV' },
          { label: 'Rows', value: result.rowCount.toLocaleString() },
          {
            label: 'Delimiter',
            value: result.delimiter === '\t' ? 'tab' : result.delimiter,
          },
        ],
      };
    },
    [direction, delimiter, header, inferTypes, empty, indent, noteProduced],
  );

  /** Without a header row the JSON is an array of arrays, which has no key to leave out. */
  const emptyOptions = useMemo(
    () => EMPTY_OPTIONS.map((o) => (o.value === 'omit' ? { ...o, disabled: !header } : o)),
    [header],
  );

  const changeHeader = (next: boolean) => {
    setHeader(next);
    if (!next && empty === 'omit') setEmpty('string');
  };

  const csvSide = direction !== 'csvToJson';

  return (
    <TextTool
      transform={transform}
      saveExtension={produced ?? (direction === 'csvToJson' ? 'json' : 'csv')}
      placeholder={'[{"id": 1, "name": "Ada"}, {"id": 2, "name": "Linus"}]'}
      sampleText={SAMPLE}
      inputLabel="JSON or CSV"
      outputLabel="Converted"
      options={
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-4">
            <Field label="Direction" hint="Auto reads the input and picks the other format">
              <Segmented
                value={direction}
                onChange={setDirection}
                options={[
                  { value: 'auto', label: 'Auto' },
                  { value: 'jsonToCsv', label: 'JSON → CSV' },
                  { value: 'csvToJson', label: 'CSV → JSON' },
                ]}
              />
            </Field>
            <Field label="Delimiter" className="w-40">
              <Select value={delimiter} onChange={(e) => setDelimiter(e.target.value)} options={DELIMITERS} />
            </Field>
            <Field label="JSON indent" className="w-24">
              <NumberInput value={indent} onValueChange={setIndent} min={0} max={8} suffix="sp" />
            </Field>
          </div>

          <div className="flex flex-wrap items-end gap-4 border-t border-line pt-3">
            <Field inline label="First row is a header" hint="Off produces an array of arrays">
              <Switch checked={header} onCheckedChange={changeHeader} />
            </Field>
            <Field inline label="Infer types" hint="Read 42, true and null as JSON values">
              <Switch checked={inferTypes} onCheckedChange={setInferTypes} />
            </Field>
            <Field
              label="Empty cells become"
              className="w-44"
              hint={header ? undefined : 'An array of arrays has no key to leave out'}
            >
              <Select
                value={empty}
                onChange={(e) => setEmpty(e.target.value as EmptyPolicy)}
                options={emptyOptions}
              />
            </Field>
          </div>

          <p className="text-[11.5px] text-ink-faint">
            {csvSide
              ? 'Nested values become dotted columns — user.name, tags.0 — and the same names rebuild the nesting on the way back. Empty objects and arrays produce no column.'
              : 'Dotted headers rebuild nesting: user.name becomes an object, tags.0 an array. Leading zeros and 16-digit numbers stay strings.'}
          </p>
        </div>
      }
    />
  );
}
