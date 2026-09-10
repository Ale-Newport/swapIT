import { PDFDocument } from 'pdf-lib';
import { useEffect, useMemo, useRef, useState } from 'react';
import { asToolboxError, call, planOutput } from '@/core/bridge';
import { formatBytes } from '@/core/format';
import { readBytes, saveBytes } from '@/core/save';
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
import {
  Alert,
  Badge,
  Button,
  CopyButton,
  Field,
  Input,
  Section,
  Spinner,
  Stat,
} from '@/components/ui';
import {
  EDITABLE_FIELDS,
  EMPTY_DRAFT,
  describePdfError,
  draftFromInfo,
  fieldsToWrite,
  formatReport,
  joinKeywords,
  splitKeywords,
  type Draft,
  type PdfInfo,
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
 * Reading uses the backend's `pdf_info`; writing happens here with pdf-lib. Both
 * are driven from local state, so this adapter keeps the standard action row —
 * same button, same progress, same ⌘⇧C shortcut — and gives Cancel a real
 * effect through the `cancelled` flag the write loop checks.
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

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex gap-3 py-1">
      <span className="w-20 shrink-0 text-[11.5px] text-ink-faint">{label}</span>
      <span className="min-w-0 flex-1 break-words text-[12.5px] text-ink selectable">
        {value?.trim() ? value : <span className="text-ink-faint">Not set</span>}
      </span>
    </div>
  );
}

export default function PdfMetadata() {
  const files = useToolFiles({ kinds: ['pdf'], extensions: ['pdf'], filterName: 'PDF files' });
  const { run, setProgress, setResult, setError, cancelled } = useLocalRun();
  const { spec, update } = useOutputSpec({ suffix: '-tagged' });

  const [infos, setInfos] = useState<PdfInfo[] | null>(null);
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<ToolboxError | null>(null);
  const [selected, setSelected] = useState(0);
  const [draft, setDraft] = useState<Draft>({ ...EMPTY_DRAFT });
  // A ref, not state: the mirroring effect below reads it without depending on
  // it, so handing the form back (Clear) cannot re-run the effect and refill it.
  const touched = useRef(false);

  const paths = files.paths;

  useEffect(() => {
    if (paths.length === 0) {
      setInfos(null);
      setReadError(null);
      return;
    }
    let stale = false;
    setReading(true);
    call<PdfInfo[]>('pdf_info', { inputs: paths })
      .then((result) => {
        if (stale) return;
        setInfos(result);
        setReadError(null);
        setSelected(0);
      })
      .catch((err) => {
        if (stale) return;
        setInfos(null);
        setReadError(asToolboxError(err));
      })
      .finally(() => {
        if (!stale) setReading(false);
      });
    return () => {
      stale = true;
    };
  }, [paths]);

  const current = infos?.[Math.min(selected, infos.length - 1)];

  // Freshly read files seed an untouched form, so editing starts from the truth.
  useEffect(() => {
    if (touched.current) return;
    setDraft(draftFromInfo(infos?.length === 1 ? infos[0] : undefined));
  }, [infos]);

  const pending = useMemo(() => fieldsToWrite(draft), [draft]);
  const hasDraft = useMemo(() => Object.values(draft).some((value) => value !== ''), [draft]);
  const encryptedCount = infos?.filter((i) => i.encrypted).length ?? 0;

  const setField = (key: keyof Draft, value: string) => {
    touched.current = true;
    setDraft((d) => ({ ...d, [key]: value }));
  };

  const execute = async () => {
    if (files.isEmpty || pending.length === 0) return;

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
          // `updateMetadata: false` so pdf-lib does not quietly claim authorship
          // of fields the user did not ask to change.
          const pdfDoc = await PDFDocument.load(bytes, { updateMetadata: false });
          for (const { key, value } of pending) {
            switch (key) {
              case 'title':
                pdfDoc.setTitle(value);
                break;
              case 'author':
                pdfDoc.setAuthor(value);
                break;
              case 'subject':
                pdfDoc.setSubject(value);
                break;
              case 'keywords':
                // pdf-lib joins an array with spaces, which would eat the commas
                // readers expect, so hand it one normalised string instead.
                pdfDoc.setKeywords([joinKeywords(splitKeywords(value))]);
                break;
              case 'creator':
                pdfDoc.setCreator(value);
                break;
              case 'producer':
                pdfDoc.setProducer(value);
                break;
            }
          }
          pdfDoc.setModificationDate(new Date());

          const out = await pdfDoc.save();
          const saved = await savePdf(out, file.path, spec);
          results.push(
            saved.disposition === 'skipped'
              ? saved
              : {
                  ...saved,
                  sourceSize: file.size,
                  note: `${pending.length} field${pending.length === 1 ? '' : 's'} written`,
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
            hint="Properties are read as soon as the files land"
            allowFolders
          />

          {readError && <ErrorDisplay error={readError} />}

          {reading && (
            <div className="flex items-center gap-2 py-4 text-[12.5px] text-ink-faint">
              <Spinner /> Reading document properties…
            </div>
          )}

          {current && !reading && (
            <Section
              title={current.name}
              description="Document properties"
              actions={
                <CopyButton value={() => formatReport(infos ?? [])} label="Copy report" />
              }
            >
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Stat label="Pages" value={current.pages || '—'} />
                <Stat label="Size" value={formatBytes(current.size)} />
                <Stat label="Page size" value={current.pageSize ?? '—'} />
                <Stat label="PDF version" value={current.pdfVersion ?? '—'} />
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Badge tone={current.encrypted ? 'warn' : 'neutral'}>
                  {current.encrypted ? 'Password-protected' : 'Not encrypted'}
                </Badge>
                <Badge tone={current.tagged ? 'success' : 'neutral'}>
                  {current.tagged ? 'Tagged for accessibility' : 'Not tagged'}
                </Badge>
                {current.creationDate && <Badge>Created {current.creationDate}</Badge>}
              </div>
              <div className="mt-3 divide-y divide-line border-t border-line pt-1">
                <Row label="Title" value={current.title} />
                <Row label="Author" value={current.author} />
                <Row label="Subject" value={current.subject} />
                <Row label="Keywords" value={current.keywords} />
                <Row label="Creator" value={current.creator} />
                <Row label="Producer" value={current.producer} />
              </div>
            </Section>
          )}

          {infos && infos.length > 1 && !reading && (
            <Section title={`All ${infos.length} files`} description="Click a row to inspect it above">
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-ink-faint">
                      <th className="py-1.5 pr-3 font-medium">File</th>
                      <th className="py-1.5 pr-3 text-right font-medium">Pages</th>
                      <th className="py-1.5 pr-3 font-medium">Title</th>
                      <th className="py-1.5 pr-3 font-medium">Author</th>
                      <th className="py-1.5 pr-3 font-medium">Producer</th>
                      <th className="py-1.5 font-medium">Version</th>
                    </tr>
                  </thead>
                  <tbody>
                    {infos.map((info, index) => (
                      <tr
                        key={info.path}
                        onClick={() => setSelected(index)}
                        className={`cursor-pointer border-b border-line last:border-0 ${
                          index === selected ? 'bg-accent-soft' : 'hover:bg-canvas'
                        }`}
                      >
                        <td className="max-w-[220px] truncate py-1.5 pr-3 text-ink" title={info.path}>
                          {info.encrypted && <span className="mr-1 text-warn">●</span>}
                          {info.name}
                        </td>
                        <td className="py-1.5 pr-3 text-right text-ink-soft">{info.pages || '—'}</td>
                        <td className="max-w-[180px] truncate py-1.5 pr-3 text-ink-soft">{info.title ?? '—'}</td>
                        <td className="max-w-[140px] truncate py-1.5 pr-3 text-ink-soft">{info.author ?? '—'}</td>
                        <td className="max-w-[160px] truncate py-1.5 pr-3 text-ink-soft">{info.producer ?? '—'}</td>
                        <td className="py-1.5 text-ink-soft">{info.pdfVersion ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          {encryptedCount > 0 && (
            <Alert tone="warn" title={`${encryptedCount} file${encryptedCount === 1 ? ' is' : 's are'} password-protected`}>
              Properties can still be read, but they cannot be rewritten until the password is removed with the
              Decrypt PDF tool.
            </Alert>
          )}

          {run.error && <ErrorDisplay error={run.error} onRetry={() => void execute()} />}
          {run.result && <ResultPanel result={run.result} onProcessAgain={run.reset} title="Metadata written" />}
        </>
      }
      aside={
        <>
          <Section
            title="Edit properties"
            description="Blank fields are left exactly as they are"
            actions={
              current ? (
                <Button
                  size="sm"
                  variant="ghost"
                  icon="ArrowDown"
                  onClick={() => {
                    touched.current = true;
                    setDraft(draftFromInfo(current));
                  }}
                >
                  Fill from file
                </Button>
              ) : undefined
            }
          >
            <div className="space-y-3">
              {EDITABLE_FIELDS.map((field) => (
                <Field key={field.key} label={field.label} hint={field.hint}>
                  <Input
                    value={draft[field.key]}
                    placeholder="Leave blank to keep"
                    onChange={(e) => setField(field.key, e.target.value)}
                  />
                </Field>
              ))}
              {hasDraft && (
                <Button
                  size="sm"
                  variant="ghost"
                  icon="RotateCcw"
                  onClick={() => {
                    // Empty the form and hand it back to the mirror, which only
                    // seeds again when a new set of files is read.
                    touched.current = false;
                    setDraft({ ...EMPTY_DRAFT });
                  }}
                >
                  Clear the form
                </Button>
              )}
            </div>
          </Section>

          <Section title="Where to save">
            <OutputSettings spec={spec} onChange={update} />
          </Section>

          <ToolActions
            run={run}
            onRun={() => void execute()}
            label={
              pending.length === 0
                ? 'Write properties'
                : `Write ${pending.length} field${pending.length === 1 ? '' : 's'}`
            }
            icon="Info"
            disabled={files.isEmpty || pending.length === 0}
            disabledReason={
              files.isEmpty ? 'Add at least one PDF first.' : 'Fill in at least one property to write.'
            }
          />
        </>
      }
    />
  );
}
