import { open } from '@tauri-apps/plugin-dialog';
import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';
import { useRef, useState } from 'react';
import { asToolboxError, planOutput } from '@/core/bridge';
import { basename, dirname } from '@/core/format';
import { usePrefs } from '@/core/prefs';
import { readBytes, saveBytes } from '@/core/save';
import { useSettings } from '@/core/settings';
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
  assetUrl,
  useOutputSpec,
} from '@/components/tool';
import {
  Alert,
  Button,
  ColorInput,
  Field,
  Icon,
  Input,
  NumberInput,
  Section,
  Segmented,
  Select,
  Slider,
} from '@/components/ui';
import {
  ANCHORS,
  anchorCenter,
  anchorFromCenter,
  describePdfError,
  normalizeRotation,
  parseHexColor,
  parsePageRange,
  rotatedExtent,
  tileCenters,
  toUserSpace,
  unsupportedCharacters,
  validatePageRange,
  visualSize,
  type Anchor,
} from './logic';

type Mode = 'text' | 'image';
type Layout = 'anchor' | 'tiled';

const TOOL_ID = 'pdf/watermark';
const TOOL_NAME = 'PDF Watermark';

/**
 * `saveBytes` writes whatever path the backend plans, and for the "skip"
 * collision policy that path is the *existing* file — so the write has to be
 * skipped here, before it clobbers the file the user asked to keep.
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

const FONTS = [
  { value: StandardFonts.Helvetica, label: 'Helvetica' },
  { value: StandardFonts.HelveticaBold, label: 'Helvetica Bold' },
  { value: StandardFonts.TimesRoman, label: 'Times Roman' },
  { value: StandardFonts.TimesRomanBold, label: 'Times Roman Bold' },
  { value: StandardFonts.Courier, label: 'Courier' },
  { value: StandardFonts.CourierBold, label: 'Courier Bold' },
];

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

/**
 * The watermark is drawn with pdf-lib in the frontend, so there is no backend
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

export default function PdfWatermark() {
  const files = useToolFiles({ kinds: ['pdf'], extensions: ['pdf'], filterName: 'PDF files' });
  const { run, setProgress, setResult, setError, cancelled } = useLocalRun();
  const { spec, update } = useOutputSpec({ suffix: '-watermarked' });
  const markUsed = usePrefs((s) => s.markUsed);
  const addHistory = usePrefs((s) => s.addHistory);
  const recentHistory = useSettings((s) => s.settings.recentHistory);

  const [mode, setMode] = useState<Mode>('text');
  const [text, setText] = useState('CONFIDENTIAL');
  const [font, setFont] = useState<string>(StandardFonts.Helvetica);
  const [fontSize, setFontSize] = useState(48);
  const [color, setColor] = useState('#c0392b');
  const [imagePath, setImagePath] = useState<string | null>(null);
  const [imageWidthPct, setImageWidthPct] = useState(35);
  const [opacity, setOpacity] = useState(18);
  const [rotation, setRotation] = useState(45);
  const [layout, setLayout] = useState<Layout>('anchor');
  const [anchor, setAnchor] = useState<Anchor>('middle-center');
  const [spacing, setSpacing] = useState(40);
  const [margin, setMargin] = useState(36);
  const [allPages, setAllPages] = useState(true);
  const [pageRange, setPageRange] = useState('1-');

  const colorValid = parseHexColor(color) !== null;
  const badCharacters = mode === 'text' ? unsupportedCharacters(text) : [];
  const ready =
    !files.isEmpty &&
    (mode === 'text'
      ? text.trim().length > 0 && colorValid && badCharacters.length === 0
      : imagePath !== null);

  const chooseImage = async () => {
    const picked = await open({
      multiple: false,
      directory: false,
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg'] }],
    });
    if (typeof picked === 'string') setImagePath(picked);
  };

  const execute = async () => {
    if (!ready) return;
    const parsedColor = parseHexColor(color) ?? { r: 0, g: 0, b: 0 };

    cancelled.current = false;
    setError(null);
    setResult(null);
    setProgress({ running: true, done: 0, total: files.files.length, currentFile: null });
    markUsed(TOOL_ID);
    const started = Date.now();
    const results: FileResult[] = [];
    const failures: FileFailure[] = [];
    let stopped = false;

    try {
      // Check the range once, up front, so a typo is one clear message rather
      // than the same failure repeated for every file in the batch. This checks
      // the tokens only — the pages themselves are resolved per file, against
      // that file's own length.
      if (!allPages) validatePageRange(pageRange);

      const stampBytes = mode === 'image' && imagePath ? await readBytes(imagePath) : null;
      const stampIsPng = imagePath ? /\.png$/i.test(imagePath) : false;

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
          const pages = pdfDoc.getPages();
          const targets = allPages
            ? pages.map((_page, i) => i)
            : parsePageRange(pageRange, pages.length);

          const embeddedFont = mode === 'text' ? await pdfDoc.embedFont(font) : null;
          const embeddedImage =
            stampBytes && (stampIsPng ? await pdfDoc.embedPng(stampBytes) : await pdfDoc.embedJpg(stampBytes));

          let marks = 0;
          for (const target of targets) {
            const page = pages[target];
            const { width: pageWidth, height: pageHeight } = page.getSize();
            const pageRotation = normalizeRotation(page.getRotation().angle);
            const visual = visualSize(pageWidth, pageHeight, pageRotation);

            let markWidth: number;
            let markHeight: number;
            if (embeddedFont) {
              markWidth = embeddedFont.widthOfTextAtSize(text, fontSize);
              markHeight = embeddedFont.heightAtSize(fontSize, { descender: false });
            } else if (embeddedImage) {
              markWidth = (visual.width * imageWidthPct) / 100;
              markHeight = (markWidth * embeddedImage.height) / embeddedImage.width;
            } else {
              break;
            }

            const extent = rotatedExtent(markWidth, markHeight, rotation);
            const centers =
              layout === 'tiled'
                ? tileCenters(visual.width, visual.height, extent.width + spacing, extent.height + spacing)
                : [anchorCenter(anchor, visual.width, visual.height, margin, extent.width, extent.height)];

            // The mark is turned by the page's own rotation as well, so it stays
            // upright relative to what the reader sees.
            const drawAngle = rotation + pageRotation;
            for (const center of centers) {
              const point = toUserSpace(center.cx, center.cy, pageWidth, pageHeight, pageRotation);
              const at = anchorFromCenter(point.x, point.y, markWidth, markHeight, drawAngle);
              if (embeddedFont) {
                page.drawText(text, {
                  x: at.x,
                  y: at.y,
                  size: fontSize,
                  font: embeddedFont,
                  color: rgb(parsedColor.r, parsedColor.g, parsedColor.b),
                  opacity: opacity / 100,
                  rotate: degrees(drawAngle),
                });
              } else if (embeddedImage) {
                page.drawImage(embeddedImage, {
                  x: at.x,
                  y: at.y,
                  width: markWidth,
                  height: markHeight,
                  opacity: opacity / 100,
                  rotate: degrees(drawAngle),
                });
              }
              marks += 1;
            }
          }

          const out = await pdfDoc.save();
          const saved = await savePdf(out, file.path, spec);
          results.push({
            ...saved,
            sourceSize: file.size,
            note:
              saved.note ??
              `${targets.length} page${targets.length === 1 ? '' : 's'}${layout === 'tiled' ? ` · ${marks} marks` : ''}`,
          });
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
      if (recentHistory && results.length > 0) {
        addHistory({
          toolId: TOOL_ID,
          toolName: TOOL_NAME,
          inputs: files.files.map((f) => f.name).slice(0, 20),
          outputDir: dirname(results[0].path),
          outputCount: results.length,
        });
      }
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
            hint="The watermark is drawn over the existing page content"
            allowFolders
          />
          <Alert tone="info" title="Watermarks are decoration, not protection">
            Anyone with a PDF editor can take this mark off again. If the file really needs to be restricted, give
            it a password as well.
          </Alert>
          {run.error && <ErrorDisplay error={run.error} onRetry={() => void execute()} />}
          {run.result && <ResultPanel result={run.result} onProcessAgain={run.reset} title="Watermark applied" />}
        </>
      }
      aside={
        <>
          <Section title="Watermark">
            <div className="space-y-3">
              <Segmented
                value={mode}
                onChange={setMode}
                options={[
                  { value: 'text', label: 'Text' },
                  { value: 'image', label: 'Image' },
                ]}
                className="w-full"
              />

              {mode === 'text' ? (
                <>
                  <Field
                    label="Text"
                    error={
                      badCharacters.length > 0
                        ? `The built-in PDF fonts cannot draw ${badCharacters.join(' ')} — use an image watermark for this text.`
                        : undefined
                    }
                  >
                    <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="CONFIDENTIAL" />
                  </Field>
                  <Field label="Font">
                    <Select value={font} onChange={(e) => setFont(e.target.value)} options={FONTS} />
                  </Field>
                  <OptionsGrid>
                    <Field label="Size">
                      <NumberInput value={fontSize} onValueChange={setFontSize} min={6} max={300} suffix="pt" />
                    </Field>
                    <Field label="Turn">
                      <NumberInput value={rotation} onValueChange={setRotation} min={-180} max={180} suffix="°" />
                    </Field>
                  </OptionsGrid>
                  <Field label="Colour" error={colorValid ? undefined : 'Use a hex colour such as #c0392b.'}>
                    <ColorInput value={color} onChange={setColor} />
                  </Field>
                </>
              ) : (
                <>
                  <Field label="Image" hint="PNG keeps its transparency">
                    {imagePath ? (
                      <div className="flex items-center gap-2 rounded-lg border border-line bg-canvas p-2">
                        <div className="checkerboard h-10 w-10 shrink-0 overflow-hidden rounded">
                          <img src={assetUrl(imagePath)} alt="" className="h-full w-full object-contain" />
                        </div>
                        <span className="min-w-0 flex-1 truncate text-[12px] text-ink" title={imagePath}>
                          {basename(imagePath)}
                        </span>
                        <Button size="sm" variant="ghost" icon="X" onClick={() => setImagePath(null)}>
                          Clear
                        </Button>
                      </div>
                    ) : (
                      <Button size="sm" icon="Image" onClick={() => void chooseImage()} full>
                        Choose a PNG or JPEG
                      </Button>
                    )}
                  </Field>
                  <OptionsGrid>
                    <Field label="Width" hint="Share of the page">
                      <NumberInput
                        value={imageWidthPct}
                        onValueChange={setImageWidthPct}
                        min={1}
                        max={200}
                        suffix="%"
                      />
                    </Field>
                    <Field label="Turn">
                      <NumberInput value={rotation} onValueChange={setRotation} min={-180} max={180} suffix="°" />
                    </Field>
                  </OptionsGrid>
                </>
              )}

              <Field label={`Opacity — ${opacity}%`} hint="Low values sit behind the text without hiding it">
                <Slider min={2} max={100} value={opacity} onChange={setOpacity} />
              </Field>
            </div>
          </Section>

          <Section title="Placement">
            <div className="space-y-3">
              <Segmented
                value={layout}
                onChange={setLayout}
                options={[
                  { value: 'anchor', label: 'One per page' },
                  { value: 'tiled', label: 'Tiled' },
                ]}
                className="w-full"
                size="sm"
              />
              {layout === 'anchor' ? (
                <>
                  <div className="flex items-start gap-4">
                    <AnchorPicker value={anchor} onChange={setAnchor} />
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="text-[12px] font-medium text-ink-soft">Position</p>
                      <p className="text-[11.5px] text-ink-faint">{ANCHOR_LABELS[anchor]} of every page.</p>
                    </div>
                  </div>
                  <Field label="Margin" hint="Distance from the page edge">
                    <NumberInput value={margin} onValueChange={setMargin} min={0} max={200} suffix="pt" />
                  </Field>
                </>
              ) : (
                <Field label="Gap between marks" hint="Smaller values pack the pattern tighter">
                  <NumberInput value={spacing} onValueChange={setSpacing} min={0} max={400} suffix="pt" />
                </Field>
              )}
            </div>
          </Section>

          <Section title="Pages">
            <div className="space-y-3">
              <Segmented
                value={allPages ? 'all' : 'range'}
                onChange={(value) => setAllPages(value === 'all')}
                options={[
                  { value: 'all', label: 'Every page' },
                  { value: 'range', label: 'Some pages' },
                ]}
                className="w-full"
                size="sm"
              />
              {!allPages && (
                <Field label="Page range" hint="Such as 1-3, 7 or 12- for “12 to the end”">
                  <Input
                    value={pageRange}
                    onChange={(e) => setPageRange(e.target.value)}
                    placeholder="1-3, 7"
                    className="font-mono"
                  />
                </Field>
              )}
              {!allPages && files.files.length > 1 && (
                <p className="flex items-start gap-1.5 text-[11.5px] text-ink-faint">
                  <Icon name="Info" size={12} className="mt-[2px] shrink-0" />
                  The same range is applied to every file, clamped to each one&rsquo;s length.
                </p>
              )}
            </div>
          </Section>

          <Section title="Where to save">
            <OutputSettings spec={spec} onChange={update} />
          </Section>

          <ToolActions
            run={run}
            onRun={() => void execute()}
            label="Apply watermark"
            icon="Stamp"
            disabled={!ready}
            disabledReason={
              files.isEmpty
                ? 'Add at least one PDF first.'
                : mode === 'image'
                  ? 'Choose a PNG or JPEG to stamp.'
                  : !colorValid
                    ? 'Fix the colour first.'
                    : badCharacters.length > 0
                      ? 'Remove the characters the built-in fonts cannot draw.'
                      : 'Type the watermark text.'
            }
          />
        </>
      }
    />
  );
}
