import { useEffect, useMemo, useRef, useState } from 'react';
import { asToolboxError, call, revealInFinder } from '@/core/bridge';
import { formatBytes } from '@/core/format';
import { saveTextAs } from '@/core/save';
import { useToolFiles } from '@/core/useToolFiles';
import { FileDropZone, ToolShell, kindIcon } from '@/components/tool';
import {
  Alert,
  Badge,
  Button,
  CopyButton,
  Icon,
  IconButton,
  Section,
  Spinner,
} from '@/components/ui';
import {
  buildReport,
  formatTimestamp,
  groupEntries,
  hasLocation,
  reportToTsv,
  sortFiles,
  type FileSortKey,
  type MetadataEntry,
  type SortDirection,
} from './logic';

const BULK_LIMIT = 200;

export default function FileMetadata() {
  const files = useToolFiles({ filterName: 'Files' });

  const [sortKey, setSortKey] = useState<FileSortKey>('name');
  const [sortDir, setSortDir] = useState<SortDirection>('asc');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [meta, setMeta] = useState<Record<string, MetadataEntry[]>>({});
  const [metaErrors, setMetaErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState<{ done: number; total: number } | null>(null);
  const [savedTo, setSavedTo] = useState<string | null>(null);

  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const rows = useMemo(() => sortFiles(files.files, sortKey, sortDir), [files.files, sortKey, sortDir]);
  const json = useMemo(() => JSON.stringify(buildReport(rows, meta), null, 2), [rows, meta]);
  // Counted over the current list, not the cache: entries for files that have
  // since been removed must not make the list look fully read.
  const loadedCount = useMemo(() => rows.filter((f) => meta[f.path]).length, [rows, meta]);

  const readMetadata = async (path: string) => {
    if (meta[path] || loading.has(path)) return;
    setLoading((current) => new Set(current).add(path));
    try {
      const entries = await call<MetadataEntry[]>('read_metadata', { input: path });
      if (!alive.current) return;
      setMeta((current) => ({ ...current, [path]: entries }));
      setMetaErrors((current) => {
        const next = { ...current };
        delete next[path];
        return next;
      });
    } catch (err) {
      if (!alive.current) return;
      setMetaErrors((current) => ({ ...current, [path]: asToolboxError(err).message }));
    } finally {
      if (alive.current) {
        setLoading((current) => {
          const next = new Set(current);
          next.delete(path);
          return next;
        });
      }
    }
  };

  const toggleRow = (path: string) => {
    const isOpen = expanded.has(path);
    setExpanded((current) => {
      const next = new Set(current);
      if (isOpen) next.delete(path);
      else next.add(path);
      return next;
    });
    if (!isOpen) void readMetadata(path);
  };

  const readAll = async () => {
    const pending = rows.filter((f) => !meta[f.path]).slice(0, BULK_LIMIT);
    setBulk({ done: 0, total: pending.length });
    for (const [index, file] of pending.entries()) {
      if (!alive.current) return;
      await readMetadata(file.path);
      if (!alive.current) return;
      setBulk({ done: index + 1, total: pending.length });
    }
    if (alive.current) setBulk(null);
  };

  const saveJson = async () => {
    const result = await saveTextAs(json, 'file-metadata.json');
    if (result && alive.current) setSavedTo(result.path);
  };

  const toggleSort = (key: FileSortKey) => {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir(key === 'name' || key === 'kind' ? 'asc' : 'desc');
    }
  };

  const header = (key: FileSortKey, label: string, className: string) => (
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
            label="Drop files to inspect"
            hint="Any type, any number. Folders are expanded into the files inside them."
            allowFolders
            compact={!files.isEmpty}
          />

          {!files.isEmpty && (
            <Section
              title="Files"
              description={`${rows.length} file${rows.length === 1 ? '' : 's'} · ${formatBytes(files.totalSize)}`}
              actions={
                <Button
                  size="sm"
                  variant="ghost"
                  icon="ChevronDown"
                  onClick={() =>
                    setExpanded((current) => (current.size === rows.length ? new Set() : new Set(rows.map((f) => f.path))))
                  }
                >
                  {expanded.size === rows.length ? 'Collapse all' : 'Expand all'}
                </Button>
              }
            >
              <div className="overflow-hidden rounded-lg border border-line">
                <div className="flex items-center gap-3 border-b border-line bg-canvas px-3 py-1.5">
                  {header('name', 'Name', 'min-w-0 flex-1')}
                  <span className="hidden w-16 text-[11px] uppercase tracking-wide text-ink-faint xl:block">Ext</span>
                  <span className="hidden w-40 text-[11px] uppercase tracking-wide text-ink-faint lg:block">
                    Type
                  </span>
                  {header('kind', 'Kind', 'hidden w-20 sm:flex')}
                  {header('size', 'Size', 'w-20 justify-end')}
                  {header('modified', 'Modified', 'hidden w-36 justify-end md:flex')}
                  <span className="w-8" />
                </div>
                <ul className="divide-y divide-line">
                  {rows.map((file) => {
                    const entries = meta[file.path];
                    const isOpen = expanded.has(file.path);
                    return (
                      <li key={file.path} className="bg-panel">
                        <div className="flex items-center gap-3 px-3 py-1.5">
                          <button
                            type="button"
                            onClick={() => toggleRow(file.path)}
                            className="flex min-w-0 flex-1 items-center gap-2 text-left"
                            aria-expanded={isOpen}
                          >
                            <Icon
                              name={isOpen ? 'ChevronDown' : 'ChevronRight'}
                              size={13}
                              className="shrink-0 text-ink-faint"
                            />
                            <Icon name={kindIcon(file.kind)} size={13} className="shrink-0 text-ink-faint" />
                            <span className="truncate text-[12.5px] text-ink" title={file.path}>
                              {file.name}
                            </span>
                          </button>
                          <span className="hidden w-16 truncate font-mono text-[11.5px] uppercase text-ink-faint xl:block">
                            {file.extension || '—'}
                          </span>
                          <span
                            className="hidden w-40 truncate text-[11.5px] text-ink-faint lg:block"
                            title={file.mime}
                          >
                            {file.mime}
                          </span>
                          <span className="hidden w-20 truncate text-[11.5px] text-ink-faint sm:block">
                            {file.kind}
                          </span>
                          <span className="w-20 text-right text-[12px] text-ink">{formatBytes(file.size)}</span>
                          <span className="hidden w-36 text-right text-[11.5px] text-ink-faint md:block">
                            {formatTimestamp(file.modified)}
                          </span>
                          <IconButton
                            icon="FolderOpen"
                            label="Reveal in Finder"
                            size="sm"
                            onClick={() => void revealInFinder(file.path)}
                          />
                        </div>

                        {isOpen && (
                          <div className="space-y-3 border-t border-line bg-canvas px-3 py-2.5">
                            <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
                              {[
                                ['Created', formatTimestamp(file.created)],
                                ['Modified', formatTimestamp(file.modified)],
                                ['Exact size', `${file.size.toLocaleString()} bytes`],
                                ['MIME type', file.mime],
                                ['Extension', file.extension || 'none'],
                                ['Kind', file.kind],
                              ].map(([label, value]) => (
                                <div key={label} className="min-w-0">
                                  <dt className="text-[11px] uppercase tracking-wide text-ink-faint">{label}</dt>
                                  <dd className="selectable truncate text-[12px] text-ink" title={value}>
                                    {value}
                                  </dd>
                                </div>
                              ))}
                            </dl>

                            <div className="min-w-0">
                              <p className="text-[11px] uppercase tracking-wide text-ink-faint">Full path</p>
                              <p className="selectable break-all font-mono text-[11.5px] text-ink-soft">{file.path}</p>
                            </div>

                            {loading.has(file.path) ? (
                              <div className="flex items-center gap-2 text-[12px] text-ink-faint">
                                <Spinner /> Reading embedded metadata…
                              </div>
                            ) : metaErrors[file.path] ? (
                              <Alert tone="warn" title="Embedded metadata could not be read.">
                                {metaErrors[file.path]}
                              </Alert>
                            ) : entries && entries.length > 0 ? (
                              <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                  <span className="text-[12px] font-medium text-ink">Embedded metadata</span>
                                  <Badge>{entries.length} tags</Badge>
                                  {hasLocation(entries) && (
                                    <Badge tone="warn">
                                      <Icon name="MapPin" size={10} />
                                      Location
                                    </Badge>
                                  )}
                                </div>
                                {groupEntries(entries).map((group) => (
                                  <div key={group.name} className="overflow-hidden rounded-lg border border-line">
                                    <p className="border-b border-line bg-panel px-2.5 py-1 text-[11.5px] font-semibold text-ink-soft">
                                      {group.name}
                                    </p>
                                    <ul className="divide-y divide-line">
                                      {group.entries.map((entry, index) => (
                                        <li
                                          key={`${group.name}-${entry.tag}-${index}`}
                                          className="flex flex-col gap-0.5 bg-panel px-2.5 py-1 sm:flex-row sm:gap-3"
                                        >
                                          <span className="shrink-0 text-[11.5px] text-ink-soft sm:w-52">
                                            {entry.tag}
                                          </span>
                                          <span className="selectable min-w-0 flex-1 break-words font-mono text-[11px] text-ink">
                                            {entry.value}
                                          </span>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                ))}
                              </div>
                            ) : entries ? (
                              <p className="text-[12px] text-ink-faint">
                                No embedded metadata in this file. EXIF, XMP and IPTC tags live inside photos and
                                documents; plain files carry only what the filesystem records above. Installing
                                ExifTool widens what can be read.
                              </p>
                            ) : (
                              <Button size="sm" icon="ScanText" onClick={() => void readMetadata(file.path)}>
                                Read embedded metadata
                              </Button>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            </Section>
          )}
        </>
      }
      aside={
        <>
          <Section title="Embedded metadata">
            <div className="space-y-2.5">
              <p className="text-[12px] leading-[1.55] text-ink-faint">
                Opening a row reads that file’s EXIF and other embedded tags. {loadedCount} of {rows.length} file
                {rows.length === 1 ? '' : 's'} read so far.
              </p>
              <Button
                icon="ScanText"
                full
                loading={bulk !== null}
                disabled={files.isEmpty || loadedCount >= rows.length}
                onClick={() => void readAll()}
              >
                {bulk ? `Reading ${bulk.done} of ${bulk.total}…` : 'Read metadata for all'}
              </Button>
              {rows.length > BULK_LIMIT && (
                <p className="text-[11.5px] text-ink-faint">
                  The first {BULK_LIMIT} files are read at a time — press again for the rest.
                </p>
              )}
            </div>
          </Section>

          <Section title="Export">
            <div className="space-y-2">
              <CopyButton
                value={() => json}
                label="Copy as JSON"
                size="md"
                className="w-full"
                disabled={files.isEmpty}
              />
              <CopyButton
                value={() => reportToTsv(rows)}
                label="Copy as table"
                size="md"
                className="w-full"
                disabled={files.isEmpty}
              />
              <Button icon="Download" full disabled={files.isEmpty} onClick={() => void saveJson()}>
                Save JSON file
              </Button>
              {savedTo && (
                <p className="truncate text-[11.5px] text-success" title={savedTo}>
                  Saved to {savedTo.split('/').pop()}
                </p>
              )}
              <p className="text-[11.5px] text-ink-faint">
                The export includes every file listed plus the embedded tags already read.
              </p>
            </div>
          </Section>
        </>
      }
    />
  );
}
