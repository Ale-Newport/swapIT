import { useEffect, useMemo, useState } from 'react';
import { appPaths, asToolboxError, call } from '@/core/bridge';
import { basename } from '@/core/format';
import { saveText } from '@/core/save';
import type {
  BatchResult,
  BinaryId,
  FileFailure,
  FileKind,
  FileResult,
  ToolboxError,
} from '@/core/types';
import { useToolFiles } from '@/core/useToolFiles';
import { useToolRun } from '@/core/useToolRun';
import {
  DependencyGate,
  ErrorDisplay,
  FileDropZone,
  OutputSettings,
  ResultPanel,
  ToolActions,
  ToolShell,
  useOutputSpec,
} from '@/components/tool';
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  CopyButton,
  Field,
  Input,
  NumberInput,
  Section,
  Select,
  Spinner,
  Textarea,
} from '@/components/ui';
import {
  PSM_OPTIONS,
  defaultLanguages,
  hasPdf,
  isEmptyResult,
  joinLanguages,
  languageLabel,
  orderLanguages,
} from './logic';

const TOOL_ID = 'capture/ocr';
const TOOL_NAME = 'Image or PDF to Text';

/**
 * Extensions Tesseract's image library can actually decode. The broad `image`
 * kind is deliberately not accepted: it also covers HEIC, HEIF and AVIF, which
 * Leptonica cannot read, so those would only fail once Tesseract had started.
 */
const EXTENSIONS = ['png', 'jpg', 'jpeg', 'tif', 'tiff', 'bmp', 'webp', 'gif', 'pdf'];
const KINDS: FileKind[] = ['pdf'];

/** Poppler renders PDF pages to images; images and screenshots never need it. */
const PDF_BINARY: BinaryId[] = ['pdftoppm'];

interface OcrResult {
  source: string;
  text: string;
  characters: number;
  words: number;
}

export default function ImageOrPdfToText() {
  const files = useToolFiles({
    kinds: KINDS,
    extensions: EXTENSIONS,
    filterName: 'Images and PDFs',
  });
  const run = useToolRun(TOOL_ID, TOOL_NAME);
  const { spec, update } = useOutputSpec();

  const [available, setAvailable] = useState<string[] | null>(null);
  const [languages, setLanguages] = useState<string[]>([]);
  const [languageError, setLanguageError] = useState<ToolboxError | null>(null);
  const [languageQuery, setLanguageQuery] = useState('');
  const [langAttempt, setLangAttempt] = useState(0);
  const [psm, setPsm] = useState(3);
  const [dpi, setDpi] = useState(300);

  const [results, setResults] = useState<OcrResult[] | null>(null);
  const [viewing, setViewing] = useState(0);
  const [saved, setSaved] = useState<BatchResult | null>(null);
  const [localError, setLocalError] = useState<ToolboxError | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Which languages this Mac actually has data for — the picker never offers one
  // Tesseract would refuse.
  useEffect(() => {
    let stale = false;
    setLanguageError(null);
    void call<string[]>('available_ocr_languages')
      .then((list) => {
        if (stale) return;
        setAvailable(orderLanguages(list));
        setLanguages((current) => (current.length > 0 ? current : defaultLanguages(list)));
      })
      .catch((err) => {
        if (stale) return;
        setAvailable([]);
        setLanguageError(asToolboxError(err));
      });
    return () => {
      stale = true;
    };
  }, [langAttempt]);

  const visibleLanguages = useMemo(() => {
    const list = available ?? [];
    const q = languageQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (code) => code.toLowerCase().includes(q) || languageLabel(code).toLowerCase().includes(q),
    );
  }, [available, languageQuery]);

  const selectedLabel = languages.map(languageLabel).join(', ');
  const psmOption = PSM_OPTIONS.find((o) => o.value === psm) ?? PSM_OPTIONS[0];
  const pdfSelected = hasPdf(files.paths);

  const toggleLanguage = (code: string, on: boolean) =>
    setLanguages((current) => (on ? [...current, code] : current.filter((c) => c !== code)));

  const readText = async (paths: string[]) => {
    if (paths.length === 0) return;
    setLocalError(null);
    setSaved(null);
    let languageArg: string;
    try {
      languageArg = joinLanguages(languages);
    } catch (err) {
      setLocalError(asToolboxError(err));
      return;
    }
    const value = await run.executeRaw<OcrResult[]>({
      command: 'ocr_files',
      total: paths.length,
      inputs: paths,
      label: `Read text from ${paths.length} file${paths.length === 1 ? '' : 's'}`,
      args: { inputs: paths, opts: { languages: languageArg, psm, dpi } },
    });
    if (value) {
      setResults(value);
      setViewing(0);
    }
  };

  /** Take a shot, keep it in the list, and read it straight away. */
  const captureAndRead = async () => {
    setCapturing(true);
    setLocalError(null);
    setNote(null);
    try {
      const places = await appPaths();
      const shot = await call<FileResult>('take_screenshot', {
        mode: 'interactive',
        outputDir: places.temp,
      });
      await files.add([shot.path]);
      await readText([shot.path]);
    } catch (err) {
      const failure = asToolboxError(err);
      if (failure.kind === 'cancelled') setNote('No screenshot was taken — the capture was cancelled.');
      else setLocalError(failure);
    } finally {
      setCapturing(false);
    }
  };

  const saveMany = async (items: OcrResult[]) => {
    if (items.length === 0) return;
    setSaving(true);
    setLocalError(null);
    const written: FileResult[] = [];
    const failures: FileFailure[] = [];
    for (const item of items) {
      try {
        written.push(await saveText(item.text, { source: item.source, output: spec, ext: 'txt' }));
      } catch (err) {
        const failure = asToolboxError(err);
        failures.push({
          path: item.source,
          name: basename(item.source),
          message: failure.message,
          details: failure.details ?? null,
        });
      }
    }
    setSaved({ results: written, failures, cancelled: false, elapsedMs: 0 });
    setSaving(false);
  };

  const list = results ?? [];
  const index = Math.min(viewing, Math.max(0, list.length - 1));
  const current = list[index] ?? null;
  const saveable = list.filter((r) => !isEmptyResult(r.text));
  const totalWords = list.reduce((sum, r) => sum + r.words, 0);
  const noLanguages = languages.length === 0;

  return (
    <ToolShell
      main={
        <>
          <FileDropZone
            files={files}
            label="Drop images or PDFs here"
            hint="Screenshots, photos of documents, scans — PNG, JPEG, TIFF, BMP, WebP, GIF, and PDFs whose pages are pictures"
            accept="Recognition runs on this Mac; nothing is uploaded"
            allowFolders
          />

          {/* Poppler turns PDF pages into images before Tesseract sees them, so
              it is only asked for once a PDF is in the list. */}
          {pdfSelected && <DependencyGate requires={PDF_BINARY}>{null}</DependencyGate>}

          {note && <Alert tone="info">{note}</Alert>}
          {localError && <ErrorDisplay error={localError} />}
          {run.error && <ErrorDisplay error={run.error} onRetry={() => void readText(files.paths)} />}

          {current && (
            <Section
              title="Recognised text"
              description={
                <>
                  {current.words.toLocaleString()} words · {current.characters.toLocaleString()} characters
                  {list.length > 1 && ` · ${totalWords.toLocaleString()} words across ${list.length} files`}
                </>
              }
              actions={
                <>
                  {list.length > 1 && (
                    <Select
                      value={String(index)}
                      onChange={(e) => setViewing(Number(e.target.value))}
                      className="max-w-52"
                      options={list.map((r, i) => ({ value: String(i), label: basename(r.source) }))}
                    />
                  )}
                  <CopyButton
                    value={() => current.text}
                    label="Copy text"
                    disabled={isEmptyResult(current.text)}
                  />
                  <Button
                    size="sm"
                    icon="FileText"
                    loading={saving}
                    disabled={isEmptyResult(current.text)}
                    onClick={() => void saveMany([current])}
                  >
                    Save as .txt
                  </Button>
                </>
              }
            >
              {isEmptyResult(current.text) ? (
                <Alert tone="warn" title="No text was recognised in this file.">
                  Try a sharper or larger image, choose the language the document is actually written in,
                  or switch the page layout to “Sparse text” for scattered words. Scanned PDFs read better
                  at a higher DPI.
                </Alert>
              ) : (
                <Textarea
                  value={current.text}
                  readOnly
                  rows={18}
                  aria-label="Recognised text"
                  className="min-h-[22rem]"
                />
              )}
              <p className="mt-2 truncate text-[11.5px] text-ink-faint" title={current.source}>
                From {basename(current.source)}
              </p>
            </Section>
          )}

          {saved && <ResultPanel result={saved} title="Text saved" onProcessAgain={() => setSaved(null)} />}
        </>
      }
      aside={
        <>
          <Section
            title="Languages"
            description={
              languages.length > 0 ? selectedLabel : 'Pick the languages the text is written in'
            }
            actions={<Badge tone={noLanguages ? 'warn' : 'accent'}>{languages.length} selected</Badge>}
          >
            {available === null ? (
              <div className="flex items-center gap-2 py-4 text-[12.5px] text-ink-faint">
                <Spinner /> Reading the installed language data…
              </div>
            ) : languageError ? (
              <ErrorDisplay error={languageError} onRetry={() => setLangAttempt((n) => n + 1)} />
            ) : available.length === 0 ? (
              <Alert tone="warn" title="Tesseract has no language data installed.">
                Install it with <code className="selectable font-mono">brew install tesseract-lang</code>,
                then reopen this tool.
              </Alert>
            ) : (
              <div className="space-y-2">
                {available.length > 8 && (
                  <Input
                    value={languageQuery}
                    onChange={(e) => setLanguageQuery(e.target.value)}
                    placeholder="Filter languages…"
                  />
                )}
                <div className="max-h-56 space-y-1.5 overflow-y-auto rounded-lg border border-line bg-canvas p-2">
                  {visibleLanguages.length === 0 ? (
                    <p className="px-1 py-2 text-[12px] text-ink-faint">
                      No installed language matches “{languageQuery}”.
                    </p>
                  ) : (
                    visibleLanguages.map((code) => (
                      <Checkbox
                        key={code}
                        checked={languages.includes(code)}
                        onCheckedChange={(on) => toggleLanguage(code, on)}
                        label={
                          <span className="flex items-baseline gap-1.5">
                            {languageLabel(code)}
                            <span className="font-mono text-[11px] text-ink-faint">{code}</span>
                          </span>
                        }
                      />
                    ))
                  )}
                </div>
                <p className="text-[11.5px] text-ink-faint">
                  Choosing several reads mixed-language pages, at some cost in speed and accuracy.
                </p>
              </div>
            )}
          </Section>

          <Section title="Page layout">
            <div className="space-y-3">
              <Field label="How the text sits on the page" hint={psmOption.hint}>
                <Select
                  value={String(psm)}
                  onChange={(e) => setPsm(Number(e.target.value))}
                  options={PSM_OPTIONS.map((o) => ({ value: String(o.value), label: o.label }))}
                />
              </Field>
              <Field
                label="PDF rendering detail"
                hint={
                  pdfSelected
                    ? 'Higher reads small print better and takes longer.'
                    : 'Only used when a PDF is in the list.'
                }
              >
                <NumberInput value={dpi} onValueChange={setDpi} min={72} max={600} step={50} suffix="dpi" />
              </Field>
            </div>
          </Section>

          <Section title="Where to save the .txt files">
            <OutputSettings spec={spec} onChange={update} />
            <p className="mt-3 text-[11.5px] text-ink-faint">
              One UTF-8 text file per input, named after it.
            </p>
          </Section>

          <ToolActions
            run={run}
            onRun={() => void readText(files.paths)}
            label={files.files.length > 1 ? `Read ${files.files.length} files` : 'Read text'}
            icon="ScanText"
            disabled={files.isEmpty || noLanguages}
            disabledReason={
              noLanguages ? 'Choose at least one language first.' : 'Add at least one image or PDF first.'
            }
          >
            <Button
              icon="Camera"
              size="lg"
              loading={capturing}
              disabled={noLanguages || run.running}
              onClick={() => void captureAndRead()}
            >
              Capture &amp; read
            </Button>
          </ToolActions>

          {saveable.length > 1 && (
            <Button
              full
              icon="FileText"
              loading={saving}
              onClick={() => void saveMany(saveable)}
            >
              Save all {saveable.length} as .txt
            </Button>
          )}
        </>
      }
    />
  );
}
