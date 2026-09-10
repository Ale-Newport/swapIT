import { useState } from 'react';
import clsx from 'clsx';
import { ToolShell } from '@/components/tool';
import { Alert, Badge, Button, CopyButton, Field, Input, Section, Select, Slider, Stat } from '@/components/ui';
import {
  CONNECTIONS,
  SIZE_UNITS,
  SPEED_UNITS,
  bytesPerSecond,
  formatRate,
  formatSize,
  formatThroughput,
  formatTransferTime,
  parsePositive,
  sizeUnit,
  speedUnit,
  transferSeconds,
  trim,
} from './logic';

const SIZE_PRESETS = [
  { label: '100 MB', value: '100', unit: 'MB' },
  { label: '1 GB', value: '1', unit: 'GB' },
  { label: 'DVD · 4.7 GB', value: '4.7', unit: 'GB' },
  { label: 'Blu-ray · 25 GB', value: '25', unit: 'GB' },
  { label: 'Shoot · 128 GB', value: '128', unit: 'GB' },
  { label: 'Drive · 1 TB', value: '1', unit: 'TB' },
];

const GROUP_LABEL: Record<string, string> = {
  network: 'Network',
  wireless: 'Wireless',
  wired: 'Cable',
};

export default function TransferTimeCalculator() {
  const [sizeText, setSizeText] = useState('25');
  const [sizeUnitId, setSizeUnitId] = useState('GB');
  const [speedText, setSpeedText] = useState('100');
  const [speedUnitId, setSpeedUnitId] = useState('Mbps');
  const [efficiency, setEfficiency] = useState(85);

  const sizeValue = parsePositive(sizeText);
  const sUnit = sizeUnit(sizeUnitId);
  const bytes = sizeValue !== null && sUnit ? sizeValue * sUnit.bytes : null;

  const speedValue = parsePositive(speedText);
  const spUnit = speedUnit(speedUnitId);
  const nominalBps = speedValue !== null && spUnit ? speedValue * spUnit.bps : null;

  const factor = efficiency / 100;
  const effectiveBytesPerSecond = nominalBps === null ? null : bytesPerSecond(nominalBps, factor);
  const seconds = bytes !== null && nominalBps !== null ? transferSeconds(bytes, nominalBps, factor) : null;

  const conversionLine = (): string => {
    if (nominalBps === null || !spUnit) return 'Bits per second ÷ 8 = bytes per second';
    if (spUnit.isBytes) {
      return `${trim(speedValue, 2)} ${spUnit.label} × 8 = ${formatRate(nominalBps)} of link rate`;
    }
    return `${trim(speedValue, 2)} ${spUnit.label} ÷ 8 = ${formatThroughput(nominalBps / 8)} before overhead`;
  };

  const summary = () => {
    if (seconds === null || bytes === null) return '';
    return [
      `Size        ${formatSize(bytes)}`,
      `Link        ${formatRate(nominalBps)} at ${efficiency}% efficiency`,
      `Throughput  ${formatThroughput(effectiveBytesPerSecond)}`,
      `Time        ${formatTransferTime(seconds)} (${trim(seconds, 1)} s)`,
    ].join('\n');
  };

  return (
    <ToolShell
      main={
        <>
          <Section title="What and how fast" description="The answer updates as you type">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Size to transfer">
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <Input
                      value={sizeText}
                      aria-label="Size"
                      inputMode="decimal"
                      autoComplete="off"
                      onChange={(e) => setSizeText(e.target.value)}
                      className={clsx('font-mono', sizeText.trim() !== '' && sizeValue === null && 'border-danger')}
                    />
                  </div>
                  <div className="w-[92px] shrink-0">
                    <Select
                      value={sizeUnitId}
                      onChange={(e) => setSizeUnitId(e.target.value)}
                      options={SIZE_UNITS.map((u) => ({ value: u.id, label: u.label }))}
                      aria-label="Size unit"
                    />
                  </div>
                </div>
              </Field>

              <Field label="Connection speed">
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <Input
                      value={speedText}
                      aria-label="Speed"
                      inputMode="decimal"
                      autoComplete="off"
                      onChange={(e) => setSpeedText(e.target.value)}
                      className={clsx('font-mono', speedText.trim() !== '' && speedValue === null && 'border-danger')}
                    />
                  </div>
                  <div className="w-[92px] shrink-0">
                    <Select
                      value={speedUnitId}
                      onChange={(e) => setSpeedUnitId(e.target.value)}
                      options={SPEED_UNITS.map((u) => ({ value: u.id, label: u.label }))}
                      aria-label="Speed unit"
                    />
                  </div>
                </div>
              </Field>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-canvas px-3 py-2">
              <Badge tone="accent">÷ 8</Badge>
              <span className="font-mono text-[11.5px] text-ink-soft selectable">{conversionLine()}</span>
            </div>

            <div className="mt-4">
              <Field
                label={`Efficiency — ${efficiency}%`}
                hint="Protocol overhead, encoding and contention. 85% is a fair guess for a healthy link; 100% is the theoretical maximum."
              >
                <div className="pt-2">
                  <Slider value={efficiency} onChange={setEfficiency} min={10} max={100} step={1} />
                </div>
              </Field>
            </div>
          </Section>

          <Section
            title="Time needed"
            actions={<CopyButton size="sm" value={summary} label="Copy" disabled={!summary()} />}
          >
            <div className="rounded-lg border border-line bg-canvas px-4 py-3.5">
              <p className="text-[11px] uppercase tracking-wide text-ink-faint">Estimated transfer time</p>
              <p className="mt-1 text-[26px] font-semibold leading-tight text-ink selectable">
                {formatTransferTime(seconds)}
              </p>
              <p className="mt-0.5 text-[12.5px] text-ink-faint">
                {seconds === null
                  ? 'Enter a size and a speed above'
                  : `${trim(seconds, 1)} seconds at ${formatThroughput(effectiveBytesPerSecond)}`}
              </p>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
              <Stat label="Link rate" value={formatRate(nominalBps)} hint="as advertised" />
              <Stat
                label="Theoretical"
                value={nominalBps === null ? '—' : formatThroughput(nominalBps / 8)}
                hint="rate ÷ 8, no overhead"
              />
              <Stat label="Realistic" value={formatThroughput(effectiveBytesPerSecond)} hint={`at ${efficiency}%`} />
              <Stat label="Size" value={formatSize(bytes)} hint={bytes === null ? undefined : `${trim(bytes, 0)} bytes`} />
            </div>

            <p className="mt-4 font-mono text-[11.5px] leading-[1.7] text-ink-faint selectable">
              {seconds === null || bytes === null || nominalBps === null
                ? 'seconds = bytes × 8 ÷ (link bits per second × efficiency)'
                : `${trim(bytes, 0)} B × 8 ÷ (${trim(nominalBps, 0)} bit/s × ${factor.toFixed(2)}) = ${trim(seconds, 2)} s`}
            </p>
          </Section>

          <Section title="On other connections" description={`Time for ${formatSize(bytes)} at ${efficiency}% efficiency`}>
            <div className="overflow-x-auto">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-ink-faint">
                    <th className="py-1.5 pr-3 font-medium">Connection</th>
                    <th className="py-1.5 pr-3 text-right font-medium">Link rate</th>
                    <th className="py-1.5 pr-3 text-right font-medium">Realistic</th>
                    <th className="py-1.5 pr-3 text-right font-medium">Time</th>
                    <th className="py-1.5 font-medium"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {CONNECTIONS.map((c) => {
                    const t = bytes === null ? null : transferSeconds(bytes, c.bps, factor);
                    return (
                      <tr key={c.label}>
                        <td className="py-2 pr-3">
                          <p className="text-ink">{c.label}</p>
                          <p className="text-[11px] text-ink-faint">
                            {GROUP_LABEL[c.group]} · {c.note}
                          </p>
                        </td>
                        <td className="py-2 pr-3 text-right font-mono text-ink-soft">{formatRate(c.bps, 2)}</td>
                        <td className="py-2 pr-3 text-right font-mono text-ink-soft">
                          {formatThroughput(bytesPerSecond(c.bps, factor))}
                        </td>
                        <td className="py-2 pr-3 text-right font-mono text-ink selectable">
                          {formatTransferTime(t)}
                        </td>
                        <td className="py-2 text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              if (c.bps >= 1e9) {
                                setSpeedUnitId('Gbps');
                                setSpeedText(String(c.bps / 1e9));
                              } else {
                                setSpeedUnitId('Mbps');
                                setSpeedText(String(c.bps / 1e6));
                              }
                            }}
                          >
                            Use
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <Alert tone="info" className="mt-3">
              Nameplate rates are shared and encoded. USB 3.0 and SATA III spend 20% of the wire on 8b/10b coding,
              Wi-Fi halves under contention or a weak signal, and Thunderbolt shares its 40 Gbps with any displays on
              the chain. One efficiency figure cannot capture all of that — treat the table as an ordering, not a
              promise.
            </Alert>
          </Section>
        </>
      }
      aside={
        <>
          <Section title="Common sizes">
            <div className="flex flex-wrap gap-1.5">
              {SIZE_PRESETS.map((p) => (
                <Button
                  key={p.label}
                  size="sm"
                  onClick={() => {
                    setSizeText(p.value);
                    setSizeUnitId(p.unit);
                  }}
                >
                  {p.label}
                </Button>
              ))}
            </div>
          </Section>

          <Section title="Efficiency presets">
            <div className="flex flex-wrap gap-1.5">
              {[
                { label: '100% · theoretical', value: 100 },
                { label: '95% · wired ideal', value: 95 },
                { label: '85% · typical', value: 85 },
                { label: '65% · busy Wi-Fi', value: 65 },
                { label: '40% · poor signal', value: 40 },
              ].map((p) => (
                <Button key={p.label} size="sm" onClick={() => setEfficiency(p.value)}>
                  {p.label}
                </Button>
              ))}
            </div>
          </Section>

          <Section title="The ÷ 8 that catches everyone">
            <p className="text-[11.5px] leading-[1.6] text-ink-faint">
              Internet plans and cables are sold in bits per second; files are measured in bytes. Eight bits make a
              byte, so a 100 Mbps line downloads at most 12.5 MB/s and a gigabit line at most 125 MB/s. Notice the
              lower-case b in Mbps against the capital B in MB/s — that single letter is the whole difference.
            </p>
          </Section>
        </>
      }
    />
  );
}
