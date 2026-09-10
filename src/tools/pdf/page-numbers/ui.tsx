import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';
import { useRef, useState } from 'react';
import { asToolboxError, planOutput } from '@/core/bridge';
import { readBytes, saveBytes } from '@/core/save';
import type { BatchResult, FileFailure, FileResult, OutputSpec, ToolboxError } from '@/core/types';
import { useToolFiles } from '@/core/useToolFiles';
import type { ToolRun } from '@/core/useToolRun';
import {
  ErrorDisplay,
  FileDropZone,
  OptionsGrid,
  OutputSettings,
  ResultPanel,
  ToolActions,
  ToolShell,
  useOutputSpec,
} from '@/components/tool';
import { Alert, ColorInput, Field, NumberInput, Section, Select, Switch } from '@/components/ui';
import {
  ANCHORS,
  TEMPLATES,
  describePdfError,
  highestNumber,
  parseHexColor,
  placeLabel,
  planStamps,
  renderTemplate,
  type Anchor,
} from './logic';

/**
 * Write bytes through the shared output policy, honouring a "skip" collision
 * choice: `saveBytes` writes whatever path the backend planned, so a skipped
 * destination has to be caught here before the existing file is clobbered.
 */
async function savePdf(bytes: Uint8Array, source: string, output: OutputSpec): Promise<FileResult> {
  const planned = await planOutput(source, output, 'pdf');
  if (planned.disposition === 'skipped') {
    return {
      path: planned.path,
      name: planned.name,
      size: 0,
      source,
      sourceSize: null,
      disposition: 'skipped',
      note: 'Kept the existing file',
    };
  }
  return saveBytes(bytes, { source, output, ext: 'pdf' });
}

/**
 * This tool stamps pages with pdf-lib in the frontend, so there is no backend
 * command for `useToolRun` to drive. This adapter keeps the standard action row
 * — same button, same progress, same ⌘⇧C shortcut — backed by local state, and
 * gives Cancel a real effect through the `cancelled` flag the loop checks.
 */
function useLocalRun() {
  const [progress, setProgress] = useState({ running: false, done: 0, total: 0, currentFile: null as string | null });
  const [result, setResult] = useState<BatchResult | null>(null);
  const [error, setError] = useState<ToolboxError | null>(null);
  const cancelled = useRef(false);

  const run: ToolRun = {
    running: progress.running,
    progress: progress.total > 0 ? progress.done / progress.total : null,
    done: progress.done,
    total: progress.total,
    currentFile: progress.currentFile,
    result,
    raw: null,
    error,
    taskId: null,
    // Nothing calls these: the work happens in `execute` below, not in a job.
    execute: async () => null,
    executeRaw: async () => null,
    cancel: () => {
      cancelled.current = true;
    },
    reset: () => {
      setResult(null);
      setError(null);
    },
  };

  return { run, setProgress, setResult, setError, cancelled };
}

const ANCHOR_LABELS: Record<Anchor, string> = {
  'top-left': 'Top left',
  'top-center': 'Top centre',
  'top-right': 'Top right',
  'middle-left': 'Middle left',
  'middle-center': 'Middle centre',
  'middle-right': 'Middle right',
  'bottom-left': 'Bottom left',
  'bottom-center': 'Bottom centre',
  'bottom-right': 'Bottom right',
};

function AnchorPicker({ value, onChange }: { value: Anchor; onChange: (value: Anchor) => void }) {
  return (
    <div className="grid w-[92px] grid-cols-3 gap-[3px] rounded-lg border border-line bg-canvas p-[3px]">
      {ANCHORS.map((anchor) => (
        <button
          key={anchor}
          type="button"
          role="radio"
          aria-checked={value === anchor}
          aria-label={ANCHOR_LABELS[anchor]}
          title={ANCHOR_LABELS[anchor]}
          onClick={() => onChange(anchor)}
          className={
            value === anchor
              ? 'h-6 rounded-[5px] bg-ink shadow-[0_1px_2px_rgba(0,0,0,0.12)]'
              : 'h-6 rounded-[5px] bg-panel transition-colors hover:bg-ink/10'
          }
        />
      ))}
    </div>
  );
}

export default function AddPageNumbers() {
  const files = useToolFiles({ kinds: ['pdf'], extensions: ['pdf'], filterName: 'PDF files' });
  const { run, setProgress, setResult, setError, cancelled } = useLocalRun();
  const { spec, update } = useOutputSpec({ suffix: '-numbered' });

  const [template, setTemplate] = useState(TEMPLATES[0].value);
  const [anchor, setAnchor] = useState<Anchor>('bottom-center');
  const [startAt, setStartAt] = useState(1);
  const [skipFirst, setSkipFirst] = useState(false);
  const [fontSize, setFontSize] = useState(10);
  const [bold, setBold] = useState(false);
  const [margin, setMargin] = useState(28);
  const [color, setColor] = useState('#333333');

  const colorValid = parseHexColor(color) !== null;
  const sample = renderTemplate(template, skipFirst ? startAt + 1 : startAt, highestNumber(10, startAt));

  const execute = async () => {
    if (files.isEmpty) return;
    const parsed = parseHexColor(color);
    if (!parsed) {
      setError({
        message: `“${color}” is not a colour. Use a hex value such as #333333.`,
        details: null,
        kind: 'invalid_input',
      });
      return;
    }

    cancelled.current = false;
    setError(null);
    setResult(null);
    setProgress({ running: true, done: 0, total: files.files.length, currentFile: null });
    const started = Date.now();
    const results: FileResult[] = [];
    const failures: FileFailure[] = [];
    let stopped = false;

    try {
      for (const [index, file] of files.files.entries()) {
        if (cancelled.current) {
          stopped = true;
          break;
        }
        setProgress({ running: true, done: index, total: files.files.length, currentFile: file.name });

        try {
          const bytes = await readBytes(file.path);
          // `updateMetadata: false` keeps the document's own Producer and dates.
          const pdfDoc = await PDFDocument.load(bytes, { updateMetadata: false });
          const font = await pdfDoc.embedFont(bold ? StandardFonts.HelveticaBold : StandardFonts.Helvetica);
          const pages = pdfDoc.getPages();
          const total = highestNumber(pages.length, startAt);
          const stamps = planStamps(pages.length, startAt, skipFirst);
          if (stamps.length === 0) {
            throw new Error('There are no pages left to number once the first page is skipped.');
          }

          for (const stamp of stamps) {
            const page = pages[stamp.index];
            const text = renderTemplate(template, stamp.number, total);
            const { width, height } = page.getSize();
            const placement = placeLabel({
              pageWidth: width,
              pageHeight: height,
              rotation: page.getRotation().angle,
              anchor,
              margin,
              textWidth: font.widthOfTextAtSize(text, fontSize),
              fontSize,
            });
            page.drawText(text, {
              x: placement.x,
              y: placement.y,
              size: fontSize,
              font,
              color: rgb(parsed.r, parsed.g, parsed.b),
              rotate: degrees(placement.rotate),
            });
          }

          const out = await pdfDoc.save();
          const saved = await savePdf(out, file.path, spec);
          results.push(
            saved.disposition === 'skipped'
              ? saved
              : {
                  ...saved,
                  sourceSize: file.size,
                  note: `${stamps.length} page${stamps.length === 1 ? '' : 's'} numbered`,
                },
          );
        } catch (err) {
          failures.push({
            path: file.path,
            name: file.name,
            message: describePdfError(err, file.name),
            details: err instanceof Error ? err.message : String(err),
          });
        }
      }

      setProgress({ running: true, done: files.files.length, total: files.files.length, currentFile: null });
      setResult({ results, failures, cancelled: stopped, elapsedMs: Date.now() - started });
    } catch (err) {
      setError(asToolboxError(err));
    } finally {
      setProgress({ running: false, done: 0, total: 0, currentFile: null });
    }
  };

  return (
    <ToolShell
      main={
        <>
          <FileDropZone
            files={files}
            label="Drop PDFs here"
            hint="Every page gets a number — drop as many files as you like"
            allowFolders
          />
          <Alert tone="info" title={`In a 10-page PDF, pages would read “${sample}”`}>
            {skipFirst
              ? 'The first page is left bare, and numbering carries on as if it were counted.'
              : 'Numbering starts on the very first page.'}{' '}
            Rotated pages are handled, so the number still lands where you see it.
          </Alert>
          {run.error && <ErrorDisplay error={run.error} onRetry={() => void execute()} />}
          {run.result && <ResultPanel result={run.result} onProcessAgain={run.reset} title="Page numbers added" />}
        </>
      }
      aside={
        <>
          <Section title="Numbering">
            <div className="space-y-3">
              <Field label="Format">
                <Select
                  value={template}
                  onChange={(e) => setTemplate(e.target.value)}
                  options={TEMPLATES.map((t) => ({ value: t.value, label: t.label }))}
                />
              </Field>
              <OptionsGrid>
                <Field label="Start at" hint="For a document that continues">
                  <NumberInput value={startAt} onValueChange={setStartAt} min={0} max={99999} />
                </Field>
                <Field label="Size">
                  <NumberInput value={fontSize} onValueChange={setFontSize} min={5} max={72} suffix="pt" />
                </Field>
              </OptionsGrid>
              <Field inline label="Skip the first page" hint="Leave a cover unnumbered">
                <Switch checked={skipFirst} onCheckedChange={setSkipFirst} label="Skip the first page" />
              </Field>
              <Field inline label="Bold" hint="Helvetica Bold instead of regular">
                <Switch checked={bold} onCheckedChange={setBold} label="Bold" />
              </Field>
            </div>
          </Section>

          <Section title="Placement">
            <div className="space-y-3">
              <div className="flex items-start gap-4">
                <AnchorPicker value={anchor} onChange={setAnchor} />
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-[12px] font-medium text-ink-soft">Position</p>
                  <p className="text-[11.5px] text-ink-faint">{ANCHOR_LABELS[anchor]} of every page.</p>
                </div>
              </div>
              <Field label="Margin" hint="Distance from the page edge — 72 points is one inch">
                <NumberInput value={margin} onValueChange={setMargin} min={0} max={200} suffix="pt" />
              </Field>
              <Field
                label="Colour"
                error={colorValid ? undefined : 'Use a hex colour such as #333333.'}
              >
                <ColorInput value={color} onChange={setColor} />
              </Field>
            </div>
          </Section>

          <Section title="Where to save">
            <OutputSettings spec={spec} onChange={update} />
          </Section>

          <ToolActions
            run={run}
            onRun={() => void execute()}
            label="Add page numbers"
            icon="Hash"
            disabled={files.isEmpty || !colorValid}
            disabledReason={files.isEmpty ? 'Add at least one PDF first.' : 'Fix the colour first.'}
          />
        </>
      }
    />
  );
}
