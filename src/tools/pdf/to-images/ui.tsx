// optional-dependency: pdfinfo only supplies the page-count hint; rendering needs pdftoppm, which is declared.
import { useEffect, useMemo, useState } from 'react';
import { call, openPath } from '@/core/bridge';
import { useToolFiles } from '@/core/useToolFiles';
import { useToolRun } from '@/core/useToolRun';
import {
  ErrorDisplay,
  FileDropZone,
  ImagePreview,
  OutputSettings,
  PresetRow,
  ResultPanel,
  ToolActions,
  ToolShell,
  useOutputSpec,
} from '@/components/tool';
import { Alert, Field, Input, NumberInput, Section, Segmented, Slider, Switch } from '@/components/ui';
import { describeRenderSize, pagesInRange, resolvePageRange, type PageRange } from './logic';

const TOOL_ID = 'pdf/to-images';
const TOOL_NAME = 'PDF to Images';

type Format = 'png' | 'jpeg' | 'tiff';

const DPI_PRESETS = [
  { value: 72, hint: '72 dpi — screen and email' },
  { value: 150, hint: '150 dpi — the default: fine on screen and on paper' },
  { value: 300, hint: '300 dpi — full print quality' },
  { value: 600, hint: '600 dpi — archival, very large files' },
];

/** Only the shape of `pdf_info` this tool reads. */
interface PdfSummary {
  pages: number;
  pageSize: string | null;
  encrypted: boolean;
}

const THUMBNAIL_LIMIT = 24;

export default function PdfToImages() {
  const files = useToolFiles({ kinds: ['pdf'], extensions: ['pdf'], filterName: 'PDF files' });
  const run = useToolRun(TOOL_ID, TOOL_NAME);
  const { spec, update } = useOutputSpec();

  const [format, setFormat] = useState<Format>('png');
  const [dpi, setDpi] = useState(150);
  const [quality, setQuality] = useState(90);
  const [grayscale, setGrayscale] = useState(false);
  const [limitPages, setLimitPages] = useState(false);
  const [firstText, setFirstText] = useState('1');
  const [lastText, setLastText] = useState('');
  const [summary, setSummary] = useState<PdfSummary | null>(null);

  const paths = files.paths;

  // A single document can tell us its page count and paper size, which makes the
  // range fields and the resolution choice concrete. Skipped for batches, where
  // it would mean one pdfinfo run per file for a hint nobody reads.
  useEffect(() => {
    if (paths.length !== 1) {
      setSummary(null);
      return;
    }
    let stale = false;
    call<PdfSummary[]>('pdf_info', { inputs: paths })
      .then((infos) => {
        if (!stale) setSummary(infos[0] ?? null);
      })
      .catch(() => {
        // The hint is a nicety — pdfinfo may not be installed alongside pdftoppm.
        if (!stale) setSummary(null);
      });
    return () => {
      stale = true;
    };
  }, [paths]);

  const range = useMemo<{ value: PageRange | null; error: string | null }>(() => {
    if (!limitPages) return { value: { first: null, last: null }, error: null };
    try {
      return { value: resolvePageRange(firstText, lastText), error: null };
    } catch (err) {
      return { value: null, error: err instanceof Error ? err.message : String(err) };
    }
  }, [limitPages, firstText, lastText]);

  const renderSize = describeRenderSize(summary?.pageSize, dpi);
  const pageEstimate =
    summary && summary.pages > 0 && range.value ? pagesInRange(range.value, summary.pages) : null;

  // Every page carries the whole PDF as its "source size", which would make the
  // result panel compare one page image against the entire document. Dropping it
  // keeps the panel honest: a page count, not a compression ratio.
  const result = useMemo(() => {
    if (!run.result) return null;
    return { ...run.result, results: run.result.results.map((r) => ({ ...r, sourceSize: null })) };
  }, [run.result]);

  const thumbnails = useMemo(() => (result?.results ?? []).slice(0, THUMBNAIL_LIMIT), [result]);

  const execute = () => {
    if (!range.value) return;
    void run.execute({
      command: 'pdf_to_images',
      total: files.files.length,
      inputs: paths,
      label: `Render ${files.files.length} PDF${files.files.length === 1 ? '' : 's'} to ${format.toUpperCase()}`,
      args: {
        inputs: paths,
        opts: {
          format,
          dpi,
          firstPage: range.value.first ?? undefined,
          lastPage: range.value.last ?? undefined,
          grayscale,
          jpegQuality: format === 'jpeg' ? quality : undefined,
        },
        output: spec,
      },
    });
  };

  return (
    <ToolShell
      main={
        <>
          <FileDropZone
            files={files}
            label="Drop PDFs here"
            hint="Every page becomes its own image file"
            accept="Folders are expanded automatically"
            allowFolders
          />

          {summary?.encrypted && (
            <Alert tone="warn" title="This PDF is password protected.">
              Pages cannot be rendered until the protection is removed. Use Remove PDF Password first,
              then come back.
            </Alert>
          )}

          {run.error && <ErrorDisplay error={run.error} onRetry={execute} />}

          {result && thumbnails.length > 0 && (
            <Section
              title="Rendered pages"
              description={
                result.results.length > thumbnails.length
                  ? `First ${thumbnails.length} of ${result.results.length} images`
                  : `${result.results.length} image${result.results.length === 1 ? '' : 's'}`
              }
            >
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                {thumbnails.map((page) => (
                  <button
                    key={page.path}
                    type="button"
                    title={`Open ${page.name}`}
                    onClick={() => void openPath(page.path)}
                    className="group min-w-0 text-left"
                  >
                    <ImagePreview
                      path={page.path}
                      alt={page.name}
                      checkered={false}
                      className="h-28 w-full transition-colors group-hover:border-line-strong"
                    />
                    <p className="mt-1 truncate text-[11.5px] text-ink-faint">{page.name}</p>
                  </button>
                ))}
              </div>
            </Section>
          )}

          {result && <ResultPanel result={result} onProcessAgain={run.reset} title="Pages rendered" />}
        </>
      }
      aside={
        <>
          <Section title="Image format">
            <div className="space-y-3">
              <Segmented
                value={format}
                onChange={(value) => setFormat(value)}
                options={[
                  { value: 'png', label: 'PNG', title: 'Lossless, crisp text' },
                  { value: 'jpeg', label: 'JPEG', title: 'Smaller files, photos' },
                  { value: 'tiff', label: 'TIFF', title: 'Archival and printing' },
                ]}
                className="w-full"
              />
              {format === 'jpeg' && (
                <Field label={`JPEG quality — ${quality}`} hint="Lower means smaller files and softer text.">
                  <Slider min={40} max={100} value={quality} onChange={setQuality} />
                </Field>
              )}
              <Field inline label="Grayscale" hint="Drop colour from every page">
                <Switch checked={grayscale} onCheckedChange={setGrayscale} />
              </Field>
            </div>
          </Section>

          <Section title="Resolution">
            <div className="space-y-3">
              <PresetRow
                presets={DPI_PRESETS.map((p) => ({ label: String(p.value), value: p.value, hint: p.hint }))}
                active={dpi}
                onSelect={setDpi}
              />
              <Field
                label="Dots per inch"
                hint={renderSize ? `Each page becomes ${renderSize}.` : 'Higher values mean sharper text and much larger files.'}
              >
                <NumberInput value={dpi} onValueChange={(v) => setDpi(Math.min(1200, Math.max(24, v)))} min={24} max={1200} step={6} suffix="dpi" />
              </Field>
            </div>
          </Section>

          <Section title="Pages">
            <div className="space-y-3">
              <Field
                inline
                label="Only part of the document"
                hint={summary?.pages ? `This PDF has ${summary.pages} pages` : 'Render a page range instead of all pages'}
              >
                <Switch checked={limitPages} onCheckedChange={setLimitPages} />
              </Field>
              {limitPages && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="First page">
                      <Input
                        value={firstText}
                        inputMode="numeric"
                        placeholder="1"
                        onChange={(e) => setFirstText(e.target.value)}
                      />
                    </Field>
                    <Field label="Last page">
                      <Input
                        value={lastText}
                        inputMode="numeric"
                        placeholder="end"
                        onChange={(e) => setLastText(e.target.value)}
                      />
                    </Field>
                  </div>
                  {range.error ? (
                    <p className="text-[11.5px] text-danger">{range.error}</p>
                  ) : (
                    <p className="text-[11.5px] text-ink-faint">
                      {pageEstimate === null
                        ? 'Leave a box empty for “from the start” or “to the end”.'
                        : pageEstimate === 0
                          ? 'That range is past the end of this document.'
                          : `Renders ${pageEstimate} page${pageEstimate === 1 ? '' : 's'}.`}
                    </p>
                  )}
                </>
              )}
            </div>
          </Section>

          <Section title="Where to save">
            <OutputSettings spec={spec} onChange={update} showSuffix={false} showCollision={false} />
            <p className="mt-3 text-[11.5px] text-ink-faint">
              Each PDF gets its own folder named{' '}
              <span className="text-ink-soft">
                {files.files.length === 1 ? `${files.files[0].stem}-pages` : 'document-pages'}
              </span>
              , so nothing is ever overwritten.
            </p>
          </Section>

          <ToolActions
            run={run}
            onRun={execute}
            label={`Render to ${format.toUpperCase()}`}
            icon="FileImage"
            disabled={files.isEmpty || Boolean(range.error)}
            disabledReason={range.error ?? 'Add at least one PDF first.'}
          />
        </>
      }
    />
  );
}
