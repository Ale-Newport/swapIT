import { useState } from 'react';
import clsx from 'clsx';
import { ToolShell } from '@/components/tool';
import { Alert, Button, CopyButton, Field, Input, Section, Select, Stat } from '@/components/ui';
import {
  BINARY_UNITS,
  DECIMAL_UNITS,
  ambiguity,
  bestUnit,
  formatQuantity,
  fromBytes,
  parseAmount,
  toBytes,
  unitById,
  type Unit,
} from './logic';

const PRESETS: Array<{ label: string; value: string; unit: string }> = [
  { label: 'CD · 700 MB', value: '700', unit: 'MB' },
  { label: 'DVD · 4.7 GB', value: '4.7', unit: 'GB' },
  { label: 'Blu-ray · 25 GB', value: '25', unit: 'GB' },
  { label: 'RAM stick · 16 GiB', value: '16', unit: 'GiB' },
  { label: 'Drive · 1 TB', value: '1', unit: 'TB' },
  { label: 'Photo · 4 MB', value: '4', unit: 'MB' },
  { label: 'One byte', value: '1', unit: 'B' },
];

function UnitTable({ units, bytes, title, note }: { units: Unit[]; bytes: number | null; title: string; note: string }) {
  const best = bytes === null ? null : bestUnit(bytes, units[0].system);
  return (
    <div className="rounded-lg border border-line">
      <div className="border-b border-line px-3 py-2">
        <p className="text-[12.5px] font-medium text-ink">{title}</p>
        <p className="text-[11px] text-ink-faint">{note}</p>
      </div>
      <table className="w-full text-[12.5px]">
        <tbody className="divide-y divide-line">
          {units.map((u) => {
            const value = bytes === null ? null : fromBytes(bytes, u.id);
            const isBest = best?.id === u.id && bytes !== null && bytes > 0;
            return (
              <tr key={u.id} className={clsx(isBest && 'bg-accent-soft')}>
                <td className="w-16 py-1.5 pl-3 pr-2 font-mono text-ink-soft">{u.short}</td>
                <td className="py-1.5 pr-3 text-right font-mono text-ink selectable">{formatQuantity(value)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function FileSizeConverter() {
  const [amount, setAmount] = useState('4');
  const [unitId, setUnitId] = useState('GB');

  const value = parseAmount(amount);
  const unit = unitById(unitId);
  const bytes = value === null || !unit ? null : toBytes(value, unitId);
  const amb = value === null || !unit ? null : ambiguity(value, unit.tier);

  const summary = () => {
    if (bytes === null || !unit) return '';
    const lines = [`${formatQuantity(value)} ${unit.short} = ${formatQuantity(bytes)} bytes`, ''];
    for (const u of DECIMAL_UNITS) lines.push(`${u.short.padStart(3)}  ${formatQuantity(fromBytes(bytes, u.id))}`);
    lines.push('');
    for (const u of BINARY_UNITS.slice(1)) lines.push(`${u.short.padStart(3)}  ${formatQuantity(fromBytes(bytes, u.id))}`);
    return lines.join('\n');
  };

  return (
    <ToolShell
      main={
        <>
          <Section title="Size" description="Everything below updates as you type">
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Amount" className="min-w-[180px] flex-1">
                <Input
                  value={amount}
                  aria-label="Amount"
                  inputMode="decimal"
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(e) => setAmount(e.target.value)}
                  className={clsx('font-mono', amount.trim() !== '' && value === null && 'border-danger')}
                />
              </Field>
              <Field label="Unit" className="w-[220px]">
                <Select value={unitId} onChange={(e) => setUnitId(e.target.value)}>
                  <optgroup label="Decimal — powers of 1000">
                    {DECIMAL_UNITS.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.short} · {u.label}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Binary — powers of 1024">
                    {BINARY_UNITS.slice(1).map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.short} · {u.label}
                      </option>
                    ))}
                  </optgroup>
                </Select>
              </Field>
            </div>

            {amount.trim() !== '' && value === null && (
              <p className="mt-2 text-[11.5px] text-danger">
                That is not a size. Type a positive number such as 4, 4.7 or 1,024.
              </p>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-line bg-canvas px-3 py-2.5">
              <Stat
                label="Exact bytes"
                value={formatQuantity(bytes)}
                hint={unit && value !== null ? `${formatQuantity(value)} × ${formatQuantity(unit.factor)}` : undefined}
              />
              <Stat label="Bits" value={bytes === null ? '—' : formatQuantity(bytes * 8)} hint="bytes × 8" />
              <div className="ml-auto">
                <CopyButton size="sm" value={summary} label="Copy all" disabled={bytes === null} />
              </div>
            </div>
          </Section>

          <Section title="Both interpretations" description="The same byte count read each way">
            <div className="grid gap-3 sm:grid-cols-2">
              <UnitTable
                units={DECIMAL_UNITS}
                bytes={bytes}
                title="Decimal · SI"
                note="1 kB = 1000 B — drive makers, macOS, network gear"
              />
              <UnitTable
                units={BINARY_UNITS}
                bytes={bytes}
                title="Binary · IEC"
                note="1 KiB = 1024 B — RAM, Windows Explorer, most code"
              />
            </div>
          </Section>

          <Section title="Why the two disagree">
            {amb ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-line p-3">
                    <p className="text-[12px] text-ink-soft">
                      Read as <span className="font-medium text-ink">{amb.decimalUnit.short}</span> (decimal)
                    </p>
                    <p className="mt-1 font-mono text-[14px] font-semibold text-ink selectable">
                      {formatQuantity(amb.decimalBytes)} B
                    </p>
                    <p className="mt-1 font-mono text-[11px] text-ink-faint selectable">
                      {formatQuantity(value)} × 1000^{amb.decimalUnit.tier}
                    </p>
                  </div>
                  <div className="rounded-lg border border-line p-3">
                    <p className="text-[12px] text-ink-soft">
                      Read as <span className="font-medium text-ink">{amb.binaryUnit.short}</span> (binary)
                    </p>
                    <p className="mt-1 font-mono text-[14px] font-semibold text-ink selectable">
                      {formatQuantity(amb.binaryBytes)} B
                    </p>
                    <p className="mt-1 font-mono text-[11px] text-ink-faint selectable">
                      {formatQuantity(value)} × 1024^{amb.binaryUnit.tier}
                    </p>
                  </div>
                </div>
                <p className="mt-3 text-[12.5px] leading-[1.6] text-ink-soft">
                  A gap of{' '}
                  <span className="font-medium text-ink">{formatQuantity(amb.differenceBytes)} bytes</span> —{' '}
                  {amb.differencePercent.toFixed(3)}%. It is the reason a drive sold as{' '}
                  {formatQuantity(value)} {amb.decimalUnit.short} shows up as{' '}
                  {formatQuantity(amb.decimalBytes / amb.binaryUnit.factor)} {amb.binaryUnit.short} once formatted.
                </p>
              </>
            ) : (
              <p className="text-[12.5px] text-ink-faint">
                Plain bytes mean the same thing in both systems. Pick a unit from kB or KiB upwards to see the two
                readings compared.
              </p>
            )}
          </Section>
        </>
      }
      aside={
        <>
          <Section title="Try a size">
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <Button
                  key={p.label}
                  size="sm"
                  onClick={() => {
                    setAmount(p.value);
                    setUnitId(p.unit);
                  }}
                >
                  {p.label}
                </Button>
              ))}
            </div>
          </Section>

          <Section title="Who uses which">
            <ul className="space-y-2 text-[11.5px] leading-[1.6] text-ink-faint">
              <li>
                <span className="font-medium text-ink-soft">Decimal (1000)</span> — hard drive and SSD capacities,
                macOS Finder since 10.6, download sizes, network speeds.
              </li>
              <li>
                <span className="font-medium text-ink-soft">Binary (1024)</span> — RAM, CPU caches, Windows Explorer
                (which confusingly writes “GB” while showing GiB), most programming libraries.
              </li>
              <li>
                The IEC names — kibi, mebi, gibi — exist precisely to end this ambiguity, but almost nobody outside
                standards documents writes them.
              </li>
            </ul>
          </Section>

          <Section title="A useful anchor">
            <Alert tone="info">
              1 GiB is 1,073,741,824 bytes: 7.4% more than 1 GB. At terabyte scale the gap grows to 10%, which is the
              “missing” space people notice on a new drive.
            </Alert>
          </Section>
        </>
      }
    />
  );
}
