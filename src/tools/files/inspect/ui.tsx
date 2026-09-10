// optional-dependency: Each inspector section degrades on its own; a missing binary hides that section rather than blocking the page.
import { useEffect, useMemo, useState } from 'react';
import { asToolboxError, call, openPath, revealInFinder } from '@/core/bridge';
import { basename, formatBytes, formatDuration, shortenPath } from '@/core/format';
import { readBytes } from '@/core/save';
import type { ToolboxError } from '@/core/types';
import { useToolFiles } from '@/core/useToolFiles';
import { useToolRun } from '@/core/useToolRun';
import { FileDropZone, ImagePreview, ToolShell, assetUrl, kindIcon } from '@/components/tool';
import {
  Alert,
  Badge,
  Button,
  CopyButton,
  Icon,
  Section,
  Spinner,
  Stat,
} from '@/components/ui';
import {
  buildTextPreview,
  canPreviewImage,
  canPreviewText,
  humanKind,
  MAX_TEXT_PREVIEW_BYTES,
  streamLabel,
  summarizeArchive,
  TEXT_PREVIEW_LINES,
  type ArchiveEntry,
  type FileHashes,
  type ImageInfo,
  type MediaInfo,
  type MetadataEntry,
  type PdfInfo,
  type TextPreview,
} from './logic';

const MAX_ARCHIVE_ROWS = 200;
const MAX_EXIF_ROWS = 14;

interface Detail {
  image?: ImageInfo | null;
  exif?: MetadataEntry[];
  media?: MediaInfo | null;
  pdf?: PdfInfo | null;
  archive?: ArchiveEntry[];
  thumbnail?: string | null;
  text?: TextPreview | null;
}

function Note({ error, extra }: { error: ToolboxError; extra?: string }) {
  return (
    <Alert
      tone={error.kind === 'missing_dependency' ? 'warn' : 'danger'}
      title={error.message}
      className="mt-1"
    >
      {extra}
    </Alert>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] uppercase tracking-wide text-ink-faint">{label}</p>
      <p className={`selectable truncate text-[12.5px] text-ink ${mono ? 'font-mono text-[11.5px]' : ''}`} title={value}>
        {value}
      </p>
    </div>
  );
}

export default function InspectFile() {
  const files = useToolFiles({ multiple: false, filterName: 'Any file' });
  const run = useToolRun('files/inspect', 'Inspect File');

  const [detail, setDetail] = useState<Detail>({});
  const [notes, setNotes] = useState<Record<string, ToolboxError>>({});
  const [loading, setLoading] = useState(false);
  const [hashes, setHashes] = useState<FileHashes | null>(null);
  const [showAllExif, setShowAllExif] = useState(false);

  const file = files.files[0] ?? null;

  useEffect(() => {
    setDetail({});
    setNotes({});
    setHashes(null);
    setShowAllExif(false);
    if (!file) return;
    const { path, kind } = file;

    let cancelled = false;
    const put = (patch: Detail) => {
      if (!cancelled) setDetail((current) => ({ ...current, ...patch }));
    };
    const step = async (key: string, work: () => Promise<void>) => {
      try {
        await work();
      } catch (err) {
        if (!cancelled) setNotes((current) => ({ ...current, [key]: asToolboxError(err) }));
      }
    };

    setLoading(true);
    void (async () => {
      const tasks: Array<Promise<void>> = [];

      if (kind === 'image') {
        tasks.push(
          step('image', async () => {
            const info = await call<ImageInfo[]>('image_info', { inputs: [path] });
            put({ image: info[0] ?? null });
          }),
        );
        tasks.push(
          step('exif', async () => {
            put({ exif: await call<MetadataEntry[]>('read_metadata', { input: path }) });
          }),
        );
      }

      if (kind === 'video' || kind === 'audio') {
        tasks.push(
          step('media', async () => {
            const info = await call<MediaInfo[]>('probe_media', { inputs: [path] });
            put({ media: info[0] ?? null });
          }),
        );
      }

      if (kind === 'video') {
        tasks.push(
          step('thumbnail', async () => {
            try {
              put({ thumbnail: await call<string>('preview_frame', { input: path, timestamp: 1, width: 640 }) });
            } catch {
              // A clip shorter than a second has no frame at 1s — take the first one.
              put({ thumbnail: await call<string>('preview_frame', { input: path, timestamp: 0, width: 640 }) });
            }
          }),
        );
      }

      if (kind === 'pdf') {
        tasks.push(
          step('pdf', async () => {
            const info = await call<PdfInfo[]>('pdf_info', { inputs: [path] });
            put({ pdf: info[0] ?? null });
          }),
        );
      }

      if (kind === 'archive') {
        tasks.push(
          step('archive', async () => {
            put({ archive: await call<ArchiveEntry[]>('list_archive', { input: path }) });
          }),
        );
      }

      if (kind === 'text' || kind === 'data' || kind === 'code' || kind === 'svg') {
        const previewable =
          kind === 'svg' ? file.size > 0 && file.size <= MAX_TEXT_PREVIEW_BYTES : canPreviewText(file);
        if (previewable) {
          tasks.push(
            step('text', async () => {
              const bytes = await readBytes(path);
              const decoded = new TextDecoder('utf-8').decode(bytes);
              put({ text: buildTextPreview(decoded) });
            }),
          );
        }
      }

      await Promise.all(tasks);
      if (!cancelled) setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [file]);

  const computeHash = async () => {
    const path = file?.path;
    if (!path) return;
    const result = await run.executeRaw<FileHashes[]>({
      command: 'hash_files',
      total: 1,
      inputs: [path],
      label: `SHA-256 of ${basename(path)}`,
      args: { inputs: [path], algorithms: ['sha256'] },
    });
    if (result?.[0]) setHashes(result[0]);
  };

  const archiveSummary = useMemo(
    () => (detail.archive ? summarizeArchive(detail.archive) : null),
    [detail.archive],
  );

  const reportJson = useMemo(() => {
    if (!file) return '';
    return JSON.stringify(
      {
        name: file.name,
        path: file.path,
        kind: file.kind,
        mime: file.mime,
        bytes: file.size,
        created: file.created ? new Date(file.created * 1000).toISOString() : null,
        modified: file.modified ? new Date(file.modified * 1000).toISOString() : null,
        image: detail.image ?? undefined,
        media: detail.media ?? undefined,
        pdf: detail.pdf ?? undefined,
        archive: archiveSummary ?? undefined,
        sha256: hashes?.sha256 ?? undefined,
      },
      null,
      2,
    );
  }, [file, detail, archiveSummary, hashes]);

  const showImagePreview = file ? canPreviewImage(file) : false;

  return (
    <ToolShell
      main={
        <>
          <FileDropZone
            files={files}
            label="Drop a file to inspect"
            hint="Any type — Toolbox reads what it can and tells you what it cannot."
            compact={Boolean(file)}
          />

          {file && (
            <>
              <Section
                title="Overview"
                description={loading ? 'Reading the file…' : humanKind(file.kind)}
                actions={loading ? <Spinner /> : undefined}
              >
                <div className="flex flex-col gap-4 sm:flex-row">
                  {showImagePreview ? (
                    <ImagePreview path={file.path} className="h-36 w-full shrink-0 sm:w-48" alt={file.name} />
                  ) : detail.thumbnail ? (
                    <div className="flex h-36 w-full shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-canvas sm:w-48">
                      <img src={assetUrl(detail.thumbnail)} alt="" className="max-h-full max-w-full object-contain" />
                    </div>
                  ) : (
                    <div className="flex h-36 w-full shrink-0 items-center justify-center rounded-lg border border-line bg-canvas sm:w-48">
                      <Icon name={kindIcon(file.kind)} size={26} className="text-ink-faint" />
                    </div>
                  )}
                  <div className="grid min-w-0 flex-1 grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
                    <Stat label="Name" value={file.name} />
                    <Stat label="Size" value={formatBytes(file.size)} hint={`${file.size.toLocaleString()} bytes`} />
                    <Stat label="Kind" value={humanKind(file.kind)} hint={file.extension ? `.${file.extension}` : 'no extension'} />
                    <Stat label="MIME type" value={file.mime} />
                    <Stat
                      label="Created"
                      value={file.created ? new Date(file.created * 1000).toLocaleString() : '—'}
                    />
                    <Stat
                      label="Modified"
                      value={file.modified ? new Date(file.modified * 1000).toLocaleString() : '—'}
                    />
                  </div>
                </div>
                <div className="mt-3 min-w-0 border-t border-line pt-3">
                  <p className="text-[11px] uppercase tracking-wide text-ink-faint">Where it lives</p>
                  <p className="selectable break-all font-mono text-[11.5px] text-ink-soft">{file.path}</p>
                </div>
              </Section>

              {file.kind === 'image' && (
                <Section title="Image">
                  {detail.image ? (
                    <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
                      <Row label="Dimensions" value={`${detail.image.width} × ${detail.image.height}`} />
                      <Row label="Megapixels" value={`${detail.image.megapixels.toFixed(1)} MP`} />
                      <Row label="Aspect ratio" value={detail.image.aspectRatio} />
                      <Row label="Format" value={detail.image.format.toUpperCase()} />
                      <Row label="Colour" value={detail.image.colorType} />
                      <Row label="Transparency" value={detail.image.hasAlpha ? 'Alpha channel' : 'None'} />
                    </div>
                  ) : notes.image ? (
                    <Note error={notes.image} extra="The pixels could not be decoded, so dimensions are unavailable." />
                  ) : (
                    <p className="text-[12.5px] text-ink-faint">Reading the image…</p>
                  )}

                  {detail.exif && detail.exif.length > 0 && (
                    <div className="mt-3 border-t border-line pt-3">
                      <div className="mb-2 flex items-center gap-2">
                        <span className="text-[12px] font-medium text-ink">Embedded metadata</span>
                        <Badge>{detail.exif.length} tags</Badge>
                      </div>
                      <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line">
                        {(showAllExif ? detail.exif : detail.exif.slice(0, MAX_EXIF_ROWS)).map((entry, index) => (
                          <li
                            key={`${entry.group}-${entry.tag}-${index}`}
                            className="flex flex-col gap-0.5 bg-panel px-3 py-1 sm:flex-row sm:gap-3"
                          >
                            <span className="shrink-0 text-[11.5px] text-ink-soft sm:w-52">{entry.tag}</span>
                            <span className="selectable min-w-0 flex-1 break-words font-mono text-[11px] text-ink">
                              {entry.value}
                            </span>
                          </li>
                        ))}
                      </ul>
                      {detail.exif.length > MAX_EXIF_ROWS && !showAllExif && (
                        <Button size="sm" variant="ghost" className="mt-2" onClick={() => setShowAllExif(true)}>
                          Show {detail.exif.length - MAX_EXIF_ROWS} more tags
                        </Button>
                      )}
                    </div>
                  )}
                  {notes.exif && <Note error={notes.exif} extra="ExifTool widens what can be read from this format." />}
                </Section>
              )}

              {(file.kind === 'video' || file.kind === 'audio') && (
                <Section title={file.kind === 'video' ? 'Video' : 'Audio'}>
                  {detail.media ? (
                    <>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
                        <Row label="Duration" value={formatDuration(detail.media.duration ?? null)} />
                        <Row label="Container" value={detail.media.formatLong || detail.media.formatName} />
                        <Row
                          label="Bitrate"
                          value={detail.media.bitrate ? `${Math.round(detail.media.bitrate / 1000)} kbps` : '—'}
                        />
                        <Row label="Streams" value={String(detail.media.streams.length)} />
                        {detail.media.video && (
                          <>
                            <Row
                              label="Resolution"
                              value={
                                detail.media.video.width && detail.media.video.height
                                  ? `${detail.media.video.width} × ${detail.media.video.height}`
                                  : '—'
                              }
                            />
                            <Row label="Video codec" value={detail.media.video.codec} />
                            <Row
                              label="Frame rate"
                              value={detail.media.video.fps ? `${detail.media.video.fps.toFixed(2)} fps` : '—'}
                            />
                          </>
                        )}
                        {detail.media.audio && (
                          <>
                            <Row label="Audio codec" value={detail.media.audio.codec} />
                            <Row
                              label="Sample rate"
                              value={
                                detail.media.audio.sampleRate ? `${detail.media.audio.sampleRate.toLocaleString()} Hz` : '—'
                              }
                            />
                            <Row label="Channels" value={detail.media.audio.channelLayout ?? String(detail.media.audio.channels ?? '—')} />
                          </>
                        )}
                      </div>

                      <ul className="mt-3 divide-y divide-line overflow-hidden rounded-lg border border-line">
                        {detail.media.streams.map((stream) => (
                          <li key={stream.index} className="flex items-center gap-2.5 bg-panel px-3 py-1.5">
                            <Badge>#{stream.index}</Badge>
                            <span className="w-14 shrink-0 text-[11.5px] uppercase text-ink-faint">{stream.kind}</span>
                            <span className="min-w-0 flex-1 truncate text-[12px] text-ink" title={stream.codecLong}>
                              {streamLabel(stream)}
                            </span>
                          </li>
                        ))}
                      </ul>

                      {detail.media.tags.length > 0 && (
                        <div className="mt-3 border-t border-line pt-3">
                          <p className="mb-1.5 text-[12px] font-medium text-ink">Tags</p>
                          <ul className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
                            {detail.media.tags.map(([key, value]) => (
                              <li key={key} className="flex min-w-0 gap-2">
                                <span className="w-28 shrink-0 truncate text-[11.5px] text-ink-faint">{key}</span>
                                <span className="selectable min-w-0 flex-1 truncate text-[11.5px] text-ink" title={value}>
                                  {value}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </>
                  ) : notes.media ? (
                    <Note
                      error={notes.media}
                      extra="Everything above still comes from the file itself — only the codec details need FFprobe."
                    />
                  ) : (
                    <p className="text-[12.5px] text-ink-faint">Probing the media…</p>
                  )}
                  {notes.thumbnail && file.kind === 'video' && !notes.media && (
                    <Note error={notes.thumbnail} extra="The preview frame is grabbed with FFmpeg." />
                  )}
                </Section>
              )}

              {file.kind === 'pdf' && (
                <Section title="Document">
                  {detail.pdf ? (
                    <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
                      <Row label="Pages" value={detail.pdf.pages.toLocaleString()} />
                      <Row label="Page size" value={detail.pdf.pageSize ?? '—'} />
                      <Row label="PDF version" value={detail.pdf.pdfVersion ?? '—'} />
                      <Row label="Encrypted" value={detail.pdf.encrypted ? 'Yes — password protected' : 'No'} />
                      <Row label="Title" value={detail.pdf.title ?? '—'} />
                      <Row label="Author" value={detail.pdf.author ?? '—'} />
                      <Row label="Creator" value={detail.pdf.creator ?? '—'} />
                      <Row label="Producer" value={detail.pdf.producer ?? '—'} />
                      <Row label="Created" value={detail.pdf.creationDate ?? '—'} />
                      <Row label="Tagged" value={detail.pdf.tagged ? 'Yes' : 'No'} />
                    </div>
                  ) : notes.pdf ? (
                    <Note error={notes.pdf} extra="Page count and document properties come from Poppler." />
                  ) : (
                    <p className="text-[12.5px] text-ink-faint">Reading the document…</p>
                  )}
                </Section>
              )}

              {file.kind === 'archive' && (
                <Section
                  title="Archive contents"
                  description={
                    archiveSummary
                      ? `${archiveSummary.files.toLocaleString()} files · ${archiveSummary.folders.toLocaleString()} folders`
                      : undefined
                  }
                >
                  {detail.archive && archiveSummary ? (
                    <>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
                        <Row label="Uncompressed" value={formatBytes(archiveSummary.uncompressed)} />
                        <Row label="Stored" value={formatBytes(archiveSummary.compressed)} />
                        <Row label="Saved" value={`${archiveSummary.savings.toFixed(0)}%`} />
                        <Row label="Entries" value={detail.archive.length.toLocaleString()} />
                      </div>
                      <ul className="mt-3 max-h-80 divide-y divide-line overflow-y-auto rounded-lg border border-line">
                        {detail.archive.slice(0, MAX_ARCHIVE_ROWS).map((entry) => (
                          <li key={entry.name} className="flex items-center gap-2.5 bg-panel px-3 py-1">
                            <Icon
                              name={entry.isDir ? 'Folder' : 'File'}
                              size={12}
                              className="shrink-0 text-ink-faint"
                            />
                            <span className="min-w-0 flex-1 truncate text-[12px] text-ink" title={entry.name}>
                              {entry.name}
                            </span>
                            {!entry.isDir && (
                              <span className="shrink-0 text-[11.5px] text-ink-faint">{formatBytes(entry.size)}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                      {detail.archive.length > MAX_ARCHIVE_ROWS && (
                        <p className="mt-2 text-[11.5px] text-ink-faint">
                          Showing the first {MAX_ARCHIVE_ROWS} of {detail.archive.length.toLocaleString()} entries.
                        </p>
                      )}
                    </>
                  ) : notes.archive ? (
                    <Note error={notes.archive} extra="ZIP, TAR and TAR.GZ archives can be listed without unpacking." />
                  ) : (
                    <p className="text-[12.5px] text-ink-faint">Listing the archive…</p>
                  )}
                </Section>
              )}

              {detail.text && (
                <Section
                  title="Content"
                  description={
                    detail.text.binary
                      ? 'This file is not text'
                      : `First ${TEXT_PREVIEW_LINES} lines${detail.text.truncated ? ' — the file continues' : ''}`
                  }
                >
                  {detail.text.binary ? (
                    <p className="text-[12.5px] text-ink-faint">
                      The bytes contain NUL characters, so this is binary data despite the extension.
                    </p>
                  ) : (
                    <pre className="selectable max-h-96 overflow-auto rounded-lg border border-line bg-canvas p-3 font-mono text-[11.5px] leading-[1.55] text-ink">
                      {detail.text.text}
                    </pre>
                  )}
                </Section>
              )}
              {notes.text && <Note error={notes.text} extra="The file could not be read as text." />}
            </>
          )}
        </>
      }
      aside={
        file ? (
          <>
            <Section title="Actions">
              <div className="space-y-2">
                <Button icon="FolderOpen" full onClick={() => void revealInFinder(file.path)}>
                  Reveal in Finder
                </Button>
                <Button icon="ExternalLink" full onClick={() => void openPath(file.path)}>
                  Open with the default app
                </Button>
                <CopyButton value={file.path} label="Copy full path" size="md" className="w-full" />
                <CopyButton value={() => reportJson} label="Copy report as JSON" size="md" className="w-full" />
              </div>
            </Section>

            <Section title="Fingerprint" description="SHA-256 of the whole file">
              <div className="space-y-2">
                {hashes?.sha256 ? (
                  <>
                    <p className="selectable break-all rounded-lg border border-line bg-canvas p-2 font-mono text-[11px] text-ink">
                      {hashes.sha256}
                    </p>
                    <CopyButton value={hashes.sha256} label="Copy checksum" size="sm" className="w-full" />
                  </>
                ) : (
                  <>
                    <Button
                      icon="ShieldCheck"
                      full
                      loading={run.running}
                      onClick={() => void computeHash()}
                    >
                      Compute SHA-256
                    </Button>
                    <p className="text-[11.5px] text-ink-faint">
                      Hashing reads every byte, so it is not done automatically — a large video takes a while.
                    </p>
                  </>
                )}
                {run.error && <Note error={run.error} />}
              </div>
            </Section>

            <Section title="Where this comes from">
              <p className="text-[12px] leading-[1.55] text-ink-faint">
                Name, size, dates and type are read straight from the filesystem. Image dimensions and EXIF are decoded
                in place. Codec and duration need FFprobe, page counts need Poppler; when one of those is missing the
                section says so and everything else still appears.
              </p>
              <p className="mt-2 truncate text-[11.5px] text-ink-faint" title={file.path}>
                {shortenPath(file.path, 3)}
              </p>
            </Section>
          </>
        ) : undefined
      }
    />
  );
}
