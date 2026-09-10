import { exists } from '@tauri-apps/plugin-fs';
import { useMemo, useState } from 'react';
import { asToolboxError } from '@/core/bridge';
import { shortenPath } from '@/core/format';
import type { OutputSpec, ToolboxError } from '@/core/types';
import { useToolFiles } from '@/core/useToolFiles';
import { useToolRun } from '@/core/useToolRun';
import {
  assetUrlFresh,
  ErrorDisplay,
  FileDropZone,
  ImagePreview,
  OutputSettings,
  ResultPanel,
  ToolActions,
  ToolShell,
  useOutputSpec,
} from '@/components/tool';
import { Alert, CopyButton, Field, Icon, Input, Section } from '@/components/ui';
import {
  faviconFilesIn,
  faviconTargetDir,
  FAVICON_OUTPUTS,
  FAVICON_SNIPPET,
  numberedFolder,
  outputFor,
  previewSize,
} from './logic';

/** What the global "If the file exists" setting means for a whole favicon set. */
const COLLISION_NOTE: Record<OutputSpec['collision'], string> = {
  rename: 'If that folder already holds a favicon set, a numbered folder beside it is used instead.',
  skip: 'If that folder already holds a favicon set, nothing is written.',
  overwrite: 'Files already in that folder with these names are replaced.',
};

/** True when any file of the set is already sitting in `dir`. */
async function folderHasSet(dir: string): Promise<boolean> {
  const present = await Promise.all(faviconFilesIn(dir).map((file) => exists(file)));
  return present.some(Boolean);
}

/** The first `dir`, `dir_1`, `dir_2` … that does not already hold a set. */
async function freeFolder(dir: string): Promise<string> {
  for (let n = 1; n < 1000; n += 1) {
    const candidate = numberedFolder(dir, n);
    if (!(await folderHasSet(candidate))) return candidate;
  }
  return numberedFolder(dir, Date.now());
}

export default function FaviconGenerator() {
  const files = useToolFiles({ kinds: ['image'], filterName: 'Images', multiple: false });
  const run = useToolRun('images/favicon', 'Favicon Generator');
  const { spec, update } = useOutputSpec();
  const path = files.files[0]?.path ?? null;

  const [folderName, setFolderName] = useState('favicon');
  const [planError, setPlanError] = useState<ToolboxError | null>(null);
  const [skipped, setSkipped] = useState<string | null>(null);

  // Where the set lands: the folder chosen in Output settings, plus the set folder.
  const target = faviconTargetDir(path, spec, folderName);

  const execute = async () => {
    if (!path || !target) return;
    setPlanError(null);
    setSkipped(null);
    let dir = target;
    try {
      if (spec.collision !== 'overwrite' && (await folderHasSet(target))) {
        if (spec.collision === 'skip') {
          setSkipped(target);
          return;
        }
        dir = await freeFolder(target);
      }
    } catch (err) {
      setPlanError(asToolboxError(err));
      return;
    }
    void run.execute({
      command: 'generate_favicons',
      total: 1,
      inputs: [path],
      label: 'Generate the favicon set',
      args: { input: path, outputDir: dir },
    });
  };

  const batch = run.result;
  const previews = useMemo(() => {
    const rows: Array<{ path: string; name: string; size: number }> = [];
    for (const result of batch?.results ?? []) {
      const output = outputFor(result.name);
      if (output?.size) rows.push({ path: result.path, name: result.name, size: output.size });
    }
    return rows.sort((a, b) => a.size - b.size);
  }, [batch]);

  return (
    <ToolShell
      main={
        <>
          <FileDropZone
            files={files}
            label="Drop your logo here"
            hint="A square image of 512 px or more keeps every size sharp"
            compact={Boolean(path)}
          />

          {planError && <ErrorDisplay error={planError} onRetry={() => void execute()} />}
          {run.error && <ErrorDisplay error={run.error} onRetry={() => void execute()} />}

          {skipped && (
            <Alert tone="warn" title="Nothing was written">
              <span className="font-mono">{shortenPath(skipped, 3)}</span> already holds a favicon
              set, and “If the file exists” is set to skip. Pick another folder, change the set
              folder name, or switch to “Keep both”.
            </Alert>
          )}

          {previews.length > 0 && (
            <Section
              title="Generated sizes"
              description="Rendered from the files that were just written"
              dense
            >
              <div className="flex flex-wrap items-end gap-4 p-1">
                {previews.map((preview) => {
                  const shown = previewSize(preview.size);
                  return (
                    <figure key={preview.path} className="space-y-1.5 text-center">
                      <div
                        className="checkerboard flex items-center justify-center overflow-hidden rounded-md border border-line"
                        style={{ width: shown, height: shown }}
                      >
                        <img
                          src={assetUrlFresh(preview.path, run.taskId ?? 0)}
                          alt={preview.name}
                          width={shown}
                          height={shown}
                          className="block h-full w-full object-contain"
                        />
                      </div>
                      <figcaption className="text-[11px] text-ink-faint">
                        {preview.size}px
                        {shown !== preview.size && <span className="block text-[10.5px]">shown smaller</span>}
                      </figcaption>
                    </figure>
                  );
                })}
              </div>
            </Section>
          )}

          {run.result && <ResultPanel result={run.result} onProcessAgain={run.reset} title="Favicon set ready" />}

          {run.result && run.result.results.length > 0 && (
            <Alert tone="info" title="site.webmanifest is written with empty name fields">
              Open it and fill in <code className="font-mono">name</code> and{' '}
              <code className="font-mono">short_name</code> for your site before you ship it.
            </Alert>
          )}

          <Section
            title="HTML to paste in your <head>"
            description="Assumes the files are served from the site root"
            actions={<CopyButton size="sm" label="Copy HTML" value={FAVICON_SNIPPET} />}
          >
            <pre className="selectable overflow-x-auto rounded-lg border border-line bg-canvas p-3 font-mono text-[11.5px] leading-[1.6] text-ink">
              {FAVICON_SNIPPET}
            </pre>
          </Section>
        </>
      }
      aside={
        <>
          <Section title="Where to save">
            <div className="space-y-3">
              <OutputSettings spec={spec} onChange={update} showSuffix={false} />
              <Field label="Set folder" hint="Created inside the folder above if it is not there yet.">
                <Input
                  value={folderName}
                  onChange={(e) => setFolderName(e.target.value)}
                  placeholder="favicon"
                  spellCheck={false}
                />
              </Field>
              <div className="flex h-8.5 items-center gap-2 rounded-lg border border-line bg-canvas px-2.5">
                <Icon name="Folder" size={13} className="shrink-0 text-ink-faint" />
                <span className="truncate text-[12.5px] text-ink-soft" title={target ?? ''}>
                  {target
                    ? shortenPath(target, 3)
                    : path
                      ? 'Choose a folder to write into'
                      : 'Add an image first'}
                </span>
              </div>
              <p className="text-[11.5px] text-ink-faint">{COLLISION_NOTE[spec.collision]}</p>
            </div>
          </Section>

          <Section title="What you get" dense>
            <ul className="space-y-1.5">
              {FAVICON_OUTPUTS.map((output) => (
                <li key={output.name} className="flex items-baseline justify-between gap-2">
                  <span className="truncate font-mono text-[11.5px] text-ink">{output.name}</span>
                  <span className="shrink-0 text-[11px] text-ink-faint">
                    {output.size ? `${output.size}px` : output.label}
                  </span>
                </li>
              ))}
            </ul>
          </Section>

          {path && (
            <Section title="Source" dense>
              <ImagePreview path={path} className="h-32 w-full" alt="Selected image" />
            </Section>
          )}

          <ToolActions
            run={run}
            onRun={() => void execute()}
            label="Generate favicons"
            icon="Globe"
            disabled={!path || !target}
            disabledReason={!path ? 'Add an image first.' : 'Choose a folder to write into.'}
          />
        </>
      }
    />
  );
}
