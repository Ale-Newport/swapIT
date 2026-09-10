import clsx from 'clsx';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { revealInFinder } from '@/core/bridge';
import { formatBytes } from '@/core/format';
import { useToolFiles } from '@/core/useToolFiles';
import { useToolRun } from '@/core/useToolRun';
import { ErrorDisplay, FileDropZone, ToolActions, ToolShell } from '@/components/tool';
import { Alert, Badge, Card, CopyButton, IconButton, Section, Spinner, Stat } from '@/components/ui';
import { describePageSize, formatReport, propertyRows, summarise, type PdfInfo } from './logic';

const TOOL_ID = 'pdf/info';
const TOOL_NAME = 'PDF Inspector';

/** Above this, reading every document on drop would stall the UI unasked. */
const AUTO_LIMIT = 20;

export default function PdfInspector() {
  const files = useToolFiles({ kinds: ['pdf'], extensions: ['pdf'], filterName: 'PDF files' });
  const run = useToolRun(TOOL_ID, TOOL_NAME);

  const [infos, setInfos] = useState<PdfInfo[] | null>(null);
  const [selected, setSelected] = useState(0);
  const lastKey = useRef('');

  const paths = files.paths;
  // `run` is rebuilt on every render; only the callbacks inside it are stable.
  const executeRaw = run.executeRaw;

  const inspect = useCallback(
    async (targets: string[]) => {
      if (targets.length === 0) return;
      const result = await executeRaw<PdfInfo[]>({
        command: 'pdf_info',
        total: targets.length,
        inputs: targets,
        label: `Inspect ${targets.length} PDF${targets.length === 1 ? '' : 's'}`,
        args: { inputs: targets },
      });
      if (result) {
        setInfos(result);
        setSelected(0);
      }
    },
    [executeRaw],
  );

  useEffect(() => {
    const key = paths.join('|');
    if (key === lastKey.current) return;
    lastKey.current = key;
    setInfos(null);
    if (paths.length === 0 || paths.length > AUTO_LIMIT) return;
    void inspect(paths);
  }, [paths, inspect]);

  const totals = useMemo(() => summarise(infos ?? []), [infos]);
  const current = infos?.[Math.min(selected, infos.length - 1)] ?? null;
  const single = infos?.length === 1;

  return (
    <ToolShell
      main={
        <>
          <FileDropZone
            files={files}
            label="Drop PDFs here"
            hint="Page count, dimensions, security and document properties"
            accept="Folders are expanded automatically"
            allowFolders
          />

          {run.running && !infos && (
            <div className="flex items-center gap-2 py-6 text-[12.5px] text-ink-faint">
              <Spinner /> Reading {paths.length} document{paths.length === 1 ? '' : 's'}…
            </div>
          )}

          {paths.length > AUTO_LIMIT && !infos && !run.running && !run.error && (
            <Alert tone="info" title={`${paths.length} documents are ready to read.`}>
              That is more than Toolbox reads automatically. Press Inspect to go through them.
            </Alert>
          )}

          {run.error && <ErrorDisplay error={run.error} onRetry={() => void inspect(paths)} />}

          {infos && infos.length > 0 && (
            <Card className="flex flex-wrap items-center gap-x-8 gap-y-4 bg-canvas">
              <div className="min-w-0">
                <p className="text-[38px] font-semibold leading-none tracking-tight text-ink selectable">
                  {totals.pages.toLocaleString()}
                </p>
                <p className="mt-1.5 truncate text-[12.5px] text-ink-faint">
                  {single
                    ? `pages in ${infos[0].name}`
                    : `pages across ${totals.documents} documents`}
                </p>
              </div>
              <div className="ml-auto flex flex-wrap items-start gap-x-8 gap-y-3">
                {!single && <Stat label="Documents" value={totals.documents.toLocaleString()} />}
                <Stat label="Total size" value={formatBytes(totals.size)} />
                {single && infos[0].pdfVersion && <Stat label="PDF version" value={infos[0].pdfVersion} />}
                {totals.encrypted > 0 && (
                  <Stat
                    label="Password protected"
                    value={`${totals.encrypted} of ${totals.documents}`}
                    hint="Page counts are unavailable while locked"
                  />
                )}
              </div>
            </Card>
          )}

          {infos && infos.length > 0 && (
            <Section
              title="Documents"
              description={
                totals.unreadable > 0
                  ? `${totals.unreadable} document${totals.unreadable === 1 ? '' : 's'} could not be read — unlock them first`
                  : `Read with pdfinfo · ${formatBytes(totals.size)} in total`
              }
              actions={<CopyButton value={() => formatReport(infos)} label="Copy report" />}
            >
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] border-collapse text-left">
                  <thead>
                    <tr className="border-b border-line text-[11px] uppercase tracking-wide text-ink-faint">
                      <th className="px-2 py-1.5 font-medium">Document</th>
                      <th className="px-2 py-1.5 text-right font-medium">Pages</th>
                      <th className="px-2 py-1.5 text-right font-medium">Size</th>
                      <th className="px-2 py-1.5 font-medium">Page size</th>
                      <th className="px-2 py-1.5 font-medium">PDF</th>
                      <th className="px-2 py-1.5 font-medium">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {infos.map((info, index) => (
                      <tr
                        key={info.path}
                        tabIndex={0}
                        aria-selected={index === selected}
                        onClick={() => setSelected(index)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setSelected(index);
                          }
                        }}
                        className={clsx(
                          'cursor-pointer border-b border-line text-[12.5px] last:border-0',
                          index === selected ? 'bg-accent-soft' : 'hover:bg-canvas',
                        )}
                      >
                        <td className="max-w-[16rem] truncate px-2 py-2 text-ink" title={info.path}>
                          {info.name}
                        </td>
                        <td className="px-2 py-2 text-right font-medium text-ink">
                          {info.pages > 0 ? info.pages.toLocaleString() : '—'}
                        </td>
                        <td className="px-2 py-2 text-right text-ink-soft">{formatBytes(info.size)}</td>
                        <td className="px-2 py-2 text-ink-soft">
                          {describePageSize(info.pageSize)?.split(' · ')[0] ?? '—'}
                        </td>
                        <td className="px-2 py-2 text-ink-soft">{info.pdfVersion ?? '—'}</td>
                        <td className="px-2 py-2">
                          <span className="flex flex-wrap gap-1">
                            {info.encrypted && <Badge tone="warn">Locked</Badge>}
                            {info.tagged && <Badge tone="neutral">Tagged</Badge>}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}
        </>
      }
      aside={
        <>
          {current ? (
            <Section
              title="Document properties"
              description={current.name}
              actions={
                <>
                  <CopyButton value={() => formatReport([current])} label="Copy" />
                  <IconButton
                    icon="FolderOpen"
                    label="Reveal in Finder"
                    size="sm"
                    onClick={() => void revealInFinder(current.path)}
                  />
                </>
              }
            >
              <dl className="divide-y divide-line">
                {propertyRows(current).map((row) => (
                  <div key={row.label} className="flex gap-3 py-1.5">
                    <dt className="w-24 shrink-0 text-[11.5px] text-ink-faint">{row.label}</dt>
                    <dd className="min-w-0 flex-1 break-words text-[12.5px] text-ink selectable">{row.value}</dd>
                  </div>
                ))}
              </dl>
              {current.encrypted && (
                <Alert tone="warn" className="mt-3">
                  This document is password protected, so its page count and properties are hidden.
                  Remove the password first to inspect it fully.
                </Alert>
              )}
            </Section>
          ) : (
            <Section title="Document properties">
              <p className="text-[12.5px] text-ink-faint">
                Add a PDF to see its page count, page dimensions, PDF version, security state and every
                property stored inside it.
              </p>
            </Section>
          )}

          <ToolActions
            run={run}
            onRun={() => void inspect(paths)}
            label={infos ? 'Read again' : `Inspect${paths.length > 1 ? ` ${paths.length} PDFs` : ''}`}
            icon="FileSearch"
            disabled={files.isEmpty}
            disabledReason="Add at least one PDF first."
          />
        </>
      }
    />
  );
}
