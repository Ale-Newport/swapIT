import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { asToolboxError, call } from '@/core/bridge';
import { getTool } from '@/core/registry';
import type { ToolboxError } from '@/core/types';
import { useToolFiles } from '@/core/useToolFiles';
import { useToolRun } from '@/core/useToolRun';
import {
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
  CopyButton,
  Field,
  Section,
  Select,
  Spinner,
  Switch,
  Textarea,
} from '@/components/ui';
import { isEffectivelyEmpty, textStats, truncateForPreview } from './logic';

const TOOL_ID = 'pdf/to-text';
const TOOL_NAME = 'PDF to Text';
const PREVIEW_LIMIT = 200_000;

export default function PdfToText() {
  const files = useToolFiles({ kinds: ['pdf'], extensions: ['pdf'], filterName: 'PDF files' });
  const run = useToolRun(TOOL_ID, TOOL_NAME);
  const { spec, update } = useOutputSpec();

  const [layout, setLayout] = useState(true);
  const [selected, setSelected] = useState(0);
  const [text, setText] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<ToolboxError | null>(null);
  const [attempt, setAttempt] = useState(0);

  const ocrTool = getTool('capture/ocr');
  const paths = files.paths;
  const index = Math.min(selected, Math.max(0, paths.length - 1));
  const previewPath = paths[index] ?? null;

  // The preview follows the chosen file and the layout switch, so the toggle
  // shows its effect straight away instead of only in the saved file.
  useEffect(() => {
    if (!previewPath) {
      setText(null);
      setReadError(null);
      return;
    }
    let stale = false;
    setReading(true);
    setReadError(null);
    call<string>('pdf_read_text', { input: previewPath, layout })
      .then((value) => {
        if (stale) return;
        setText(value);
      })
      .catch((err) => {
        if (stale) return;
        setText(null);
        setReadError(asToolboxError(err));
      })
      .finally(() => {
        if (!stale) setReading(false);
      });
    return () => {
      stale = true;
    };
  }, [previewPath, layout, attempt]);

  const stats = useMemo(() => (text === null ? null : textStats(text)), [text]);
  const preview = useMemo(
    () => (text === null ? null : truncateForPreview(text, PREVIEW_LIMIT)),
    [text],
  );
  const empty = text !== null && isEffectivelyEmpty(text);

  const execute = () =>
    void run.execute({
      command: 'pdf_to_text',
      total: files.files.length,
      inputs: paths,
      label: `Extract text from ${files.files.length} PDF${files.files.length === 1 ? '' : 's'}`,
      args: { inputs: paths, layout, output: spec },
    });

  return (
    <ToolShell
      main={
        <>
          <FileDropZone
            files={files}
            label="Drop PDFs here"
            hint="Read the text here, or save one .txt file per document"
            allowFolders
          />

          {previewPath && (
            <Section
              title="Extracted text"
              description={
                stats
                  ? `${stats.words.toLocaleString()} words · ${stats.characters.toLocaleString()} characters${
                      stats.pages ? ` · ${stats.pages} page${stats.pages === 1 ? '' : 's'}` : ''
                    }`
                  : 'Reading the document…'
              }
              actions={
                <>
                  {files.files.length > 1 && (
                    <Select
                      value={String(index)}
                      onChange={(e) => setSelected(Number(e.target.value))}
                      className="max-w-52"
                      options={files.files.map((f, i) => ({ value: String(i), label: f.name }))}
                    />
                  )}
                  <CopyButton
                    value={() => text ?? ''}
                    label="Copy text"
                    disabled={!text || empty}
                  />
                </>
              }
            >
              {reading ? (
                <div className="flex items-center gap-2 py-8 text-[12.5px] text-ink-faint">
                  <Spinner /> Reading “{files.files[index]?.name}”…
                </div>
              ) : readError ? (
                <ErrorDisplay error={readError} onRetry={() => setAttempt((n) => n + 1)} />
              ) : empty ? (
                <Alert tone="warn" title="This PDF has no text to extract.">
                  The pages are pictures — a scan or a photographed document — so there are no words
                  stored inside the file. Recognise them with{' '}
                  {ocrTool ? (
                    <Link to={`/t/${ocrTool.id}`} className="underline underline-offset-2">
                      {ocrTool.name}
                    </Link>
                  ) : (
                    'the OCR tool under Capture & OCR'
                  )}
                  , which reads text out of images.
                </Alert>
              ) : (
                <div className="space-y-2">
                  <Textarea
                    value={preview?.text ?? ''}
                    readOnly
                    rows={18}
                    aria-label="Extracted text"
                    className="min-h-[22rem]"
                  />
                  {preview?.truncated && (
                    <p className="text-[11.5px] text-ink-faint">
                      Showing the first {PREVIEW_LIMIT.toLocaleString()} characters. Saving writes the
                      whole document.
                    </p>
                  )}
                </div>
              )}
            </Section>
          )}

          {run.error && <ErrorDisplay error={run.error} onRetry={execute} />}
          {run.result && <ResultPanel result={run.result} onProcessAgain={run.reset} title="Text saved" />}
        </>
      }
      aside={
        <>
          <Section title="Extraction">
            <div className="space-y-3">
              <Field
                inline
                label="Preserve layout"
                hint="Keep columns, tables and spacing as they look on the page"
              >
                <Switch checked={layout} onCheckedChange={setLayout} />
              </Field>
              <p className="text-[11.5px] text-ink-faint">
                {layout
                  ? 'Text keeps its position on the page — best for tables, invoices and forms.'
                  : 'Text comes out as one reading-order flow — best for pasting into a document.'}
              </p>
              {previewPath && !reading && !empty && !readError && (
                <Button
                  size="sm"
                  variant="ghost"
                  icon="RefreshCw"
                  onClick={() => setAttempt((n) => n + 1)}
                >
                  Read again
                </Button>
              )}
            </div>
          </Section>

          <Section title="Where to save">
            <OutputSettings spec={spec} onChange={update} />
            <p className="mt-3 flex items-center gap-1.5 text-[11.5px] text-ink-faint">
              <Badge>.txt</Badge> One text file per PDF, in UTF-8.
            </p>
          </Section>

          <ToolActions
            run={run}
            onRun={execute}
            label={files.files.length > 1 ? `Save ${files.files.length} text files` : 'Save as text'}
            icon="FileType"
            disabled={files.isEmpty}
            disabledReason="Add at least one PDF first."
          />
        </>
      }
    />
  );
}
