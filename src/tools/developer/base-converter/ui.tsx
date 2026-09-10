import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { ToolShell } from '@/components/tool';
import { Alert, Badge, Button, CopyButton, Field, Input, Section, Select, Stat } from '@/components/ui';
import {
  MAX_BASE,
  MIN_BASE,
  allowedDigits,
  baseName,
  bitLength,
  byteLength,
  formatInBase,
  groupBinary,
  parseInBase,
  widthNotes,
} from './logic';

type FieldId = 'bin' | 'oct' | 'dec' | 'hex' | 'custom';

const ROWS: Array<{ id: FieldId; label: string; base: number | null; hint: string }> = [
  { id: 'bin', label: 'Binary', base: 2, hint: 'base 2' },
  { id: 'oct', label: 'Octal', base: 8, hint: 'base 8' },
  { id: 'dec', label: 'Decimal', base: 10, hint: 'base 10' },
  { id: 'hex', label: 'Hexadecimal', base: 16, hint: 'base 16' },
  { id: 'custom', label: 'Custom base', base: null, hint: '' },
];

const SAMPLES = [
  { label: '255', text: '255' },
  { label: '1024', text: '1024' },
  { label: '65535', text: '65535' },
  { label: '2^64 − 1', text: '18446744073709551615' },
  { label: '−128', text: '-128' },
];

function baseOf(field: FieldId, customBase: number): number {
  switch (field) {
    case 'bin':
      return 2;
    case 'oct':
      return 8;
    case 'dec':
      return 10;
    case 'hex':
      return 16;
    default:
      return customBase;
  }
}

export default function BaseConverter() {
  const [customBase, setCustomBase] = useState(12);
  const [source, setSource] = useState<{ field: FieldId; text: string }>({ field: 'dec', text: '255' });
  const [groupSize, setGroupSize] = useState(4);

  const parsed = useMemo(() => {
    if (!source.text.trim()) return { value: null as bigint | null, error: null as string | null };
    try {
      return { value: parseInBase(source.text, baseOf(source.field, customBase)), error: null };
    } catch (err) {
      return { value: null, error: err instanceof Error ? err.message : String(err) };
    }
  }, [source, customBase]);

  const value = parsed.value;
  const binary = value === null ? '' : formatInBase(value, 2);

  const display = (field: FieldId): string => {
    if (field === source.field) return source.text;
    if (value === null) return '';
    return formatInBase(value, baseOf(field, customBase));
  };

  return (
    <ToolShell
      main={
        <>
          <Section title="Value" description="Type in any field — the others follow instantly">
            <div className="space-y-2.5">
              {ROWS.map((row) => {
                const base = row.base ?? customBase;
                const isSource = row.id === source.field;
                const shown = display(row.id);
                return (
                  <div key={row.id} className="flex items-end gap-2">
                    <div className="w-[120px] shrink-0 pb-2">
                      <p className="text-[12.5px] font-medium text-ink">{row.label}</p>
                      <p className="text-[11px] text-ink-faint">{row.hint || `base ${customBase}`}</p>
                    </div>
                    <div className="min-w-0 flex-1">
                      <Input
                        value={shown}
                        spellCheck={false}
                        autoComplete="off"
                        placeholder={`Digits ${allowedDigits(base)}`}
                        onChange={(e) => setSource({ field: row.id, text: e.target.value })}
                        className={clsx('font-mono', isSource && parsed.error && 'border-danger focus:border-danger')}
                      />
                    </div>
                    <CopyButton value={shown} size="sm" variant="ghost" disabled={!shown} className="w-[84px] shrink-0" />
                  </div>
                );
              })}
            </div>

            {parsed.error && (
              <Alert
                tone="danger"
                className="mt-3"
                title={`That is not a valid ${baseName(baseOf(source.field, customBase))} number`}
              >
                {parsed.error}
              </Alert>
            )}
          </Section>

          <Section title="Bits">
            {value === null ? (
              <p className="text-[12.5px] text-ink-faint">Enter a number to see its bit layout.</p>
            ) : (
              <div className="space-y-3.5">
                <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
                  <Stat label="Bit length" value={`${bitLength(value)} bit${bitLength(value) === 1 ? '' : 's'}`} />
                  <Stat label="Bytes" value={byteLength(value).toLocaleString()} hint="rounded up" />
                  <Stat label="Sign" value={value < 0n ? 'Negative' : 'Positive'} />
                  <Stat label="Decimal digits" value={formatInBase(value, 10).replace('-', '').length.toLocaleString()} />
                </div>

                <div>
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <p className="text-[12px] font-medium text-ink-soft">
                      Grouped binary · {groupSize}-bit groups
                    </p>
                    <CopyButton value={() => groupBinary(binary, groupSize)} size="sm" variant="ghost" />
                  </div>
                  <p className="max-h-40 overflow-y-auto break-all rounded-lg border border-line bg-canvas p-3 font-mono text-[12.5px] leading-[1.7] text-ink selectable">
                    {groupBinary(binary, groupSize)}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[12px] text-ink-faint">Fits in</span>
                  {widthNotes(value).map((w) => (
                    <Badge key={w.label} tone={w.fits ? 'success' : 'neutral'}>
                      {w.label} {w.fits ? '✓' : '✗'}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </Section>
        </>
      }
      aside={
        <>
          <Section title="Options">
            <div className="space-y-3">
              <Field label="Custom base" hint={`Digits ${allowedDigits(customBase)}`}>
                <Select
                  value={String(customBase)}
                  onChange={(e) => setCustomBase(Number(e.target.value))}
                  options={Array.from({ length: MAX_BASE - MIN_BASE + 1 }, (_, i) => {
                    const b = MIN_BASE + i;
                    return { value: String(b), label: `Base ${b}` };
                  })}
                />
              </Field>
              <Field label="Binary grouping">
                <Select
                  value={String(groupSize)}
                  onChange={(e) => setGroupSize(Number(e.target.value))}
                  options={[
                    { value: '4', label: '4 bits (nibbles)' },
                    { value: '8', label: '8 bits (bytes)' },
                    { value: '16', label: '16 bits' },
                  ]}
                />
              </Field>
            </div>
          </Section>

          <Section title="Try a value">
            <div className="flex flex-wrap gap-1.5">
              {SAMPLES.map((s) => (
                <Button key={s.label} size="sm" onClick={() => setSource({ field: 'dec', text: s.text })}>
                  {s.label}
                </Button>
              ))}
              <Button size="sm" variant="ghost" icon="X" onClick={() => setSource({ field: 'dec', text: '' })}>
                Clear
              </Button>
            </div>
            <p className="mt-3 text-[11.5px] leading-[1.6] text-ink-faint">
              Values are held as BigInt, so numbers far beyond 2<sup>53</sup> convert exactly. Underscores, spaces and
              the 0x / 0b / 0o prefixes are accepted in the matching field.
            </p>
          </Section>
        </>
      }
    />
  );
}
