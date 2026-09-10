import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { appPaths, asToolboxError, call, openPath, revealInFinder, type AppPaths } from '@/core/bridge';
import { formatBytes, formatRelative, shortenPath } from '@/core/format';
import { getTool } from '@/core/registry';
import type { FileResult, ToolboxError } from '@/core/types';
import { ErrorDisplay, ImagePreview, ToolShell } from '@/components/tool';
import { open } from '@tauri-apps/plugin-dialog';
import { Alert, Badge, Button, Icon, Section, Segmented, Spinner } from '@/components/ui';

type Mode = 'interactive' | 'window' | 'full';

interface Shot extends FileResult {
  at: number;
}

const MODES: Array<{ value: Mode; label: string; icon: string; hint: string; busy: string }> = [
  {
    value: 'interactive',
    label: 'Selection',
    icon: 'MousePointerClick',
    hint: 'Drag a rectangle over the part of the screen you want. Press Escape to cancel.',
    busy: 'Drag over the part you want — press Escape to cancel.',
  },
  {
    value: 'window',
    label: 'Window',
    icon: 'AppWindow',
    hint: 'Click the window you want. It is captured with its shadow, on a transparent background.',
    busy: 'Click the window you want — press Escape to cancel.',
  },
  {
    value: 'full',
    label: 'Whole screen',
    icon: 'Monitor',
    hint: 'Captures the whole display at once — Toolbox included, so use Selection to leave it out.',
    busy: 'Capturing the whole display, Toolbox window included.',
  },
];

/** Tools worth sending a fresh screenshot to, in the order people reach for them. */
const FOLLOW_UPS: Array<{ id: string; label: string }> = [
  { id: 'images/compress', label: 'Compress' },
  { id: 'images/resize', label: 'Resize' },
  { id: 'capture/ocr', label: 'Read text' },
  { id: 'qr/scan', label: 'Scan QR code' },
  { id: 'images/palette', label: 'Extract palette' },
];

export default function Screenshot() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('interactive');
  const [dir, setDir] = useState<string | null>(null);
  const [places, setPlaces] = useState<AppPaths | null>(null);
  const [shots, setShots] = useState<Shot[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  // The mode a running capture was started in, so the hint keeps describing the
  // capture actually in progress even if the segmented control is changed.
  const [busyMode, setBusyMode] = useState<Mode | null>(null);
  const busy = busyMode !== null;
  const [error, setError] = useState<ToolboxError | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Default destination: the Pictures folder, the same place macOS uses.
  useEffect(() => {
    let stale = false;
    void appPaths()
      .then((p) => {
        if (stale) return;
        setPlaces(p);
        setDir((current) => current ?? p.pictures);
      })
      .catch(() => undefined);
    return () => {
      stale = true;
    };
  }, []);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1400);
    return () => clearTimeout(t);
  }, [copied]);

  const current = useMemo(
    () => shots.find((s) => s.path === selected) ?? shots[0] ?? null,
    [shots, selected],
  );

  // A follow-up is only offered when that tool is actually registered.
  const followUps = useMemo(
    () =>
      FOLLOW_UPS.flatMap((f) => {
        const tool = getTool(f.id);
        return tool ? [{ id: f.id, label: f.label, icon: tool.icon }] : [];
      }),
    [],
  );

  const capture = async () => {
    setBusyMode(mode);
    setError(null);
    setNote(null);
    try {
      const shot = await call<FileResult>('take_screenshot', {
        mode,
        outputDir: dir && dir.trim() ? dir : undefined,
      });
      const entry: Shot = { ...shot, at: Date.now() };
      setShots((list) => [entry, ...list].slice(0, 24));
      setSelected(entry.path);
    } catch (err) {
      const failure = asToolboxError(err);
      // Escape during a selection capture is a decision, not a failure.
      if (failure.kind === 'cancelled') setNote('No screenshot was taken — the capture was cancelled.');
      else setError(failure);
    } finally {
      setBusyMode(null);
    }
  };

  const pickFolder = async () => {
    const picked = await open({ directory: true, multiple: false });
    if (typeof picked === 'string') setDir(picked);
  };

  const activeMode = MODES.find((m) => m.value === mode) ?? MODES[0];
  const runningMode = MODES.find((m) => m.value === busyMode) ?? activeMode;

  return (
    <ToolShell
      main={
        <>
          <Section
            title="Capture"
            description={activeMode.hint}
            actions={
              current && (
                <Badge tone="success">
                  {shots.length} this session
                </Badge>
              )
            }
          >
            <div className="space-y-3">
              <Segmented
                value={mode}
                onChange={setMode}
                options={MODES.map((m) => ({ value: m.value, label: m.label, icon: m.icon, title: m.hint }))}
                className="w-full"
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="primary" size="lg" icon="Camera" loading={busy} onClick={() => void capture()}>
                  {busy ? 'Waiting for the capture…' : 'Take screenshot'}
                </Button>
                {shots.length > 0 && (
                  <Button
                    size="lg"
                    variant="ghost"
                    icon="Trash2"
                    onClick={() => {
                      setShots([]);
                      setSelected(null);
                      setNote(null);
                    }}
                  >
                    Clear list
                  </Button>
                )}
                {busy && (
                  <span className="flex items-center gap-1.5 text-[11.5px] text-ink-faint">
                    <Spinner size={13} /> {runningMode.busy}
                  </span>
                )}
              </div>
            </div>
          </Section>

          {error && <ErrorDisplay error={error} onRetry={() => void capture()} />}
          {note && !error && <Alert tone="info">{note}</Alert>}

          {current && (
            <Section
              title="Last screenshot"
              description={
                <span className="selectable" title={current.path}>
                  {current.name} · {formatBytes(current.size)} · saved {formatRelative(current.at)}
                </span>
              }
              actions={
                <>
                  <Button size="sm" icon="ExternalLink" onClick={() => void openPath(current.path)}>
                    Open
                  </Button>
                  <Button size="sm" icon="FolderOpen" onClick={() => void revealInFinder(current.path)}>
                    Reveal in Finder
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={copied ? 'Check' : 'Copy'}
                    onClick={async () => {
                      await navigator.clipboard.writeText(current.path);
                      setCopied(true);
                    }}
                  >
                    {copied ? 'Copied' : 'Copy path'}
                  </Button>
                </>
              }
            >
              <div className="space-y-3">
                <ImagePreview path={current.path} className="h-[22rem] w-full" alt="The screenshot just taken" />

                {shots.length > 1 && (
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {shots.map((shot) => (
                      <button
                        key={shot.path}
                        type="button"
                        title={shot.name}
                        onClick={() => setSelected(shot.path)}
                        className={
                          shot.path === current.path
                            ? 'shrink-0 rounded-lg ring-2 ring-accent'
                            : 'shrink-0 rounded-lg ring-1 ring-line hover:ring-line-strong'
                        }
                      >
                        <ImagePreview path={shot.path} className="h-14 w-20" alt={shot.name} />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </Section>
          )}
        </>
      }
      aside={
        <>
          <Section title="Save to">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8.5 min-w-0 flex-1 items-center gap-2 rounded-lg border border-line bg-canvas px-2.5">
                  <Icon name="Folder" size={13} className="shrink-0 text-ink-faint" />
                  <span className="truncate text-[12.5px] text-ink-soft" title={dir ?? ''}>
                    {dir ? shortenPath(dir, 3) : 'Reading your Pictures folder…'}
                  </span>
                </div>
                <Button size="sm" onClick={() => void pickFolder()}>
                  Browse
                </Button>
              </div>
              {places && (
                <div className="flex flex-wrap gap-1.5">
                  {(
                    [
                      { label: 'Pictures', value: places.pictures },
                      { label: 'Desktop', value: places.desktop },
                      { label: 'Downloads', value: places.downloads },
                    ] as const
                  ).map((place) => (
                    <button
                      key={place.label}
                      type="button"
                      onClick={() => setDir(place.value)}
                      className={
                        dir === place.value
                          ? 'rounded-lg border border-ink bg-ink px-2.5 py-1 text-[12px] font-medium text-panel'
                          : 'rounded-lg border border-line bg-panel px-2.5 py-1 text-[12px] font-medium text-ink-soft hover:border-line-strong hover:text-ink'
                      }
                    >
                      {place.label}
                    </button>
                  ))}
                </div>
              )}
              <p className="text-[11.5px] text-ink-faint">
                Every capture is written as a PNG with a unique name, so nothing is ever replaced.
              </p>
            </div>
          </Section>

          {current && followUps.length > 0 && (
            <Section title="Do something with it" description="Opens the tool with this screenshot loaded">
              <div className="grid grid-cols-1 gap-1.5">
                {followUps.map((f) => (
                  <Button
                    key={f.id}
                    size="sm"
                    icon={f.icon}
                    className="justify-start"
                    onClick={() => navigate(`/t/${f.id}`, { state: { files: [current.path] } })}
                  >
                    {f.label}
                  </Button>
                ))}
              </div>
            </Section>
          )}

          <Section title="Before your first capture">
            <div className="space-y-2 text-[12px] leading-[1.55] text-ink-soft">
              <p>
                macOS asks for <span className="font-medium text-ink">Screen Recording</span> permission the
                first time. Allow it in System Settings › Privacy &amp; Security › Screen Recording, then take
                the shot again.
              </p>
              <p className="flex items-center gap-1.5 text-[11.5px] text-ink-faint">
                <Icon name="VolumeX" size={13} />
                Captures are silent — no shutter sound.
              </p>
              <p className="text-[11.5px] text-ink-faint">
                Screen capture is a macOS feature, so this tool needs macOS to work.
              </p>
            </div>
          </Section>
        </>
      }
    />
  );
}
