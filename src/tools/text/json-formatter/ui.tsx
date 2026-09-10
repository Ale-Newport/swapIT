import { useCallback, useState } from 'react';
import { TextTool, type TextTransformResult } from '@/components/tool';
import { Field, NumberInput, Segmented } from '@/components/ui';

type Mode = 'pretty' | 'minify';

export default function JsonFormatter() {
  const [mode, setMode] = useState<Mode>('pretty');
  const [indent, setIndent] = useState(2);
  const [sortKeys, setSortKeys] = useState(false);

  const transform = useCallback(
    (input: string): TextTransformResult => {
      const parsed = JSON.parse(input) as unknown;
      const replacer = sortKeys
        ? (_key: string, value: unknown) => {
            if (value && typeof value === 'object' && !Array.isArray(value)) {
              return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)));
            }
            return value;
          }
        : undefined;
      const output =
        mode === 'minify'
          ? JSON.stringify(parsed, replacer)
          : JSON.stringify(parsed, replacer, indent);
      const before = input.length;
      const after = output.length;
      return {
        output,
        stats: [
          { label: 'Input', value: `${before.toLocaleString()} chars` },
          { label: 'Output', value: `${after.toLocaleString()} chars` },
          {
            label: before ? 'Change' : 'Valid',
            value: before ? `${(((after - before) / before) * 100).toFixed(1)}%` : 'yes',
          },
        ],
      };
    },
    [mode, indent, sortKeys],
  );

  return (
    <TextTool
      transform={transform}
      saveExtension="json"
      placeholder='{"hello": "world", "items": [1, 2, 3]}'
      sampleText='{"name":"Toolbox","version":"0.1.0","tools":["images","video","pdf"],"local":true}'
      options={
        <div className="flex flex-wrap items-end gap-4">
          <Field label="Mode">
            <Segmented
              value={mode}
              onChange={setMode}
              options={[
                { value: 'pretty', label: 'Pretty print' },
                { value: 'minify', label: 'Minify' },
              ]}
            />
          </Field>
          {mode === 'pretty' && (
            <Field label="Indent" className="w-24">
              <NumberInput value={indent} onValueChange={setIndent} min={0} max={8} suffix="sp" />
            </Field>
          )}
          <Field label="Keys">
            <Segmented
              value={sortKeys ? 'sorted' : 'original'}
              onChange={(v) => setSortKeys(v === 'sorted')}
              options={[
                { value: 'original', label: 'Original order' },
                { value: 'sorted', label: 'Sorted' },
              ]}
            />
          </Field>
        </div>
      }
    />
  );
}
