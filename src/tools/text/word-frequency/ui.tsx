import { useCallback, useState } from 'react';
import { TextTool, type TextTransformResult } from '@/components/tool';
import { Checkbox, Field, NumberInput, Segmented } from '@/components/ui';
import { toCsv, wordFrequency, type StopWordSet } from './logic';

export default function WordFrequency() {
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [stopWords, setStopWords] = useState<StopWordSet>('english');
  const [minLength, setMinLength] = useState(1);
  const [topN, setTopN] = useState(50);

  const options = { caseSensitive, stopWords, minLength, topN };

  const transform = useCallback(
    (input: string): TextTransformResult => {
      const result = wordFrequency(input, { caseSensitive, stopWords, minLength, topN });
      return {
        output: toCsv(result.rows),
        stats: [
          { label: 'Words', value: result.totalWords.toLocaleString() },
          { label: 'Counted', value: result.countedWords.toLocaleString() },
          { label: 'Unique', value: result.uniqueWords.toLocaleString() },
        ],
      };
    },
    [caseSensitive, stopWords, minLength, topN],
  );

  return (
    <TextTool
      transform={transform}
      saveExtension="csv"
      inputLabel="Text"
      outputLabel="Ranking"
      placeholder="Paste an article, transcript or list…"
      sampleText={
        'The quick brown fox jumps over the lazy dog. The dog barks, and the fox runs.\n' +
        'A quick fox is a happy fox; the lazy dog sleeps on.'
      }
      options={
        <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
          <Field label="Common words" hint="Filters out the, of, la, de…">
            <Segmented
              value={stopWords}
              onChange={setStopWords}
              options={[
                { value: 'none', label: 'Keep all' },
                { value: 'english', label: 'English' },
                { value: 'spanish', label: 'Español' },
                { value: 'both', label: 'Both' },
              ]}
            />
          </Field>
          <Field label="Minimum length" className="w-28">
            <NumberInput value={minLength} onValueChange={setMinLength} min={1} max={20} suffix="ch" />
          </Field>
          <Field label="Show top" hint="0 shows every word" className="w-28">
            <NumberInput value={topN} onValueChange={setTopN} min={0} max={5000} />
          </Field>
          <Field label="Matching">
            <div className="pt-1">
              <Checkbox checked={caseSensitive} onCheckedChange={setCaseSensitive} label="Case sensitive" />
            </div>
          </Field>
        </div>
      }
      renderOutput={(_output, input) => {
        if (!input) return <p className="text-[12.5px] text-ink-faint">Paste some text to rank its words.</p>;
        const result = wordFrequency(input, options);
        if (result.rows.length === 0) {
          return (
            <p className="text-[12.5px] text-ink-faint">
              No words left after the filters. Lower the minimum length or keep the common words.
            </p>
          );
        }
        const max = result.rows[0].count;
        return (
          <div className="space-y-2">
            <p className="text-[11.5px] text-ink-faint">
              {result.uniqueWords.toLocaleString()} unique words from {result.countedWords.toLocaleString()} counted ·
              copy or save for the full CSV
            </p>
            <div className="max-h-[420px] overflow-y-auto rounded-lg border border-line">
              {result.rows.map((row) => (
                <div
                  key={row.word}
                  className="flex items-center gap-2 border-b border-line px-2 py-1 last:border-b-0"
                >
                  <span className="w-7 shrink-0 text-right font-mono text-[11px] text-ink-faint">{row.rank}</span>
                  <span className="w-32 shrink-0 truncate text-[12.5px] text-ink selectable" title={row.word}>
                    {row.word}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className="block h-2 rounded-full bg-ink/15"
                      style={{ width: `${Math.max(2, (row.count / max) * 100)}%` }}
                    />
                  </span>
                  <span className="w-10 shrink-0 text-right font-mono text-[11.5px] tabular-nums text-ink">
                    {row.count}
                  </span>
                  <span className="w-12 shrink-0 text-right font-mono text-[11px] tabular-nums text-ink-faint">
                    {row.share.toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      }}
    />
  );
}
