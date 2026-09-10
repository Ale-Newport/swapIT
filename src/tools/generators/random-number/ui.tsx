import { useCallback, useEffect, useMemo, useState } from 'react';
import { OptionsGrid, PresetRow, ToolShell } from '@/components/tool';
import {
  Alert,
  Badge,
  Button,
  CopyButton,
  Field,
  Input,
  NumberInput,
  Section,
  Segmented,
  Select,
  Stat,
  Switch,
} from '@/components/ui';
import {
  MAX_COUNT,
  MAX_PRECISION,
  diceRange,
  distinctValues,
  formatNumber,
  generateNumbers,
  parseDice,
  rollDice,
  type DiceResult,
  type NumberOptions,
  type SortOrder,
} from './logic';

type Mode = 'numbers' | 'dice';

const DICE_PRESETS = ['d20', '2d6', '3d6+2', '4d6', 'd100', '2d6+1d4'];

/** Past this many dice in one group the faces stop being readable anyway. */
const DICE_SHOWN = 60;

export default function RandomNumber() {
  const [mode, setMode] = useState<Mode>('numbers');

  const [options, setOptions] = useState<NumberOptions>({
    min: 1,
    max: 100,
    precision: 0,
    count: 10,
    allowDuplicates: true,
    sort: 'none',
  });
  const [numbers, setNumbers] = useState<number[]>([]);
  const [numberError, setNumberError] = useState<string | null>(null);

  const [notation, setNotation] = useState('3d6+2');
  const [throws, setThrows] = useState(1);
  const [results, setResults] = useState<DiceResult[]>([]);
  const [diceError, setDiceError] = useState<string | null>(null);

  const set = (patch: Partial<NumberOptions>) => setOptions((o) => ({ ...o, ...patch }));

  const draw = useCallback(() => {
    try {
      setNumbers(generateNumbers(options));
      setNumberError(null);
    } catch (err) {
      setNumbers([]);
      setNumberError(err instanceof Error ? err.message : String(err));
    }
  }, [options]);

  const roll = useCallback(() => {
    try {
      const parsed = parseDice(notation);
      const rolled = Array.from({ length: Math.max(1, Math.min(50, throws)) }, () => rollDice(parsed));
      setResults(rolled);
      setDiceError(null);
    } catch (err) {
      setResults([]);
      setDiceError(err instanceof Error ? err.message : String(err));
    }
  }, [notation, throws]);

  useEffect(() => {
    if (mode === 'numbers') draw();
  }, [mode, draw]);

  useEffect(() => {
    if (mode === 'dice') roll();
  }, [mode, roll]);

  const available = useMemo(() => {
    try {
      return distinctValues(options.min, options.max, options.precision);
    } catch {
      return null;
    }
  }, [options.min, options.max, options.precision]);

  const capped =
    !options.allowDuplicates && available !== null && options.count > available ? available : null;

  const text = numbers.map((n) => formatNumber(n, options.precision)).join('\n');
  const sum = numbers.reduce((a, b) => a + b, 0);

  const parsedNotation = useMemo(() => {
    try {
      return parseDice(notation);
    } catch {
      return null;
    }
  }, [notation]);

  const grandTotal = results.reduce((a, r) => a + r.total, 0);

  return (
    <ToolShell
      main={
        mode === 'numbers' ? (
          <>
            <Section
              title={`${numbers.length} number${numbers.length === 1 ? '' : 's'}`}
              description={
                available !== null
                  ? `${formatNumber(Math.min(options.min, options.max), options.precision)} to ${formatNumber(
                      Math.max(options.min, options.max),
                      options.precision,
                    )} · ${available.toLocaleString()} possible value${available === 1 ? '' : 's'}`
                  : undefined
              }
              actions={
                <>
                  <CopyButton value={() => text} label="Copy" disabled={numbers.length === 0} />
                  <CopyButton
                    value={() => numbers.map((n) => formatNumber(n, options.precision)).join(', ')}
                    label="Copy as list"
                    disabled={numbers.length === 0}
                  />
                  <Button size="sm" variant="ghost" icon="RefreshCw" onClick={draw}>
                    Draw again
                  </Button>
                </>
              }
            >
              {numberError ? (
                <Alert tone="danger" title="That range does not work">
                  {numberError}
                </Alert>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {numbers.map((n, i) => (
                    <span
                      key={`${i}-${n}`}
                      className="selectable rounded-lg border border-line bg-canvas px-2.5 py-1 font-mono text-[13px] text-ink"
                    >
                      {formatNumber(n, options.precision)}
                    </span>
                  ))}
                </div>
              )}
            </Section>

            {numbers.length > 1 && !numberError && (
              <Section title="At a glance">
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <Stat label="Lowest" value={formatNumber(Math.min(...numbers), options.precision)} />
                  <Stat label="Highest" value={formatNumber(Math.max(...numbers), options.precision)} />
                  <Stat label="Sum" value={formatNumber(sum, options.precision)} />
                  <Stat label="Average" value={formatNumber(sum / numbers.length, Math.max(2, options.precision))} />
                </div>
              </Section>
            )}
          </>
        ) : (
          <Section
            title={parsedNotation ? parsedNotation.canonical : 'Dice'}
            description={
              parsedNotation
                ? `Each throw lands between ${diceRange(parsedNotation).min} and ${diceRange(parsedNotation).max}`
                : undefined
            }
            actions={
              <>
                <CopyButton
                  value={() => results.map((r) => String(r.total)).join('\n')}
                  label="Copy totals"
                  disabled={results.length === 0}
                />
                <Button size="sm" variant="ghost" icon="RefreshCw" onClick={roll}>
                  Roll again
                </Button>
              </>
            }
          >
            {diceError ? (
              <Alert tone="danger" title="That is not a roll I can read">
                {diceError}
              </Alert>
            ) : (
              <div className="space-y-3">
                {results.map((result, index) => (
                  <div key={index} className="rounded-lg border border-line bg-canvas p-3">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                      {result.rolls.map((r, i) => (
                        <div key={i} className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[11.5px] text-ink-faint">
                            {r.term.sign === -1 ? '−' : i > 0 ? '+' : ''}
                            {r.term.count}d{r.term.sides}
                          </span>
                          {r.values.length > DICE_SHOWN ? (
                            <span className="font-mono text-[12px] text-ink">
                              {Math.abs(r.subtotal)}
                              <span className="ml-1.5 font-sans text-[11.5px] text-ink-faint">
                                (too many dice to show each face)
                              </span>
                            </span>
                          ) : (
                            r.values.map((value, j) => (
                              <span
                                key={j}
                                className="inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-line-strong bg-panel px-1.5 font-mono text-[12px] text-ink"
                              >
                                {value}
                              </span>
                            ))
                          )}
                        </div>
                      ))}
                      {result.modifier !== 0 && (
                        <span className="text-[12px] text-ink-soft">
                          {result.modifier < 0 ? '−' : '+'} {Math.abs(result.modifier)}
                        </span>
                      )}
                      <span className="ml-auto flex items-center gap-2">
                        <span className="text-[11px] uppercase tracking-wide text-ink-faint">Total</span>
                        <span className="text-[17px] font-semibold text-ink selectable">{result.total}</span>
                      </span>
                    </div>
                  </div>
                ))}
                {results.length > 1 && (
                  <div className="flex items-center gap-3 px-1">
                    <Badge tone="accent">{results.length} throws</Badge>
                    <span className="text-[12.5px] text-ink-soft">
                      Sum of totals {grandTotal} · average {(grandTotal / results.length).toFixed(2)}
                    </span>
                  </div>
                )}
              </div>
            )}
          </Section>
        )
      }
      aside={
        <>
          <Section title="Mode">
            <Segmented
              value={mode}
              onChange={setMode}
              options={[
                { value: 'numbers', label: 'Range' },
                { value: 'dice', label: 'Dice' },
              ]}
              className="w-full"
            />
          </Section>

          {mode === 'numbers' ? (
            <>
              <Section title="Range">
                <div className="space-y-3">
                  <OptionsGrid>
                    <Field label="Minimum">
                      <NumberInput
                        value={options.min}
                        step={options.precision > 0 ? 10 ** -options.precision : 1}
                        onValueChange={(min) => set({ min })}
                      />
                    </Field>
                    <Field label="Maximum">
                      <NumberInput
                        value={options.max}
                        step={options.precision > 0 ? 10 ** -options.precision : 1}
                        onValueChange={(max) => set({ max })}
                      />
                    </Field>
                  </OptionsGrid>
                  <Field label="Decimal places" hint={options.precision === 0 ? 'Whole numbers only.' : undefined}>
                    <NumberInput
                      value={options.precision}
                      min={0}
                      max={MAX_PRECISION}
                      onValueChange={(precision) => set({ precision })}
                      suffix="dp"
                    />
                  </Field>
                </div>
              </Section>

              <Section title="How many">
                <div className="space-y-3">
                  <PresetRow
                    presets={[1, 5, 10, 50, 100].map((c) => ({ label: String(c), value: c }))}
                    active={options.count}
                    onSelect={(count) => set({ count })}
                  />
                  <Field label="Count" hint={`Up to ${MAX_COUNT.toLocaleString()}.`}>
                    <NumberInput
                      value={options.count}
                      min={1}
                      max={MAX_COUNT}
                      onValueChange={(count) => set({ count })}
                    />
                  </Field>
                  <Field inline label="Allow duplicates" hint="Off draws without replacement">
                    <Switch
                      checked={options.allowDuplicates}
                      onCheckedChange={(allowDuplicates) => set({ allowDuplicates })}
                    />
                  </Field>
                  {capped !== null && (
                    <Alert tone="info">
                      This range holds only {capped.toLocaleString()} different value
                      {capped === 1 ? '' : 's'}, so a draw without duplicates stops there.
                    </Alert>
                  )}
                  <Field label="Order">
                    <Select
                      value={options.sort}
                      onChange={(e) => set({ sort: e.target.value as SortOrder })}
                      options={[
                        { value: 'none', label: 'As drawn' },
                        { value: 'asc', label: 'Lowest first' },
                        { value: 'desc', label: 'Highest first' },
                      ]}
                    />
                  </Field>
                </div>
              </Section>

              <Button variant="primary" size="lg" icon="Dices" full onClick={draw}>
                Draw numbers
              </Button>
            </>
          ) : (
            <>
              <Section title="Notation">
                <div className="space-y-3">
                  <Field label="Roll" hint="NdM plus or minus a modifier — 3d6+2, d20, 2d6+1d4-1.">
                    <Input
                      value={notation}
                      onChange={(e) => setNotation(e.target.value)}
                      className="font-mono"
                      spellCheck={false}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') roll();
                      }}
                    />
                  </Field>
                  <PresetRow
                    presets={DICE_PRESETS.map((d) => ({ label: d, value: d }))}
                    active={notation}
                    onSelect={setNotation}
                  />
                  <Field label="Throws" hint="Roll the same notation several times.">
                    <NumberInput value={throws} min={1} max={50} onValueChange={setThrows} />
                  </Field>
                </div>
              </Section>

              <Button variant="primary" size="lg" icon="Dices" full onClick={roll}>
                Roll
              </Button>
            </>
          )}
        </>
      }
    />
  );
}
