import { PDFDocument, PDFName } from 'pdf-lib';
import { useCallback, useEffect, useRef, useState } from 'react';
import { asToolboxError, planOutput } from '@/core/bridge';
import { dirname } from '@/core/format';
import { usePrefs } from '@/core/prefs';
import { readBytes, saveBytes } from '@/core/save';
import { useSettings } from '@/core/settings';
import type { BatchResult, FileFailure, FileResult, OutputSpec, ToolboxError } from '@/core/types';
import { useToolFiles } from '@/core/useToolFiles';
import type { ToolRun } from '@/core/useToolRun';
import {
  ErrorDisplay,
  FileDropZone,
  OutputSettings,
  ResultPanel,
  ToolActions,
  ToolShell,
  useOutputSpec,
} from '@/components/tool';
import { Alert, Badge, Button, Icon, Section, Spinner } from '@/components/ui';
import { describePdfError, foundFields, summarize, type FoundField } from './logic';

const TOOL_ID = 'pdf/remove-metadata';
const TOOL_NAME = 'Remove PDF Metadata';

/** Above this many files the scan is on request, so dropping a folder stays instant. */
const AUTO_SCAN_LIMIT = 30;

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

interface ScanRow {
  path: string;
  name: string;
  found: FoundField[];
  error: string | null;
}

/**
 * Everything here runs in the frontend with pdf-lib, so there is no backend
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

export default function RemovePdfMetadata() {
  const files = useToolFiles({ kinds: ['pdf'], extensions: ['pdf'], filterName: 'PDF files' });
  const { run, setProgress, setResult, setError, cancelled } = useLocalRun();
  const { spec, update } = useOutputSpec({ suffix: '-clean' });
  const markUsed = usePrefs((s) => s.markUsed);
  const addHistory = usePrefs((s) => s.addHistory);
  const recentHistory = useSettings((s) => s.settings.recentHistory);

  const [scan, setScan] = useState<ScanRow[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const scanToken = useRef(0);

  const items = files.files;

  const doScan = useCallback(async () => {
    const token = ++scanToken.current;
    setScanning(true);
    const rows: ScanRow[] = [];
    try {
      for (const file of items) {
        if (scanToken.current !== token) return;
        try {
          const bytes = await readBytes(file.path);
          // `updateMetadata: false` — otherwise pdf-lib would rewrite the very
          // fields we are here to inspect before we ever read them.
          const pdfDoc = await PDFDocument.load(bytes, { updateMetadata: false });
          rows.push({
            path: file.path,
            name: file.name,
            found: foundFields({
              title: pdfDoc.getTitle(),
              author: pdfDoc.getAuthor(),
              subject: pdfDoc.getSubject(),
              keywords: pdfDoc.getKeywords(),
              creator: pdfDoc.getCreator(),
              producer: pdfDoc.getProducer(),
              creationDate: pdfDoc.getCreationDate(),
              modificationDate: pdfDoc.getModificationDate(),
              xmp: pdfDoc.catalog.get(PDFName.of('Metadata')) !== undefined,
            }),
            error: null,
          });
        } catch (err) {
          rows.push({
            path: file.path,
            name: file.name,
            found: [],
            error: describePdfError(err, file.name),
          });
        }
      }
      if (scanToken.current === token) setScan(rows);
    } finally {
      if (scanToken.current === token) setScanning(false);
    }
  }, [items]);

  useEffect(() => {
    scanToken.current += 1;
    setScan(null);
    setScanning(false);
    if (items.length > 0 && items.length <= AUTO_SCAN_LIMIT) void doScan();
  }, [items, doScan]);

  const execute = async () => {
    if (files.isEmpty) return;

    cancelled.current = false;
    setError(null);
    setResult(null);
    setProgress({ running: true, done: 0, total: items.length, currentFile: null });
    markUsed(TOOL_ID);
    const started = Date.now();
    const results: FileResult[] = [];
    const failures: FileFailure[] = [];
    let stopped = false;

    try {
      for (const [index, file] of items.entries()) {
        if (cancelled.current) {
          stopped = true;
          break;
        }
        setProgress({ running: true, done: index, total: items.length, currentFile: file.name });

        try {
          const bytes = await readBytes(file.path);
          const pdfDoc = await PDFDocument.load(bytes, { updateMetadata: false });
          const removed = foundFields({
            title: pdfDoc.getTitle(),
            author: pdfDoc.getAuthor(),
            subject: pdfDoc.getSubject(),
            keywords: pdfDoc.getKeywords(),
            creator: pdfDoc.getCreator(),
            producer: pdfDoc.getProducer(),
            creationDate: pdfDoc.getCreationDate(),
            modificationDate: pdfDoc.getModificationDate(),
            xmp: pdfDoc.catalog.get(PDFName.of('Metadata')) !== undefined,
          });

          pdfDoc.setTitle('');
          pdfDoc.setAuthor('');
          pdfDoc.setSubject('');
          pdfDoc.setKeywords([]);
          pdfDoc.setCreator('');
          pdfDoc.setProducer('');
          // A fixed epoch date leaves no clue about when the file was made or
          // touched, which "now" would not.
          pdfDoc.setCreationDate(new Date(0));
          pdfDoc.setModificationDate(new Date(0));
          // The XMP stream duplicates all of the above in XML, so it goes too.
          pdfDoc.catalog.delete(PDFName.of('Metadata'));

          const out = await pdfDoc.save();
          const saved = await savePdf(out, file.path, spec);
          results.push({ ...saved, sourceSize: file.size, note: saved.note ?? summarize(removed) });
        } catch (err) {
          failures.push({
            path: file.path,
            name: file.name,
            message: describePdfError(err, file.name),
            details: err instanceof Error ? err.message : String(err),
          });
        }
      }

      setProgress({ running: true, done: items.length, total: items.length, currentFile: null });
      setResult({ results, failures, cancelled: stopped, elapsedMs: Date.now() - started });
      if (recentHistory && results.length > 0) {
        addHistory({
          toolId: TOOL_ID,
          toolName: TOOL_NAME,
          inputs: items.map((f) => f.name).slice(0, 20),
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

  const totalFound = scan?.reduce((sum, row) => sum + row.found.length, 0) ?? 0;

  return (
    <ToolShell
      main={
        <>
          <FileDropZone
            files={files}
            label="Drop PDFs here"
            hint="Your originals are untouched — a cleaned copy is written alongside"
            allowFolders
          />

          {!files.isEmpty && (
            <Section
              title="What these files are carrying"
              description={
                scanning
                  ? 'Reading…'
                  : scan
                    ? totalFound === 0
                      ? 'Nothing found — these files are already clean'
                      : `${totalFound} item${totalFound === 1 ? '' : 's'} across ${scan.length} file${scan.length === 1 ? '' : 's'}`
                    : `${items.length} files is a lot to read — scan when you are ready`
              }
              actions={
                <Button size="sm" variant="ghost" icon="ScanText" loading={scanning} onClick={() => void doScan()}>
                  {scan ? 'Scan again' : 'Scan files'}
                </Button>
              }
            >
              {scanning && !scan ? (
                <div className="flex items-center gap-2 py-3 text-[12.5px] text-ink-faint">
                  <Spinner /> Reading metadata…
                </div>
              ) : scan ? (
                <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line">
                  {scan.map((row) => (
                    <li key={row.path} className="bg-panel px-3 py-2">
                      <div className="flex items-center gap-2">
                        <Icon
                          name={row.error ? 'CircleAlert' : row.found.length ? 'ShieldOff' : 'ShieldCheck'}
                          size={14}
                          className={row.error ? 'shrink-0 text-danger' : row.found.length ? 'shrink-0 text-warn' : 'shrink-0 text-success'}
                        />
                        <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink" title={row.path}>
                          {row.name}
                        </span>
                        {!row.error && (
                          <Badge tone={row.found.length ? 'warn' : 'success'}>
                            {row.found.length ? `${row.found.length} to remove` : 'Clean'}
                          </Badge>
                        )}
                      </div>
                      {row.error ? (
                        <p className="mt-1 pl-6 text-[11.5px] text-danger">{row.error}</p>
                      ) : (
                        row.found.length > 0 && (
                          <dl className="mt-1 space-y-0.5 pl-6">
                            {row.found.map((field) => (
                              <div key={field.label} className="flex gap-2">
                                <dt className="w-16 shrink-0 text-[11.5px] text-ink-faint">{field.label}</dt>
                                <dd className="min-w-0 flex-1 truncate text-[11.5px] text-ink-soft selectable">
                                  {field.value}
                                </dd>
                              </div>
                            ))}
                          </dl>
                        )
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="py-2 text-[12.5px] text-ink-faint">
                  Scanning opens every file, which takes a moment for a batch this size. You can strip the metadata
                  without scanning first — the result list still reports what each file was carrying.
                </p>
              )}
            </Section>
          )}

          <Alert tone="info" title="What this removes">
            Title, author, subject, keywords, creator and producer are emptied, both dates are set to 1 January 1970,
            and the XMP metadata stream is deleted. Text, images and annotations inside the pages are left alone.
          </Alert>

          {run.error && <ErrorDisplay error={run.error} onRetry={() => void execute()} />}
          {run.result && <ResultPanel result={run.result} onProcessAgain={run.reset} title="Metadata removed" />}
        </>
      }
      aside={
        <>
          <Section title="Where to save">
            <OutputSettings spec={spec} onChange={update} />
          </Section>

          <ToolActions
            run={run}
            onRun={() => void execute()}
            label="Remove metadata"
            icon="ShieldOff"
            disabled={files.isEmpty}
            disabledReason="Add at least one PDF first."
          />
        </>
      }
    />
  );
}
