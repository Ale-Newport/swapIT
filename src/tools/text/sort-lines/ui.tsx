import { useCallback, useState } from 'react';
import { PresetRow, TextTool, type TextTransformResult } from '@/components/tool';
import { Button, Checkbox, Field } from '@/components/ui';
import { sortLines, type SortMode } from './logic';

const MODES: Array<{ label: string; value: SortMode; hint: string }> = [
  { label: 'A → Z', value: 'az', hint: 'Alphabetical' },
  { label: 'Z → A', value: 'za', hint: 'Reverse alphabetical' },
  { label: '0 → 9', value: 'numeric-asc', hint: 'Natural order: item2 before item10' },
  { label: '9 → 0', value: 'numeric-desc', hint: 'Natural order, largest first' },
  { label: 'Shortest first', value: 'length-asc', hint: 'By line length' },
  { label: 'Longest first', value: 'length-desc', hint: 'By line length, longest first' },
  { label: 'Shuffle', value: 'shuffle', hint: 'Random order' },
  { label: 'Reverse', value: 'reverse', hint: 'Flip the current order without sorting' },
];

export default function SortLines() {
  const [mode, setMode] = useState<SortMode>('az');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [ignoreLeadingWhitespace, setIgnoreLeadingWhitespace] = useState(true);
  const [removeDuplicates, setRemoveDuplicates] = useState(false);
  const [seed, setSeed] = useState(1);

  const transform = useCallback(
    (input: string): TextTransformResult => {
      const result = sortLines(input, {
        mode,
        caseSensitive,
        ignoreLeadingWhitespace,
        removeDuplicates,
        seed,
      });
      const stats = [
        { label: 'Lines in', value: result.linesIn.toLocaleString() },
        { label: 'Lines out', value: result.linesOut.toLocaleString() },
      ];
      if (removeDuplicates) stats.push({ label: 'Duplicates removed', value: result.removed.toLocaleString() });
      return { output: result.output, stats };
    },
    [mode, caseSensitive, ignoreLeadingWhitespace, removeDuplicates, seed],
  );

  return (
    <TextTool
      transform={transform}
      inputLabel="Lines"
      outputLabel="Sorted"
      placeholder="One item per line…"
      sampleText={'item10\nitem2\nBanana\napple\nitem1\ncherry\napple'}
      options={
        <div className="space-y-3">
          <Field label="Order" hint={MODES.find((m) => m.value === mode)?.hint}>
            <PresetRow presets={MODES} active={mode} onSelect={setMode} />
          </Field>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <Checkbox checked={caseSensitive} onCheckedChange={setCaseSensitive} label="Case sensitive" />
            <Checkbox
              checked={ignoreLeadingWhitespace}
              onCheckedChange={setIgnoreLeadingWhitespace}
              label="Ignore indentation"
            />
            <Checkbox
              checked={removeDuplicates}
              onCheckedChange={setRemoveDuplicates}
              label="Remove duplicates while sorting"
            />
            {mode === 'shuffle' && (
              <Button size="sm" icon="Shuffle" onClick={() => setSeed((s) => s + 1)}>
                Shuffle again
              </Button>
            )}
          </div>
        </div>
      }
    />
  );
}
