import { open } from '@tauri-apps/plugin-dialog';
import { useEffect, useMemo, useState } from 'react';
import { asToolboxError, expandPaths } from '@/core/bridge';
import { formatBytes, shortenPath } from '@/core/format';
import type { FileInfo } from '@/core/types';
import { useToolFiles } from '@/core/useToolFiles';
import { useToolRun } from '@/core/useToolRun';
import { ErrorDisplay, FileDropZone, ResultPanel, ToolActions, ToolShell } from '@/components/tool';
import { Alert, Badge, Button, Icon, Section, Segmented, Spinner, Stat } from '@/components/ui';
import { defaultFlattenDestination, planFlatten } from './logic';

/** A ceiling so a stray pick of the home folder cannot hang the preview. */
const SCAN_LIMIT = 100_000;

export default function FlattenFolder() {
  const files = useToolFiles({ folders: true, kinds: ['folder'], multiple: false });
  const run = useToolRun('files/flatten', 'Flatten Folder');

  const [copyFiles, setCopyFiles] = useState(true);
  const [destination, setDestination] = useState<string | null>(null);
  const [scanned, setScanned] = useState<FileInfo[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const source = files.files[0]?.path ?? null;
  const target = destination ?? (source ? defaultFlattenDestination(source) : null);

  useEffect(() => {
    // Drop the previous folder's listing first: `plan` is derived from it, and
    // `target` has already moved on, so keeping it would show the old counts and
    // clashes under the new destination's heading.
    setScanned(null);
    setScanError(null);
    if (!source) return;
    let stale = false;
    setScanning(true);
    expandPaths([source], { recursive: true, includeHidden: true, limit: SCAN_LIMIT })
      .then((found) => {
        if (!stale) setScanned(found);
      })
      .catch((err) => {
        if (stale) return;
        setScanned(null);
        setScanError(asToolboxError(err).message);
      })
      .finally(() => {
        if (!stale) setScanning(false);
      });
    return () => {
      stale = true;
    };
  }, [source, refreshKey]);

  const plan = useMemo(
    () => (scanned && target ? planFlatten(scanned, target, SCAN_LIMIT) : null),
    [scanned, target],
  );

  const pickDestination = async () => {
    const picked = await open({ directory: true, multiple: false });
    if (typeof picked === 'string') setDestination(picked);
  };

  const execute = async () => {
    if (!source) return;
    await run.execute({
      command: 'flatten_folder',
      total: plan?.fileCount || 1,
      inputs: [source],
      label: `${copyFiles ? 'Copy' : 'Move'} ${plan?.fileCount ?? 0} files into one folder`,
      args: { source, destination, copyFiles },
    });
    setRefreshKey((key) => key + 1);
  };

  return (
    <ToolShell
      main={
        <>
          <FileDropZone
            files={files}
            label="Drop a folder here"
            hint="Every file inside it, at any depth, ends up in a single folder"
            allowFolders
          />

          {source && (
            <Section
              title="What will happen"
              description={target ? `Into ${shortenPath(target, 3)}` : undefined}
              actions={
                <Button
                  size="sm"
                  variant="ghost"
                  icon="RefreshCw"
                  loading={scanning}
                  onClick={() => setRefreshKey((key) => key + 1)}
                >
                  Rescan
                </Button>
              }
            >
              {scanning && !plan ? (
                <div className="flex items-center gap-2 py-2 text-[12.5px] text-ink-faint">
                  <Spinner /> Counting files…
                </div>
              ) : scanError ? (
                <Alert tone="danger" title="The folder could not be read.">
                  {scanError}
                </Alert>
              ) : plan ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <Stat
                      label={copyFiles ? 'Files to copy' : 'Files to move'}
                      value={`${plan.truncated ? `${SCAN_LIMIT.toLocaleString()}+` : plan.fileCount.toLocaleString()}`}
                      hint={plan.truncated ? 'Scan limit reached' : undefined}
                    />
                    <Stat label="Total size" value={formatBytes(plan.totalSize)} />
                    <Stat
                      label="Name clashes"
                      value={plan.renamedCount.toLocaleString()}
                      hint={plan.renamedCount ? 'Suffixed, not replaced' : 'None'}
                    />
                    <Stat
                      label="Originals"
                      value={copyFiles ? 'Left in place' : 'Relocated'}
                      hint={copyFiles ? 'Copy mode' : 'Move mode'}
                    />
                  </div>

                  {plan.skippedInDestination > 0 && (
                    <p className="text-[11.5px] text-ink-faint">
                      {plan.skippedInDestination.toLocaleString()} file
                      {plan.skippedInDestination === 1 ? ' is' : 's are'} already in the destination folder and
                      will be left alone.
                    </p>
                  )}

                  {plan.duplicateNames.length > 0 && (
                    <Alert
                      tone="warn"
                      title={`${plan.renamedCount.toLocaleString()} file${plan.renamedCount === 1 ? '' : 's'} share a name with another file`}
                    >
                      <p>
                        Nothing is overwritten. The second file called{' '}
                        <span className="font-mono">{plan.duplicateNames[0].name}</span> is saved as{' '}
                        <span className="font-mono">
                          {plan.duplicateNames[0].name.replace(/(\.[^.]+)?$/, '_1$1')}
                        </span>
                        , the third as{' '}
                        <span className="font-mono">
                          {plan.duplicateNames[0].name.replace(/(\.[^.]+)?$/, '_2$1')}
                        </span>
                        , and so on.
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {plan.duplicateNames.slice(0, 6).map((d) => (
                          <Badge key={d.name}>
                            {d.name} ×{d.count}
                          </Badge>
                        ))}
                        {plan.duplicateNames.length > 6 && (
                          <Badge>+{plan.duplicateNames.length - 6} more names</Badge>
                        )}
                      </div>
                    </Alert>
                  )}

                  {plan.fileCount === 0 && (
                    <Alert tone="info" title="Nothing to flatten">
                      This folder contains no files outside the destination.
                    </Alert>
                  )}
                </div>
              ) : null}
            </Section>
          )}

          {run.error && <ErrorDisplay error={run.error} onRetry={() => void execute()} />}
          {run.result && <ResultPanel result={run.result} onProcessAgain={run.reset} title="Flattened" />}
        </>
      }
      aside={
        <>
          <Section title="Copy or move">
            <div className="space-y-2.5">
              <Segmented
                value={copyFiles ? 'copy' : 'move'}
                onChange={(value) => setCopyFiles(value === 'copy')}
                options={[
                  { value: 'copy', label: 'Copy', icon: 'Copy' },
                  { value: 'move', label: 'Move', icon: 'FolderInput' },
                ]}
                className="w-full"
              />
              <p className="text-[11.5px] leading-[1.5] text-ink-faint">
                {copyFiles
                  ? 'Copies are written to the destination and the originals stay exactly where they are — this doubles the space used.'
                  : 'Files are moved out of their subfolders. The now-empty subfolders are left behind for you to delete.'}
              </p>
            </div>
          </Section>

          <Section title="Destination">
            <div className="space-y-2.5">
              <div className="flex h-8.5 items-center gap-2 rounded-lg border border-line bg-canvas px-2.5">
                <Icon name="Folder" size={13} className="shrink-0 text-ink-faint" />
                <span className="truncate text-[12.5px] text-ink-soft" title={target ?? ''}>
                  {target ? shortenPath(target, 3) : 'Choose a folder first'}
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
                Without a choice of your own, a <span className="font-mono">_flattened</span> subfolder is created
                inside the source folder. The destination is created if it does not exist yet.
              </p>
            </div>
          </Section>

          <ToolActions
            run={run}
            onRun={() => void execute()}
            label={copyFiles ? 'Copy files into one folder' : 'Move files into one folder'}
            icon="FolderTree"
            disabled={!source || plan?.fileCount === 0}
            disabledReason={
              !source ? 'Choose a folder first.' : 'This folder has no files to flatten.'
            }
          />
        </>
      }
    />
  );
}
