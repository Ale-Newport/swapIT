import { useCallback, useState } from 'react';
import { TextTool, type TextTransformResult } from '@/components/tool';
import { Checkbox, Field, Segmented } from '@/components/ui';
import { removeDuplicates } from './logic';

export default function RemoveDuplicateLines() {
  const [mode, setMode] = useState<'unique' | 'duplicates'>('unique');
  const [keep, setKeep] = useState<'first' | 'last'>('first');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [trimForCompare, setTrimForCompare] = useState(true);

  const transform = useCallback(
    (input: string): TextTransformResult => {
      const result = removeDuplicates(input, { mode, keep, caseSensitive, trimForCompare });
      return {
        output: result.output,
        stats: [
          { label: 'Lines in', value: result.linesIn.toLocaleString() },
          { label: 'Lines out', value: result.linesOut.toLocaleString() },
          {
            label: mode === 'unique' ? 'Duplicates removed' : 'Repeated values',
            value: (mode === 'unique' ? result.removed : result.duplicateValues).toLocaleString(),
          },
        ],
      };
    },
    [mode, keep, caseSensitive, trimForCompare],
  );

  return (
    <TextTool
      transform={transform}
      inputLabel="Lines"
      outputLabel={mode === 'unique' ? 'Without duplicates' : 'Duplicated lines only'}
      placeholder="One value per line…"
      sampleText={'ana@example.com\nBEN@example.com\nana@example.com\n  carla@example.com\nben@example.com\ncarla@example.com'}
      options={
        <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
          <Field label="Result" hint={mode === 'unique' ? 'One copy of every line' : 'Only lines that appear twice or more'}>
            <Segmented
              value={mode}
              onChange={setMode}
              options={[
                { value: 'unique', label: 'Unique lines' },
                { value: 'duplicates', label: 'Only duplicates' },
              ]}
            />
          </Field>
          <Field label="Occurrence to keep" hint="Which copy survives, and its position">
            <Segmented
              value={keep}
              onChange={setKeep}
              options={[
                { value: 'first', label: 'First' },
                { value: 'last', label: 'Last' },
              ]}
            />
          </Field>
          <Field label="Comparing">
            <div className="flex flex-col gap-2 pt-1">
              <Checkbox checked={caseSensitive} onCheckedChange={setCaseSensitive} label="Case sensitive" />
              <Checkbox
                checked={trimForCompare}
                onCheckedChange={setTrimForCompare}
                label="Ignore leading and trailing spaces"
              />
            </div>
          </Field>
        </div>
      }
    />
  );
}
