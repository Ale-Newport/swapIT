import { open } from '@tauri-apps/plugin-dialog';
import { useCallback, useEffect, useState } from 'react';
import { shortenPath } from '@/core/format';
import { usePrefs } from '@/core/prefs';
import { useSettings } from '@/core/settings';
import type { OutputSpec } from '@/core/types';
import { Button, Field, Icon, Input, Segmented, Select } from '@/components/ui';

/**
 * Where results are written. Seeded from global settings, remembers the last
 * folder, and never lets a tool silently overwrite by default.
 */
export function useOutputSpec(defaults: Partial<OutputSpec> = {}) {
  const settings = useSettings((s) => s.settings);
  const lastOutputDir = usePrefs((s) => s.lastOutputDir);
  const setLastOutputDir = usePrefs((s) => s.setLastOutputDir);
  const [spec, setSpec] = useState<OutputSpec>(() => ({
    mode: settings.outputMode,
    dir: settings.outputMode === 'custom' ? (settings.defaultOutputDir ?? lastOutputDir) : null,
    suffix: null,
    collision: settings.collision,
    filename: null,
    ...defaults,
  }));

  // Track global setting changes until the user touches the control themselves.
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (touched) return;
    setSpec((s) => ({
      ...s,
      mode: settings.outputMode,
      collision: settings.collision,
      dir: settings.outputMode === 'custom' ? (settings.defaultOutputDir ?? lastOutputDir) : s.dir,
    }));
  }, [settings.outputMode, settings.collision, settings.defaultOutputDir, lastOutputDir, touched]);

  const update = useCallback(
    (patch: Partial<OutputSpec>) => {
      setTouched(true);
      setSpec((s) => ({ ...s, ...patch }));
      if (patch.dir) setLastOutputDir(patch.dir);
    },
    [setLastOutputDir],
  );

  return { spec, update };
}

export function OutputSettings({
  spec,
  onChange,
  showSuffix = true,
  showCollision = true,
  className,
}: {
  spec: OutputSpec;
  onChange: (patch: Partial<OutputSpec>) => void;
  showSuffix?: boolean;
  showCollision?: boolean;
  className?: string;
}) {
  const pickFolder = async () => {
    const picked = await open({ directory: true, multiple: false });
    if (typeof picked === 'string') onChange({ dir: picked, mode: 'custom' });
  };

  return (
    <div className={className}>
      <div className="space-y-3">
        <Field label="Save to">
          <Segmented
            value={spec.mode}
            onChange={(mode) => onChange({ mode })}
            options={[
              { value: 'same_dir', label: 'Same folder', icon: 'FolderInput' },
              { value: 'custom', label: 'Choose folder', icon: 'FolderOutput' },
            ]}
            className="w-full"
          />
        </Field>

        {spec.mode === 'custom' && (
          <div className="flex items-center gap-2">
            <div className="flex h-8.5 min-w-0 flex-1 items-center gap-2 rounded-lg border border-line bg-canvas px-2.5">
              <Icon name="Folder" size={13} className="shrink-0 text-ink-faint" />
              <span className="truncate text-[12.5px] text-ink-soft" title={spec.dir ?? ''}>
                {spec.dir ? shortenPath(spec.dir, 3) : 'No folder chosen'}
              </span>
            </div>
            <Button size="sm" onClick={pickFolder}>
              Browse
            </Button>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          {showSuffix && (
            <Field label="Name suffix" hint="Added before the extension">
              <Input
                value={spec.suffix ?? ''}
                placeholder="-converted"
                onChange={(e) => onChange({ suffix: e.target.value || null })}
              />
            </Field>
          )}
          {showCollision && (
            <Field label="If the file exists">
              <Select
                value={spec.collision}
                onChange={(e) => onChange({ collision: e.target.value as OutputSpec['collision'] })}
                options={[
                  { value: 'rename', label: 'Keep both (file_1)' },
                  { value: 'skip', label: 'Skip the file' },
                  { value: 'overwrite', label: 'Replace it' },
                ]}
              />
            </Field>
          )}
        </div>
      </div>
    </div>
  );
}
