import { useState } from 'react';
import clsx from 'clsx';
import { ToolShell } from '@/components/tool';
import { Alert, Badge, Button, CopyButton, Field, Input, Section, Select, Stat } from '@/components/ui';
import {
  CAPACITY_UNITS,
  DRIVE_PRESETS,
  ITEM_TYPES,
  capacityUnit,
  countThatFit,
  driveReality,
  formatSize,
  formatSizeBinary,
  minutesToClock,
  parsePositive,
  trim,
} from './logic';

function defaultSizes(): Record<string, string> {
  return Object.fromEntries(ITEM_TYPES.map((i) => [i.id, String(i.defaultMB)]));
}

export default function StorageConverter() {
  const [capacityText, setCapacityText] = useState('1');
  const [unitId, setUnitId] = useState('TB');
  const [sizes, setSizes] = useState<Record<string, string>>(defaultSizes);

  const capacityValue = parsePositive(capacityText);
  const unit = capacityUnit(unitId);
  const capacityBytes = capacityValue !== null && unit ? capacityValue * unit.factor : null;
  // The comparison always starts from the decimal ("on the box") number, so it
  // reads correctly whether the capacity was typed in GB or in GiB.
  const decimalTwin = unit ? CAPACITY_UNITS.find((u) => u.system === 'decimal' && u.tier === unit.tier) : undefined;
  const advertisedValue = capacityBytes !== null && decimalTwin ? capacityBytes / decimalTwin.factor : null;
  const reality = advertisedValue !== null && unit ? driveReality(advertisedValue, unit.tier) : null;

  const rows = ITEM_TYPES.map((item) => {
    const mb = parsePositive(sizes[item.id] ?? '');
    const itemBytes = mb === null ? null : mb * 1e6;
    const count = capacityBytes !== null && itemBytes !== null ? countThatFit(capacityBytes, itemBytes) : null;
    return { item, mb, itemBytes, count };
  });

  const summary = () => {
    if (capacityBytes === null) return '';
    const lines = [`${capacityText} ${unitId} = ${trim(capacityBytes, 0)} bytes`, ''];
    for (const row of rows) {
      if (row.count === null) continue;
      const tail = row.item.perMinute ? ` (${minutesToClock(row.count)})` : '';
      lines.push(`${row.item.label.padEnd(30)} ${trim(row.count, 0)} ${row.item.pluralNoun}${tail}`);
    }
    return lines.join('\n');
  };

  return (
    <ToolShell
      main={
        <>
          <Section title="Capacity" description="Everything below follows this number">
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Size" className="min-w-[160px] flex-1">
                <Input
                  value={capacityText}
                  aria-label="Capacity"
                  inputMode="decimal"
                  autoComplete="off"
                  onChange={(e) => setCapacityText(e.target.value)}
                  className={clsx('font-mono', capacityText.trim() !== '' && capacityValue === null && 'border-danger')}
                />
              </Field>
              <Field label="Unit" className="w-[140px]">
                <Select
                  value={unitId}
                  onChange={(e) => setUnitId(e.target.value)}
                  options={CAPACITY_UNITS.map((u) => ({
                    value: u.id,
                    label: `${u.label} · ${u.system === 'decimal' ? '1000-based' : '1024-based'}`,
                  }))}
                />
              </Field>
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {DRIVE_PRESETS.map((p) => (
                <Button
                  key={p.label}
                  size="sm"
                  onClick={() => {
                    setCapacityText(p.value);
                    setUnitId(p.unit);
                  }}
                >
                  {p.label}
                </Button>
              ))}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
              <Stat label="Exact bytes" value={capacityBytes === null ? '—' : trim(capacityBytes, 0)} />
              <Stat label="Decimal" value={formatSize(capacityBytes)} hint="how it is sold" />
              <Stat label="Binary" value={formatSizeBinary(capacityBytes)} hint="how it is displayed" />
            </div>
          </Section>

          <Section
            title="What fits"
            description="Edit any average size — the counts follow"
            actions={
              <div className="flex items-center gap-1.5">
                <CopyButton size="sm" value={summary} label="Copy" disabled={!summary()} />
                <Button size="sm" variant="ghost" icon="RotateCcw" onClick={() => setSizes(defaultSizes())}>
                  Defaults
                </Button>
              </div>
            }
          >
            <div className="overflow-x-auto">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-ink-faint">
                    <th className="py-1.5 pr-3 font-medium">Item</th>
                    <th className="w-[110px] py-1.5 pr-3 font-medium">Average MB</th>
                    <th className="py-1.5 pr-3 text-right font-medium">How many fit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map(({ item, mb, count }) => (
                    <tr key={item.id}>
                      <td className="py-2 pr-3">
                        <p className="text-ink">{item.label}</p>
                        <p className="text-[11px] text-ink-faint">{item.note}</p>
                      </td>
                      <td className="py-2 pr-3">
                        <Input
                          value={sizes[item.id] ?? ''}
                          aria-label={`Average size of ${item.label} in megabytes`}
                          inputMode="decimal"
                          onChange={(e) => setSizes((prev) => ({ ...prev, [item.id]: e.target.value }))}
                          className={clsx(
                            'font-mono',
                            (sizes[item.id] ?? '').trim() !== '' && mb === null && 'border-danger',
                          )}
                        />
                      </td>
                      <td className="py-2 pr-3 text-right">
                        <p className="font-mono text-[13.5px] font-medium text-ink selectable">
                          {count === null ? '—' : trim(count, 0)}
                        </p>
                        <p className="text-[11px] text-ink-faint">
                          {count === null
                            ? item.pluralNoun
                            : item.perMinute
                              ? `${item.pluralNoun} · ${minutesToClock(count)}`
                              : item.pluralNoun}
                        </p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="mt-3 font-mono text-[11.5px] leading-[1.7] text-ink-faint selectable">
              {capacityBytes === null
                ? 'count = capacity in bytes ÷ average size, rounded down'
                : `${trim(capacityBytes, 0)} B ÷ (average MB × 1,000,000) rounded down`}
            </p>
          </Section>

          <Section title="Advertised versus formatted">
            {reality ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-line p-3">
                    <p className="text-[12px] text-ink-soft">On the box</p>
                    <p className="mt-1 text-[18px] font-semibold text-ink selectable">
                      {trim(advertisedValue, 2)} {decimalTwin?.label}
                    </p>
                    <p className="mt-1 font-mono text-[11px] text-ink-faint selectable">
                      {trim(reality.advertisedBytes, 0)} bytes
                    </p>
                  </div>
                  <div className="rounded-lg border border-line p-3">
                    <p className="text-[12px] text-ink-soft">What the system shows</p>
                    <p className="mt-1 text-[18px] font-semibold text-ink selectable">
                      {trim(reality.shownValue, 2)} {reality.shownUnitLabel}
                    </p>
                    <p className="mt-1 text-[11px] text-ink-faint">
                      <Badge tone="warn">−{reality.missingPercent.toFixed(2)}%</Badge>{' '}
                      looks like {trim(reality.missingInAdvertisedUnit, 2)} fewer units
                    </p>
                  </div>
                </div>

                <p className="mt-3 text-[12.5px] leading-[1.6] text-ink-soft">
                  Nothing is actually missing. The drive really holds {trim(reality.advertisedBytes, 0)} bytes; the
                  maker counts them in thousands and the operating system in 1024s. Formatting then takes a further
                  0.1–1% for the file system itself, and a recovery partition can take several gigabytes more.
                </p>

                <p className="mt-3 font-mono text-[11.5px] leading-[1.7] text-ink-faint selectable">
                  {trim(reality.advertisedBytes, 0)} ÷ 1024^{unit?.tier ?? 4} = {trim(reality.shownValue, 4)}{' '}
                  {reality.shownUnitLabel}
                </p>
              </>
            ) : (
              <p className="text-[12.5px] text-ink-faint">Enter a capacity to see how it will be reported.</p>
            )}
          </Section>
        </>
      }
      aside={
        <>
          <Section title="Where the defaults come from">
            <ul className="space-y-2 text-[11.5px] leading-[1.6] text-ink-faint">
              <li>
                <span className="font-medium text-ink-soft">Photos 4 MB</span> — a 12 MP phone JPEG at quality 85.
                RAW from a 24 MP body runs 20–30 MB.
              </li>
              <li>
                <span className="font-medium text-ink-soft">4K60 video 400 MB per minute</span> — roughly 53 Mbps,
                what a recent phone writes. ProRes is ten times that.
              </li>
              <li>
                <span className="font-medium text-ink-soft">MP3 320 kbps 2.4 MB per minute</span> — the arithmetic is
                exact: 320,000 bits ÷ 8 × 60.
              </li>
              <li>Every figure here is editable, because your files are not average files.</li>
            </ul>
          </Section>

          <Section title="Plan for headroom">
            <Alert tone="warn">
              A drive kept above about 90% full slows down and, on SSDs, wears faster. Treat roughly 10% as reserved
              when working out whether something fits.
            </Alert>
          </Section>
        </>
      }
    />
  );
}
