import { useCallback, useEffect, useState } from 'react';
import { OptionsGrid, PresetRow, ToolShell } from '@/components/tool';
import {
  Button,
  CopyButton,
  Field,
  NumberInput,
  Section,
  Segmented,
  Select,
  Switch,
} from '@/components/ui';
import {
  ADJECTIVES,
  MAX_COUNT,
  NOUNS,
  makeNames,
  type GenderPool,
  type Locale,
  type NameKind,
  type NameOptions,
  type Separator,
} from './logic';

const KIND_HINT: Record<NameKind, string> = {
  first: 'Given names only.',
  last: 'Surnames only.',
  full: 'A given name and a surname.',
  codename: `Adjective plus noun — ${(ADJECTIVES.length * NOUNS.length).toLocaleString()} combinations, good for branches and environments.`,
};

export default function RandomName() {
  const [options, setOptions] = useState<NameOptions>({
    kind: 'full',
    locale: 'en',
    gender: 'any',
    count: 10,
    separator: '-',
    codenameNumber: false,
    twoSurnames: false,
  });
  const [names, setNames] = useState<string[]>([]);

  const set = (patch: Partial<NameOptions>) => setOptions((o) => ({ ...o, ...patch }));

  const generate = useCallback(() => {
    setNames(makeNames(options));
  }, [options]);

  useEffect(() => {
    generate();
  }, [generate]);

  const isCodename = options.kind === 'codename';

  return (
    <ToolShell
      main={
        <Section
          title={`${names.length} name${names.length === 1 ? '' : 's'}`}
          description={KIND_HINT[options.kind]}
          actions={
            <>
              <CopyButton value={() => names.join('\n')} label="Copy all" />
              <Button size="sm" variant="ghost" icon="RefreshCw" onClick={generate}>
                Regenerate
              </Button>
            </>
          }
        >
          <div className="flex flex-wrap gap-1.5">
            {names.map((name, i) => (
              <span
                key={`${i}-${name}`}
                className="selectable rounded-lg border border-line bg-canvas px-2.5 py-1 text-[12.5px] text-ink"
              >
                {name}
              </span>
            ))}
          </div>
        </Section>
      }
      aside={
        <>
          <Section title="Kind">
            <Segmented
              value={options.kind}
              onChange={(kind: NameKind) => set({ kind })}
              options={[
                { value: 'first', label: 'First' },
                { value: 'last', label: 'Last' },
                { value: 'full', label: 'Full' },
                { value: 'codename', label: 'Codename' },
              ]}
              className="w-full"
            />
          </Section>

          {isCodename ? (
            <Section title="Codename style">
              <div className="space-y-3">
                <Field label="Separator" hint="quiet-harbor, quiet_harbor, quiet harbor or quietharbor.">
                  <Select
                    value={options.separator}
                    onChange={(e) => set({ separator: e.target.value as Separator })}
                    options={[
                      { value: '-', label: 'Hyphen' },
                      { value: '_', label: 'Underscore' },
                      { value: ' ', label: 'Space' },
                      { value: '', label: 'Nothing' },
                    ]}
                  />
                </Field>
                <Field inline label="Add a number" hint="Two digits on the end">
                  <Switch
                    checked={options.codenameNumber}
                    onCheckedChange={(codenameNumber) => set({ codenameNumber })}
                  />
                </Field>
              </div>
            </Section>
          ) : (
            <Section title="Names">
              <div className="space-y-3">
                <Field label="Language">
                  <Segmented
                    value={options.locale}
                    onChange={(locale: Locale) => set({ locale })}
                    options={[
                      { value: 'en', label: 'English' },
                      { value: 'es', label: 'Español' },
                      { value: 'both', label: 'Both' },
                    ]}
                    className="w-full"
                  />
                </Field>
                <OptionsGrid cols={1}>
                  {options.kind !== 'last' && (
                    <Field inline label="Gender-neutral only" hint="Names read as any gender">
                      <Switch
                        checked={options.gender === 'neutral'}
                        onCheckedChange={(on) => set({ gender: (on ? 'neutral' : 'any') as GenderPool })}
                      />
                    </Field>
                  )}
                  {options.kind !== 'first' && (
                    <Field inline label="Two surnames" hint="The Spanish convention">
                      <Switch
                        checked={options.twoSurnames}
                        onCheckedChange={(twoSurnames) => set({ twoSurnames })}
                      />
                    </Field>
                  )}
                </OptionsGrid>
              </div>
            </Section>
          )}

          <Section title="How many">
            <div className="space-y-3">
              <PresetRow
                presets={[1, 5, 10, 25, 50].map((c) => ({ label: String(c), value: c }))}
                active={options.count}
                onSelect={(count) => set({ count })}
              />
              <Field label="Count" hint={`Up to ${MAX_COUNT}.`}>
                <NumberInput
                  value={options.count}
                  min={1}
                  max={MAX_COUNT}
                  onValueChange={(count) => set({ count })}
                />
              </Field>
            </div>
          </Section>

          <Button variant="primary" size="lg" icon="RefreshCw" full onClick={generate}>
            Generate again
          </Button>
        </>
      }
    />
  );
}
