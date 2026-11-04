import { disable as disableAutostart, enable as enableAutostart, isEnabled as autostartEnabled } from '@tauri-apps/plugin-autostart';
import { open } from '@tauri-apps/plugin-dialog';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { defaultFolders } from '@/core/quick';
import { useSettings } from '@/core/settings';
import { Alert, Badge, Button, Field, Icon, IconButton, Section, Segmented, Select, Slider, Switch } from '@/components/ui';
import { DEFAULT_SHORTCUTS, formatAccelerator, type ShortcutId } from '@/radial/accelerator';
import { ACCENT_CHOICES, DEFAULT_ACCENT, DEFAULT_OPACITY } from '@/radial/appearance';
import {
  installFinderAction,
  isTauri,
  openPrivacyPane,
  radialShow,
  radialStatus,
  requestAutomationPermission,
  uninstallFinderAction,
} from '@/radial/native';
import type { RadialStatus } from '@/radial/model';
import { RingPreview } from '@/radial/RingPreview';
import { ShortcutRecorder } from '@/radial/ShortcutRecorder';
import { WATCH_ACTIONS, WATCH_OUTPUT } from '@/radial/watch';

const SHORTCUTS: Array<{ id: ShortcutId; label: string; hint: string }> = [
  { id: 'radial', label: 'Open the radial menu', hint: 'Select files in Finder first — or nothing, to create something' },
  { id: 'note', label: 'New Markdown note', hint: 'Straight to the note card, in the front Finder folder' },
  { id: 'record', label: 'Record audio', hint: 'Straight to the voice recorder' },
];

const MODIFIERS = [
  { value: 'alt', label: '⌥ Option' },
  { value: 'ctrl', label: '⌃ Control' },
  { value: 'shift', label: '⇧ Shift' },
  { value: 'cmd', label: '⌘ Command' },
] as const;

function Gesture({ keys, children }: { keys: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-1.5">
      <span className="flex min-w-[88px] shrink-0 items-center gap-1 pt-px text-[12px] font-medium text-ink">{keys}</span>
      <span className="text-[12px] leading-[1.5] text-ink-soft">{children}</span>
    </div>
  );
}

function Key({ children }: { children: ReactNode }) {
  return (
    <kbd className="min-w-[20px] rounded-[5px] border border-line bg-canvas px-1.5 py-px text-center font-sans text-[11.5px] text-ink">
      {children}
    </kbd>
  );
}

export function RadialPage() {
  const { settings, update } = useSettings();
  const [status, setStatus] = useState<RadialStatus | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [launchAtLogin, setLaunchAtLogin] = useState(false);
  const [desktop, setDesktop] = useState('');
  const refreshTimer = useRef<number | undefined>(undefined);

  const refresh = useCallback(() => {
    window.clearTimeout(refreshTimer.current);
    // The backend reconciles shortcuts a moment after a settings patch lands.
    refreshTimer.current = window.setTimeout(() => {
      void radialStatus()
        .then(setStatus)
        .catch(() => setStatus(null));
    }, 250);
  }, []);

  useEffect(() => {
    refresh();
    void autostartEnabled().then(setLaunchAtLogin).catch(() => undefined);
    void defaultFolders().then((f) => setDesktop(f.desktop)).catch(() => undefined);
    return () => window.clearTimeout(refreshTimer.current);
  }, [refresh]);

  const patch = async (value: Record<string, unknown>) => {
    await update(value);
    refresh();
  };

  const shortcuts = { ...DEFAULT_SHORTCUTS, ...(settings.radialShortcuts ?? {}) } as Record<ShortcutId, string>;
  const setShortcut = (id: ShortcutId, accelerator: string) => void patch({ radialShortcuts: { ...shortcuts, [id]: accelerator } });

  const enabled = settings.radialEnabled !== false;
  const accent = settings.radialAccent ?? DEFAULT_ACCENT;
  const opacity = settings.radialOpacity ?? DEFAULT_OPACITY;
  const themePref = settings.radialTheme ?? 'auto';
  const previewTheme: 'light' | 'dark' =
    themePref === 'auto' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : themePref;

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err && typeof err === 'object' && 'message' in err ? String((err as Error).message) : String(err));
    } finally {
      setBusy(null);
      refresh();
    }
  };

  const toggleLaunch = async (next: boolean) => {
    setLaunchAtLogin(next);
    try {
      await (next ? enableAutostart() : disableAutostart());
    } catch {
      setLaunchAtLogin(await autostartEnabled().catch(() => false));
    }
  };

  const pickFolder = async () => {
    const picked = await open({ directory: true, multiple: false, defaultPath: settings.radialCreateDir ?? desktop });
    if (typeof picked === 'string') await patch({ radialCreateDir: picked });
  };

  const tryIt = (withFiles: boolean) =>
    void run('try', async () => {
      if (!withFiles) return radialShow({ paths: [], trigger: 'app', intent: 'ring' });
      const picked = await open({ multiple: true });
      if (!picked) return;
      return radialShow({ paths: Array.isArray(picked) ? picked : [picked], trigger: 'app', intent: 'ring' });
    });

  const native = isTauri();

  const rules = settings.watchRules ?? [];
  const addRule = async () => {
    const picked = await open({ directory: true, multiple: false, title: 'Watch which folder?' });
    if (typeof picked !== 'string') return;
    const rule = { id: crypto.randomUUID(), folder: picked, action: 'convert:jpg', enabled: true };
    await patch({ watchRules: [...rules, rule] });
  };
  const updateRule = (id: string, change: Partial<(typeof rules)[number]>) =>
    void patch({ watchRules: rules.map((r) => (r.id === id ? { ...r, ...change } : r)) });
  const removeRule = (id: string) => void patch({ watchRules: rules.filter((r) => r.id !== id) });

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-6 py-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[17px] font-semibold tracking-tight text-ink">Radial menu</h1>
          <p className="mt-0.5 max-w-xl text-[12.5px] text-ink-faint">
            Select files in Finder, press a shortcut, and pick what to do from a ring of glass at your cursor — convert,
            compress, create, record — without opening Toolbox.
          </p>
        </div>
        <Switch checked={enabled} onCheckedChange={(v) => void patch({ radialEnabled: v })} aria-label="Radial menu on or off" />
      </header>

      <div className="overflow-hidden rounded-card border border-line bg-panel">
        <RingPreview theme={previewTheme} accent={accent} opacity={opacity} />
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3">
          <p className="text-[12px] text-ink-faint">
            A preview of your settings. The real menu blurs whatever is behind it, using macOS itself.
          </p>
          <div className="flex gap-2">
            <Button size="sm" icon="Plus" disabled={!native || busy === 'try'} onClick={() => tryIt(false)}>
              Try it
            </Button>
            <Button size="sm" icon="Upload" disabled={!native || busy === 'try'} onClick={() => tryIt(true)}>
              With files…
            </Button>
          </div>
        </div>
      </div>

      {error && (
        <Alert tone="danger" title="That did not work">
          {error}
        </Alert>
      )}

      <Section title="Shortcuts" description="Work from any app, including full-screen ones. Each needs ⌃, ⌥ or ⌘.">
        <div className="divide-y divide-line">
          {SHORTCUTS.map((s) => {
            const state = status?.shortcuts?.[s.id];
            return (
              <Field key={s.id} inline label={s.label} hint={s.hint}>
                <ShortcutRecorder
                  value={shortcuts[s.id]}
                  onChange={(acc) => setShortcut(s.id, acc)}
                  error={state?.error}
                  registered={state?.registered}
                />
              </Field>
            );
          })}
          <Field inline label="Hold and release to choose" hint="Keep the shortcut down, flick toward a petal, let go. A quick tap keeps the menu open.">
            <Switch checked={settings.radialHoldToSelect !== false} onCheckedChange={(v) => void patch({ radialHoldToSelect: v })} />
          </Field>
        </div>
      </Section>

      <Section title="Drag gesture" description="Grab files anywhere — Finder, Mail, a browser — hold the key, and the ring appears under the cursor.">
        <div className="divide-y divide-line">
          <Field inline label="Show the ring while dragging files" hint="Drop on a petal to act on the files. Mouse-only, needs no extra permission.">
            <Switch checked={settings.radialDragEnabled !== false} onCheckedChange={(v) => void patch({ radialDragEnabled: v })} />
          </Field>
          <Field inline label="Hold this key while dragging">
            <Segmented
              value={settings.radialDragModifier ?? 'alt'}
              onChange={(v) => void patch({ radialDragModifier: v })}
              options={MODIFIERS.map((m) => ({ value: m.value, label: m.label }))}
            />
          </Field>
        </div>
        {status && settings.radialDragEnabled !== false && !status.drag.running && (
          <p className="mt-2 text-[11.5px] text-warn">The drag watcher is not running yet — it starts the next time Toolbox launches.</p>
        )}
      </Section>

      <Section title="Appearance">
        <div className="space-y-4">
          <Field label="Glass">
            <Segmented
              value={themePref}
              onChange={(v) => void patch({ radialTheme: v })}
              options={[
                { value: 'auto', label: 'Match macOS', icon: 'Monitor' },
                { value: 'light', label: 'Light', icon: 'Sun' },
                { value: 'dark', label: 'Dark', icon: 'Moon' },
              ]}
            />
          </Field>
          <Field label="Accent">
            <div className="flex flex-wrap items-center gap-2">
              {ACCENT_CHOICES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  aria-label={c.label}
                  title={c.label}
                  onClick={() => void patch({ radialAccent: c.value })}
                  className="flex h-7 w-7 items-center justify-center rounded-full ring-offset-2 ring-offset-panel transition-transform hover:scale-110"
                  style={{ background: c.value, boxShadow: accent.toLowerCase() === c.value ? `0 0 0 2px var(--color-panel), 0 0 0 4px ${c.value}` : undefined }}
                >
                  {accent.toLowerCase() === c.value && <Icon name="Check" size={13} className="text-white" strokeWidth={3} />}
                </button>
              ))}
            </div>
          </Field>
          <Field label={`Glass strength — ${Math.round(opacity * 100)}%`} hint="Lower is clearer; higher is more frosted.">
            <Slider min={25} max={100} value={Math.round(opacity * 100)} onChange={(v) => void patch({ radialOpacity: v / 100 })} />
          </Field>
        </div>
      </Section>

      <Section
        title="Watch folders"
        description={`Anything that lands in a watched folder is handled for you. Results go to a “${WATCH_OUTPUT}” folder inside it, so nothing is ever processed twice.`}
        actions={
          <Button size="sm" icon="Plus" disabled={!native} onClick={() => void addRule()}>
            Add folder…
          </Button>
        }
      >
        {rules.length === 0 ? (
          <p className="text-[12px] text-ink-faint">
            Try Downloads with “Convert images to JPG”: every HEIC or WebP you save becomes a JPEG, without lifting a finger.
          </p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line">
            {rules.map((rule) => (
              <li key={rule.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-canvas text-ink-soft">
                  <Icon name="FolderSearch" size={15} />
                </span>
                <div className="min-w-[140px] flex-1">
                  <p className="truncate text-[12.5px] font-medium text-ink">{rule.folder.split('/').pop() || rule.folder}</p>
                  <p className="truncate font-mono text-[10.5px] text-ink-faint" title={rule.folder}>
                    {rule.folder}
                  </p>
                </div>
                <Select
                  value={rule.action}
                  onChange={(e) => updateRule(rule.id, { action: e.target.value })}
                  options={WATCH_ACTIONS.map((a) => ({ value: a.id, label: a.label }))}
                  className="w-[230px]"
                />
                <Switch checked={rule.enabled} onCheckedChange={(v) => updateRule(rule.id, { enabled: v })} aria-label="Enabled" />
                <IconButton icon="Trash2" label="Remove this rule" size="sm" onClick={() => removeRule(rule.id)} />
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Creating things" description="When Finder has a window open, new files land in its folder. Otherwise they land here.">
        <Field label="Fallback folder">
          <div className="flex items-center gap-2">
            <div className="flex h-8.5 min-w-0 flex-1 items-center gap-2 rounded-lg border border-line bg-canvas px-2.5 text-[12px] text-ink-soft">
              <Icon name="FolderOpen" size={14} className="shrink-0" />
              <span className="truncate font-mono">{settings.radialCreateDir || desktop || '~/Desktop'}</span>
            </div>
            <Button size="sm" onClick={() => void pickFolder()}>
              Choose…
            </Button>
            {settings.radialCreateDir && (
              <Button size="sm" variant="ghost" onClick={() => void patch({ radialCreateDir: null })}>
                Use Desktop
              </Button>
            )}
          </div>
        </Field>
      </Section>

      <Section title="Finder">
        <div className="divide-y divide-line">
          <Field
            inline
            label="Access to Finder"
            hint="Needed to read your selection and the folder of the front window. macOS asks once."
          >
            <div className="flex items-center gap-2">
              {status?.automation === 'granted' && <Badge tone="success">Allowed</Badge>}
              {status?.automation === 'denied' && <Badge tone="warn">Blocked</Badge>}
              {(!status || status.automation === 'unknown') && <Badge>Not asked yet</Badge>}
              {status?.automation !== 'granted' && (
                <Button
                  size="sm"
                  disabled={!native}
                  loading={busy === 'automation'}
                  onClick={() =>
                    void run('automation', async () => {
                      const result = await requestAutomationPermission();
                      if (result === 'denied') await openPrivacyPane('automation');
                    })
                  }
                >
                  {status?.automation === 'denied' ? 'Open Settings' : 'Allow'}
                </Button>
              )}
            </div>
          </Field>
          <Field
            inline
            label="Right-click action"
            hint="Adds “Open in Toolbox” under Finder ▸ right-click ▸ Quick Actions. You can give it a key in System Settings ▸ Keyboard ▸ Shortcuts."
          >
            {status?.finderAction.installed ? (
              <div className="flex items-center gap-2">
                <Badge tone="success">Installed</Badge>
                <Button size="sm" variant="ghost" loading={busy === 'uninstall'} onClick={() => void run('uninstall', uninstallFinderAction)}>
                  Remove
                </Button>
              </div>
            ) : (
              <Button size="sm" disabled={!native} loading={busy === 'install'} onClick={() => void run('install', installFinderAction)}>
                Install
              </Button>
            )}
          </Field>
          <Field inline label="Microphone" hint="For Record audio. macOS asks the first time you press record.">
            <Button size="sm" variant="ghost" disabled={!native} onClick={() => void openPrivacyPane('microphone')}>
              Open Settings
            </Button>
          </Field>
        </div>
      </Section>

      <Section title="Staying available">
        <div className="divide-y divide-line">
          <Field inline label="Keep running when the window is closed" hint="Shortcuts only work while Toolbox is running — it waits in the menu bar.">
            <Switch checked={settings.keepRunning !== false} onCheckedChange={(v) => void patch({ keepRunning: v })} />
          </Field>
          <Field inline label="Menu bar icon" hint="Quick access to the ring, new notes and recording">
            <Switch checked={settings.menuBarIcon !== false} onCheckedChange={(v) => void patch({ menuBarIcon: v })} />
          </Field>
          <Field inline label="Show in the Dock">
            <Switch checked={settings.showInDock !== false} onCheckedChange={(v) => void patch({ showInDock: v })} />
          </Field>
          <Field inline label="Open at login" hint="So the shortcut is always there">
            <Switch checked={launchAtLogin} onCheckedChange={(v) => void toggleLaunch(v)} />
          </Field>
        </div>
      </Section>

      <Section title="Using it" description="Six petals at most. Anything else is one tap further in — never a page to scroll.">
        <div className="divide-y divide-line">
          <Gesture keys={<>Click</>}>Pick a petal. A petal marked › opens a smaller ring; the middle takes you back.</Gesture>
          <Gesture keys={<>Drag</>}>Drop files onto a petal to act on them — hold the drag key to bring the ring up.</Gesture>
          <Gesture keys={<>Type</>}>Search everything, including actions no ring shows — try “compress”, “qr”, “note” or “json”.</Gesture>
          <Gesture keys={<><Key>1</Key>–<Key>6</Key></>}>Choose a petal by number.</Gesture>
          <Gesture keys={<><Key>←</Key><Key>→</Key></>}>Walk around the ring, then <Key>↩</Key> to run.</Gesture>
          <Gesture keys={<Key>⎋</Key>}>Step back, then close. Clicking outside closes too.</Gesture>
        </div>
        <p className="mt-3 text-[11.5px] text-ink-faint">
          Opening, moving, duplicating, compressing and trashing are left to Finder’s right-click menu, which
          already does them well.
        </p>
      </Section>

      {!native && (
        <Alert tone="info" title="Preview only">
          Open Toolbox as an app to try the menu itself — this page is running in a browser.
        </Alert>
      )}
      <div className="pb-2" />
    </div>
  );
}

export function formatShortcut(accelerator: string | undefined): string {
  return formatAccelerator(accelerator ?? '');
}
