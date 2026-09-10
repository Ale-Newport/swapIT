import { useCallback, useEffect, useMemo, useState } from 'react';
import { revealInFinder } from '@/core/bridge';
import { formatBytes, shortenPath, dirname } from '@/core/format';
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
import { MAX_COUNT, formatUuidList, generate, type UuidFormat, type UuidVersion } from './logic';

const COUNTS = [1, 5, 10, 100, 1000];

const VERSION_HINT: Record<UuidVersion, string> = {
  v4: '122 random bits. The default choice when you just need something unique.',
  v7: 'A millisecond timestamp followed by randomness, so ids sort in creation order — kinder to database indexes than v4.',
  nil: 'All zeroes. Useful as a sentinel or a fixture value.',
};

/** A long list in one <pre> is slow to paint; copy and download still use it all. */
const PREVIEW_LIMIT = 500;

export default function UuidGenerator() {
  const [version, setVersion] = useState<UuidVersion>('v4');
  const [count, setCount] = useState(5);
  const [uuids, setUuids] = useState<string[]>([]);
  const [format, setFormat] = useState<UuidFormat>({
    hyphens: true,
    uppercase: false,
    braces: false,
    quotes: 'none',
  });
  const [saved, setSaved] = useState<FileResult | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const safeCount = Math.max(1, Math.min(MAX_COUNT, Math.round(count) || 1));

  const regenerate = useCallback(() => {
    setUuids(generate(version, safeCount));
    setSaved(null);
    setSaveError(null);
  }, [version, safeCount]);

  useEffect(() => {
    regenerate();
  }, [regenerate]);

  const text = useMemo(() => formatUuidList(uuids, format), [uuids, format]);
  const preview = useMemo(
    () => (uuids.length > PREVIEW_LIMIT ? formatUuidList(uuids.slice(0, PREVIEW_LIMIT), format) : text),
    [uuids, format, text],
  );

  const download = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const result = await saveTextAs(text, `uuid-${version}-${uuids.length}.txt`);
      if (result) setSaved(result);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const set = (patch: Partial<UuidFormat>) => setFormat((f) => ({ ...f, ...patch }));

  return (
    <ToolShell
      main={
        <Section
          title={`${uuids.length.toLocaleString()} ${version === 'nil' ? 'nil uuid' : version.toUpperCase()}${uuids.length === 1 ? '' : 's'}`}
          description={VERSION_HINT[version]}
          actions={
            <>
              <CopyButton value={() => text} label="Copy all" />
              <Button size="sm" icon="Download" loading={saving} onClick={() => void download()}>
                .txt
              </Button>
              <Button size="sm" variant="ghost" icon="RefreshCw" onClick={regenerate}>
                Regenerate
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            <pre className="selectable max-h-[60vh] overflow-auto whitespace-pre rounded-lg border border-line bg-canvas p-3 font-mono text-[12.5px] leading-[1.7] text-ink">
              {preview}
            </pre>
            {uuids.length > PREVIEW_LIMIT && (
              <p className="text-[11.5px] text-ink-faint">
                Showing the first {PREVIEW_LIMIT.toLocaleString()} of {uuids.length.toLocaleString()} — copy and
                download include every one.
              </p>
            )}
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
          <Section title="Version">
            <Segmented
              value={version}
              onChange={setVersion}
              options={[
                { value: 'v4', label: 'v4', title: 'Random' },
                { value: 'v7', label: 'v7', title: 'Time-ordered' },
                { value: 'nil', label: 'Nil', title: 'All zeroes' },
              ]}
              className="w-full"
            />
          </Section>

          <Section title="How many">
            <div className="space-y-3">
              <PresetRow
                presets={COUNTS.map((c) => ({ label: c.toLocaleString(), value: c }))}
                active={COUNTS.includes(safeCount) ? safeCount : undefined}
                onSelect={setCount}
              />
              <Field label="Custom" hint={`Up to ${MAX_COUNT.toLocaleString()} at a time.`}>
                <NumberInput
                  value={count}
                  onValueChange={setCount}
                  min={1}
                  max={MAX_COUNT}
                  suffix="ids"
                />
              </Field>
            </div>
          </Section>

          <Section title="Format">
            <OptionsGrid cols={1}>
              <Field inline label="Hyphens" hint="8-4-4-4-12 grouping">
                <Switch checked={format.hyphens} onCheckedChange={(hyphens) => set({ hyphens })} />
              </Field>
              <Field inline label="Uppercase">
                <Switch checked={format.uppercase} onCheckedChange={(uppercase) => set({ uppercase })} />
              </Field>
              <Field inline label="Braces" hint="{…}, the Windows GUID style">
                <Switch checked={format.braces} onCheckedChange={(braces) => set({ braces })} />
              </Field>
              <Field label="Quoting" hint="A quoted list pastes straight into an array literal.">
                <Select
                  value={format.quotes}
                  onChange={(e) => set({ quotes: e.target.value as UuidFormat['quotes'] })}
                  options={[
                    { value: 'none', label: 'Plain — one per line' },
                    { value: 'double', label: 'Quoted list "…",' },
                    { value: 'single', label: "Quoted list '…'," },
                  ]}
                />
              </Field>
            </OptionsGrid>
          </Section>

          <Button variant="primary" size="lg" icon="RefreshCw" full onClick={regenerate}>
            Generate again
          </Button>
        </>
      }
    />
  );
}
