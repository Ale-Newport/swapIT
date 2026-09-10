import { useCallback, useState } from 'react';
import { PresetRow, TextTool, type TextTransformResult } from '@/components/tool';
import { Field } from '@/components/ui';
import { convertCase, type CaseMode } from './logic';

const MODES: Array<{ label: string; value: CaseMode; hint: string }> = [
  { label: 'lowercase', value: 'lower', hint: 'everything in lower case' },
  { label: 'UPPERCASE', value: 'upper', hint: 'EVERYTHING IN UPPER CASE' },
  { label: 'Title Case', value: 'title', hint: 'Small Words Stay Down, as in a Headline' },
  { label: 'Sentence case', value: 'sentence', hint: 'Only the first letter of each sentence' },
  { label: 'camelCase', value: 'camel', hint: 'camelCase, one line at a time' },
  { label: 'PascalCase', value: 'pascal', hint: 'PascalCase, one line at a time' },
  { label: 'snake_case', value: 'snake', hint: 'snake_case, one line at a time' },
  { label: 'kebab-case', value: 'kebab', hint: 'kebab-case, one line at a time' },
  { label: 'CONSTANT_CASE', value: 'constant', hint: 'CONSTANT_CASE, one line at a time' },
  { label: 'dot.case', value: 'dot', hint: 'dot.case, one line at a time' },
  { label: 'Train-Case', value: 'train', hint: 'Train-Case, one line at a time' },
  { label: 'aLtErNaTiNg', value: 'alternating', hint: 'aLtErNaTiNg CaPs' },
  { label: 'INVERSE', value: 'inverse', hint: 'Swap the case of every letter' },
];

export default function CaseConverter() {
  const [mode, setMode] = useState<CaseMode>('title');
  const active = MODES.find((m) => m.value === mode);

  const transform = useCallback(
    (input: string): TextTransformResult => {
      const output = convertCase(input, mode);
      return {
        output,
        stats: [
          { label: 'Lines', value: input.split('\n').length.toLocaleString() },
          { label: 'Characters', value: output.length.toLocaleString() },
        ],
      };
    },
    [mode],
  );

  return (
    <TextTool
      transform={transform}
      monoOutput={false}
      inputLabel="Text"
      outputLabel={active ? active.label : 'Result'}
      placeholder="Paste the text you want to re-case…"
      sampleText={'the lord of the rings\nreturn of the king\nuser profile settings'}
      options={
        <Field label="Style" hint={active?.hint}>
          <PresetRow presets={MODES} active={mode} onSelect={setMode} />
        </Field>
      }
    />
  );
}
