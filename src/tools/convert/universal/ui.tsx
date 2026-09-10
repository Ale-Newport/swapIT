// optional-dependency: Backends are probed with check_binary and unavailable targets are disabled, so no single binary is required to open this tool.
import clsx from 'clsx';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { checkBinary } from '@/core/bridge';
import { useToolFiles } from '@/core/useToolFiles';
import { useToolRun, type ToolRun } from '@/core/useToolRun';
import type { BinaryId, BinaryStatus, FileKind } from '@/core/types';
import {
  ErrorDisplay,
  FileDropZone,
  OutputSettings,
  ResultPanel,
  ToolActions,
  ToolShell,
  useOutputSpec,
} from '@/components/tool';
import { Alert, Badge, Button, Field, Icon, Section, Select, Slider, Spinner } from '@/components/ui';
import {
  AUDIO_BITRATES,
  CONVERTIBLE_KINDS,
  DEFAULT_QUALITY,
  GIF_FPS,
  GIF_WIDTHS,
  KIND_ICON,
  KIND_LABEL,
  PDF_DPI_CHOICES,
  availableTargets,
  groupFilesByKind,
  pickDefaultTarget,
  planConversion,
  targetsForKind,
  type ConversionTarget,
  type KindGroup,
  type QualityChoices,
  type TargetAvailability,
} from './logic';

/** Every program any route in the table can need, checked once on mount. */
const BINARIES: BinaryId[] = ['ffmpeg', 'magick', 'pdftoppm', 'pdftotext', 'soffice', 'pandoc'];

/** The kinds that run a job of their own — SVG is always a handoff. */
const RESULT_KINDS: FileKind[] = ['image', 'video', 'audio', 'pdf', 'document'];

interface GroupPlan {
  group: KindGroup;
  entries: TargetAvailability[];
  ext: string;
  /** The chosen target's row, carrying whether it can run and what is missing. */
  entry: TargetAvailability | undefined;
  target: ConversionTarget | undefined;
}

function FormatChips({
  entries,
  value,
  onChange,
}: {
  entries: TargetAvailability[];
  value: string;
  onChange: (ext: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {entries.map(({ target, available, missing, blocked }) => (
        <button
          key={target.ext}
          type="button"
          disabled={!available}
          title={
            available
              ? `.${target.ext} — ${target.engine}`
              : (blocked ?? `Needs ${missing.join(' and ')}, which is not installed`)
          }
          onClick={() => onChange(target.ext)}
          className={clsx(
            'rounded-lg border px-2.5 py-1 text-[12px] font-medium transition-colors',
            !available
              ? // Still show which one is picked when nothing here can run, so the
                // greyed-out row and the button's reason describe the same format.
                value === target.ext
                ? 'cursor-not-allowed border-line-strong bg-canvas text-ink-soft opacity-70'
                : 'cursor-not-allowed border-line bg-canvas text-ink-faint opacity-55'
              : value === target.ext
                ? 'border-ink bg-ink text-panel'
                : 'border-line bg-panel text-ink-soft hover:border-line-strong hover:text-ink',
          )}
        >
          {target.label}
        </button>
      ))}
    </div>
  );
}

function QualityControl({
  target,
  quality,
  onChange,
  qualityEnabled,
}: {
  target: ConversionTarget;
  quality: QualityChoices;
  onChange: (patch: Partial<QualityChoices>) => void;
  qualityEnabled: boolean;
}) {
  switch (target.quality) {
    case 'imageQuality':
      if (!qualityEnabled) {
        return (
          <p className="text-[11.5px] text-ink-faint">
            Encoded losslessly. Install ImageMagick to trade quality for a smaller file.
          </p>
        );
      }
      return (
        <Field label={`Quality — ${quality.imageQuality}`} hint="Lower means smaller files.">
          <Slider min={30} max={100} value={quality.imageQuality} onChange={(v) => onChange({ imageQuality: v })} />
        </Field>
      );
    case 'videoCrf':
      return (
        <Field
          label={`Quality — CRF ${quality.crf}`}
          hint="Lower is better looking and larger. 23 is the usual sweet spot."
        >
          <Slider min={16} max={34} value={quality.crf} onChange={(v) => onChange({ crf: v })} />
        </Field>
      );
    case 'audioBitrate':
      return (
        <Field label="Bitrate" hint="Higher keeps more detail and makes larger files.">
          <Select
            value={quality.audioBitrate}
            onChange={(e) => onChange({ audioBitrate: e.target.value })}
            options={AUDIO_BITRATES.map((b) => ({ value: b, label: b.replace('k', ' kbps') }))}
          />
        </Field>
      );
    case 'pdfRaster':
      return (
        <div className="space-y-3">
          <Field label="Resolution" hint="150 DPI reads well on screen; 300 is print quality.">
            <Select
              value={String(quality.pdfDpi)}
              onChange={(e) => onChange({ pdfDpi: Number(e.target.value) })}
              options={PDF_DPI_CHOICES.map((d) => ({ value: String(d), label: `${d} DPI` }))}
            />
          </Field>
          {target.ext === 'jpg' && (
            <Field label={`JPEG quality — ${quality.imageQuality}`}>
              <Slider min={30} max={100} value={quality.imageQuality} onChange={(v) => onChange({ imageQuality: v })} />
            </Field>
          )}
        </div>
      );
    case 'gif':
      return (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Width">
            <Select
              value={String(quality.gifWidth)}
              onChange={(e) => onChange({ gifWidth: Number(e.target.value) })}
              options={GIF_WIDTHS.map((w) => ({ value: String(w), label: `${w} px` }))}
            />
          </Field>
          <Field label="Frame rate">
            <Select
              value={String(quality.gifFps)}
              onChange={(e) => onChange({ gifFps: Number(e.target.value) })}
              options={GIF_FPS.map((f) => ({ value: String(f), label: `${f} fps` }))}
            />
          </Field>
        </div>
      );
    default:
      return null;
  }
}

export default function UniversalConverter() {
  const files = useToolFiles({ kinds: CONVERTIBLE_KINDS, filterName: 'Files', recursive: true });
  const { spec, update } = useOutputSpec();
  const navigate = useNavigate();

  // One job per kind, so a mixed drop reports its results separately.
  const imageRun = useToolRun('convert/universal', 'Universal Converter');
  const videoRun = useToolRun('convert/universal', 'Universal Converter');
  const audioRun = useToolRun('convert/universal', 'Universal Converter');
  const pdfRun = useToolRun('convert/universal', 'Universal Converter');
  const documentRun = useToolRun('convert/universal', 'Universal Converter');

  const runFor = (kind: FileKind): ToolRun | null => {
    switch (kind) {
      case 'image':
        return imageRun;
      case 'video':
        return videoRun;
      case 'audio':
        return audioRun;
      case 'pdf':
        return pdfRun;
      case 'document':
        return documentRun;
      default:
        return null;
    }
  };

  const [statuses, setStatuses] = useState<Record<string, BinaryStatus>>({});
  const [checked, setChecked] = useState(false);
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [quality, setQuality] = useState<QualityChoices>(DEFAULT_QUALITY);
  const [activeKind, setActiveKind] = useState<FileKind | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);

  useEffect(() => {
    let stale = false;
    void Promise.all(BINARIES.map((id) => checkBinary(id).catch(() => null))).then((list) => {
      if (stale) return;
      const map: Record<string, BinaryStatus> = {};
      for (const status of list) if (status) map[status.id] = status;
      setStatuses(map);
      setChecked(true);
    });
    return () => {
      stale = true;
    };
  }, []);

  // Until the check finishes, assume everything is there rather than flashing a
  // wall of greyed-out formats at someone who has FFmpeg installed.
  const isInstalled = useMemo(
    () => (id: BinaryId) => (checked ? (statuses[id]?.installed ?? false) : true),
    [checked, statuses],
  );

  const groups = useMemo(() => groupFilesByKind(files.files), [files.files]);

  const plans: GroupPlan[] = useMemo(
    () =>
      groups.map((group) => {
        const entries = availableTargets(group.kind, group.extensions, isInstalled);
        const wanted = chosen[group.kind];
        const usable = entries.find((e) => e.target.ext === wanted && e.available);
        const ext = usable ? wanted : pickDefaultTarget(entries, group.extensions);
        const entry = entries.find((e) => e.target.ext === ext);
        return { group, entries, ext, entry, target: entry?.target };
      }),
    [groups, chosen, isInstalled],
  );

  // When nothing in a group's table is available, `pickDefaultTarget` still names a
  // format so the panel has something to show — but running it would walk straight
  // into a missing_dependency error, so it is not a job that can be started.
  const runnable = plans.filter((p) => p.target && !p.target.handoff && p.entry?.available);
  const stalled = plans.filter((p) => p.target && !p.target.handoff && !p.entry?.available);
  const soleHandoff = runnable.length === 0 && plans.length === 1 && plans[0].target?.handoff ? plans[0] : null;
  const totalFiles = runnable.reduce((n, p) => n + p.group.paths.length, 0);

  /** Why the run button is off when files are waiting but no group can run. */
  const stalledReason = ((): string | null => {
    const first = stalled[0];
    if (!first) return null;
    if (first.entry?.blocked) return first.entry.blocked;
    const missing = [...new Set(stalled.flatMap((p) => p.entry?.missing ?? []))];
    if (missing.length === 0) return null;
    const names = missing.map((id) => statuses[id]?.label ?? id).join(' and ');
    return `${first.target?.label ?? `.${first.ext}`} needs ${names}, which is not installed — install it, or pick a format that is available.`;
  })();

  const openHandoff = (plan: GroupPlan) => {
    const handoff = plan.target?.handoff;
    if (!handoff) return;
    navigate(`/t/${handoff.toolId}`, { state: { files: plan.group.paths } });
  };

  /** Set by the Cancel button so the loop stops instead of starting the next kind. */
  const cancelled = useRef(false);

  const runGroup = async (plan: GroupPlan): Promise<'done' | 'failed' | 'cancelled'> => {
    const run = runFor(plan.group.kind);
    if (!run) return 'failed';
    setActiveKind(plan.group.kind);
    try {
      const job = planConversion({
        kind: plan.group.kind,
        targetExt: plan.ext,
        paths: plan.group.paths,
        output: spec,
        quality,
      });
      const batch = await run.execute({
        command: job.command,
        args: job.args,
        label: job.label,
        total: plan.group.paths.length,
        inputs: plan.group.paths,
      });
      // A cancelled job comes back either as null (the call threw) or as a batch
      // flagged cancelled — both mean the person asked for this to stop.
      if (batch?.cancelled || cancelled.current) return 'cancelled';
      return batch ? 'done' : 'failed';
    } catch (err) {
      setPlanError(err instanceof Error ? err.message : String(err));
      return 'failed';
    } finally {
      setActiveKind(null);
    }
  };

  const execute = async () => {
    setPlanError(null);
    cancelled.current = false;
    for (const plan of runnable) {
      const outcome = await runGroup(plan);
      // Cancel means "stop", not "skip to the next kind". A kind that simply failed
      // does not stop the others: each one reports its own result.
      if (outcome === 'cancelled' || cancelled.current) break;
    }
  };

  const runAll = () => void execute();

  /** Retry from a failure card: only the kind that failed, never the whole drop. */
  const retryGroup = (plan: GroupPlan) => {
    setPlanError(null);
    cancelled.current = false;
    void runGroup(plan);
  };

  const activeRun =
    (activeKind ? runFor(activeKind) : null) ??
    (runnable[0] ? runFor(runnable[0].group.kind) : null) ??
    imageRun;

  // ToolActions cancels whatever is running; it also has to stop the queue behind it.
  const actionRun: ToolRun = {
    ...activeRun,
    cancel: () => {
      cancelled.current = true;
      activeRun.cancel();
    },
  };

  const actionLabel = soleHandoff
    ? `Open ${soleHandoff.target?.handoff?.toolName ?? 'the right tool'}`
    : runnable.length === 0
      ? 'Convert'
      : runnable.length === 1
        ? `Convert to ${runnable[0].target?.label ?? ''}`
        : `Convert ${totalFiles} file${totalFiles === 1 ? '' : 's'}`;

  return (
    <ToolShell
      main={
        <>
          <FileDropZone
            files={files}
            label="Drop anything here"
            hint="Images, video, audio, PDFs, Office documents and SVG — mixed selections are fine"
            accept="Folders are expanded automatically"
            allowFolders
          />

          {files.isEmpty && (
            <Section title="What it converts" description="Every route below runs entirely on this Mac.">
              <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line">
                {CONVERTIBLE_KINDS.map((kind) => (
                  <li key={kind} className="flex items-start gap-2.5 bg-panel px-3 py-2">
                    <Icon name={KIND_ICON[kind]} size={14} className="mt-[2px] shrink-0 text-ink-faint" />
                    <span className="w-24 shrink-0 text-[12.5px] font-medium text-ink">{KIND_LABEL[kind]}</span>
                    <span className="min-w-0 flex-1 text-[12px] text-ink-faint">
                      {targetsForKind(kind)
                        .map((t) => t.label)
                        .join(' · ')}
                    </span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {planError && <Alert tone="danger" title="That conversion could not be started">{planError}</Alert>}

          {plans.map((plan) => {
            const handoff = plan.target?.handoff;
            if (!handoff) return null;
            return (
              <Alert
                key={plan.group.kind}
                tone="info"
                title={`${handoff.toolName} does this conversion`}
                action={
                  <Button size="sm" icon="ExternalLink" onClick={() => openHandoff(plan)}>
                    Open it
                  </Button>
                }
              >
                {handoff.reason} The {plan.group.paths.length} file
                {plan.group.paths.length === 1 ? '' : 's'} you picked will be carried over.
              </Alert>
            );
          })}

          {/* Results outlive the selection, so clearing the list does not hide what was just produced. */}
          {RESULT_KINDS.map((kind) => {
            const run = runFor(kind);
            if (!run || (!run.error && !run.result)) return null;
            const plan = runnable.find((p) => p.group.kind === kind);
            return (
              <Fragment key={kind}>
                {run.error && (
                  <ErrorDisplay error={run.error} onRetry={plan ? () => retryGroup(plan) : undefined} />
                )}
                {run.result && (
                  <ResultPanel result={run.result} title={`${KIND_LABEL[kind]} converted`} onProcessAgain={run.reset} />
                )}
              </Fragment>
            );
          })}
        </>
      }
      aside={
        <>
          {plans.length === 0 && (
            <Section title="Output format">
              <p className="text-[12.5px] text-ink-faint">
                Add a file and the formats it can become appear here, grouped by type.
              </p>
            </Section>
          )}

          {plans.map((plan) => {
            const { group, entries, ext, target } = plan;
            const missingIds = [...new Set(entries.filter((e) => !e.available).flatMap((e) => e.missing))];
            const blockedEntries = entries.filter((e) => !e.available && e.blocked);
            return (
              <Section
                key={group.kind}
                title={
                  <span className="flex items-center gap-2">
                    <Icon name={KIND_ICON[group.kind]} size={14} className="text-ink-faint" />
                    {KIND_LABEL[group.kind]}
                  </span>
                }
                description={`${group.paths.length} file${group.paths.length === 1 ? '' : 's'} · ${group.extensions
                  .map((e) => `.${e}`)
                  .join(' ')}`}
                actions={!checked ? <Spinner /> : undefined}
              >
                <div className="space-y-3">
                  <FormatChips
                    entries={entries}
                    value={ext}
                    onChange={(next) => setChosen((c) => ({ ...c, [group.kind]: next }))}
                  />

                  {target && (
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={target.handoff ? 'accent' : 'neutral'}>
                        <Icon name={target.handoff ? 'ExternalLink' : 'Terminal'} size={10} />
                        {target.engine}
                      </Badge>
                      {target.note && <span className="text-[11.5px] text-ink-faint">{target.note}</span>}
                    </div>
                  )}

                  {/* No quality knob for a format that cannot run: it would change nothing. */}
                  {target && !target.handoff && plan.entry?.available && (
                    <QualityControl
                      target={target}
                      quality={quality}
                      onChange={(patch) => setQuality((q) => ({ ...q, ...patch }))}
                      qualityEnabled={!target.qualityRequires || isInstalled(target.qualityRequires)}
                    />
                  )}

                  {missingIds.map((id) => {
                    const status = statuses[id];
                    const unlocks = entries
                      .filter((e) => e.missing.includes(id))
                      .map((e) => e.target.label)
                      .join(', ');
                    return (
                      <p key={id} className="text-[11.5px] leading-[1.5] text-ink-faint">
                        {unlocks} need{unlocks.includes(',') ? '' : 's'} {status?.label ?? id}, which is not installed
                        {' — '}
                        <code className="selectable rounded border border-line bg-canvas px-1 font-mono text-[11px] text-ink-soft">
                          {status?.installHint ?? `brew install ${id}`}
                        </code>
                      </p>
                    );
                  })}

                  {blockedEntries.map((entry) => (
                    <p key={entry.target.ext} className="text-[11.5px] leading-[1.5] text-ink-faint">
                      {entry.target.label}: {entry.blocked}
                    </p>
                  ))}
                </div>
              </Section>
            );
          })}

          {runnable.length > 0 && (
            <Section title="Where to save">
              <OutputSettings spec={spec} onChange={update} />
            </Section>
          )}

          <ToolActions
            run={actionRun}
            onRun={soleHandoff ? () => openHandoff(soleHandoff) : runAll}
            label={files.isEmpty ? 'Convert' : actionLabel}
            icon={soleHandoff ? 'ExternalLink' : 'Repeat'}
            disabled={files.isEmpty || (!soleHandoff && runnable.length === 0)}
            disabledReason={
              files.isEmpty
                ? 'Add at least one file first.'
                : (stalledReason ??
                  'Every file here is handled by another tool — open it from the cards on the left.')
            }
          />
        </>
      }
    />
  );
}
