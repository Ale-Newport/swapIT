import { useCallback, useState } from 'react';
import { TextTool, type TextTransformResult } from '@/components/tool';
import { Checkbox, Field, Input, Segmented } from '@/components/ui';
import { findReplace, type Segment } from './logic';

/** Rendering a novel's worth of spans would stall the pane. */
const PREVIEW_LIMIT = 20000;

function Preview({ segments }: { segments: Segment[] }) {
  const shown: Segment[] = [];
  let used = 0;
  for (const segment of segments) {
    if (used >= PREVIEW_LIMIT) break;
    const text = segment.text.slice(0, PREVIEW_LIMIT - used);
    used += text.length;
    shown.push({ text, hit: segment.hit });
  }
  const truncated = used < segments.reduce((n, s) => n + s.text.length, 0);
  return (
    <div>
      <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap break-words font-mono text-[12.5px] leading-[1.55] text-ink selectable">
        {shown.map((segment, i) =>
          segment.hit ? (
            <mark key={i} className="rounded-[3px] bg-accent-soft px-[1px] text-accent">
              {segment.text}
            </mark>
          ) : (
            <span key={i}>{segment.text}</span>
          ),
        )}
      </pre>
      {truncated && (
        <p className="mt-2 text-[11.5px] text-ink-faint">
          Preview stops after {PREVIEW_LIMIT.toLocaleString()} characters. Copy or save for the whole result.
        </p>
      )}
    </div>
  );
}

export default function FindAndReplace() {
  const [find, setFind] = useState('');
  const [replacement, setReplacement] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [firstOnly, setFirstOnly] = useState(false);
  const [view, setView] = useState<'result' | 'input'>('result');

  const run = useCallback(
    (input: string) => findReplace(input, find, replacement, { caseSensitive, wholeWord, firstOnly }),
    [find, replacement, caseSensitive, wholeWord, firstOnly],
  );

  const transform = useCallback(
    (input: string): TextTransformResult => {
      const result = run(input);
      return {
        output: result.output,
        warning: find && result.count === 0 ? `No match for “${find}” in this text.` : undefined,
        stats: [
          { label: 'Matches', value: result.count.toLocaleString() },
          { label: 'Replaced', value: result.replaced.toLocaleString() },
        ],
      };
    },
    [run, find],
  );

  return (
    <TextTool
      transform={transform}
      inputLabel="Text"
      outputLabel={view === 'result' ? 'Result' : 'Matches in the input'}
      placeholder="Paste the text to edit…"
      sampleText={'The cat sat on the mat.\nA catalogue of cats: cat, CAT, Cat.\nThat is all, cat.'}
      options={
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Find">
              <Input
                value={find}
                onChange={(e) => setFind(e.target.value)}
                placeholder="Text to look for"
                spellCheck={false}
              />
            </Field>
            <Field label="Replace with" hint="Leave empty to delete every match">
              <Input
                value={replacement}
                onChange={(e) => setReplacement(e.target.value)}
                placeholder="Replacement text"
                spellCheck={false}
              />
            </Field>
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <Checkbox checked={caseSensitive} onCheckedChange={setCaseSensitive} label="Case sensitive" />
            <Checkbox checked={wholeWord} onCheckedChange={setWholeWord} label="Whole word only" />
            <Checkbox checked={firstOnly} onCheckedChange={setFirstOnly} label="First match only" />
            <Segmented
              value={view}
              onChange={setView}
              size="sm"
              options={[
                { value: 'result', label: 'Preview result' },
                { value: 'input', label: 'Preview matches' },
              ]}
            />
          </div>
        </div>
      }
      renderOutput={(_output, input) => {
        if (!input) return <p className="text-[12.5px] text-ink-faint">Paste some text to see the result.</p>;
        if (!find) return <p className="text-[12.5px] text-ink-faint">Type something to find and the preview appears here.</p>;
        const result = run(input);
        return <Preview segments={view === 'result' ? result.outputSegments : result.inputSegments} />;
      }}
    />
  );
}
