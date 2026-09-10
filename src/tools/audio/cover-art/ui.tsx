import { useEffect, useState } from 'react';
import { call } from '@/core/bridge';
import { formatBytes } from '@/core/format';
import { useToolFiles } from '@/core/useToolFiles';
import { useToolRun } from '@/core/useToolRun';
import {
  ErrorDisplay,
  FileDropZone,
  ImagePreview,
  OutputSettings,
  ResultPanel,
  ToolActions,
  ToolShell,
  useOutputSpec,
} from '@/components/tool';
import { Alert, Badge, EmptyState, Section, Spinner, Stat } from '@/components/ui';

/** The slice of `probe_media`'s MediaInfo this tool needs. */
interface ProbedStreams {
  path: string;
  streams: Array<{ kind: string; codec: string; width?: number | null; height?: number | null }>;
}

const PICTURE_CODECS = new Set(['mjpeg', 'png', 'bmp', 'gif', 'webp']);

interface Artwork {
  codec: string;
  width: number | null;
  height: number | null;
}

/** Module-level so the identity stays stable across renders. */
const AUDIO_EXTENSIONS = [
  'mp3', 'wav', 'm4a', 'm4b', 'aac', 'flac', 'ogg', 'oga', 'opus',
  'aiff', 'aif', 'wma', 'caf', 'amr', 'ac3', 'mka', 'au',
];

export default function ExtractCoverArt() {
  const files = useToolFiles({
    kinds: ['audio'],
    extensions: AUDIO_EXTENSIONS,
    filterName: 'Audio',
    multiple: false,
  });
  const run = useToolRun('audio/cover-art', 'Extract Cover Art');
  const { spec, update } = useOutputSpec();
  const [artwork, setArtwork] = useState<Artwork | null>(null);
  const [probing, setProbing] = useState(false);
  const [probed, setProbed] = useState(false);

  const source = files.files[0] ?? null;
  const path = source?.path ?? null;

  useEffect(() => {
    if (!path) {
      setArtwork(null);
      setProbed(false);
      // A probe still in flight was disowned by the cleanup below, so its
      // `finally` will never clear this — the spinner has to be put out here.
      setProbing(false);
      return;
    }
    let stale = false;
    setProbing(true);
    setProbed(false);
    void call<ProbedStreams[]>('probe_media', { inputs: [path] })
      .then(([info]) => {
        if (stale || !info) return;
        const picture = info.streams.find(
          (s) => s.kind === 'video' && PICTURE_CODECS.has(s.codec.toLowerCase()),
        );
        setArtwork(
          picture
            ? { codec: picture.codec.toLowerCase(), width: picture.width ?? null, height: picture.height ?? null }
            : null,
        );
        setProbed(true);
      })
      .catch(() => {
        // Without FFprobe there is no preview — extracting still reports the truth.
        if (!stale) setArtwork(null);
      })
      .finally(() => {
        if (!stale) setProbing(false);
      });
    return () => {
      stale = true;
    };
  }, [path]);

  const extracted = run.result?.results[0] ?? null;

  const execute = () => {
    if (!path) return;
    void run.execute({
      command: 'extract_cover_art',
      total: 1,
      inputs: [path],
      label: `Extract cover art from ${source?.name ?? 'file'}`,
      args: { input: path, output: spec },
    });
  };

  return (
    <ToolShell
      main={
        <>
          <FileDropZone
            files={files}
            label="Drop one audio file here"
            hint="MP3, M4A and FLAC usually carry the album cover inside the file"
          />

          {probing && (
            <div className="flex items-center gap-2 py-4 text-[12.5px] text-ink-faint">
              <Spinner /> Looking for embedded artwork…
            </div>
          )}

          {source && probed && !artwork && (
            <Alert tone="warn" title="No embedded cover art in this file">
              Nothing is stored inside it to extract. Music apps often show a cover that lives in their own library
              rather than in the file itself.
            </Alert>
          )}

          {source && artwork && (
            <Section
              title="Embedded artwork"
              description={source.name}
              actions={<Badge tone="accent">{artwork.codec.toUpperCase()}</Badge>}
            >
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <Stat
                  label="Dimensions"
                  value={artwork.width && artwork.height ? `${artwork.width} × ${artwork.height}` : 'Unknown'}
                />
                <Stat label="Picture format" value={artwork.codec.toUpperCase()} />
                <Stat label="Source file" value={formatBytes(source.size)} hint={source.extension.toUpperCase()} />
              </div>
              {artwork.codec !== 'mjpeg' && (
                <p className="mt-3 text-[11.5px] text-ink-faint">
                  The artwork is copied out untouched, so this {artwork.codec.toUpperCase()} picture is written with a
                  .jpg name. Rename it to .{artwork.codec} if a program complains.
                </p>
              )}
            </Section>
          )}

          {run.error && <ErrorDisplay error={run.error} onRetry={execute} />}

          {extracted && (
            <Section
              title="Extracted image"
              description={`${extracted.name} · ${formatBytes(extracted.size)}`}
            >
              <ImagePreview path={extracted.path} className="h-72 w-full" alt="Extracted cover art" />
            </Section>
          )}

          {run.result && <ResultPanel result={run.result} onProcessAgain={run.reset} title="Cover art saved" />}

          {!source && !probing && (
            <EmptyState
              icon="Disc3"
              title="Pick a song to pull its cover out of"
              description="Toolbox copies the picture stream out of the file without re-encoding it, so you get the original artwork at full quality."
            />
          )}
        </>
      }
      aside={
        <>
          <Section title="Where to save">
            <OutputSettings spec={spec} onChange={update} />
            <p className="mt-3 text-[11.5px] text-ink-faint">
              With no suffix of your own, the image is written next to the song as
              <span className="font-mono"> name-cover.jpg</span>.
            </p>
          </Section>

          <ToolActions
            run={run}
            onRun={execute}
            label="Extract cover art"
            icon="Disc3"
            disabled={files.isEmpty || (probed && !artwork)}
            disabledReason={
              files.isEmpty ? 'Add one audio file first.' : 'This file has no embedded artwork to extract.'
            }
          />
        </>
      }
    />
  );
}
