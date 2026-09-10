import { disable as disableAutostart, enable as enableAutostart, isEnabled as autostartEnabled } from '@tauri-apps/plugin-autostart';
import { open } from '@tauri-apps/plugin-dialog';
import { useEffect, useState } from 'react';
import { appPaths, checkBinaries, installInstructions, type AppPaths } from '@/core/bridge';
import { usePrefs } from '@/core/prefs';
import { useSettings } from '@/core/settings';
import type { BinaryStatus } from '@/core/types';
import {
  Alert,
  Badge,
  Button,
  CopyButton,
  Field,
  Icon,
  Input,
  Mono,
  Section,
  Segmented,
  Select,
  Slider,
  Switch,
} from '@/components/ui';

function BinaryRow({ status, onRefresh }: { status: BinaryStatus; onRefresh: () => void }) {
  const settings = useSettings((s) => s.settings);
  const update = useSettings((s) => s.update);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(settings.binaries?.[status.id] ?? '');
  const [command, setCommand] = useState<string>(status.installHint);

  useEffect(() => {
    if (status.installed) return;
    void installInstructions(status.id)
      .then((i) => setCommand(i.command))
      .catch(() => setCommand(status.installHint));
  }, [status.id, status.installed, status.installHint]);

  const savePath = async () => {
    await update({ binaries: { ...(settings.binaries ?? {}), [status.id]: draft.trim() } });
    setEditing(false);
    onRefresh();
  };

  const browse = async () => {
    const picked = await open({ multiple: false, directory: false });
    if (typeof picked === 'string') setDraft(picked);
  };

  return (
    <li className="border-b border-line px-4 py-3 last:border-b-0">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-canvas">
          <Icon name={status.installed ? 'CircleCheck' : 'CircleAlert'} size={14} className={status.installed ? 'text-success' : 'text-warn'} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12.5px] font-medium text-ink">{status.label}</span>
            {status.installed ? (
              <Badge tone="success">Installed</Badge>
            ) : (
              <Badge tone="warn">Missing</Badge>
            )}
            {status.overridden && <Badge>Custom path</Badge>}
          </div>
          <p className="mt-0.5 text-[11.5px] text-ink-faint">{status.usedFor}</p>
          {status.installed && status.version && (
            <p className="mt-0.5 truncate text-[11px] text-ink-faint">
              <Mono>{status.version}</Mono>
            </p>
          )}
          {status.installed && status.path && (
            <p className="mt-0.5 truncate text-[11px] text-ink-faint" title={status.path}>
              <Mono>{status.path}</Mono>
            </p>
          )}
        </div>
        <Button size="sm" variant="ghost" onClick={() => setEditing((v) => !v)}>
          {editing ? 'Cancel' : 'Configure'}
        </Button>
      </div>

      {!status.installed && !editing && (
        <div className="mt-2 flex flex-wrap items-center gap-2 pl-10">
          <code className="selectable rounded-md border border-line bg-canvas px-2 py-1 font-mono text-[11.5px]">
            {command}
          </code>
          <CopyButton value={command} label="Copy" size="sm" variant="ghost" />
          <Button size="sm" variant="ghost" icon="RefreshCw" onClick={onRefresh}>
            Check again
          </Button>
        </div>
      )}

      {editing && (
        <div className="mt-2 flex items-center gap-2 pl-10">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={`Full path to ${status.label}`}
            className="font-mono"
          />
          <Button size="sm" onClick={() => void browse()}>
            Browse
          </Button>
          <Button size="sm" variant="primary" onClick={() => void savePath()}>
            Save
          </Button>
        </div>
      )}
    </li>
  );
}

export function SettingsPage() {
  const { settings, update } = useSettings();
  const prefs = usePrefs();
  const [binaries, setBinaries] = useState<BinaryStatus[]>([]);
  const [loadingBinaries, setLoadingBinaries] = useState(true);
  const [paths, setPaths] = useState<AppPaths | null>(null);
  const [launchAtLogin, setLaunchAtLogin] = useState(false);

  const refreshBinaries = async () => {
    setLoadingBinaries(true);
    try {
      setBinaries(await checkBinaries());
    } finally {
      setLoadingBinaries(false);
    }
  };

  useEffect(() => {
    void refreshBinaries();
    void appPaths().then(setPaths).catch(() => undefined);
    void autostartEnabled().then(setLaunchAtLogin).catch(() => undefined);
  }, []);

  const toggleLaunchAtLogin = async (next: boolean) => {
    setLaunchAtLogin(next);
    try {
      await (next ? enableAutostart() : disableAutostart());
    } catch {
      // macOS can refuse to register the launch agent; reflect the real state back.
      setLaunchAtLogin(await autostartEnabled().catch(() => false));
    }
  };

  const pickOutputDir = async () => {
    const picked = await open({ directory: true, multiple: false });
    if (typeof picked === 'string') await update({ defaultOutputDir: picked, outputMode: 'custom' });
  };

  const installedCount = binaries.filter((b) => b.installed).length;

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-6 py-6">
      <header>
        <h1 className="text-[17px] font-semibold tracking-tight text-ink">Settings</h1>
        <p className="mt-0.5 text-[12.5px] text-ink-faint">
          Toolbox runs entirely on this Mac. Nothing you open here is uploaded anywhere.
        </p>
      </header>

      <Section title="General" description="Window size and position are always restored on the next launch.">
        <div className="divide-y divide-line">
          <Field inline label="Launch at login" hint="Start Toolbox automatically when you log in">
            <Switch checked={launchAtLogin} onCheckedChange={(v) => void toggleLaunchAtLogin(v)} />
          </Field>
          <Field
            inline
            label="Reopen the last tool on launch"
            hint="Start where you left off instead of on Home"
          >
            <Switch checked={settings.openLastTool} onCheckedChange={(v) => void update({ openLastTool: v })} />
          </Field>
          <Field inline label="Remember the last output folder" hint="Reuse it the next time you pick a folder">
            <Switch
              checked={settings.rememberOutputDir}
              onCheckedChange={(v) => void update({ rememberOutputDir: v })}
            />
          </Field>
          <Field inline label="Notify when long jobs finish" hint="A macOS notification after six seconds or more">
            <Switch checked={settings.notifications} onCheckedChange={(v) => void update({ notifications: v })} />
          </Field>

        </div>
      </Section>

      <Section title="Appearance">
        <Field label="Theme" hint="Light is the designed default; dark is fully supported.">
          <Segmented
            value={settings.theme}
            onChange={(theme) => void update({ theme })}
            options={[
              { value: 'light', label: 'Light', icon: 'Sun' },
              { value: 'dark', label: 'Dark', icon: 'Moon' },
              { value: 'system', label: 'System', icon: 'Monitor' },
            ]}
          />
        </Field>
      </Section>

      <Section title="Files">
        <div className="space-y-3">
          <Field label="Where results are saved by default">
            <Segmented
              value={settings.outputMode}
              onChange={(outputMode) => void update({ outputMode })}
              options={[
                { value: 'same_dir', label: 'Same folder as the input' },
                { value: 'custom', label: 'A folder I choose' },
              ]}
              className="w-full"
            />
          </Field>
          {settings.outputMode === 'custom' && (
            <div className="flex items-center gap-2">
              <Input value={settings.defaultOutputDir ?? ''} readOnly placeholder="No folder chosen" className="font-mono" />
              <Button size="sm" onClick={() => void pickOutputDir()}>
                Browse
              </Button>
            </div>
          )}
          <Field label="When a file with the same name exists" hint="Toolbox never replaces a file silently.">
            <Select
              value={settings.collision}
              onChange={(e) => void update({ collision: e.target.value as typeof settings.collision })}
              options={[
                { value: 'rename', label: 'Keep both — add _1, _2 …' },
                { value: 'skip', label: 'Skip the file' },
                { value: 'overwrite', label: 'Replace the existing file' },
              ]}
            />
          </Field>
          <Field inline label="Preserve metadata where possible" hint="EXIF, tags and timestamps carried across conversions">
            <Switch checked={settings.preserveMetadata} onCheckedChange={(v) => void update({ preserveMetadata: v })} />
          </Field>
        </div>
      </Section>

      <Section title="Images">
        <div className="space-y-4">
          <Field label={`Default JPEG quality — ${settings.jpegQuality}`}>
            <Slider min={40} max={100} value={settings.jpegQuality} onChange={(v) => void update({ jpegQuality: v })} />
          </Field>
          <Field label={`Default WebP quality — ${settings.webpQuality}`}>
            <Slider min={40} max={100} value={settings.webpQuality} onChange={(v) => void update({ webpQuality: v })} />
          </Field>
        </div>
      </Section>

      <Section title="Video">
        <div className="space-y-3">
          <Field label="Default video codec">
            <Select
              value={settings.defaultVideoCodec}
              onChange={(e) => void update({ defaultVideoCodec: e.target.value })}
              options={[
                { value: 'libx264', label: 'H.264 (libx264) — most compatible' },
                { value: 'libx265', label: 'H.265 (libx265) — smaller files' },
                { value: 'libvpx-vp9', label: 'VP9 (libvpx-vp9) — for WebM' },
              ]}
            />
          </Field>
          <Field label={`Default quality (CRF ${settings.defaultVideoCrf})`} hint="Lower means better quality and larger files.">
            <Slider min={14} max={34} value={settings.defaultVideoCrf} onChange={(v) => void update({ defaultVideoCrf: v })} />
          </Field>
        </div>
      </Section>

      <Section title="Privacy">
        <div className="space-y-3">
          <Alert tone="success" title="Your files stay on your device.">
            Toolbox has no analytics, no telemetry and no crash reporting. The only tool that reaches the
            internet is Media Downloader, and only for the link you paste.
          </Alert>
          <div className="divide-y divide-line">
            <Field inline label="Keep a history of tools and jobs" hint="File names and output folders only — never contents">
              <Switch checked={settings.recentHistory} onCheckedChange={(v) => void update({ recentHistory: v })} />
            </Field>
            <Field inline label="Clipboard history" hint="Store recent clipboard items locally so you can reuse them">
              <Switch checked={settings.clipboardHistory} onCheckedChange={(v) => void update({ clipboardHistory: v })} />
            </Field>
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" variant="secondary" icon="Trash2" onClick={prefs.clearHistory}>
              Clear job history ({prefs.history.length})
            </Button>
            <Button size="sm" variant="secondary" icon="Trash2" onClick={prefs.clearRecent}>
              Clear recent and usage data
            </Button>
          </div>
        </div>
      </Section>

      <Section
        title="Advanced — external tools"
        description={`${installedCount} of ${binaries.length} available`}
        actions={
          <Button size="sm" variant="ghost" icon="RefreshCw" loading={loadingBinaries} onClick={() => void refreshBinaries()}>
            Re-check
          </Button>
        }
      >
        <p className="mb-3 text-[12px] text-ink-faint">
          Toolbox uses these open-source programs for the heavy lifting. It never installs anything for you —
          copy the command, run it yourself, then re-check.
        </p>
        <ul className="overflow-hidden rounded-lg border border-line">
          {binaries.map((b) => (
            <BinaryRow key={b.id} status={b} onRefresh={() => void refreshBinaries()} />
          ))}
        </ul>
      </Section>

      {paths && (
        <Section title="Locations">
          <dl className="space-y-1.5 text-[12px]">
            {(
              [
                ['Settings file', `${paths.config}/settings.json`],
                ['Downloads', paths.downloads],
                ['Pictures', paths.pictures],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-3">
                <dt className="text-ink-faint">{label}</dt>
                <dd className="truncate">
                  <Mono className="text-ink-soft">{value}</Mono>
                </dd>
              </div>
            ))}
          </dl>
        </Section>
      )}

      <p className="pb-6 pt-2 text-center text-[11.5px] text-ink-faint">Toolbox 0.1.0</p>
    </div>
  );
}
