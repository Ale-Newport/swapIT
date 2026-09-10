import { useCallback, useEffect, useMemo, useState } from 'react';
import { revealInFinder } from '@/core/bridge';
import { dirname, formatBytes, shortenPath } from '@/core/format';
import { saveTextAs } from '@/core/save';
import type { FileResult } from '@/core/types';
import { OptionsGrid, PresetRow, ToolShell } from '@/components/tool';
import {
  Alert,
  Button,
  CopyButton,
  Field,
  NumberInput,
  Section,
  Segmented,
  Select,
  Switch,
} from '@/components/ui';
import { MAX_COUNT, countWords, generateLorem, type LoremOptions, type Source, type Unit } from './logic';

const UNIT_LABEL: Record<Unit, string> = {
  words: 'words',
  sentences: 'sentences',
  paragraphs: 'paragraphs',
  list: 'list items',
};

export default function LoremIpsum() {
  const [options, setOptions] = useState<LoremOptions>({
    unit: 'paragraphs',
    count: 3,
    source: 'latin',
    startWithLorem: true,
    html: false,
  });
  const [text, setText] = useState('');
  const [saved, setSaved] = useState<FileResult | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set = (patch: Partial<LoremOptions>) => setOptions((o) => ({ ...o, ...patch }));

  // generateLorem clamps the count, and a typed number is not bounded by the
  // input's `max`, so the heading has to report the clamped figure too.
  const safeCount = Math.max(1, Math.min(MAX_COUNT, Math.round(options.count) || 1));

  const generate = useCallback(() => {
    setText(generateLorem(options).text);
    setSaved(null);
    setSaveError(null);
  }, [options]);

  useEffect(() => {
    generate();
  }, [generate]);

  const stats = useMemo(
    () => ({ words: countWords(text), characters: text.length }),
    [text],
  );

  const download = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const result = await saveTextAs(text, `lorem-ipsum.${options.html ? 'html' : 'txt'}`);
      if (result) setSaved(result);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ToolShell
      main={
        <Section
          title={`${safeCount.toLocaleString()} ${UNIT_LABEL[options.unit]}`}
          description={`${stats.words.toLocaleString()} words · ${stats.characters.toLocaleString()} characters`}
          actions={
            <>
              <CopyButton value={() => text} label="Copy" />
              <Button size="sm" icon="Download" loading={saving} onClick={() => void download()}>
                Save
              </Button>
              <Button size="sm" variant="ghost" icon="RefreshCw" onClick={generate}>
                Regenerate
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            <pre className="selectable max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-canvas p-3.5 text-[12.5px] leading-[1.7] text-ink">
              {text}
            </pre>
            {saveError && <Alert tone="danger">{saveError}</Alert>}
            {saved && (
              <Alert
                tone="success"
                title={`Saved ${saved.name}`}
                action={
                  <Button size="sm" icon="FolderOpen" onClick={() => void revealInFinder(saved.path)}>
                    Reveal
                  </Button>
                }
              >
                {formatBytes(saved.size)} · {shortenPath(dirname(saved.path), 2)}
              </Alert>
            )}
          </div>
        </Section>
      }
      aside={
        <>
          <Section title="What to make">
            <div className="space-y-3">
              <Field label="Unit">
                <Select
                  value={options.unit}
                  onChange={(e) => set({ unit: e.target.value as Unit })}
                  options={[
                    { value: 'paragraphs', label: 'Paragraphs' },
                    { value: 'sentences', label: 'Sentences' },
                    { value: 'words', label: 'Words' },
                    { value: 'list', label: 'List items' },
                  ]}
                />
              </Field>
              <PresetRow
                presets={[1, 3, 5, 10, 25].map((c) => ({ label: String(c), value: c }))}
                active={options.count}
                onSelect={(count) => set({ count })}
              />
              <Field
                label={`How many ${UNIT_LABEL[options.unit]}`}
                hint={options.count > MAX_COUNT ? `Capped at ${MAX_COUNT}.` : `Up to ${MAX_COUNT}.`}
              >
                <NumberInput value={options.count} min={1} max={MAX_COUNT} onValueChange={(count) => set({ count })} />
              </Field>
            </div>
          </Section>

          <Section title="Style">
            <div className="space-y-3">
              <Field label="Words" hint="English filler is easier to skim in a design review.">
                <Segmented
                  value={options.source}
                  onChange={(source: Source) => set({ source })}
                  options={[
                    { value: 'latin', label: 'Classic Latin' },
                    { value: 'english', label: 'Plain English' },
                  ]}
                  className="w-full"
                />
              </Field>
              <OptionsGrid cols={1}>
                <Field
                  inline
                  label="Classic opening"
                  hint={options.source === 'latin' ? 'Lorem ipsum dolor sit amet…' : 'This is placeholder copy…'}
                >
                  <Switch
                    checked={options.startWithLorem}
                    onCheckedChange={(startWithLorem) => set({ startWithLorem })}
                  />
                </Field>
                <Field
                  inline
                  label="HTML markup"
                  hint={options.unit === 'list' ? 'Wrap in <ul> and <li>' : 'Wrap each block in <p>'}
                >
                  <Switch checked={options.html} onCheckedChange={(html) => set({ html })} />
                </Field>
              </OptionsGrid>
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
