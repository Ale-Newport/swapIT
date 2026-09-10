import { useState } from 'react';
import clsx from 'clsx';
import { OptionsGrid, PresetRow, ToolShell } from '@/components/tool';
import { Alert, Badge, Button, CopyButton, Field, Input, Section, Segmented, Select, Stat } from '@/components/ui';
import {
  AUDIO_PRESETS,
  CODECS,
  FPS_PRESETS,
  QUALITY_TIERS,
  RESOLUTIONS,
  VARIANCE,
  codecById,
  estimate,
  formatBitrate,
  formatSize,
  parseNonNegative,
  qualityById,
  trim,
  videoBitrateForTarget,
  type CodecId,
  type QualityId,
} from './logic';

const DURATION_UNITS = [
  { value: '1', label: 'seconds' },
  { value: '60', label: 'minutes' },
  { value: '3600', label: 'hours' },
];

const TARGET_UNITS = [
  { value: '1000000', label: 'MB' },
  { value: '1000000000', label: 'GB' },
];

function NumField({
  label,
  hint,
  value,
  onChange,
  suffix,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  suffix?: string;
}) {
  const invalid = value.trim() !== '' && parseNonNegative(value) === null;
  return (
    <Field label={label} hint={hint} error={invalid ? 'Enter a number' : undefined}>
      <div className="relative">
        <Input
          value={value}
          aria-label={label}
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => onChange(e.target.value)}
          className={clsx('font-mono', suffix && 'pr-12', invalid && 'border-danger focus:border-danger')}
        />
        {suffix && (
          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[11.5px] text-ink-faint">
            {suffix}
          </span>
        )}
      </div>
    </Field>
  );
}

export default function VideoSizeEstimator() {
  const [widthText, setWidthText] = useState('1920');
  const [heightText, setHeightText] = useState('1080');
  const [fpsText, setFpsText] = useState('30');
  const [codecId, setCodecId] = useState<CodecId>('h264');
  const [qualityId, setQualityId] = useState<QualityId>('standard');
  const [durationText, setDurationText] = useState('10');
  const [durationUnit, setDurationUnit] = useState('60');
  const [audioKbps, setAudioKbps] = useState('128');
  const [targetText, setTargetText] = useState('500');
  const [targetUnit, setTargetUnit] = useState('1000000');

  const width = parseNonNegative(widthText);
  const height = parseNonNegative(heightText);
  const fps = parseNonNegative(fpsText);
  const codec = codecById(codecId)!;
  const quality = qualityById(qualityId)!;
  const durationValue = parseNonNegative(durationText);
  const seconds = durationValue === null ? null : durationValue * Number(durationUnit);
  const audioBps = Number(audioKbps) * 1000;

  const result =
    width && height && fps && seconds !== null
      ? estimate({
          width,
          height,
          fps,
          bpp: codec.bpp,
          qualityFactor: quality.factor,
          seconds,
          audioBps,
        })
      : null;

  const targetValue = parseNonNegative(targetText);
  const targetBytes = targetValue === null ? null : targetValue * Number(targetUnit);
  const requiredVideoBps =
    targetBytes !== null && seconds !== null ? videoBitrateForTarget(targetBytes, seconds, audioBps) : null;
  const targetRatio =
    requiredVideoBps !== null && result && result.videoBps > 0 ? requiredVideoBps / result.videoBps : null;

  const megapixels = width && height ? (width * height) / 1e6 : null;

  const summary = () => {
    if (!result || seconds === null) return '';
    return [
      `${width} × ${height} @ ${fps} fps · ${codec.label} · ${quality.label}`,
      `Video bitrate  ${formatBitrate(result.videoBps)}`,
      `Audio bitrate  ${formatBitrate(result.audioBps)}`,
      `Duration       ${trim(seconds / 60, 2)} min`,
      `Estimated size ${formatSize(result.bytes)}  (${formatSize(result.lowBytes)} – ${formatSize(result.highBytes)})`,
      `Per minute     ${formatSize(result.bytesPerMinute)}`,
    ].join('\n');
  };

  return (
    <ToolShell
      main={
        <>
          <Section title="Source settings" description="Everything recalculates as you type">
            <OptionsGrid cols={3}>
              <NumField label="Width" value={widthText} onChange={setWidthText} suffix="px" />
              <NumField label="Height" value={heightText} onChange={setHeightText} suffix="px" />
              <NumField label="Frame rate" value={fpsText} onChange={setFpsText} suffix="fps" />
            </OptionsGrid>

            <div className="mt-3">
              <PresetRow
                presets={FPS_PRESETS.map((f) => ({ label: String(f), value: String(f) }))}
                active={fpsText}
                onSelect={setFpsText}
              />
            </div>

            <div className="mt-4 space-y-3">
              <Field label="Codec" hint={codec.note}>
                <Segmented
                  value={codecId}
                  onChange={setCodecId}
                  options={CODECS.map((c) => ({ value: c.id, label: c.label, title: c.note }))}
                />
              </Field>
              <Field label="Quality tier" hint={quality.note}>
                <Segmented
                  value={qualityId}
                  onChange={setQualityId}
                  options={QUALITY_TIERS.map((q) => ({ value: q.id, label: q.label, title: q.note }))}
                />
              </Field>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field label="Duration">
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <Input
                      value={durationText}
                      aria-label="Duration"
                      inputMode="decimal"
                      onChange={(e) => setDurationText(e.target.value)}
                      className={clsx(
                        'font-mono',
                        durationText.trim() !== '' && durationValue === null && 'border-danger',
                      )}
                    />
                  </div>
                  <div className="w-[104px] shrink-0">
                    <Select
                      value={durationUnit}
                      onChange={(e) => setDurationUnit(e.target.value)}
                      options={DURATION_UNITS}
                      aria-label="Duration unit"
                    />
                  </div>
                </div>
              </Field>
              <Field label="Audio track">
                <Select
                  value={audioKbps}
                  onChange={(e) => setAudioKbps(e.target.value)}
                  options={AUDIO_PRESETS.map((a) => ({ value: String(a.value), label: a.label }))}
                />
              </Field>
            </div>
          </Section>

          <Section
            title="Estimated output"
            actions={<CopyButton size="sm" value={summary} label="Copy" disabled={!summary()} />}
          >
            <div className="rounded-lg border border-line bg-canvas px-4 py-3.5">
              <p className="text-[11px] uppercase tracking-wide text-ink-faint">Most likely size</p>
              <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-[26px] font-semibold leading-tight text-ink selectable">
                  {formatSize(result?.bytes ?? null)}
                </span>
                <Badge tone="neutral">± {Math.round(VARIANCE * 100)}%</Badge>
              </div>
              <p className="mt-1 text-[12.5px] text-ink-faint">
                {result
                  ? `Realistically between ${formatSize(result.lowBytes)} and ${formatSize(result.highBytes)} depending on how busy the picture is`
                  : 'Fill in a resolution, a frame rate and a duration'}
              </p>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
              <Stat label="Video bitrate" value={formatBitrate(result?.videoBps ?? null)} hint={codec.label} />
              <Stat label="Total bitrate" value={formatBitrate(result?.totalBps ?? null)} hint="video + audio" />
              <Stat label="Per minute" value={formatSize(result?.bytesPerMinute ?? null)} />
              <Stat
                label="Frame size"
                value={megapixels === null ? '—' : `${megapixels.toFixed(2)} MP`}
                hint={width && height ? `${trim(width * height, 0)} pixels` : undefined}
              />
            </div>

            <p className="mt-4 font-mono text-[11.5px] leading-[1.7] text-ink-faint selectable">
              {result && width && height && fps
                ? `video = ${codec.bpp} bpp × ${trim(width, 0)} × ${trim(height, 0)} × 30 × (${fps}÷30)^0.75 × ${quality.factor} = ${formatBitrate(result.videoBps)}`
                : 'video bitrate = bits-per-pixel × width × height × 30 × (fps ÷ 30)^0.75 × quality'}
              <br />
              {result && seconds !== null
                ? `bytes = (${trim(result.totalBps, 0)} bit/s × ${trim(seconds, 2)} s) ÷ 8 = ${trim(result.bytes, 0)}`
                : 'bytes = (video + audio bitrate) × seconds ÷ 8'}
            </p>

            <Alert tone="info" className="mt-3">
              This is a model, not a measurement. Modern encoders use variable bitrate: a locked-off interview lands
              well below the estimate, while confetti, rain, foliage or heavy grain can exceed the upper bound. Use it
              to choose a target, then check the real file.
            </Alert>
          </Section>

          <Section title="Working back from a target size" description="The bitrate that fits a given budget">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Target size">
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <Input
                      value={targetText}
                      aria-label="Target size"
                      inputMode="decimal"
                      onChange={(e) => setTargetText(e.target.value)}
                      className={clsx('font-mono', targetText.trim() !== '' && targetValue === null && 'border-danger')}
                    />
                  </div>
                  <div className="w-[92px] shrink-0">
                    <Select
                      value={targetUnit}
                      onChange={(e) => setTargetUnit(e.target.value)}
                      options={TARGET_UNITS}
                      aria-label="Target size unit"
                    />
                  </div>
                </div>
              </Field>
              <div className="flex flex-col justify-center gap-1">
                <p className="text-[11px] uppercase tracking-wide text-ink-faint">Video bitrate to use</p>
                <p className="text-[18px] font-semibold leading-tight text-ink selectable">
                  {requiredVideoBps === null || requiredVideoBps < 0 ? '—' : formatBitrate(requiredVideoBps)}
                </p>
                <p className="text-[11.5px] text-ink-faint">
                  {targetRatio === null
                    ? 'Enter a target size and a duration'
                    : targetRatio < 0
                      ? 'The audio track alone is bigger than this target'
                      : `${trim(targetRatio, 2)}× the bitrate of the estimate above`}
                </p>
              </div>
            </div>

            {requiredVideoBps !== null && requiredVideoBps < 0 && (
              <Alert tone="warn" className="mt-3" title="Target too small">
                {formatBitrate(audioBps)} of audio over this duration already needs{' '}
                {formatSize((audioBps * (seconds ?? 0)) / 8)}. Shorten the clip, drop the audio bitrate or raise the
                target.
              </Alert>
            )}

            {targetRatio !== null && targetRatio > 0 && (
              <p className="mt-3 text-[12px] text-ink-soft">
                {targetRatio < 0.6
                  ? 'Well below the quality tier you picked — expect softness and blocking in motion.'
                  : targetRatio < 0.9
                    ? 'A little tight; drop one quality tier or reduce the resolution to compensate.'
                    : targetRatio < 1.4
                      ? 'In the same range as the estimate — this target is realistic.'
                      : 'More generous than needed; you could raise the quality tier or keep the headroom.'}
              </p>
            )}

            <p className="mt-3 font-mono text-[11.5px] leading-[1.7] text-ink-faint selectable">
              {targetBytes !== null && seconds
                ? `video = (${trim(targetBytes, 0)} B × 8 ÷ ${trim(seconds, 2)} s) − ${trim(audioBps, 0)} bit/s = ${trim(requiredVideoBps, 0)} bit/s`
                : 'video bitrate = target bytes × 8 ÷ seconds − audio bitrate'}
            </p>
          </Section>
        </>
      }
      aside={
        <>
          <Section title="Resolution presets">
            <div className="flex flex-wrap gap-1.5">
              {RESOLUTIONS.map((r) => (
                <Button
                  key={r.label}
                  size="sm"
                  onClick={() => {
                    setWidthText(String(r.width));
                    setHeightText(String(r.height));
                  }}
                >
                  {r.label}
                </Button>
              ))}
            </div>
            <p className="mt-3 text-[11.5px] text-ink-faint">
              {RESOLUTIONS.map((r) => `${r.label} ${r.width}×${r.height}`).slice(0, 3).join(' · ')} …
            </p>
          </Section>

          <Section title="Codec factors" description="Bits per pixel per frame at standard quality">
            <table className="w-full text-[12px]">
              <tbody className="divide-y divide-line">
                {CODECS.map((c) => (
                  <tr key={c.id} className={clsx(c.id === codecId && 'bg-accent-soft')}>
                    <td className="py-1.5 pr-2 text-ink-soft">{c.label}</td>
                    <td className="py-1.5 text-right font-mono text-ink">{c.bpp}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-[11px] leading-[1.6] text-ink-faint">
              Anchored on H.264 1080p30 ≈ 8 Mbps, the figure YouTube publishes for uploads. The others are the usual
              efficiency claims measured at equal visual quality.
            </p>
          </Section>

          <Section title="Reset">
            <Button
              size="sm"
              icon="RotateCcw"
              onClick={() => {
                setWidthText('1920');
                setHeightText('1080');
                setFpsText('30');
                setCodecId('h264');
                setQualityId('standard');
                setDurationText('10');
                setDurationUnit('60');
                setAudioKbps('128');
                setTargetText('500');
                setTargetUnit('1000000');
              }}
            >
              Back to defaults
            </Button>
          </Section>
        </>
      }
    />
  );
}
