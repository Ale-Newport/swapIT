import { open } from '@tauri-apps/plugin-dialog';
import { useEffect, useMemo, useState } from 'react';
import { asToolboxError, call } from '@/core/bridge';
import { formatBytes, shortenPath } from '@/core/format';
import type { ToolboxError } from '@/core/types';
import { useToolFiles } from '@/core/useToolFiles';
import { useToolRun } from '@/core/useToolRun';
import { ErrorDisplay, FileDropZone, ResultPanel, ToolActions, ToolShell } from '@/components/tool';
import { Alert, Button, Icon, Section, Spinner, Stat } from '@/components/ui';
import {
  archiveTotals,
  defaultExtractFolderName,
  supportedArchiveKind,
  topLevelNames,
  type ArchiveEntry,
} from './logic';

/** Long listings are truncated in the DOM — the totals above still cover everything. */
const VISIBLE_ROWS = 300;

export default function ExtractArchive() {
  const files = useToolFiles({
    extensions: ['zip', 'tar', 'gz', 'tgz'],
    multiple: false,
    filterName: 'Archives',
  });
  const run = useToolRun('files/unzip', 'Extract Archive');

  const [entries, setEntries] = useState<ArchiveEntry[] | null>(null);
  const [listing, setListing] = useState(false);
  const [listError, setListError] = useState<ToolboxError | null>(null);
  const [destination, setDestination] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [listKey, setListKey] = useState(0);

  const archive = files.files[0] ?? null;
  const kind = archive ? supportedArchiveKind(archive.name) : null;

  useEffect(() => {
    setShowAll(false);
    if (!archive || !kind) {
      setEntries(null);
      setListError(null);
      return;
    }
    let stale = false;
    setListing(true);
    setListError(null);
    call<ArchiveEntry[]>('list_archive', { input: archive.path })
      .then((found) => {
        if (!stale) setEntries(found);
      })
      .catch((err) => {
        if (stale) return;
        setEntries(null);
        setListError(asToolboxError(err));
      })
      .finally(() => {
        if (!stale) setListing(false);
      });
    return () => {
      stale = true;
    };
  }, [archive, kind, listKey]);

  const totals = useMemo(() => (entries ? archiveTotals(entries) : null), [entries]);
  const roots = useMemo(() => (entries ? topLevelNames(entries) : []), [entries]);
  const visible = entries ? (showAll ? entries : entries.slice(0, VISIBLE_ROWS)) : [];

  const pickDestination = async () => {
    const picked = await open({ directory: true, multiple: false });
    if (typeof picked === 'string') setDestination(picked);
  };

  const execute = () => {
    if (!archive) return;
    void run.execute({
      command: 'extract_archive',
      total: totals?.files || 1,
      inputs: [archive.path],
      label: `Extract ${archive.name}`,
      args: { input: archive.path, destination },
    });
  };

  const defaultTarget = archive
    ? `${archive.path.split('/').slice(0, -1).join('/')}/${defaultExtractFolderName(archive.name)}`
    : null;
  const target = destination ?? defaultTarget;

  return (
    <ToolShell
      main={
        <>
          <FileDropZone
            files={files}
            label="Drop an archive here"
            hint="ZIP, TAR, TAR.GZ or TGZ — the contents are listed before anything is written"
          />

          {archive && !kind && (
            <Alert tone="warn" title="This is not an archive Toolbox can open.">
              A bare <span className="font-mono">.gz</span> file is a single compressed stream rather than a
              container of files. Toolbox extracts <span className="font-mono">.zip</span>,{' '}
              <span className="font-mono">.tar</span>, <span className="font-mono">.tar.gz</span> and{' '}
              <span className="font-mono">.tgz</span>.
            </Alert>
          )}

          {listError && <ErrorDisplay error={listError} onRetry={() => setListKey((key) => key + 1)} />}

          {archive && kind && (
            <Section
              title="Contents"
              description={
                totals
                  ? `${totals.files.toLocaleString()} file${totals.files === 1 ? '' : 's'}${totals.folders ? ` · ${totals.folders.toLocaleString()} folder${totals.folders === 1 ? '' : 's'}` : ''}`
                  : undefined
              }
              actions={
                <Button
                  size="sm"
                  variant="ghost"
                  icon="RefreshCw"
                  loading={listing}
                  onClick={() => setListKey((key) => key + 1)}
                >
                  Reload
                </Button>
              }
            >
              {listing && !entries ? (
                <div className="flex items-center gap-2 py-2 text-[12.5px] text-ink-faint">
                  <Spinner /> Reading the archive…
                </div>
              ) : totals && entries ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <Stat label="Files" value={totals.files.toLocaleString()} />
                    <Stat label="Unpacked size" value={formatBytes(totals.size)} />
                    <Stat
                      label="Stored size"
                      value={totals.reportsCompression ? formatBytes(totals.compressed) : '—'}
                      hint={totals.reportsCompression ? undefined : 'Not reported for TAR'}
                    />
                    <Stat
                      label="Compression"
                      value={totals.ratio === null ? '—' : `${(totals.ratio * 100).toFixed(1)}%`}
                      hint={totals.ratio === null ? 'TAR stores files as-is' : 'Space saved'}
                    />
                  </div>

                  {roots.length > 1 && (
                    <Alert tone="info" title={`This archive has ${roots.length} top-level items.`}>
                      They all land inside the destination folder, so nothing is scattered next to it.
                    </Alert>
                  )}

                  {entries.length === 0 ? (
                    <Alert tone="warn" title="This archive is empty.">
                      There is nothing inside it to extract.
                    </Alert>
                  ) : (
                    <>
                      <div className="overflow-hidden rounded-lg border border-line">
                        <div className="flex items-center gap-3 border-b border-line bg-canvas px-3 py-1.5 text-[11px] uppercase tracking-wide text-ink-faint">
                          <span className="min-w-0 flex-1">Name</span>
                          <span className="w-20 shrink-0 text-right">Size</span>
                          {totals.reportsCompression && <span className="w-20 shrink-0 text-right">Stored</span>}
                        </div>
                        <ul className="max-h-80 divide-y divide-line overflow-y-auto">
                          {visible.map((item, index) => (
                            <li
                              key={`${item.name}-${index}`}
                              className="flex items-center gap-3 bg-panel px-3 py-1.5"
                            >
                              <Icon
                                name={item.isDir ? 'Folder' : 'File'}
                                size={13}
                                className="shrink-0 text-ink-faint"
                              />
                              <span
                                className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-ink"
                                title={item.name}
                              >
                                {item.name}
                              </span>
                              <span className="w-20 shrink-0 text-right text-[11.5px] text-ink-faint">
                                {item.isDir ? '—' : formatBytes(item.size)}
                              </span>
                              {totals.reportsCompression && (
                                <span className="w-20 shrink-0 text-right text-[11.5px] text-ink-faint">
                                  {item.isDir ? '—' : formatBytes(item.compressed)}
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                      {!showAll && entries.length > VISIBLE_ROWS && (
                        <Button size="sm" variant="ghost" onClick={() => setShowAll(true)}>
                          Show all {entries.length.toLocaleString()} entries
                        </Button>
                      )}
                    </>
                  )}
                </div>
              ) : null}
            </Section>
          )}

          {run.error && <ErrorDisplay error={run.error} onRetry={execute} />}
          {run.result && <ResultPanel result={run.result} onProcessAgain={run.reset} title="Extracted" />}
        </>
      }
      aside={
        <>
          <Section title="Extract to">
            <div className="space-y-2.5">
              <div className="flex h-8.5 items-center gap-2 rounded-lg border border-line bg-canvas px-2.5">
                <Icon name="Folder" size={13} className="shrink-0 text-ink-faint" />
                <span className="truncate text-[12.5px] text-ink-soft" title={target ?? ''}>
                  {target ? shortenPath(target, 3) : 'Choose an archive first'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" icon="FolderOutput" onClick={() => void pickDestination()}>
                  Choose folder
                </Button>
                {destination && (
                  <Button size="sm" variant="ghost" icon="RotateCcw" onClick={() => setDestination(null)}>
                    Use default
                  </Button>
                )}
              </div>
              <p className="text-[11.5px] leading-[1.5] text-ink-faint">
                By default a new folder named after the archive is created next to it. If that name is taken, a
                numbered folder is used instead — an existing folder is never merged into silently.
              </p>
            </div>
          </Section>

          <Section title="Safety">
            <div className="space-y-2 text-[11.5px] leading-[1.5] text-ink-faint">
              <p>
                Entries with an unsafe path — anything containing <span className="font-mono">..</span> or an
                absolute path that would write outside the destination — are rejected automatically and listed
                as failures. Everything else still extracts.
              </p>
              <p>
                Password-protected ZIP files cannot be opened: Toolbox has no way to decrypt them and will say
                so rather than writing damaged files.
              </p>
              <p>A file that already exists in the destination is kept — the new one gets a numbered name.</p>
            </div>
          </Section>

          <ToolActions
            run={run}
            onRun={execute}
            label="Extract"
            icon="FolderOpen"
            disabled={!archive || !kind || entries?.length === 0}
            disabledReason={
              !archive
                ? 'Add a ZIP, TAR or TAR.GZ file first.'
                : !kind
                  ? 'This file format cannot be extracted.'
                  : 'This archive is empty.'
            }
          />
        </>
      }
    />
  );
}
