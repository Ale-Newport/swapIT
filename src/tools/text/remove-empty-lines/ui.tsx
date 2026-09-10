import { useCallback, useState } from 'react';
import { TextTool, type TextTransformResult } from '@/components/tool';
import { Checkbox, Field, Segmented } from '@/components/ui';
import { removeEmptyLines } from './logic';

export default function RemoveEmptyLines() {
  const [mode, setMode] = useState<'remove' | 'collapse'>('remove');
  const [whitespaceIsBlank, setWhitespaceIsBlank] = useState(true);

  const transform = useCallback(
    (input: string): TextTransformResult => {
      const result = removeEmptyLines(input, { mode, whitespaceIsBlank });
      return {
        output: result.output,
        stats: [
          { label: 'Lines in', value: result.linesIn.toLocaleString() },
          { label: 'Lines out', value: result.linesOut.toLocaleString() },
          { label: 'Blank lines removed', value: result.removed.toLocaleString() },
        ],
      };
    },
    [mode, whitespaceIsBlank],
  );

  return (
    <TextTool
      transform={transform}
      inputLabel="Text"
      outputLabel="Without blank lines"
      placeholder="Paste text with blank lines…"
      sampleText={'First paragraph.\n\n\n\nSecond paragraph.\n   \n\nThird paragraph.\n'}
      options={
        <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
          <Field
            label="Blank lines"
            hint={mode === 'remove' ? 'Every blank line goes' : 'Runs of blanks become a single blank line'}
          >
            <Segmented
              value={mode}
              onChange={setMode}
              options={[
                { value: 'remove', label: 'Remove all' },
                { value: 'collapse', label: 'Collapse to one' },
              ]}
            />
          </Field>
          <Field label="What counts as blank">
            <div className="pt-1">
              <Checkbox
                checked={whitespaceIsBlank}
                onCheckedChange={setWhitespaceIsBlank}
                label="Lines with only spaces or tabs"
              />
            </div>
          </Field>
        </div>
      }
    />
  );
}
