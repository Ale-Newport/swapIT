import { disable as disableAutostart, enable as enableAutostart, isEnabled as autostartEnabled } from '@tauri-apps/plugin-autostart';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Field, Segmented, Switch } from '@/components/ui';
import { useSettings } from '@/core/settings';
import { DEFAULT_SHORTCUTS, formatAccelerator, type ShortcutId } from './accelerator';
import type { RadialStatus } from './model';
import { radialStatus } from './native';
import { ShortcutRecorder } from './ShortcutRecorder';

/**
 * Pieces of the radial menu's settings that live on two pages — Settings and the Radial menu
 * page — so they are written once and behave the same in both.
 */

/** "Open at login", backed by the macOS login item. */
export function useLaunchAtLogin(): [boolean, (next: boolean) => Promise<void>] {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    void autostartEnabled().then(setEnabled).catch(() => undefined);
  }, []);
  const toggle = useCallback(async (next: boolean) => {
    setEnabled(next);
    try {
      await (next ? enableAutostart() : disableAutostart());
    } catch {
      // macOS can refuse to register the login item; show what is really the case.
      setEnabled(await autostartEnabled().catch(() => false));
    }
  }, []);
  return [enabled, toggle];
}

/** What the native side reports (are the shortcuts really registered?). Refreshed after a change. */
export function useRadialStatus(): { status: RadialStatus | null; refresh: () => void } {
  const [status, setStatus] = useState<RadialStatus | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const refresh = useCallback(() => {
    window.clearTimeout(timer.current);
    // The backend reconciles shortcuts a moment after a settings patch lands.
    timer.current = window.setTimeout(() => {
      void radialStatus()
        .then(setStatus)
        .catch(() => setStatus(null));
    }, 250);
  }, []);
  useEffect(() => {
    refresh();
    return () => window.clearTimeout(timer.current);
  }, [refresh]);
  return { status, refresh };
}

// ------------------------------------------------------------------ shortcuts

export const SHORTCUTS: Array<{ id: ShortcutId; label: string; hint: string }> = [
  { id: 'radial', label: 'Open the ring', hint: 'Select files in Finder first — or nothing, to create something' },
  { id: 'note', label: 'New Markdown note', hint: 'Straight to the note card, in the front Finder folder' },
  { id: 'record', label: 'Record audio', hint: 'Straight to the voice recorder' },
];

/** One row per shortcut: click it, press the keys you want. Works from any app. */
export function ShortcutFields({ status, onChanged }: { status: RadialStatus | null; onChanged: () => void }) {
  const { settings, update } = useSettings();
  const current = { ...DEFAULT_SHORTCUTS, ...(settings.radialShortcuts ?? {}) } as Record<ShortcutId, string>;

  const set = async (id: ShortcutId, accelerator: string) => {
    await update({ radialShortcuts: { ...current, [id]: accelerator } });
    onChanged();
  };
  const takenBy = (id: ShortcutId, accelerator: string): string | null => {
    const other = SHORTCUTS.find((s) => s.id !== id && current[s.id] && current[s.id].toLowerCase() === accelerator.toLowerCase());
    return other ? `${formatAccelerator(accelerator)} already opens “${other.label}”. Pick another.` : null;
  };

  return (
    <>
      {SHORTCUTS.map((s) => {
        const state = status?.shortcuts?.[s.id];
        return (
          <Field key={s.id} inline label={s.label} hint={s.hint}>
            <ShortcutRecorder
              value={current[s.id]}
              onChange={(accelerator) => void set(s.id, accelerator)}
              defaultValue={DEFAULT_SHORTCUTS[s.id]}
              validate={(accelerator) => takenBy(s.id, accelerator)}
              error={state?.error}
              registered={state?.registered}
            />
          </Field>
        );
      })}
    </>
  );
}

// ------------------------------------------------------------------ where it lives

/**
 * Menu bar only: no Dock icon, no window at login, and the ring keeps working. Closing the
 * window leaves only the icon at the top of the screen; the window comes back from that icon.
 */
export function WhereItLives({ withLogin = true, detailed = false }: { withLogin?: boolean; detailed?: boolean }) {
  const { settings, update } = useSettings();
  const [launchAtLogin, setLaunchAtLogin] = useLaunchAtLogin();
  const menuBar = settings.menuBarMode === true;

  return (
    <div className="divide-y divide-line">
      <div className="space-y-2 py-2">
        <div>
          <p className="text-[13px] text-ink">Where Toolbox lives</p>
          <p className="mt-0.5 text-[11.5px] leading-[1.5] text-ink-faint">
            {menuBar
              ? 'Only the icon at the top of the screen. No Dock icon, no window when you log in — the ring and its shortcuts keep working. Close this window and it stays there; open the full app from the icon whenever you need it.'
              : 'Toolbox shows in the Dock and opens its window. Closing the window can still leave the ring running in the menu bar.'}
          </p>
        </div>
        <Segmented
          className="w-full max-w-[420px]"
          value={menuBar ? 'menubar' : 'window'}
          onChange={(v) => void update({ menuBarMode: v === 'menubar' })}
          options={[
            { value: 'window', label: 'Dock & window', icon: 'AppWindow' },
            { value: 'menubar', label: 'Menu bar only', icon: 'PanelTop' },
          ]}
        />
      </div>
      {withLogin && (
        <Field
          inline
          label="Open at login"
          hint={menuBar ? 'Recommended — the ring is ready as soon as you log in, without a window' : 'So the shortcut is always there'}
        >
          <Switch checked={launchAtLogin} onCheckedChange={(v) => void setLaunchAtLogin(v)} />
        </Field>
      )}
      {detailed && !menuBar && (
        <>
          <Field inline label="Keep running when the window is closed" hint="Shortcuts only work while Toolbox is running — it waits in the menu bar.">
            <Switch checked={settings.keepRunning !== false} onCheckedChange={(v) => void update({ keepRunning: v })} />
          </Field>
          <Field inline label="Menu bar icon" hint="Quick access to the ring, new notes and recording">
            <Switch checked={settings.menuBarIcon !== false} onCheckedChange={(v) => void update({ menuBarIcon: v })} />
          </Field>
          <Field inline label="Show in the Dock">
            <Switch checked={settings.showInDock !== false} onCheckedChange={(v) => void update({ showInDock: v })} />
          </Field>
        </>
      )}
    </div>
  );
}
