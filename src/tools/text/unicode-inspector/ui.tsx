import { useCallback, useRef, useState, type ReactNode } from 'react';
import { TextTool, type TextTransformResult } from '@/components/tool';
import { Alert, Badge, Checkbox, EmptyState, Field, Stat } from '@/components/ui';
import {
  DEFAULT_LIMIT,
  inspectText,
  reportText,
  summarize,
  type CharInfo,
  type InspectResult,
  type Summary,
} from './logic';

const SAMPLE =
  'Hi \u{1F469}\u200D\u{1F469}\u200D\u{1F467}\u200D\u{1F466} \u2014 cafe\u0301, no\u00A0break, zero\u200Bwidth, \u2018smart\u2019 quotes';

interface Analysis {
  input: string;
  result: InspectResult;
  summary: Summary;
}

function Th({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <th className={`whitespace-nowrap px-2 py-1.5 text-left text-[11px] font-medium uppercase tracking-wide text-ink-faint ${className ?? ''}`}>
      {children}
    </th>
  );
}

function rowTone(char: CharInfo): string {
  if (char.flag?.kind === 'invisible') return 'bg-danger-soft';
  if (char.flag?.kind === 'lookalike') return 'bg-warn-soft';
  return '';
}

export default function UnicodeInspector() {
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  // Both the copyable report and the table need the same analysis; caching it
  // on the input keeps a keystroke from doing the work twice.
  const cache = useRef<Analysis | null>(null);

  const analyse = useCallback(
    (input: string): Analysis => {
      if (cache.current?.input === input) return cache.current;
      const next: Analysis = { input, result: inspectText(input, DEFAULT_LIMIT), summary: summarize(input) };
      cache.current = next;
      return next;
    },
    [],
  );

  const visibleRows = useCallback(
    (analysis: Analysis): InspectResult => {
      if (!onlyFlagged) return analysis.result;
      // The filtered table is its own result: the totals in its footer have to
      // describe the rows it actually holds, not the ones that were filtered out.
      const chars = analysis.result.chars.filter((c) => c.flag);
      return { chars, total: chars.length, truncated: false };
    },
    [onlyFlagged],
  );

  /** What the table is showing, in the words the footer and the export share. */
  const scopeLine = useCallback(
    (analysis: Analysis, shown: InspectResult): string => {
      const inspected = analysis.result.chars.length;
      const of = analysis.result.truncated
        ? `the first ${inspected.toLocaleString()} of ${analysis.result.total.toLocaleString()} code points`
        : `${inspected.toLocaleString()} code point${inspected === 1 ? '' : 's'}`;
      if (onlyFlagged) {
        return `${shown.chars.length.toLocaleString()} invisible or lookalike character${
          shown.chars.length === 1 ? '' : 's'
        }, filtered from ${of}.`;
      }
      return analysis.result.truncated
        ? `Showing ${of}.`
        : `${inspected.toLocaleString()} row${inspected === 1 ? '' : 's'}.`;
    },
    [onlyFlagged],
  );

  const transform = useCallback(
    (input: string): TextTransformResult => {
      if (!input) return { output: '' };
      const analysis = analyse(input);
      const shown = visibleRows(analysis);
      return { output: `${reportText(shown, analysis.summary)}\n\n${scopeLine(analysis, shown)}` };
    },
    [analyse, scopeLine, visibleRows],
  );

  const renderOutput = (_output: string, input: string) => {
    if (!input) {
      return (
        <EmptyState
          icon="ScanText"
          title="Nothing to inspect yet"
          description="Paste text on the left to see every code point, its bytes, and any character that is invisible or pretending to be something else."
        />
      );
    }

    const analysis = analyse(input);
    const { summary } = analysis;
    const shown = visibleRows(analysis);
    const flagged = summary.invisible + summary.lookalike;

    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat
            label="Graphemes"
            value={summary.graphemes.toLocaleString()}
            hint={summary.exactGraphemes ? 'What a person calls a character' : 'Approximate on this system'}
          />
          <Stat label="Code points" value={summary.codePoints.toLocaleString()} hint="What [...str] counts" />
          <Stat label="UTF-16 units" value={summary.utf16Units.toLocaleString()} hint="What str.length reports" />
          <Stat label="UTF-8 bytes" value={summary.utf8Bytes.toLocaleString()} hint="What the file will weigh" />
        </div>

        {flagged > 0 && (
          <Alert tone={summary.invisible > 0 ? 'danger' : 'warn'} title={`${flagged} character${flagged === 1 ? '' : 's'} worth a look`}>
            {summary.invisible > 0 && (
              <span>
                {summary.invisible} invisible {summary.invisible === 1 ? 'character' : 'characters'} (zero-width,
                non-breaking or direction marks){summary.lookalike > 0 ? ' and ' : '.'}
              </span>
            )}
            {summary.lookalike > 0 && (
              <span>
                {summary.lookalike} lookalike {summary.lookalike === 1 ? 'character' : 'characters'} (curly quotes,
                dashes or letters from another alphabet).
              </span>
            )}{' '}
            They are highlighted in the table below.
          </Alert>
        )}

        <div className="max-h-[420px] overflow-auto rounded-lg border border-line">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 z-10 bg-panel shadow-[0_1px_0_var(--color-line)]">
              <tr>
                <Th className="w-10">#</Th>
                <Th className="w-12">Char</Th>
                <Th>Code point</Th>
                <Th>Decimal</Th>
                <Th>UTF-8</Th>
                <Th>UTF-16</Th>
                <Th>Category and name</Th>
              </tr>
            </thead>
            <tbody className="text-[12px] text-ink">
              {shown.chars.map((char) => (
                <tr key={char.index} className={`border-t border-line align-top ${rowTone(char)}`}>
                  <td className="px-2 py-1.5 text-[11px] text-ink-faint">{char.index}</td>
                  <td className="px-2 py-1.5">
                    <span className="font-mono text-[15px] leading-none selectable">{char.display || '·'}</span>
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 font-mono text-[11.5px] selectable">{char.hex}</td>
                  <td className="px-2 py-1.5 font-mono text-[11.5px] text-ink-soft selectable">{char.codePoint}</td>
                  <td className="whitespace-nowrap px-2 py-1.5 font-mono text-[11.5px] text-ink-soft selectable">{char.utf8}</td>
                  <td className="whitespace-nowrap px-2 py-1.5 font-mono text-[11.5px] text-ink-soft selectable">{char.utf16}</td>
                  <td className="px-2 py-1.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[11.5px] text-ink-soft">{char.category}</span>
                      {char.flag && (
                        <Badge tone={char.flag.kind === 'invisible' ? 'danger' : 'warn'}>{char.flag.kind}</Badge>
                      )}
                    </div>
                    {char.name && <p className="text-[11px] text-ink-faint">{char.name}</p>}
                    {char.flag && <p className="mt-0.5 text-[11px] leading-[1.45] text-ink-soft">{char.flag.note}</p>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {shown.chars.length === 0 && (
            <p className="px-3 py-6 text-center text-[12.5px] text-ink-faint">
              No invisible or lookalike characters in this text.
            </p>
          )}
        </div>

        <p className="text-[11px] text-ink-faint">
          {scopeLine(analysis, shown)}{' '}
          {onlyFlagged
            ? 'Copy and Save export only these rows.'
            : 'Copy or Save exports this table as plain text.'}
        </p>
      </div>
    );
  };

  return (
    <TextTool
      transform={transform}
      renderOutput={renderOutput}
      saveExtension="txt"
      inputLabel="Text"
      outputLabel="Characters"
      placeholder="Paste the string with something odd in it…"
      sampleText={SAMPLE}
      options={
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-4">
            <Field label="Table">
              <div className="flex h-7 items-center">
                <Checkbox
                  checked={onlyFlagged}
                  onCheckedChange={setOnlyFlagged}
                  label="Only invisible and lookalike characters"
                />
              </div>
            </Field>
          </div>
          <p className="text-[11.5px] leading-[1.5] text-ink-faint">
            Grapheme clusters are counted with the system’s own segmenter, so a family emoji counts as one character
            even though it is 7 code points, 11 UTF-16 units and 25 bytes. The table lists the first{' '}
            {DEFAULT_LIMIT.toLocaleString()} code points.
          </p>
        </div>
      }
    />
  );
}
