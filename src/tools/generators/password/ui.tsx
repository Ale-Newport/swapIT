import { useCallback, useEffect, useMemo, useState } from 'react';
import { OptionsGrid, PresetRow, ToolShell } from '@/components/tool';
import {
  Alert,
  Badge,
  Button,
  CopyButton,
  Field,
  Input,
  Progress,
  Section,
  Segmented,
  Select,
  Slider,
  Switch,
} from '@/components/ui';
import {
  DEFAULT_SYMBOLS,
  GUESSES_PER_SECOND,
  MAX_LENGTH,
  MIN_LENGTH,
  WORDS,
  characterGroups,
  generatePassphrase,
  generatePassword,
  passphraseEntropy,
  passwordEntropy,
  poolFor,
  strengthFor,
  type Capitalisation,
  type PassphraseOptions,
  type PasswordOptions,
} from './logic';

type Mode = 'password' | 'passphrase';

const SEPARATORS: Array<{ value: string; label: string }> = [
  { value: '-', label: 'Hyphen  otter-anvil' },
  { value: '.', label: 'Dot  otter.anvil' },
  { value: '_', label: 'Underscore  otter_anvil' },
  { value: ' ', label: 'Space  otter anvil' },
  { value: '', label: 'Nothing  otteranvil' },
];

const COUNTS = [1, 5, 10, 25];

export default function PasswordGenerator() {
  const [mode, setMode] = useState<Mode>('password');
  const [count, setCount] = useState(5);

  const [pw, setPw] = useState<PasswordOptions>({
    length: 20,
    lowercase: true,
    uppercase: true,
    digits: true,
    symbols: true,
    symbolSet: DEFAULT_SYMBOLS,
    excludeAmbiguous: false,
    requireEach: true,
  });

  const [phrase, setPhrase] = useState<PassphraseOptions>({
    words: 5,
    separator: '-',
    capitalisation: 'lower',
    includeNumber: false,
  });

  const [secrets, setSecrets] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const setPwOption = (patch: Partial<PasswordOptions>) => setPw((o) => ({ ...o, ...patch }));
  const setPhraseOption = (patch: Partial<PassphraseOptions>) => setPhrase((o) => ({ ...o, ...patch }));

  const generate = useCallback(() => {
    try {
      const made = Array.from({ length: count }, () =>
        mode === 'password' ? generatePassword(pw) : generatePassphrase(phrase),
      );
      setSecrets(made);
      setError(null);
    } catch (err) {
      setSecrets([]);
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [mode, count, pw, phrase]);

  useEffect(() => {
    generate();
  }, [generate]);

  const groups = useMemo(() => characterGroups(pw), [pw]);
  const pool = useMemo(() => poolFor(pw), [pw]);

  const bits =
    mode === 'password' ? passwordEntropy(pool.length, pw.length) : passphraseEntropy(phrase, WORDS.length);
  const strength = strengthFor(bits);

  const allText = secrets.join('\n');

  return (
    <ToolShell
      main={
        <>
          <Section
            title={mode === 'password' ? 'Passwords' : 'Passphrases'}
            description="Generated on this Mac. Nothing is saved, logged or sent anywhere — close the window and they are gone."
            actions={
              <>
                <CopyButton value={() => allText} label="Copy all" disabled={secrets.length === 0} />
                <Button size="sm" variant="ghost" icon="RefreshCw" onClick={generate}>
                  Regenerate
                </Button>
              </>
            }
          >
            {error ? (
              <Alert tone="danger" title="Nothing to generate">
                {error}
              </Alert>
            ) : (
              <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line">
                {secrets.map((secret, i) => (
                  <li key={`${i}-${secret}`} className="flex items-center gap-2 bg-panel px-3 py-2">
                    <span className="min-w-0 flex-1 break-all font-mono text-[13px] leading-[1.6] text-ink selectable">
                      {secret}
                    </span>
                    <CopyButton value={secret} label="" variant="ghost" className="shrink-0" />
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Strength">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Badge tone={strength.tone}>{strength.label}</Badge>
                <span className="text-[13px] font-medium text-ink">{bits.toFixed(1)} bits of entropy</span>
                <span className="ml-auto text-[12.5px] text-ink-soft">{strength.crackTime} to crack</span>
              </div>
              <Progress value={Math.min(1, bits / 128)} />
              <div className="space-y-1.5 text-[11.5px] leading-[1.55] text-ink-faint">
                <p>
                  {mode === 'password'
                    ? `log2(${pool.length}) × ${pw.length} characters — the pool has ${pool.length} distinct characters.`
                    : `log2(${WORDS.length.toLocaleString()}) × ${phrase.words} word${phrase.words === 1 ? '' : 's'}${
                        phrase.includeNumber ? ' plus log2(90) for the number' : ''
                      } — the built-in list holds ${WORDS.length.toLocaleString()} words.`}
                </p>
                <p>
                  The crack time assumes an attacker who knows exactly these settings and tries{' '}
                  {(GUESSES_PER_SECOND / 1e9).toLocaleString()} billion guesses a second — a fast offline attack on a
                  leaked hash. Against a login form that rate-limits, it would take far longer; against a slow hash
                  such as bcrypt, longer still. It also assumes half the keyspace is searched on average.
                </p>
                {mode === 'password' && pw.requireEach && groups.length > 1 && (
                  <p>
                    Guaranteeing one character from each set rules out a few combinations, so the true figure sits a
                    hair below this one.
                  </p>
                )}
                {mode === 'passphrase' && phrase.capitalisation !== 'lower' && (
                  <p>
                    Capitalisation is applied to every word the same way, so it adds no entropy — it only helps with
                    sites that demand a capital letter.
                  </p>
                )}
              </div>
            </div>
          </Section>
        </>
      }
      aside={
        <>
          <Section title="Kind">
            <Segmented
              value={mode}
              onChange={setMode}
              options={[
                { value: 'password', label: 'Random', title: 'Random characters' },
                { value: 'passphrase', label: 'Passphrase', title: 'Words you can retype' },
              ]}
              className="w-full"
            />
          </Section>

          {mode === 'password' ? (
            <Section title="Characters">
              <div className="space-y-3">
                <Field label={`Length — ${pw.length} characters`}>
                  <Slider
                    min={MIN_LENGTH}
                    max={MAX_LENGTH}
                    value={pw.length}
                    onChange={(length) => setPwOption({ length })}
                  />
                </Field>
                <PresetRow
                  presets={[12, 16, 20, 32, 64].map((n) => ({ label: String(n), value: n }))}
                  active={pw.length}
                  onSelect={(length) => setPwOption({ length })}
                />
                <OptionsGrid cols={1}>
                  <Field inline label="Lowercase" hint="a–z">
                    <Switch checked={pw.lowercase} onCheckedChange={(lowercase) => setPwOption({ lowercase })} />
                  </Field>
                  <Field inline label="Uppercase" hint="A–Z">
                    <Switch checked={pw.uppercase} onCheckedChange={(uppercase) => setPwOption({ uppercase })} />
                  </Field>
                  <Field inline label="Digits" hint="0–9">
                    <Switch checked={pw.digits} onCheckedChange={(digits) => setPwOption({ digits })} />
                  </Field>
                  <Field inline label="Symbols">
                    <Switch checked={pw.symbols} onCheckedChange={(symbols) => setPwOption({ symbols })} />
                  </Field>
                </OptionsGrid>
                {pw.symbols && (
                  <Field label="Symbol set" hint="Trim it when a site rejects some of these.">
                    <Input
                      value={pw.symbolSet}
                      onChange={(e) => setPwOption({ symbolSet: e.target.value })}
                      className="font-mono"
                      spellCheck={false}
                    />
                  </Field>
                )}
                <OptionsGrid cols={1}>
                  <Field inline label="Skip look-alikes" hint="No 0 O 1 l I |">
                    <Switch
                      checked={pw.excludeAmbiguous}
                      onCheckedChange={(excludeAmbiguous) => setPwOption({ excludeAmbiguous })}
                    />
                  </Field>
                  <Field inline label="One of each set" hint="Guaranteed, not left to chance">
                    <Switch checked={pw.requireEach} onCheckedChange={(requireEach) => setPwOption({ requireEach })} />
                  </Field>
                </OptionsGrid>
              </div>
            </Section>
          ) : (
            <Section title="Words">
              <div className="space-y-3">
                <Field
                  label={`Words — ${phrase.words}`}
                  hint={`Drawn from a built-in list of ${WORDS.length.toLocaleString()} short words.`}
                >
                  <Slider min={2} max={12} value={phrase.words} onChange={(words) => setPhraseOption({ words })} />
                </Field>
                <Field label="Separator">
                  <Select
                    value={phrase.separator}
                    onChange={(e) => setPhraseOption({ separator: e.target.value })}
                    options={SEPARATORS}
                  />
                </Field>
                <Field label="Capitalisation">
                  <Select
                    value={phrase.capitalisation}
                    onChange={(e) => setPhraseOption({ capitalisation: e.target.value as Capitalisation })}
                    options={[
                      { value: 'lower', label: 'all lowercase' },
                      { value: 'title', label: 'Each Word Capitalised' },
                      { value: 'upper', label: 'ALL UPPERCASE' },
                    ]}
                  />
                </Field>
                <Field inline label="Add a number" hint="Two digits on the end">
                  <Switch
                    checked={phrase.includeNumber}
                    onCheckedChange={(includeNumber) => setPhraseOption({ includeNumber })}
                  />
                </Field>
              </div>
            </Section>
          )}

          <Section title="How many">
            <PresetRow
              presets={COUNTS.map((c) => ({ label: String(c), value: c }))}
              active={count}
              onSelect={setCount}
            />
          </Section>

          <Button variant="primary" size="lg" icon="RefreshCw" full onClick={generate}>
            Generate again
          </Button>
        </>
      }
    />
  );
}
