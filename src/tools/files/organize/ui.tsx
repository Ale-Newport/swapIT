import { useEffect, useMemo, useState } from 'react';
import { asToolboxError, expandPaths } from '@/core/bridge';
import { formatBytes, shortenPath } from '@/core/format';
import type { FileInfo } from '@/core/types';
import { useToolFiles } from '@/core/useToolFiles';
import { useToolRun } from '@/core/useToolRun';
import { ErrorDisplay, FileDropZone, ResultPanel, ToolActions, ToolShell } from '@/components/tool';
import { Alert, Badge, Button, Icon, Section, Segmented, Spinner } from '@/components/ui';
import { CATEGORY_ICONS, groupForOrganize, totalOf } from './logic';

const SCAN_LIMIT = 50_000;

export default function OrganizeFolder() {
  const files = useToolFiles({ folders: true, kinds: ['folder'], multiple: false });
  const run = useToolRun('files/organize', 'Organize Folder');

  const [byKind, setByKind] = useState(true);
  const [copyFiles, setCopyFiles] = useState(false);
  const [scanned, setScanned] = useState<FileInfo[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const source = files.files[0]?.path ?? null;

  useEffect(() => {
    if (!source) {
      setScanned(null);
      setScanError(null);
      return;
    }
    let stale = false;
    setScanning(true);
    setScanError(null);
    expandPaths([source], { recursive: false, includeHidden: false, limit: SCAN_LIMIT })
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

  const groups = useMemo(() => (scanned ? groupForOrganize(scanned, byKind) : []), [scanned, byKind]);
  const total = useMemo(() => totalOf(groups), [groups]);
  const largest = groups[0]?.count ?? 0;

  const execute = async () => {
    if (!source) return;
    await run.execute({
      command: 'organize_folder',
      total: total.count || 1,
      inputs: [source],
      label: `Organize ${total.count} files into ${groups.length} folder${groups.length === 1 ? '' : 's'}`,
      args: { source, copyFiles, byKind },
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
            hint="Only the files sitting directly in it are touched — existing subfolders are left alone"
            allowFolders
          />

          {source && (
            <Section
              title="Preview"
              description={
                scanned
                  ? `${total.count.toLocaleString()} file${total.count === 1 ? '' : 's'} · ${formatBytes(total.size)} · ${groups.length} folder${groups.length === 1 ? '' : 's'} in ${shortenPath(source, 2)}`
                  : undefined
              }
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
              {scanning && !scanned ? (
                <div className="flex items-center gap-2 py-2 text-[12.5px] text-ink-faint">
                  <Spinner /> Reading the folder…
                </div>
              ) : scanError ? (
                <Alert tone="danger" title="The folder could not be read.">
                  {scanError}
                </Alert>
              ) : groups.length === 0 ? (
                <Alert tone="info" title="Nothing to organize">
                  This folder has no loose files in it. Hidden files and existing subfolders are never moved.
                </Alert>
              ) : (
                <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line">
                  {groups.map((group) => (
                    <li key={group.bucket} className="flex items-center gap-3 bg-panel px-3 py-2">
                      <Icon
                        name={byKind ? (CATEGORY_ICONS[group.bucket] ?? 'File') : 'File'}
                        size={14}
                        className="shrink-0 text-ink-faint"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-[12.5px] font-medium text-ink">{group.bucket}</span>
                          <Badge>
                            {group.count} file{group.count === 1 ? '' : 's'}
                          </Badge>
                        </div>
                        <p className="truncate text-[11px] text-ink-faint" title={group.examples.join(', ')}>
                          {group.examples.join(' · ')}
                          {group.count > group.examples.length && ' …'}
                        </p>
                      </div>
                      <div className="hidden h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-line sm:block">
                        <div
                          className="h-full rounded-full bg-ink"
                          style={{ width: `${largest ? Math.max(4, (group.count / largest) * 100) : 0}%` }}
                        />
                      </div>
                      <span className="shrink-0 text-[11.5px] text-ink-faint">{formatBytes(group.size)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          )}

          {run.error && <ErrorDisplay error={run.error} onRetry={() => void execute()} />}
          {run.result && <ResultPanel result={run.result} onProcessAgain={run.reset} title="Organized" />}
        </>
      }
      aside={
        <>
          <Section title="Group by">
            <div className="space-y-2.5">
              <Segmented
                value={byKind ? 'kind' : 'extension'}
                onChange={(value) => setByKind(value === 'kind')}
                options={[
                  { value: 'kind', label: 'Category' },
                  { value: 'extension', label: 'Extension' },
                ]}
                className="w-full"
              />
              <p className="text-[11.5px] leading-[1.5] text-ink-faint">
                {byKind
                  ? 'Seven folders: Images, Videos, Audio, Documents, Archives, Code and Other.'
                  : 'One folder per extension — JPG, PDF, ZIP … Files with no extension go to Other.'}
              </p>
            </div>
          </Section>

          <Section title="Copy or move">
            <div className="space-y-2.5">
              <Segmented
                value={copyFiles ? 'copy' : 'move'}
                onChange={(value) => setCopyFiles(value === 'copy')}
                options={[
                  { value: 'move', label: 'Move', icon: 'FolderInput' },
                  { value: 'copy', label: 'Copy', icon: 'Copy' },
                ]}
                className="w-full"
              />
              <p className="text-[11.5px] leading-[1.5] text-ink-faint">
                {copyFiles
                  ? 'The originals stay loose in the folder and a copy goes into each subfolder — twice the space.'
                  : 'Files are relocated into subfolders of the same folder. Nothing leaves the folder and nothing is deleted.'}
              </p>
              <p className="text-[11.5px] leading-[1.5] text-ink-faint">
                A name already taken inside a subfolder gets <span className="font-mono">_1</span>,{' '}
                <span className="font-mono">_2</span> … appended. Nothing is overwritten.
              </p>
            </div>
          </Section>

          <ToolActions
            run={run}
            onRun={() => void execute()}
            label={copyFiles ? 'Copy into subfolders' : 'Move into subfolders'}
            icon="FolderKanban"
            disabled={!source || groups.length === 0}
            disabledReason={!source ? 'Choose a folder first.' : 'This folder has no loose files to sort.'}
          />
        </>
      }
    />
  );
}
