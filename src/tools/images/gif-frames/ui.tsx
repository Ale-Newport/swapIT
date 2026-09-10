import { useState } from 'react';
import { openPath } from '@/core/bridge';
import { basename, dirname, formatBytes } from '@/core/format';
import { useToolFiles } from '@/core/useToolFiles';
import { useToolRun } from '@/core/useToolRun';
import {
  assetUrl,
  ErrorDisplay,
  FileDropZone,
  ImagePreview,
  OutputSettings,
  ResultPanel,
  ToolActions,
  ToolShell,
  useOutputSpec,
} from '@/components/tool';
import { Alert, Field, Section, Segmented } from '@/components/ui';

const STRIP_LIMIT = 12;

export default function GifToFrames() {
  const files = useToolFiles({ extensions: ['gif'], filterName: 'GIF images', multiple: false });
  const run = useToolRun('images/gif-frames', 'GIF to Frames');
  const { spec, update } = useOutputSpec();
  const [format, setFormat] = useState<'png' | 'jpg'>('png');

  const file = files.files[0] ?? null;
  const frames = run.result?.results ?? [];
  const folder = frames.length > 0 ? dirname(frames[0].path) : null;

  const execute = () =>
    void run.execute({
      command: 'split_gif_frames',
      total: 1,
      inputs: files.paths,
      label: `Split ${file?.name ?? 'GIF'} into frames`,
      args: { input: files.paths[0], format, output: spec },
    });

  return (
    <ToolShell
      main={
        <>
          <FileDropZone
            files={files}
            label="Drop an animated GIF here"
            hint="Every frame is written as its own image into a new folder"
          />

          {file && !run.result && (
            <Section title="The animation" description={`${file.name} · ${formatBytes(file.size)}`}>
              <ImagePreview path={file.path} className="h-56" alt={file.name} />
            </Section>
          )}

          {run.error && <ErrorDisplay error={run.error} onRetry={execute} />}

          {run.result && (
            <>
              <ResultPanel
                result={run.result}
                onProcessAgain={run.reset}
                title={`${frames.length} frame${frames.length === 1 ? '' : 's'} extracted`}
              />

              {frames.length > 0 && (
                <Section
                  title="Frames"
                  description={
                    folder
                      ? `Written to ${basename(folder)}${
                          frames.length > STRIP_LIMIT ? ` · showing the first ${STRIP_LIMIT}` : ''
                        }`
                      : undefined
                  }
                >
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {frames.slice(0, STRIP_LIMIT).map((frame, index) => (
                      <button
                        key={frame.path}
                        type="button"
                        onClick={() => void openPath(frame.path)}
                        title={`Open ${frame.name}`}
                        className="group w-24 shrink-0 text-left"
                      >
                        <span className="checkerboard flex h-24 w-24 items-center justify-center overflow-hidden rounded-lg border border-line transition-colors group-hover:border-line-strong">
                          <img
                            src={assetUrl(frame.path)}
                            alt={frame.name}
                            loading="lazy"
                            className="max-h-full max-w-full object-contain"
                          />
                        </span>
                        <span className="mt-1 block truncate text-[11px] text-ink-faint">
                          {index + 1}. {frame.name}
                        </span>
                      </button>
                    ))}
                  </div>
                </Section>
              )}
            </>
          )}
        </>
      }
      aside={
        <>
          <Section title="Frame format">
            <div className="space-y-3">
              <Field label="Save each frame as">
                <Segmented
                  value={format}
                  onChange={setFormat}
                  options={[
                    { value: 'png', label: 'PNG' },
                    { value: 'jpg', label: 'JPEG' },
                  ]}
                  className="w-full"
                />
              </Field>
              <Alert tone="info">
                {format === 'png'
                  ? 'PNG keeps the transparency GIFs use for their background.'
                  : 'JPEG has no transparency, so transparent areas are filled with white.'}
              </Alert>
            </div>
          </Section>

          <Section
            title="Where to save"
            description="Frames go into a new <name>-frames folder, numbered in order."
          >
            <OutputSettings spec={spec} onChange={update} showSuffix={false} showCollision={false} />
          </Section>

          <ToolActions
            run={run}
            onRun={execute}
            label="Split into frames"
            icon="Film"
            disabled={files.isEmpty}
            disabledReason="Add a GIF first."
          />
        </>
      }
    />
  );
}
