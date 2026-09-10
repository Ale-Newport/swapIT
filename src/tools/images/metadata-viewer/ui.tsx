import { useEffect, useMemo, useState } from 'react';
import { asToolboxError, call } from '@/core/bridge';
import { formatBytes } from '@/core/format';
import { useToolFiles } from '@/core/useToolFiles';
import { FileDropZone, ImagePreview, ToolShell } from '@/components/tool';
import {
  Alert,
  Badge,
  CopyButton,
  EmptyState,
  Icon,
  Input,
  Section,
  Spinner,
  Stat,
} from '@/components/ui';
import {
  filterMetadata,
  groupMetadata,
  LOCATION_GROUP,
  metadataToJson,
  type ImageInfo,
  type MetadataEntry,
} from './logic';

const EXTENSIONS = ['jpg', 'jpeg', 'heic', 'heif', 'png', 'webp', 'avif', 'tif', 'tiff', 'bmp', 'gif'];

export default function ImageMetadataViewer() {
  const files = useToolFiles({
    kinds: ['image'],
    extensions: EXTENSIONS,
    filterName: 'Images',
    multiple: false,
  });

  const [entries, setEntries] = useState<MetadataEntry[]>([]);
  const [info, setInfo] = useState<ImageInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const file = files.files[0] ?? null;
  const path = file?.path ?? null;

  useEffect(() => {
    setQuery('');
    if (!path) {
      setEntries([]);
      setInfo(null);
      setError(null);
      setMetaError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setMetaError(null);
    void (async () => {
      const [meta, dims] = await Promise.allSettled([
        call<MetadataEntry[]>('read_metadata', { input: path }),
        call<ImageInfo[]>('image_info', { inputs: [path] }),
      ]);
      if (cancelled) return;
      setEntries(meta.status === 'fulfilled' ? meta.value : []);
      setInfo(dims.status === 'fulfilled' ? (dims.value[0] ?? null) : null);
      // Only a double failure means the file itself is unreadable — either half
      // failing on its own still leaves something worth showing.
      setError(meta.status === 'rejected' && dims.status === 'rejected' ? asToolboxError(meta.reason).message : null);
      setMetaError(meta.status === 'rejected' ? asToolboxError(meta.reason).message : null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [path]);

  const filtered = useMemo(() => filterMetadata(entries, query), [entries, query]);
  const groups = useMemo(() => groupMetadata(filtered), [filtered]);
  const json = useMemo(() => JSON.stringify(metadataToJson(entries, info), null, 2), [entries, info]);

  return (
    <ToolShell
      main={
        <>
          <FileDropZone
            files={files}
            label="Drop an image here"
            hint="Nothing leaves your Mac — the file is read in place"
          />

          {path && loading && (
            <div className="flex items-center gap-2 py-6 text-[12.5px] text-ink-faint">
              <Spinner /> Reading {file?.name}…
            </div>
          )}

          {path && !loading && error && <Alert tone="danger" title="This file could not be read.">{error}</Alert>}

          {path && !loading && !error && (
            <>
              <Section title="The file" description={file?.name}>
                <div className="flex flex-col gap-4 sm:flex-row">
                  <ImagePreview path={path} className="h-36 w-full shrink-0 sm:w-48" alt={file?.name ?? ''} />
                  <div className="grid min-w-0 flex-1 grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
                    <Stat
                      label="Dimensions"
                      value={info ? `${info.width} × ${info.height}` : '—'}
                      hint={info ? `${info.width * info.height} pixels` : undefined}
                    />
                    <Stat label="Megapixels" value={info ? `${info.megapixels.toFixed(1)} MP` : '—'} />
                    <Stat label="Aspect ratio" value={info?.aspectRatio ?? '—'} />
                    <Stat label="Colour" value={info?.colorType ?? '—'} />
                    <Stat
                      label="Transparency"
                      value={info ? (info.hasAlpha ? 'Alpha channel' : 'None') : '—'}
                    />
                    <Stat
                      label="File size"
                      value={formatBytes(info?.size ?? file?.size)}
                      hint={info?.format ? info.format.toUpperCase() : file?.extension.toUpperCase()}
                    />
                  </div>
                </div>
                {!info && (
                  <Alert tone="info" className="mt-3">
                    The pixels could not be decoded, so dimensions are unavailable. Metadata below is still read
                    straight from the file.
                  </Alert>
                )}
              </Section>

              <Section
                title="Metadata"
                description={
                  entries.length
                    ? `${entries.length} tag${entries.length === 1 ? '' : 's'}${
                        query ? ` · ${filtered.length} matching` : ''
                      }`
                    : undefined
                }
                actions={
                  entries.length > 0 ? (
                    <CopyButton value={json} label="Copy as JSON" size="sm" />
                  ) : undefined
                }
              >
                {metaError ? (
                  <Alert tone="warn" title="The metadata could not be read.">
                    {metaError}
                  </Alert>
                ) : entries.length === 0 ? (
                  <EmptyState
                    icon="Info"
                    title="No metadata in this file"
                    description="Nothing to see is good news for privacy — it usually means the image was exported by an app that strips EXIF, or has already been cleaned. Installing ExifTool lets Toolbox read XMP and IPTC tags in formats the built-in reader skips."
                  />
                ) : (
                  <div className="space-y-3">
                    <div className="relative">
                      <Icon
                        name="Search"
                        size={14}
                        className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint"
                      />
                      <Input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Filter tags and values…"
                        className="pl-8"
                      />
                    </div>

                    {groups.length === 0 ? (
                      <p className="py-6 text-center text-[12.5px] text-ink-faint">
                        No tag matches “{query}”.
                      </p>
                    ) : (
                      groups.map((group) => (
                        <div key={group.name} className="overflow-hidden rounded-lg border border-line">
                          <header className="flex items-center justify-between gap-2 border-b border-line bg-canvas px-3 py-1.5">
                            <span className="flex items-center gap-1.5 text-[12px] font-semibold text-ink">
                              {group.name === LOCATION_GROUP && (
                                <Icon name="MapPin" size={12} className="text-warn" />
                              )}
                              {group.name}
                            </span>
                            <Badge tone={group.name === LOCATION_GROUP ? 'warn' : 'neutral'}>
                              {group.entries.length}
                            </Badge>
                          </header>
                          <ul className="divide-y divide-line">
                            {group.entries.map((entry, i) => (
                              <li
                                key={`${group.name}-${entry.tag}-${i}`}
                                className="flex flex-col gap-0.5 bg-panel px-3 py-1.5 sm:flex-row sm:gap-3"
                              >
                                <span className="shrink-0 text-[12.5px] text-ink-soft sm:w-52" title={entry.tag}>
                                  {entry.tag}
                                </span>
                                <span className="selectable min-w-0 flex-1 break-words font-mono text-[11.5px] text-ink">
                                  {entry.value}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))
                    )}

                    {groups.some((g) => g.name === LOCATION_GROUP) && (
                      <Alert tone="warn" title="This image knows where it was taken.">
                        Use Remove Image Metadata before sharing it if that is not intended.
                      </Alert>
                    )}
                  </div>
                )}
              </Section>
            </>
          )}
        </>
      }
    />
  );
}
