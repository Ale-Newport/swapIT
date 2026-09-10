import { useEffect, useMemo, useState } from 'react';
import { asToolboxError, call } from '@/core/bridge';
import { basename } from '@/core/format';
import { useSettings } from '@/core/settings';
import { useToolFiles } from '@/core/useToolFiles';
import { useToolRun } from '@/core/useToolRun';
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
  Icon,
  Section,
  Select,
  Slider,
  Spinner,
  Stat,
} from '@/components/ui';
import { bucketFor, formatCoordinates, summarizeMetadata, type MetadataEntry } from './logic';

const EXTENSIONS = ['jpg', 'jpeg', 'heic', 'heif', 'png', 'webp', 'avif', 'tif', 'tiff', 'bmp'];

const FORMATS = [
  { value: 'keep', label: 'Keep the original format' },
  { value: 'jpg', label: 'JPEG (.jpg)' },
  { value: 'png', label: 'PNG (.png)' },
  { value: 'webp', label: 'WebP (.webp)' },
  { value: 'tiff', label: 'TIFF (.tiff)' },
  { value: 'avif', label: 'AVIF (.avif)' },
];

export default function RemoveImageMetadata() {
  const files = useToolFiles({ kinds: ['image'], extensions: EXTENSIONS, filterName: 'Images' });
  const run = useToolRun('images/remove-metadata', 'Remove Image Metadata');
  const { spec, update } = useOutputSpec({ suffix: '-clean' });
  const defaultQuality = useSettings((s) => s.settings.jpegQuality);

  const [format, setFormat] = useState('keep');
  const [quality, setQuality] = useState(defaultQuality);

  const [entries, setEntries] = useState<MetadataEntry[] | null>(null);
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const firstPath = files.files[0]?.path ?? null;

  // The preview always describes the first file — reading every image up front
  // would make dropping a folder of 500 photos crawl.
  useEffect(() => {
    setShowAll(false);
    if (!firstPath) {
      setEntries(null);
      setReadError(null);
      return;
    }
    let cancelled = false;
    setReading(true);
    setReadError(null);
    call<MetadataEntry[]>('read_metadata', { input: firstPath })
      .then((result) => {
        if (!cancelled) setEntries(result);
      })
      .catch((err) => {
        if (!cancelled) {
          setEntries(null);
          setReadError(asToolboxError(err).message);
        }
      })
      .finally(() => {
        if (!cancelled) setReading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [firstPath]);

  const summary = useMemo(() => (entries ? summarizeMetadata(entries) : null), [entries]);
  const visible = useMemo(() => (entries && !showAll ? entries.slice(0, 12) : (entries ?? [])), [entries, showAll]);

  const count = files.files.length;
  const execute = () =>
    void run.execute({
      command: 'process_images',
      total: count,
      inputs: files.paths,
      label: `Remove metadata from ${count} image${count === 1 ? '' : 's'}`,
      args: {
        inputs: files.paths,
        // No `stripMetadata` flag: the backend pipeline never reads one. Metadata
        // is dropped because `process_images` decodes to pixels and re-encodes
        // from scratch, which is exactly what this tool wants.
        ops: {
          format: format === 'keep' ? undefined : format,
          quality,
        },
        output: spec,
      },
    });

  return (
    <ToolShell
      main={
        <>
          <FileDropZone
            files={files}
            label="Drop photos here"
            hint="JPEG, HEIC, PNG, WebP, TIFF — the pixels are re-encoded so nothing can hide in the file"
            allowFolders
          />

          {firstPath && (
            <Section
              title="What will be removed"
              description={
                count > 1
                  ? `Read from ${basename(firstPath)} — every selected image is cleaned the same way.`
                  : basename(firstPath)
              }
              actions={
                summary && summary.total > 0 ? <Badge>{summary.total} tags</Badge> : undefined
              }
            >
              {reading ? (
                <div className="flex items-center gap-2 py-4 text-[12.5px] text-ink-faint">
                  <Spinner /> Reading metadata…
                </div>
              ) : readError ? (
                <Alert tone="warn" title="The metadata could not be read.">
                  {readError} The image will still be re-encoded without any metadata.
                </Alert>
              ) : summary && summary.total > 0 ? (
                <div className="space-y-3">
                  {summary.gps ? (
                    <Alert
                      tone="danger"
                      title="This photo carries the exact place it was taken."
                      action={<CopyButton value={formatCoordinates(summary.gps)} label="Copy" size="sm" />}
                    >
                      <p className="selectable font-mono text-[13px]">{formatCoordinates(summary.gps)}</p>
                      <p className="mt-1 text-[11.5px] opacity-80">
                        {summary.locationEntries.length} location tag
                        {summary.locationEntries.length === 1 ? '' : 's'} — anyone who receives the file
                        can read them.
                      </p>
                    </Alert>
                  ) : summary.locationEntries.length > 0 ? (
                    <Alert tone="warn" title="This photo carries location tags.">
                      {summary.locationEntries.length} GPS tag
                      {summary.locationEntries.length === 1 ? '' : 's'} without a readable coordinate pair.
                    </Alert>
                  ) : null}

                  {(summary.camera || summary.captured || summary.software || summary.serial) && (
                    <div className="grid grid-cols-2 gap-3 rounded-lg border border-line bg-canvas px-3 py-2.5 sm:grid-cols-4">
                      {summary.camera && <Stat label="Camera" value={summary.camera} hint={summary.lens ?? undefined} />}
                      {summary.captured && <Stat label="Taken" value={summary.captured} />}
                      {summary.software && <Stat label="Software" value={summary.software} />}
                      {summary.serial && <Stat label="Serial number" value={summary.serial} />}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-1.5">
                    {summary.buckets.map((b) => (
                      <Badge key={b.label} tone={b.label === 'Location' ? 'danger' : 'neutral'}>
                        {b.label} · {b.count}
                      </Badge>
                    ))}
                  </div>

                  <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line">
                    {visible.map((entry, i) => {
                      const location = bucketFor(entry.tag) === 'Location';
                      return (
                        <li
                          key={`${entry.group}-${entry.tag}-${i}`}
                          className="flex items-baseline gap-3 bg-panel px-3 py-1.5"
                        >
                          <span
                            className={`w-44 shrink-0 truncate text-[12.5px] ${location ? 'text-danger' : 'text-ink'}`}
                            title={entry.tag}
                          >
                            {location && <Icon name="MapPin" size={11} className="mr-1 inline align-baseline" />}
                            {entry.tag}
                          </span>
                          <span
                            className="selectable min-w-0 flex-1 truncate font-mono text-[11.5px] text-ink-soft"
                            title={entry.value}
                          >
                            {entry.value}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                  {entries && entries.length > visible.length && (
                    <Button size="sm" variant="ghost" onClick={() => setShowAll(true)}>
                      Show {entries.length - visible.length} more tags
                    </Button>
                  )}
                </div>
              ) : (
                <Alert tone="info" title="No metadata found in this file.">
                  Toolbox re-encodes the pixels anyway, so the copy is guaranteed to carry none — useful when
                  a viewer or an export step might have added some.
                </Alert>
              )}
            </Section>
          )}

          {run.error && <ErrorDisplay error={run.error} onRetry={execute} />}
          {run.result && <ResultPanel result={run.result} onProcessAgain={run.reset} title="Metadata removed" />}
        </>
      }
      aside={
        <>
          <Section title="Output format" description="Only the pixels are copied across.">
            <div className="space-y-3">
              <Field label="Format">
                <Select value={format} onChange={(e) => setFormat(e.target.value)} options={FORMATS} />
              </Field>
              <Field
                label={`Quality — ${quality}`}
                hint="Applies to JPEG, WebP and AVIF. PNG and TIFF are lossless and ignore it."
              >
                <Slider min={40} max={100} value={quality} onChange={setQuality} />
              </Field>
              <Alert tone="info">
                Stripping metadata means re-encoding, so a JPEG is compressed once more. Save as PNG or TIFF
                if the photo must not lose any detail.
              </Alert>
            </div>
          </Section>

          <Section title="Where to save">
            <OutputSettings spec={spec} onChange={update} />
          </Section>

          <ToolActions
            run={run}
            onRun={execute}
            label={count > 1 ? `Clean ${count} images` : 'Remove metadata'}
            icon="ShieldOff"
            disabled={files.isEmpty}
            disabledReason="Add at least one image first."
          />
        </>
      }
    />
  );
}
