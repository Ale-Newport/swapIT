import { useCallback, useState } from 'react';
import { TextTool, type TextTransformResult } from '@/components/tool';
import { Checkbox, Field, NumberInput, Segmented } from '@/components/ui';
import { slugifyText, type SlugOptions } from './logic';

export default function Slugify() {
  const [separator, setSeparator] = useState<SlugOptions['separator']>('-');
  const [stripStopWords, setStripStopWords] = useState(false);
  const [maxLength, setMaxLength] = useState(0);

  const transform = useCallback(
    (input: string): TextTransformResult => {
      const result = slugifyText(input, { separator, stripStopWords, maxLength });
      const warnings: string[] = [];
      if (result.duplicates > 0) {
        warnings.push(
          `${result.duplicates} slug${result.duplicates === 1 ? '' : 's'} appear more than once — as URLs they would collide.`,
        );
      }
      if (result.empty > 0) {
        warnings.push(`${result.empty} line${result.empty === 1 ? '' : 's'} had no usable characters and came out empty.`);
      }
      return {
        output: result.output,
        warning: warnings.length ? warnings.join(' ') : undefined,
        stats: [
          { label: 'Slugs', value: result.slugs.filter(Boolean).length.toLocaleString() },
          { label: 'Longest', value: `${Math.max(0, ...result.slugs.map((s) => s.length))} ch` },
        ],
      };
    },
    [separator, stripStopWords, maxLength],
  );

  return (
    <TextTool
      transform={transform}
      inputLabel="Titles"
      outputLabel="Slugs"
      placeholder="One title per line…"
      sampleText={'Cómo hacer una paella válida\nThe Best of the Beatles & Friends\nCafé Straße — 50% Off!'}
      options={
        <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
          <Field label="Separator">
            <Segmented
              value={separator}
              onChange={setSeparator}
              options={[
                { value: '-', label: 'Hyphen  -' },
                { value: '_', label: 'Underscore  _' },
              ]}
            />
          </Field>
          <Field label="Max length" hint="0 keeps the whole slug; cuts fall between words" className="w-32">
            <NumberInput value={maxLength} onValueChange={setMaxLength} min={0} max={300} suffix="ch" />
          </Field>
          <Field label="Words">
            <div className="pt-1">
              <Checkbox
                checked={stripStopWords}
                onCheckedChange={setStripStopWords}
                label="Drop common words (the, of, de, la…)"
              />
            </div>
          </Field>
        </div>
      }
    />
  );
}
