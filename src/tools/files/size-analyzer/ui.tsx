import { useEffect, useMemo, useRef, useState } from 'react';
import { openPath, revealInFinder } from '@/core/bridge';
import { formatBytes, shortenPath } from '@/core/format';
import { useToolFiles } from '@/core/useToolFiles';
import { useToolRun } from '@/core/useToolRun';
import { ErrorDisplay, FileDropZone, ToolActions, ToolShell } from '@/components/tool';
import { Badge, Button, Field, Icon, IconButton, Section, Select, Stat } from '@/components/ui';
import {
  barWidth,
  kindSegments,
  share,
  sortEntries,
  type FolderReport,
  type SortDirection,
  type SortKey,
} from './logic';

const TOP_OPTIONS = [25, 50, 100, 250];
/**
 * `analyze_folder` walks the whole tree whatever `topN` is and only truncates
 * the list at the end, so the longest list is asked for once and the choice in
 * the sidebar is applied to it here — changing it never re-measures.
 */
const MAX_TOP = Math.max(...TOP_OPTIONS);

export default function FolderSizeAnalyzer() {
  const files = useToolFiles({ folders: true, kinds: ['folder'], multiple: false, filterName: 'Folder' });
  const run = useToolRun('files/size-analyzer', 'Folder Size Analyzer');

  const [topN, setTopN] = useState(25);
  const [report, setReport] = useState<FolderReport | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('size');
  const [sortDir, setSortDir] = useState<SortDirection>('desc');

  const folder = files.files[0] ?? null;
  const folderPath = folder?.path ?? null;

  const analyze = async (path: string) => {
    const result = await run.executeRaw<FolderReport>({
      command: 'analyze_folder',
      total: 1,
      label: `Measure ${path.split('/').pop() ?? path}`,
      args: { path, topN: MAX_TOP },
    });
    setReport(result);
  };

  // Measuring is the whole point of the tool, so choosing a folder starts it.
  const analyzeRef = useRef<(path: string) => void>(() => undefined);
  analyzeRef.current = (path: string) => void analyze(path);
  useEffect(() => {
    setReport(null);
    if (folderPath) analyzeRef.current(folderPath);
  }, [folderPath]);

  const segments = useMemo(
    () => (report ? kindSegments(report.byKind, report.totalSize) : []),
    [report],
  );
  const rows = useMemo(
    () => (report ? sortEntries(report.entries, sortKey, sortDir) : []),
    [report, sortKey, sortDir],
  );
  const largest = useMemo(() => (report ? report.largest.slice(0, topN) : []), [report, topN]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir(key === 'name' ? 'asc' : 'desc');
    }
  };

  const header = (key: SortKey, label: string, className: string) => (
    <button
      type="button"
      onClick={() => toggleSort(key)}
      className={`flex items-center gap-1 text-[11px] uppercase tracking-wide transition-colors ${
        sortKey === key ? 'text-ink' : 'text-ink-faint hover:text-ink-soft'
      } ${className}`}
    >
      {label}
      {sortKey === key && <Icon name={sortDir === 'asc' ? 'ArrowUp' : 'ArrowDown'} size={11} />}
    </button>
  );

  return (
    <ToolShell
      main={
        <>
          <FileDropZone
            files={files}
            label="Drop a folder to measure"
            hint="Every file inside is counted, however deep it sits."
            allowFolders
            compact={Boolean(report)}
          />

          {run.error && <ErrorDisplay error={run.error} onRetry={() => folderPath && void analyze(folderPath)} />}

          {report && (
            <>
              <Section title="Total" description={shortenPath(report.root, 4)}>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <div className="min-w-0">
                    <p className="text-[11px] uppercase tracking-wide text-ink-faint">Size on disk</p>
                    <p className="mt-0.5 text-[22px] font-semibold leading-tight tracking-tight text-ink">
                      {formatBytes(report.totalSize)}
                    </p>
                  </div>
                  <Stat label="Files" value={report.fileCount.toLocaleString()} />
                  <Stat label="Folders" value={report.dirCount.toLocaleString()} />
                  <Stat
                    label="Average file"
                    value={formatBytes(report.fileCount ? report.totalSize / report.fileCount : 0)}
                  />
                </div>

                {segments.length > 0 && (
                  <div className="mt-4 space-y-2.5">
                    <div className="flex h-3 w-full overflow-hidden rounded-full bg-line">
                      {segments.map((segment) => (
                        <div
                          key={segment.kind}
                          className={segment.className}
                          style={{ width: barWidth(segment.bytes, report.totalSize) }}
                          title={`${segment.label} — ${formatBytes(segment.bytes)}`}
                        />
                      ))}
                    </div>
                    <ul className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
                      {segments.map((segment) => (
                        <li key={segment.kind} className="flex items-center gap-2">
                          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${segment.className}`} />
                          <span className="min-w-0 flex-1 truncate text-[12px] text-ink">{segment.label}</span>
                          <span className="shrink-0 text-[11.5px] text-ink-faint">
                            {formatBytes(segment.bytes)} · {segment.share.toFixed(0)}%
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </Section>

              <Section
                title="Inside this folder"
                description={`${report.entries.length} item${report.entries.length === 1 ? '' : 's'} at the top level`}
              >
                {rows.length === 0 ? (
                  <p className="py-4 text-center text-[12.5px] text-ink-faint">This folder is empty.</p>
                ) : (
                  <div className="overflow-hidden rounded-lg border border-line">
                    <div className="flex items-center gap-3 border-b border-line bg-canvas px-3 py-1.5">
                      {header('name', 'Name', 'min-w-0 flex-1')}
                      <span className="hidden w-40 sm:block" />
                      {header('files', 'Files', 'w-16 justify-end')}
                      {header('size', 'Size', 'w-24 justify-end')}
                      <span className="w-11 text-right text-[11px] uppercase tracking-wide text-ink-faint">%</span>
                      <span className="w-[68px]" />
                    </div>
                    <ul className="divide-y divide-line">
                      {rows.map((entry) => (
                        <li key={entry.path} className="group flex items-center gap-3 bg-panel px-3 py-1.5">
                          <span className="flex min-w-0 flex-1 items-center gap-2">
                            <Icon
                              name={entry.isDir ? 'Folder' : 'File'}
                              size={13}
                              className="shrink-0 text-ink-faint"
                            />
                            <span className="truncate text-[12.5px] text-ink" title={entry.path}>
                              {entry.name}
                            </span>
                          </span>
                          <span className="hidden w-40 sm:block">
                            <span className="block h-1.5 w-full overflow-hidden rounded-full bg-line">
                              <span
                                className="block h-full rounded-full bg-ink/70"
                                style={{ width: barWidth(entry.size, report.totalSize) }}
                              />
                            </span>
                          </span>
                          <span className="w-16 text-right text-[11.5px] text-ink-faint">
                            {entry.fileCount.toLocaleString()}
                          </span>
                          <span className="w-24 text-right text-[12.5px] font-medium text-ink">
                            {formatBytes(entry.size)}
                          </span>
                          <span className="w-11 text-right text-[11.5px] text-ink-faint">
                            {share(entry.size, report.totalSize).toFixed(0)}%
                          </span>
                          <span className="flex w-[68px] shrink-0 items-center justify-end opacity-0 transition-opacity group-hover:opacity-100">
                            <IconButton
                              icon="ExternalLink"
                              label="Open"
                              size="sm"
                              onClick={() => void openPath(entry.path)}
                            />
                            <IconButton
                              icon="FolderOpen"
                              label="Reveal in Finder"
                              size="sm"
                              onClick={() => void revealInFinder(entry.path)}
                            />
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </Section>

              <Section
                title="Largest files"
                description={`The ${largest.length} biggest files anywhere inside`}
              >
                {largest.length === 0 ? (
                  <p className="py-4 text-center text-[12.5px] text-ink-faint">No files found.</p>
                ) : (
                  <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line">
                    {largest.map((entry) => (
                      <li key={entry.path} className="group flex items-center gap-2.5 bg-panel px-3 py-1.5">
                        <Icon name="File" size={13} className="shrink-0 text-ink-faint" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12.5px] text-ink" title={entry.path}>
                            {entry.name}
                          </span>
                          <span className="block truncate text-[11px] text-ink-faint">
                            {shortenPath(entry.path.split('/').slice(0, -1).join('/'), 3)}
                          </span>
                        </span>
                        <Badge>{share(entry.size, report.totalSize).toFixed(1)}%</Badge>
                        <span className="shrink-0 text-[12.5px] font-medium text-ink">{formatBytes(entry.size)}</span>
                        <span className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100">
                          <IconButton
                            icon="ExternalLink"
                            label="Open"
                            size="sm"
                            onClick={() => void openPath(entry.path)}
                          />
                          <IconButton
                            icon="FolderOpen"
                            label="Reveal in Finder"
                            size="sm"
                            onClick={() => void revealInFinder(entry.path)}
                          />
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>
            </>
          )}
        </>
      }
      aside={
        <>
          <Section title="Options">
            <Field label="Largest files to list" hint="A longer list takes no extra time to gather.">
              <Select
                value={String(topN)}
                onChange={(e) => setTopN(Number(e.target.value))}
                options={TOP_OPTIONS.map((n) => ({ value: String(n), label: `${n} files` }))}
              />
            </Field>
          </Section>

          <ToolActions
            run={run}
            onRun={() => folderPath && void analyze(folderPath)}
            label={report ? 'Measure again' : 'Measure folder'}
            icon="Search"
            disabled={!folderPath}
            disabledReason="Choose a folder to measure."
          >
            {folderPath && (
              <Button variant="ghost" icon="FolderOpen" onClick={() => void revealInFinder(folderPath)}>
                Reveal
              </Button>
            )}
          </ToolActions>

          <Section title="Reading this">
            <p className="text-[12px] leading-[1.55] text-ink-faint">
              Sizes are the real bytes each file occupies, added up through every subfolder. The bar at the top splits
              the total by file type, the table lists what sits directly inside, and the last section names the
              individual files worth looking at first. Nothing is moved or deleted — this only measures.
            </p>
          </Section>
        </>
      }
    />
  );
}
