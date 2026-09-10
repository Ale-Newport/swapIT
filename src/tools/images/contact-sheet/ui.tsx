import { useEffect, useMemo, useState } from 'react';
import { useToolFiles } from '@/core/useToolFiles';
import { useToolRun } from '@/core/useToolRun';
import {
  assetUrlFresh,
  ErrorDisplay,
  FileDropZone,
  OptionsGrid,
  OutputSettings,
  PresetRow,
  ResultPanel,
  ToolActions,
  ToolShell,
  useOutputSpec,
} from '@/components/tool';
import { Alert, ColorInput, Field, Icon, Input, NumberInput, Section, Slider, Switch } from '@/components/ui';
import { isValidColor, PIXEL_WARNING_THRESHOLD, sheetLayout, type SheetLayout } from './logic';

const EXTENSIONS = ['jpg', 'jpeg', 'heic', 'heif', 'png', 'webp', 'avif', 'tif', 'tiff', 'bmp', 'gif'];

export default function ContactSheet() {
  const files = useToolFiles({ kinds: ['image'], extensions: EXTENSIONS, filterName: 'Images' });
  const run = useToolRun('images/contact-sheet', 'Contact Sheet');
  const { spec, update } = useOutputSpec({ filename: 'contact-sheet' });

  const [columns, setColumns] = useState(4);
  const [thumbSize, setThumbSize] = useState(320);
  const [gap, setGap] = useState(12);
  const [background, setBackground] = useState('#ffffff');
  const [labels, setLabels] = useState(true);
  /** The layout of the sheet that was actually built, so the preview caption cannot drift. */
  const [built, setBuilt] = useState<SheetLayout | null>(null);

  const layout = useMemo(
    () => sheetLayout({ count: files.files.length, columns, thumbSize, gap, labels }),
    [files.files.length, columns, thumbSize, gap, labels],
  );
  const huge = layout.width * layout.height > PIXEL_WARNING_THRESHOLD;
  const colorOk = isValidColor(background);
  const sheetPath = run.result?.results[0]?.path ?? null;

  const execute = () => {
    // Freeze the numbers this run is built from: the controls stay live afterwards.
    const used = layout;
    setBuilt(used);
    void run.execute({
      command: 'contact_sheet',
      total: files.files.length,
      inputs: files.paths,
      label: `Contact sheet of ${files.files.length} images`,
      args: {
        inputs: files.paths,
        opts: {
          columns: used.columns,
          thumbSize: used.thumbSize,
          gap: used.gap,
          background,
          labels,
        },
        output: spec,
      },
    });
  };

  return (
    <ToolShell
      main={
        <>
          <FileDropZone
            files={files}
            label="Drop the images for the sheet"
            hint="Drag the rows to set the order they appear in — left to right, top to bottom"
            allowFolders
            reorderable
          />

          {run.error && <ErrorDisplay error={run.error} onRetry={execute} />}

          {run.result && (
            <>
              <ResultPanel
                result={run.result}
                onProcessAgain={() => {
                  setBuilt(null);
                  run.reset();
                }}
                title="Contact sheet ready"
              />
              {sheetPath && (
                <Section
                  title="Preview"
                  description={built ? `${built.width} × ${built.height} px` : undefined}
                >
                  <SheetPreview
                    // The path is stable between runs, so the URL carries the run id.
                    src={assetUrlFresh(sheetPath, run.taskId ?? run.result.elapsedMs)}
                  />
                </Section>
              )}
            </>
          )}
        </>
      }
      aside={
        <>
          <Section
            title="Layout"
            description={
              files.isEmpty
                ? 'Add images to size the sheet'
                : `${layout.rows} row${layout.rows === 1 ? '' : 's'} · ${layout.width} × ${layout.height} px`
            }
          >
            <div className="space-y-3">
              <Field label="Columns">
                <PresetRow
                  presets={[2, 3, 4, 5, 6, 8].map((n) => ({ label: String(n), value: n }))}
                  active={columns}
                  onSelect={setColumns}
                  className="mb-2"
                />
                <NumberInput value={columns} onValueChange={setColumns} min={1} max={20} suffix="cols" />
              </Field>

              <Field label={`Thumbnail size — ${layout.thumbSize} px`} hint="The longest edge of each image.">
                <Slider min={48} max={1024} step={16} value={thumbSize} onChange={setThumbSize} />
              </Field>

              <OptionsGrid>
                <Field label="Gap" hint="Space between cells">
                  <NumberInput value={gap} onValueChange={setGap} min={0} max={200} suffix="px" />
                </Field>
                <Field label="Background" error={colorOk ? undefined : 'Use #RGB, #RRGGBB or #RRGGBBAA.'}>
                  <ColorInput value={background} onChange={setBackground} allowAlpha />
                </Field>
              </OptionsGrid>

              <Field inline label="Filename labels" hint="Print each name under its thumbnail">
                <Switch checked={labels} onCheckedChange={setLabels} />
              </Field>

              {huge && (
                <Alert tone="warn" title="That sheet is enormous.">
                  {layout.width} × {layout.height} pixels will be slow to build and heavy to open. Use fewer
                  columns or a smaller thumbnail size.
                </Alert>
              )}
            </div>
          </Section>

          <Section title="Where to save" description="One PNG, whatever the number of images.">
            <div className="space-y-3">
              <OutputSettings spec={spec} onChange={update} showSuffix={false} />
              <Field label="Sheet name" hint="The .png extension is added for you.">
                <Input
                  value={spec.filename ?? ''}
                  onChange={(e) => update({ filename: e.target.value || null })}
                  placeholder="contact-sheet"
                  spellCheck={false}
                />
              </Field>
            </div>
          </Section>

          <ToolActions
            run={run}
            onRun={execute}
            label="Build contact sheet"
            icon="LayoutGrid"
            disabled={files.isEmpty || !colorOk}
            disabledReason={
              files.isEmpty ? 'Add at least one image first.' : 'Fix the background colour first.'
            }
          />
        </>
      }
    />
  );
}

/**
 * The finished sheet. Every run can write to the same path, so the caller passes a
 * cache-busted URL rather than a bare asset URL the WebView is free to reuse.
 */
function SheetPreview({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);

  if (failed) {
    return (
      <div className="flex flex-col items-center gap-1 rounded-lg border border-line bg-canvas p-6 text-center">
        <Icon name="FileWarning" size={18} className="text-ink-faint" />
        <p className="text-[11.5px] text-ink-faint">
          The sheet was written, but it could not be shown here. Open it from the list above.
        </p>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-center overflow-hidden rounded-lg border border-line bg-canvas">
      <img
        src={src}
        alt="The contact sheet that was just produced"
        onError={() => setFailed(true)}
        className="max-h-[70vh] max-w-full object-contain"
      />
    </div>
  );
}
