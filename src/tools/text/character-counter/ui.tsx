import { useCallback, useState } from 'react';
import clsx from 'clsx';
import { PresetRow, TextTool, type TextTransformResult } from '@/components/tool';
import { Badge, Field, NumberInput, Stat } from '@/components/ui';
import { countText, lineReport, statsToText } from './logic';

/**
 * Presets are selected by identity rather than by their number — "Meta
 * description" and "SMS" are both 160 characters, and highlighting the value
 * would light up both of them at once.
 */
const PRESETS: Array<{ label: string; value: string; limit: number; hint: string }> = [
  { label: 'Tweet', value: 'tweet', limit: 280, hint: '280 characters' },
  { label: 'Meta description', value: 'meta', limit: 160, hint: '160 characters' },
  { label: 'Title tag', value: 'title', limit: 60, hint: '60 characters' },
  { label: 'SMS', value: 'sms', limit: 160, hint: '160 characters, one GSM-7 message' },
];

/** Long documents would render thousands of rows — the head is what matters. */
const MAX_ROWS = 400;

export default function CharacterCounter() {
  const [limit, setLimit] = useState(280);
  const [preset, setPreset] = useState<string | undefined>('tweet');

  const selectPreset = useCallback((id: string) => {
    const chosen = PRESETS.find((p) => p.value === id);
    if (!chosen) return;
    setPreset(id);
    setLimit(chosen.limit);
  }, []);

  const setCustomLimit = useCallback((value: number) => {
    setLimit(value);
    setPreset(undefined);
  }, []);

  const transform = useCallback(
    (input: string): TextTransformResult => {
      const stats = countText(input);
      const over = lineReport(input, limit).filter((l) => l.over).length;
      return {
        output: statsToText(stats, limit, over),
        stats: [
          { label: 'Words', value: stats.words.toLocaleString() },
          { label: 'Characters', value: stats.characters.toLocaleString() },
          { label: 'Reading', value: stats.readingLabel },
        ],
      };
    },
    [limit],
  );

  return (
    <TextTool
      transform={transform}
      inputLabel="Text"
      outputLabel="Counts"
      placeholder="Paste the text you want to measure…"
      sampleText={
        'Toolbox runs entirely on your Mac. Nothing is uploaded, nothing is tracked.\n' +
        'Drop a file, pick a tool, get the result — that is the whole idea.\n\n' +
        'Every tool works offline and every result stays on disk.'
      }
      options={
        <div className="flex flex-wrap items-end gap-4">
          <Field label="Line limit" hint="Lines longer than this are flagged" className="w-32">
            <NumberInput value={limit} onValueChange={setCustomLimit} min={1} max={100000} suffix="ch" />
          </Field>
          <Field label="Presets">
            <PresetRow presets={PRESETS} active={preset} onSelect={selectPreset} />
          </Field>
        </div>
      }
      renderOutput={(_output, input) => {
        if (!input) {
          return <p className="text-[12.5px] text-ink-faint">Type or paste text to see live counts.</p>;
        }
        const stats = countText(input);
        const rows = lineReport(input, limit);
        const over = rows.filter((l) => l.over).length;
        const shown = rows.slice(0, MAX_ROWS);
        return (
          <div className="space-y-3.5">
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
              <Stat label="Characters" value={stats.characters.toLocaleString()} />
              <Stat label="No spaces" value={stats.charactersNoSpaces.toLocaleString()} />
              <Stat label="Words" value={stats.words.toLocaleString()} />
              <Stat label="Unique words" value={stats.uniqueWords.toLocaleString()} />
              <Stat label="Sentences" value={stats.sentences.toLocaleString()} />
              <Stat label="Paragraphs" value={stats.paragraphs.toLocaleString()} />
              <Stat label="Lines" value={stats.lines.toLocaleString()} />
              <Stat label="Reading time" value={stats.readingLabel} hint="at 200 wpm" />
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <p className="text-[12px] font-medium text-ink-soft">Line lengths</p>
                {over > 0 ? (
                  <Badge tone="danger">
                    {over} line{over === 1 ? '' : 's'} over {limit}
                  </Badge>
                ) : (
                  <Badge tone="success">Every line within {limit}</Badge>
                )}
              </div>
              <div className="max-h-72 overflow-y-auto rounded-lg border border-line">
                {shown.map((row) => (
                  <div
                    key={row.n}
                    className="flex items-center gap-2 border-b border-line px-2 py-1 last:border-b-0"
                  >
                    <span className="w-7 shrink-0 text-right font-mono text-[11px] text-ink-faint">{row.n}</span>
                    <span
                      className={clsx(
                        'min-w-0 flex-1 truncate font-mono text-[11.5px]',
                        row.text.trim() ? 'text-ink' : 'text-ink-faint',
                      )}
                    >
                      {row.text.trim() ? row.text : '(blank)'}
                    </span>
                    <span
                      className={clsx(
                        'shrink-0 font-mono text-[11.5px] tabular-nums',
                        row.over ? 'font-semibold text-danger' : 'text-ink-faint',
                      )}
                    >
                      {row.length}
                    </span>
                  </div>
                ))}
              </div>
              {rows.length > shown.length && (
                <p className="mt-1 text-[11.5px] text-ink-faint">
                  Showing the first {MAX_ROWS.toLocaleString()} of {rows.length.toLocaleString()} lines.
                </p>
              )}
            </div>
          </div>
        );
      }}
    />
  );
}
