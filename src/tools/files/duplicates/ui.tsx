import { useMemo, useState } from 'react';
import { openPath, revealInFinder } from '@/core/bridge';
import { formatBytes, shortenPath } from '@/core/format';
import { useToolFiles } from '@/core/useToolFiles';
import { useToolRun } from '@/core/useToolRun';
import { ErrorDisplay, FileDropZone, ToolActions, ToolShell } from '@/components/tool';
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  CopyButton,
  EmptyState,
  Field,
  IconButton,
  NumberInput,
  Section,
  Select,
  Stat,
  Switch,
} from '@/components/ui';
import {
  extraCopies,
  folderOf,
  fullySelectedGroups,
  selectionBytes,
  shortHash,
  toBytes,
  totalCopies,
  type DuplicateReport,
  type SizeUnit,
} from './logic';

const GROUP_PAGE = 50;

export default function DuplicateFinder() {
  // `kinds: ['folder']` is what makes a plain file bounce with the standard
  // message: `find_duplicates` only scans directories, so a file in this list
  // could never be anything but a backend error.
  const files = useToolFiles({ folders: true, kinds: ['folder'], filterName: 'Folders' });
  const run = useToolRun('files/duplicates', 'Duplicate Finder');

  const [recursive, setRecursive] = useState(true);
  const [minValue, setMinValue] = useState(1);
  const [minUnit, setMinUnit] = useState<SizeUnit>('KB');
  const [report, setReport] = useState<DuplicateReport | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [visibleGroups, setVisibleGroups] = useState(GROUP_PAGE);

  const groups = useMemo(() => report?.groups ?? [], [report]);
  const selectedBytes = useMemo(() => selectionBytes(groups, selected), [groups, selected]);
  const emptied = useMemo(() => fullySelectedGroups(groups, selected), [groups, selected]);

  const toggle = (path: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  const execute = async () => {
    setReport(null);
    setSelected(new Set());
    setVisibleGroups(GROUP_PAGE);
    const result = await run.executeRaw<DuplicateReport>({
      command: 'find_duplicates',
      total: 1,
      label: `Scan ${files.files.length} folder${files.files.length === 1 ? '' : 's'} for duplicates`,
      args: { folders: files.paths, recursive, minBytes: toBytes(minValue, minUnit) },
    });
    if (result) setReport(result);
  };

  return (
    <ToolShell
      main={
        <>
          <FileDropZone
            files={files}
            label="Drop folders to scan"
            hint="Files are grouped by size first, so only real candidates are ever hashed."
            allowFolders
          />

          {run.error && <ErrorDisplay error={run.error} onRetry={() => void execute()} />}

          {report && groups.length === 0 && (
            <Section title="Result">
              <EmptyState
                icon="ShieldCheck"
                title="No duplicates found"
                description={`${report.scanned.toLocaleString()} file${
                  report.scanned === 1 ? '' : 's'
                } shared a size and were hashed to be sure. Nothing in these folders is byte-for-byte identical above the minimum size.`}
              />
            </Section>
          )}

          {report && groups.length > 0 && (
            <>
              <Section
                title="What was found"
                description={`${report.scanned.toLocaleString()} size-matched files hashed in ${(
                  report.elapsedMs / 1000
                ).toFixed(1)}s`}
              >
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <Stat label="Wasted space" value={formatBytes(report.totalWasted)} hint="If one copy of each is kept" />
                  <Stat label="Duplicate sets" value={groups.length.toLocaleString()} />
                  <Stat label="Files involved" value={totalCopies(groups).toLocaleString()} />
                  <Stat label="Extra copies" value={extraCopies(groups).length.toLocaleString()} />
                </div>
                <Alert tone="info" className="mt-3" title="Toolbox will not delete these for you.">
                  Deleting is the one step that cannot be undone, so it stays in your hands. Tick the copies you do not
                  want, copy the list or reveal them in Finder, and remove them there once you have looked.
                </Alert>
              </Section>

              <Section
                title="Duplicate sets"
                description="Sorted by the space each set wastes."
                actions={
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon="ListChecks"
                      onClick={() => setSelected(new Set(extraCopies(groups)))}
                    >
                      Keep the first in each set
                    </Button>
                    <Button size="sm" variant="ghost" icon="X" disabled={selected.size === 0} onClick={() => setSelected(new Set())}>
                      Clear
                    </Button>
                  </>
                }
              >
                <div className="space-y-2.5">
                  {groups.slice(0, visibleGroups).map((group) => {
                    const keptFirst =
                      !selected.has(group.files[0]) && group.files.slice(1).every((f) => selected.has(f));
                    return (
                      <div key={group.hash} className="overflow-hidden rounded-lg border border-line">
                        <header className="flex flex-wrap items-center gap-2 border-b border-line bg-canvas px-3 py-2">
                          <span className="text-[12.5px] font-medium text-ink">
                            {group.files.length} copies of {formatBytes(group.size)}
                          </span>
                          <Badge tone="warn">{formatBytes(group.wasted)} wasted</Badge>
                          <span className="ml-auto flex items-center gap-1.5">
                            <span className="selectable font-mono text-[11.5px] text-ink-faint" title={group.hash}>
                              {shortHash(group.hash)}…
                            </span>
                            <CopyButton value={group.hash} label="Hash" size="sm" variant="ghost" />
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                setSelected((current) => {
                                  const next = new Set(current);
                                  if (keptFirst) {
                                    for (const f of group.files) next.delete(f);
                                  } else {
                                    next.delete(group.files[0]);
                                    for (const f of group.files.slice(1)) next.add(f);
                                  }
                                  return next;
                                })
                              }
                            >
                              {keptFirst ? 'Deselect' : 'Keep the first'}
                            </Button>
                          </span>
                        </header>
                        <ul className="divide-y divide-line">
                          {group.files.map((path, index) => (
                            <li key={path} className="group flex items-center gap-2.5 bg-panel px-3 py-1.5">
                              <Checkbox checked={selected.has(path)} onCheckedChange={() => toggle(path)} />
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-[12.5px] text-ink" title={path}>
                                  {path.split('/').pop()}
                                </p>
                                <p className="truncate text-[11px] text-ink-faint" title={folderOf(path)}>
                                  {shortenPath(folderOf(path), 4)}
                                </p>
                              </div>
                              {index === 0 && <Badge>First found</Badge>}
                              <span className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100">
                                <IconButton icon="ExternalLink" label="Open" size="sm" onClick={() => void openPath(path)} />
                                <IconButton
                                  icon="FolderOpen"
                                  label="Reveal in Finder"
                                  size="sm"
                                  onClick={() => void revealInFinder(path)}
                                />
                                <IconButton
                                  icon="Copy"
                                  label="Copy path"
                                  size="sm"
                                  onClick={() => void navigator.clipboard.writeText(path)}
                                />
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>

                {groups.length > visibleGroups && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="mt-2"
                    onClick={() => setVisibleGroups((v) => v + GROUP_PAGE)}
                  >
                    Show {Math.min(GROUP_PAGE, groups.length - visibleGroups)} more sets
                  </Button>
                )}
              </Section>
            </>
          )}
        </>
      }
      aside={
        <>
          <Section title="Scan">
            <div className="space-y-3">
              <Field inline label="Include subfolders" hint={recursive ? 'The whole tree' : 'Top level only'}>
                <Switch checked={recursive} onCheckedChange={setRecursive} />
              </Field>
              <Field label="Ignore files smaller than" hint="Skipping tiny files makes the scan much faster.">
                <div className="flex gap-2">
                  <div className="flex-1">
                    <NumberInput value={minValue} min={0} step={1} onValueChange={setMinValue} />
                  </div>
                  <div className="w-24 shrink-0">
                    <Select
                      value={minUnit}
                      onChange={(e) => setMinUnit(e.target.value as SizeUnit)}
                      options={[
                        { value: 'B', label: 'bytes' },
                        { value: 'KB', label: 'KB' },
                        { value: 'MB', label: 'MB' },
                      ]}
                    />
                  </div>
                </div>
              </Field>
            </div>
          </Section>

          {selected.size > 0 && (
            <Section title="Your selection">
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <Stat label="Ticked" value={`${selected.size} file${selected.size === 1 ? '' : 's'}`} />
                  <Stat label="Would free" value={formatBytes(selectedBytes)} />
                </div>
                {emptied > 0 && (
                  <Alert tone="warn" title={`${emptied} set${emptied === 1 ? ' has' : 's have'} every copy ticked.`}>
                    Untick one file in those sets unless you really want no copy left.
                  </Alert>
                )}
                <CopyButton
                  value={() => [...selected].join('\n')}
                  label={`Copy ${selected.size} path${selected.size === 1 ? '' : 's'}`}
                  size="md"
                  className="w-full"
                />
                <p className="text-[11.5px] text-ink-faint">
                  Paste the list into Finder’s Go → Go to Folder, or into a terminal, once you have checked it.
                </p>
              </div>
            </Section>
          )}

          <ToolActions
            run={run}
            onRun={() => void execute()}
            label="Find duplicates"
            icon="Search"
            disabled={files.isEmpty}
            disabledReason="Choose at least one folder to scan."
          >
            {report && (
              <Button variant="ghost" icon="RefreshCw" onClick={() => void execute()}>
                Rescan
              </Button>
            )}
          </ToolActions>

          <Section title="How it works">
            <p className="text-[12px] leading-[1.55] text-ink-faint">
              Files are first grouped by their exact byte size — a free comparison. Only files that share a size are
              read and hashed with SHA-256, so a folder of thousands of photos is checked in seconds and a match means
              the files are genuinely identical, not just similarly named.
            </p>
          </Section>
        </>
      }
    />
  );
}
